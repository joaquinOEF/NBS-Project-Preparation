/**
 * generate-neighborhood-zones.ts
 * ============================================================================
 * Replaces the synthetic zone_1..zone_N intervention zones with IBGE census
 * neighborhoods (bairros) as the spatial unit for NBS intervention planning.
 *
 * WHY: The original zone system algorithmically clustered 250m grid cells into
 * ~15 contiguous regions by hazard type. While technically sound, these zones
 * have no real-world meaning — "zone_14" means nothing to a city official.
 * IBGE bairros are the administrative units Porto Alegre actually uses:
 *   - Real names (Restinga, Cidade Baixa, Centro Histórico)
 *   - Aligned with city admin boundaries and census data
 *   - Census vulnerability data (poverty, infrastructure) is per-neighborhood
 *   - CBO concept note output becomes immediately actionable
 *
 * HOW:
 *   1. Load 250m grid cells (v3 HAND-driven risk scores) — falls back to 1km
 *   2. Load IBGE neighborhood polygons (94 unique bairros, 99 features)
 *   3. Spatial join: each grid cell centroid → containing neighborhood polygon
 *   4. Aggregate per neighborhood: mean/max risk scores, cell count
 *   5. Compute vulnerability factor from census data (poverty, infrastructure)
 *   6. Compute priority score: dominant_hazard × (1 + vulnerability)
 *   7. Hazard FLAGS from official data (since 27 Nov 2026): the share of the
 *      bairro's area in SGB's susceptibility classes (flood, landslide) and in
 *      the climate plan's top heat classes — scripts/zone-official-shares.ts.
 *      Typology and intervention follow the flags; our index only orders.
 *   8. Output: porto-alegre-neighborhood-zones.json (same schema as zones.json
 *      but with neighborhood names, census data, and priority scores)
 *
 * VULNERABILITY WEIGHTING (climate justice rationale):
 *   Two neighborhoods with identical flood risk shouldn't necessarily get equal
 *   priority. A low-income neighborhood with poor sewage infrastructure is more
 *   vulnerable — less capacity to absorb and recover from climate shocks. The
 *   BPJP/C40 funding criteria explicitly reward equity-informed prioritization.
 *
 *   vulnerability_factor = (
 *     0.50 × poverty_rate +                  // Income deprivation (biggest driver)
 *     0.30 × (1 - pct_formal_sewage) +       // Infrastructure gap (flood amplifier)
 *     0.20 × pop_density_normalized           // Exposure (more people at risk)
 *   )
 *
 *   priority_score = dominant_hazard_score × (1 + vulnerability_factor)
 *
 *   This means a neighborhood with 20% poverty and poor sewage gets ~1.25×
 *   priority boost vs an equally hazard-exposed wealthy neighborhood.
 *   The intervention TYPE stays hazard-driven (flood → sponge, heat → cooling).
 *   But PRIORITY for action is equity-weighted.
 *
 * USAGE:
 *   npx tsx scripts/generate-neighborhood-zones.ts
 *
 * OUTPUT:
 *   client/public/sample-data/porto-alegre-neighborhood-zones.json
 * ============================================================================
 */

import * as fs from 'fs';
import * as path from 'path';
import * as turf from '@turf/turf';
import { officialShares, type OfficialShares } from './zone-official-shares';

// ============================================================================
// TYPES
// ============================================================================

interface GridCell {
  type: 'Feature';
  geometry: { type: 'Polygon'; coordinates: number[][][] };
  properties: {
    id: string;
    centroid: [number, number]; // [lng, lat]
    metrics: {
      flood_score: number;
      heat_score: number;
      landslide_score: number;
      pop_density_raw?: number;
      pop_density?: number;
      hand_m?: number;
      [key: string]: any;
    };
    [key: string]: any;
  };
}

interface GridData {
  cityLocode: string;
  cellSizeMeters: number;
  totalCells: number;
  geoJson: { type: 'FeatureCollection'; features: GridCell[] };
}

interface NeighborhoodFeature {
  type: 'Feature';
  geometry: { type: 'Polygon' | 'MultiPolygon'; coordinates: any };
  properties: {
    neighbourhood_number: string;
    neighbourhood_name: string;
    population_total: number;
    household_total: number;
    poor_households: number;
    poverty_rate: number;
    pct_piped_water: number;
    pct_formal_sewage: number;
    pct_no_formal_sewage: number;
    area_km2: number;
    pop_density_km2: number;
    hh_inc_q1: number;
    hh_inc_q2: number;
    hh_inc_q3: number;
    hh_inc_q4: number;
    hh_inc_q5: number;
    hh_inc_none: number;
    pct_low_income: number;
    pct_high_income: number;
  };
}

type HazardType = 'FLOOD' | 'HEAT' | 'LANDSLIDE';
type TypologyLabel =
  | 'FLOOD' | 'HEAT' | 'LANDSLIDE'
  | 'FLOOD_HEAT' | 'FLOOD_LANDSLIDE' | 'HEAT_LANDSLIDE'
  | 'LOW';
type InterventionType = 'sponge_network' | 'cooling_network' | 'slope_stabilization' | 'multi_benefit';

interface NeighborhoodZone {
  zoneId: string;                    // Slugified name (e.g. "santo_antonio")
  neighbourhoodName: string;         // Display name (e.g. "Santo Antônio")
  neighbourhoodNumber: string;       // IBGE census code
  typologyLabel: TypologyLabel;
  primaryHazard: HazardType | null;
  secondaryHazard: HazardType | null;
  interventionType: InterventionType;
  secondaryInterventions: InterventionType[]; // "also recommended" (e.g. slope_stabilization on prone terrain)
  meanFlood: number;                 // = meanFloodRisk (catalog H×E×V); kept for back-compat
  meanHeat: number;
  meanLandslide: number;
  // Flood + heat + landslide component breakdown — all three from the catalog
  // (poa_<haz>_*). See docs/risk-catalog-migration-playbook.md.
  meanFloodHazard: number;
  meanFloodExposure: number;
  meanFloodVulnerability: number;
  meanFloodRisk: number;
  meanHeatHazard: number;
  meanHeatExposure: number;
  meanHeatVulnerability: number;
  meanHeatRisk: number;
  meanLandslideHazard: number;
  meanLandslideExposure: number;
  meanLandslideVulnerability: number;
  meanLandslideRisk: number;
  // OEF-index landslide terrain figures (catalog landslide HAZARD) — kept for
  // back-compat; they no longer decide any flag.
  maxLandslideHazard: number;
  landslideSusceptiblePct: number;   // fraction of bairro cells with OEF landslide hazard ≥ T_SUSCEPT_CELL
  // ── OFFICIAL hazard flags (docs/neighborhood-zones-methodology.md) ──────────
  // The three booleans, the typology and the interventions come from these
  // shares of the bairro's area, never from our index.
  landslideSusceptible: boolean;     // sgbLandslideShare ≥ CUT_LANDSLIDE (SGB Média + Alta)
  floodSusceptible: boolean;         // sgbFloodAltaShare ≥ CUT_FLOOD (SGB Alta) OR guaiba2024Share ≥ CUT_FLOOD
  floodFlagBasis: 'sgb' | 'guaiba2024' | 'sgb+guaiba2024' | null; // which criterion set the flood flag
  guaiba2024Share: number;           // 0–1 of the area the Guaíba reached in May 2024 (SMAMUS contours ≤ 5,35 m)
  heatHigh: boolean;                 // heatHighShare ≥ CUT_HEAT (PLAC/ARVC 2050, two top classes)
  sgbFloodAltaShare: number;         // 0–1 of the bairro's area
  sgbLandslideShare: number;
  sgbLandslideAltaShare: number;     // Alta alone, informational
  heatHighShare: number;
  hazardSource: string;              // one line saying where the flags and shares come from
  floodExtentPct: number;            // fraction of bairro cells with catalog flood_risk > 0 (absolute anchor)
  maxFlood: number;
  maxHeat: number;
  maxLandslide: number;
  populationTotal: number;
  povertyRate: number;
  pctFormalSewage: number;
  pctLowIncome: number;
  areaKm2: number;
  popDensityKm2: number;
  cellCount: number;
  vulnerabilityFactor: number;       // 0-1 composite vulnerability score
  // Per-hazard percentile rank across all zones (0-1). Scale-free comparison so the
  // catalog-scale flood competes fairly with old-scale heat/landslide. See playbook §5.
  floodRank: number;
  heatRank: number;
  landslideRank: number;             // ranks now drive BOTH the bands and the classification
  p90Flood: number;                  // 90th-percentile cell risk within the bairro
  p90Heat: number;
  p90Landslide: number;
  flood2024Pct: number;              // fraction of the bairro inside the observed May 2024 extent
  sgbLandslidePeople: number;        // residents in SGB-surveyed landslide-type sectors
  sgbFloodPeople: number;            // residents in SGB-surveyed flood-type sectors
  priorityScore: number;             // = percentile rank (0–1) of the bairro's strongest hazard
  geometry: any;
}

// ============================================================================
// CONSTANTS
// ============================================================================

// T_ACTIVE_RANK — on OUR percentile-ranked index. Until 27 Nov 2026 a hazard was
// "active" (counted toward the typology) when the bairro's rank for it was at or
// above this. The typology now comes from the official flags (CUT_* below); the
// constant survives only as the FLOOR the index gives a hazard where SGB surveyed
// a risk sector, so priorityScore and the ranks are unchanged by that switch.
const T_ACTIVE_RANK = 0.40;

// OEF-index landslide terrain: a cell counts as prone when its catalog landslide
// HAZARD is ≥ this. Feeds the informational landslideSusceptiblePct only.
const T_SUSCEPT_CELL = 0.30;       // cell on prone terrain (for the informational extent %)
// T_SUSCEPT_ZONE_MAX (peak OEF landslide hazard ≥ 0.20) used to set the
// landslide flag. Once the grid came from the ARVC rasters the floodplain's
// peak was ~0.40, so it flagged 94 of 94 bairros — Arquipélago and Navegantes
// included — and every bairro was offered slope stabilisation. Removed.

// ── OFFICIAL FLAG CUTS — share of the bairro's area ──────────────────────────
// Since 24 Nov 2026 a hazard shown to a user is official data: flood and
// landslide = SGB susceptibility, heat = the climate plan (PLAC/ARVC ameaça
// 2050). A bairro carries a hazard flag when at least this share of its area is
// in the official high class(es). Chosen from the distribution over the 94
// bairros (npx tsx scripts/zone-official-shares.ts), not by feel:
//
//   flood      ≥ 30% in SGB inundação Alta           → 34 bairros
//     SGB rates 47% of the municipality Alta (the islands and the southern
//     plain are large). Every bairro the Guaíba took in May 2024 that SGB maps
//     is far above the cut (Navegantes 83%, Humaitá 87%, Sarandi 89%, Farrapos
//     64%, Arquipélago 99%). Nearest values: 32% above, 29.5% below.
//   landslide  ≥ 10% in SGB movimento de massa Média + Alta → 33 bairros
//     SGB rates 15% of the municipality Média or Alta. The cut keeps every
//     bairro where SGB surveyed a mass-movement risk sector with 400+ residents
//     (Glória 66%, Coronel Aparício Borges 67%, Cascata 80%, Morro Santana 45%,
//     Lomba do Pinheiro 15%, Serraria 11%) and none on the floodplain (0%).
//     Nearest values: 10.7% above, 9.2% below.
//   heat       ≥ 50% in the two top classes of the 2050 heat hazard → 61 bairros
//     "Most of the bairro is hot", with the same class definition the site card
//     and the tour use. Nearest values: 54% above, 49% below.
// The flood flag has a second way in (since 27 Nov 2026): at least CUT_FLOOD of
// the bairro inside the area the Guaíba reached in May 2024 — SMAMUS's contours
// at or below 5,35 m, the same official fact the pin reading uses where SGB
// draws nothing (hazardAtPin, docs/sgb-suscetibilidade.md). SGB's chart is
// 1:70.000 and leaves out ground that was under water: Praia de Belas has 0% in
// SGB Alta. Same cut for both, so there is one number to say.
const CUT_FLOOD = 0.30;
const CUT_LANDSLIDE = 0.10;
const CUT_HEAT = 0.50;

const HAZARD_SOURCE = {
  flood: 'SGB/CPRM — carta de suscetibilidade a inundação (2015), classe Alta; or SMAMUS — cotas de inundação do Guaíba, area reached in May 2024 (≤ 5,35 m)',
  landslide: 'SGB/CPRM — carta de suscetibilidade a movimentos de massa (2015), classes Média + Alta',
  heat: 'Prefeitura de Porto Alegre — Plano de Ação Climática (PLAC/ARVC), ameaça de calor 2050, two top classes',
  priority: 'OEF estimate — priorityScore and the *Rank / mean* / p90* / max* fields are our own index, not official',
} as const;
// Carried on every zone, so a feature read on its own still says whose flags these are.
const HAZARD_SOURCE_NOTE = 'Flags and shares: SGB susceptibility (flood = Alta, or the area the Guaíba reached in May 2024 per SMAMUS — see floodFlagBasis; landslide = Média + Alta) and PLAC/ARVC heat hazard 2050 (two top classes), as share of the neighbourhood\'s area. priorityScore and ranks: OEF estimate.';

// Vulnerability weights — informed by BPJP/C40 climate justice criteria
// Poverty gets highest weight because income deprivation is the strongest
// predictor of climate vulnerability (ability to recover from shocks)
const VULN_W_POVERTY = 0.50;
const VULN_W_INFRASTRUCTURE = 0.30;
const VULN_W_EXPOSURE = 0.20;

// ============================================================================
// HELPERS
// ============================================================================

const round3 = (n: number) => Math.round(n * 1000) / 1000;
const clamp01 = (n: number) => Math.max(0, Math.min(1, n));

/** Slugify a neighborhood name for use as zoneId */
function slugify(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // strip diacritics
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '');
}

/** Determine intervention type from hazard typology */
/**
 * Intervention follows the PRIMARY hazard, not the typology label.
 *
 * The old version keyed on the typology string, which meant FLOOD_HEAT always
 * returned sponge_network even when HEAT was the dominant hazard — a bairro whose
 * top risk was heat got told to build a sponge network. That was invisible while
 * combos were rare (8 of 94), but the ranked classification produces many more of
 * them, which is what surfaced it.
 *
 * The secondary hazard is not dropped: it becomes an "also recommended"
 * intervention alongside the slope-stabilization co-benefit flag.
 */
function interventionForHazard(h: HazardType | null): InterventionType {
  if (h === 'FLOOD') return 'sponge_network';
  if (h === 'HEAT') return 'cooling_network';
  if (h === 'LANDSLIDE') return 'slope_stabilization';
  return 'multi_benefit';
}

/**
 * Classify a bairro from its OFFICIAL flags.
 *
 * WHICH hazards a bairro carries is decided by official data alone (the three
 * area shares against CUT_*). Our own index does one thing here: when a bairro
 * carries more than one flag, it says which comes first (the higher percentile
 * rank), because the typology label holds two hazards and the intervention
 * follows the first. Ties fall to the share furthest above its cut.
 *
 *   - 0 flags → LOW (multi_benefit) — the existing lowest typology, so every
 *     consumer already renders it.
 *   - 1 flag  → that hazard.
 *   - 2+      → a combo of the first two; a third still earns its intervention
 *     as "also recommended".
 *
 * History: this used to activate a hazard when its percentile rank on OUR index
 * was ≥ T_ACTIVE_RANK, with landslide flagged separately on peak index hazard.
 * That put a landslide flag on 94 of 94 bairros (see T_SUSCEPT_ZONE_MAX above).
 */
function classifyHazards(
  flagged: { hazard: HazardType; rank: number; overCut: number }[]
): { typology: TypologyLabel; primary: HazardType | null; secondary: HazardType | null; ordered: HazardType[] } {
  const active = [...flagged].sort((a, b) => (b.rank - a.rank) || (b.overCut - a.overCut));
  const ordered = active.map(a => a.hazard);
  if (active.length === 0) return { typology: 'LOW', primary: null, secondary: null, ordered };
  const h1 = ordered[0];
  if (active.length === 1) return { typology: h1 as TypologyLabel, primary: h1, secondary: null, ordered };
  const h2 = ordered[1];
  const combo = [h1, h2].sort().join('_') as TypologyLabel;
  return { typology: combo, primary: h1, secondary: h2, ordered };
}

// ============================================================================
// MAIN
// ============================================================================

async function main() {
  const sampleDataDir = path.join(process.cwd(), 'client/public/sample-data');

  // ── Load grid data ─────────────────────────────────────────────────────────
  // Prefer 250m grid (HAND-driven v3 scores) over 1km grid
  const grid250mPath = path.join(sampleDataDir, 'porto-alegre-grid-250m.json');
  const grid1kmPath = path.join(sampleDataDir, 'porto-alegre-grid.json');

  let gridData: GridData;
  let gridLabel: string;

  if (fs.existsSync(grid250mPath)) {
    console.log('Loading 250m grid (v3 HAND-driven scores)...');
    gridData = JSON.parse(fs.readFileSync(grid250mPath, 'utf-8'));
    gridLabel = '250m (16,576 cells)';
  } else {
    console.log('250m grid not found, falling back to 1km grid...');
    gridData = JSON.parse(fs.readFileSync(grid1kmPath, 'utf-8'));
    gridLabel = '1km (1,036 cells)';
  }

  const gridCells = gridData.geoJson.features;
  console.log(`Grid: ${gridLabel}`);

  // ── Load SGB surveyed risk sectors ─────────────────────────────────────────
  // 145 polygons walked by SGB/CPRM geologists, each typed by mechanism and with
  // the resident count recorded. This is observation, not modelling, and it is
  // used below as a FLOOR on the hazards it evidences — never as a cap. Absence
  // of a sector means "never surveyed here", not "safe" (see shared/official-risk.ts),
  // so it can only ever promote a hazard, not demote one.
  const sgbPath = path.join(process.cwd(), 'knowledge/official-risk/porto-alegre/sgb-setorizacao.json');
  const sgbRaw = fs.existsSync(sgbPath) ? JSON.parse(fs.readFileSync(sgbPath, 'utf-8')) : null;
  const sgbFeatures: any[] = sgbRaw ? (sgbRaw.features ?? sgbRaw.geoJson?.features ?? []) : [];
  const SGB_LANDSLIDE = new Set(['Deslizamento', 'Queda', 'Rolamento', 'Tombamento', 'Corrida']);
  const SGB_FLOOD = new Set(['Inundação', 'Enxurrada', 'Alagamento']);
  console.log(`SGB surveyed sectors loaded: ${sgbFeatures.length}`);

  // ── Load IBGE neighborhoods ────────────────────────────────────────────────
  const ibgePath = path.join(sampleDataDir, 'porto-alegre-ibge-indicators.json');
  const ibgeRaw = JSON.parse(fs.readFileSync(ibgePath, 'utf-8'));
  const ibgeFeatures: NeighborhoodFeature[] = ibgeRaw.features || ibgeRaw.geoJson?.features;

  // De-duplicate: 99 features → 94 unique names (some boundary splits)
  // Keep the first occurrence of each name (largest polygon if split)
  const neighborhoodMap = new Map<string, NeighborhoodFeature>();
  for (const f of ibgeFeatures) {
    const name = f.properties.neighbourhood_name;
    if (!neighborhoodMap.has(name)) {
      neighborhoodMap.set(name, f);
    }
    // If duplicate, keep the one with larger area (more representative)
    else {
      const existing = neighborhoodMap.get(name)!;
      if (f.properties.area_km2 > existing.properties.area_km2) {
        neighborhoodMap.set(name, f);
      }
    }
  }

  const neighborhoods = Array.from(neighborhoodMap.values());
  console.log(`Neighborhoods: ${neighborhoods.length} unique bairros (from ${ibgeFeatures.length} features)`);

  // ── Spatial join: assign each grid cell to a neighborhood ──────────────────
  // Point-in-polygon test using cell centroid vs neighborhood boundary
  console.log('Running spatial join (point-in-polygon)...');

  // Pre-build turf polygons for each neighborhood
  const neighborhoodPolygons = neighborhoods.map(n => ({
    feature: n,
    polygon: turf.feature(n.geometry),
  }));

  // For nearest-centroid fallback: pre-compute neighborhood centroids
  const neighborhoodCentroids = neighborhoods.map(n => ({
    name: n.properties.neighbourhood_name,
    centroid: turf.centroid(turf.feature(n.geometry)),
  }));

  // Map: neighborhood name → list of grid cells
  const cellsByNeighborhood = new Map<string, GridCell[]>();
  for (const n of neighborhoods) {
    cellsByNeighborhood.set(n.properties.neighbourhood_name, []);
  }

  let assigned = 0;
  let fallback = 0;
  let unassigned = 0;

  for (const cell of gridCells) {
    const [lng, lat] = cell.properties.centroid;
    const pt = turf.point([lng, lat]);

    // Try point-in-polygon against all neighborhoods
    let found = false;
    for (const { feature, polygon } of neighborhoodPolygons) {
      if (turf.booleanPointInPolygon(pt, polygon)) {
        cellsByNeighborhood.get(feature.properties.neighbourhood_name)!.push(cell);
        assigned++;
        found = true;
        break;
      }
    }

    // Fallback: assign to nearest neighborhood centroid
    // This handles coastal/edge cells that fall outside all polygons
    if (!found) {
      let nearestName = '';
      let nearestDist = Infinity;
      for (const { name, centroid } of neighborhoodCentroids) {
        const dist = turf.distance(pt, centroid);
        if (dist < nearestDist) {
          nearestDist = dist;
          nearestName = name;
        }
      }
      if (nearestName) {
        cellsByNeighborhood.get(nearestName)!.push(cell);
        fallback++;
      } else {
        unassigned++;
      }
    }
  }

  console.log(`Spatial join: ${assigned} assigned, ${fallback} fallback (nearest), ${unassigned} unassigned`);

  // ── Compute max pop density for normalization ──────────────────────────────
  const maxPopDensity = Math.max(...neighborhoods.map(n => n.properties.pop_density_km2 || 0));

  // ── Aggregate per neighborhood ─────────────────────────────────────────────
  console.log('Aggregating risk scores per neighborhood...');

  // ── Pass 1: aggregate per neighborhood ──────────────────────────────────────
  interface ZoneAgg {
    props: NeighborhoodFeature['properties'];
    geometry: any;
    cellCount: number;
    flood2024Pct: number;
    sgbLandslidePeople: number; sgbFloodPeople: number;
    p90Flood: number; p90Heat: number; p90Landslide: number;
    meanFlood: number; meanHeat: number; meanLandslide: number;
    meanFloodHazard: number; meanFloodExposure: number; meanFloodVulnerability: number;
    meanHeatHazard: number; meanHeatExposure: number; meanHeatVulnerability: number;
    meanLandslideHazard: number; meanLandslideExposure: number; meanLandslideVulnerability: number;
    maxLandslideHazard: number; landslideSusceptiblePct: number;
    floodExtentPct: number;
    maxFlood: number; maxHeat: number; maxLandslide: number;
    vulnerabilityFactor: number;
    official: OfficialShares;
  }
  const aggs: ZoneAgg[] = [];

  for (const n of neighborhoods) {
    const props = n.properties;
    const cells = cellsByNeighborhood.get(props.neighbourhood_name)!;

    // Skip neighborhoods with no grid cells (tiny slivers, islands)
    if (cells.length === 0) {
      console.log(`  ⚠ ${props.neighbourhood_name}: 0 cells, skipping`);
      continue;
    }

    // Aggregate risk scores from grid cells (null→0; for flood, absence = non-fluvial = 0)
    let sumFlood = 0, sumHeat = 0, sumLandslide = 0;
    let maxFlood = 0, maxHeat = 0, maxLandslide = 0;
    // Flood + heat + landslide component sums (catalog poa_<haz>_* breakdown)
    let sumFHaz = 0, sumFExp = 0, sumFVul = 0;
    let sumHHaz = 0, sumHExp = 0, sumHVul = 0;
    let sumLHaz = 0, sumLExp = 0, sumLVul = 0;
    let maxLHaz = 0;             // peak landslide HAZARD (susceptibility) in the bairro
    let landslideSusceptibleCells = 0; // cells on landslide-prone terrain (hazard ≥ T_SUSCEPT_CELL)
    let floodLitCells = 0;  // cells with catalog flood_risk > 0 (the modeled fluvial footprint)

    // Peak-ish representation of each hazard, kept alongside the means.
    //
    // A bairro is ~500 ha; the settlements SGB actually surveys are two or three
    // blocks. A MEAN over the bairro dilutes exactly the hotspot that matters —
    // this file already knows that, which is why landslideSusceptible is flagged
    // on maxLandslideHazard rather than the mean. Measured against the 145 SGB
    // surveyed sectors (84,604 people), switching the bairro statistic from mean
    // to p90 is what makes the ARVC surfaces competitive at all: reaching SGB
    // landslide people in a top-20 goes from 12% (mean) to ~80% (p90).
    //
    // p90 rather than max, because max is one pixel and would make any bairro
    // containing a single steep cell look uniformly dangerous.
    const fScores: number[] = [], hScores: number[] = [], lScores: number[] = [];
    let obs2024Cells = 0;   // cells touched by the observed May 2024 inundation

    for (const cell of cells) {
      const m = cell.properties.metrics;
      const f = m.flood_score ?? 0;
      const h = m.heat_score ?? 0;
      const l = m.landslide_score ?? 0;
      fScores.push(f); hScores.push(h); lScores.push(l);
      if ((m.flood_observed_2024 ?? 0) > 0.5) obs2024Cells++;
      sumFlood += f; sumHeat += h; sumLandslide += l;
      maxFlood = Math.max(maxFlood, f);
      maxHeat = Math.max(maxHeat, h);
      maxLandslide = Math.max(maxLandslide, l);
      sumFHaz += m.flood_hazard ?? 0;
      sumFExp += m.flood_exposure ?? 0;
      sumFVul += m.flood_vulnerability ?? 0;
      sumHHaz += m.heat_hazard ?? 0;
      sumHExp += m.heat_exposure ?? 0;
      sumHVul += m.heat_vulnerability ?? 0;
      const lh = m.landslide_hazard ?? 0;
      sumLHaz += lh;
      maxLHaz = Math.max(maxLHaz, lh);
      if (lh >= T_SUSCEPT_CELL) landslideSusceptibleCells++;
      sumLExp += m.landslide_exposure ?? 0;
      sumLVul += m.landslide_vulnerability ?? 0;
      if ((m.flood_risk ?? 0) > 0) floodLitCells++;
    }

    // ── Vulnerability factor (app-side, climate-justice weighted) ──────────────
    // All three hazards are now catalog-backed (E & V already inside the H×E×V
    // risk), so this is NO LONGER multiplied into priority — kept only as a
    // standalone climate-justice signal surfaced on the zone.
    const vulnerabilityFactor = round3(clamp01(
      VULN_W_POVERTY * (props.poverty_rate ?? 0) +
      VULN_W_INFRASTRUCTURE * (1 - (props.pct_formal_sewage ?? 1)) +
      VULN_W_EXPOSURE * clamp01((props.pop_density_km2 ?? 0) / maxPopDensity)
    ));

    // SGB sectors whose representative point falls in this bairro.
    let sgbLandslidePeople = 0, sgbFloodPeople = 0;
    for (const sf of sgbFeatures) {
      try {
        const pt = turf.pointOnFeature(sf as any);
        if (!turf.booleanPointInPolygon(pt, n as any)) continue;
        const sp = sf.properties ?? {};
        const people = Number(sp.num_pess) || 0;
        const tips: string[] = [];
        for (let i = 1; i <= 5; i++) {
          if (sp[`tipolo_g${i}`]) tips.push(sp[`tipolo_g${i}`]);
          if (sp[`tipolo_e${i}`]) tips.push(sp[`tipolo_e${i}`]);
        }
        if (tips.some(t => SGB_LANDSLIDE.has(t))) sgbLandslidePeople += people;
        if (tips.some(t => SGB_FLOOD.has(t))) sgbFloodPeople += people;
      } catch { /* malformed geometry — skip */ }
    }

    const p90 = (xs: number[]) => {
      if (xs.length === 0) return 0;
      const s = [...xs].sort((a, b) => a - b);
      return round3(s[Math.min(s.length - 1, Math.floor(0.9 * (s.length - 1)))]);
    };

    aggs.push({
      props, geometry: n.geometry, cellCount: cells.length,
      flood2024Pct: round3(obs2024Cells / cells.length),
      sgbLandslidePeople, sgbFloodPeople,
      p90Flood: p90(fScores),
      p90Heat: p90(hScores),
      p90Landslide: p90(lScores),
      meanFlood: round3(sumFlood / cells.length),  // = meanFloodRisk
      meanHeat: round3(sumHeat / cells.length),
      meanLandslide: round3(sumLandslide / cells.length),
      meanFloodHazard: round3(sumFHaz / cells.length),
      meanFloodExposure: round3(sumFExp / cells.length),
      meanFloodVulnerability: round3(sumFVul / cells.length),
      meanHeatHazard: round3(sumHHaz / cells.length),
      meanHeatExposure: round3(sumHExp / cells.length),
      meanHeatVulnerability: round3(sumHVul / cells.length),
      meanLandslideHazard: round3(sumLHaz / cells.length),
      meanLandslideExposure: round3(sumLExp / cells.length),
      meanLandslideVulnerability: round3(sumLVul / cells.length),
      maxLandslideHazard: round3(maxLHaz),
      landslideSusceptiblePct: round3(landslideSusceptibleCells / cells.length),
      floodExtentPct: round3(floodLitCells / cells.length),
      maxFlood, maxHeat, maxLandslide,
      vulnerabilityFactor,
      official: officialShares(n.geometry),
    });
  }

  // ── Percentile-rank each hazard across zones — for the DISPLAY ONLY ───────────
  // The ranks feed the tooltip "relative-to-PoA percentile bands" (risk-display.ts
  // §5b). They are NO LONGER used to pick the dominant hazard / priority — that now
  // uses absolute catalog risk (all three share the same 0–1 H×E×V scale), because
  // ranking a spatially-concentrated hazard (landslide: max 0.077, mostly 0) inflated
  // it and falsely outranked genuinely-high heat. See classifyHazards above.
  const pctRanker = (vals: number[]) => {
    const sorted = [...vals].sort((a, b) => a - b);
    return (v: number) => {
      // fraction of zones strictly less than v → zeros map to 0, the top maps to ~1
      let lo = 0, hi = sorted.length;
      while (lo < hi) { const mid = (lo + hi) >> 1; if (sorted[mid] < v) lo = mid + 1; else hi = mid; }
      return sorted.length > 1 ? round3(lo / (sorted.length - 1)) : 0;
    };
  };
  // Ranked on the p90 (peak-ish) risk, not the mean: the mean answers "how bad is
  // this bairro on average", the p90 answers "does this bairro contain somewhere
  // genuinely dangerous" — which is the question both surfaces are really asking.
  // FLOOD RANKS ON THE UNION OF TWO FLOOD SIGNALS, NOT ONE.
  //
  // ARVC models "inundação fluvial" — the arroios. The May 2024 catastrophe was
  // the Guaíba rising, a different mechanism entirely, and 41% of the observed
  // extent falls outside ARVC's flood footprint. Ranking on ARVC flood alone put
  // Navegantes (100% flooded in 2024), Anchieta (96%), Humaitá (89%), Praia de
  // Belas (74%) and Arquipélago (70%, and the largest SGB at-risk population in
  // the city at 18,520 people) all in the LOW class with priority 0 — the exact
  // bairros the city lost in 2024, ranked last.
  //
  // So a bairro's flood standing is the HIGHER of its modelled fluvial rank and
  // its observed-2024 rank. A place is flood-relevant if EITHER the model says so
  // or it demonstrably went under.
  const rankFloodModelled = pctRanker(aggs.map(a => a.p90Flood));
  const rankFloodObserved = pctRanker(aggs.map(a => a.flood2024Pct));
  const rankFlood = (a: ZoneAgg) =>
    Math.max(rankFloodModelled(a.p90Flood), rankFloodObserved(a.flood2024Pct));
  const rankHeat = pctRanker(aggs.map(a => a.p90Heat));
  const rankLandslide = pctRanker(aggs.map(a => a.p90Landslide));

  // ── Pass 2: classify + prioritize on ABSOLUTE risk ───────────────────────────
  const zones: NeighborhoodZone[] = [];
  for (const a of aggs) {
    const props = a.props;
    // Ranks are OUR index: they order the list (priorityScore) and feed the
    // tooltip percentile bands. They no longer decide which hazards a bairro
    // carries — the official shares do (below).
    // Raw ranks from the surfaces…
    const floodRankRaw = rankFlood(a);
    const heatRank = rankHeat(a.p90Heat);
    const landslideRankRaw = rankLandslide(a.p90Landslide);

    // …then floored by what SGB actually found on the ground. A bairro where
    // geologists surveyed landslide-type sectors cannot be told it has no
    // landslide concern, however the 250 m surfaces average out. Floored AT the
    // activation threshold, not above it, so this makes the hazard count without
    // letting it outrank a genuinely higher one.
    const floodRank = a.sgbFloodPeople > 0 ? Math.max(floodRankRaw, T_ACTIVE_RANK) : floodRankRaw;
    const landslideRank = a.sgbLandslidePeople > 0
      ? Math.max(landslideRankRaw, T_ACTIVE_RANK) : landslideRankRaw;

    // Official flags: share of the bairro's area in the official high class(es).
    const o = a.official;
    const bySgb = o.sgbFloodAltaShare >= CUT_FLOOD;
    const by2024 = o.guaiba2024Share >= CUT_FLOOD;
    const floodSusceptible = bySgb || by2024;
    const floodFlagBasis = bySgb && by2024 ? 'sgb+guaiba2024' as const : bySgb ? 'sgb' as const : by2024 ? 'guaiba2024' as const : null;
    const landslideSusceptible = o.sgbLandslideShare >= CUT_LANDSLIDE;
    const heatHigh = o.heatHighShare >= CUT_HEAT;
    const flagged: { hazard: HazardType; rank: number; overCut: number }[] = [];
    if (floodSusceptible) flagged.push({ hazard: 'FLOOD', rank: floodRank, overCut: Math.max(o.sgbFloodAltaShare, o.guaiba2024Share) / CUT_FLOOD });
    if (heatHigh) flagged.push({ hazard: 'HEAT', rank: heatRank, overCut: o.heatHighShare / CUT_HEAT });
    if (landslideSusceptible) flagged.push({ hazard: 'LANDSLIDE', rank: landslideRank, overCut: o.sgbLandslideShare / CUT_LANDSLIDE });
    const { typology, primary, secondary, ordered } = classifyHazards(flagged);

    // Priority = the rank of the strongest hazard, ALWAYS — including for LOW.
    //
    // This used to be 0 for LOW. With 29 LOW bairros that put a third of the city
    // on exactly the same value, which broke three things downstream at once: the
    // RISK_BANDS quintiles collapsed (the 'low' band went empty while 'very_high'
    // took a third of the city), the min/max opacity ramp rendered all of them at
    // 0.05 — effectively invisible and hard to tap — and the tail of every
    // priority-sorted list became arbitrary input order.
    //
    // A LOW bairro is still LOW: the typology, the intervention and the copy all
    // come from `typology`/`primary`, which are unchanged. This only means its
    // position at the bottom of the list is ordered rather than tied.
    const priorityScore = Math.max(floodRank, heatRank, landslideRank);

    // The intervention follows the first flagged hazard; every other flagged
    // hazard earns its own as "also recommended" (so a bairro with all three
    // flags loses none). Nothing is recommended for a hazard without a flag.
    const primaryIntervention = interventionForHazard(primary);
    const secondaryInterventions: InterventionType[] = ordered.slice(1).map(interventionForHazard);

    zones.push({
      zoneId: slugify(props.neighbourhood_name),
      neighbourhoodName: props.neighbourhood_name,
      neighbourhoodNumber: props.neighbourhood_number,
      typologyLabel: typology,
      primaryHazard: primary,
      secondaryHazard: secondary,
      interventionType: primaryIntervention,
      secondaryInterventions,
      p90Flood: a.p90Flood,
      p90Heat: a.p90Heat,
      p90Landslide: a.p90Landslide,
      flood2024Pct: a.flood2024Pct,
      sgbLandslidePeople: a.sgbLandslidePeople,
      sgbFloodPeople: a.sgbFloodPeople,
      meanFlood: a.meanFlood,
      meanHeat: a.meanHeat,
      meanLandslide: a.meanLandslide,
      meanFloodHazard: a.meanFloodHazard,
      meanFloodExposure: a.meanFloodExposure,
      meanFloodVulnerability: a.meanFloodVulnerability,
      meanFloodRisk: a.meanFlood,
      meanHeatHazard: a.meanHeatHazard,
      meanHeatExposure: a.meanHeatExposure,
      meanHeatVulnerability: a.meanHeatVulnerability,
      meanHeatRisk: a.meanHeat,
      meanLandslideHazard: a.meanLandslideHazard,
      meanLandslideExposure: a.meanLandslideExposure,
      meanLandslideVulnerability: a.meanLandslideVulnerability,
      meanLandslideRisk: a.meanLandslide,
      maxLandslideHazard: a.maxLandslideHazard,
      landslideSusceptiblePct: a.landslideSusceptiblePct,
      landslideSusceptible,
      floodSusceptible,
      floodFlagBasis,
      heatHigh,
      sgbFloodAltaShare: o.sgbFloodAltaShare,
      guaiba2024Share: o.guaiba2024Share,
      sgbLandslideShare: o.sgbLandslideShare,
      sgbLandslideAltaShare: o.sgbLandslideAltaShare,
      heatHighShare: o.heatHighShare,
      hazardSource: HAZARD_SOURCE_NOTE,
      floodExtentPct: a.floodExtentPct,
      maxFlood: round3(a.maxFlood),
      maxHeat: round3(a.maxHeat),
      maxLandslide: round3(a.maxLandslide),
      populationTotal: props.population_total,
      povertyRate: round3(props.poverty_rate ?? 0),
      pctFormalSewage: round3(props.pct_formal_sewage ?? 0),
      pctLowIncome: round3(props.pct_low_income ?? 0),
      areaKm2: round3(props.area_km2),
      popDensityKm2: round3(props.pop_density_km2 ?? 0),
      cellCount: a.cellCount,
      vulnerabilityFactor: a.vulnerabilityFactor,
      floodRank,
      heatRank,
      landslideRank,
      priorityScore,
      geometry: a.geometry,
    });
  }

  // Sort by priority score descending (most critical neighborhoods first)
  zones.sort((a, b) => b.priorityScore - a.priorityScore);

  // ── Official flags ───────────────────────────────────────────────────────────
  const flagCounts = {
    flood: zones.filter(z => z.floodSusceptible).length,
    floodByGuaiba2024Only: zones.filter(z => z.floodFlagBasis === 'guaiba2024').length,
    heat: zones.filter(z => z.heatHigh).length,
    landslide: zones.filter(z => z.landslideSusceptible).length,
    none: zones.filter(z => !z.floodSusceptible && !z.heatHigh && !z.landslideSusceptible).length,
  };
  console.log('\n✓ Official hazard flags (share of the bairro\'s area):');
  console.log(`  flood     (SGB Alta or Guaíba 2024 ≥ ${CUT_FLOOD * 100}%): ${flagCounts.flood}/${zones.length} (${flagCounts.floodByGuaiba2024Only} by the 2024 mark alone)`);
  console.log(`  landslide (SGB Média+Alta ≥ ${CUT_LANDSLIDE * 100}%):   ${flagCounts.landslide}/${zones.length}`);
  console.log(`  heat      (PLAC top classes ≥ ${CUT_HEAT * 100}%):  ${flagCounts.heat}/${zones.length}`);
  console.log(`  no flag (LOW):                       ${flagCounts.none}/${zones.length}`);

  // ── Summary statistics ─────────────────────────────────────────────────────
  const interventionCounts = { sponge_network: 0, cooling_network: 0, slope_stabilization: 0, multi_benefit: 0 };
  for (const z of zones) interventionCounts[z.interventionType]++;

  console.log(`\nGenerated ${zones.length} neighborhood zones:\n`);
  console.log('Intervention summary:');
  console.log(`  Sponge Network (Flood):         ${interventionCounts.sponge_network}`);
  console.log(`  Cooling Network (Heat):          ${interventionCounts.cooling_network}`);
  console.log(`  Slope Stabilization (Landslide): ${interventionCounts.slope_stabilization}`);
  console.log(`  Multi-Benefit (Low risk):        ${interventionCounts.multi_benefit}`);

  console.log('\nTop 10 priority neighborhoods:');
  for (const z of zones.slice(0, 10)) {
    console.log(`  ${z.neighbourhoodName.padEnd(25)} ${z.primaryHazard?.padEnd(10) ?? 'LOW       '} priority=${z.priorityScore.toFixed(3)} vuln=${z.vulnerabilityFactor.toFixed(3)} poverty=${(z.povertyRate * 100).toFixed(1)}% ${z.interventionType}`);
  }

  console.log('\nBottom 5 (lowest priority):');
  for (const z of zones.slice(-5)) {
    console.log(`  ${z.neighbourhoodName.padEnd(25)} ${z.primaryHazard?.padEnd(10) ?? 'LOW       '} priority=${z.priorityScore.toFixed(3)} vuln=${z.vulnerabilityFactor.toFixed(3)} poverty=${(z.povertyRate * 100).toFixed(1)}%`);
  }

  // ── Write output ───────────────────────────────────────────────────────────
  const output = {
    cityLocode: gridData.cityLocode || 'BR POA',
    generatedAt: new Date().toISOString(),
    gridSource: gridLabel,
    methodology: {
      description: 'Neighborhood-based intervention zones using IBGE bairros with vulnerability-weighted priority',
      spatialJoin: 'Point-in-polygon (grid cell centroid → neighborhood boundary), nearest-centroid fallback for edge cells',
      hazardClassification: {
        T_ACTIVE_RANK,
        T_SUSCEPT_CELL,
        description: 'Which hazards a bairro carries (the flags, the typology, the interventions) comes from OFFICIAL data: the share of its area in the official high class(es), against officialFlags.cuts. Our index (percentile-ranked p90 risk) only orders: priorityScore, and which flagged hazard is named first. T_ACTIVE_RANK is the floor the index gives a hazard where SGB surveyed a risk sector.',
      },
      officialFlags: {
        cuts: { flood: CUT_FLOOD, landslide: CUT_LANDSLIDE, heat: CUT_HEAT },
        rule: 'A flag is set when at least the cut share of the bairro\'s area is in the class(es): floodSusceptible = sgbFloodAltaShare ≥ 0.30 (SGB inundação, Alta) OR guaiba2024Share ≥ 0.30 (SMAMUS, area the Guaíba reached in May 2024, contours ≤ 5,35 m) — floodFlagBasis says which; landslideSusceptible = sgbLandslideShare ≥ 0.10 (SGB movimento de massa, Média + Alta); heatHigh = heatHighShare ≥ 0.50 (PLAC/ARVC calor 2050, two top classes).',
        method: 'Regular lattice of points ~25 m apart inside the bairro polygon (scripts/zone-official-shares.ts); denominator = the whole bairro.',
        sources: HAZARD_SOURCE,
        counts: flagCounts,
      },
      vulnerabilityWeights: {
        poverty: VULN_W_POVERTY,
        infrastructure: VULN_W_INFRASTRUCTURE,
        exposure: VULN_W_EXPOSURE,
        formula: 'vulnerability = 0.50 × poverty_rate + 0.30 × (1 - pct_formal_sewage) + 0.20 × pop_density_norm',
        priorityFormula: 'priority (OEF estimate) = the highest of the three percentile ranks of p90 risk',
        rationale: 'Climate justice: high-poverty neighborhoods with poor infrastructure are more vulnerable and less able to recover from climate shocks. BPJP/C40 funding criteria explicitly reward equity-informed prioritization.',
      },
      // Intervention follows the PRIMARY hazard, not the typology label — so a
      // FLOOD_HEAT bairro whose first hazard is heat gets a cooling network,
      // not a sponge.
      interventionMapping: {
        byPrimaryHazard: {
          FLOOD: 'sponge_network',
          HEAT: 'cooling_network',
          LANDSLIDE: 'slope_stabilization',
          null: 'multi_benefit',
        },
        secondary: 'the intervention of every other officially flagged hazard',
      },
    },
    statistics: {
      totalNeighborhoods: zones.length,
      totalGridCells: gridCells.length,
      assignedCells: assigned,
      fallbackCells: fallback,
      unassignedCells: unassigned,
      interventionCounts,
      avgPriorityScore: round3(zones.reduce((s, z) => s + z.priorityScore, 0) / zones.length),
      avgVulnerability: round3(zones.reduce((s, z) => s + z.vulnerabilityFactor, 0) / zones.length),
    },
    geoJson: {
      type: 'FeatureCollection' as const,
      // Spread the full zone object into properties (minus geometry) so the map features
      // always carry every field — including ranks + the catalog flood breakdown. Previously
      // this hand-picked a subset and silently dropped floodRank/meanFloodRisk/etc., so the
      // map showed "Very Low (0)" everywhere while zones[] had the real values.
      features: zones.map(({ geometry, ...props }) => ({
        type: 'Feature' as const,
        geometry,
        properties: props,
      })),
    },
    zones: zones.map(({ geometry, ...rest }) => rest), // zones array without geometry (for easy consumption)
  };

  const outputPath = path.join(sampleDataDir, 'porto-alegre-neighborhood-zones.json');
  fs.writeFileSync(outputPath, JSON.stringify(output, null, 2));
  console.log(`\nOutput saved to ${outputPath}`);
  console.log(`File size: ${(fs.statSync(outputPath).size / 1024).toFixed(0)} KB`);
}

main().catch(console.error);

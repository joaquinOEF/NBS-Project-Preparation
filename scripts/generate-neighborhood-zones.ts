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
 *   7. Assign intervention type from dominant hazard
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
  meanFlood: number;
  meanHeat: number;
  meanLandslide: number;
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
  priorityScore: number;             // hazard × (1 + vulnerability)
  geometry: any;
}

// ============================================================================
// CONSTANTS
// ============================================================================

// Hazard thresholds (same as generate-intervention-zones.ts for consistency)
const T_ACTIVE = 0.30;  // Below this, hazard is "inactive"
const T_COMBO = 0.10;   // If top two hazards are within this gap, it's a combo zone

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
function getInterventionType(typology: TypologyLabel): InterventionType {
  if (typology === 'LOW') return 'multi_benefit';
  if (typology === 'FLOOD' || typology === 'FLOOD_HEAT' || typology === 'FLOOD_LANDSLIDE') return 'sponge_network';
  if (typology === 'HEAT') return 'cooling_network';
  if (typology === 'LANDSLIDE' || typology === 'HEAT_LANDSLIDE') return 'slope_stabilization';
  return 'multi_benefit';
}

/** Classify hazard profile into typology label + primary/secondary hazards */
function classifyHazards(
  meanFlood: number, meanHeat: number, meanLandslide: number
): { typology: TypologyLabel; primary: HazardType | null; secondary: HazardType | null } {
  const scores: [HazardType, number][] = [
    ['FLOOD', meanFlood],
    ['HEAT', meanHeat],
    ['LANDSLIDE', meanLandslide],
  ];
  scores.sort((a, b) => b[1] - a[1]);

  const [h1, v1] = scores[0];
  const [h2, v2] = scores[1];
  const gap = v1 - v2;

  if (v1 < T_ACTIVE) {
    return { typology: 'LOW', primary: null, secondary: null };
  }

  if (gap <= T_COMBO && v2 >= T_ACTIVE) {
    // Multi-hazard: both are active and close in magnitude
    const combo = [h1, h2].sort().join('_') as TypologyLabel;
    return { typology: combo, primary: h1, secondary: h2 };
  }

  // Single dominant hazard
  return {
    typology: h1 as TypologyLabel,
    primary: h1,
    secondary: v2 >= T_ACTIVE * 0.7 ? h2 : null,
  };
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

  const zones: NeighborhoodZone[] = [];

  for (const n of neighborhoods) {
    const props = n.properties;
    const cells = cellsByNeighborhood.get(props.neighbourhood_name)!;

    // Skip neighborhoods with no grid cells (tiny slivers, islands)
    if (cells.length === 0) {
      console.log(`  ⚠ ${props.neighbourhood_name}: 0 cells, skipping`);
      continue;
    }

    // Aggregate risk scores from grid cells
    let sumFlood = 0, sumHeat = 0, sumLandslide = 0;
    let maxFlood = 0, maxHeat = 0, maxLandslide = 0;

    for (const cell of cells) {
      const m = cell.properties.metrics;
      const f = m.flood_score ?? 0;
      const h = m.heat_score ?? 0;
      const l = m.landslide_score ?? 0;
      sumFlood += f; sumHeat += h; sumLandslide += l;
      maxFlood = Math.max(maxFlood, f);
      maxHeat = Math.max(maxHeat, h);
      maxLandslide = Math.max(maxLandslide, l);
    }

    const meanFlood = round3(sumFlood / cells.length);
    const meanHeat = round3(sumHeat / cells.length);
    const meanLandslide = round3(sumLandslide / cells.length);

    // Classify hazard profile
    const { typology, primary, secondary } = classifyHazards(meanFlood, meanHeat, meanLandslide);

    // Determine dominant hazard score (for priority calculation)
    const dominantScore = primary === 'FLOOD' ? meanFlood
      : primary === 'HEAT' ? meanHeat
      : primary === 'LANDSLIDE' ? meanLandslide
      : Math.max(meanFlood, meanHeat, meanLandslide);

    // ── Vulnerability factor ───────────────────────────────────────────────
    // See header comment for rationale on weights
    const vulnerabilityFactor = round3(clamp01(
      VULN_W_POVERTY * (props.poverty_rate ?? 0) +
      VULN_W_INFRASTRUCTURE * (1 - (props.pct_formal_sewage ?? 1)) +
      VULN_W_EXPOSURE * clamp01((props.pop_density_km2 ?? 0) / maxPopDensity)
    ));

    // Priority = hazard exposure × (1 + vulnerability)
    // This boosts high-poverty neighborhoods in priority ranking
    // while keeping the intervention TYPE purely hazard-driven
    const priorityScore = round3(dominantScore * (1 + vulnerabilityFactor));

    zones.push({
      zoneId: slugify(props.neighbourhood_name),
      neighbourhoodName: props.neighbourhood_name,
      neighbourhoodNumber: props.neighbourhood_number,
      typologyLabel: typology,
      primaryHazard: primary,
      secondaryHazard: secondary,
      interventionType: getInterventionType(typology),
      meanFlood,
      meanHeat,
      meanLandslide,
      maxFlood: round3(maxFlood),
      maxHeat: round3(maxHeat),
      maxLandslide: round3(maxLandslide),
      populationTotal: props.population_total,
      povertyRate: round3(props.poverty_rate ?? 0),
      pctFormalSewage: round3(props.pct_formal_sewage ?? 0),
      pctLowIncome: round3(props.pct_low_income ?? 0),
      areaKm2: round3(props.area_km2),
      popDensityKm2: round3(props.pop_density_km2 ?? 0),
      cellCount: cells.length,
      vulnerabilityFactor,
      priorityScore,
      geometry: n.geometry,
    });
  }

  // Sort by priority score descending (most critical neighborhoods first)
  zones.sort((a, b) => b.priorityScore - a.priorityScore);

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
        T_ACTIVE,
        T_COMBO,
        description: 'Same thresholds as synthetic zones for consistency',
      },
      vulnerabilityWeights: {
        poverty: VULN_W_POVERTY,
        infrastructure: VULN_W_INFRASTRUCTURE,
        exposure: VULN_W_EXPOSURE,
        formula: 'vulnerability = 0.50 × poverty_rate + 0.30 × (1 - pct_formal_sewage) + 0.20 × pop_density_norm',
        priorityFormula: 'priority = dominant_hazard_score × (1 + vulnerability_factor)',
        rationale: 'Climate justice: high-poverty neighborhoods with poor infrastructure are more vulnerable and less able to recover from climate shocks. BPJP/C40 funding criteria explicitly reward equity-informed prioritization.',
      },
      interventionMapping: {
        FLOOD: 'sponge_network',
        FLOOD_HEAT: 'sponge_network',
        FLOOD_LANDSLIDE: 'sponge_network',
        HEAT: 'cooling_network',
        LANDSLIDE: 'slope_stabilization',
        HEAT_LANDSLIDE: 'slope_stabilization',
        LOW: 'multi_benefit',
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
      features: zones.map(z => ({
        type: 'Feature' as const,
        geometry: z.geometry,
        properties: {
          zoneId: z.zoneId,
          neighbourhoodName: z.neighbourhoodName,
          neighbourhoodNumber: z.neighbourhoodNumber,
          typologyLabel: z.typologyLabel,
          primaryHazard: z.primaryHazard,
          secondaryHazard: z.secondaryHazard,
          interventionType: z.interventionType,
          meanFlood: z.meanFlood,
          meanHeat: z.meanHeat,
          meanLandslide: z.meanLandslide,
          maxFlood: z.maxFlood,
          maxHeat: z.maxHeat,
          maxLandslide: z.maxLandslide,
          populationTotal: z.populationTotal,
          povertyRate: z.povertyRate,
          pctFormalSewage: z.pctFormalSewage,
          pctLowIncome: z.pctLowIncome,
          areaKm2: z.areaKm2,
          popDensityKm2: z.popDensityKm2,
          cellCount: z.cellCount,
          vulnerabilityFactor: z.vulnerabilityFactor,
          priorityScore: z.priorityScore,
        },
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

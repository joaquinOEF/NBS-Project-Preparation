/**
 * Enhanced Risk Score Calculator v2
 *
 * Uses OEF's pre-computed raster indices (FRI, HWM) as foundation,
 * enhanced with high-resolution local factors (terrain, land use, infrastructure).
 *
 * Philosophy:
 * - FRI and HWM are computed by climate scientists with proper methodology
 * - We don't replace them — we USE them as primary inputs
 * - Local factors (river proximity, building density, vegetation) add urban-scale detail
 * - Final score = raster foundation + local modifiers
 *
 * Usage: npx tsx scripts/recalc-scores-v2.ts
 */

import * as fs from 'fs';
import { sampleValue, sampleAllLayers, SAMPLE_LAYERS, type LayerEncoding } from './tile-sampler.js';

const gridPath = 'client/public/sample-data/porto-alegre-grid.json';
const gridData = JSON.parse(fs.readFileSync(gridPath, 'utf-8'));

const CELL_SIZE_METERS = gridData.cellSizeMeters || 1000;

// Porto Alegre geography constants
const LAKE_WEST_BOUNDARY = -51.23;
const DELTA_CENTER_LAT = -30.05;
const DELTA_CENTER_LNG = -51.22;

// ── Normalization helpers ─────────────────────────────────────────────────────
function clamp01(v: number): number { return Math.max(0, Math.min(1, v)); }
function round2(v: number): number { return Math.round(v * 100) / 100; }

// ── Stats tracking ────────────────────────────────────────────────────────────
interface Stats {
  count: number;
  sum: number;
  min: number;
  max: number;
  values: number[];
}

function newStats(): Stats { return { count: 0, sum: 0, min: Infinity, max: -Infinity, values: [] }; }
function addStat(s: Stats, v: number) { s.count++; s.sum += v; s.min = Math.min(s.min, v); s.max = Math.max(s.max, v); s.values.push(v); }
function avgStat(s: Stats): number { return s.count > 0 ? s.sum / s.count : 0; }
function p50Stat(s: Stats): number { const sorted = [...s.values].sort((a, b) => a - b); return sorted[Math.floor(sorted.length / 2)] ?? 0; }

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  const cells = gridData.geoJson.features;
  console.log(`Processing ${cells.length} cells with raster-enhanced scoring...\n`);

  // First pass: elevation statistics for normalization
  const elevations = cells.map((f: any) => f.properties.metrics.elevation_mean).filter((e: any) => e != null);
  const p25Elev = [...elevations].sort((a: number, b: number) => a - b)[Math.floor(elevations.length * 0.25)];
  console.log(`Elevation p25: ${p25Elev}m`);

  // Sample raster layers at each cell centroid
  console.log('Sampling raster tiles at cell centroids...');
  const friLayer = SAMPLE_LAYERS.find(l => l.id === 'fri_2024')!;
  const hwmLayer = SAMPLE_LAYERS.find(l => l.id === 'hwm_2024')!;
  const hwm2030Layer = SAMPLE_LAYERS.find(l => l.id === 'hwm_2030s_245')!;
  const chirpsRx1Layer = SAMPLE_LAYERS.find(l => l.id === 'chirps_rx1day_2024')!;
  const chirpsR99pLayer = SAMPLE_LAYERS.find(l => l.id === 'chirps_r99p_2024')!;
  const dwLayer = SAMPLE_LAYERS.find(l => l.id === 'dynamic_world')!;

  // Batch sample all cells
  const rasterData: Record<string, Record<string, number | null>> = {};
  let sampled = 0;

  for (const cell of cells) {
    const [lng, lat] = cell.properties.centroid;
    const cellId = cell.properties.id;

    // Sample key layers (parallel per cell)
    const [fri, hwm, hwm2030, rx1day, r99p, dw] = await Promise.all([
      sampleValue(lat, lng, friLayer),
      sampleValue(lat, lng, hwmLayer),
      sampleValue(lat, lng, hwm2030Layer),
      sampleValue(lat, lng, chirpsRx1Layer),
      sampleValue(lat, lng, chirpsR99pLayer),
      sampleValue(lat, lng, dwLayer),
    ]);

    rasterData[cellId] = { fri, hwm, hwm2030, rx1day, r99p, dw };
    sampled++;
    if (sampled % 100 === 0) process.stdout.write(`  ${sampled}/${cells.length}\r`);
  }
  console.log(`  Sampled ${sampled} cells\n`);

  // ── Compute FRI statistics for normalization ────────────────────────────────
  const friValues = Object.values(rasterData).map(d => d.fri).filter(v => v != null) as number[];
  const friMax = Math.max(...friValues, 0.01);
  const friP90 = [...friValues].sort((a, b) => a - b)[Math.floor(friValues.length * 0.9)] ?? friMax;
  console.log(`FRI stats: max=${friMax.toFixed(3)}, p90=${friP90.toFixed(3)}, coverage=${friValues.length}/${cells.length}`);

  const hwmValues = Object.values(rasterData).map(d => d.hwm ?? d.hwm2030).filter(v => v != null) as number[];
  const hwmMax = Math.max(...hwmValues, 1);
  const hwmP90 = [...hwmValues].sort((a, b) => a - b)[Math.floor(hwmValues.length * 0.9)] ?? hwmMax;
  console.log(`HWM stats: max=${hwmMax.toFixed(1)}, p90=${hwmP90.toFixed(1)}, coverage=${hwmValues.length}/${cells.length}`);

  const rx1Values = Object.values(rasterData).map(d => d.rx1day).filter(v => v != null) as number[];
  const rx1Max = Math.max(...rx1Values, 1);
  console.log(`CHIRPS Rx1day stats: max=${rx1Max.toFixed(1)}mm, coverage=${rx1Values.length}/${cells.length}`);

  // ── Score tracking ──────────────────────────────────────────────────────────
  const floodStats = newStats();
  const heatStats = newStats();
  const landslideStats = newStats();
  const friCorrelation: Array<[number, number]> = []; // [our_score, fri_value]
  const hwmCorrelation: Array<[number, number]> = [];

  // ── Recalculate scores ──────────────────────────────────────────────────────
  for (const cell of cells) {
    const m = cell.properties.metrics;
    const [lng, lat] = cell.properties.centroid;
    const cellId = cell.properties.id;
    const raster = rasterData[cellId] || {};

    // Fix slope calculation
    if (m.elevation_max != null && m.elevation_min != null) {
      const elevRange = m.elevation_max - m.elevation_min;
      m.slope_mean = Math.atan(elevRange / CELL_SIZE_METERS) * (180 / Math.PI);
    }

    // ── Extract local metrics ─────────────────────────────────────────────────
    const flowAccumPct = m.flow_accum_pct ?? 0;
    const depressionPct = m.depression_pct ?? 0;
    const riverProx = m.river_prox_pct ?? 0;
    const waterProx = m.floodplain_adj_pct ?? 0;
    const lowLying = m.low_lying_pct ?? 0.5;
    const imperv = m.imperv_pct ?? m.building_density ?? 0;
    const slope = m.slope_mean ?? 0;
    const elevation = m.elevation_mean ?? p25Elev;
    const canopy = m.canopy_pct ?? 0;
    const green = m.green_pct ?? 0;
    const vegetation = Math.max(canopy, green);
    const popDensity = m.pop_density ?? 0;
    const buildingDensity = m.building_density ?? imperv;

    m.vegetation_pct = vegetation;

    // Water cooling
    let waterCooling = 0;
    if (m.dist_water_m != null) {
      waterCooling = Math.max(0, 1 - m.dist_water_m / 5000);
    } else if ((m.floodplain_adj_pct || 0) > 0 || (m.river_prox_pct || 0) > 0) {
      waterCooling = Math.max(m.floodplain_adj_pct || 0, m.river_prox_pct || 0);
    }
    m.water_cooling = waterCooling;

    // Dynamic World land class
    const dwClass = raster.dw;
    const isBuilt = dwClass === 6;
    const isWater = dwClass === 0;
    const isVegetated = dwClass === 1 || dwClass === 2 || dwClass === 3 || dwClass === 5;

    // ══════════════════════════════════════════════════════════════════════════
    // FLOOD SCORE v2
    // Foundation: OEF's FRI (Flood Risk Index) — calibrated composite index
    // Enhancement: local hydrology + terrain + imperviousness
    // ══════════════════════════════════════════════════════════════════════════

    const fri = raster.fri;
    const friNorm = fri != null ? clamp01(fri / Math.max(friMax, 0.01)) : null;

    // Local physical factors (same as v1 but with DW-enhanced imperviousness)
    const localImperv = isBuilt ? Math.max(imperv, 0.7) : imperv; // DW confirms built = high imperv
    const flatness = slope > 0 ? Math.max(0, 1 - slope / 50) : 0.5;

    const physicalFlood = (
      0.25 * flowAccumPct +
      0.20 * depressionPct +
      0.20 * riverProx +
      0.15 * lowLying +
      0.10 * waterProx +
      0.10 * flatness
    );

    // Location factors (Porto Alegre specific)
    const distToLake = Math.max(0, lng - LAKE_WEST_BOUNDARY) / 0.10;
    const lakesideRisk = Math.max(0, 1 - distToLake);
    const distToDelta = Math.sqrt(Math.pow((lng - DELTA_CENTER_LNG) * 111, 2) + Math.pow((lat - DELTA_CENTER_LAT) * 111, 2));
    const deltaRisk = Math.max(0, 1 - distToDelta / 20);
    const lowElevRisk = elevation < 40 ? Math.max(0, 1 - (elevation - 20) / 30) : 0;

    const locationFlood = 0.40 * lakesideRisk + 0.35 * lowElevRisk + 0.25 * deltaRisk;

    // Imperviousness amplifier: impervious surfaces increase runoff
    const runoffAmplifier = 1 + (localImperv * 0.3); // up to 30% boost

    // Combine: if FRI is available, weight it heavily; otherwise fall back to local
    let floodScore: number;
    if (friNorm != null) {
      // FRI-enhanced: 55% FRI + 25% local physical + 20% location
      // No runoff amplifier on FRI path — FRI already accounts for land cover
      floodScore = clamp01(
        0.55 * friNorm +
        0.25 * physicalFlood +
        0.20 * locationFlood
      );
    } else {
      // Fallback: same as v1
      const combined = Math.max(physicalFlood, locationFlood * 0.8) + (physicalFlood * locationFlood * 0.3);
      floodScore = clamp01(combined * runoffAmplifier);
    }

    m.flood_score = round2(floodScore);
    m.fri_raw = fri != null ? round2(fri) : null;
    m.lakeside_risk = round2(lakesideRisk);
    m.delta_risk = round2(deltaRisk);
    m.low_elev_risk = round2(lowElevRisk);

    addStat(floodStats, floodScore);
    if (fri != null) friCorrelation.push([floodScore, fri]);

    // ══════════════════════════════════════════════════════════════════════════
    // HEAT SCORE v2
    // Foundation: OEF's HWM (Heatwave Magnitude) — °C·days above threshold
    // Enhancement: urban heat island (building density, vegetation, albedo proxy)
    // ══════════════════════════════════════════════════════════════════════════

    const hwm = raster.hwm ?? raster.hwm2030; // fall back to projection if 2024 unavailable
    const hwmNorm = hwm != null ? clamp01(hwm / Math.max(hwmP90, 1)) : null;

    // Urban Heat Island factors (high resolution)
    // These drive local differentiation — which neighborhoods are hotter
    const uhiFactor = (
      0.40 * buildingDensity +           // Dense buildings trap heat (dominant)
      0.30 * (1 - vegetation) +           // Lack of green = less cooling
      0.15 * localImperv +                // Impervious surfaces
      0.10 * popDensity +                 // Human heat generation
      0.05 * (1 - waterCooling)           // Lack of water cooling
    );

    // HWM is a regional metric (~same value across the whole city).
    // Use it as a gentle multiplier, not a direct input.
    // If HWM is high (>8 °C·days), boost urban heat; if low, dampen it.
    const hwmMultiplier = hwm != null ? 0.8 + (clamp01(hwm / 15) * 0.4) : 1.0; // range 0.8–1.2

    let heatScore = clamp01(uhiFactor * hwmMultiplier);

    // Green areas and water bodies should have genuinely low heat risk
    if (isVegetated && vegetation > 0.5) heatScore *= 0.5;
    if (isWater) heatScore = 0;

    // Cap at 0.90 — 1.0 should be reserved for truly extreme cases
    heatScore = Math.min(heatScore, 0.90);

    m.heat_score = round2(heatScore);
    m.hwm_raw = hwm != null ? round2(hwm) : null;

    addStat(heatStats, heatScore);
    if (hwm != null) hwmCorrelation.push([heatScore, hwm]);

    // ══════════════════════════════════════════════════════════════════════════
    // LANDSLIDE SCORE v2
    // No pre-computed index available — terrain-based with precipitation trigger
    // Enhancement: CHIRPS extreme precipitation as trigger intensity
    // ══════════════════════════════════════════════════════════════════════════

    const slopeRisk = slope >= 5 ? clamp01((slope - 3) / 12) : 0;
    const lackOfVeg = 1 - vegetation;
    const elevated = 1 - lowLying;

    // Precipitation trigger: intense rainfall destabilizes slopes
    const rx1day = raster.rx1day;
    const precipTrigger = rx1day != null ? clamp01((rx1day - 40) / 80) : 0.5; // >40mm triggers, saturates at 120mm

    // Deforestation amplifier: areas that lost forest are more unstable
    // (we don't have this directly but DW bare/built on steep terrain is a proxy)
    const bareOnSlope = (dwClass === 7 || dwClass === 6) && slope >= 5 ? 0.2 : 0;

    let landslideScore: number;
    if (slopeRisk > 0) {
      landslideScore = clamp01(
        0.50 * slopeRisk +                    // Slope is still dominant
        0.20 * precipTrigger * slopeRisk +     // Rain on steep = trigger
        0.15 * lackOfVeg * slopeRisk +         // No vegetation = less root cohesion
        0.10 * elevated * slopeRisk +          // Higher = more potential energy
        0.05 * bareOnSlope                     // Bare/built on steep = extra risk
      );
    } else {
      landslideScore = 0;
    }

    m.landslide_score = round2(landslideScore);
    m.precip_trigger = rx1day != null ? round2(rx1day) : null;

    addStat(landslideStats, landslideScore);
  }

  // ── Print results ───────────────────────────────────────────────────────────
  console.log('\n════════════════════════════════════════════════════════');
  console.log('RISK SCORE DISTRIBUTION (v2 raster-enhanced)');
  console.log('════════════════════════════════════════════════════════');
  console.log(`Flood:     avg=${avgStat(floodStats).toFixed(3)}, median=${p50Stat(floodStats).toFixed(3)}, max=${floodStats.max.toFixed(2)}, min=${floodStats.min.toFixed(2)}`);
  console.log(`Heat:      avg=${avgStat(heatStats).toFixed(3)}, median=${p50Stat(heatStats).toFixed(3)}, max=${heatStats.max.toFixed(2)}, min=${heatStats.min.toFixed(2)}`);
  console.log(`Landslide: avg=${avgStat(landslideStats).toFixed(3)}, median=${p50Stat(landslideStats).toFixed(3)}, max=${landslideStats.max.toFixed(2)}, min=${landslideStats.min.toFixed(2)}`);

  // Correlation with raw FRI
  if (friCorrelation.length > 10) {
    const friMean = friCorrelation.reduce((s, [, f]) => s + f, 0) / friCorrelation.length;
    const scoreMean = friCorrelation.reduce((s, [sc]) => s + sc, 0) / friCorrelation.length;
    let num = 0, denA = 0, denB = 0;
    for (const [sc, f] of friCorrelation) {
      num += (sc - scoreMean) * (f - friMean);
      denA += (sc - scoreMean) ** 2;
      denB += (f - friMean) ** 2;
    }
    const r = denA > 0 && denB > 0 ? num / Math.sqrt(denA * denB) : 0;
    console.log(`\nFlood-FRI correlation: r=${r.toFixed(3)} (${friCorrelation.length} cells with FRI data)`);
  }

  if (hwmCorrelation.length > 10) {
    const hwmMean = hwmCorrelation.reduce((s, [, h]) => s + h, 0) / hwmCorrelation.length;
    const scoreMean = hwmCorrelation.reduce((s, [sc]) => s + sc, 0) / hwmCorrelation.length;
    let num = 0, denA = 0, denB = 0;
    for (const [sc, h] of hwmCorrelation) {
      num += (sc - scoreMean) * (h - hwmMean);
      denA += (sc - scoreMean) ** 2;
      denB += (h - hwmMean) ** 2;
    }
    const r = denA > 0 && denB > 0 ? num / Math.sqrt(denA * denB) : 0;
    console.log(`Heat-HWM correlation: r=${r.toFixed(3)} (${hwmCorrelation.length} cells with HWM data)`);
  }

  // Cell distribution
  let floodDom = 0, heatDom = 0, landslideDom = 0, lowRisk = 0;
  for (const cell of cells) {
    const m = cell.properties.metrics;
    const f = m.flood_score || 0;
    const h = m.heat_score || 0;
    const l = m.landslide_score || 0;
    const max = Math.max(f, h, l);
    if (max < 0.30) lowRisk++;
    else if (max === l) landslideDom++;
    else if (max === f) floodDom++;
    else heatDom++;
  }
  console.log(`\nCells by dominant risk (threshold 0.30):`);
  console.log(`  Flood: ${floodDom}, Heat: ${heatDom}, Landslide: ${landslideDom}, Low: ${lowRisk}`);

  // ── Save ────────────────────────────────────────────────────────────────────
  fs.writeFileSync(gridPath, JSON.stringify(gridData, null, 2));
  console.log(`\n✓ Grid updated: ${gridPath}`);
  console.log(`  New fields per cell: fri_raw, hwm_raw, precip_trigger`);
}

main().catch(console.error);

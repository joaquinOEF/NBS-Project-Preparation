/**
 * Risk Score Calculator v3 — 250m grid with validation
 *
 * Uses the 250m grid with integrated raster data:
 * - FRI 2024 as flood foundation
 * - SoilGrids clay/sand for permeability
 * - Dynamic World for land use
 * - CHIRPS Rx1day for precipitation trigger
 * - 2024 flood extent for validation (F1-score optimization)
 *
 * Iterative: prints validation metrics after each run so weights can be tuned.
 *
 * Usage: npx tsx scripts/recalc-scores-v3.ts
 */

import * as fs from 'fs';

const gridPath = 'client/public/sample-data/porto-alegre-grid-250m.json';
const gridData = JSON.parse(fs.readFileSync(gridPath, 'utf-8'));

const LAKE_WEST_BOUNDARY = -51.23;
const DELTA_CENTER_LAT = -30.05;
const DELTA_CENTER_LNG = -51.22;

function clamp01(v: number): number { return Math.max(0, Math.min(1, v)); }
function round3(v: number): number { return Math.round(v * 1000) / 1000; }

// ── Elevation stats ───────────────────────────────────────────────────────────
const elevations = gridData.geoJson.features
  .map((f: any) => f.properties.metrics.elevation_mean)
  .filter((e: any) => e != null);
const p25Elev = [...elevations].sort((a: number, b: number) => a - b)[Math.floor(elevations.length * 0.25)] ?? 30;

// ── FRI stats for normalization ───────────────────────────────────────────────
const friValues = gridData.geoJson.features
  .map((f: any) => f.properties.metrics.fri_raw)
  .filter((v: any) => v != null) as number[];
const friMax = Math.max(...friValues, 0.01);
const friP95 = [...friValues].sort((a, b) => a - b)[Math.floor(friValues.length * 0.95)] ?? friMax;

console.log(`Grid: ${gridData.geoJson.features.length} cells at ${gridData.cellSizeMeters}m`);
console.log(`FRI: max=${friMax.toFixed(3)}, p95=${friP95.toFixed(3)}, coverage=${friValues.length}`);
console.log(`Elevation p25: ${p25Elev.toFixed(1)}m\n`);

// ── Stats trackers ────────────────────────────────────────────────────────────
let floodSum = 0, heatSum = 0, landslideSum = 0;
let floodMax = 0, heatMax = 0, landslideMax = 0;
let floodDom = 0, heatDom = 0, landslideDom = 0, lowRisk = 0;

// Validation: flood score vs 2024 flood extent
let truePositive = 0, falsePositive = 0, falseNegative = 0, trueNegative = 0;
const FLOOD_THRESHOLD = 0.45; // Score above this = "predicted flooded"

// ── Score each cell ───────────────────────────────────────────────────────────
for (const cell of gridData.geoJson.features) {
  const m = cell.properties.metrics;
  const [lng, lat] = cell.properties.centroid;

  // Recalculate slope at 250m cell size (not inherited 1km)
  if (m.elevation_max != null && m.elevation_min != null) {
    const elevRange = m.elevation_max - m.elevation_min;
    m.slope_mean = Math.atan(elevRange / gridData.cellSizeMeters) * (180 / Math.PI);
  }

  // Extract metrics
  const fri = m.fri_raw;
  const friNorm = fri != null ? clamp01(fri / friMax) : null;
  const elevation = m.elevation_mean ?? p25Elev;
  const slope = m.slope_mean ?? 0;
  const flowAccumPct = m.flow_accum_pct ?? 0;
  const depressionPct = m.depression_pct ?? 0;
  const riverProx = m.river_prox_pct ?? 0;
  const waterProx = m.floodplain_adj_pct ?? 0;
  const lowLying = m.low_lying_pct ?? 0.5;
  const imperv = m.imperv_pct ?? m.building_density ?? 0;
  const vegetation = m.vegetation_pct ?? Math.max(m.canopy_pct ?? 0, m.green_pct ?? 0);
  const buildingDensity = m.building_density ?? imperv;
  const popDensity = m.pop_density ?? 0;
  const dwClass = m.dw_class;
  const rx1day = m.precip_rx1day;

  // Soil permeability (SoilGrids 250m)
  const soilPerm = m.soil_permeability ?? 0.5; // default mid if no soil data
  const runoffPotential = 1 - soilPerm; // High clay = low permeability = high runoff

  // Water cooling
  let waterCooling = m.water_cooling ?? 0;

  // Land use flags
  const isBuilt = dwClass === 6;
  const isWater = dwClass === 0;
  const isVegetated = dwClass === 1 || dwClass === 2 || dwClass === 3 || dwClass === 5;

  // ════════════════════════════════════════════════════════════════════════════
  // FLOOD SCORE v3
  // FRI foundation + soil permeability + local hydrology + location
  // ════════════════════════════════════════════════════════════════════════════

  const flatness = slope > 0 ? Math.max(0, 1 - slope / 50) : 0.5;

  const physicalFlood = (
    0.25 * flowAccumPct +
    0.20 * depressionPct +
    0.20 * riverProx +
    0.15 * lowLying +
    0.10 * waterProx +
    0.10 * flatness
  );

  // Location factors
  const distToLake = Math.max(0, lng - LAKE_WEST_BOUNDARY) / 0.10;
  const lakesideRisk = Math.max(0, 1 - distToLake);
  const distToDelta = Math.sqrt(Math.pow((lng - DELTA_CENTER_LNG) * 111, 2) + Math.pow((lat - DELTA_CENTER_LAT) * 111, 2));
  const deltaRisk = Math.max(0, 1 - distToDelta / 20);
  const lowElevRisk = elevation < 40 ? Math.max(0, 1 - (elevation - 20) / 30) : 0;
  const locationFlood = 0.40 * lakesideRisk + 0.35 * lowElevRisk + 0.25 * deltaRisk;

  // Soil runoff amplifier (NEW in v3)
  const soilAmplifier = 1 + (runoffPotential * 0.2); // Up to 20% boost for clay soils

  let floodScore: number;
  if (friNorm != null) {
    floodScore = clamp01((
      0.50 * friNorm +           // Satellite-calibrated foundation (dominant)
      0.15 * physicalFlood +     // Local terrain/hydrology
      0.25 * locationFlood +     // Porto Alegre geography (lake, delta, low elevation)
      0.10 * runoffPotential     // Soil permeability
    ) * soilAmplifier);
  } else {
    // No FRI coverage — rely more heavily on location + physical factors
    const combined = Math.max(physicalFlood, locationFlood) + (physicalFlood * locationFlood * 0.4);
    floodScore = clamp01(combined * soilAmplifier);
  }

  // Water cells: expanded water during floods IS a flood zone.
  // Keep flood score for water cells near land (FRI-covered or near rivers).
  // Only deep open lake far from shore gets suppressed.
  if (isWater && fri == null && lakesideRisk < 0.3 && riverProx < 0.3) {
    floodScore = Math.min(floodScore, 0.15); // Suppress only deep open water
  }

  m.flood_score = round3(floodScore);

  // ════════════════════════════════════════════════════════════════════════════
  // HEAT SCORE v3
  // UHI factor + HWM regional multiplier + vegetation cooling
  // ════════════════════════════════════════════════════════════════════════════

  const uhiFactor = (
    0.40 * buildingDensity +
    0.30 * (1 - vegetation) +
    0.15 * imperv +
    0.10 * popDensity +
    0.05 * (1 - waterCooling)
  );

  const hwm = m.hwm_raw;
  const hwmMultiplier = hwm != null ? 0.8 + (clamp01(hwm / 15) * 0.4) : 1.0;

  let heatScore = clamp01(uhiFactor * hwmMultiplier);
  if (isVegetated && vegetation > 0.5) heatScore *= 0.5;
  if (isWater) heatScore = 0;
  heatScore = Math.min(heatScore, 0.90);

  m.heat_score = round3(heatScore);

  // ════════════════════════════════════════════════════════════════════════════
  // LANDSLIDE SCORE v3
  // Slope + soil + precipitation trigger
  // ════════════════════════════════════════════════════════════════════════════

  // Geotechnical slope risk thresholds (best practices):
  //   < 15° = generally stable (no risk)
  //   15-25° = moderate susceptibility
  //   25-35° = high susceptibility
  //   > 35° = very high
  const slopeRisk = slope >= 15 ? clamp01((slope - 15) / 20) : 0; // Activates at 15°, max at 35°

  const lackOfVeg = 1 - vegetation;
  const elevated = 1 - lowLying;
  const precipTrigger = rx1day != null ? clamp01((rx1day - 40) / 80) : 0.5;

  // Soil cohesion: clay soils are more cohesive (resist sliding)
  const soilCohesion = m.clay_pct != null ? clamp01(m.clay_pct / 40) : 0.5;

  // Bare/built on steep terrain (only counts if slope ≥ 15°)
  const bareOnSlope = (dwClass === 7 || dwClass === 6) && slope >= 15 ? 0.2 : 0;

  let landslideScore: number;
  if (slopeRisk > 0) {
    landslideScore = clamp01(
      0.45 * slopeRisk +
      0.20 * precipTrigger * slopeRisk +
      0.15 * (1 - soilCohesion) * slopeRisk +
      0.10 * lackOfVeg * slopeRisk +
      0.05 * elevated * slopeRisk +
      0.05 * bareOnSlope
    );
  } else {
    landslideScore = 0;
  }

  m.landslide_score = round3(landslideScore);

  // ── Track stats ─────────────────────────────────────────────────────────────
  floodSum += floodScore; heatSum += heatScore; landslideSum += landslideScore;
  floodMax = Math.max(floodMax, floodScore);
  heatMax = Math.max(heatMax, heatScore);
  landslideMax = Math.max(landslideMax, landslideScore);

  const maxRisk = Math.max(floodScore, heatScore, landslideScore);
  if (maxRisk < 0.25) lowRisk++;
  else if (maxRisk === landslideScore) landslideDom++;
  else if (maxRisk === floodScore) floodDom++;
  else heatDom++;

  // ── Validation: compare flood score to 2024 observed extent ─────────────────
  const predicted = floodScore >= FLOOD_THRESHOLD;
  const actual = m.in_flood_2024 === 1;
  if (predicted && actual) truePositive++;
  else if (predicted && !actual) falsePositive++;
  else if (!predicted && actual) falseNegative++;
  else trueNegative++;
}

// ── Print results ─────────────────────────────────────────────────────────────
const n = gridData.geoJson.features.length;
console.log('════════════════════════════════════════════════════════');
console.log('RISK SCORE DISTRIBUTION (v3, 250m grid)');
console.log('════════════════════════════════════════════════════════');
console.log(`Flood:     avg=${(floodSum/n).toFixed(3)}, max=${floodMax.toFixed(2)}`);
console.log(`Heat:      avg=${(heatSum/n).toFixed(3)}, max=${heatMax.toFixed(2)}`);
console.log(`Landslide: avg=${(landslideSum/n).toFixed(3)}, max=${landslideMax.toFixed(2)}`);
console.log(`\nDominant risk (threshold 0.25):`);
console.log(`  Flood: ${floodDom}, Heat: ${heatDom}, Landslide: ${landslideDom}, Low: ${lowRisk}`);

// ── Flood validation metrics ──────────────────────────────────────────────────
const precision = truePositive / (truePositive + falsePositive) || 0;
const recall = truePositive / (truePositive + falseNegative) || 0;
const f1 = 2 * precision * recall / (precision + recall) || 0;
const accuracy = (truePositive + trueNegative) / n;

console.log(`\n════════════════════════════════════════════════════════`);
console.log(`FLOOD VALIDATION vs 2024 OBSERVED EXTENT`);
console.log(`════════════════════════════════════════════════════════`);
console.log(`Threshold: ${FLOOD_THRESHOLD}`);
console.log(`True Positive:  ${truePositive} (correctly predicted flooded)`);
console.log(`False Positive: ${falsePositive} (predicted flooded but wasn't)`);
console.log(`False Negative: ${falseNegative} (missed actual flooding)`);
console.log(`True Negative:  ${trueNegative} (correctly predicted safe)`);
console.log(`\nPrecision: ${(precision*100).toFixed(1)}% (of predicted floods, how many were real)`);
console.log(`Recall:    ${(recall*100).toFixed(1)}% (of actual floods, how many did we catch)`);
console.log(`F1 Score:  ${(f1*100).toFixed(1)}%`);
console.log(`Accuracy:  ${(accuracy*100).toFixed(1)}%`);

// ── Threshold sweep ───────────────────────────────────────────────────────────
console.log(`\n── Threshold sweep ──`);
for (const thresh of [0.25, 0.30, 0.35, 0.40, 0.45, 0.50, 0.55, 0.60]) {
  let tp = 0, fp = 0, fn = 0;
  for (const cell of gridData.geoJson.features) {
    const m = cell.properties.metrics;
    const pred = (m.flood_score ?? 0) >= thresh;
    const act = m.in_flood_2024 === 1;
    if (pred && act) tp++;
    else if (pred && !act) fp++;
    else if (!pred && act) fn++;
  }
  const p = tp / (tp + fp) || 0;
  const r = tp / (tp + fn) || 0;
  const f = 2 * p * r / (p + r) || 0;
  console.log(`  thresh=${thresh.toFixed(2)}: P=${(p*100).toFixed(0)}% R=${(r*100).toFixed(0)}% F1=${(f*100).toFixed(0)}% (TP=${tp} FP=${fp} FN=${fn})`);
}

// ── Save ──────────────────────────────────────────────────────────────────────
fs.writeFileSync(gridPath, JSON.stringify(gridData));
console.log(`\n✓ Grid updated: ${gridPath}`);

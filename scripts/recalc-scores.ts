import * as fs from 'fs';

const gridPath = 'client/public/sample-data/porto-alegre-grid.json';
const gridData = JSON.parse(fs.readFileSync(gridPath, 'utf-8'));

const CELL_SIZE_METERS = gridData.cellSizeMeters || 1000;

console.log(`Processing ${gridData.geoJson.features.length} cells...`);

for (const cell of gridData.geoJson.features) {
  const m = cell.properties.metrics;

  // Fix slope calculation
  if (m.elevation_max !== null && m.elevation_min !== null) {
    const elevRange = m.elevation_max - m.elevation_min;
    const slopeRadians = Math.atan(elevRange / CELL_SIZE_METERS);
    m.slope_mean = slopeRadians * (180 / Math.PI);
  }
  
  const flowAccumPct = m.flow_accum_pct ?? 0;
  const depressionPct = m.depression_pct ?? 0;
  const riverProx = m.river_prox_pct ?? 0;
  const waterProx = m.floodplain_adj_pct ?? 0;
  const lowLying = m.low_lying_pct ?? 0;
  const imperv = m.imperv_pct ?? m.building_density ?? m.built_pct ?? 0;
  const slope = m.slope_mean ?? 0;
  const flatness = slope > 0 ? Math.max(0, 1 - slope / 50) : 0.5;
  
  const canopy = m.canopy_pct ?? 0;
  const green = m.green_pct ?? 0;
  const vegetation = Math.max(canopy, green);
  m.vegetation_pct = vegetation;
  
  const popDensity = m.pop_density ?? 0;
  const buildingDensity = m.building_density ?? imperv;
  
  let waterCooling = 0;
  if (m.dist_water_m !== null && m.dist_water_m !== undefined) {
    waterCooling = Math.max(0, 1 - m.dist_water_m / 5000);
  } else if (m.floodplain_adj_pct > 0 || m.river_prox_pct > 0) {
    waterCooling = Math.max(m.floodplain_adj_pct || 0, m.river_prox_pct || 0);
  }
  m.water_cooling = waterCooling;

  // Flood score - boost for low-lying areas
  m.flood_score = Math.round((
    0.30 * flowAccumPct +
    0.15 * depressionPct +
    0.20 * riverProx +
    0.10 * waterProx +
    0.20 * lowLying +  // increased weight for low-lying
    0.05 * imperv
  ) * 100) / 100;

  // Heat score - boost for urban areas
  m.heat_score = Math.round((
    0.40 * buildingDensity +  // increased
    0.30 * popDensity +       // increased
    0.20 * (1 - vegetation) +
    0.10 * (1 - waterCooling)
  ) * 100) / 100;

  // Landslide score - SLOPE DOMINANT, threshold raised
  // Only areas with significant slope get landslide risk
  const slopeRisk = slope >= 5 ? Math.min(1, (slope - 3) / 12) : 0; // Threshold at 5°, max at 15°
  const lackOfVeg = 1 - vegetation;
  const elevated = 1 - lowLying;
  
  // Only count non-slope factors if there's actual slope
  m.landslide_score = Math.round((
    0.70 * slopeRisk +           // Slope is primary driver (70%)
    0.15 * lackOfVeg * slopeRisk + // Veg only matters on slopes
    0.15 * elevated * slopeRisk    // Elevation only matters on slopes
  ) * 100) / 100;
}

// Calculate stats
const cells = gridData.geoJson.features.map((f: any) => f.properties.metrics);
const flood = cells.map((c: any) => c.flood_score || 0);
const heat = cells.map((c: any) => c.heat_score || 0);
const landslide = cells.map((c: any) => c.landslide_score || 0);
const slopes = cells.map((c: any) => c.slope_mean || 0);

console.log('\n=== RISK SCORE DISTRIBUTION ===');
console.log('Flood: avg=' + (flood.reduce((a:number,b:number)=>a+b,0)/flood.length).toFixed(3) + ', max=' + Math.max(...flood).toFixed(2));
console.log('Heat: avg=' + (heat.reduce((a:number,b:number)=>a+b,0)/heat.length).toFixed(3) + ', max=' + Math.max(...heat).toFixed(2));
console.log('Landslide: avg=' + (landslide.reduce((a:number,b:number)=>a+b,0)/landslide.length).toFixed(3) + ', max=' + Math.max(...landslide).toFixed(2));
console.log('Slope (degrees): avg=' + (slopes.reduce((a:number,b:number)=>a+b,0)/slopes.length).toFixed(1) + ', max=' + Math.max(...slopes).toFixed(1));

console.log('\nSlope distribution:');
console.log('  0-3°: ' + slopes.filter((s:number) => s < 3).length);
console.log('  3-5°: ' + slopes.filter((s:number) => s >= 3 && s < 5).length);
console.log('  5-10°: ' + slopes.filter((s:number) => s >= 5 && s < 10).length);
console.log('  10°+: ' + slopes.filter((s:number) => s >= 10).length);

let floodDom = 0, heatDom = 0, landslideDom = 0, lowRisk = 0;
cells.forEach((c: any) => {
  const f = c.flood_score || 0;
  const h = c.heat_score || 0;
  const l = c.landslide_score || 0;
  const max = Math.max(f, h, l);
  if (max < 0.4) lowRisk++;
  else if (max === l) landslideDom++;
  else if (max === h) heatDom++;
  else floodDom++;
});
console.log('\n=== CELLS BY DOMINANT RISK ===');
console.log('Flood dominant: ' + floodDom);
console.log('Heat dominant: ' + heatDom);
console.log('Landslide dominant: ' + landslideDom);
console.log('Low risk (<0.4): ' + lowRisk);

fs.writeFileSync(gridPath, JSON.stringify(gridData, null, 2));
console.log('\nGrid updated!');

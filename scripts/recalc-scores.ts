import * as fs from 'fs';

const gridPath = 'client/public/sample-data/porto-alegre-grid.json';
const gridData = JSON.parse(fs.readFileSync(gridPath, 'utf-8'));

const CELL_SIZE_METERS = gridData.cellSizeMeters || 1000;

// Guaíba lake is on the western edge of Porto Alegre
// Cells close to the western boundary (-51.27 longitude) are lakeside
const LAKE_WEST_BOUNDARY = -51.23;  // Approximate lakeside longitude
const DELTA_CENTER_LAT = -30.05;    // Approximate center of the delta confluence
const DELTA_CENTER_LNG = -51.22;

console.log(`Processing ${gridData.geoJson.features.length} cells...`);

// First pass: find elevation statistics
const elevations = gridData.geoJson.features
  .map((f: any) => f.properties.metrics.elevation_mean)
  .filter((e: number | null) => e !== null && e !== undefined);

const minElev = Math.min(...elevations);
const maxElev = Math.max(...elevations);
const p25Elev = [...elevations].sort((a, b) => a - b)[Math.floor(elevations.length * 0.25)];

console.log(`Elevation stats: min=${minElev}m, max=${maxElev}m, p25=${p25Elev}m`);

for (const cell of gridData.geoJson.features) {
  const m = cell.properties.metrics;
  const [lng, lat] = cell.properties.centroid;

  // Fix slope calculation
  if (m.elevation_max !== null && m.elevation_min !== null) {
    const elevRange = m.elevation_max - m.elevation_min;
    const slopeRadians = Math.atan(elevRange / CELL_SIZE_METERS);
    m.slope_mean = slopeRadians * (180 / Math.PI);
  }
  
  // === IMPROVED FLOOD FACTORS ===
  
  // 1. Lakeside proximity (distance to western boundary)
  const distToLake = Math.max(0, lng - LAKE_WEST_BOUNDARY) / 0.10; // 0.10° ≈ 11km
  const lakesideRisk = Math.max(0, 1 - distToLake); // 1.0 at lake, 0 at 11km away
  
  // 2. Delta confluence zone (4 rivers meet here)
  const distToDelta = Math.sqrt(
    Math.pow((lng - DELTA_CENTER_LNG) * 111, 2) + 
    Math.pow((lat - DELTA_CENTER_LAT) * 111, 2)
  );
  const deltaRisk = Math.max(0, 1 - distToDelta / 20); // 1.0 at delta, 0 at 20km
  
  // 3. Low elevation (absolute threshold)
  const elevation = m.elevation_mean ?? p25Elev; // Use p25 as default for missing data
  const lowElevRisk = elevation < 40 ? Math.max(0, 1 - (elevation - 20) / 30) : 0;
  
  // 4. Standard metrics (existing)
  const flowAccumPct = m.flow_accum_pct ?? 0;
  const depressionPct = m.depression_pct ?? 0;
  const riverProx = m.river_prox_pct ?? 0;
  const waterProx = m.floodplain_adj_pct ?? 0;
  const lowLying = m.low_lying_pct ?? 0.5; // Default to mid for missing
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

  // NEW FLOOD SCORE - combines physical factors with location-based risk
  const physicalFlood = (
    0.25 * flowAccumPct +
    0.20 * depressionPct +
    0.20 * riverProx +
    0.15 * lowLying +
    0.10 * waterProx +
    0.10 * flatness
  );
  
  const locationFlood = (
    0.40 * lakesideRisk +    // Being near the lake
    0.35 * lowElevRisk +     // Being at low elevation
    0.25 * deltaRisk         // Being in the delta confluence
  );
  
  // Combine: max of physical OR location factors, with bonus if both are high
  const combinedFlood = Math.max(physicalFlood, locationFlood * 0.8) + 
                        (physicalFlood * locationFlood * 0.3); // synergy bonus
  
  m.flood_score = Math.round(Math.min(1, combinedFlood) * 100) / 100;
  
  // Store intermediate values for debugging
  m.lakeside_risk = Math.round(lakesideRisk * 100) / 100;
  m.delta_risk = Math.round(deltaRisk * 100) / 100;
  m.low_elev_risk = Math.round(lowElevRisk * 100) / 100;

  // Heat score - boost for urban areas
  m.heat_score = Math.round((
    0.40 * buildingDensity +
    0.30 * popDensity +
    0.20 * (1 - vegetation) +
    0.10 * (1 - waterCooling)
  ) * 100) / 100;

  // Landslide score - SLOPE DOMINANT
  const slopeRisk = slope >= 5 ? Math.min(1, (slope - 3) / 12) : 0;
  const lackOfVeg = 1 - vegetation;
  const elevated = 1 - lowLying;
  
  m.landslide_score = Math.round((
    0.70 * slopeRisk +
    0.15 * lackOfVeg * slopeRisk +
    0.15 * elevated * slopeRisk
  ) * 100) / 100;
}

// Calculate stats
const cells = gridData.geoJson.features.map((f: any) => f.properties.metrics);
const flood = cells.map((c: any) => c.flood_score || 0);
const heat = cells.map((c: any) => c.heat_score || 0);
const landslide = cells.map((c: any) => c.landslide_score || 0);
const lakeside = cells.map((c: any) => c.lakeside_risk || 0);

console.log('\n=== RISK SCORE DISTRIBUTION ===');
console.log('Flood: avg=' + (flood.reduce((a:number,b:number)=>a+b,0)/flood.length).toFixed(3) + ', max=' + Math.max(...flood).toFixed(2));
console.log('Heat: avg=' + (heat.reduce((a:number,b:number)=>a+b,0)/heat.length).toFixed(3) + ', max=' + Math.max(...heat).toFixed(2));
console.log('Landslide: avg=' + (landslide.reduce((a:number,b:number)=>a+b,0)/landslide.length).toFixed(3) + ', max=' + Math.max(...landslide).toFixed(2));

console.log('\n=== NEW FLOOD FACTORS ===');
console.log('Lakeside risk: avg=' + (lakeside.reduce((a:number,b:number)=>a+b,0)/lakeside.length).toFixed(3) + ', max=' + Math.max(...lakeside).toFixed(2));
const highLakeside = lakeside.filter((l: number) => l > 0.5).length;
console.log('Cells with high lakeside risk (>0.5):', highLakeside);

let floodDom = 0, heatDom = 0, landslideDom = 0, lowRisk = 0;
cells.forEach((c: any) => {
  const f = c.flood_score || 0;
  const h = c.heat_score || 0;
  const l = c.landslide_score || 0;
  const max = Math.max(f, h, l);
  if (max < 0.30) lowRisk++;
  else if (max === l) landslideDom++;
  else if (max === f) floodDom++;
  else heatDom++;
});
console.log('\n=== CELLS BY DOMINANT RISK (threshold 0.30) ===');
console.log('Flood dominant:', floodDom);
console.log('Heat dominant:', heatDom);
console.log('Landslide dominant:', landslideDom);
console.log('Low risk (<0.30):', lowRisk);

fs.writeFileSync(gridPath, JSON.stringify(gridData, null, 2));
console.log('\nGrid updated!');

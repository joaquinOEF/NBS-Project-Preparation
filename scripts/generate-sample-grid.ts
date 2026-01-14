import * as fs from 'fs';
import * as path from 'path';
import * as turf from '@turf/turf';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORTO_ALEGRE_BOUNDS = {
  minLng: -51.27,
  minLat: -30.27,
  maxLng: -51.01,
  maxLat: -29.93,
};

const CELL_SIZE_METERS = 1000;
const OUTPUT_DIR = path.join(__dirname, '../client/public/sample-data');

async function loadSampleData(filename: string): Promise<any> {
  const filepath = path.join(OUTPUT_DIR, filename);
  if (!fs.existsSync(filepath)) {
    console.log(`   ⚠️ ${filename} not found`);
    return null;
  }
  const data = JSON.parse(fs.readFileSync(filepath, 'utf-8'));
  console.log(`   ✓ Loaded ${filename}`);
  return data;
}

function generateGrid(bounds: typeof PORTO_ALEGRE_BOUNDS, cellSizeMeters: number): any {
  const bbox: [number, number, number, number] = [
    bounds.minLng,
    bounds.minLat,
    bounds.maxLng,
    bounds.maxLat,
  ];

  const cellSideKm = cellSizeMeters / 1000;
  const grid = turf.squareGrid(bbox, cellSideKm, { units: 'kilometers' });

  grid.features.forEach((feature: any, index: number) => {
    const centroid = turf.centroid(feature);
    feature.properties = {
      id: `cell_${index}`,
      centroid: centroid.geometry.coordinates,
      metrics: {
        elevation_mean: null,
        elevation_min: null,
        elevation_max: null,
        slope_mean: null,
        low_lying_pct: null,
        flow_accum: null,
        flow_accum_pct: null,
        is_depression: null,
        depression_pct: null,
        dist_river_m: null,
        river_prox_pct: null,
        dist_water_m: null,
        water_cooling: null,
        floodplain_adj_pct: null,
        imperv_pct: null,
        green_pct: null,
        canopy_pct: null,
        vegetation_pct: null,
        building_density: null,
        built_pct: null,
        pop_density: null,
        pop_density_raw: null,
        flood_score: null,
        heat_score: null,
        landslide_score: null,
      },
      coverage: {
        elevation: false,
        flow: false,
        landcover: false,
        surface_water: false,
        rivers: false,
        forest: false,
        population: false,
        buildings: false,
      },
    };
  });

  return grid;
}

function computeElevationMetrics(grid: any, elevationData: any): any {
  if (!elevationData?.contours?.features) return grid;

  const contourLines = elevationData.contours.features;
  const demGrid = elevationData.demGrid;
  const flowAccum = elevationData.flowAccumulation;
  const depressions = elevationData.depressions;
  const demMeta = elevationData.elevationData;
  const bounds = elevationData.bounds;

  let maxFlowAccum = 1;
  if (flowAccum) {
    for (const row of flowAccum) {
      for (const val of row) {
        if (val > maxFlowAccum) maxFlowAccum = val;
      }
    }
  }

  for (let i = 0; i < grid.features.length; i++) {
    const cell = grid.features[i];
    const centroid = cell.properties.centroid;
    const elevations: number[] = [];

    for (const contour of contourLines) {
      if (!contour.geometry || !contour.properties?.elevation) continue;
      try {
        if (turf.booleanIntersects(cell, contour)) {
          elevations.push(contour.properties.elevation);
        }
      } catch (e) {
        continue;
      }
    }

    if (elevations.length > 0) {
      cell.properties.metrics.elevation_mean = elevations.reduce((a: number, b: number) => a + b, 0) / elevations.length;
      cell.properties.metrics.elevation_min = Math.min(...elevations);
      cell.properties.metrics.elevation_max = Math.max(...elevations);
      const elevRange = cell.properties.metrics.elevation_max - cell.properties.metrics.elevation_min;
      const slopeRadians = Math.atan(elevRange / CELL_SIZE_METERS);
      cell.properties.metrics.slope_mean = slopeRadians * (180 / Math.PI);
      cell.properties.coverage.elevation = true;
    }

    if (demGrid && flowAccum && depressions && centroid && bounds) {
      const lngPct = (centroid[0] - bounds.minLng) / (bounds.maxLng - bounds.minLng);
      const latPct = (bounds.maxLat - centroid[1]) / (bounds.maxLat - bounds.minLat);
      const col = Math.floor(lngPct * demMeta.width);
      const row = Math.floor(latPct * demMeta.height);

      if (row >= 0 && row < demMeta.height && col >= 0 && col < demMeta.width) {
        const accumVal = flowAccum[row]?.[col] ?? 1;
        cell.properties.metrics.flow_accum = accumVal;
        cell.properties.metrics.flow_accum_pct = accumVal / maxFlowAccum;

        const isDepression = depressions[row]?.[col] ?? false;
        cell.properties.metrics.is_depression = isDepression;
        cell.properties.metrics.depression_pct = isDepression ? 1 : 0;

        cell.properties.coverage.flow = true;
      }
    }
    
    if (i % 500 === 0) process.stdout.write(`\r   Elevation: ${i}/${grid.features.length} cells`);
  }
  console.log(`\r   Elevation: ${grid.features.length} cells processed`);

  const allElevations = grid.features
    .filter((c: any) => c.properties.metrics.elevation_mean !== null)
    .map((c: any) => c.properties.metrics.elevation_mean);

  if (allElevations.length > 0) {
    const sortedElevations = [...allElevations].sort((a: number, b: number) => a - b);
    for (const cell of grid.features) {
      if (cell.properties.metrics.elevation_mean !== null) {
        const rank = sortedElevations.indexOf(cell.properties.metrics.elevation_mean);
        cell.properties.metrics.low_lying_pct = 1 - (rank / sortedElevations.length);
      }
    }
  }

  return grid;
}

function computeRiverMetrics(grid: any, riversData: any): any {
  if (!riversData?.geoJson?.features) return grid;

  const riverFeatures = riversData.geoJson.features.filter(
    (f: any) => f.geometry?.type === 'LineString' || f.geometry?.type === 'MultiLineString'
  );

  if (riverFeatures.length === 0) return grid;

  const allDistances: number[] = [];

  for (let i = 0; i < grid.features.length; i++) {
    const cell = grid.features[i];
    const centroid = cell.properties.centroid;
    if (!centroid) continue;

    let minDist = Infinity;

    for (const river of riverFeatures) {
      if (river.geometry.type === 'LineString') {
        try {
          const pt = turf.point(centroid);
          const dist = turf.pointToLineDistance(pt, river, { units: 'meters' });
          if (dist < minDist) minDist = dist;
        } catch (e) {
          continue;
        }
      }
    }

    if (minDist !== Infinity && minDist < 50000) {
      cell.properties.metrics.dist_river_m = Math.round(minDist);
      cell.properties.coverage.rivers = true;
      allDistances.push(minDist);
    }

    if (i % 500 === 0) process.stdout.write(`\r   Rivers: ${i}/${grid.features.length} cells`);
  }
  console.log(`\r   Rivers: ${grid.features.length} cells processed`);

  if (allDistances.length > 0) {
    const sortedDistances = [...allDistances].sort((a: number, b: number) => a - b);
    for (const cell of grid.features) {
      if (cell.properties.metrics.dist_river_m !== null) {
        const rank = sortedDistances.findIndex((d: number) => d >= cell.properties.metrics.dist_river_m);
        cell.properties.metrics.river_prox_pct = 1 - (rank / sortedDistances.length);
      }
    }
  }

  return grid;
}

function computeLandcoverMetrics(grid: any, landcoverData: any): any {
  if (!landcoverData?.geoJson?.features) return grid;

  const builtFeatures = landcoverData.geoJson.features.filter(
    (f: any) => {
      const props = f.properties || {};
      const lc = props.landcover_class || '';
      return (props.landuse === 'residential' || props.landuse === 'commercial' || 
              props.landuse === 'industrial' || props.landuse === 'retail' ||
              props.building || props.highway || lc === 'built_up') &&
             (f.geometry?.type === 'Polygon' || f.geometry?.type === 'MultiPolygon');
    }
  );

  const greenFeatures = landcoverData.geoJson.features.filter(
    (f: any) => {
      const props = f.properties || {};
      const lc = props.landcover_class || '';
      return (props.natural === 'wood' || props.natural === 'scrub' || 
              props.natural === 'grassland' || props.landuse === 'forest' ||
              props.landuse === 'grass' || props.leisure === 'park' ||
              lc === 'tree_cover' || lc === 'shrubland' || lc === 'grassland') &&
             (f.geometry?.type === 'Polygon' || f.geometry?.type === 'MultiPolygon');
    }
  );

  const croplandFeatures = landcoverData.geoJson.features.filter(
    (f: any) => {
      const props = f.properties || {};
      const lc = props.landcover_class || '';
      return (lc === 'cropland' || props.landuse === 'farmland' || 
              props.landuse === 'orchard' || props.landuse === 'vineyard') &&
             (f.geometry?.type === 'Polygon' || f.geometry?.type === 'MultiPolygon');
    }
  );

  const wetlandFeatures = landcoverData.geoJson.features.filter(
    (f: any) => {
      const props = f.properties || {};
      const lc = props.landcover_class || '';
      return (lc === 'wetland' || props.natural === 'wetland' || props.natural === 'marsh') &&
             (f.geometry?.type === 'Polygon' || f.geometry?.type === 'MultiPolygon');
    }
  );

  console.log(`   Landcover features: built=${builtFeatures.length}, green=${greenFeatures.length}, crop=${croplandFeatures.length}, wetland=${wetlandFeatures.length}`);

  for (let i = 0; i < grid.features.length; i++) {
    const cell = grid.features[i];
    const centroid = cell.properties.centroid;
    if (!centroid) continue;

    let isBuilt = false;
    let isGreen = false;
    let isCropland = false;
    let isWetland = false;

    for (const feature of builtFeatures) {
      try {
        const pt = turf.point(centroid);
        if (turf.booleanPointInPolygon(pt, feature)) {
          isBuilt = true;
          break;
        }
      } catch (e) { continue; }
    }

    for (const feature of greenFeatures) {
      try {
        const pt = turf.point(centroid);
        if (turf.booleanPointInPolygon(pt, feature)) {
          isGreen = true;
          break;
        }
      } catch (e) { continue; }
    }

    for (const feature of croplandFeatures) {
      try {
        const pt = turf.point(centroid);
        if (turf.booleanPointInPolygon(pt, feature)) {
          isCropland = true;
          break;
        }
      } catch (e) { continue; }
    }

    for (const feature of wetlandFeatures) {
      try {
        const pt = turf.point(centroid);
        if (turf.booleanPointInPolygon(pt, feature)) {
          isWetland = true;
          break;
        }
      } catch (e) { continue; }
    }

    if (isBuilt) {
      cell.properties.metrics.imperv_pct = Math.max(cell.properties.metrics.imperv_pct || 0, 0.8);
      cell.properties.coverage.landcover = true;
    }
    if (isGreen) {
      cell.properties.metrics.green_pct = Math.max(cell.properties.metrics.green_pct || 0, 0.7);
      cell.properties.coverage.landcover = true;
    }
    if (isCropland) {
      cell.properties.metrics.green_pct = Math.max(cell.properties.metrics.green_pct || 0, 0.3);
      cell.properties.coverage.landcover = true;
    }
    if (isWetland) {
      cell.properties.coverage.landcover = true;
    }

    if (i % 200 === 0) process.stdout.write(`\r   Landcover: ${i}/${grid.features.length} cells`);
  }
  console.log(`\r   Landcover: ${grid.features.length} cells processed`);

  return grid;
}

function computeSurfaceWaterMetrics(grid: any, surfaceWaterData: any): any {
  if (!surfaceWaterData?.geoJson?.features) return grid;

  const waterFeatures = surfaceWaterData.geoJson.features.filter(
    (f: any) => f.geometry?.type === 'Polygon' || f.geometry?.type === 'MultiPolygon'
  );

  if (waterFeatures.length === 0) return grid;

  const allDistances: number[] = [];

  for (let i = 0; i < grid.features.length; i++) {
    const cell = grid.features[i];
    const centroid = cell.properties.centroid;
    if (!centroid) continue;

    let minDist = Infinity;
    let insideWater = false;

    for (const water of waterFeatures) {
      try {
        const pt = turf.point(centroid);
        if (turf.booleanPointInPolygon(pt, water)) {
          insideWater = true;
          minDist = 0;
          break;
        }
        const boundary = turf.polygonToLine(water) as any;
        if (boundary.geometry?.type === 'LineString') {
          const dist = turf.pointToLineDistance(pt, boundary as any, { units: 'meters' });
          if (dist < minDist) minDist = dist;
        } else if (boundary.geometry?.type === 'MultiLineString') {
          for (const coords of boundary.geometry.coordinates) {
            const line = turf.lineString(coords);
            const dist = turf.pointToLineDistance(pt, line, { units: 'meters' });
            if (dist < minDist) minDist = dist;
          }
        }
      } catch (e) { continue; }
    }

    if (minDist !== Infinity && minDist < 50000) {
      cell.properties.metrics.dist_water_m = Math.round(minDist);
      cell.properties.coverage.surface_water = true;
      allDistances.push(minDist);
    }

    if (i % 200 === 0) process.stdout.write(`\r   Surface Water: ${i}/${grid.features.length} cells`);
  }
  console.log(`\r   Surface Water: ${grid.features.length} cells processed`);

  if (allDistances.length > 0) {
    const sortedDistances = [...allDistances].sort((a: number, b: number) => a - b);
    for (const cell of grid.features) {
      if (cell.properties.metrics.dist_water_m !== null) {
        const rank = sortedDistances.findIndex((d: number) => d >= cell.properties.metrics.dist_water_m);
        cell.properties.metrics.floodplain_adj_pct = 1 - (rank / sortedDistances.length);
      }
    }
  }

  return grid;
}

function computeForestMetrics(grid: any, forestData: any): any {
  if (!forestData?.geoJson?.features) return grid;

  const forestFeatures = forestData.geoJson.features.filter(
    (f: any) => f.geometry?.type === 'Polygon' || f.geometry?.type === 'MultiPolygon'
  );

  for (let i = 0; i < grid.features.length; i++) {
    const cell = grid.features[i];
    const centroid = cell.properties.centroid;
    if (!centroid) continue;

    let minDist = Infinity;

    for (const feature of forestFeatures) {
      try {
        const pt = turf.point(centroid);
        if (turf.booleanPointInPolygon(pt, feature)) {
          minDist = 0;
          break;
        }
      } catch (e) {
        continue;
      }
    }

    if (minDist === 0) {
      cell.properties.metrics.canopy_pct = 1;
      cell.properties.coverage.forest = true;
    } else {
      cell.properties.metrics.canopy_pct = 0;
    }

    if (i % 200 === 0) process.stdout.write(`\r   Forest: ${i}/${grid.features.length} cells`);
  }
  console.log(`\r   Forest: ${grid.features.length} cells processed`);

  return grid;
}

function computePopulationMetrics(grid: any, populationData: any): any {
  if (!populationData?.geoJson?.features) return grid;

  const popFeatures = populationData.geoJson.features.filter(
    (f: any) => f.geometry?.type === 'Polygon' || f.geometry?.type === 'MultiPolygon'
  );

  for (let i = 0; i < grid.features.length; i++) {
    const cell = grid.features[i];
    const centroid = cell.properties.centroid;
    if (!centroid) continue;

    let isResidential = false;

    for (const feature of popFeatures) {
      try {
        const pt = turf.point(centroid);
        if (turf.booleanPointInPolygon(pt, feature)) {
          isResidential = true;
          break;
        }
      } catch (e) {
        continue;
      }
    }

    if (isResidential) {
      cell.properties.metrics.built_pct = 0.7;
      cell.properties.coverage.population = true;
    }

    if (i % 200 === 0) process.stdout.write(`\r   Population OSM: ${i}/${grid.features.length} cells`);
  }
  console.log(`\r   Population OSM: ${grid.features.length} cells processed`);

  return grid;
}

function computeWorldPopMetrics(grid: any, worldPopData: any): any {
  if (!worldPopData?.data || !worldPopData?.bounds) return grid;

  const { data, bounds, gridSize, stats } = worldPopData;
  const maxPop = stats?.max || 10000;
  const cellWidthDeg = (bounds.maxLng - bounds.minLng) / gridSize.width;
  const cellHeightDeg = (bounds.maxLat - bounds.minLat) / gridSize.height;

  for (let i = 0; i < grid.features.length; i++) {
    const cell = grid.features[i];
    const bbox = turf.bbox(cell);
    const [minLng, minLat, maxLng, maxLat] = bbox;

    const colStart = Math.max(0, Math.floor((minLng - bounds.minLng) / cellWidthDeg));
    const colEnd = Math.min(gridSize.width - 1, Math.floor((maxLng - bounds.minLng) / cellWidthDeg));
    const rowStart = Math.max(0, Math.floor((bounds.maxLat - maxLat) / cellHeightDeg));
    const rowEnd = Math.min(gridSize.height - 1, Math.floor((bounds.maxLat - minLat) / cellHeightDeg));

    let sum = 0;
    let count = 0;

    for (let row = rowStart; row <= rowEnd; row++) {
      for (let col = colStart; col <= colEnd; col++) {
        if (data[row] && data[row][col] !== undefined && data[row][col] > 0) {
          sum += data[row][col];
          count++;
        }
      }
    }

    if (count > 0) {
      const popDensityRaw = sum / count;
      cell.properties.metrics.pop_density_raw = popDensityRaw;
      cell.properties.metrics.pop_density = Math.min(1, popDensityRaw / maxPop);
      cell.properties.coverage.population = true;
    }

    if (i % 200 === 0) process.stdout.write(`\r   WorldPop: ${i}/${grid.features.length} cells`);
  }
  console.log(`\r   WorldPop: ${grid.features.length} cells processed`);

  return grid;
}

function computeBuildingDensityMetrics(grid: any, builtUpData: any): any {
  if (!builtUpData?.data || !builtUpData?.bounds) return grid;

  const { data, bounds, gridSize } = builtUpData;
  const cellWidthDeg = (bounds.maxLng - bounds.minLng) / gridSize.width;
  const cellHeightDeg = (bounds.maxLat - bounds.minLat) / gridSize.height;

  for (let i = 0; i < grid.features.length; i++) {
    const cell = grid.features[i];
    const bbox = turf.bbox(cell);
    const [minLng, minLat, maxLng, maxLat] = bbox;

    const colStart = Math.max(0, Math.floor((minLng - bounds.minLng) / cellWidthDeg));
    const colEnd = Math.min(gridSize.width - 1, Math.floor((maxLng - bounds.minLng) / cellWidthDeg));
    const rowStart = Math.max(0, Math.floor((bounds.maxLat - maxLat) / cellHeightDeg));
    const rowEnd = Math.min(gridSize.height - 1, Math.floor((bounds.maxLat - minLat) / cellHeightDeg));

    let sum = 0;
    let count = 0;

    for (let row = rowStart; row <= rowEnd; row++) {
      for (let col = colStart; col <= colEnd; col++) {
        if (data[row] && data[row][col] !== undefined) {
          sum += data[row][col];
          count++;
        }
      }
    }

    if (count > 0) {
      const buildingDensity = sum / count;
      cell.properties.metrics.building_density = buildingDensity / 100;
      cell.properties.metrics.imperv_pct = Math.max(
        cell.properties.metrics.imperv_pct || 0,
        buildingDensity / 100
      );
      cell.properties.coverage.buildings = true;
    }

    if (i % 200 === 0) process.stdout.write(`\r   Buildings: ${i}/${grid.features.length} cells`);
  }
  console.log(`\r   Buildings: ${grid.features.length} cells processed`);

  return grid;
}

function computeCompositeScores(grid: any): any {
  for (const cell of grid.features) {
    const m = cell.properties.metrics;

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

    m.flood_score = Math.round((
      0.25 * flowAccumPct +
      0.15 * depressionPct +
      0.20 * riverProx +
      0.10 * waterProx +
      0.15 * lowLying +
      0.10 * imperv +
      0.05 * flatness
    ) * 100) / 100;

    m.heat_score = Math.round((
      0.35 * buildingDensity +
      0.25 * popDensity +
      0.25 * (1 - vegetation) +
      0.15 * (1 - waterCooling)
    ) * 100) / 100;

    const slopeRisk = Math.min(1, slope / 20);
    const lackOfVeg = 1 - vegetation;
    const elevated = 1 - lowLying;
    m.landslide_score = Math.round((
      0.55 * slopeRisk +
      0.25 * lackOfVeg +
      0.20 * elevated
    ) * 100) / 100;
  }

  return grid;
}

function calculateCoverageSummary(grid: any): { [key: string]: number } {
  const totalCells = grid.features.length;
  if (totalCells === 0) return { elevation: 0, flow: 0, landcover: 0, surface_water: 0, rivers: 0, forest: 0, population: 0, buildings: 0 };

  const counts = { elevation: 0, flow: 0, landcover: 0, surface_water: 0, rivers: 0, forest: 0, population: 0, buildings: 0 };

  for (const cell of grid.features) {
    const cov = cell.properties.coverage;
    if (cov.elevation) counts.elevation++;
    if (cov.flow) counts.flow++;
    if (cov.landcover) counts.landcover++;
    if (cov.surface_water) counts.surface_water++;
    if (cov.rivers) counts.rivers++;
    if (cov.forest) counts.forest++;
    if (cov.population) counts.population++;
    if (cov.buildings) counts.buildings++;
  }

  return {
    elevation: Math.round((counts.elevation / totalCells) * 100),
    flow: Math.round((counts.flow / totalCells) * 100),
    landcover: Math.round((counts.landcover / totalCells) * 100),
    surface_water: Math.round((counts.surface_water / totalCells) * 100),
    rivers: Math.round((counts.rivers / totalCells) * 100),
    forest: Math.round((counts.forest / totalCells) * 100),
    population: Math.round((counts.population / totalCells) * 100),
    buildings: Math.round((counts.buildings / totalCells) * 100),
  };
}

async function main() {
  console.log('🔲 Generating sample grid for Porto Alegre...');
  console.log(`   Cell size: ${CELL_SIZE_METERS}m`);
  console.log(`   Bounds: ${JSON.stringify(PORTO_ALEGRE_BOUNDS)}`);

  let grid = generateGrid(PORTO_ALEGRE_BOUNDS, CELL_SIZE_METERS);
  console.log(`   Generated ${grid.features.length} cells`);

  console.log('\n📊 Loading sample data...');
  const elevationData = await loadSampleData('porto-alegre-elevation.json');
  const landcoverData = await loadSampleData('porto-alegre-landcover.json');
  const surfaceWaterData = await loadSampleData('porto-alegre-surface-water.json');
  const riversData = await loadSampleData('porto-alegre-rivers.json');
  const forestData = await loadSampleData('porto-alegre-forest.json');
  const populationData = await loadSampleData('porto-alegre-population.json');
  const worldPopData = await loadSampleData('porto-alegre-population-worldpop.json');
  const builtUpData = await loadSampleData('porto-alegre-builtup.json');

  console.log('\n🧮 Computing metrics...');
  if (elevationData) grid = computeElevationMetrics(grid, elevationData);
  if (landcoverData) grid = computeLandcoverMetrics(grid, landcoverData);
  if (surfaceWaterData) grid = computeSurfaceWaterMetrics(grid, surfaceWaterData);
  if (riversData) grid = computeRiverMetrics(grid, riversData);
  if (forestData) grid = computeForestMetrics(grid, forestData);
  if (populationData) grid = computePopulationMetrics(grid, populationData);
  if (worldPopData) grid = computeWorldPopMetrics(grid, worldPopData);
  if (builtUpData) grid = computeBuildingDensityMetrics(grid, builtUpData);

  console.log('\n📈 Computing composite scores...');
  grid = computeCompositeScores(grid);

  const coverage = calculateCoverageSummary(grid);
  console.log(`\n📊 Coverage summary:`);
  console.log(`   Elevation: ${coverage.elevation}%`);
  console.log(`   Flow (D8): ${coverage.flow}%`);
  console.log(`   Landcover: ${coverage.landcover}%`);
  console.log(`   Surface Water: ${coverage.surface_water}%`);
  console.log(`   Rivers: ${coverage.rivers}%`);
  console.log(`   Forest: ${coverage.forest}%`);
  console.log(`   Population (WorldPop): ${coverage.population}%`);
  console.log(`   Buildings (OSM): ${coverage.buildings}%`);

  const result = {
    cityLocode: 'BR POA',
    bounds: PORTO_ALEGRE_BOUNDS,
    cellSizeMeters: CELL_SIZE_METERS,
    totalCells: grid.features.length,
    coverage,
    geoJson: grid,
    metadata: {
      generatedAt: new Date().toISOString(),
      version: '1.0',
    },
  };

  const outputPath = path.join(OUTPUT_DIR, 'porto-alegre-grid.json');
  const json = JSON.stringify(result);
  fs.writeFileSync(outputPath, json);
  const sizeMB = (Buffer.byteLength(json) / 1024 / 1024).toFixed(2);
  console.log(`\n✅ Saved ${outputPath} (${sizeMB} MB)`);
}

main().catch(console.error);

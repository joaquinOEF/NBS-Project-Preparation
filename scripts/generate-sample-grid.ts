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
        dist_river_m: null,
        river_prox_pct: null,
        dist_water_m: null,
        floodplain_adj_pct: null,
        imperv_pct: null,
        green_pct: null,
        canopy_pct: null,
        built_pct: null,
        pop_density: null,
        flood_score: null,
        heat_score: null,
        landslide_score: null,
      },
      coverage: {
        elevation: false,
        landcover: false,
        surface_water: false,
        rivers: false,
        forest: false,
        population: false,
      },
    };
  });

  return grid;
}

function computeElevationMetrics(grid: any, elevationData: any): any {
  if (!elevationData?.contours?.features) return grid;

  const contourLines = elevationData.contours.features;
  const cellElevations: Map<number, number[]> = new Map();

  for (let i = 0; i < grid.features.length; i++) {
    const cell = grid.features[i];
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
      cell.properties.coverage.elevation = true;
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
      cell.properties.metrics.pop_density = 0.7;
      cell.properties.coverage.population = true;
    } else {
      cell.properties.metrics.built_pct = 0;
      cell.properties.metrics.pop_density = 0;
    }

    if (i % 200 === 0) process.stdout.write(`\r   Population: ${i}/${grid.features.length} cells`);
  }
  console.log(`\r   Population: ${grid.features.length} cells processed`);

  return grid;
}

function computeCompositeScores(grid: any): any {
  for (const cell of grid.features) {
    const m = cell.properties.metrics;

    const A = m.river_prox_pct ?? 0;
    const E = m.low_lying_pct ?? 0;
    const I = m.built_pct ?? 0;
    const R = m.river_prox_pct ?? 0;
    const C = m.canopy_pct ?? 0;
    const P = m.pop_density ?? 0;

    m.flood_score = Math.round((0.45 * A + 0.20 * E + 0.20 * I + 0.15 * R) * 100) / 100;
    m.heat_score = Math.round((0.45 * I + 0.35 * P + 0.20 * (1 - C)) * 100) / 100;
    m.landslide_score = 0;
  }

  return grid;
}

function calculateCoverageSummary(grid: any): { [key: string]: number } {
  const totalCells = grid.features.length;
  if (totalCells === 0) return { elevation: 0, rivers: 0, forest: 0, population: 0 };

  const counts = { elevation: 0, rivers: 0, forest: 0, population: 0 };

  for (const cell of grid.features) {
    const cov = cell.properties.coverage;
    if (cov.elevation) counts.elevation++;
    if (cov.rivers) counts.rivers++;
    if (cov.forest) counts.forest++;
    if (cov.population) counts.population++;
  }

  return {
    elevation: Math.round((counts.elevation / totalCells) * 100),
    rivers: Math.round((counts.rivers / totalCells) * 100),
    forest: Math.round((counts.forest / totalCells) * 100),
    population: Math.round((counts.population / totalCells) * 100),
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
  const riversData = await loadSampleData('porto-alegre-rivers.json');
  const forestData = await loadSampleData('porto-alegre-forest.json');
  const populationData = await loadSampleData('porto-alegre-population.json');

  console.log('\n🧮 Computing metrics...');
  if (elevationData) grid = computeElevationMetrics(grid, elevationData);
  if (riversData) grid = computeRiverMetrics(grid, riversData);
  if (forestData) grid = computeForestMetrics(grid, forestData);
  if (populationData) grid = computePopulationMetrics(grid, populationData);

  console.log('\n📈 Computing composite scores...');
  grid = computeCompositeScores(grid);

  const coverage = calculateCoverageSummary(grid);
  console.log(`\n📊 Coverage summary:`);
  console.log(`   Elevation: ${coverage.elevation}%`);
  console.log(`   Rivers: ${coverage.rivers}%`);
  console.log(`   Forest: ${coverage.forest}%`);
  console.log(`   Population: ${coverage.population}%`);

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

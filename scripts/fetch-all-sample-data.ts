import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import osmtogeojson from 'osmtogeojson';
import * as turf from '@turf/turf';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORTO_ALEGRE_BOUNDS = {
  minLng: -51.27,
  minLat: -30.27,
  maxLng: -51.01,
  maxLat: -29.93,
};

const PORTO_ALEGRE_LOCODE = 'BR POA';

const OUTPUT_DIR = path.join(__dirname, '..', 'client', 'public', 'sample-data');

async function fetchFromOverpass(query: string, retries = 3): Promise<any> {
  console.log('Fetching from Overpass API...');
  
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const response = await fetch('https://overpass-api.de/api/interpreter', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: `data=${encodeURIComponent(query)}`,
      });

      if (!response.ok) {
        if (response.status === 429 || response.status === 504) {
          console.log(`   Retry ${attempt}/${retries} after rate limit/timeout...`);
          await new Promise(r => setTimeout(r, 5000 * attempt));
          continue;
        }
        throw new Error(`Overpass API error: ${response.status}`);
      }

      return response.json();
    } catch (error: any) {
      if (attempt === retries) throw error;
      console.log(`   Retry ${attempt}/${retries} after error: ${error.message}`);
      await new Promise(r => setTimeout(r, 5000 * attempt));
    }
  }
}

async function fetchLandcover(): Promise<any> {
  console.log('\n🌍 Fetching land cover data...');
  const query = `
    [out:json][timeout:180];
    (
      way["landuse"~"residential|commercial|industrial|forest|meadow|farmland"](${PORTO_ALEGRE_BOUNDS.minLat},${PORTO_ALEGRE_BOUNDS.minLng},${PORTO_ALEGRE_BOUNDS.maxLat},${PORTO_ALEGRE_BOUNDS.maxLng});
      way["natural"~"wood|water|wetland|grassland|scrub"](${PORTO_ALEGRE_BOUNDS.minLat},${PORTO_ALEGRE_BOUNDS.minLng},${PORTO_ALEGRE_BOUNDS.maxLat},${PORTO_ALEGRE_BOUNDS.maxLng});
    );
    out geom;
  `;

  const osmData = await fetchFromOverpass(query);
  const geoJson = osmtogeojson(osmData);

  const classes = categorizeLandcover(geoJson);

  return {
    cityLocode: PORTO_ALEGRE_LOCODE,
    bounds: PORTO_ALEGRE_BOUNDS,
    classes,
    geoJson,
    metadata: {
      source: 'OpenStreetMap',
      resolution: 10,
      fetchedAt: new Date().toISOString(),
    },
  };
}

function categorizeLandcover(geoJson: any) {
  const counts = {
    builtUp: 0,
    trees: 0,
    shrubland: 0,
    grassland: 0,
    cropland: 0,
    bareVegetation: 0,
    water: 0,
    wetland: 0,
    mangroves: 0,
    moss: 0,
    snowIce: 0,
  };

  for (const feature of geoJson.features || []) {
    const props = feature.properties || {};
    const landuse = props.landuse || '';
    const natural = props.natural || '';

    if (landuse === 'residential' || landuse === 'commercial' || landuse === 'industrial' || landuse === 'retail') {
      counts.builtUp++;
    } else if (landuse === 'forest' || natural === 'wood' || natural === 'tree') {
      counts.trees++;
    } else if (natural === 'scrub' || natural === 'heath') {
      counts.shrubland++;
    } else if (landuse === 'grass' || natural === 'grassland' || landuse === 'meadow') {
      counts.grassland++;
    } else if (landuse === 'farmland' || landuse === 'orchard' || landuse === 'vineyard') {
      counts.cropland++;
    } else if (natural === 'bare_rock' || natural === 'sand' || natural === 'scree') {
      counts.bareVegetation++;
    } else if (natural === 'water' || landuse === 'reservoir' || landuse === 'basin') {
      counts.water++;
    } else if (natural === 'wetland' || landuse === 'wetland') {
      counts.wetland++;
    }
  }

  return counts;
}

async function fetchSurfaceWater(): Promise<any> {
  console.log('\n💧 Fetching surface water data...');
  const query = `
    [out:json][timeout:180];
    (
      way["natural"="water"](${PORTO_ALEGRE_BOUNDS.minLat},${PORTO_ALEGRE_BOUNDS.minLng},${PORTO_ALEGRE_BOUNDS.maxLat},${PORTO_ALEGRE_BOUNDS.maxLng});
      way["water"](${PORTO_ALEGRE_BOUNDS.minLat},${PORTO_ALEGRE_BOUNDS.minLng},${PORTO_ALEGRE_BOUNDS.maxLat},${PORTO_ALEGRE_BOUNDS.maxLng});
    );
    out geom;
  `;

  const osmData = await fetchFromOverpass(query);
  const geoJson = osmtogeojson(osmData);

  let permanent = 0, seasonal = 0, ephemeral = 0;
  for (const feature of geoJson.features || []) {
    const props = feature.properties || {};
    if (props.intermittent === 'yes' || props.seasonal === 'yes') {
      seasonal++;
    } else if (props.water === 'intermittent' || props.water === 'ephemeral') {
      ephemeral++;
    } else {
      permanent++;
    }
  }

  return {
    cityLocode: PORTO_ALEGRE_LOCODE,
    bounds: PORTO_ALEGRE_BOUNDS,
    occurrence: { permanent, seasonal, ephemeral },
    geoJson,
    metadata: {
      source: 'OpenStreetMap',
      resolution: 10,
      fetchedAt: new Date().toISOString(),
    },
  };
}

async function fetchRivers(): Promise<any> {
  console.log('\n🌊 Fetching rivers data...');
  const query = `
    [out:json][timeout:180];
    (
      way["waterway"~"river|stream|canal"](${PORTO_ALEGRE_BOUNDS.minLat},${PORTO_ALEGRE_BOUNDS.minLng},${PORTO_ALEGRE_BOUNDS.maxLat},${PORTO_ALEGRE_BOUNDS.maxLng});
    );
    out geom;
  `;

  const osmData = await fetchFromOverpass(query);
  const geoJson = osmtogeojson(osmData);

  let totalLengthKm = 0;
  const riverNames = new Set<string>();

  for (const feature of geoJson.features || []) {
    if (feature.geometry?.type === 'LineString' || feature.geometry?.type === 'MultiLineString') {
      try {
        totalLengthKm += turf.length(feature, { units: 'kilometers' });
      } catch (e) {}
    }
    const name = feature.properties?.name;
    if (name && feature.properties?.waterway === 'river') {
      riverNames.add(name);
    }
  }

  return {
    cityLocode: PORTO_ALEGRE_LOCODE,
    bounds: PORTO_ALEGRE_BOUNDS,
    totalLengthKm,
    majorRivers: Array.from(riverNames).slice(0, 10),
    geoJson,
    metadata: {
      source: 'OpenStreetMap',
      resolution: 10,
      fetchedAt: new Date().toISOString(),
    },
  };
}

async function fetchForestCanopy(): Promise<any> {
  console.log('\n🌲 Fetching forest canopy data...');
  const query = `
    [out:json][timeout:180];
    (
      way["natural"="wood"](${PORTO_ALEGRE_BOUNDS.minLat},${PORTO_ALEGRE_BOUNDS.minLng},${PORTO_ALEGRE_BOUNDS.maxLat},${PORTO_ALEGRE_BOUNDS.maxLng});
      way["landuse"="forest"](${PORTO_ALEGRE_BOUNDS.minLat},${PORTO_ALEGRE_BOUNDS.minLng},${PORTO_ALEGRE_BOUNDS.maxLat},${PORTO_ALEGRE_BOUNDS.maxLng});
    );
    out geom;
  `;

  const osmData = await fetchFromOverpass(query);
  const geoJson = osmtogeojson(osmData);

  const bboxPolygon = turf.bboxPolygon([
    PORTO_ALEGRE_BOUNDS.minLng,
    PORTO_ALEGRE_BOUNDS.minLat,
    PORTO_ALEGRE_BOUNDS.maxLng,
    PORTO_ALEGRE_BOUNDS.maxLat,
  ]);
  const totalArea = turf.area(bboxPolygon);

  let forestArea = 0;
  for (const feature of geoJson.features || []) {
    if (feature.geometry?.type === 'Polygon' || feature.geometry?.type === 'MultiPolygon') {
      try {
        forestArea += turf.area(feature);
      } catch (e) {}
    }
  }

  const coverPercent = Math.min(100, (forestArea / totalArea) * 100);

  return {
    cityLocode: PORTO_ALEGRE_LOCODE,
    bounds: PORTO_ALEGRE_BOUNDS,
    canopyCover: {
      mean: coverPercent,
      min: 0,
      max: 100,
    },
    geoJson,
    metadata: {
      source: 'OpenStreetMap',
      resolution: 10,
      fetchedAt: new Date().toISOString(),
    },
  };
}

async function fetchPopulation(): Promise<any> {
  console.log('\n👥 Fetching population proxy data...');
  const query = `
    [out:json][timeout:180];
    (
      way["landuse"="residential"](${PORTO_ALEGRE_BOUNDS.minLat},${PORTO_ALEGRE_BOUNDS.minLng},${PORTO_ALEGRE_BOUNDS.maxLat},${PORTO_ALEGRE_BOUNDS.maxLng});
    );
    out geom;
  `;

  const osmData = await fetchFromOverpass(query);
  const geoJson = osmtogeojson(osmData);

  let buildingCount = 0, apartmentCount = 0;
  for (const feature of geoJson.features || []) {
    const props = feature.properties || {};
    if (props.building === 'apartments') {
      apartmentCount++;
    } else if (props.building) {
      buildingCount++;
    }
  }

  const latSpan = PORTO_ALEGRE_BOUNDS.maxLat - PORTO_ALEGRE_BOUNDS.minLat;
  const lngSpan = PORTO_ALEGRE_BOUNDS.maxLng - PORTO_ALEGRE_BOUNDS.minLng;
  const avgLat = (PORTO_ALEGRE_BOUNDS.minLat + PORTO_ALEGRE_BOUNDS.maxLat) / 2;
  const metersPerDegreeLat = 111320;
  const metersPerDegreeLng = 111320 * Math.cos(avgLat * Math.PI / 180);
  const areaKm2 = (latSpan * metersPerDegreeLat) * (lngSpan * metersPerDegreeLng) / 1_000_000;

  const estimatedPop = (buildingCount * 3) + (apartmentCount * 30);
  const densityPerSqKm = areaKm2 > 0 ? estimatedPop / areaKm2 : 0;

  return {
    cityLocode: PORTO_ALEGRE_LOCODE,
    bounds: PORTO_ALEGRE_BOUNDS,
    totalPopulation: estimatedPop,
    densityPerSqKm,
    geoJson,
    metadata: {
      source: 'OpenStreetMap (residential proxy)',
      resolution: 100,
      fetchedAt: new Date().toISOString(),
    },
  };
}

function saveData(filename: string, data: any) {
  const filepath = path.join(OUTPUT_DIR, filename);
  const json = JSON.stringify(data);
  fs.writeFileSync(filepath, json);
  const sizeMB = (Buffer.byteLength(json) / 1024 / 1024).toFixed(2);
  console.log(`✅ Saved ${filename} (${sizeMB} MB)`);
}

async function fetchWithRetry(name: string, fetchFn: () => Promise<any>, filename: string): Promise<any> {
  try {
    const data = await fetchFn();
    if (data && data.geoJson) {
      saveData(filename, data);
      return data;
    }
  } catch (error: any) {
    console.error(`   ⚠️ Failed to fetch ${name}: ${error.message}`);
  }
  return null;
}

async function main() {
  console.log('🚀 Fetching all sample data for Porto Alegre...');
  console.log(`Output directory: ${OUTPUT_DIR}`);

  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  const results: Record<string, any> = {};

  results.landcover = await fetchWithRetry('land cover', fetchLandcover, 'porto-alegre-landcover.json');
  if (results.landcover) console.log(`   Features: ${results.landcover.geoJson.features?.length || 0}`);
  await new Promise(r => setTimeout(r, 3000));

  results.surfaceWater = await fetchWithRetry('surface water', fetchSurfaceWater, 'porto-alegre-surface-water.json');
  if (results.surfaceWater) console.log(`   Features: ${results.surfaceWater.geoJson.features?.length || 0}`);
  await new Promise(r => setTimeout(r, 3000));

  results.rivers = await fetchWithRetry('rivers', fetchRivers, 'porto-alegre-rivers.json');
  if (results.rivers) console.log(`   Features: ${results.rivers.geoJson.features?.length || 0}, Total length: ${results.rivers.totalLengthKm?.toFixed(1) || 0} km`);
  await new Promise(r => setTimeout(r, 3000));

  results.forest = await fetchWithRetry('forest canopy', fetchForestCanopy, 'porto-alegre-forest.json');
  if (results.forest) console.log(`   Features: ${results.forest.geoJson.features?.length || 0}, Cover: ${results.forest.canopyCover?.mean?.toFixed(1) || 0}%`);
  await new Promise(r => setTimeout(r, 3000));

  results.population = await fetchWithRetry('population', fetchPopulation, 'porto-alegre-population.json');
  if (results.population) console.log(`   Features: ${results.population.geoJson.features?.length || 0}, Est. population: ${results.population.totalPopulation || 0}`);

  console.log('\n✅ Sample data fetch completed!');
  console.log('\nSummary:');
  console.log(`  - Land cover: ${results.landcover ? results.landcover.geoJson.features?.length || 0 : 'FAILED'} features`);
  console.log(`  - Surface water: ${results.surfaceWater ? results.surfaceWater.geoJson.features?.length || 0 : 'FAILED'} features`);
  console.log(`  - Rivers: ${results.rivers ? `${results.rivers.geoJson.features?.length || 0} features, ${results.rivers.totalLengthKm?.toFixed(1) || 0} km` : 'FAILED'}`);
  console.log(`  - Forest canopy: ${results.forest ? `${results.forest.geoJson.features?.length || 0} features, ${results.forest.canopyCover?.mean?.toFixed(1) || 0}% cover` : 'FAILED'}`);
  console.log(`  - Population proxy: ${results.population ? results.population.geoJson.features?.length || 0 : 'FAILED'} residential features`);
}

main();

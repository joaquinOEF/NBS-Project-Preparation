import * as fs from 'fs';
import * as path from 'path';
import * as turf from '@turf/turf';

const PORTO_ALEGRE_BOUNDS = {
  minLng: -51.32,
  minLat: -30.28,
  maxLng: -50.98,
  maxLat: -29.9,
};

const WORLDCOVER_CLASSES: { [key: number]: { name: string; color: string } } = {
  10: { name: 'Tree cover', color: '#006400' },
  20: { name: 'Shrubland', color: '#ffbb22' },
  30: { name: 'Grassland', color: '#ffff4c' },
  40: { name: 'Cropland', color: '#f096ff' },
  50: { name: 'Built-up', color: '#fa0000' },
  60: { name: 'Bare/sparse', color: '#b4b4b4' },
  70: { name: 'Snow/ice', color: '#f0f0f0' },
  80: { name: 'Water', color: '#0064c8' },
  90: { name: 'Wetland', color: '#0096a0' },
  95: { name: 'Mangroves', color: '#00cf75' },
  100: { name: 'Moss/lichen', color: '#fae6a0' },
};

async function fetchWorldCoverFromOSM() {
  console.log('=== Fetching Land Cover from OSM (alternative to ESA WorldCover) ===');
  console.log('Note: ESA WorldCover GeoTIFF files are very large (>500MB per tile).');
  console.log('Using OSM landuse/natural tags as a proxy for land cover classification.\n');

  const tiles = [
    { minLng: -51.32, minLat: -30.10, maxLng: -51.15, maxLat: -29.90, name: 'NW' },
    { minLng: -51.15, minLat: -30.10, maxLng: -50.98, maxLat: -29.90, name: 'NE' },
    { minLng: -51.32, minLat: -30.28, maxLng: -51.15, maxLat: -30.10, name: 'SW' },
    { minLng: -51.15, minLat: -30.28, maxLng: -50.98, maxLat: -30.10, name: 'SE' },
  ];

  const endpoints = [
    'https://overpass-api.de/api/interpreter',
    'https://overpass.kumi.systems/api/interpreter',
  ];

  let allElements: any[] = [];

  for (const tile of tiles) {
    const bbox = `${tile.minLat},${tile.minLng},${tile.maxLat},${tile.maxLng}`;
    const query = `
      [out:json][timeout:300];
      (
        way["landuse"](${bbox});
        way["natural"](${bbox});
      );
      out geom;
    `;

    console.log(`\nFetching landcover for tile ${tile.name}...`);
    console.log(`  Query area: ${bbox}`);

    let tileData: any = null;

    for (const endpoint of endpoints) {
      try {
        console.log(`  Trying ${endpoint}...`);
        const response = await fetch(endpoint, {
          method: 'POST',
          body: `data=${encodeURIComponent(query)}`,
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          signal: AbortSignal.timeout(300000),
        });

        if (response.ok) {
          tileData = await response.json();
          console.log(`  Success! Fetched ${tileData.elements?.length || 0} elements`);
          break;
        }
      } catch (e: any) {
        console.log(`  Failed: ${e.message}`);
      }
    }

    if (tileData?.elements) {
      allElements = allElements.concat(tileData.elements);
    }

    await new Promise(resolve => setTimeout(resolve, 2000));
  }

  console.log(`\nTotal elements fetched: ${allElements.length}`);

  if (allElements.length === 0) {
    console.log('Failed to fetch land cover data');
    return null;
  }

  const data = { elements: allElements };

  const features: any[] = [];
  const classCounts: { [key: string]: number } = {};

  for (const element of data.elements) {
    if (!element.geometry) continue;

    let landcoverClass = 'unknown';
    const landuse = element.tags?.landuse || '';
    const natural = element.tags?.natural || '';

    if (['forest', 'wood'].includes(landuse) || natural === 'wood') {
      landcoverClass = 'tree_cover';
    } else if (['scrub', 'heath'].includes(landuse) || natural === 'scrub') {
      landcoverClass = 'shrubland';
    } else if (['grass', 'meadow', 'recreation_ground'].includes(landuse) || ['grassland', 'fell'].includes(natural)) {
      landcoverClass = 'grassland';
    } else if (['farmland', 'orchard', 'vineyard', 'plant_nursery'].includes(landuse)) {
      landcoverClass = 'cropland';
    } else if (['residential', 'commercial', 'industrial', 'retail', 'construction', 'railway'].includes(landuse)) {
      landcoverClass = 'built_up';
    } else if (['quarry', 'landfill', 'brownfield'].includes(landuse) || ['bare_rock', 'sand', 'scree'].includes(natural)) {
      landcoverClass = 'bare_sparse';
    } else if (['reservoir', 'basin'].includes(landuse) || ['water', 'bay'].includes(natural)) {
      landcoverClass = 'water';
    } else if (['wetland', 'marsh'].includes(natural) || landuse === 'wetland') {
      landcoverClass = 'wetland';
    } else if (['cemetery', 'allotments', 'farmyard', 'greenhouse_horticulture'].includes(landuse)) {
      landcoverClass = 'cropland';
    } else if (['park', 'village_green', 'garden'].includes(landuse)) {
      landcoverClass = 'grassland';
    } else {
      continue;
    }

    classCounts[landcoverClass] = (classCounts[landcoverClass] || 0) + 1;

    let coords: number[][] = [];
    if (element.type === 'way' && element.geometry) {
      coords = element.geometry.map((p: any) => [p.lon, p.lat]);
      if (coords.length >= 4 && coords[0][0] === coords[coords.length - 1][0] && coords[0][1] === coords[coords.length - 1][1]) {
        features.push({
          type: 'Feature',
          properties: {
            landcover_class: landcoverClass,
            name: element.tags?.name || null,
            source: 'osm',
          },
          geometry: {
            type: 'Polygon',
            coordinates: [coords],
          },
        });
      }
    }
  }

  console.log('\nLand cover class counts:');
  for (const [cls, count] of Object.entries(classCounts)) {
    console.log(`  ${cls}: ${count} features`);
  }

  const geoJson = {
    type: 'FeatureCollection',
    features,
  };

  const result = {
    source: 'OpenStreetMap',
    description: 'Land cover classification derived from OSM landuse and natural tags',
    bounds: PORTO_ALEGRE_BOUNDS,
    classes: WORLDCOVER_CLASSES,
    totalFeatures: features.length,
    classCounts,
    geoJson,
  };

  const outputPath = path.join(process.cwd(), 'client/public/sample-data', 'porto-alegre-landcover.json');
  fs.writeFileSync(outputPath, JSON.stringify(result));
  const sizeMB = (fs.statSync(outputPath).size / 1024 / 1024).toFixed(2);
  console.log(`\nSaved to: ${outputPath} (${sizeMB} MB)`);

  return result;
}

async function main() {
  await fetchWorldCoverFromOSM();
}

main().catch(console.error);

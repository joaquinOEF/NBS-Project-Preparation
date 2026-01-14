import * as fs from 'fs';
import * as path from 'path';
import { GeoBounds, LandcoverData } from '../../shared/geospatial-schema';
import { LayerResult } from './geospatialService';

const WORLDCOVER_BASE_URL = 'https://esa-worldcover.s3.eu-central-1.amazonaws.com';
const CACHE_DIR = './landcover_cache';

export const WORLDCOVER_CLASSES: Record<number, { name: string; category: string; color: string }> = {
  10: { name: 'Tree cover', category: 'vegetation', color: '#006400' },
  20: { name: 'Shrubland', category: 'vegetation', color: '#ffbb22' },
  30: { name: 'Grassland', category: 'vegetation', color: '#ffff4c' },
  40: { name: 'Cropland', category: 'vegetation', color: '#f096ff' },
  50: { name: 'Built-up', category: 'impervious', color: '#fa0000' },
  60: { name: 'Bare / sparse vegetation', category: 'bare', color: '#b4b4b4' },
  70: { name: 'Snow and ice', category: 'other', color: '#f0f0f0' },
  80: { name: 'Permanent water bodies', category: 'water', color: '#0064c8' },
  90: { name: 'Herbaceous wetland', category: 'wetland', color: '#0096a0' },
  95: { name: 'Mangroves', category: 'wetland', color: '#00cf75' },
  100: { name: 'Moss and lichen', category: 'vegetation', color: '#fae6a0' },
};

function ensureCacheDir() {
  if (!fs.existsSync(CACHE_DIR)) {
    fs.mkdirSync(CACHE_DIR, { recursive: true });
  }
}

function getTileId(lat: number, lng: number, version: string = 'v200'): string {
  const latFloor = Math.floor(lat / 3) * 3;
  const lngFloor = Math.floor(lng / 3) * 3;
  const latStr = latFloor >= 0 ? `N${latFloor.toString().padStart(2, '0')}` : `S${Math.abs(latFloor).toString().padStart(2, '0')}`;
  const lngStr = lngFloor >= 0 ? `E${lngFloor.toString().padStart(3, '0')}` : `W${Math.abs(lngFloor).toString().padStart(3, '0')}`;
  return `ESA_WorldCover_10m_2021_${version}_${latStr}${lngStr}_Map`;
}

export async function getLandcoverDataFromOSM(
  cityLocode: string,
  bounds: GeoBounds
): Promise<LayerResult<LandcoverData>> {
  const startTime = Date.now();
  
  const query = `
    [out:json][timeout:60];
    (
      way["landuse"](${bounds.minLat},${bounds.minLng},${bounds.maxLat},${bounds.maxLng});
      way["natural"](${bounds.minLat},${bounds.minLng},${bounds.maxLat},${bounds.maxLng});
      relation["landuse"](${bounds.minLat},${bounds.minLng},${bounds.maxLat},${bounds.maxLng});
      relation["natural"](${bounds.minLat},${bounds.minLng},${bounds.maxLat},${bounds.maxLng});
    );
    out body;
    >;
    out skel qt;
  `;

  console.log(`🌍 Fetching land cover from OSM for ${cityLocode}...`);

  try {
    const response = await fetch('https://overpass-api.de/api/interpreter', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `data=${encodeURIComponent(query)}`,
    });

    if (!response.ok) {
      throw new Error(`Overpass API error: ${response.status}`);
    }

    const osmData = await response.json();
    const osmtogeojson = require('osmtogeojson');
    const geoJson = osmtogeojson(osmData);

    const classes = categorizeLandcover(geoJson);

    const processingTime = Date.now() - startTime;
    console.log(`✅ Land cover fetched in ${processingTime}ms`);

    return {
      cityLocode,
      layerType: 'landcover',
      bounds,
      data: {
        cityLocode,
        bounds,
        classes,
        geoJson,
      },
      geoJson,
      metadata: {
        source: 'OpenStreetMap',
        resolution: 10,
        fetchedAt: new Date().toISOString(),
        processingTime,
      },
    };
  } catch (error: any) {
    console.error('Error fetching land cover:', error);
    throw error;
  }
}

function categorizeLandcover(geoJson: any): LandcoverData['classes'] {
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

export async function getLandcoverData(
  cityLocode: string,
  bounds: GeoBounds
): Promise<LayerResult<LandcoverData>> {
  return getLandcoverDataFromOSM(cityLocode, bounds);
}

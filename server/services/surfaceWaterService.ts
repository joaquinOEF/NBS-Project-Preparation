import { GeoBounds, SurfaceWaterData } from '../../shared/geospatial-schema';
import { LayerResult } from './geospatialService';

export async function getSurfaceWaterFromOSM(
  cityLocode: string,
  bounds: GeoBounds
): Promise<LayerResult<SurfaceWaterData>> {
  const startTime = Date.now();

  const query = `
    [out:json][timeout:60];
    (
      way["natural"="water"](${bounds.minLat},${bounds.minLng},${bounds.maxLat},${bounds.maxLng});
      relation["natural"="water"](${bounds.minLat},${bounds.minLng},${bounds.maxLat},${bounds.maxLng});
      way["water"](${bounds.minLat},${bounds.minLng},${bounds.maxLat},${bounds.maxLng});
      relation["water"](${bounds.minLat},${bounds.minLng},${bounds.maxLat},${bounds.maxLng});
      way["waterway"="riverbank"](${bounds.minLat},${bounds.minLng},${bounds.maxLat},${bounds.maxLng});
    );
    out body;
    >;
    out skel qt;
  `;

  console.log(`💧 Fetching surface water from OSM for ${cityLocode}...`);

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

    const waterStats = analyzeWaterBodies(geoJson);

    const processingTime = Date.now() - startTime;
    console.log(`✅ Surface water fetched in ${processingTime}ms (${geoJson.features?.length || 0} features)`);

    return {
      cityLocode,
      layerType: 'surface_water',
      bounds,
      data: {
        cityLocode,
        bounds,
        occurrence: waterStats,
        waterMask: geoJson,
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
    console.error('Error fetching surface water:', error);
    throw error;
  }
}

function analyzeWaterBodies(geoJson: any): SurfaceWaterData['occurrence'] {
  let permanent = 0;
  let seasonal = 0;
  let ephemeral = 0;

  for (const feature of geoJson.features || []) {
    const props = feature.properties || {};
    const intermittent = props.intermittent;
    const seasonal_prop = props.seasonal;
    const water = props.water;

    if (intermittent === 'yes' || seasonal_prop === 'yes') {
      seasonal++;
    } else if (water === 'intermittent' || water === 'ephemeral') {
      ephemeral++;
    } else {
      permanent++;
    }
  }

  return { permanent, seasonal, ephemeral };
}

export async function getSurfaceWaterData(
  cityLocode: string,
  bounds: GeoBounds
): Promise<LayerResult<SurfaceWaterData>> {
  return getSurfaceWaterFromOSM(cityLocode, bounds);
}

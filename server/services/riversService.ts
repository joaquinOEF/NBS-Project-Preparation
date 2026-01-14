import { GeoBounds, RiverData } from '../../shared/geospatial-schema';
import { LayerResult } from './geospatialService';
import * as turf from '@turf/turf';

export async function getRiversFromOSM(
  cityLocode: string,
  bounds: GeoBounds
): Promise<LayerResult<RiverData>> {
  const startTime = Date.now();

  const query = `
    [out:json][timeout:60];
    (
      way["waterway"="river"](${bounds.minLat},${bounds.minLng},${bounds.maxLat},${bounds.maxLng});
      way["waterway"="stream"](${bounds.minLat},${bounds.minLng},${bounds.maxLat},${bounds.maxLng});
      way["waterway"="canal"](${bounds.minLat},${bounds.minLng},${bounds.maxLat},${bounds.maxLng});
      way["waterway"="drain"](${bounds.minLat},${bounds.minLng},${bounds.maxLat},${bounds.maxLng});
      way["waterway"="ditch"](${bounds.minLat},${bounds.minLng},${bounds.maxLat},${bounds.maxLng});
      relation["waterway"="river"](${bounds.minLat},${bounds.minLng},${bounds.maxLat},${bounds.maxLng});
    );
    out body;
    >;
    out skel qt;
  `;

  console.log(`🌊 Fetching rivers from OSM for ${cityLocode}...`);

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

    const { totalLengthKm, majorRivers } = analyzeRivers(geoJson);

    const processingTime = Date.now() - startTime;
    console.log(`✅ Rivers fetched in ${processingTime}ms (${geoJson.features?.length || 0} features, ${totalLengthKm.toFixed(1)} km)`);

    return {
      cityLocode,
      layerType: 'rivers',
      bounds,
      data: {
        cityLocode,
        bounds,
        rivers: geoJson,
        totalLengthKm,
        majorRivers,
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
    console.error('Error fetching rivers:', error);
    throw error;
  }
}

function analyzeRivers(geoJson: any): { totalLengthKm: number; majorRivers: string[] } {
  let totalLengthKm = 0;
  const riverNames = new Set<string>();

  for (const feature of geoJson.features || []) {
    if (feature.geometry?.type === 'LineString' || feature.geometry?.type === 'MultiLineString') {
      try {
        const length = turf.length(feature, { units: 'kilometers' });
        totalLengthKm += length;
      } catch (e) {
      }
    }

    const name = feature.properties?.name;
    if (name && feature.properties?.waterway === 'river') {
      riverNames.add(name);
    }
  }

  return {
    totalLengthKm,
    majorRivers: Array.from(riverNames).slice(0, 10),
  };
}

export async function getRiversData(
  cityLocode: string,
  bounds: GeoBounds
): Promise<LayerResult<RiverData>> {
  return getRiversFromOSM(cityLocode, bounds);
}

import { GeoBounds, ForestCanopyData } from '../../shared/geospatial-schema';
import { LayerResult } from './geospatialService';

export async function getForestCanopyFromOSM(
  cityLocode: string,
  bounds: GeoBounds
): Promise<LayerResult<ForestCanopyData>> {
  const startTime = Date.now();

  const query = `
    [out:json][timeout:60];
    (
      way["natural"="wood"](${bounds.minLat},${bounds.minLng},${bounds.maxLat},${bounds.maxLng});
      way["landuse"="forest"](${bounds.minLat},${bounds.minLng},${bounds.maxLat},${bounds.maxLng});
      relation["natural"="wood"](${bounds.minLat},${bounds.minLng},${bounds.maxLat},${bounds.maxLng});
      relation["landuse"="forest"](${bounds.minLat},${bounds.minLng},${bounds.maxLat},${bounds.maxLng});
      way["natural"="tree_row"](${bounds.minLat},${bounds.minLng},${bounds.maxLat},${bounds.maxLng});
    );
    out body;
    >;
    out skel qt;
  `;

  console.log(`🌲 Fetching forest canopy from OSM for ${cityLocode}...`);

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

    const canopyCover = estimateCanopyCover(geoJson, bounds);

    const processingTime = Date.now() - startTime;
    console.log(`✅ Forest canopy fetched in ${processingTime}ms (${geoJson.features?.length || 0} features)`);

    return {
      cityLocode,
      layerType: 'forest_canopy',
      bounds,
      data: {
        cityLocode,
        bounds,
        canopyCover,
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
    console.error('Error fetching forest canopy:', error);
    throw error;
  }
}

function estimateCanopyCover(geoJson: any, bounds: GeoBounds): ForestCanopyData['canopyCover'] {
  const features = geoJson.features || [];
  
  if (features.length === 0) {
    return { mean: 0, min: 0, max: 0 };
  }

  const turf = require('@turf/turf');
  const bboxPolygon = turf.bboxPolygon([bounds.minLng, bounds.minLat, bounds.maxLng, bounds.maxLat]);
  const totalArea = turf.area(bboxPolygon);

  let forestArea = 0;
  for (const feature of features) {
    if (feature.geometry?.type === 'Polygon' || feature.geometry?.type === 'MultiPolygon') {
      try {
        const area = turf.area(feature);
        forestArea += area;
      } catch (e) {
      }
    }
  }

  const coverPercent = Math.min(100, (forestArea / totalArea) * 100);

  return {
    mean: coverPercent,
    min: 0,
    max: 100,
  };
}

export async function getForestCanopyData(
  cityLocode: string,
  bounds: GeoBounds
): Promise<LayerResult<ForestCanopyData>> {
  return getForestCanopyFromOSM(cityLocode, bounds);
}

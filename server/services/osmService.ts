import { storage } from '../storage';

const NOMINATIM_URL = "https://nominatim.openstreetmap.org";

interface CityBoundaryResult {
  cityLocode: string;
  cityName: string;
  centroid: [number, number];
  bbox: [number, number, number, number];
  boundaryGeoJson: any;
}

function extractBoundsFromGeoJSON(geometry: any): [number, number, number, number] | null {
  let minLng = Infinity;
  let minLat = Infinity;
  let maxLng = -Infinity;
  let maxLat = -Infinity;
  let foundCoords = false;

  function processCoordinate(coord: [number, number]) {
    const [lng, lat] = coord;
    if (typeof lng === 'number' && typeof lat === 'number' && !isNaN(lng) && !isNaN(lat)) {
      minLng = Math.min(minLng, lng);
      maxLng = Math.max(maxLng, lng);
      minLat = Math.min(minLat, lat);
      maxLat = Math.max(maxLat, lat);
      foundCoords = true;
    }
  }

  function processCoordinates(coords: any) {
    if (!coords) return;
    
    if (Array.isArray(coords)) {
      if (coords.length >= 2 && typeof coords[0] === 'number' && typeof coords[1] === 'number') {
        processCoordinate(coords as [number, number]);
      } else {
        for (const item of coords) {
          processCoordinates(item);
        }
      }
    }
  }

  if (!geometry) return null;

  switch (geometry.type) {
    case 'Point':
      processCoordinate(geometry.coordinates);
      break;
    case 'MultiPoint':
    case 'LineString':
      processCoordinates(geometry.coordinates);
      break;
    case 'MultiLineString':
    case 'Polygon':
      for (const ring of geometry.coordinates || []) {
        processCoordinates(ring);
      }
      break;
    case 'MultiPolygon':
      for (const polygon of geometry.coordinates || []) {
        for (const ring of polygon || []) {
          processCoordinates(ring);
        }
      }
      break;
    case 'GeometryCollection':
      for (const geom of geometry.geometries || []) {
        const bounds = extractBoundsFromGeoJSON(geom);
        if (bounds) {
          minLng = Math.min(minLng, bounds[0]);
          minLat = Math.min(minLat, bounds[1]);
          maxLng = Math.max(maxLng, bounds[2]);
          maxLat = Math.max(maxLat, bounds[3]);
          foundCoords = true;
        }
      }
      break;
  }

  if (!foundCoords) return null;
  
  return [minLng, minLat, maxLng, maxLat];
}

export async function getCityBoundary(cityName: string, cityLocode: string): Promise<CityBoundaryResult> {
  const cached = await storage.getCityBoundaryCache(cityLocode);
  if (cached) {
    console.log(`📍 Using cached boundary for ${cityName}`);
    return {
      cityLocode: cached.cityLocode,
      cityName: cached.cityName,
      centroid: cached.centroid,
      bbox: cached.bbox,
      boundaryGeoJson: cached.boundaryGeoJson,
    };
  }

  console.log(`📍 Fetching boundary for ${cityName} from Nominatim...`);
  
  const params = new URLSearchParams({
    q: cityName,
    format: "json",
    limit: "1",
    polygon_geojson: "1",
    addressdetails: "1",
  });

  const response = await fetch(`${NOMINATIM_URL}/search?${params}`, {
    headers: {
      "User-Agent": "NBSProjectBuilder/1.0 (nbs-project@openearth.org)",
    },
  });

  if (!response.ok) {
    throw new Error(`Nominatim error: ${response.status}`);
  }

  const results = await response.json();
  if (results.length === 0) {
    throw new Error(`City not found: ${cityName}`);
  }

  const result = results[0];
  
  let boundaryGeoJson: any;
  
  if (result.geojson) {
    boundaryGeoJson = {
      type: "Feature",
      properties: { name: result.display_name },
      geometry: result.geojson,
    };
  } else {
    boundaryGeoJson = {
      type: "Feature",
      properties: { name: result.display_name },
      geometry: {
        type: "Polygon",
        coordinates: [[
          [Number(result.boundingbox[2]), Number(result.boundingbox[0])],
          [Number(result.boundingbox[3]), Number(result.boundingbox[0])],
          [Number(result.boundingbox[3]), Number(result.boundingbox[1])],
          [Number(result.boundingbox[2]), Number(result.boundingbox[1])],
          [Number(result.boundingbox[2]), Number(result.boundingbox[0])],
        ]],
      },
    };
  }

  const bbox = extractBoundsFromGeoJSON(boundaryGeoJson.geometry) || [
    Number(result.boundingbox[2]),
    Number(result.boundingbox[0]),
    Number(result.boundingbox[3]),
    Number(result.boundingbox[1]),
  ];

  const boundaryResult: CityBoundaryResult = {
    cityLocode,
    cityName: result.name || result.display_name.split(",")[0],
    centroid: [Number(result.lon), Number(result.lat)],
    bbox: bbox as [number, number, number, number],
    boundaryGeoJson,
  };

  await storage.setCityBoundaryCache({
    cityLocode,
    cityName: boundaryResult.cityName,
    centroid: boundaryResult.centroid,
    bbox: boundaryResult.bbox,
    boundaryGeoJson: boundaryResult.boundaryGeoJson,
  });

  console.log(`✅ Cached boundary for ${cityName}`);
  
  return boundaryResult;
}

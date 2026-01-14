import { GeoBounds, PopulationData } from '../../shared/geospatial-schema';
import { LayerResult, calculateBboxArea } from './geospatialService';

export async function getPopulationFromOSM(
  cityLocode: string,
  bounds: GeoBounds
): Promise<LayerResult<PopulationData>> {
  const startTime = Date.now();

  const query = `
    [out:json][timeout:60];
    (
      way["landuse"="residential"](${bounds.minLat},${bounds.minLng},${bounds.maxLat},${bounds.maxLng});
      way["building"="residential"](${bounds.minLat},${bounds.minLng},${bounds.maxLat},${bounds.maxLng});
      way["building"="apartments"](${bounds.minLat},${bounds.minLng},${bounds.maxLat},${bounds.maxLng});
      way["building"="house"](${bounds.minLat},${bounds.minLng},${bounds.maxLat},${bounds.maxLng});
      relation["landuse"="residential"](${bounds.minLat},${bounds.minLng},${bounds.maxLat},${bounds.maxLng});
    );
    out body;
    >;
    out skel qt;
  `;

  console.log(`👥 Fetching residential areas from OSM for ${cityLocode}...`);

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

    const areaKm2 = calculateBboxArea(bounds);
    const popEstimate = estimatePopulation(geoJson, bounds, areaKm2);

    const processingTime = Date.now() - startTime;
    console.log(`✅ Population proxy fetched in ${processingTime}ms (${geoJson.features?.length || 0} residential features)`);

    return {
      cityLocode,
      layerType: 'population',
      bounds,
      data: {
        cityLocode,
        bounds,
        totalPopulation: popEstimate.totalPopulation,
        densityPerSqKm: popEstimate.densityPerSqKm,
        geoJson,
      },
      geoJson,
      metadata: {
        source: 'OpenStreetMap (residential proxy)',
        resolution: 100,
        fetchedAt: new Date().toISOString(),
        processingTime,
      },
    };
  } catch (error: any) {
    console.error('Error fetching population:', error);
    throw error;
  }
}

function estimatePopulation(
  geoJson: any,
  bounds: GeoBounds,
  areaKm2: number
): { totalPopulation: number; densityPerSqKm: number } {
  const turf = require('@turf/turf');
  const features = geoJson.features || [];

  let residentialArea = 0;
  let buildingCount = 0;
  let apartmentCount = 0;

  for (const feature of features) {
    const props = feature.properties || {};
    
    if (props.building === 'apartments') {
      apartmentCount++;
    } else if (props.building) {
      buildingCount++;
    }

    if (feature.geometry?.type === 'Polygon' || feature.geometry?.type === 'MultiPolygon') {
      try {
        residentialArea += turf.area(feature);
      } catch (e) {
      }
    }
  }

  const avgPeoplePerHouse = 3;
  const avgPeoplePerApartmentBuilding = 30;
  const estimatedPop = (buildingCount * avgPeoplePerHouse) + (apartmentCount * avgPeoplePerApartmentBuilding);

  const densityPerSqKm = areaKm2 > 0 ? estimatedPop / areaKm2 : 0;

  return {
    totalPopulation: estimatedPop,
    densityPerSqKm,
  };
}

export async function getPopulationData(
  cityLocode: string,
  bounds: GeoBounds
): Promise<LayerResult<PopulationData>> {
  return getPopulationFromOSM(cityLocode, bounds);
}

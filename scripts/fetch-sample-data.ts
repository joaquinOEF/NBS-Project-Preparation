import * as fs from 'fs';
import * as path from 'path';

const NOMINATIM_URL = "https://nominatim.openstreetmap.org";

interface NominatimResult {
  place_id: number;
  osm_type: string;
  osm_id: number;
  lat: string;
  lon: string;
  display_name: string;
  boundingbox: [string, string, string, string];
  geojson?: any;
  address?: any;
}

async function fetchPortoAlegreBoundary() {
  console.log("Fetching Porto Alegre boundary from Nominatim...");
  
  const params = new URLSearchParams({
    q: "Porto Alegre, Rio Grande do Sul, Brazil",
    format: "json",
    limit: "1",
    polygon_geojson: "1",
    addressdetails: "1",
  });

  const response = await fetch(`${NOMINATIM_URL}/search?${params}`, {
    headers: {
      "User-Agent": "NBSProjectBuilder/1.0 (climate-planning-tool)",
    },
  });

  if (!response.ok) {
    throw new Error(`Nominatim error: ${response.status}`);
  }

  const results: NominatimResult[] = await response.json();
  
  if (results.length === 0) {
    throw new Error("No results found for Porto Alegre");
  }

  const result = results[0];
  console.log(`Found: ${result.display_name}`);
  console.log(`OSM ID: ${result.osm_type}-${result.osm_id}`);
  console.log(`Centroid: ${result.lon}, ${result.lat}`);
  console.log(`Bounding box: ${result.boundingbox}`);

  let boundaryGeoJson: any;
  
  if (result.geojson) {
    console.log(`Geometry type: ${result.geojson.type}`);
    boundaryGeoJson = {
      type: "Feature",
      properties: { name: result.display_name },
      geometry: result.geojson,
    };
  } else {
    throw new Error("No GeoJSON boundary returned from Nominatim");
  }

  const bbox: [number, number, number, number] = [
    Number(result.boundingbox[2]),
    Number(result.boundingbox[0]),
    Number(result.boundingbox[3]),
    Number(result.boundingbox[1]),
  ];

  const boundaryData = {
    cityLocode: 'BR POA',
    cityName: 'Porto Alegre',
    centroid: [Number(result.lon), Number(result.lat)] as [number, number],
    bbox,
    boundaryGeoJson,
  };

  const outputPath = path.join(process.cwd(), 'scripts', 'porto-alegre-boundary.json');
  fs.writeFileSync(outputPath, JSON.stringify(boundaryData, null, 2));
  console.log(`\nBoundary saved to: ${outputPath}`);
  
  if (result.geojson.type === 'Polygon') {
    console.log(`Polygon coordinates: ${result.geojson.coordinates[0].length} points`);
  } else if (result.geojson.type === 'MultiPolygon') {
    let totalPoints = 0;
    for (const polygon of result.geojson.coordinates) {
      for (const ring of polygon) {
        totalPoints += ring.length;
      }
    }
    console.log(`MultiPolygon coordinates: ${totalPoints} points total`);
  }

  return boundaryData;
}

async function main() {
  try {
    const boundary = await fetchPortoAlegreBoundary();
    console.log("\n=== Boundary Data Summary ===");
    console.log(`City: ${boundary.cityName}`);
    console.log(`Centroid: [${boundary.centroid[0]}, ${boundary.centroid[1]}]`);
    console.log(`BBox: [${boundary.bbox.join(', ')}]`);
  } catch (error) {
    console.error("Error:", error);
    process.exit(1);
  }
}

main();

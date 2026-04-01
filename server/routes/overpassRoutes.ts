import type { Express, Request, Response } from "express";

// ============================================================================
// OVERPASS API — fetches OSM reference features (parks, schools, hospitals, wetlands)
// ============================================================================

interface OverpassQuery {
  id: string;
  label: string;
  query: string; // Overpass QL body (placed inside [bbox] area)
}

// Porto Alegre bounding box: approx -30.27,-51.32 to -29.93,-51.01
const POA_BBOX = "-30.27,-51.32,-29.93,-51.01";
const OVERPASS_URL = "https://overpass-api.de/api/interpreter";

const OSM_QUERIES: OverpassQuery[] = [
  {
    id: "parks",
    label: "Parks & Green Space",
    query: `[out:json][timeout:30][bbox:${POA_BBOX}];(way["leisure"="park"];relation["leisure"="park"];way["leisure"="garden"];way["landuse"="recreation_ground"];);out body geom;`,
  },
  {
    id: "schools",
    label: "Schools & Education",
    query: `[out:json][timeout:30][bbox:${POA_BBOX}];(node["amenity"="school"];way["amenity"="school"];node["amenity"="university"];way["amenity"="university"];);out body geom;`,
  },
  {
    id: "hospitals",
    label: "Hospitals & Health",
    query: `[out:json][timeout:30][bbox:${POA_BBOX}];(node["amenity"="hospital"];way["amenity"="hospital"];node["amenity"="clinic"];way["amenity"="clinic"];);out body geom;`,
  },
  {
    id: "wetlands",
    label: "Wetlands",
    query: `[out:json][timeout:30][bbox:${POA_BBOX}];(way["natural"="wetland"];relation["natural"="wetland"];);out body geom;`,
  },
];

// Simple in-memory cache (Overpass data changes rarely)
const cache = new Map<string, { data: any; timestamp: number }>();
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

function overpassToGeoJSON(overpassData: any): any {
  const features: any[] = [];

  for (const el of overpassData.elements || []) {
    let geometry: any = null;
    const properties: Record<string, any> = {
      osm_id: el.id,
      osm_type: el.type,
      ...el.tags,
    };

    if (el.type === "node" && el.lat != null && el.lon != null) {
      geometry = { type: "Point", coordinates: [el.lon, el.lat] };
    } else if (el.type === "way" && el.geometry) {
      const coords = el.geometry.map((p: any) => [p.lon, p.lat]);
      // Close polygon if first == last
      if (coords.length >= 4 && coords[0][0] === coords[coords.length - 1][0] && coords[0][1] === coords[coords.length - 1][1]) {
        geometry = { type: "Polygon", coordinates: [coords] };
      } else if (coords.length >= 2) {
        geometry = { type: "LineString", coordinates: coords };
      }
    } else if (el.type === "relation" && el.members) {
      // Simplify: extract outer ways as polygons
      const outerCoords: number[][][] = [];
      for (const member of el.members) {
        if (member.role === "outer" && member.geometry) {
          const ring = member.geometry.map((p: any) => [p.lon, p.lat]);
          if (ring.length >= 4) outerCoords.push(ring);
        }
      }
      if (outerCoords.length === 1) {
        geometry = { type: "Polygon", coordinates: outerCoords };
      } else if (outerCoords.length > 1) {
        geometry = { type: "MultiPolygon", coordinates: outerCoords.map(r => [r]) };
      }
    }

    if (geometry) {
      features.push({ type: "Feature", geometry, properties });
    }
  }

  return { type: "FeatureCollection", features };
}

export function registerOverpassRoutes(app: Express): void {
  // GET /api/osm/:layerId — returns GeoJSON for a reference layer
  app.get("/api/osm/:layerId", async (req: Request, res: Response) => {
    const { layerId } = req.params;
    const queryDef = OSM_QUERIES.find((q) => q.id === layerId);

    if (!queryDef) {
      return res.status(404).json({ error: `Unknown OSM layer: ${layerId}` });
    }

    // Check cache
    const cached = cache.get(layerId);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
      res.setHeader("X-Cache", "hit");
      return res.json(cached.data);
    }

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 35000);

      const response = await fetch(OVERPASS_URL, {
        method: "POST",
        body: `data=${encodeURIComponent(queryDef.query)}`,
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        signal: controller.signal,
      });

      clearTimeout(timeout);

      if (!response.ok) {
        return res.status(502).json({ error: `Overpass API returned ${response.status}` });
      }

      const overpassData = await response.json();
      const geojson = overpassToGeoJSON(overpassData);

      // Cache result
      cache.set(layerId, { data: geojson, timestamp: Date.now() });

      res.setHeader("Cache-Control", "public, max-age=3600");
      res.json(geojson);
    } catch (err: any) {
      if (err.name === "AbortError") {
        return res.status(504).json({ error: "Overpass API timeout" });
      }
      res.status(500).json({ error: "Failed to fetch OSM data" });
    }
  });

  // GET /api/osm — list available OSM layers
  app.get("/api/osm", (_req: Request, res: Response) => {
    res.json(OSM_QUERIES.map((q) => ({ id: q.id, label: q.label })));
  });

  console.log(`[osm] Registered ${OSM_QUERIES.length} Overpass reference layers`);
}

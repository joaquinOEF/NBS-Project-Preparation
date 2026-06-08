import type { Express, Request, Response } from "express";
import fs from "fs/promises";
import path from "path";

// ============================================================================
// OVERPASS API — fetches OSM reference features (parks, schools, hospitals, wetlands)
//
// Robustness notes:
// - The public Overpass API rate-limits aggressively and has no SLA. Replit
//   container restarts wipe the in-memory cache, so every cold start hits
//   Overpass fresh — and often gets 429 / 503 / 504.
// - We try multiple mirrors in order, with a small backoff between attempts.
// - On first successful fetch, we persist the GeoJSON to disk so subsequent
//   container starts don't re-hit Overpass at all. OSM features for POA are
//   essentially static at the granularity we use them (parks, schools, etc).
// ============================================================================

interface OverpassQuery {
  id: string;
  label: string;
  query: string; // Overpass QL body (placed inside [bbox] area)
}

// Porto Alegre bounding box: approx -30.27,-51.32 to -29.93,-51.01
const POA_BBOX = "-30.27,-51.32,-29.93,-51.01";

// Public Overpass mirrors, tried in order. If the primary returns a non-200
// (rate limit, overload, timeout), we fall through to the next.
const OVERPASS_MIRRORS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
  "https://overpass.openstreetmap.fr/api/interpreter",
];

// On-disk cache. Survives container restarts. JSON files are small enough
// (1-5 MB per layer for POA) that disk is fine.
const DISK_CACHE_DIR = path.join(process.cwd(), "knowledge", "osm-cache");
const DISK_CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days — OSM is slow-changing

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

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function readDiskCache(layerId: string): Promise<any | null> {
  try {
    const filePath = path.join(DISK_CACHE_DIR, `${layerId}.json`);
    const stat = await fs.stat(filePath);
    // Honour TTL — but be permissive: even stale cache beats a 502.
    const age = Date.now() - stat.mtimeMs;
    const raw = await fs.readFile(filePath, "utf-8");
    const data = JSON.parse(raw);
    if (age > DISK_CACHE_TTL_MS) {
      console.warn(`[osm] disk cache for ${layerId} is stale (${(age / 86400000).toFixed(0)}d old) — serving anyway, background-refresh recommended`);
    }
    return data;
  } catch {
    return null;
  }
}

async function writeDiskCache(layerId: string, data: any): Promise<void> {
  try {
    await fs.mkdir(DISK_CACHE_DIR, { recursive: true });
    const filePath = path.join(DISK_CACHE_DIR, `${layerId}.json`);
    await fs.writeFile(filePath, JSON.stringify(data));
  } catch (e: any) {
    console.error(`[osm] writeDiskCache(${layerId}) failed`, e?.message);
  }
}

export function registerOverpassRoutes(app: Express): void {
  // GET /api/osm/:layerId — returns GeoJSON for a reference layer
  app.get("/api/osm/:layerId", async (req: Request, res: Response) => {
    const { layerId } = req.params;
    const queryDef = OSM_QUERIES.find((q) => q.id === layerId);

    if (!queryDef) {
      return res.status(404).json({ error: `Unknown OSM layer: ${layerId}` });
    }

    // 1. In-memory cache (warm hot path)
    const mem = cache.get(layerId);
    if (mem && Date.now() - mem.timestamp < CACHE_TTL_MS) {
      res.setHeader("X-Cache", "hit-memory");
      return res.json(mem.data);
    }

    // 2. Disk cache (survives container restart)
    const diskData = await readDiskCache(layerId);
    if (diskData) {
      cache.set(layerId, { data: diskData, timestamp: Date.now() });
      res.setHeader("X-Cache", "hit-disk");
      res.setHeader("Cache-Control", "public, max-age=3600");
      return res.json(diskData);
    }

    // 3. Cold fetch — try each mirror in order, with brief backoff between failures
    let lastError = "no mirrors attempted";
    for (let i = 0; i < OVERPASS_MIRRORS.length; i++) {
      const mirror = OVERPASS_MIRRORS[i];
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 35000);

        const response = await fetch(mirror, {
          method: "POST",
          body: `data=${encodeURIComponent(queryDef.query)}`,
          // Overpass mirrors (Apache) return 406 without a descriptive User-Agent.
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
            "User-Agent": "NBSProjectBuilder/1.0 (nbs-project@openearth.org)",
            "Accept": "application/json",
          },
          signal: controller.signal,
        });

        clearTimeout(timeout);

        if (!response.ok) {
          lastError = `${mirror} returned ${response.status}`;
          console.warn(`[osm] ${layerId} via ${mirror} → ${response.status}, trying next mirror`);
          // Small backoff before next mirror (don't hammer them)
          if (i < OVERPASS_MIRRORS.length - 1) await sleep(500);
          continue;
        }

        const overpassData = await response.json();
        const geojson = overpassToGeoJSON(overpassData);

        // Cache result in memory + disk
        cache.set(layerId, { data: geojson, timestamp: Date.now() });
        await writeDiskCache(layerId, geojson);
        console.log(`[osm] ${layerId} fetched from ${mirror} (cached to disk, ${(JSON.stringify(geojson).length / 1024).toFixed(1)} KB)`);

        res.setHeader("X-Cache", "miss");
        res.setHeader("Cache-Control", "public, max-age=3600");
        return res.json(geojson);
      } catch (err: any) {
        const reason = err.name === "AbortError" ? "timeout" : (err.message || "fetch failed");
        lastError = `${mirror} ${reason}`;
        console.warn(`[osm] ${layerId} via ${mirror} → ${reason}, trying next mirror`);
        if (i < OVERPASS_MIRRORS.length - 1) await sleep(500);
        continue;
      }
    }

    // All mirrors failed — return 502 with detail
    console.error(`[osm] ${layerId} all mirrors failed. Last error: ${lastError}`);
    return res.status(502).json({
      error: "All Overpass mirrors failed",
      detail: lastError,
      hint: "Public Overpass is rate-limited. Try again in a minute, or pre-warm the cache via the boot prefetch.",
    });
  });

  // GET /api/osm — list available OSM layers
  app.get("/api/osm", (_req: Request, res: Response) => {
    res.json(OSM_QUERIES.map((q) => ({ id: q.id, label: q.label })));
  });

  console.log(`[osm] Registered ${OSM_QUERIES.length} Overpass reference layers`);
}

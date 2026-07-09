import type { Express, Request, Response } from 'express';
import {
  overpassQuery,
  overpassToGeoJSON,
  OverpassError,
} from '../services/overpassClient';
import {
  OSM_REFERENCE_QUERIES,
  readSnapshot,
  logSnapshotStatus,
} from '../services/osmReferenceLayers';

// ============================================================================
// OVERPASS API — serves OSM reference features (parks, schools, hospitals,
// wetlands) to the CBO map and the Site Explorer.
//
// The cache ladder is: committed snapshot → in-memory → Overpass.
//
// The snapshot is the intended source of truth (see osmReferenceLayers.ts). The
// Overpass branch exists only for a layer with no snapshot; it is slow and the
// public mirrors are unreliable, so a fall-through to it is a signal that
// someone needs to run `npm run osm:refresh`.
// ============================================================================

// Only holds results of the Overpass fallback. Snapshot reads are memoized in
// osmReferenceLayers, so they never touch this.
const fallbackCache = new Map<string, { data: any; timestamp: number }>();
const FALLBACK_CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

export function registerOverpassRoutes(app: Express): void {
  // GET /api/osm/:layerId — returns GeoJSON for a reference layer
  app.get('/api/osm/:layerId', async (req: Request, res: Response) => {
    const { layerId } = req.params;
    const queryDef = OSM_REFERENCE_QUERIES.find(q => q.id === layerId);

    if (!queryDef) {
      return res.status(404).json({ error: `Unknown OSM layer: ${layerId}` });
    }

    // 1. Committed snapshot — ships with the deploy, survives autoscale.
    const snapshot = await readSnapshot(layerId);
    if (snapshot) {
      res.setHeader('X-Cache', 'snapshot');
      res.setHeader('Cache-Control', 'public, max-age=86400');
      return res.json(snapshot);
    }

    // 2. In-memory result of an earlier fallback fetch on this container.
    const mem = fallbackCache.get(layerId);
    if (mem && Date.now() - mem.timestamp < FALLBACK_CACHE_TTL_MS) {
      res.setHeader('X-Cache', 'hit-memory');
      res.setHeader('Cache-Control', 'public, max-age=3600');
      return res.json(mem.data);
    }

    // 3. Cold fetch.
    console.warn(`[osm] ${layerId} has no snapshot — falling back to Overpass`);
    try {
      const overpassData = await overpassQuery(queryDef.query, {
        label: layerId,
      });
      const geojson = overpassToGeoJSON(overpassData);

      fallbackCache.set(layerId, { data: geojson, timestamp: Date.now() });
      console.log(
        `[osm] ${layerId} fetched from Overpass (${(JSON.stringify(geojson).length / 1024).toFixed(1)} KB) — ` +
          `run \`npm run osm:refresh\` to commit a snapshot and remove this path`
      );

      res.setHeader('X-Cache', 'miss');
      res.setHeader('Cache-Control', 'public, max-age=3600');
      return res.json(geojson);
    } catch (err) {
      const detail = err instanceof OverpassError ? err.message : String(err);
      console.error(`[osm] ${layerId} fallback failed: ${detail}`);
      return res.status(502).json({
        error: 'All Overpass mirrors failed',
        detail,
        hint: `No committed snapshot for "${layerId}". Run \`npm run osm:refresh\` and commit knowledge/osm/.`,
      });
    }
  });

  // GET /api/osm — list available OSM layers
  app.get('/api/osm', (_req: Request, res: Response) => {
    res.json(OSM_REFERENCE_QUERIES.map(q => ({ id: q.id, label: q.label })));
  });

  console.log(
    `[osm] Registered ${OSM_REFERENCE_QUERIES.length} Overpass reference layers`
  );
  void logSnapshotStatus();
}

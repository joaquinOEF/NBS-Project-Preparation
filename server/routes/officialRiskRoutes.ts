import type { Express, Request, Response } from 'express';
import {
  OFFICIAL_RISK_SOURCES,
  SGB_WMS_LAYERS,
  fetchLive,
  logSnapshotStatus,
  readSnapshot,
  wmsTileUrl,
} from '../services/officialRiskLayers';

// ============================================================================
// OFFICIAL RISK ROUTES — SGB/CPRM vector sectors + susceptibility WMS tiles
//
// The WMS proxy exists so these layers can be declared as ordinary
// TileLayerDefs with a `visualUrlTemplate`. Leaflet's L.tileLayer.wms would
// work too, but it would mean a second raster code path in both map surfaces;
// converting z/x/y to a 3857 bbox here keeps it at one.
// ============================================================================

const liveCache = new Map<string, { data: any; timestamp: number }>();
const LIVE_CACHE_TTL_MS = 24 * 60 * 60 * 1000;

const failedTiles = new Map<string, number>();
const FAIL_CACHE_MS = 5 * 60 * 1000;

export function registerOfficialRiskRoutes(app: Express): void {
  // GET /api/official-risk/:layerId — GeoJSON for a surveyed-risk layer
  app.get('/api/official-risk/:layerId', async (req: Request, res: Response) => {
    const { layerId } = req.params;
    const source = OFFICIAL_RISK_SOURCES.find(s => s.id === layerId);
    if (!source) {
      return res.status(404).json({ error: `Unknown official risk layer: ${layerId}` });
    }

    // 1. Committed snapshot — ships with the deploy, survives autoscale.
    const snapshot = await readSnapshot(layerId);
    logSnapshotStatus(layerId, Boolean(snapshot));
    if (snapshot) {
      res.setHeader('Cache-Control', 'public, max-age=86400');
      return res.json({ ...snapshot, attribution: source.attribution });
    }

    // 2. In-memory, for the container that already paid for a live fetch.
    const cached = liveCache.get(layerId);
    if (cached && Date.now() - cached.timestamp < LIVE_CACHE_TTL_MS) {
      return res.json({ ...cached.data, attribution: source.attribution });
    }

    // 3. Live SGB query.
    try {
      const data = await fetchLive(source);
      liveCache.set(layerId, { data, timestamp: Date.now() });
      res.setHeader('Cache-Control', 'public, max-age=3600');
      res.json({ ...data, attribution: source.attribution });
    } catch (err) {
      // Serving stale beats serving nothing: this layer changes a few times a
      // year, and a blank official-risk overlay reads as "no risk here".
      if (cached) {
        console.warn(`[official-risk] ${layerId} live fetch failed, serving stale:`, err);
        return res.json({ ...cached.data, attribution: source.attribution, stale: true });
      }
      console.error(`[official-risk] ${layerId} unavailable:`, err);
      res.status(502).json({ error: 'Official risk source unavailable' });
    }
  });

  // GET /api/geospatial/wms/:layerId/:z/:x/:y.png — SGB WMS as XYZ tiles
  app.get(
    '/api/geospatial/wms/:layerId/:z/:x/:y.png',
    async (req: Request, res: Response) => {
      const { layerId } = req.params;
      const wmsLayer = SGB_WMS_LAYERS[layerId];
      if (!wmsLayer) {
        return res.status(404).json({ error: `Unknown WMS layer: ${layerId}` });
      }

      const z = Number(req.params.z);
      const x = Number(req.params.x);
      const y = Number(req.params.y);
      if (!Number.isInteger(z) || !Number.isInteger(x) || !Number.isInteger(y)) {
        return res.status(400).json({ error: 'z/x/y must be integers' });
      }

      const cacheKey = `${layerId}/${z}/${x}/${y}`;
      const failedAt = failedTiles.get(cacheKey);
      if (failedAt && Date.now() - failedAt < FAIL_CACHE_MS) {
        return res.status(204).end();
      }

      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 15000);
        const response = await fetch(wmsTileUrl(wmsLayer, z, x, y), {
          signal: controller.signal,
          headers: { Accept: 'image/png' },
        });
        clearTimeout(timeout);

        // mapproxy answers a failed GetMap with a ServiceException *document*
        // at HTTP 200, so status alone is not enough to trust the body.
        const contentType = response.headers.get('content-type') ?? '';
        if (!response.ok || !contentType.startsWith('image/')) {
          failedTiles.set(cacheKey, Date.now());
          return res.status(204).end();
        }

        const buffer = Buffer.from(await response.arrayBuffer());
        res.setHeader('Content-Type', 'image/png');
        res.setHeader('Cache-Control', 'public, max-age=86400');
        res.send(buffer);
      } catch {
        failedTiles.set(cacheKey, Date.now());
        res.status(204).end();
      }
    }
  );
}

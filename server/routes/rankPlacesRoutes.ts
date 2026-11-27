import type { Express, Request, Response } from 'express';
import { rankPlaces, RankPlacesInputError } from '../services/rankPlaces';
import { siteReadingAt } from '../services/explorerSite';

// ============================================================================
// POST /api/geospatial/rank-places — "the parks in the hottest part of the city
// with the most people around them" (server/services/rankPlaces.ts).
//
// Committed files only: no network, no model, no organisation data — so, like
// the tile and OSM reference routes, it needs no session.
// ============================================================================

export function registerRankPlacesRoutes(app: Express): void {
  app.post('/api/geospatial/rank-places', async (req: Request, res: Response) => {
    try {
      res.json(await rankPlaces(req.body ?? {}));
    } catch (err) {
      if (err instanceof RankPlacesInputError) return res.status(400).json({ error: err.message });
      console.error('[rank-places]', err);
      res.status(500).json({ error: 'Failed to rank places' });
    }
  });

  // GET /api/geospatial/hazard-at?lat=&lng= — what the Site Explorer says about
  // one point: the official readings, what answers the high ones (with the
  // because line) and a name to prefill (server/services/explorerSite.ts).
  // Same footing as rank-places: committed files only, so no session.
  app.get('/api/geospatial/hazard-at', async (req: Request, res: Response) => {
    const lat = Number(req.query.lat), lng = Number(req.query.lng);
    if (req.query.lat == null || req.query.lng == null || !Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
      return res.status(400).json({ error: 'lat and lng are required numbers' });
    }
    try {
      res.json(await siteReadingAt(lat, lng));
    } catch (err) {
      console.error('[hazard-at]', err);
      res.status(500).json({ error: 'Failed to read the point' });
    }
  });
}

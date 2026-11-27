import type { Express, Request, Response } from 'express';
import { rankPlaces, RankPlacesInputError } from '../services/rankPlaces';

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
}

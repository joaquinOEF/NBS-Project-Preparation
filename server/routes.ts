import type { Express } from 'express';
import { isReplitDeployment } from "./services/runtimeEnv";
import { createServer, type Server } from 'http';
import { registerCboRoutes } from './routes/cboRoutes';
import { registerCohortRoutes } from './routes/cohortRoutes';
import { registerCoordinatorRoutes } from './routes/coordinatorRoutes';
import { registerUploadRoutes } from './routes/uploadRoutes';
import { registerTileProxyRoutes } from './routes/tileProxyRoutes';
import { registerKnowledgeRoutes } from './routes/knowledgeRoutes';
import { registerOverpassRoutes } from './routes/overpassRoutes';
import { registerOfficialRiskRoutes } from './routes/officialRiskRoutes';

export async function registerRoutes(app: Express): Promise<Server> {
  // Legacy city-prototype surface (OAuth, sample mode, city/project CRUD,
  // geospatial fetchers, impact-model LLM endpoints, project state machine,
  // project agent chat, concept note) lives in routes/legacyRoutes.ts and is
  // registered ONLY when ENABLE_LEGACY_ROUTES != '0'. Dynamic import (same
  // pattern as testRoutes below): flag off ⇒ the routes don't exist AND the
  // legacy services never load. Registration order preserved: legacy first,
  // workshop route files after — exactly as when these blocks were inline.
  // See docs/system-complexity-audit-2026-07.md items DS-2/DS-3.
  if (process.env.ENABLE_LEGACY_ROUTES !== '0') {
    const { registerLegacyRoutes } = await import('./routes/legacyRoutes');
    registerLegacyRoutes(app);
  }

  // OSM search (Nominatim) — WORKSHOP-reachable (the CBO map's geocoding),
  // which is why it stays out of the legacy file (audit: extract osm-search
  // first). Self-contained: plain fetch, no service imports.
  // OSM search by name (Nominatim API)
  app.post('/api/geospatial/osm-search', async (req: any, res) => {
    try {
      const { query, bbox, category, osmTypes, zoneGeometry } = req.body;
      
      if (!query) {
        return res.status(400).json({ message: 'query is required' });
      }

      console.log(`🔍 Searching OSM for "${query}"`);

      // Use Nominatim for name-based search
      const searchUrl = new URL('https://nominatim.openstreetmap.org/search');
      searchUrl.searchParams.append('q', query);
      searchUrl.searchParams.append('format', 'json');
      searchUrl.searchParams.append('addressdetails', '1');
      searchUrl.searchParams.append('limit', '20');
      
      // If bbox is provided, constrain search to that area
      if (bbox && Array.isArray(bbox) && bbox.length === 4) {
        searchUrl.searchParams.append('viewbox', `${bbox[1]},${bbox[0]},${bbox[3]},${bbox[2]}`);
        searchUrl.searchParams.append('bounded', '1');
      }

      const response = await fetch(searchUrl.toString(), {
        headers: {
          'User-Agent': 'NBS-Project-Builder/1.0 (https://nbs-project-preparation.replit.app; nbs-project-builder@replit.dev)',
          'Accept': 'application/json',
          'Accept-Language': 'en-US,en;q=0.9',
        },
      });

      if (!response.ok) {
        throw new Error(`Nominatim API error: ${response.status}`);
      }

      const results = await response.json();
      
      // Helper to calculate approximate area from Nominatim bounding box
      const calcArea = (bbox: string[]): number => {
        if (!bbox || bbox.length !== 4) return 0;
        const [south, north, west, east] = bbox.map(Number);
        const latSpan = north - south;
        const lngSpan = east - west;
        const avgLat = (south + north) / 2;
        const metersPerDegreeLat = 111320;
        const metersPerDegreeLng = 111320 * Math.cos(avgLat * Math.PI / 180);
        return (latSpan * metersPerDegreeLat) * (lngSpan * metersPerDegreeLng);
      };
      
      // Transform results to match OSM asset format
      const assets = results.map((r: any) => ({
        id: `nominatim_${r.place_id}`,
        osmId: r.osm_id,
        name: r.display_name.split(',')[0],
        assetType: r.type || r.class || 'place',
        centroid: [parseFloat(r.lat), parseFloat(r.lon)] as [number, number],
        area: calcArea(r.boundingbox),
        length: 0,
        tags: { name: r.display_name.split(',')[0], class: r.class, type: r.type },
        source: 'nominatim' as const,
      }));

      console.log(`   Found ${assets.length} results for "${query}"`);
      res.json({ assets });
    } catch (error: any) {
      console.error('OSM search error:', error);
      res.status(500).json({ 
        message: error.message || 'Failed to search OSM',
        assets: [],
      });
    }
  });

  registerKnowledgeRoutes(app);
  registerCboRoutes(app);
  registerCohortRoutes(app);
  registerCoordinatorRoutes(app);
  registerUploadRoutes(app);
  registerTileProxyRoutes(app);
  registerOverpassRoutes(app);
  registerOfficialRiskRoutes(app);

  // Test-only seeding API — CONDITIONALLY registered so the routes literally do
  // not exist in production (the gate is registration, not a runtime check).
  // Never set ENABLE_TEST_ROUTES on the production Deployment. See testRoutes.ts.
  // Deployment backstop (see runtimeEnv.ts): a shared secret can't enable
  // the test seams inside a Replit Deployment.
  if (process.env.ENABLE_TEST_ROUTES === '1' && !isReplitDeployment()) {
    const { registerTestRoutes } = await import('./routes/testRoutes');
    registerTestRoutes(app);
  }

  const httpServer = createServer(app);
  return httpServer;
}

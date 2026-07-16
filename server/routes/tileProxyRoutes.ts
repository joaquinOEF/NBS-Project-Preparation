import type { Express, Request, Response } from "express";
import { MECHANISM_KEY_LABELS } from "@shared/geospatial-layers";

// ============================================================================
// TILE PROXY — proxies S3 tile requests with CORS handling + caching
// Ported from Geo-Layer-Viewer (joaquinOEF/Geo-Layer-Viewer)
// ============================================================================

interface TileLayerConfig {
  urlTemplate: string;
}

// All tile layers from the OEF geospatial-data catalog
// Each maps a layerId to an S3 URL template with {z}/{x}/{y} placeholders
const OEF_TILE_LAYERS: Record<string, TileLayerConfig> = {
  // ── Land Use & Urban Form ──────────────────────────────────────────────────
  dynamic_world: {
    urlTemplate: "https://geo-test-api.s3.us-east-1.amazonaws.com/dynamic_world/release/v1/2023/porto_alegre/tiles_visual/{z}/{x}/{y}.png",
  },
  ghsl_built_up: {
    urlTemplate: "https://geo-test-api.s3.us-east-1.amazonaws.com/ghsl_built_up/release/v1/2025/porto_alegre/tiles_visual/{z}/{x}/{y}.png",
  },
  ghsl_urbanization: {
    urlTemplate: "https://geo-test-api.s3.us-east-1.amazonaws.com/ghsl_degree_urbanization/release/v2/2024/porto_alegre/tiles_visual/{z}/{x}/{y}.png",
  },
  viirs_nightlights: {
    urlTemplate: "https://geo-test-api.s3.us-east-1.amazonaws.com/noaa_viirs_nightlights/release/v1/2024/tiles_visual/{z}/{x}/{y}.png",
  },

  // ── Environment & Ecology ──────────────────────────────────────────────────
  solar_pvout: {
    urlTemplate: "https://geo-test-api.s3.us-east-1.amazonaws.com/jrc_global_surface_water/release/v1/porto_alegre/transition/tiles_visual/{z}/{x}/{y}.png",
  },
  modis_ndvi: {
    urlTemplate: "https://geo-test-api.s3.us-east-1.amazonaws.com/modis_ndvi/release/v1/2024/tiles_visual/{z}/{x}/{y}.png",
  },
  hansen_forest_loss: {
    urlTemplate: "https://geo-test-api.s3.us-east-1.amazonaws.com/hansen_forest_change/release/v1/2024/porto_alegre/loss/tiles_visual/{z}/{x}/{y}.png",
  },

  // ── Population & Society ───────────────────────────────────────────────────
  ghsl_population: {
    urlTemplate: "https://geo-test-api.s3.us-east-1.amazonaws.com/ghsl_population/release/v1/2025/porto_alegre/tiles_visual/{z}/{x}/{y}.png",
  },

  // ── Hydrology & Terrain ────────────────────────────────────────────────────
  copernicus_dem_visual: {
    urlTemplate: "https://geo-test-api.s3.us-east-1.amazonaws.com/copernicus_dem/release/v1/2024/porto_alegre/tiles_visual/{z}/{x}/{y}.png",
  },
  merit_elv: {
    urlTemplate: "https://geo-test-api.s3.us-east-1.amazonaws.com/merit_hydro/release/v1/porto_alegre/elv/tiles_visual/{z}/{x}/{y}.png",
  },
  merit_upa: {
    urlTemplate: "https://geo-test-api.s3.us-east-1.amazonaws.com/merit_hydro/release/v1/porto_alegre/upa/tiles_visual/{z}/{x}/{y}.png",
  },
  merit_hydro_hand: {
    urlTemplate: "https://geo-test-api.s3.us-east-1.amazonaws.com/merit_hydro/release/v1/porto_alegre/hnd/tiles_visual/{z}/{x}/{y}.png",
  },
  copernicus_emsn194: {
    urlTemplate: "https://geo-test-api.s3.us-east-1.amazonaws.com/copernicus_emsn194/release/v1/2024/porto_alegre/tiles_visual/{z}/{x}/{y}.png",
  },
  jrc_occurrence: {
    urlTemplate: "https://geo-test-api.s3.us-east-1.amazonaws.com/jrc_global_surface_water/release/v1/porto_alegre/occurrence/tiles_visual/{z}/{x}/{y}.png",
  },
  jrc_seasonality: {
    urlTemplate: "https://geo-test-api.s3.us-east-1.amazonaws.com/jrc_global_surface_water/release/v1/porto_alegre/seasonality/tiles_visual/{z}/{x}/{y}.png",
  },
  jrc_surface_water: {
    urlTemplate: "https://geo-test-api.s3.us-east-1.amazonaws.com/jrc_global_surface_water/release/v1/porto_alegre/transition/tiles_visual/{z}/{x}/{y}.png",
  },
  hansen_treecover2000: {
    urlTemplate: "https://geo-test-api.s3.us-east-1.amazonaws.com/hansen_forest_change/release/v1/2024/porto_alegre/tree_cover_2000/tiles_visual/{z}/{x}/{y}.png",
  },

  // ── CHIRPS Extreme Precipitation Indices ───────────────────────────────────
  chirps_r90p_2024:   { urlTemplate: "https://geo-test-api.s3.us-east-1.amazonaws.com/nbs/porto_alegre/climate_hazards/extreme_precipitation/chirps/V2_0/2024/r90p/tiles_visual/{z}/{x}/{y}.png" },
  chirps_r90p_clim:   { urlTemplate: "https://geo-test-api.s3.us-east-1.amazonaws.com/nbs/porto_alegre/climate_hazards/extreme_precipitation/chirps/V2_0/annual_climatology/r90p/tiles_visual/{z}/{x}/{y}.png" },
  chirps_r95p_2024:   { urlTemplate: "https://geo-test-api.s3.us-east-1.amazonaws.com/nbs/porto_alegre/climate_hazards/extreme_precipitation/chirps/V2_0/2024/r95p/tiles_visual/{z}/{x}/{y}.png" },
  chirps_r95p_clim:   { urlTemplate: "https://geo-test-api.s3.us-east-1.amazonaws.com/nbs/porto_alegre/climate_hazards/extreme_precipitation/chirps/V2_0/annual_climatology/r95p/tiles_visual/{z}/{x}/{y}.png" },
  chirps_r99p_2024:   { urlTemplate: "https://geo-test-api.s3.us-east-1.amazonaws.com/nbs/porto_alegre/climate_hazards/extreme_precipitation/chirps/V2_0/2024/r99p/tiles_visual/{z}/{x}/{y}.png" },
  chirps_r99p_clim:   { urlTemplate: "https://geo-test-api.s3.us-east-1.amazonaws.com/nbs/porto_alegre/climate_hazards/extreme_precipitation/chirps/V2_0/annual_climatology/r99p/tiles_visual/{z}/{x}/{y}.png" },
  chirps_rx1day_2024: { urlTemplate: "https://geo-test-api.s3.us-east-1.amazonaws.com/nbs/porto_alegre/climate_hazards/extreme_precipitation/chirps/V2_0/2024/rx1day/tiles_visual/{z}/{x}/{y}.png" },
  chirps_rx1day_clim: { urlTemplate: "https://geo-test-api.s3.us-east-1.amazonaws.com/nbs/porto_alegre/climate_hazards/extreme_precipitation/chirps/V2_0/annual_climatology/rx1day/tiles_visual/{z}/{x}/{y}.png" },
  chirps_rx5day_2024: { urlTemplate: "https://geo-test-api.s3.us-east-1.amazonaws.com/nbs/porto_alegre/climate_hazards/extreme_precipitation/chirps/V2_0/2024/rx5day/tiles_visual/{z}/{x}/{y}.png" },
  chirps_rx5day_clim: { urlTemplate: "https://geo-test-api.s3.us-east-1.amazonaws.com/nbs/porto_alegre/climate_hazards/extreme_precipitation/chirps/V2_0/annual_climatology/rx5day/tiles_visual/{z}/{x}/{y}.png" },

  // ── ERA5-Land Extreme Temperature Indices ──────────────────────────────────
  era5_tnx_2024:   { urlTemplate: "https://geo-test-api.s3.us-east-1.amazonaws.com/nbs/porto_alegre/climate_hazards/extreme_temperature/era5/land_daily_aggregated/2024/tnx/tiles_visual/{z}/{x}/{y}.png" },
  era5_tnx_clim:   { urlTemplate: "https://geo-test-api.s3.us-east-1.amazonaws.com/nbs/porto_alegre/climate_hazards/extreme_temperature/era5/land_daily_aggregated/annual_climatology/tnx/tiles_visual/{z}/{x}/{y}.png" },
  era5_tx90p_2024: { urlTemplate: "https://geo-test-api.s3.us-east-1.amazonaws.com/nbs/porto_alegre/climate_hazards/extreme_temperature/era5/land_daily_aggregated/2024/tx90p/tiles_visual/{z}/{x}/{y}.png" },
  era5_tx90p_clim: { urlTemplate: "https://geo-test-api.s3.us-east-1.amazonaws.com/nbs/porto_alegre/climate_hazards/extreme_temperature/era5/land_daily_aggregated/annual_climatology/tx90p/tiles_visual/{z}/{x}/{y}.png" },
  era5_tx99p_2024: { urlTemplate: "https://geo-test-api.s3.us-east-1.amazonaws.com/nbs/porto_alegre/climate_hazards/extreme_temperature/era5/land_daily_aggregated/2024/tx99p/tiles_visual/{z}/{x}/{y}.png" },
  era5_tx99p_clim: { urlTemplate: "https://geo-test-api.s3.us-east-1.amazonaws.com/nbs/porto_alegre/climate_hazards/extreme_temperature/era5/land_daily_aggregated/annual_climatology/tx99p/tiles_visual/{z}/{x}/{y}.png" },
  era5_txx_2024:   { urlTemplate: "https://geo-test-api.s3.us-east-1.amazonaws.com/nbs/porto_alegre/climate_hazards/extreme_temperature/era5/land_daily_aggregated/2024/txx/tiles_visual/{z}/{x}/{y}.png" },
  era5_txx_clim:   { urlTemplate: "https://geo-test-api.s3.us-east-1.amazonaws.com/nbs/porto_alegre/climate_hazards/extreme_temperature/era5/land_daily_aggregated/annual_climatology/txx/tiles_visual/{z}/{x}/{y}.png" },

  // ── Heatwave Magnitude Index ───────────────────────────────────────────────
  hwm_2024:      { urlTemplate: "https://geo-test-api.s3.us-east-1.amazonaws.com/nbs/porto_alegre/climate_hazards/heatwave_indices/hwm/2024/tiles_visual/{z}/{x}/{y}.png" },
  hwm_clim:      { urlTemplate: "https://geo-test-api.s3.us-east-1.amazonaws.com/nbs/porto_alegre/climate_hazards/heatwave_indices/hwm/annual_climatology/tiles_visual/{z}/{x}/{y}.png" },
  hwm_2030s_245: { urlTemplate: "https://geo-test-api.s3.us-east-1.amazonaws.com/nbs/porto_alegre/climate_hazards/heatwave_indices/hwm/2030s_ssp245/tiles_visual/{z}/{x}/{y}.png" },
  hwm_2030s_585: { urlTemplate: "https://geo-test-api.s3.us-east-1.amazonaws.com/nbs/porto_alegre/climate_hazards/heatwave_indices/hwm/2030s_ssp585/tiles_visual/{z}/{x}/{y}.png" },
  hwm_2050s_585: { urlTemplate: "https://geo-test-api.s3.us-east-1.amazonaws.com/nbs/porto_alegre/climate_hazards/heatwave_indices/hwm/2050s_ssp245/tiles_visual/{z}/{x}/{y}.png" },
  hwm_2100s_585: { urlTemplate: "https://geo-test-api.s3.us-east-1.amazonaws.com/nbs/porto_alegre/climate_hazards/heatwave_indices/hwm/2100s_ssp585/tiles_visual/{z}/{x}/{y}.png" },

  // ── Flood Risk Index ───────────────────────────────────────────────────────
  fri_2024:      { urlTemplate: "https://geo-test-api.s3.us-east-1.amazonaws.com/nbs/porto_alegre/climate_hazards/floods/flood_risk_index/oef_calculation/2024/tiles_visual/{z}/{x}/{y}.png" },
  fri_2030s_245: { urlTemplate: "https://geo-test-api.s3.us-east-1.amazonaws.com/nbs/porto_alegre/climate_hazards/floods/flood_risk_index/oef_calculation/2030s_ssp245/tiles_visual/{z}/{x}/{y}.png" },
  fri_2030s_585: { urlTemplate: "https://geo-test-api.s3.us-east-1.amazonaws.com/nbs/porto_alegre/climate_hazards/floods/flood_risk_index/oef_calculation/2030s_ssp585/tiles_visual/{z}/{x}/{y}.png" },
  fri_2050s_245: { urlTemplate: "https://geo-test-api.s3.us-east-1.amazonaws.com/nbs/porto_alegre/climate_hazards/floods/flood_risk_index/oef_calculation/2050s_ssp245/tiles_visual/{z}/{x}/{y}.png" },
  fri_2050s_585: { urlTemplate: "https://geo-test-api.s3.us-east-1.amazonaws.com/nbs/porto_alegre/climate_hazards/floods/flood_risk_index/oef_calculation/2050s_ssp585/tiles_visual/{z}/{x}/{y}.png" },
  fri_2100s_245: { urlTemplate: "https://geo-test-api.s3.us-east-1.amazonaws.com/nbs/porto_alegre/climate_hazards/floods/flood_risk_index/oef_calculation/2100s_ssp245/tiles_visual/{z}/{x}/{y}.png" },
  fri_2100s_585: { urlTemplate: "https://geo-test-api.s3.us-east-1.amazonaws.com/nbs/porto_alegre/climate_hazards/floods/flood_risk_index/oef_calculation/2100s_ssp585/tiles_visual/{z}/{x}/{y}.png" },

  // ── Catalog hazard composites poa_<haz>_* (validated H×E×V). CONSISTENT across
  // flood / heat / landslide: each exposes only RISK (the card) + HAZARD (the
  // gap-free overlay). The exposure/vulnerability component tiles are intentionally
  // omitted — risk already folds E and V in. NOTE landslide path is `landslides`
  // (plural, like `floods`). ──
  poa_flood_risk:        { urlTemplate: "https://geo-test-api.s3.us-east-1.amazonaws.com/oef_calculation/release/v1/porto_alegre/climate_hazards/floods/risk/tiles_visual/{z}/{x}/{y}.png" },
  poa_flood_hazard:      { urlTemplate: "https://geo-test-api.s3.us-east-1.amazonaws.com/oef_calculation/release/v1/porto_alegre/climate_hazards/floods/hazard/tiles_visual/{z}/{x}/{y}.png" },
  // NOTE the path segment is `flood_mechanism`, not the catalog dataset_id `poa_flood_mechanism_type`.
  poa_flood_mechanism:   { urlTemplate: "https://geo-test-api.s3.us-east-1.amazonaws.com/oef_calculation/release/v1/porto_alegre/climate_hazards/floods/flood_mechanism/tiles_visual/{z}/{x}/{y}.png" },
  poa_heat_risk:         { urlTemplate: "https://geo-test-api.s3.us-east-1.amazonaws.com/oef_calculation/release/v1/porto_alegre/climate_hazards/heat/risk/tiles_visual/{z}/{x}/{y}.png" },
  poa_heat_hazard:       { urlTemplate: "https://geo-test-api.s3.us-east-1.amazonaws.com/oef_calculation/release/v1/porto_alegre/climate_hazards/heat/hazard/tiles_visual/{z}/{x}/{y}.png" },
  // Like flood, the path segment is `heat_mechanism` / `landslide_mechanism`,
  // not the catalog dataset_id `poa_<haz>_mechanism_type`.
  poa_heat_mechanism:    { urlTemplate: "https://geo-test-api.s3.us-east-1.amazonaws.com/oef_calculation/release/v1/porto_alegre/climate_hazards/heat/heat_mechanism/tiles_visual/{z}/{x}/{y}.png" },
  poa_landslide_risk:    { urlTemplate: "https://geo-test-api.s3.us-east-1.amazonaws.com/oef_calculation/release/v1/porto_alegre/climate_hazards/landslides/risk/tiles_visual/{z}/{x}/{y}.png" },
  poa_landslide_hazard:  { urlTemplate: "https://geo-test-api.s3.us-east-1.amazonaws.com/oef_calculation/release/v1/porto_alegre/climate_hazards/landslides/hazard/tiles_visual/{z}/{x}/{y}.png" },
  poa_landslide_mechanism: { urlTemplate: "https://geo-test-api.s3.us-east-1.amazonaws.com/oef_calculation/release/v1/porto_alegre/climate_hazards/landslides/landslide_mechanism/tiles_visual/{z}/{x}/{y}.png" },
};

// Track failed tile URLs to avoid repeated 404s (cache for 1 hour)
const failedTiles = new Map<string, number>();
const FAIL_CACHE_MS = 60 * 60 * 1000;

// ── Mechanism-mix lookup (what a "Mixed" pixel is made of) ───────────────────
// The mechanism rasters only store the dominant class; the per-cell GeoJSONs on
// S3 (4–13 MB) carry the detail. This endpoint reduces each file to just its
// mixed cells — [bbox, tied mechanism labels] — so the ValueTooltip can render
// "Mixed (Riverine + Low-lying)" without the client downloading the full file.
// Landslide has an explicit `mixed_tied_mechanisms` property; flood and heat
// use their per-mechanism boolean flags. IDW gap-filled cells are absent from
// the GeoJSONs, so hovers there fall back to plain "Mixed".
const MECHANISM_GEOJSON_BASE =
  'https://geo-test-api.s3.us-east-1.amazonaws.com/oef_calculation/release/v1/porto_alegre/climate_hazards';
const MECHANISM_MIX_SOURCES: Record<string, { url: string; typeProp: string; tiedProp?: string; flagKeys: string[] }> = {
  flood: {
    url: `${MECHANISM_GEOJSON_BASE}/floods/flood_mechanism/flood_mechanism_type_poa_250m.geojson`,
    typeProp: 'flood_mechanism_type',
    flagKeys: ['riverine', 'pluvial', 'low_lying'],
  },
  heat: {
    url: `${MECHANISM_GEOJSON_BASE}/heat/heat_mechanism/heat_mechanism_type_poa_250m.geojson`,
    typeProp: 'heat_mechanism_type',
    flagKeys: ['uhi_built_up', 'shade_deficit', 'high_daytime_lst', 'limited_nocturnal_cooling', 'high_social_exposure'],
  },
  landslide: {
    url: `${MECHANISM_GEOJSON_BASE}/landslides/landslide_mechanism/landslide_mechanism_type_poa_90m.geojson`,
    typeProp: 'landslide_mechanism_type',
    tiedProp: 'mixed_tied_mechanisms',
    flagKeys: ['steep_activatable_slope', 'rainfall_trigger', 'low_cohesion_wet', 'vegetation_deficit', 'drainage_saturation', 'disturbed_bare_slope', 'upslope_convergence', 'high_social_exposure'],
  },
};

// [west, south, east, north] + tied mechanism display labels
interface MixCell { b: [number, number, number, number]; m: string[] }
const mixCellCache = new Map<string, MixCell[]>();
const mixCellPending = new Map<string, Promise<MixCell[]>>();

async function loadMixCells(hazard: string): Promise<MixCell[]> {
  const cached = mixCellCache.get(hazard);
  if (cached) return cached;
  const pending = mixCellPending.get(hazard);
  if (pending) return pending;

  const src = MECHANISM_MIX_SOURCES[hazard];
  const promise = (async () => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000);
    const response = await fetch(src.url, { signal: controller.signal });
    clearTimeout(timeout);
    if (!response.ok) throw new Error(`geojson fetch ${response.status}`);
    const geojson = await response.json();

    const cells: MixCell[] = [];
    for (const feature of geojson.features ?? []) {
      const props = feature.properties ?? {};
      if (props[src.typeProp] !== 'mixed') continue;

      const tied: string | null = src.tiedProp ? props[src.tiedProp] : null;
      const keys: string[] = tied
        ? tied.split(',').map(k => k.trim())
        : src.flagKeys.filter(k => props[k] === true);
      const labels = keys.map(k => MECHANISM_KEY_LABELS[k] ?? k);
      if (labels.length === 0) continue;

      let w = Infinity, s = Infinity, e = -Infinity, n = -Infinity;
      for (const ring of feature.geometry?.coordinates ?? []) {
        for (const [lng, lat] of ring) {
          if (lng < w) w = lng;
          if (lng > e) e = lng;
          if (lat < s) s = lat;
          if (lat > n) n = lat;
        }
      }
      if (!isFinite(w)) continue;
      const r6 = (v: number) => Math.round(v * 1e6) / 1e6;
      cells.push({ b: [r6(w), r6(s), r6(e), r6(n)], m: labels });
    }
    mixCellCache.set(hazard, cells);
    return cells;
  })();
  mixCellPending.set(hazard, promise);
  try {
    return await promise;
  } finally {
    mixCellPending.delete(hazard);
  }
}

export function registerTileProxyRoutes(app: Express): void {
  // Register a proxy route for each tile layer
  Object.entries(OEF_TILE_LAYERS).forEach(([layerId, config]) => {
    app.get(`/api/geospatial/tiles/${layerId}/:z/:x/:y.png`, async (req: Request, res: Response) => {
      const { z, x, y } = req.params;
      const url = config.urlTemplate
        .replace('{z}', z)
        .replace('{x}', x)
        .replace('{y}', y);

      // Check fail cache
      const cacheKey = `${layerId}/${z}/${x}/${y}`;
      const failedAt = failedTiles.get(cacheKey);
      if (failedAt && Date.now() - failedAt < FAIL_CACHE_MS) {
        return res.status(204).end();
      }

      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 10000);

        const response = await fetch(url, {
          signal: controller.signal,
          headers: { 'Accept': 'image/png' },
        });

        clearTimeout(timeout);

        if (!response.ok) {
          failedTiles.set(cacheKey, Date.now());
          return res.status(204).end();
        }

        const buffer = Buffer.from(await response.arrayBuffer());
        res.setHeader('Content-Type', 'image/png');
        res.setHeader('Cache-Control', 'public, max-age=86400'); // Cache 24h
        res.send(buffer);
      } catch {
        failedTiles.set(cacheKey, Date.now());
        res.status(204).end();
      }
    });
  });

  // Mixed-cell composition for the mechanism-type layers (see loadMixCells)
  app.get('/api/geospatial/mechanism-mix/:hazard', async (req: Request, res: Response) => {
    const { hazard } = req.params;
    if (!MECHANISM_MIX_SOURCES[hazard]) {
      return res.status(400).json({ error: `Unknown hazard '${hazard}'. Expected one of: ${Object.keys(MECHANISM_MIX_SOURCES).join(', ')}` });
    }
    try {
      const cells = await loadMixCells(hazard);
      res.setHeader('Cache-Control', 'public, max-age=86400');
      res.json({ hazard, cells });
    } catch (err) {
      console.error(`[tiles] mechanism-mix ${hazard} failed:`, err);
      res.status(502).json({ error: 'Failed to load mechanism GeoJSON from S3' });
    }
  });

  // List available tile layers
  app.get('/api/geospatial/tile-layers', (_req: Request, res: Response) => {
    const layers = Object.entries(OEF_TILE_LAYERS).map(([id, config]) => ({
      id,
      urlTemplate: `/api/geospatial/tiles/${id}/{z}/{x}/{y}.png`,
    }));
    res.json({ count: layers.length, layers });
  });

  // Generic proxy for value tiles (used by ValueTooltip for RGB→value decoding)
  // Client sends: /api/geospatial/proxy-tile?url=https://geo-test-api.s3.../{z}/{x}/{y}.png
  app.get('/api/geospatial/proxy-tile', async (req: Request, res: Response) => {
    const url = req.query.url as string;
    if (!url || !url.startsWith('https://geo-test-api.s3.us-east-1.amazonaws.com/')) {
      return res.status(400).json({ error: 'Invalid or missing S3 URL' });
    }

    // Check fail cache
    const failedAt = failedTiles.get(url);
    if (failedAt && Date.now() - failedAt < FAIL_CACHE_MS) {
      return res.status(204).end();
    }

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10000);

      const response = await fetch(url, {
        signal: controller.signal,
        headers: { 'Accept': 'image/png' },
      });

      clearTimeout(timeout);

      if (!response.ok) {
        failedTiles.set(url, Date.now());
        return res.status(204).end();
      }

      const buffer = Buffer.from(await response.arrayBuffer());
      res.setHeader('Content-Type', 'image/png');
      res.setHeader('Cache-Control', 'public, max-age=3600');
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.send(buffer);
    } catch {
      failedTiles.set(url, Date.now());
      res.status(204).end();
    }
  });

  console.log(`[tiles] Registered ${Object.keys(OEF_TILE_LAYERS).length} tile proxy routes + generic proxy`);
}

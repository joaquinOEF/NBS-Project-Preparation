import type { Express, Request, Response } from "express";

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
};

// Track failed tile URLs to avoid repeated 404s (cache for 1 hour)
const failedTiles = new Map<string, number>();
const FAIL_CACHE_MS = 60 * 60 * 1000;

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

  // List available tile layers
  app.get('/api/geospatial/tile-layers', (_req: Request, res: Response) => {
    const layers = Object.entries(OEF_TILE_LAYERS).map(([id, config]) => ({
      id,
      urlTemplate: `/api/geospatial/tiles/${id}/{z}/{x}/{y}.png`,
    }));
    res.json({ count: layers.length, layers });
  });

  console.log(`[tiles] Registered ${Object.keys(OEF_TILE_LAYERS).length} tile proxy routes`);
}

// ============================================================================
// GEOSPATIAL LAYER CATALOG — shared between site explorer + concept note map
// Ported from Geo-Layer-Viewer (joaquinOEF/Geo-Layer-Viewer)
// ============================================================================

export type LayerSource = 'geojson' | 'tiles';
export type LayerGroup =
  | 'risk_analysis'    // Existing: flood/heat/landslide from grid
  | 'environment'      // Existing: elevation, landcover, water, rivers, forest
  | 'urban_land'       // New: Dynamic World, GHSL, VIIRS
  | 'ecology'          // New: NDVI, Hansen, Solar
  | 'population'       // New: GHSL Population, Census, Transit
  | 'hydrology'        // New: DEM, MERIT, JRC, Flood Depth
  | 'climate_extreme'  // New: CHIRPS, ERA5
  | 'climate_projections'; // New: FRI, HWM projections

export interface TileLayerDef {
  id: string;
  name: string;
  group: LayerGroup;
  color: string;
  tileLayerId: string; // maps to /api/geospatial/tiles/{tileLayerId}/{z}/{x}/{y}.png
  available: boolean;
}

// Groups for the layer selector UI
export const TILE_LAYER_GROUPS: Array<{ id: LayerGroup; label: string }> = [
  { id: 'urban_land', label: 'Land Use & Urban Form' },
  { id: 'ecology', label: 'Environment & Ecology' },
  { id: 'population', label: 'Population & Society' },
  { id: 'hydrology', label: 'Hydrology & Terrain' },
  { id: 'climate_extreme', label: 'Extreme Climate Indices' },
  { id: 'climate_projections', label: 'Climate Projections' },
];

// All tile layers from the OEF geospatial-data catalog
export const TILE_LAYERS: TileLayerDef[] = [
  // ── Land Use & Urban Form ──────────────────────────────────────────────────
  { id: 'oef_dynamic_world',    name: 'Land Use (Dynamic World)',       group: 'urban_land', color: '#06d6a0', tileLayerId: 'dynamic_world',      available: true },
  { id: 'oef_ghsl_built_up',    name: 'Built-Up Surface (GHSL)',       group: 'urban_land', color: '#ef4444', tileLayerId: 'ghsl_built_up',      available: true },
  { id: 'oef_ghsl_urbanization',name: 'Degree of Urbanisation (GHSL)', group: 'urban_land', color: '#f97316', tileLayerId: 'ghsl_urbanization',  available: true },
  { id: 'oef_viirs_nightlights',name: 'Night Lights (VIIRS)',          group: 'urban_land', color: '#fbbf24', tileLayerId: 'viirs_nightlights',  available: true },

  // ── Environment & Ecology ──────────────────────────────────────────────────
  { id: 'oef_solar_tiles',  name: 'Solar PV Potential',            group: 'ecology', color: '#eab308', tileLayerId: 'solar_pvout',        available: true },
  { id: 'oef_modis_ndvi',   name: 'Vegetation NDVI (MODIS)',       group: 'ecology', color: '#4ade80', tileLayerId: 'modis_ndvi',         available: true },
  { id: 'oef_hansen_forest', name: 'Forest Loss 2000–2024',        group: 'ecology', color: '#dc2626', tileLayerId: 'hansen_forest_loss', available: true },

  // ── Population & Society ───────────────────────────────────────────────────
  { id: 'oef_ghsl_population', name: 'Population Grid (GHSL)',     group: 'population', color: '#8b5cf6', tileLayerId: 'ghsl_population', available: true },

  // ── Hydrology & Terrain ────────────────────────────────────────────────────
  { id: 'oef_copernicus_dem',  name: 'DEM Elevation (Copernicus)',     group: 'hydrology', color: '#a16207', tileLayerId: 'copernicus_dem_visual', available: true },
  { id: 'oef_merit_elv',      name: 'Terrain Elevation (MERIT)',      group: 'hydrology', color: '#bc6c25', tileLayerId: 'merit_elv',            available: true },
  { id: 'oef_merit_upa',      name: 'Upstream Area (MERIT)',          group: 'hydrology', color: '#0369a1', tileLayerId: 'merit_upa',            available: true },
  { id: 'oef_merit_hydro',    name: 'Height Above Drainage (MERIT)', group: 'hydrology', color: '#0ea5e9', tileLayerId: 'merit_hydro_hand',     available: true },
  { id: 'oef_emsn194',        name: '2024 Flood Depth (Copernicus)', group: 'hydrology', color: '#1d4ed8', tileLayerId: 'copernicus_emsn194',   available: true },
  { id: 'oef_jrc_occurrence',  name: 'Surface Water Occurrence',      group: 'hydrology', color: '#1d4ed8', tileLayerId: 'jrc_occurrence',       available: true },
  { id: 'oef_jrc_seasonality', name: 'Surface Water Seasonality',     group: 'hydrology', color: '#0891b2', tileLayerId: 'jrc_seasonality',      available: true },
  { id: 'oef_jrc_change',     name: 'Surface Water Change',           group: 'hydrology', color: '#0077b6', tileLayerId: 'jrc_surface_water',    available: true },
  { id: 'oef_hansen_treecover',name: 'Tree Cover 2000 (Hansen)',      group: 'hydrology', color: '#166534', tileLayerId: 'hansen_treecover2000', available: true },

  // ── Extreme Climate Indices — Precipitation (CHIRPS) ───────────────────────
  { id: 'oef_chirps_r90p_2024', name: 'Precipitation R90p 2024',      group: 'climate_extreme', color: '#1e40af', tileLayerId: 'chirps_r90p_2024', available: true },
  { id: 'oef_chirps_r90p_clim', name: 'Precipitation R90p Baseline',  group: 'climate_extreme', color: '#3b82f6', tileLayerId: 'chirps_r90p_clim', available: true },
  { id: 'oef_chirps_r95p_2024', name: 'Precipitation R95p 2024',      group: 'climate_extreme', color: '#1e3a8a', tileLayerId: 'chirps_r95p_2024', available: true },
  { id: 'oef_chirps_r95p_clim', name: 'Precipitation R95p Baseline',  group: 'climate_extreme', color: '#2563eb', tileLayerId: 'chirps_r95p_clim', available: true },
  { id: 'oef_chirps_r99p_2024', name: 'Precipitation R99p 2024',      group: 'climate_extreme', color: '#172554', tileLayerId: 'chirps_r99p_2024', available: true },
  { id: 'oef_chirps_r99p_clim', name: 'Precipitation R99p Baseline',  group: 'climate_extreme', color: '#1d4ed8', tileLayerId: 'chirps_r99p_clim', available: true },
  { id: 'oef_chirps_rx1day_2024', name: 'Max 1-Day Precip 2024',     group: 'climate_extreme', color: '#1e3a8a', tileLayerId: 'chirps_rx1day_2024', available: true },
  { id: 'oef_chirps_rx1day_clim', name: 'Max 1-Day Precip Baseline', group: 'climate_extreme', color: '#2563eb', tileLayerId: 'chirps_rx1day_clim', available: true },
  { id: 'oef_chirps_rx5day_2024', name: 'Max 5-Day Precip 2024',     group: 'climate_extreme', color: '#172554', tileLayerId: 'chirps_rx5day_2024', available: true },
  { id: 'oef_chirps_rx5day_clim', name: 'Max 5-Day Precip Baseline', group: 'climate_extreme', color: '#1d4ed8', tileLayerId: 'chirps_rx5day_clim', available: true },

  // ── Extreme Climate Indices — Temperature (ERA5-Land) ──────────────────────
  { id: 'oef_era5_tnx_2024',   name: 'Min Night Temp 2024 (TNx)',    group: 'climate_extreme', color: '#f97316', tileLayerId: 'era5_tnx_2024',   available: true },
  { id: 'oef_era5_tnx_clim',   name: 'Min Night Temp Baseline',      group: 'climate_extreme', color: '#fb923c', tileLayerId: 'era5_tnx_clim',   available: true },
  { id: 'oef_era5_tx90p_2024', name: 'Hot Days TX90p 2024',          group: 'climate_extreme', color: '#dc2626', tileLayerId: 'era5_tx90p_2024', available: true },
  { id: 'oef_era5_tx90p_clim', name: 'Hot Days TX90p Baseline',      group: 'climate_extreme', color: '#ef4444', tileLayerId: 'era5_tx90p_clim', available: true },
  { id: 'oef_era5_tx99p_2024', name: 'Extreme Heat TX99p 2024',      group: 'climate_extreme', color: '#991b1b', tileLayerId: 'era5_tx99p_2024', available: true },
  { id: 'oef_era5_tx99p_clim', name: 'Extreme Heat TX99p Baseline',  group: 'climate_extreme', color: '#b91c1c', tileLayerId: 'era5_tx99p_clim', available: true },
  { id: 'oef_era5_txx_2024',   name: 'Max Temp 2024 (TXx)',          group: 'climate_extreme', color: '#7f1d1d', tileLayerId: 'era5_txx_2024',   available: true },
  { id: 'oef_era5_txx_clim',   name: 'Max Temp Baseline (TXx)',      group: 'climate_extreme', color: '#991b1b', tileLayerId: 'era5_txx_clim',   available: true },

  // ── Heatwave Magnitude Index ───────────────────────────────────────────────
  { id: 'oef_hwm_2024',      name: 'Heatwave Magnitude 2024',       group: 'climate_extreme', color: '#d00000', tileLayerId: 'hwm_2024',      available: true },
  { id: 'oef_hwm_clim',      name: 'Heatwave Magnitude Baseline',   group: 'climate_extreme', color: '#e63946', tileLayerId: 'hwm_clim',      available: true },

  // ── Climate Projections — Heatwave ─────────────────────────────────────────
  { id: 'oef_hwm_2030s_245', name: 'HWM 2030s SSP2-4.5',           group: 'climate_projections', color: '#f97316', tileLayerId: 'hwm_2030s_245', available: true },
  { id: 'oef_hwm_2030s_585', name: 'HWM 2030s SSP5-8.5',           group: 'climate_projections', color: '#dc2626', tileLayerId: 'hwm_2030s_585', available: true },
  { id: 'oef_hwm_2050s_585', name: 'HWM 2050s SSP5-8.5',           group: 'climate_projections', color: '#b91c1c', tileLayerId: 'hwm_2050s_585', available: true },
  { id: 'oef_hwm_2100s_585', name: 'HWM 2100s SSP5-8.5',           group: 'climate_projections', color: '#7f1d1d', tileLayerId: 'hwm_2100s_585', available: true },

  // ── Climate Projections — Flood Risk ───────────────────────────────────────
  { id: 'oef_fri_2024',      name: 'Flood Risk Index 2024',          group: 'climate_projections', color: '#1d4ed8', tileLayerId: 'fri_2024',      available: true },
  { id: 'oef_fri_2030s_245', name: 'FRI 2030s SSP2-4.5',            group: 'climate_projections', color: '#2563eb', tileLayerId: 'fri_2030s_245', available: true },
  { id: 'oef_fri_2030s_585', name: 'FRI 2030s SSP5-8.5',            group: 'climate_projections', color: '#1e40af', tileLayerId: 'fri_2030s_585', available: true },
  { id: 'oef_fri_2050s_245', name: 'FRI 2050s SSP2-4.5',            group: 'climate_projections', color: '#1e3a8a', tileLayerId: 'fri_2050s_245', available: true },
  { id: 'oef_fri_2050s_585', name: 'FRI 2050s SSP5-8.5',            group: 'climate_projections', color: '#172554', tileLayerId: 'fri_2050s_585', available: true },
  { id: 'oef_fri_2100s_245', name: 'FRI 2100s SSP2-4.5',            group: 'climate_projections', color: '#0f172a', tileLayerId: 'fri_2100s_245', available: true },
  { id: 'oef_fri_2100s_585', name: 'FRI 2100s SSP5-8.5',            group: 'climate_projections', color: '#020617', tileLayerId: 'fri_2100s_585', available: true },
];

// Total count
export const TOTAL_TILE_LAYERS = TILE_LAYERS.length;

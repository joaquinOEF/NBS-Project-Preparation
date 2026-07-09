// ============================================================================
// GEOSPATIAL LAYER CATALOG — shared between site explorer + concept note map
// Ported from Geo-Layer-Viewer (joaquinOEF/Geo-Layer-Viewer)
// ============================================================================

export type LayerSource = 'geojson' | 'tiles';
export type LayerGroup =
  | 'risk_analysis'    // Existing: flood/heat/landslide from grid
  | 'flood_indices'    // Catalog poa_flood_hazard overlay
  | 'heat_indices'     // Catalog poa_heat_hazard overlay
  | 'landslide_indices' // Catalog poa_landslide_hazard overlay
  | 'environment'      // Existing: elevation, landcover, water, rivers, forest
  | 'urban_land'       // New: Dynamic World, GHSL, VIIRS
  | 'ecology'          // New: NDVI, Hansen, Solar
  | 'population'       // New: GHSL Population, Census, Transit
  | 'hydrology'        // New: DEM, MERIT, JRC, Flood Depth
  | 'climate_extreme'  // New: CHIRPS, ERA5
  | 'climate_projections'; // New: FRI, HWM projections

// Value-tile encoding from OEF GitHub catalog (datasets.yaml).
// Both kinds read the same 24-bit value: raw = R + 256*G + 65536*B
//   numeric:     value    = (raw + offset) / scale
//   categorical: class_id = raw + offset
// Most categorical layers encode the class directly (offset 0, G=B=0), but the
// catalog's `class_lookup` layers reserve raw 0 for nodata and store class+1 —
// those declare `offset: -1` and `nodata: 0`. Decoding those with the old
// `class_id = R` rule silently shifted every label by one.
export interface ValueTileEncoding {
  type: "numeric" | "categorical";
  scale?: number;
  offset?: number;
  unit?: string;
  urlTemplate?: string;
  classes?: Record<number, string>;
  /** Raw 24-bit value meaning "no data". Decodes to null. */
  nodata?: number;
}

export interface TileLayerDef {
  id: string;
  name: string;
  group: LayerGroup;
  color: string;
  tileLayerId: string; // maps to /api/geospatial/tiles/{tileLayerId}/{z}/{x}/{y}.png
  available: boolean;
  hasValueTiles?: boolean;
  valueEncoding?: ValueTileEncoding;
  // Visual (RGB) tile URL override for layers NOT served by the catalog tile
  // proxy — e.g. the local pre-rendered risk tiles under client/public/tiles/.
  // When absent, the proxy path `/api/geospatial/tiles/{tileLayerId}/…` is used.
  visualUrlTemplate?: string;
}

// Pre-rendered risk analysis layers (250m grid, generated locally)
// Visual tiles: client/public/tiles/{name}/{z}/{x}/{y}.png
// Value tiles:  client/public/tiles_values/{name}/{z}/{x}/{y}.png
// Decode: value = (R + 256*G) / 1000 (scale=1000, offset=0, unit="index 0–1")
export const LOCAL_RISK_LAYERS: TileLayerDef[] = [
  {
    // Catalog poa_flood_risk — validated H×E×V composite (S3, 24-bit, scale 10000).
    // Replaces the old locally-computed flood_score (_local_flood_risk).
    id: 'risk_flood_250m', name: 'Flood Risk (H×E×V)', group: 'risk_analysis', color: '#1d4ed8',
    tileLayerId: 'poa_flood_risk', available: true, hasValueTiles: true,
    valueEncoding: { type: 'numeric', scale: 10000, offset: 0, unit: 'index 0–1',
      urlTemplate: 'https://geo-test-api.s3.us-east-1.amazonaws.com/oef_calculation/release/v1/porto_alegre/climate_hazards/floods/risk/tiles_values/{z}/{x}/{y}.png' },
  },
  {
    // Catalog poa_heat_risk — validated H×E×V composite (S3, 24-bit, scale 10000).
    // Replaces the old locally-computed heat_score (_local_heat_risk).
    id: 'risk_heat_250m', name: 'Heat Risk (H×E×V)', group: 'risk_analysis', color: '#dc2626',
    tileLayerId: 'poa_heat_risk', available: true, hasValueTiles: true,
    valueEncoding: { type: 'numeric', scale: 10000, offset: 0, unit: 'index 0–1',
      urlTemplate: 'https://geo-test-api.s3.us-east-1.amazonaws.com/oef_calculation/release/v1/porto_alegre/climate_hazards/heat/risk/tiles_values/{z}/{x}/{y}.png' },
  },
  {
    // Catalog poa_landslide_risk — validated H×E×V composite (S3, 24-bit, scale 10000).
    // Replaces the old locally-computed landslide_score (_local_landslide_risk).
    // NOTE the catalog path is `landslides` (PLURAL, like `floods`).
    id: 'risk_landslide_250m', name: 'Landslide Risk (H×E×V)', group: 'risk_analysis', color: '#a16207',
    tileLayerId: 'poa_landslide_risk', available: true, hasValueTiles: true,
    valueEncoding: { type: 'numeric', scale: 10000, offset: 0, unit: 'index 0–1',
      urlTemplate: 'https://geo-test-api.s3.us-east-1.amazonaws.com/oef_calculation/release/v1/porto_alegre/climate_hazards/landslides/risk/tiles_values/{z}/{x}/{y}.png' },
  },
  {
    id: 'risk_composite_hotspot', name: 'Risk Hotspots (all)', group: 'risk_analysis', color: '#8b5cf6',
    tileLayerId: '_local_composite_hotspot', available: true,
    visualUrlTemplate: '/tiles/composite_hotspot/{z}/{x}/{y}.png',
  },
];

// Catalog hazard overlays (poa_<haz>_hazard), S3-backed. CONSISTENT across all
// three hazards: each ships only the gap-free HAZARD overlay here + the H×E×V
// RISK card in LOCAL_RISK_LAYERS. The exposure/vulnerability component tiles are
// intentionally NOT exposed — risk already folds E and V in, and the standalone
// E/V tiles add no decision value (and 403 outside the deploy network).
// Value tiles: 24-bit RGB, scale 10000 → value = (R + 256*G + 65536*B) / 10000.
const CLIMATE_HAZARDS_BASE =
  'https://geo-test-api.s3.us-east-1.amazonaws.com/oef_calculation/release/v1/porto_alegre/climate_hazards';
const hazardIndexEncoding = (hazardPath: string, component: string): ValueTileEncoding => ({
  type: 'numeric', scale: 10000, offset: 0, unit: 'index 0–1',
  urlTemplate: `${CLIMATE_HAZARDS_BASE}/${hazardPath}/${component}/tiles_values/{z}/{x}/{y}.png`,
});

export const FLOOD_INDEX_LAYERS: TileLayerDef[] = [
  {
    id: 'poa_flood_hazard', name: 'Flood Hazard', group: 'flood_indices', color: '#2563eb',
    tileLayerId: 'poa_flood_hazard', available: true, hasValueTiles: true,
    valueEncoding: hazardIndexEncoding('floods', 'hazard'),
  },
  {
    // Catalog dataset_id: poa_flood_mechanism_type (class_lookup, 250 m).
    // Value tiles store class+1 so raw 0 can mean nodata — hence offset -1.
    // Porto Alegre's raster only contains riverine, low-lying and mixed;
    // pluvial and drainage_constrained never occur (drainage is a proxy until
    // municipal drainage data exists).
    id: 'poa_flood_mechanism', name: 'Flood Mechanism', group: 'flood_indices', color: '#7b3294',
    tileLayerId: 'poa_flood_mechanism', available: true, hasValueTiles: true,
    valueEncoding: {
      type: 'categorical', offset: -1, nodata: 0,
      urlTemplate: `${CLIMATE_HAZARDS_BASE}/floods/flood_mechanism/tiles_values/{z}/{x}/{y}.png`,
      classes: {
        0: 'None', 1: 'Riverine', 2: 'Pluvial',
        3: 'Low-lying', 4: 'Drainage constrained', 5: 'Mixed',
      },
    },
  },
];

export const HEAT_INDEX_LAYERS: TileLayerDef[] = [
  {
    id: 'poa_heat_hazard', name: 'Heat Hazard', group: 'heat_indices', color: '#ea580c',
    tileLayerId: 'poa_heat_hazard', available: true, hasValueTiles: true,
    valueEncoding: hazardIndexEncoding('heat', 'hazard'),
  },
];

// Landslide hazard overlay — catalog path is `landslides` (PLURAL, like `floods`).
export const LANDSLIDE_INDEX_LAYERS: TileLayerDef[] = [
  {
    id: 'poa_landslide_hazard', name: 'Landslide Hazard', group: 'landslide_indices', color: '#a16207',
    tileLayerId: 'poa_landslide_hazard', available: true, hasValueTiles: true,
    valueEncoding: hazardIndexEncoding('landslides', 'hazard'),
  },
];

// Groups for the layer selector UI
export const TILE_LAYER_GROUPS: Array<{ id: LayerGroup; label: string }> = [
  { id: 'urban_land', label: 'Land Use & Urban Form' },
  { id: 'ecology', label: 'Environment & Ecology' },
  { id: 'population', label: 'Population & Society' },
  { id: 'hydrology', label: 'Hydrology & Terrain' },
  { id: 'climate_extreme', label: 'Extreme Climate Indices' },
  { id: 'climate_projections', label: 'Climate Projections' },
];

// S3 base URL for value tiles
const S3 = "https://geo-test-api.s3.us-east-1.amazonaws.com";
const vtUrl = (path: string) => `${S3}/${path}/tiles_values/{z}/{x}/{y}.png`;

// All tile layers from the OEF geospatial-data catalog
export const TILE_LAYERS: TileLayerDef[] = [
  // ── Land Use & Urban Form ──────────────────────────────────────────────────
  {
    id: 'oef_dynamic_world', name: 'Land Use (Dynamic World)', group: 'urban_land', color: '#06d6a0',
    tileLayerId: 'dynamic_world', available: true, hasValueTiles: true,
    valueEncoding: {
      type: "categorical",
      urlTemplate: vtUrl("dynamic_world/release/v1/2023/porto_alegre"),
      classes: { 0:"Water", 1:"Trees", 2:"Grass", 3:"Flooded veg", 4:"Crops", 5:"Shrub", 6:"Built", 7:"Bare", 8:"Snow" },
    },
  },
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
  { id: 'oef_merit_elv',      name: 'Terrain Elevation (MERIT)',      group: 'hydrology', color: '#bc6c25', tileLayerId: 'merit_elv',            available: true, hasValueTiles: true,
    valueEncoding: { type: 'numeric', scale: 100, offset: 0, unit: 'm',
      urlTemplate: 'https://geo-test-api.s3.us-east-1.amazonaws.com/merit_hydro/release/v1/porto_alegre/elv/tiles_values/{z}/{x}/{y}.png' } },
  { id: 'oef_merit_upa',      name: 'Upstream Area (MERIT)',          group: 'hydrology', color: '#0369a1', tileLayerId: 'merit_upa',            available: true, hasValueTiles: true,
    valueEncoding: { type: 'numeric', scale: 1, offset: 0, unit: 'cells',
      urlTemplate: 'https://geo-test-api.s3.us-east-1.amazonaws.com/merit_hydro/release/v1/porto_alegre/upa/tiles_values/{z}/{x}/{y}.png' } },
  { id: 'oef_merit_hydro',    name: 'Height Above Drainage (MERIT)', group: 'hydrology', color: '#0ea5e9', tileLayerId: 'merit_hydro_hand',     available: true, hasValueTiles: true,
    valueEncoding: { type: 'numeric', scale: 1, offset: 0, unit: 'm',
      urlTemplate: 'https://geo-test-api.s3.us-east-1.amazonaws.com/merit_hydro/release/v1/porto_alegre/hnd/tiles_values/{z}/{x}/{y}.png' } },
  { id: 'oef_emsn194',        name: '2024 Flood Depth (Copernicus)', group: 'hydrology', color: '#1d4ed8', tileLayerId: 'copernicus_emsn194',   available: true },
  { id: 'oef_jrc_occurrence',  name: 'Surface Water Occurrence',      group: 'hydrology', color: '#1d4ed8', tileLayerId: 'jrc_occurrence',       available: true },
  { id: 'oef_jrc_seasonality', name: 'Surface Water Seasonality',     group: 'hydrology', color: '#0891b2', tileLayerId: 'jrc_seasonality',      available: true },
  { id: 'oef_jrc_change',     name: 'Surface Water Change',           group: 'hydrology', color: '#0077b6', tileLayerId: 'jrc_surface_water',    available: true },
  { id: 'oef_hansen_treecover',name: 'Tree Cover 2000 (Hansen)',      group: 'hydrology', color: '#166534', tileLayerId: 'hansen_treecover2000', available: true },

  // ── Extreme Climate Indices — Precipitation (CHIRPS) ───────────────────────
  // All CHIRPS layers have confirmed accessible value_tiles (scale=100)
  { id: 'oef_chirps_r90p_2024', name: 'Precipitation R90p 2024',      group: 'climate_extreme', color: '#1e40af', tileLayerId: 'chirps_r90p_2024', available: true, hasValueTiles: true,
    valueEncoding: { type: "numeric", scale: 100, offset: 49960, unit: "mm", urlTemplate: vtUrl("nbs/porto_alegre/climate_hazards/extreme_precipitation/chirps/V2_0/2024/r90p") } },
  { id: 'oef_chirps_r90p_clim', name: 'Precipitation R90p Baseline',  group: 'climate_extreme', color: '#3b82f6', tileLayerId: 'chirps_r90p_clim', available: true, hasValueTiles: true,
    valueEncoding: { type: "numeric", scale: 100, offset: 37045, unit: "mm", urlTemplate: vtUrl("nbs/porto_alegre/climate_hazards/extreme_precipitation/chirps/V2_0/annual_climatology/r90p") } },
  { id: 'oef_chirps_r95p_2024', name: 'Precipitation R95p 2024',      group: 'climate_extreme', color: '#1e3a8a', tileLayerId: 'chirps_r95p_2024', available: true, hasValueTiles: true,
    valueEncoding: { type: "numeric", scale: 100, offset: 31068, unit: "mm", urlTemplate: vtUrl("nbs/porto_alegre/climate_hazards/extreme_precipitation/chirps/V2_0/2024/r95p") } },
  { id: 'oef_chirps_r95p_clim', name: 'Precipitation R95p Baseline',  group: 'climate_extreme', color: '#2563eb', tileLayerId: 'chirps_r95p_clim', available: true, hasValueTiles: true,
    valueEncoding: { type: "numeric", scale: 100, offset: 21819, unit: "mm", urlTemplate: vtUrl("nbs/porto_alegre/climate_hazards/extreme_precipitation/chirps/V2_0/annual_climatology/r95p") } },
  { id: 'oef_chirps_r99p_2024', name: 'Precipitation R99p 2024',      group: 'climate_extreme', color: '#172554', tileLayerId: 'chirps_r99p_2024', available: true, hasValueTiles: true,
    valueEncoding: { type: "numeric", scale: 100, offset: 12196, unit: "mm", urlTemplate: vtUrl("nbs/porto_alegre/climate_hazards/extreme_precipitation/chirps/V2_0/2024/r99p") } },
  { id: 'oef_chirps_r99p_clim', name: 'Precipitation R99p Baseline',  group: 'climate_extreme', color: '#1d4ed8', tileLayerId: 'chirps_r99p_clim', available: true, hasValueTiles: true,
    valueEncoding: { type: "numeric", scale: 100, offset: 8476, unit: "mm", urlTemplate: vtUrl("nbs/porto_alegre/climate_hazards/extreme_precipitation/chirps/V2_0/annual_climatology/r99p") } },
  { id: 'oef_chirps_rx1day_2024', name: 'Max 1-Day Precip 2024',     group: 'climate_extreme', color: '#1e3a8a', tileLayerId: 'chirps_rx1day_2024', available: true, hasValueTiles: true,
    valueEncoding: { type: "numeric", scale: 100, offset: 6459, unit: "mm", urlTemplate: vtUrl("nbs/porto_alegre/climate_hazards/extreme_precipitation/chirps/V2_0/2024/rx1day") } },
  { id: 'oef_chirps_rx1day_clim', name: 'Max 1-Day Precip Baseline', group: 'climate_extreme', color: '#2563eb', tileLayerId: 'chirps_rx1day_clim', available: true, hasValueTiles: true,
    valueEncoding: { type: "numeric", scale: 100, offset: 5727, unit: "mm", urlTemplate: vtUrl("nbs/porto_alegre/climate_hazards/extreme_precipitation/chirps/V2_0/annual_climatology/rx1day") } },
  { id: 'oef_chirps_rx5day_2024', name: 'Max 5-Day Precip 2024',     group: 'climate_extreme', color: '#172554', tileLayerId: 'chirps_rx5day_2024', available: true, hasValueTiles: true,
    valueEncoding: { type: "numeric", scale: 100, offset: 17535, unit: "mm", urlTemplate: vtUrl("nbs/porto_alegre/climate_hazards/extreme_precipitation/chirps/V2_0/2024/rx5day") } },
  { id: 'oef_chirps_rx5day_clim', name: 'Max 5-Day Precip Baseline', group: 'climate_extreme', color: '#1d4ed8', tileLayerId: 'chirps_rx5day_clim', available: true, hasValueTiles: true,
    valueEncoding: { type: "numeric", scale: 100, offset: 11014, unit: "mm", urlTemplate: vtUrl("nbs/porto_alegre/climate_hazards/extreme_precipitation/chirps/V2_0/annual_climatology/rx5day") } },

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
  { id: 'oef_hwm_2024', name: 'Heatwave Magnitude 2024', group: 'climate_extreme', color: '#d00000', tileLayerId: 'hwm_2024', available: true, hasValueTiles: true,
    valueEncoding: { type: "numeric", scale: 100, offset: 600, unit: "°C·days", urlTemplate: vtUrl("nbs/porto_alegre/climate_hazards/heatwave_indices/hwm/2024") } },
  { id: 'oef_hwm_clim',      name: 'Heatwave Magnitude Baseline',   group: 'climate_extreme', color: '#e63946', tileLayerId: 'hwm_clim',      available: true },

  // ── Climate Projections — Heatwave ─────────────────────────────────────────
  { id: 'oef_hwm_2030s_245', name: 'HWM 2030s SSP2-4.5', group: 'climate_projections', color: '#f97316', tileLayerId: 'hwm_2030s_245', available: true, hasValueTiles: true,
    valueEncoding: { type: "numeric", scale: 100, offset: 1035, unit: "°C·days", urlTemplate: vtUrl("nbs/porto_alegre/climate_hazards/heatwave_indices/hwm/2030s_ssp245") } },
  { id: 'oef_hwm_2030s_585', name: 'HWM 2030s SSP5-8.5', group: 'climate_projections', color: '#dc2626', tileLayerId: 'hwm_2030s_585', available: true,
    valueEncoding: { type: "numeric", scale: 100, offset: 1003, unit: "°C·days" } },
  { id: 'oef_hwm_2050s_585', name: 'HWM 2050s SSP5-8.5', group: 'climate_projections', color: '#b91c1c', tileLayerId: 'hwm_2050s_585', available: true,
    valueEncoding: { type: "numeric", scale: 100, offset: 1003, unit: "°C·days" } },
  { id: 'oef_hwm_2100s_585', name: 'HWM 2100s SSP5-8.5', group: 'climate_projections', color: '#7f1d1d', tileLayerId: 'hwm_2100s_585', available: true, hasValueTiles: true,
    valueEncoding: { type: "numeric", scale: 100, offset: 2383, unit: "°C·days", urlTemplate: vtUrl("nbs/porto_alegre/climate_hazards/heatwave_indices/hwm/2100s_ssp585") } },

  // ── Climate Projections — Flood Risk ───────────────────────────────────────
  { id: 'oef_fri_2024', name: 'Flood Risk Index 2024', group: 'climate_projections', color: '#1d4ed8', tileLayerId: 'fri_2024', available: true, hasValueTiles: true,
    valueEncoding: { type: "numeric", scale: 100, offset: 6, unit: "index 0–1", urlTemplate: vtUrl("nbs/porto_alegre/climate_hazards/floods/flood_risk_index/oef_calculation/2024") } },
  { id: 'oef_fri_2030s_245', name: 'FRI 2030s SSP2-4.5', group: 'climate_projections', color: '#2563eb', tileLayerId: 'fri_2030s_245', available: true, hasValueTiles: true,
    valueEncoding: { type: "numeric", scale: 100, offset: 1, unit: "index 0–1", urlTemplate: vtUrl("nbs/porto_alegre/climate_hazards/floods/flood_risk_index/oef_calculation/2030s_ssp245") } },
  { id: 'oef_fri_2030s_585', name: 'FRI 2030s SSP5-8.5', group: 'climate_projections', color: '#1e40af', tileLayerId: 'fri_2030s_585', available: true,
    valueEncoding: { type: "numeric", scale: 100, offset: 13, unit: "index 0–1" } },
  { id: 'oef_fri_2050s_245', name: 'FRI 2050s SSP2-4.5', group: 'climate_projections', color: '#1e3a8a', tileLayerId: 'fri_2050s_245', available: true,
    valueEncoding: { type: "numeric", scale: 100, offset: 9, unit: "index 0–1" } },
  { id: 'oef_fri_2050s_585', name: 'FRI 2050s SSP5-8.5', group: 'climate_projections', color: '#172554', tileLayerId: 'fri_2050s_585', available: true, hasValueTiles: true,
    valueEncoding: { type: "numeric", scale: 100, offset: 0, unit: "index 0–1", urlTemplate: vtUrl("nbs/porto_alegre/climate_hazards/floods/flood_risk_index/oef_calculation/2050s_ssp585") } },
  { id: 'oef_fri_2100s_245', name: 'FRI 2100s SSP2-4.5', group: 'climate_projections', color: '#0f172a', tileLayerId: 'fri_2100s_245', available: true,
    valueEncoding: { type: "numeric", scale: 100, offset: 0, unit: "index 0–1" } },
  { id: 'oef_fri_2100s_585', name: 'FRI 2100s SSP5-8.5', group: 'climate_projections', color: '#020617', tileLayerId: 'fri_2100s_585', available: true,
    valueEncoding: { type: "numeric", scale: 100, offset: 0, unit: "index 0–1" } },
];

// Total count
export const TOTAL_TILE_LAYERS = TILE_LAYERS.length;

// Every renderable tile layer in one lookup — the ~48 catalog layers PLUS the
// risk-analysis cards (flood/heat risk, landslide, hotspot) and the flood/heat
// component indices. The map microapps resolve a requested `tileLayers` id
// against THIS, not just TILE_LAYERS, so hazard overlays (poa_flood_hazard,
// poa_heat_hazard, risk_landslide_250m) actually render in the CBO/E2 flow.
export const ALL_TILE_LAYERS: TileLayerDef[] = [
  ...TILE_LAYERS,
  ...LOCAL_RISK_LAYERS,
  ...FLOOD_INDEX_LAYERS,
  ...HEAT_INDEX_LAYERS,
  ...LANDSLIDE_INDEX_LAYERS,
];

/** The visual (RGB) tile URL template for a layer — its local override when set,
 *  else the catalog tile-proxy path. `{z}/{x}/{y}` still need substituting. */
export function tileVisualUrl(layer: TileLayerDef): string {
  return layer.visualUrlTemplate ?? `/api/geospatial/tiles/${layer.tileLayerId}/{z}/{x}/{y}.png`;
}

// ── OSM Reference Layers (fetched from Overpass API) ──────────────────────────

export interface OsmLayerDef {
  id: string;
  name: string;
  color: string;
  endpoint: string; // /api/osm/{id}
}

export const OSM_LAYERS: OsmLayerDef[] = [
  { id: 'osm_parks',     name: 'Parks & Green Space',  color: '#22c55e', endpoint: '/api/osm/parks' },
  { id: 'osm_schools',   name: 'Schools & Education',  color: '#f59e0b', endpoint: '/api/osm/schools' },
  { id: 'osm_hospitals', name: 'Hospitals & Health',    color: '#ef4444', endpoint: '/api/osm/hospitals' },
  { id: 'osm_wetlands',  name: 'Wetlands',             color: '#3b82f6', endpoint: '/api/osm/wetlands' },
];

// ── Reference Data Layers (GeoJSON, loaded from sample-data) ──────────────────

export interface ReferenceLayerDef {
  id: string;
  name: string;
  color: string;
  dataPath: string; // path relative to /sample-data/
}

export const REFERENCE_LAYERS: ReferenceLayerDef[] = [
  { id: 'ibge_census', name: 'Census / Poverty by Neighborhood', color: '#a855f7', dataPath: '/sample-data/porto-alegre-ibge-indicators.json' },
  { id: 'ibge_settlements', name: 'Informal Settlements', color: '#f43f5e', dataPath: '/sample-data/porto-alegre-ibge-settlements.json' },
  { id: 'flood_2024_extent', name: '2024 Flood Extent (observed)', color: '#60a5fa', dataPath: '/sample-data/porto-alegre-flood-2024.json' },
];

// ── Spatial Queries (vector × raster intersection) ────────────────────────────

export interface SpatialQueryDef {
  id: string;
  name: string;
  color: string;
  vectorSource: string;  // OSM layer endpoint or static GeoJSON path
  rasterLayerId: string; // TILE_LAYERS id to sample
  threshold: number;
  comparator: '>' | '>=' | '<' | '<=';
  valueKey: string;      // property name for the sampled value
  tooltipLabel: string;  // e.g. "High flood risk"
  tooltipIcon: string;   // emoji for tooltip
}

export const SPATIAL_QUERIES: SpatialQueryDef[] = [
  {
    id: 'sq_parks_flood',
    name: 'Parks in Flood Risk > 0.3',
    color: '#ef4444',
    vectorSource: '/api/osm/parks',
    rasterLayerId: 'risk_flood_250m',
    threshold: 0.3,
    comparator: '>',
    valueKey: 'flood_risk_250m',
    tooltipLabel: 'High flood risk',
    tooltipIcon: '⚠',
  },
  {
    id: 'sq_schools_flood',
    name: 'Schools in Flood Risk > 0.3',
    color: '#dc2626',
    vectorSource: '/api/osm/schools',
    rasterLayerId: 'risk_flood_250m',
    threshold: 0.3,
    comparator: '>',
    valueKey: 'flood_risk_250m',
    tooltipLabel: 'High flood risk',
    tooltipIcon: '⚠',
  },
  {
    id: 'sq_hospitals_flood',
    name: 'Hospitals in Flood Risk > 0.3',
    color: '#b91c1c',
    vectorSource: '/api/osm/hospitals',
    rasterLayerId: 'risk_flood_250m',
    threshold: 0.3,
    comparator: '>',
    valueKey: 'flood_risk_250m',
    tooltipLabel: 'High flood risk',
    tooltipIcon: '⚠',
  },
  {
    id: 'sq_parks_heatwave',
    name: 'Parks in Heatwave >= 10 °C·d',
    color: '#fb923c',
    vectorSource: '/api/osm/parks',
    rasterLayerId: 'oef_hwm_2024',
    threshold: 10,
    comparator: '>=',
    valueKey: 'hwm_value',
    tooltipLabel: 'Heatwave zone',
    tooltipIcon: '🌡',
  },
  {
    id: 'sq_schools_heatwave',
    name: 'Schools in Heatwave >= 10 °C·d',
    color: '#ea580c',
    vectorSource: '/api/osm/schools',
    rasterLayerId: 'oef_hwm_2024',
    threshold: 10,
    comparator: '>=',
    valueKey: 'hwm_value',
    tooltipLabel: 'Heatwave zone',
    tooltipIcon: '🌡',
  },
  {
    id: 'sq_wetlands_flood',
    name: 'Wetlands in Flood Risk > 0.3',
    color: '#7c3aed',
    vectorSource: '/api/osm/wetlands',
    rasterLayerId: 'risk_flood_250m',
    threshold: 0.3,
    comparator: '>',
    valueKey: 'flood_risk_250m',
    tooltipLabel: 'High flood risk',
    tooltipIcon: '⚠',
  },
  // ── Spatial queries using local 250m risk scores (more accurate than FRI) ──
  {
    id: 'sq_parks_flood_250m',
    // Catalog poa_flood_risk (H×E×V). Threshold recalibrated 0.4→0.3: catalog risk maxes
    // ~0.585 (p95≈0.55), so 0.4 was ~p90; 0.3 captures the meaningfully at-risk band.
    name: 'Parks in Flood Risk > 0.3',
    color: '#b91c1c',
    vectorSource: '/api/osm/parks',
    rasterLayerId: 'risk_flood_250m',
    threshold: 0.3,
    comparator: '>',
    valueKey: 'flood_risk_250m',
    tooltipLabel: 'High flood risk',
    tooltipIcon: '🌊',
  },
  {
    id: 'sq_schools_heat_250m',
    // Catalog poa_heat_risk (H×E×V). Threshold recalibrated 0.4→0.3 to match the
    // flood card: an H×E×V geometric mean sits lower than the old single-factor
    // heat score, so 0.3 captures the meaningfully at-risk band.
    name: 'Schools in Heat Risk > 0.3',
    color: '#991b1b',
    vectorSource: '/api/osm/schools',
    rasterLayerId: 'risk_heat_250m',
    threshold: 0.3,
    comparator: '>',
    valueKey: 'heat_risk_250m',
    tooltipLabel: 'High heat risk',
    tooltipIcon: '🔥',
  },
  {
    id: 'sq_hospitals_flood_250m',
    name: 'Hospitals in Flood Risk > 0.3',
    color: '#7f1d1d',
    vectorSource: '/api/osm/hospitals',
    rasterLayerId: 'risk_flood_250m',
    threshold: 0.3,
    comparator: '>',
    valueKey: 'flood_risk_250m',
    tooltipLabel: 'High flood risk',
    tooltipIcon: '🌊',
  },
  {
    // Landslide parity (catalog poa_landslide_risk). Same 0.3 cutoff as flood/heat.
    id: 'sq_schools_landslide_250m',
    name: 'Schools in Landslide Risk > 0.3',
    color: '#92400e',
    vectorSource: '/api/osm/schools',
    rasterLayerId: 'risk_landslide_250m',
    threshold: 0.3,
    comparator: '>',
    valueKey: 'landslide_risk_250m',
    tooltipLabel: 'High landslide risk',
    tooltipIcon: '⛰️',
  },
];

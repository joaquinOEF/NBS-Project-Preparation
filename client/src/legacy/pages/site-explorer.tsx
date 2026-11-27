import { useParams, Link } from 'wouter';
import { useQuery, useMutation } from '@tanstack/react-query';
import { ArrowLeft, Loader2, Layers, Mountain, Droplets, Trees, Users, Map as MapIcon, Grid3X3, Flame, CloudRain, Building2, MapPinned, MapPin, X, Plus, Check, DollarSign, Clock, Wrench, ChevronRight, ChevronDown, ChevronUp, AlertTriangle, Leaf, Trash2, CheckCircle, Eye, EyeOff, Search, Info } from 'lucide-react';
import { useNavigationPersistence } from '@/core/hooks/useNavigationPersistence';
import { Button } from '@/core/components/ui/button';
import { Header } from '@/core/components/layout/header';
import { Badge } from '@/core/components/ui/badge';
import { Switch } from '@/core/components/ui/switch';
import { Label } from '@/core/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/core/components/ui/card';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/core/components/ui/accordion';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from '@/core/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/core/components/ui/tabs';
import { Input } from '@/core/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/core/components/ui/select';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/core/components/ui/tooltip';
import { useToast } from '@/core/hooks/use-toast';
import { useTranslation } from 'react-i18next';
import { useProjectContext, SelectedZone, SelectedIntervention } from '@/core/contexts/project-context';
import { useChatState } from '@/core/contexts/chat-context';
import { 
  useSampleData, 
  loadSampleBoundaryData, 
  loadSampleElevationData,
  loadSampleLandcoverData,
  loadSampleSurfaceWaterData,
  loadSampleRiversData,
  loadSampleForestData,
  loadSamplePopulationData,
  loadSampleGridData,
  loadSampleZonesData,
} from '@/core/contexts/sample-data-context';
import { useSampleRoute } from '@/core/hooks/useSampleRoute';
import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import * as turf from '@turf/turf';
import { apiRequest } from '@/core/lib/queryClient';
import { TILE_LAYERS, ALL_TILE_LAYERS, TILE_LAYER_GROUPS, OSM_LAYERS, SPATIAL_QUERIES, LOCAL_RISK_LAYERS, FLOOD_INDEX_LAYERS, HEAT_INDEX_LAYERS, LANDSLIDE_INDEX_LAYERS, SGB_SUSC_TILE_LAYERS, ARVC_HAZARD_TILE_LAYERS, OFFICIAL_VECTOR_LAYERS, HAZARD_OVERLAP_LAYERS, tileVisualUrl, type LayerSource as SharedLayerSource } from '@shared/geospatial-layers';
import { sectorColors, sectorPopupHtml, SECTOR_POPUP_LABELS_EN as SECTOR_POPUP_LABELS } from '@shared/official-risk';
import {
  ARVC_OFFICIAL_LAYERS,
  ARVC_OFFICIAL_MANIFEST,
  ARVC_OFFICIAL_BOUNDS,
  ARVC_OFFICIAL_NOTE,
  arvcOfficialPngUrl,
  arvcOfficialLayer,
  decodeArvcFromRgb,
  formatArvcReading,
  type ArvcOfficialManifest,
} from '@shared/arvc-official';
import { riskBand, pct100, dominantPercentile, hazardPercentile, riskAnchor, TYPOLOGY_COLORS, type HazardKey } from '@shared/risk-display';
import { LayerLegend } from '@/core/components/map/LayerLegend';
import type { LegendIndex } from '@shared/legend-types';
import { EXPLORER_KEY_MAPS, explorerKeyMap, isExplorerKeyMapId, CENSUS_POVERTY_CLASSES, CENSUS_POVERTY_FIELD, CENSUS_NO_DATA_COLOR, censusPovertyColor, type ExplorerKeyMapId } from '@shared/explorer-key-maps';
import { buildSpatialQueryLayer } from '@/lib/spatialQueryBuilder';
import { onExplorerMapCommand, EXPLORER_PIN_CLICKED_EVENT, type ExplorerMapCommand, type ExplorerMapContext, type ExplorerPinnedPlace } from '@/legacy/lib/explorerMapCommands';
import ValueTooltip from '@/core/components/maps/ValueTooltip';
import { BASEMAPS } from '@/core/lib/basemaps';

interface BoundaryData {
  cityLocode: string;
  cityName: string;
  centroid: [number, number];
  bbox: [number, number, number, number];
  boundaryGeoJson: any;
}

interface ElevationData {
  cityLocode: string;
  bounds: { minLng: number; minLat: number; maxLng: number; maxLat: number };
  elevationData: {
    width: number;
    height: number;
    cellSize: number;
    minElevation: number;
    maxElevation: number;
  };
  contours: any;
}

interface Project {
  id: string;
  actionId: string;
  actionName: string;
  actionDescription: string;
  actionType: string;
  cityId: string;
  status: string;
}

interface CityInfo {
  name: string;
  locode: string;
  country: string;
}

// Re-exported from the shared catalog rather than re-declared: a local copy had
// already drifted, and silently narrowed 'image' out of existence — the layers
// still rendered, because the group id was being cast, and only the source
// comparison failed to typecheck.
type LayerSource = SharedLayerSource;
// A superset of the shared LayerGroup: the site explorer has its own groups
// (analysis, reference_data, osm_reference, spatial_queries, risk_250m) that no
// other surface knows about.
type LayerGroupId = 'analysis' | 'environment' | 'reference_data' | 'osm_reference' | 'spatial_queries' | 'risk_250m' | 'flood_indices' | 'heat_indices' | 'landslide_indices' | 'urban_land' | 'ecology' | 'population' | 'hydrology' | 'climate_extreme' | 'climate_projections' | 'official_risk' | 'arvc_official' | 'arvc';

interface LayerState {
  id: string;
  name: string;
  icon: any;
  color: string;
  enabled: boolean;
  loaded: boolean;
  data: any;
  leafletLayer: L.Layer | null;
  source: LayerSource;
  group: LayerGroupId;
  available: boolean;
  tileLayerId?: string;
  hasValueTiles?: boolean;
  valueEncoding?: import('@shared/geospatial-layers').ValueTileEncoding;
  /** Tooltip on the layer button (from the shared catalogue). */
  description?: string;
}

type LayerConfig = Omit<LayerState, 'enabled' | 'loaded' | 'data' | 'leafletLayer'>;

// Names in the official group read "what it shows · source". Local to the
// explorer: the shared catalogue names are also read by the CBO tour.
const OFFICIAL_GROUP_NAMES: Record<string, string> = {
  sgb_flood_susc: 'Flood susceptibility · SGB/CPRM 2015',
  flood_2024_extent: 'May 2024 flood extent · observed',
  sgb_landslide_susc: 'Landslide susceptibility · SGB/CPRM 2015',
  sgb_setores_risco: 'Surveyed risk sectors · SGB 2022',
  // The climate plan's 2050 hazard as tiles on the app's hazard ramp — what the
  // org tour shows. The same surfaces in the plan's own palette follow below.
  arvc_flood_hazard: 'River-flood hazard 2050 · climate plan (PLAC)',
  arvc_heat_hazard: 'Heat-wave hazard 2050 · climate plan (PLAC)',
  arvc_landslide_hazard: 'Landslide hazard 2050 · climate plan (PLAC)',
};
// Same red as the org tour's outline (MapMicroapp FLOOD_2024_STYLE): the event
// must read as a line over SGB's blue classes, not as one more step of them.
const FLOOD_2024_OUTLINE = '#d7301f';

const LAYER_CONFIGS: LayerConfig[] = [
  { id: 'intervention_zones', name: 'Neighborhood Zones', icon: MapPinned, color: '#10b981', source: 'geojson', group: 'analysis', available: true },
  { id: 'ibge_census', name: 'Households in poverty · IBGE Census', icon: Users, color: '#a855f7', source: 'geojson', group: 'reference_data' as LayerGroupId, available: true },
  { id: 'ibge_settlements', name: 'Informal settlements · IBGE', icon: AlertTriangle, color: '#f43f5e', source: 'geojson', group: 'reference_data' as LayerGroupId, available: true },
  { id: 'elevation', name: 'Elevation', icon: Mountain, color: '#c9a87c', source: 'geojson', group: 'environment', available: true },
  { id: 'landcover', name: 'Land Cover', icon: MapIcon, color: '#4ade80', source: 'geojson', group: 'environment', available: true },
  { id: 'surface_water', name: 'Water Bodies', icon: Droplets, color: '#3b82f6', source: 'geojson', group: 'environment', available: true },
  { id: 'rivers', name: 'Rivers', icon: Droplets, color: '#06b6d4', source: 'geojson', group: 'environment', available: true },
  { id: 'forest', name: 'Forest', icon: Trees, color: '#22c55e', source: 'geojson', group: 'environment', available: true },
  // OSM reference layers (fetched from Overpass API)
  ...OSM_LAYERS.map(l => ({
    id: l.id,
    name: l.name,
    icon: MapPin,
    color: l.color,
    source: 'geojson' as LayerSource,
    group: 'osm_reference' as LayerGroupId,
    available: true,
  })),
  // Spatial query layers (vector × raster intersection)
  ...SPATIAL_QUERIES.map(q => ({
    id: q.id,
    name: q.name,
    icon: AlertTriangle,
    color: q.color,
    source: 'geojson' as LayerSource,
    group: 'spatial_queries' as LayerGroupId,
    available: true,
  })),
  // Local 250m risk layers (pre-rendered tiles)
  ...LOCAL_RISK_LAYERS.map(l => ({
    id: l.id,
    name: l.name,
    icon: AlertTriangle,
    color: l.color,
    source: 'tiles' as LayerSource,
    group: 'risk_250m' as LayerGroupId,
    available: true,
    tileLayerId: l.tileLayerId,
    hasValueTiles: l.hasValueTiles,
    valueEncoding: l.valueEncoding,
    description: l.description,
  })),
  // Flood component indices (catalog poa_flood_* — hazard / exposure / vulnerability)
  ...FLOOD_INDEX_LAYERS.map(l => ({
    id: l.id,
    name: l.name,
    icon: AlertTriangle,
    color: l.color,
    source: 'tiles' as LayerSource,
    group: 'flood_indices' as LayerGroupId,
    available: true,
    tileLayerId: l.tileLayerId,
    hasValueTiles: l.hasValueTiles,
    valueEncoding: l.valueEncoding,
  })),
  // Heat hazard overlay (catalog poa_heat_hazard)
  ...HEAT_INDEX_LAYERS.map(l => ({
    id: l.id,
    name: l.name,
    icon: AlertTriangle,
    color: l.color,
    source: 'tiles' as LayerSource,
    group: 'heat_indices' as LayerGroupId,
    available: true,
    tileLayerId: l.tileLayerId,
    hasValueTiles: l.hasValueTiles,
    valueEncoding: l.valueEncoding,
  })),
  // Landslide hazard overlay (catalog poa_landslide_hazard)
  ...LANDSLIDE_INDEX_LAYERS.map(l => ({
    id: l.id,
    name: l.name,
    icon: AlertTriangle,
    color: l.color,
    source: 'tiles' as LayerSource,
    group: 'landslide_indices' as LayerGroupId,
    available: true,
    tileLayerId: l.tileLayerId,
    hasValueTiles: l.hasValueTiles,
    valueEncoding: l.valueEncoding,
  })),
  ...HAZARD_OVERLAP_LAYERS.map(l => ({ id: l.id, name: l.name, icon: Layers, color: l.color, source: 'tiles' as LayerSource, group: 'official_risk' as LayerGroupId, available: true, tileLayerId: l.tileLayerId, hasValueTiles: l.hasValueTiles, description: l.description })),
  // Official risk cartography (SGB/CPRM). The two susceptibility maps are our
  // own tiles cut from the SGB vectors (server/routes/sgbSuscTileRoutes.ts) —
  // not SGB's raw WMS, which paints "Baixa" yellow over the whole city and past
  // its boundary. Each is followed by its companion: the observed May 2024
  // flood beside flood, the surveyed sectors beside landslide.
  ...SGB_SUSC_TILE_LAYERS.flatMap(l => {
    const tiles = {
      id: l.id,
      name: OFFICIAL_GROUP_NAMES[l.id] ?? l.name,
      icon: Layers,
      color: l.color,
      source: 'tiles' as LayerSource,
      group: 'official_risk' as LayerGroupId,
      available: true,
      tileLayerId: l.tileLayerId,
      hasValueTiles: l.hasValueTiles,
      valueEncoding: l.valueEncoding,
    };
    const companions = l.id === 'sgb_flood_susc'
      ? [{ id: 'flood_2024_extent', name: OFFICIAL_GROUP_NAMES.flood_2024_extent, icon: CloudRain, color: FLOOD_2024_OUTLINE }]
      : OFFICIAL_VECTOR_LAYERS.map(v => ({ id: v.id, name: OFFICIAL_GROUP_NAMES[v.id] ?? v.name, icon: AlertTriangle, color: v.color }));
    return [tiles, ...companions.map(c => ({ ...c, source: 'geojson' as LayerSource, group: 'official_risk' as LayerGroupId, available: true }))];
  }),
  // The climate plan's three 2050 hazards as XYZ tiles (YlOrRd, contrast-
  // stretched — server/routes/arvcTileRoutes.ts), first in the plan's group.
  ...ARVC_HAZARD_TILE_LAYERS.map(l => ({
    id: l.id,
    name: OFFICIAL_GROUP_NAMES[l.id] ?? l.name,
    icon: l.id === 'arvc_heat_hazard' ? Flame : l.id === 'arvc_flood_hazard' ? CloudRain : Mountain,
    color: '#f03b20',
    source: 'tiles' as LayerSource,
    group: 'arvc_official' as LayerGroupId,
    available: true,
    tileLayerId: l.tileLayerId,
    hasValueTiles: l.hasValueTiles,
  })),
  // ARVC official rasters — the real 29 m surfaces SMAMUS supplied, one PNG
  // overlay each. Reference layers only: nothing here feeds the CBO flow or the
  // orchestrator view. See shared/arvc-official.ts.
  ...ARVC_OFFICIAL_LAYERS.map(l => ({
    id: l.id,
    name: l.name,
    icon: AlertTriangle,
    color: l.color,
    source: 'image' as LayerSource,
    group: 'arvc_official' as LayerGroupId,
    available: true,
  })),
  // OEF tile layers — generated from shared catalog (48 layers)
  ...TILE_LAYERS.filter(l => l.available).map(l => ({
    id: l.id,
    name: l.name,
    icon: Layers,
    color: l.color,
    source: 'tiles' as LayerSource,
    group: l.group as LayerGroupId,
    available: true,
    tileLayerId: l.tileLayerId,
    hasValueTiles: l.hasValueTiles,
    valueEncoding: l.valueEncoding,
  })),
];

// The official-raster manifest carries per-layer bounds, stats and the published
// legend. One small fetch shared by all 44 overlays; cached at module scope for
// so toggling them never re-downloads it. A failure is not fatal —
// the overlays fall back to the shared constant bounds and simply lose the
// stats line in the popup.
let arvcOfficialManifestPromise: Promise<ArvcOfficialManifest | null> | null = null;
function loadArvcOfficialManifest(): Promise<ArvcOfficialManifest | null> {
  if (!arvcOfficialManifestPromise) {
    arvcOfficialManifestPromise = fetch(ARVC_OFFICIAL_MANIFEST)
      .then(res => (res.ok ? res.json() : null))
      .catch(() => null)
      .then((data: ArvcOfficialManifest | null) => {
        if (!data) arvcOfficialManifestPromise = null;
        return data;
      });
  }
  return arvcOfficialManifestPromise;
}

const LAYER_GROUPS: readonly { id: LayerGroupId; label: string }[] = [
  { id: 'risk_250m', label: 'Risk Analysis (250m)' },
  { id: 'flood_indices', label: 'Flood Indices' },
  { id: 'heat_indices', label: 'Heat Indices' },
  { id: 'landslide_indices', label: 'Landslide Indices' },
  { id: 'reference_data', label: 'Reference Data' },
  { id: 'analysis', label: 'Intervention Zones' },
  { id: 'environment', label: 'Environment' },
  { id: 'osm_reference', label: 'OSM Features' },
  { id: 'spatial_queries', label: 'Spatial Queries' },
  ...TILE_LAYER_GROUPS.map(g => ({ id: g.id as LayerGroupId, label: g.label })),
];

const INTERVENTION_COLORS: Record<string, string> = {
  sponge_network: '#3b82f6',
  cooling_network: '#ef4444',
  slope_stabilization: '#a16207',
  multi_benefit: '#10b981',
};

// TYPOLOGY_COLORS now lives in shared/risk-display.ts (imported above) so the
// coordinator risk map renders zones identically. Values unchanged.

interface InterventionCategory {
  id: string;
  name: string;
  description: string;
  icon: string;
  color: string;
  applicableTypologies: string[];
}

interface InterventionType {
  id: string;
  category: string;
  name: string;
  description: string;
  osmAssetTypes: string[];
  typicalScale: { min: number; max: number; unit: string };
  costRange: { min: number; max: number; unit: string };
  impacts: { flood: string; heat: string; landslide: string };
  implementationNotes: string;
  maintenanceRequirements: string;
  timeToImplement: { min: number; max: number; unit: string };
  cobenefits: string[];
}

interface InterventionsData {
  version: string;
  categories: Record<string, InterventionCategory>;
  interventions: InterventionType[];
}

interface ZoneProperties {
  zoneId: string;
  /** The bairro's real name, accents intact — prefer this over deriving one
   *  from the ASCII zoneId slug. Optional only for the legacy synthetic zones. */
  neighbourhoodName?: string;
  typologyLabel: string;
  primaryHazard: string;
  secondaryHazard?: string;
  interventionType: string;
  meanFlood: number;
  meanHeat: number;
  meanLandslide: number;
  areaKm2: number;
  cellCount: number;
  populationSum?: number;
}

/**
 * Fallback display name derived from a zone SLUG. The slug is ASCII, so this
 * strips accents — "arquipelago" can never come back as "Arquipélago". Prefer
 * `zone.neighbourhoodName` wherever the zone object is in hand; this is only for
 * the synthetic `zone_N` ids and for callers that genuinely have nothing else.
 */
function formatZoneName(zoneId: string): string {
  if (zoneId.startsWith('zone_')) {
    return `Zone ${zoneId.replace('zone_', '')}`;
  }
  return zoneId.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

// ── Map stacking on the light basemap ────────────────────────────────────────
// ground (tilePane 200) < city-clipped rasters < official rasters < vectors
// (overlayPane 400) < place names. Tile layers cannot be polygon-clipped in
// Leaflet, so our own index rasters — which are cut as a bounding rectangle and
// spill over Canoas, Viamão and the Guaíba — go in a pane that carries a CSS
// clip-path of the municipal boundary. The official rasters (SGB, PLAC/ARVC)
// already end at the boundary they were published with and are NOT re-clipped
// against ours, so no official pixel is shaved off by a boundary mismatch.
const PANE_RASTER_CITY = 'explorerRasterCity';
const PANE_RASTER = 'explorerRaster';
const PANE_LABELS = 'explorerLabels';
const OFFICIAL_RASTER_GROUPS: readonly LayerGroupId[] = ['official_risk', 'arvc_official'];

/** A layer that paints the city: while one is on, zones step back to outlines. */
const paintsTheCity = (l: { id: string; enabled: boolean; source: LayerSource; group: LayerGroupId }) =>
  l.enabled && (l.source === 'tiles' || l.source === 'image' || l.group === 'arvc' || l.id === 'ibge_census');

const DEFAULT_TILE_OPACITY = 0.7;

// Legends for the explorer's own vector layers, which generate-legends.ts (tile
// layers only) does not know. Merged under the fetched index.
const vectorLegends = (t: (key: string) => string): LegendIndex => ({
  ibge_census: {
    layerId: 'ibge_census',
    kind: 'classes',
    source: 'code',
    stops: [
      ...CENSUS_POVERTY_CLASSES.map((c, i) => ({ value: i, color: c.color, label: c.label })),
      { value: -1, color: CENSUS_NO_DATA_COLOR, label: t('siteExplorer.legendLabels.noData') },
    ],
  },
  ibge_settlements: {
    layerId: 'ibge_settlements',
    kind: 'classes',
    source: 'code',
    stops: [{ value: 1, color: '#e11d48', label: t('siteExplorer.legendLabels.informalSettlement') }],
  },
  flood_2024_extent: {
    layerId: 'flood_2024_extent',
    kind: 'classes',
    source: 'code',
    stops: [{ value: 1, color: FLOOD_2024_OUTLINE, label: t('siteExplorer.legendLabels.floodReached'), outline: true }],
  },
  sgb_setores_risco: {
    layerId: 'sgb_setores_risco',
    kind: 'classes',
    source: 'code',
    stops: [
      { value: 1, color: sectorColors('Alto').fill, label: t('siteExplorer.legendLabels.sectorHigh') },
      { value: 2, color: sectorColors('Muito alto').fill, label: t('siteExplorer.legendLabels.sectorVeryHigh') },
    ],
  },
});

// Zones over a raster: a thin neutral line. The fill stays in the DOM at zero
// opacity so the whole bairro still takes hover and click.
const ZONE_OUTLINE_STYLE = { color: '#27272a', weight: 1, opacity: 0.7, fillOpacity: 0 };

/** Every ring of a (multi)polygon layer's latlngs, flattened. */
function flattenRings(latlngs: any): L.LatLng[][] {
  if (!Array.isArray(latlngs) || latlngs.length === 0) return [];
  return Array.isArray(latlngs[0]) ? latlngs.flatMap(flattenRings) : [latlngs as L.LatLng[]];
}

/** Case- and accent-insensitive key for matching a place name. */
const foldPlaceName = (v: string) => v.normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase();

type ExplorerDeepLinkPlace = { kind: 'point'; lat: number; lng: number } | { kind: 'name'; name: string };

/** ?map=<key map id>&place=<bairro name | lat,lng>&z=<zoom> — each part optional, bad parts dropped. */
function parseExplorerDeepLink(search: string): { map: ExplorerKeyMapId | null; place: ExplorerDeepLinkPlace | null; zoom: number | null } {
  const q = new URLSearchParams(search);
  const mapParam = q.get('map');
  const placeParam = (q.get('place') || '').trim();
  const zParam = q.get('z');
  const z = zParam != null && zParam.trim() !== '' ? Number(zParam) : NaN;

  let place: ExplorerDeepLinkPlace | null = null;
  const point = placeParam.match(/^(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)$/);
  if (point) {
    const lat = Number(point[1]);
    const lng = Number(point[2]);
    if (Math.abs(lat) <= 90 && Math.abs(lng) <= 180) place = { kind: 'point', lat, lng };
  } else if (placeParam) {
    place = { kind: 'name', name: placeParam };
  }

  return {
    map: isExplorerKeyMapId(mapParam) ? mapParam : null,
    place,
    zoom: Number.isFinite(z) && z >= 3 && z <= 19 ? z : null,
  };
}

export default function SiteExplorerPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const { t } = useTranslation();
  const { toast } = useToast();
  const { isSampleMode, setSampleMode, sampleCity, sampleActions, initiatedProjects, initiateProject } = useSampleData();
  const { isSampleRoute, routePrefix } = useSampleRoute();
  const mapRef = useRef<L.Map | null>(null);
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const [boundaryData, setBoundaryData] = useState<BoundaryData | null>(null);
  const [elevationData, setElevationData] = useState<ElevationData | null>(null);
  const [showEvidenceDrawer, setShowEvidenceDrawer] = useState(false);
  // The drawer's real height (48 closed, up to 320 open, by content): the
  // on-map legend card sits just above it.
  const [drawerHeight, setDrawerHeight] = useState(48);
  const drawerObserver = useRef<ResizeObserver | null>(null);
  const drawerRef = useCallback((el: HTMLDivElement | null) => {
    drawerObserver.current?.disconnect();
    if (!el) return;
    drawerObserver.current = new ResizeObserver(() => setDrawerHeight(el.offsetHeight));
    drawerObserver.current.observe(el);
  }, []);
  const [mapReady, setMapReady] = useState(false);
  const [layers, setLayers] = useState<LayerState[]>(() => 
    LAYER_CONFIGS.map(config => ({
      ...config,
      enabled: config.id === 'intervention_zones',
      loaded: false,
      data: null,
      leafletLayer: null,
    }))
  );
  const layerRefs = useRef<Map<string, L.Layer>>(new Map());
  // Opacity and stacking a key map asked for, per tile layer. Read when the
  // tile layer is created; a layer toggled by hand goes back to the default.
  const layerLookRef = useRef<Map<string, { opacity?: number; zIndex?: number }>>(new Map());
  const layerDataCache = useRef<Map<string, any>>(new Map());
  const [loadingLayers, setLoadingLayers] = useState<Set<string>>(new Set());
  // Per-layer legend specs (generate-legends.ts → layer-legends.json), loaded once.
  const [tileLegends, setTileLegends] = useState<LegendIndex>({});
  useEffect(() => {
    fetch('/sample-data/layer-legends.json')
      .then(r => (r.ok ? r.json() : {}))
      .then(setTileLegends)
      .catch(() => {});
  }, []);
  const legends = useMemo<LegendIndex>(() => ({ ...vectorLegends(t), ...tileLegends }), [t, tileLegends]);

  const isSampleModeActive = isSampleMode || isSampleRoute;

  // Zones are outlines while any raster/hazard layer is on (see paintsTheCity).
  // The ref is what the Leaflet style callbacks read; the boolean drives the effect.
  const zonesOutlineOnly = useMemo(() => layers.some(paintsTheCity), [layers]);
  const zonesOutlineOnlyRef = useRef(zonesOutlineOnly);
  zonesOutlineOnlyRef.current = zonesOutlineOnly;

  // The key map on show (a chip above the map), or null when the layers were
  // chosen by hand. The ref is for callbacks that must not re-subscribe.
  const [activeKeyMap, setActiveKeyMap] = useState<ExplorerKeyMapId | null>(null);
  const activeKeyMapRef = useRef(activeKeyMap);
  activeKeyMapRef.current = activeKeyMap;
  const layersRef = useRef(layers);
  layersRef.current = layers;
  const [layerSearch, setLayerSearch] = useState('');

  // Deep link, read once at mount: ?map=<key map id>&place=<bairro | lat,lng>&z=<zoom>.
  // Anything unrecognised is dropped here and never mentioned again.
  const [deepLink] = useState(() => parseExplorerDeepLink(typeof window !== 'undefined' ? window.location.search : ''));
  const [deepLinkDone, setDeepLinkDone] = useState(false);
  // A zoom asked for together with a bairro: the selection effect centres on
  // the bairro at this zoom instead of fitting it.
  const pendingZoneZoomRef = useRef<number | null>(null);
  // True once a person (or a link, or a command) has moved the map: only then
  // is the view worth writing to the URL. The first fit to the city is not.
  const viewTouchedRef = useRef(false);
  const selectedZoneNameRef = useRef<string | null>(null);

  // What the map is showing, for the chat's page context. `mapView` moves only
  // on moveend and only when the rounded value changed; the pins are the last
  // `pin_places` command (explorerMapCommands.ts).
  const [mapView, setMapView] = useState<{ lat: number; lng: number; zoom: number } | null>(null);
  const [pinnedPlaces, setPinnedPlaces] = useState<ExplorerPinnedPlace[]>([]);
  const pinsLayerRef = useRef<L.LayerGroup | null>(null);
  const activeLayerIdsKey = useMemo(() => layers.filter(l => l.enabled).map(l => l.id).join(','), [layers]);

  // Legends shown on the map: every enabled layer that has a spec, drawer order
  // — or, for a key map that names its own, only those (the hot spots map
  // carries three faded underlays whose legends would bury the one that matters).
  const activeLegends = useMemo(() => {
    const enabled = layers.filter(l => l.enabled && legends[l.id]);
    const only = activeKeyMap ? explorerKeyMap(activeKeyMap).legendLayers : undefined;
    if (!only) return enabled;
    return only.map(id => enabled.find(l => l.id === id)).filter((l): l is LayerState => !!l);
  }, [layers, legends, activeKeyMap]);

  // Enabled tile layers with value encodings for ValueTooltip.
  // Must be ALL_TILE_LAYERS, not TILE_LAYERS: the risk cards and the flood/heat/
  // landslide index layers live in their own arrays and are only merged in ALL_*.
  // Filtering TILE_LAYERS meant those layers advertised value tiles (green dot)
  // but their hover tooltip could never fire.
  const enabledTileLayerDefs = useMemo(
    () => ALL_TILE_LAYERS.filter(l => layers.some(ls => ls.id === l.id && ls.enabled)),
    [layers]
  );

  const sampleAction = isSampleModeActive 
    ? sampleActions.find(a => a.id === projectId)
    : null;
  // A /sample/… link opened cold (no localStorage) is its own invitation: the
  // route itself says "sample", so the page renders at once, and the effect
  // below writes sample mode and the project into storage so Back and the
  // other module pages find them.
  const isSampleProjectInitiated = isSampleModeActive && (initiatedProjects.includes(projectId || '') || (isSampleRoute && !!sampleAction));
  const sampleActionId = sampleAction?.id;
  const sampleSeededRef = useRef(false);
  useEffect(() => {
    if (!isSampleRoute || !sampleActionId || sampleSeededRef.current) return;
    sampleSeededRef.current = true;
    if (!isSampleMode) setSampleMode(true);
    if (!initiatedProjects.includes(sampleActionId)) initiateProject(sampleActionId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSampleRoute, sampleActionId]);

  const { data: projectData, isLoading: isLoadingProject } = useQuery<{ project: Project }>({
    queryKey: ['/api/project', projectId],
    enabled: !isSampleModeActive && !!projectId,
  });

  const cityId = isSampleModeActive ? sampleCity.locode : projectData?.project?.cityId;

  const { data: cityInfoData, isLoading: isLoadingCity } = useQuery<{ data: CityInfo }>({
    queryKey: ['/api/city-information', cityId],
    enabled: !isSampleModeActive && !!cityId,
  });

  const cityName = isSampleModeActive ? sampleCity.name : (cityInfoData?.data?.name || '');
  const cityLocode = isSampleModeActive ? sampleCity.locode : (cityInfoData?.data?.locode || '');

  const boundaryMutation = useMutation({
    mutationFn: async (params: { cityName: string; cityLocode: string }) => {
      const response = await apiRequest('POST', '/api/geospatial/boundary', params);
      return response.json();
    },
    onSuccess: (data) => {
      setBoundaryData(data.data);
    },
  });

  const elevationMutation = useMutation({
    mutationFn: async (params: { cityLocode: string; bounds: any; resolution?: number }) => {
      const response = await apiRequest('POST', '/api/geospatial/elevation', params);
      return response.json();
    },
    onSuccess: (data) => {
      setElevationData(data.data);
    },
  });

  const [isLoadingSampleData, setIsLoadingSampleData] = useState(false);
  const [dataHydrated, setDataHydrated] = useState(false);
  const [selectedZone, setSelectedZone] = useState<ZoneProperties | null>(null);
  const [selectedZoneFeature, setSelectedZoneFeature] = useState<any | null>(null);
  const [interventionsData, setInterventionsData] = useState<InterventionsData | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [zonePortfolios, setZonePortfolios] = useState<Record<string, SelectedIntervention[]>>({});
  const [osmAssets, setOsmAssets] = useState<any[]>([]);
  const [isLoadingOsmAssets, setIsLoadingOsmAssets] = useState(false);
  const [selectedAsset, setSelectedAsset] = useState<any | null>(null);
  const [showAddAssetDialog, setShowAddAssetDialog] = useState(false);
  const [addAssetTab, setAddAssetTab] = useState<'search' | 'manual'>('search');
  const [osmSearchQuery, setOsmSearchQuery] = useState('');
  const [osmSearchResults, setOsmSearchResults] = useState<any[]>([]);
  const [isSearchingOsm, setIsSearchingOsm] = useState(false);
  const [manualAssetName, setManualAssetName] = useState('');
  const [manualAssetCoords, setManualAssetCoords] = useState('');
  const [manualAssetArea, setManualAssetArea] = useState('');
  const [manualAssetType, setManualAssetType] = useState('');
  const highlightLayerRef = useRef<L.Layer | null>(null);
  const osmLayerRef = useRef<L.Layer | null>(null);
  const selectedAssetMarkerRef = useRef<L.Marker | null>(null);
  const interventionMarkersRef = useRef<Map<string, L.Marker>>(new Map());
  const { updateModule, context, loadContext } = useProjectContext();
  const { setPageContext } = useChatState();
  
  // Separate navigation persistence from domain data
  const { 
    navigationState: savedNavState, 
    updateNavigationState, 
    navigationRestored 
  } = useNavigationPersistence({
    projectId,
    moduleName: 'siteExplorer',
  });

  useEffect(() => {
    const selectedZoneCount = Object.keys(zonePortfolios).length;
    const totalInterventions = Object.values(zonePortfolios).reduce((sum, p) => sum + p.length, 0);
    // One-way: this effect only WRITES the context. Nothing here reads the
    // page context back into the state it depends on, so it cannot swap-loop.
    const mapContext: ExplorerMapContext = {
      activePreset: activeKeyMap,
      activeLayerIds: activeLayerIdsKey ? activeLayerIdsKey.split(',') : [],
      mapCenter: mapView ? { lat: mapView.lat, lng: mapView.lng } : null,
      mapZoom: mapView ? mapView.zoom : null,
      pinnedPlaces: pinnedPlaces.map(p => ({ rank: p.rank, name: p.name })),
    };
    
    setPageContext({
      moduleName: 'Site Explorer',
      currentStep: selectedZone ? 'Zone Detail View' : 'Map Overview',
      stepNumber: selectedZone ? 1 : 0,
      totalSteps: 2,
      viewState: selectedZone ? 'zone-selected' : 'map-view',
      additionalInfo: {
        selectedZoneId: selectedZone?.zoneId || null,
        selectedZoneTypology: selectedZone?.typologyLabel || null,
        primaryHazard: selectedZone?.primaryHazard || null,
        selectedCategory,
        zonesWithInterventions: selectedZoneCount,
        totalInterventionsSelected: totalInterventions,
        ...mapContext,
      }
    });
  }, [selectedZone, selectedCategory, zonePortfolios, setPageContext, activeKeyMap, activeLayerIdsKey, mapView, pinnedPlaces]);

  useEffect(() => {
    return () => setPageContext(null);
  }, [setPageContext]);

  useEffect(() => {
    fetch('/sample-data/interventions.json')
      .then(res => res.json())
      .then(data => setInterventionsData(data))
      .catch(err => console.error('Failed to load interventions data:', err));
  }, []);

  const portfolioHydratedRef = useRef(false);
  
  // Load context on mount to ensure portfolios can be hydrated on page reload
  useEffect(() => {
    if (projectId) {
      console.log('🔄 Loading context for project:', projectId);
      const loaded = loadContext(projectId);
      console.log('📦 Context loaded:', loaded?.siteExplorer?.selectedZones?.length, 'zones');
      
      // Hydrate portfolios immediately from loaded context
      if (loaded?.siteExplorer?.selectedZones && !portfolioHydratedRef.current) {
        const portfolios: Record<string, SelectedIntervention[]> = {};
        loaded.siteExplorer.selectedZones.forEach(zone => {
          if (typeof zone === 'object' && zone.interventionPortfolio && zone.interventionPortfolio.length > 0) {
            console.log(`   Zone ${zone.zoneId}: ${zone.interventionPortfolio?.length} interventions`);
            portfolios[zone.zoneId] = zone.interventionPortfolio;
          }
        });
        if (Object.keys(portfolios).length > 0) {
          console.log('✅ Setting zonePortfolios from loaded context:', Object.keys(portfolios));
          setZonePortfolios(portfolios);
        }
        portfolioHydratedRef.current = true;
        setDataHydrated(true);
      } else {
        setDataHydrated(true);
      }
    }
  }, [projectId, loadContext]);
  
  // Fallback hydration from context state (for navigation from other pages)
  useEffect(() => {
    if (portfolioHydratedRef.current) return; // Already hydrated
    if (!context?.siteExplorer?.selectedZones) return;
    
    const portfolios: Record<string, SelectedIntervention[]> = {};
    context.siteExplorer.selectedZones.forEach(zone => {
      if (typeof zone === 'object' && zone.interventionPortfolio && zone.interventionPortfolio.length > 0) {
        portfolios[zone.zoneId] = zone.interventionPortfolio;
      }
    });
    if (Object.keys(portfolios).length > 0) {
      console.log('✅ Setting zonePortfolios from context state:', Object.keys(portfolios));
      setZonePortfolios(portfolios);
      portfolioHydratedRef.current = true;
    }
  }, [context]);

  // Listen for intervention site additions from chat drawer
  useEffect(() => {
    const handleInterventionAdded = (event: CustomEvent<{ zoneId: string; value: any }>) => {
      const { zoneId, value } = event.detail;
      console.log('🔔 Intervention site added event received:', zoneId, value);
      
      setZonePortfolios(prev => {
        const updated = { ...prev };
        if (!updated[zoneId]) {
          updated[zoneId] = [];
        }
        // Check if already exists
        const existingIndex = updated[zoneId].findIndex(i => i.assetId === value.assetId);
        if (existingIndex >= 0) {
          updated[zoneId][existingIndex] = value;
        } else {
          updated[zoneId] = [...updated[zoneId], value];
        }
        return updated;
      });
    };
    
    window.addEventListener('intervention-site-added', handleInterventionAdded as EventListener);
    return () => {
      window.removeEventListener('intervention-site-added', handleInterventionAdded as EventListener);
    };
  }, []);

  // Persist navigation using dedicated hook (completely separate from domain data)
  // Note: Site Explorer navigation tracks whether user was viewing a zone detail,
  // but we can't restore the exact zone because zones are dynamically loaded from the map.
  useEffect(() => {
    if (!navigationRestored) return;
    updateNavigationState({
      currentStep: selectedZone ? 1 : 0,
      additionalState: { selectedZoneId: selectedZone?.zoneId ?? null },
    });
  }, [selectedZone, navigationRestored, updateNavigationState]);

  // React to external updates to siteExplorer (agent/ChatDrawer).
  const lastSyncedSiteExplorerRef = useRef<unknown>(undefined);
  useEffect(() => {
    const data = context?.siteExplorer;
    if (!data || data === lastSyncedSiteExplorerRef.current) return;
    lastSyncedSiteExplorerRef.current = data;
    if (data.selectedZones) {
      const portfolios: Record<string, SelectedIntervention[]> = {};
      data.selectedZones.forEach((zone: any) => {
        if (typeof zone === 'object' && zone.interventionPortfolio && zone.interventionPortfolio.length > 0) {
          portfolios[zone.zoneId] = zone.interventionPortfolio;
        }
      });
      setZonePortfolios(portfolios);
    }
  }, [context?.siteExplorer]);

  useEffect(() => {
    let cancelled = false;
    
    if (isSampleModeActive) {
      setBoundaryData(null);
      setElevationData(null);
      setIsLoadingSampleData(true);
      Promise.all([loadSampleBoundaryData(), loadSampleElevationData()])
        .then(([boundary, elevation]) => {
          if (!cancelled) {
            setBoundaryData(boundary);
            setElevationData(elevation);
          }
        })
        .catch(console.error)
        .finally(() => {
          if (!cancelled) setIsLoadingSampleData(false);
        });
    } else {
      setBoundaryData(null);
      setElevationData(null);
      if (cityName && cityLocode && !boundaryMutation.isPending) {
        boundaryMutation.mutate({ cityName, cityLocode });
      }
    }
    
    return () => { cancelled = true; };
  }, [cityName, cityLocode, isSampleModeActive]);

  useEffect(() => {
    if (isSampleModeActive) return;
    
    if (boundaryData && !elevationData && !elevationMutation.isPending) {
      const bounds = {
        minLng: boundaryData.bbox[0],
        minLat: boundaryData.bbox[1],
        maxLng: boundaryData.bbox[2],
        maxLat: boundaryData.bbox[3],
      };
      elevationMutation.mutate({ cityLocode: boundaryData.cityLocode, bounds, resolution: 90 });
    }
  }, [boundaryData, isSampleModeActive]);

  useEffect(() => {
    if (!mapRef.current) return;
    
    if (highlightLayerRef.current) {
      mapRef.current.removeLayer(highlightLayerRef.current);
      highlightLayerRef.current = null;
    }
    
    if (osmLayerRef.current) {
      mapRef.current.removeLayer(osmLayerRef.current);
      osmLayerRef.current = null;
    }
    
    const zonesLayer = layerRefs.current.get('intervention_zones') as L.GeoJSON | undefined;
    if (zonesLayer) {
      zonesLayer.eachLayer((layer: any) => {
        const feature = layer.feature;
        const typology = feature?.properties?.typologyLabel || 'LOW';
        const color = TYPOLOGY_COLORS[typology] || '#10b981';
        const isSelected = selectedZone?.zoneId === feature?.properties?.zoneId;
        
        layer.setStyle(zonesOutlineOnlyRef.current ? { ...ZONE_OUTLINE_STYLE, fillColor: color, opacity: isSelected ? 0 : ZONE_OUTLINE_STYLE.opacity } : {
          color: isSelected ? 'transparent' : color,
          weight: isSelected ? 0 : 2,
          fillColor: color,
          fillOpacity: isSelected ? 0.15 : 0.4,
          opacity: isSelected ? 0 : 0.9,
        });
      });
    }
    
    if (selectedZoneFeature && selectedZone) {
      const highlightLayer = L.geoJSON(selectedZoneFeature, {
        style: {
          // Near-black: the white dash this used on the dark basemap is
          // invisible on light grey.
          color: '#18181b',
          weight: 3,
          fillColor: TYPOLOGY_COLORS[selectedZone.typologyLabel] || '#10b981',
          fillOpacity: zonesOutlineOnlyRef.current ? 0 : 0.25,
          opacity: 1,
          dashArray: '6, 4',
        },
      });
      highlightLayer.addTo(mapRef.current);
      highlightLayerRef.current = highlightLayer;
      
      const bounds = highlightLayer.getBounds();
      const zoom = pendingZoneZoomRef.current;
      pendingZoneZoomRef.current = null;
      viewTouchedRef.current = true;
      if (zoom != null) mapRef.current.setView(bounds.getCenter(), zoom);
      else mapRef.current.fitBounds(bounds, { padding: [50, 50], maxZoom: 16 });
    }
  }, [selectedZoneFeature, selectedZone]);

  // A raster came on or the last one went off: zones swap fill ⇄ outline in
  // place. Not folded into the effect above, which also re-fits the map.
  useEffect(() => {
    const zonesLayer = layerRefs.current.get('intervention_zones') as L.GeoJSON | undefined;
    if (!zonesLayer) return;
    zonesLayer.eachLayer((layer: any) => {
      const isSelected = selectedZone?.zoneId === layer.feature?.properties?.zoneId;
      if (zonesOutlineOnly) layer.setStyle({ ...ZONE_OUTLINE_STYLE, opacity: isSelected ? 0 : ZONE_OUTLINE_STYLE.opacity });
      else if (isSelected) layer.setStyle({ weight: 0, opacity: 0, fillOpacity: 0.15 });
      else zonesLayer.resetStyle(layer);
    });
    (highlightLayerRef.current as L.GeoJSON | null)?.setStyle({ fillOpacity: zonesOutlineOnly ? 0 : 0.25 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zonesOutlineOnly]);

  const [osmResultsTruncated, setOsmResultsTruncated] = useState(false);
  const [osmShowAll, setOsmShowAll] = useState(false);
  const [osmTotalFound, setOsmTotalFound] = useState(0);
  const OSM_RESULT_LIMIT = 50;
  const OSM_EXTENDED_LIMIT = 200;

  const [osmError, setOsmError] = useState<string | null>(null);
  
  const fetchOsmAssets = useCallback(async (zoneFeature: any, category: string) => {
    if (!zoneFeature?.geometry || !interventionsData) return;
    
    setIsLoadingOsmAssets(true);
    setOsmAssets([]);
    setOsmResultsTruncated(false);
    setOsmShowAll(false);
    setOsmTotalFound(0);
    setOsmError(null);
    
    try {
      const categoryData = interventionsData.categories[category];
      const interventionsInCategory = interventionsData.interventions.filter(i => i.category === category);
      const osmTypes = Array.from(new Set(interventionsInCategory.flatMap(i => i.osmAssetTypes)));
      
      const coords = zoneFeature.geometry.type === 'Polygon' 
        ? zoneFeature.geometry.coordinates[0]
        : zoneFeature.geometry.coordinates[0][0];
      
      const lats = coords.map((c: number[]) => c[1]);
      const lngs = coords.map((c: number[]) => c[0]);
      const bbox: [number, number, number, number] = [Math.min(...lats), Math.min(...lngs), Math.max(...lats), Math.max(...lngs)];
      
      const zoneId = zoneFeature.properties?.zoneId || `zone_${bbox.join('_')}`;
      
      const response = await fetch('/api/geospatial/osm-assets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          zoneId,
          category,
          bbox,
          osmTypes,
          zoneGeometry: zoneFeature.geometry,
        }),
      });
      
      const data = await response.json();
      
      if (!response.ok || data.error) {
        const errorMessage = data.error || `Server error: ${response.status}`;
        setOsmError(errorMessage);
        return;
      }
      
      const assets = data.assets.map((a: any) => ({
        ...a,
        compatibleInterventions: interventionsInCategory.filter(i => 
          i.osmAssetTypes.some(t => a.assetType === t || Object.entries(a.tags || {}).some(([k, v]) => `${k}=${v}` === t))
        ),
      })).filter((a: any) => a.compatibleInterventions.length > 0);
      
      // The server has already cut the list to the zone outline, ordered it
      // (named first, then largest) and capped it at OSM_EXTENDED_LIMIT.
      setOsmTotalFound(Math.max(data.totalFound ?? 0, assets.length));
      if (assets.length > OSM_RESULT_LIMIT) setOsmResultsTruncated(true);
      setOsmAssets(assets);
      
      if (data.fromCache) {
        console.log(`📦 Loaded ${assets.length} cached assets`);
      }
      
      const displayAssets = assets.slice(0, OSM_EXTENDED_LIMIT);
      
      if (mapRef.current && displayAssets.length > 0) {
        const geoJsonFeatures = {
          type: 'FeatureCollection',
          features: displayAssets.map((a: any) => ({
            type: 'Feature',
            geometry: a.geometry,
            properties: { ...a, geometry: undefined },
          })),
        };
        
        const osmLayer = L.geoJSON(geoJsonFeatures as any, {
          style: {
            color: categoryData?.color || '#3b82f6',
            weight: 3,
            fillColor: categoryData?.color || '#3b82f6',
            fillOpacity: 0.3,
          },
          pointToLayer: (feature, latlng) => {
            return L.circleMarker(latlng, {
              radius: 8,
              color: categoryData?.color || '#3b82f6',
              fillColor: categoryData?.color || '#3b82f6',
              fillOpacity: 0.6,
            });
          },
          onEachFeature: (feature, layer) => {
            const props = feature.properties;
            const sizeLabel = props.length > 0 ? `Length: ${props.length.toFixed(0)} m` : `Area: ${(props.area / 10000).toFixed(2)} ha`;
            layer.bindTooltip(`<strong>${props.name}</strong><br/>${props.assetType}<br/>${sizeLabel}`, { sticky: true });
            layer.on('click', () => {
              setSelectedAsset(props);
            });
          },
        });
        osmLayer.addTo(mapRef.current);
        osmLayerRef.current = osmLayer;
      }
    } catch (error: any) {
      console.error('Failed to fetch OSM assets:', error);
      setOsmError(t('siteExplorer.assetLoadErrorGeneric'));
    } finally {
      setIsLoadingOsmAssets(false);
    }
  }, [interventionsData, t]);

  const prevCategoryRef = useRef<string | null>(null);
  const prevZoneIdRef = useRef<string | null>(null);
  
  useEffect(() => {
    const currentZoneId = selectedZoneFeature?.properties?.zoneId;
    const categoryChanged = selectedCategory !== prevCategoryRef.current;
    const zoneChanged = currentZoneId !== prevZoneIdRef.current;
    
    if (selectedCategory && selectedZoneFeature && (categoryChanged || zoneChanged)) {
      prevCategoryRef.current = selectedCategory;
      prevZoneIdRef.current = currentZoneId;
      fetchOsmAssets(selectedZoneFeature, selectedCategory);
    }
  }, [selectedCategory, selectedZoneFeature, fetchOsmAssets]);

  useEffect(() => {
    if (selectedAssetMarkerRef.current) {
      selectedAssetMarkerRef.current.remove();
      selectedAssetMarkerRef.current = null;
    }
    
    if (selectedAsset && selectedAsset.centroid && mapRef.current) {
      const [lat, lng] = selectedAsset.centroid;
      const marker = L.marker([lat, lng], {
        icon: L.divIcon({
          className: 'selected-asset-marker',
          html: `<div style="width: 24px; height: 24px; background: #ef4444; border: 3px solid white; border-radius: 50%; box-shadow: 0 2px 8px rgba(0,0,0,0.4);"></div>`,
          iconSize: [24, 24],
          iconAnchor: [12, 12],
        }),
      });
      marker.addTo(mapRef.current);
      selectedAssetMarkerRef.current = marker;
      mapRef.current.flyTo([lat, lng], 17, { duration: 0.5 });
    }
  }, [selectedAsset]);

  // Display intervention site markers on the map
  useEffect(() => {
    if (!mapRef.current) return;

    const getCategoryIcon = (category: string): { color: string; icon: string } => {
      switch (category) {
        case 'urban_cooling':
          return { color: '#22c55e', icon: '🌳' }; // green - trees/cooling
        case 'flood_storage':
          return { color: '#3b82f6', icon: '💧' }; // blue - water/flood
        case 'erosion':
          return { color: '#a16207', icon: '🏔️' }; // brown - slope
        default:
          return { color: '#8b5cf6', icon: '📍' }; // purple - default
      }
    };

    // Collect all current intervention IDs
    const currentInterventionIds = new Set<string>();
    
    Object.entries(zonePortfolios).forEach(([zoneId, interventions]) => {
      interventions.forEach(intervention => {
        if (intervention.centroid) {
          const markerId = `${zoneId}_${intervention.assetId || intervention.interventionId}`;
          currentInterventionIds.add(markerId);
          
          // Only add if not already on map
          if (!interventionMarkersRef.current.has(markerId)) {
            const [lat, lng] = intervention.centroid;
            const { color, icon } = getCategoryIcon(intervention.category);
            
            const marker = L.marker([lat, lng], {
              icon: L.divIcon({
                className: 'intervention-site-marker',
                html: `
                  <div style="
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    width: 32px;
                    height: 32px;
                    background: ${color};
                    border: 3px solid white;
                    border-radius: 50%;
                    box-shadow: 0 2px 8px rgba(0,0,0,0.4);
                    font-size: 14px;
                  ">${icon}</div>
                `,
                iconSize: [32, 32],
                iconAnchor: [16, 16],
              }),
            });
            
            marker.bindTooltip(`
              <div style="font-size: 12px;">
                <strong>${intervention.assetName || 'Site'}</strong><br/>
                ${intervention.interventionName}<br/>
                <em style="color: #888;">${formatZoneName(zoneId)}</em>
              </div>
            `, { permanent: false, direction: 'top', offset: [0, -16] });
            
            marker.addTo(mapRef.current!);
            interventionMarkersRef.current.set(markerId, marker);
          }
        }
      });
    });
    
    // Remove markers that are no longer in portfolios
    interventionMarkersRef.current.forEach((marker, markerId) => {
      if (!currentInterventionIds.has(markerId)) {
        marker.remove();
        interventionMarkersRef.current.delete(markerId);
      }
    });
  }, [zonePortfolios, mapReady]);

  useEffect(() => {
    if (!mapContainerRef.current || !boundaryData) return;

    if (mapRef.current) {
      mapRef.current.remove();
      layerRefs.current.clear();
    }

    const map = L.map(mapContainerRef.current, {
      center: [boundaryData.centroid[1], boundaryData.centroid[0]],
      zoom: 11,
    });

    // Light ground: every hazard ramp in the drawer was drawn for a light map
    // (and matches the printed ones); on dark grey the pale classes vanished.
    const basemap = BASEMAPS.light;
    const cityRasterPane = map.createPane(PANE_RASTER_CITY);
    cityRasterPane.style.zIndex = '240';
    map.createPane(PANE_RASTER).style.zIndex = '250';
    const labelsPane = map.createPane(PANE_LABELS);
    labelsPane.style.zIndex = '450';
    labelsPane.style.pointerEvents = 'none';

    const tileLayer = L.tileLayer(basemap.url, {
      attribution: `&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors · ${basemap.attribution}`,
      maxZoom: 19,
      maxNativeZoom: basemap.maxNativeZoom,
      updateWhenZooming: true,
      updateWhenIdle: false,
      keepBuffer: 4,
    }).addTo(map);
    
    // Place names, as a second layer: Esri publishes the ground and its labels
    // separately, and a grey city with no names is not something a coordinator
    // can locate a bairro in. In their own pane ABOVE rasters and vectors, so a
    // hazard layer never paints over the names (and never takes their clicks).
    L.tileLayer(basemap.labelsUrl!, {
      maxZoom: 19, maxNativeZoom: basemap.maxNativeZoom, pane: PANE_LABELS,
    }).addTo(map);

    tileLayer.on('tileerror', (error: any) => {
      console.warn('Tile load error, retrying...', error.tile?.src);
      setTimeout(() => {
        if (error.tile) {
          error.tile.src = error.tile.src;
        }
      }, 1000);
    });
    
    map.on('zoomend moveend', () => {
      setTimeout(() => map.invalidateSize(), 100);
    });

    if (boundaryData.boundaryGeoJson) {
      const boundaryLayer = L.geoJSON(boundaryData.boundaryGeoJson, {
        style: {
          color: '#52525b',
          weight: 2,
          fillColor: 'transparent',
          fillOpacity: 0,
        },
        interactive: false,
      }).addTo(map);

      map.fitBounds(boundaryLayer.getBounds(), { padding: [20, 20] });

      // The municipal boundary as a clip-path on the city-raster pane, in layer
      // pixels. Those only change when the zoom does (a pan moves the whole map
      // pane, clip and all), so it is rebuilt per zoom — and during an animated
      // zoom it is transitioned to where the boundary WILL be, on Leaflet's own
      // 250 ms curve, so the edge travels with the tiles instead of snapping.
      const rings = boundaryLayer.getLayers().flatMap((l: any) => flattenRings(l.getLatLngs?.()));
      const clipTo = (project: (ll: L.LatLng) => L.Point, animate: boolean) => {
        const d = rings.map(ring => 'M' + ring.map(ll => {
          const pt = project(ll);
          return `${pt.x.toFixed(1)} ${pt.y.toFixed(1)}`;
        }).join('L') + 'Z').join('');
        cityRasterPane.style.transition = animate ? 'clip-path 0.25s cubic-bezier(0,0,0.25,1)' : 'none';
        cityRasterPane.style.clipPath = `path(evenodd, "${d}")`;
      };
      const clipNow = () => clipTo(ll => map.latLngToLayerPoint(ll), false);
      map.on('viewreset zoom zoomend', clipNow);
      map.on('zoomanim', (e: L.ZoomAnimEvent) =>
        clipTo(ll => (map as any)._latLngToNewLayerPoint(ll, e.zoom, e.center), true));
      clipNow();
    }

    mapRef.current = map;
    setMapReady(true);
    
    const resizeObserver = new ResizeObserver(() => {
      setTimeout(() => map.invalidateSize(), 50);
    });
    resizeObserver.observe(mapContainerRef.current);

    return () => {
      resizeObserver.disconnect();
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
        setMapReady(false);
      }
    };
  }, [boundaryData]);

  useEffect(() => {
    if (mapRef.current) {
      setTimeout(() => mapRef.current?.invalidateSize(), 350);
    }
  }, [showEvidenceDrawer]);

  const loadLayerData = useCallback(async (layerId: string): Promise<any> => {
    if (!isSampleModeActive) return null;
    
    switch (layerId) {
      case 'elevation': return loadSampleElevationData();
      case 'landcover': return loadSampleLandcoverData();
      case 'surface_water': return loadSampleSurfaceWaterData();
      case 'rivers': return loadSampleRiversData();
      case 'forest': return loadSampleForestData();
      case 'population': return loadSamplePopulationData();
      case 'intervention_zones': return loadSampleZonesData();
      case 'ibge_census': {
        const res = await fetch('/sample-data/porto-alegre-ibge-indicators.json');
        return res.ok ? { geoJson: await res.json() } : null;
      }
      case 'ibge_settlements': {
        const res = await fetch('/sample-data/porto-alegre-ibge-settlements.json');
        return res.ok ? { geoJson: await res.json() } : null;
      }
      case 'flood_2024_extent': {
        const res = await fetch('/sample-data/porto-alegre-flood-2024.json');
        if (!res.ok) return null;
        const data = await res.json();
        return { geoJson: data.geoJson || data };
      }
      default: {
        // OSM reference layers — fetch from Overpass API proxy
        if (layerId.startsWith('osm_')) {
          const osmId = layerId.replace('osm_', '');
          const res = await fetch(`/api/osm/${osmId}`);
          if (!res.ok) return null;
          const geojson = await res.json();
          return { geoJson: geojson };
        }
        // Official risk vector layers (SGB/CPRM surveyed sectors)
        const official = OFFICIAL_VECTOR_LAYERS.find(l => l.id === layerId);
        if (official) {
          const res = await fetch(official.endpoint);
          if (!res.ok) return null;
          const geojson = await res.json();
          return { geoJson: geojson };
        }
        return null;
      }
    }
  }, [isSampleModeActive]);

  const getFloodColor = (score: number): string => {
    if (score >= 0.7) return '#1e40af';
    if (score >= 0.5) return '#3b82f6';
    if (score >= 0.3) return '#60a5fa';
    if (score >= 0.1) return '#93c5fd';
    return '#dbeafe';
  };

  const getHeatColor = (score: number): string => {
    if (score >= 0.7) return '#991b1b';
    if (score >= 0.5) return '#dc2626';
    if (score >= 0.3) return '#f87171';
    if (score >= 0.1) return '#fca5a5';
    return '#fee2e2';
  };

  const getLandslideColor = (score: number): string => {
    if (score >= 0.7) return '#78350f';
    if (score >= 0.5) return '#a16207';
    if (score >= 0.3) return '#ca8a04';
    if (score >= 0.1) return '#eab308';
    return '#fef3c7';
  };

  const getPopulationColor = (density: number): string => {
    if (density >= 0.5) return '#5b21b6';
    if (density >= 0.3) return '#7c3aed';
    if (density >= 0.15) return '#8b5cf6';
    if (density >= 0.05) return '#a78bfa';
    if (density > 0) return '#c4b5fd';
    return '#ede9fe';
  };

  const getBuildingColor = (density: number): string => {
    if (density >= 0.5) return '#9a3412';
    if (density >= 0.3) return '#c2410c';
    if (density >= 0.15) return '#ea580c';
    if (density >= 0.05) return '#f97316';
    if (density > 0) return '#fb923c';
    return '#ffedd5';
  };

  const getApplicableCategories = useCallback((typology: string): InterventionCategory[] => {
    if (!interventionsData) return [];
    return Object.values(interventionsData.categories).filter(cat => 
      cat.applicableTypologies.includes(typology)
    );
  }, [interventionsData]);

  const getInterventionsByCategory = useCallback((categoryId: string): InterventionType[] => {
    if (!interventionsData) return [];
    return interventionsData.interventions.filter(i => i.category === categoryId);
  }, [interventionsData]);

  const sortedZonesByRisk = useMemo(() => {
    const zonesLayer = layers.find(l => l.id === 'intervention_zones');
    const features = zonesLayer?.data?.geoJson?.features || [];
    return features
      .map((f: any) => ({
        ...f.properties,
        geometry: f.geometry,
        // Badge shows the dominant hazard's within-city percentile band (display).
        dominantPct: dominantPercentile(f.properties),
      }))
      // ORDER by priorityScore (now a percentile rank) — the same basis the orchestrator uses,
      // so the two priority views can't drift. (Was max-of-ranks, which inflated
      // spatially-concentrated landslide; see risk-display.ts.)
      .sort((a: any, b: any) => (b.priorityScore ?? 0) - (a.priorityScore ?? 0));
  }, [layers]);

  const evidenceLayers = useMemo(() => {
    return layers.filter(l => l.id !== 'intervention_zones');
  }, [layers]);

  const zonesLayerEnabled = useMemo(() => {
    return layers.find(l => l.id === 'intervention_zones')?.enabled ?? true;
  }, [layers]);

  const addInterventionToPortfolio = useCallback((zoneId: string, intervention: InterventionType, areaKm2: number) => {
    const costUnit = intervention.costRange.unit;
    let costMultiplier = 1;
    
    if (costUnit === 'USD/ha') {
      costMultiplier = areaKm2 * 100;
    } else if (costUnit === 'USD/m²') {
      costMultiplier = areaKm2 * 1000000;
    } else if (costUnit === 'USD/m') {
      const approxPerimeterM = Math.sqrt(areaKm2) * 4 * 1000;
      costMultiplier = approxPerimeterM;
    } else {
      costMultiplier = areaKm2 * 100;
    }

    const newIntervention: SelectedIntervention = {
      interventionId: intervention.id,
      interventionName: intervention.name,
      category: intervention.category,
      estimatedCost: {
        min: Math.round(intervention.costRange.min * costMultiplier),
        max: Math.round(intervention.costRange.max * costMultiplier),
        unit: 'USD',
      },
      estimatedArea: areaKm2,
      areaUnit: 'km²',
      impacts: intervention.impacts,
      addedAt: new Date().toISOString(),
    };

    setZonePortfolios(prev => {
      const existing = prev[zoneId] || [];
      if (existing.some(i => i.interventionId === intervention.id)) {
        return prev;
      }
      return { ...prev, [zoneId]: [...existing, newIntervention] };
    });
  }, []);

  const removeInterventionFromPortfolio = useCallback((zoneId: string, interventionId: string) => {
    setZonePortfolios(prev => {
      const existing = prev[zoneId] || [];
      return { ...prev, [zoneId]: existing.filter(i => {
        if (i.assetId) {
          return `${i.assetId}_${i.interventionId}` !== interventionId;
        }
        return i.interventionId !== interventionId;
      })};
    });
  }, []);

  const addAssetInterventionToPortfolio = useCallback((zoneId: string, asset: any, intervention: InterventionType) => {
    const areaM2 = asset.area || 10000;
    const areaHa = areaM2 / 10000;
    const lengthM = asset.length || 0;
    const costUnit = intervention.costRange.unit;
    let costMultiplier = 1;
    let estimatedMeasure = areaHa;
    let measureUnit = 'ha';
    
    if (costUnit === 'USD/ha') {
      costMultiplier = areaHa;
      estimatedMeasure = areaHa;
      measureUnit = 'ha';
    } else if (costUnit === 'USD/m²') {
      costMultiplier = areaM2;
      estimatedMeasure = areaM2;
      measureUnit = 'm²';
    } else if (costUnit === 'USD/m') {
      costMultiplier = lengthM > 0 ? lengthM : Math.sqrt(areaM2) * 4;
      estimatedMeasure = lengthM > 0 ? lengthM : Math.sqrt(areaM2) * 4;
      measureUnit = 'm';
    } else {
      costMultiplier = areaHa;
      estimatedMeasure = areaHa;
      measureUnit = 'ha';
    }

    const newIntervention: SelectedIntervention = {
      interventionId: intervention.id,
      interventionName: intervention.name,
      category: intervention.category,
      estimatedCost: {
        min: Math.round(intervention.costRange.min * costMultiplier),
        max: Math.round(intervention.costRange.max * costMultiplier),
        unit: 'USD',
      },
      estimatedArea: estimatedMeasure,
      areaUnit: measureUnit,
      impacts: intervention.impacts,
      addedAt: new Date().toISOString(),
      assetId: asset.id,
      assetName: asset.name,
      assetType: asset.assetType,
      osmId: asset.osmId,
      centroid: asset.centroid,
    };

    setZonePortfolios(prev => {
      const existing = prev[zoneId] || [];
      const filtered = existing.filter(i => i.assetId !== asset.id);
      return { ...prev, [zoneId]: [...filtered, newIntervention] };
    });
  }, []);

  const searchOsmByName = useCallback(async () => {
    if (!osmSearchQuery.trim() || !selectedZoneFeature || !selectedCategory) return;
    
    setIsSearchingOsm(true);
    setOsmSearchResults([]);
    
    try {
      const bounds = selectedZoneFeature.geometry.type === 'Polygon' 
        ? turf.bbox(selectedZoneFeature)
        : null;
      
      if (!interventionsData) return;
      
      const interventionsInCategory = interventionsData.interventions.filter(i => i.category === selectedCategory);
      const osmTypes = Array.from(new Set(interventionsInCategory.flatMap(i => i.osmAssetTypes)));
      
      const response = await apiRequest('POST', '/api/geospatial/osm-search', {
        query: osmSearchQuery,
        bbox: bounds,
        category: selectedCategory,
        osmTypes,
        zoneGeometry: selectedZoneFeature.geometry,
      });
      
      const data = await response.json();
      
      // Add compatible interventions to search results
      const assetsWithInterventions = (data.assets || []).map((asset: any) => ({
        ...asset,
        compatibleInterventions: interventionsInCategory,
      }));
      
      setOsmSearchResults(assetsWithInterventions);
    } catch (error) {
      console.error('OSM search error:', error);
      toast({
        title: 'Search failed',
        description: 'Could not search OpenStreetMap. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsSearchingOsm(false);
    }
  }, [osmSearchQuery, selectedZoneFeature, selectedCategory, interventionsData, toast]);

  const parseCoordinates = useCallback((coordString: string): { lat: number; lng: number } | null => {
    const cleaned = coordString.trim().replace(/\s+/g, ' ');
    const parts = cleaned.split(/[,\s]+/).filter(p => p.length > 0);
    if (parts.length >= 2) {
      const lat = parseFloat(parts[0]);
      const lng = parseFloat(parts[1]);
      if (!isNaN(lat) && !isNaN(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) {
        return { lat, lng };
      }
    }
    return null;
  }, []);

  const createManualAsset = useCallback(() => {
    if (!manualAssetName.trim() || !manualAssetCoords.trim() || !selectedCategory) return;
    
    const coords = parseCoordinates(manualAssetCoords);
    
    if (!coords) {
      toast({
        title: 'Invalid coordinates',
        description: 'Please enter valid coordinates in the format: latitude, longitude (e.g., -30.024, -51.220)',
        variant: 'destructive',
      });
      return;
    }
    
    const areaM2 = manualAssetArea ? parseFloat(manualAssetArea) * 10000 : 10000;
    const interventionsInCategory = interventionsData?.interventions.filter(i => i.category === selectedCategory) || [];
    
    const manualAsset = {
      id: `manual_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      name: manualAssetName,
      assetType: manualAssetType || `manual=${selectedCategory}`,
      centroid: [coords.lat, coords.lng] as [number, number],
      area: areaM2,
      length: 0,
      compatibleInterventions: interventionsInCategory,
      source: 'manual' as const,
    };
    
    setOsmAssets(prev => [manualAsset, ...prev]);
    setSelectedAsset(manualAsset);
    setShowAddAssetDialog(false);
    setManualAssetName('');
    setManualAssetCoords('');
    setManualAssetArea('');
    setManualAssetType('');
  }, [manualAssetName, manualAssetCoords, manualAssetArea, manualAssetType, selectedCategory, interventionsData, toast, parseCoordinates]);

  const selectSearchResult = useCallback((asset: any) => {
    setOsmAssets(prev => {
      const exists = prev.some(a => a.id === asset.id);
      if (exists) return prev;
      return [asset, ...prev];
    });
    setSelectedAsset(asset);
    setShowAddAssetDialog(false);
    setOsmSearchQuery('');
    setOsmSearchResults([]);
  }, []);

  const [saveSuccess, setSaveSuccess] = useState<string | null>(null);
  
  const savePortfolioToContext = useCallback(() => {
    if (!projectId) return;
    
    const zonesLayer = layers.find(l => l.id === 'intervention_zones');
    const zonesData = zonesLayer?.data?.geoJson?.features || [];
    
    const selectedZones: SelectedZone[] = Object.entries(zonePortfolios)
      .filter(([_, portfolio]) => portfolio.length > 0)
      .map(([zoneId, portfolio]) => {
        const zoneFeature = zonesData.find((f: any) => f.properties?.zoneId === zoneId);
        const props = zoneFeature?.properties || {};
        return {
          zoneId,
          zoneName: props.zoneName || (zoneId.startsWith('zone_') ? `Zone ${zoneId.replace('zone_', '')}` : zoneId),
          hazardType: props.typologyLabel || 'LOW',
          primaryHazard: props.primaryHazard,
          secondaryHazard: props.secondaryHazard,
          riskScore: Math.max(props.meanFlood || 0, props.meanHeat || 0, props.meanLandslide || 0),
          meanFlood: props.meanFlood,
          meanHeat: props.meanHeat,
          meanLandslide: props.meanLandslide,
          area: (props.areaKm2 || 0) * 1000000,
          areaKm2: props.areaKm2,
          populationSum: props.populationSum,
          interventionType: props.interventionType,
          interventionPortfolio: portfolio,
        };
      });

    const totalCells = zonesData.reduce((sum: number, f: any) => sum + (f.properties?.cellCount || 0), 0);
    const floodCells = zonesData.filter((f: any) => f.properties?.typologyLabel?.includes('FLOOD')).reduce((sum: number, f: any) => sum + (f.properties?.cellCount || 0), 0);
    const heatCells = zonesData.filter((f: any) => f.properties?.typologyLabel?.includes('HEAT')).reduce((sum: number, f: any) => sum + (f.properties?.cellCount || 0), 0);
    const landslideCells = zonesData.filter((f: any) => f.properties?.typologyLabel?.includes('LANDSLIDE')).reduce((sum: number, f: any) => sum + (f.properties?.cellCount || 0), 0);

    updateModule('siteExplorer', {
      selectedZones,
      layerPreferences: layers.reduce((acc, l) => ({ ...acc, [l.id]: l.enabled }), {}),
      hazardSummary: { floodCells, heatCells, landslideCells, totalCells },
    });
    
    const zoneId = selectedZone?.zoneId;
    const interventionCount = zoneId ? zonePortfolios[zoneId]?.length || 0 : 0;
    
    setSaveSuccess(zoneId || null);
    toast({
      title: t('siteExplorer.interventionsSaved'),
      description: t('siteExplorer.interventionsSavedDescription', { count: interventionCount }),
    });
    
    setTimeout(() => setSaveSuccess(null), 2000);
  }, [projectId, zonePortfolios, layers, updateModule, selectedZone, toast, t]);

  const formatCost = (min: number, max: number): string => {
    const formatNum = (n: number) => {
      if (n >= 1000000) return `$${(n / 1000000).toFixed(1)}M`;
      if (n >= 1000) return `$${(n / 1000).toFixed(0)}K`;
      return `$${n.toFixed(0)}`;
    };
    return `${formatNum(min)} - ${formatNum(max)}`;
  };

  const getImpactBadgeColor = (impact: string): string => {
    if (impact === 'high') return 'bg-green-100 text-green-800';
    if (impact === 'medium-high' || impact === 'medium') return 'bg-yellow-100 text-yellow-800';
    if (impact === 'low-medium') return 'bg-orange-100 text-orange-800';
    return 'bg-gray-100 text-gray-600';
  };

  const getCategoryIcon = (iconName: string) => {
    switch (iconName) {
      case 'droplets': return <Droplets className="h-5 w-5" />;
      case 'trees': return <Trees className="h-5 w-5" />;
      case 'mountain': return <Mountain className="h-5 w-5" />;
      case 'layers': return <Layers className="h-5 w-5" />;
      default: return <Leaf className="h-5 w-5" />;
    }
  };

  const createLayerFromData = useCallback((layerId: string, data: any): L.Layer | null => {
    if (!data) return null;

    switch (layerId) {
      case 'intervention_zones':
        if (data.geoJson?.features) {
          // Calculate max and min risk across all zones for opacity normalization
          const features = data.geoJson.features;
          const risks = features.map((f: any) => 
            Math.max(f.properties?.meanFlood || 0, f.properties?.meanHeat || 0, f.properties?.meanLandslide || 0)
          );
          const globalMaxRisk = Math.max(...risks, 0.01);
          const globalMinRisk = Math.min(...risks);
          const riskRange = globalMaxRisk - globalMinRisk || 0.01;
          
          console.log('[Zones] Risk range:', globalMinRisk.toFixed(2), 'to', globalMaxRisk.toFixed(2));
          
          return L.geoJSON(data.geoJson, {
            style: (feature) => {
              const typology = feature?.properties?.typologyLabel || 'LOW';
              const color = TYPOLOGY_COLORS[typology] || '#10b981';
              
              // Calculate this zone's risk and normalize opacity
              const p = feature?.properties || {};
              const zoneRisk = Math.max(p.meanFlood || 0, p.meanHeat || 0, p.meanLandslide || 0);
              // Normalize to 0-1 range based on actual min/max spread
              const normalizedRisk = (zoneRisk - globalMinRisk) / riskRange;
              // Fill opacity ranges from 0.08 (lowest risk) to 0.65 (highest risk)
              const fillOpacity = 0.08 + (normalizedRisk * 0.57);
              // Border opacity ranges from 0.3 (lowest risk) to 1.0 (highest risk)
              const borderOpacity = 0.3 + (normalizedRisk * 0.7);
              // Border weight also scales: 1px (lowest) to 3px (highest)
              const borderWeight = 1 + (normalizedRisk * 2);
              
              if (zonesOutlineOnlyRef.current) return { ...ZONE_OUTLINE_STYLE, fillColor: color };
              return {
                color: color,
                weight: borderWeight,
                fillColor: color,
                fillOpacity: fillOpacity,
                opacity: borderOpacity,
              };
            },
            onEachFeature: (feature, layer) => {
              const p = feature.properties || {};
              const typologyLabel = t(`interventionZones.typologies.${p.typologyLabel}`) || p.typologyLabel;
              const interventionLabel = t(`interventionZones.interventions.${p.interventionType}`) || p.interventionType;
              const interventionDesc = t(`interventionZones.interventions.${p.interventionType}_desc`) || '';
              // "Also recommended" secondaries (e.g. slope stabilization on landslide-prone terrain).
              const secondaryLine = Array.isArray(p.secondaryInterventions) && p.secondaryInterventions.length
                ? `<span style="color:${TYPOLOGY_COLORS.LANDSLIDE}">▨</span> <strong>${t('interventionZones.metrics.alsoRecommended') || 'Also recommended'}:</strong> ` +
                  p.secondaryInterventions.map((s: string) => t(`interventionZones.interventions.${s}`) || s).join(', ') + `<br/>`
                : '';

              const displayName = p.neighbourhoodName || formatZoneName(p.zoneId);
              const povertyLine = p.povertyRate != null ? `${t('interventionZones.metrics.poverty') || 'Poverty'}: ${(p.povertyRate * 100).toFixed(1)}%<br/>` : '';
              const popLine = p.populationTotal ? `${t('interventionZones.metrics.population') || 'Population'}: ${p.populationTotal.toLocaleString()}<br/>` : '';
              // Per-hazard within-city percentile band + score + absolute anchor (see risk-display.ts)
              const riskLine = (hz: HazardKey, labelKey: string) => {
                const pct = hazardPercentile(p, hz);
                const band = riskBand(pct);
                const anchor = riskAnchor(p, hz);
                return `<span style="color:${band.color}">●</span> ${t(labelKey)}: <strong>${t(`riskBands.${band.key}`) || band.label} (${pct})</strong>` +
                  (anchor ? ` <span style="opacity:0.65;font-size:10px">${anchor}</span>` : '') + `<br/>`;
              };
              let tooltip = `<div style="min-width: 200px;">` +
                `<strong style="font-size: 14px;">${displayName}: ${typologyLabel}</strong><br/>` +
                `<hr style="margin: 4px 0; border-color: rgba(255,255,255,0.3);"/>` +
                `<strong>${t('interventionZones.metrics.intervention')}:</strong> ${interventionLabel}<br/>` +
                `<em style="font-size: 11px;">${interventionDesc}</em><br/>` +
                secondaryLine +
                `<hr style="margin: 4px 0; border-color: rgba(255,255,255,0.3);"/>` +
                riskLine('flood', 'interventionZones.metrics.meanFlood') +
                riskLine('heat', 'interventionZones.metrics.meanHeat') +
                // Landslide is shown as SUSCEPTIBILITY (terrain), not a risk band — its
                // risk is structurally tiny (low exposure), so a percentile band would
                // mislead. Flag the morros from the catalog landslide hazard.
                (p.landslideSusceptible
                  ? `<span style="color:${TYPOLOGY_COLORS.LANDSLIDE}">▨</span> ${t('interventionZones.metrics.meanLandslide')}: <strong>${t('siteExplorer.landslideProne') || 'landslide-prone terrain'}</strong><br/>`
                  : '') +
                `<span style="opacity:0.55;font-size:10px">${t('siteExplorer.relativeToCity') || 'relative to PoA neighborhoods'}</span><br/>` +
                `<hr style="margin: 4px 0; border-color: rgba(255,255,255,0.3);"/>` +
                popLine + povertyLine +
                `${t('interventionZones.metrics.area')}: ${(p.areaKm2 || 0).toFixed(1)} km²<br/>` +
                `${t('interventionZones.metrics.cells')}: ${p.cellCount || 0}<br/>` +
                `<em style="font-size: 11px; color: #60a5fa;">Click to select interventions</em>` +
                `</div>`;
              
              layer.bindTooltip(tooltip, { sticky: true });
              
              layer.on('click', () => {
                setSelectedZone(p as ZoneProperties);
                setSelectedZoneFeature(feature);
                setSelectedCategory(null);
                setSelectedAsset(null);
                setOsmAssets([]);
              });
            },
          });
        }
        return null;

      case 'ibge_census':
        if (data.geoJson?.features) {
          return L.geoJSON(data.geoJson, {
            // One indicator, in classes (shared/explorer-key-maps.ts): share of
            // households in poverty. Under the zones and the place names, so
            // the bairros stay clickable and the names stay readable.
            pane: PANE_RASTER,
            style: (feature) => {
              const rate = feature?.properties?.[CENSUS_POVERTY_FIELD];
              const noData = typeof rate !== 'number';
              return { color: '#ffffff', weight: 1, opacity: 0.9, fillColor: censusPovertyColor(rate), fillOpacity: noData ? 0.4 : 0.8 };
            },
            onEachFeature: (feature, layer) => {
              const p = feature.properties || {};
              if (typeof p[CENSUS_POVERTY_FIELD] !== 'number') {
                layer.bindTooltip(`<strong>${p.neighbourhood_name || '?'}</strong><br/><em>No household data</em>`, { sticky: true });
                return;
              }
              layer.bindTooltip(
                `<strong>${p.neighbourhood_name || '?'}</strong><br/>` +
                `Pop: ${p.population_total?.toLocaleString() || '?'}<br/>` +
                `Households in poverty: ${((p.poverty_rate || 0) * 100).toFixed(1)}%<br/>` +
                `Low income: ${((p.pct_low_income || 0) * 100).toFixed(0)}%<br/>` +
                `Area: ${p.area_km2?.toFixed(1) || '?'} km²`,
                { sticky: true }
              );
            },
          });
        }
        return null;

      case 'ibge_settlements':
        if (data.geoJson?.features) {
          return L.geoJSON(data.geoJson, {
            style: { color: '#9f1239', weight: 1.2, fillColor: '#e11d48', fillOpacity: 0.75, opacity: 1 },
            onEachFeature: (feature, layer) => {
              const name = feature.properties?.settlement_name || 'Informal Settlement';
              layer.bindTooltip(`<strong>${name}</strong><br/><em>Informal settlement</em>`, { sticky: true });
            },
          });
        }
        return null;

      case 'flood_2024_extent':
        if (data.geoJson?.features) {
          return L.geoJSON(data.geoJson, {
            // Dashed outline; the trace of fill only keeps the inside hoverable.
            style: { color: FLOOD_2024_OUTLINE, weight: 1.8, dashArray: '5 3', fillColor: FLOOD_2024_OUTLINE, fillOpacity: 0.04, opacity: 1 },
            onEachFeature: (feature, layer) => {
              const p = feature.properties || {};
              layer.bindTooltip(
                `<strong>May 2024 flood extent (observed)</strong><br/>` +
                `${p.event_date || 'May 2024'}<br/>` +
                `<em>${p.data_source || 'Planet SkySat'}</em>`,
                { sticky: true }
              );
            },
          });
        }
        return null;

      case 'elevation':
        if (data.contours?.features) {
          return L.geoJSON(data.contours, {
            style: (feature) => ({
              color: feature?.properties?.isMajor ? '#c9a87c' : '#a08060',
              weight: feature?.properties?.isMajor ? 1.5 : 0.8,
              opacity: feature?.properties?.isMajor ? 0.9 : 0.6,
            }),
            onEachFeature: (feature, layer) => {
              if (feature.properties?.elevation && feature.properties?.isMajor) {
                layer.bindTooltip(`${feature.properties.elevation}m`, { permanent: false, direction: 'center' });
              }
            },
          });
        }
        return null;
      
      case 'landcover':
        if (data.geoJson?.features) {
          const landcoverColors: { [key: string]: string } = {
            tree_cover: '#006400',
            shrubland: '#ffbb22',
            grassland: '#84cc16',
            cropland: '#f096ff',
            built_up: '#fa0000',
            bare_sparse: '#b4b4b4',
            water: '#0064c8',
            wetland: '#0096a0',
          };
          return L.geoJSON(data.geoJson, {
            style: (feature) => {
              const props = feature?.properties || {};
              const lc = props.landcover_class || '';
              const landuse = props.landuse || '';
              const natural = props.natural || '';
              let color = landcoverColors[lc] || '#4ade80';
              if (!lc) {
                if (landuse === 'residential' || landuse === 'commercial' || landuse === 'industrial') color = '#fa0000';
                else if (natural === 'water' || landuse === 'reservoir') color = '#0064c8';
                else if (natural === 'wood' || landuse === 'forest') color = '#006400';
                else if (landuse === 'grass' || natural === 'grassland') color = '#84cc16';
              }
              return { color, weight: 1, fillColor: color, fillOpacity: 0.4, opacity: 0.7 };
            },
            onEachFeature: (feature, layer) => {
              const props = feature.properties || {};
              const lc = props.landcover_class || props.landuse || props.natural || 'Unknown';
              const lcDisplay = lc.replace(/_/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase());
              const name = props.name ? `<strong>${props.name}</strong><br/>` : '';
              layer.bindTooltip(`${name}Land cover: ${lcDisplay}`, { sticky: true });
            },
          });
        }
        return null;
      
      case 'surface_water':
        if (data.geoJson?.features) {
          return L.geoJSON(data.geoJson, {
            style: { color: '#3b82f6', weight: 2, fillColor: '#3b82f6', fillOpacity: 0.4, opacity: 0.8 },
            onEachFeature: (feature, layer) => {
              const props = feature.properties || {};
              const name = props.name ? `<strong>${props.name}</strong><br/>` : '';
              const waterType = props.water || props.natural || 'Water body';
              const intermittent = props.intermittent === 'yes' ? ' (seasonal)' : '';
              layer.bindTooltip(`${name}${waterType}${intermittent}`, { sticky: true });
            },
          });
        }
        return null;
      
      case 'rivers':
        if (data.geoJson?.features) {
          return L.geoJSON(data.geoJson, {
            style: (feature) => ({
              color: feature?.properties?.waterway === 'river' ? '#06b6d4' : '#22d3ee',
              weight: feature?.properties?.waterway === 'river' ? 2.5 : 1.5,
              opacity: 0.8,
            }),
            onEachFeature: (feature, layer) => {
              const props = feature.properties || {};
              const name = props.name ? `<strong>${props.name}</strong><br/>` : '';
              const type = props.waterway || 'Waterway';
              layer.bindTooltip(`${name}${type.charAt(0).toUpperCase() + type.slice(1)}`, { sticky: true });
            },
          });
        }
        return null;
      
      case 'forest':
        if (data.geoJson?.features) {
          return L.geoJSON(data.geoJson, {
            style: { color: '#22c55e', weight: 1, fillColor: '#22c55e', fillOpacity: 0.4, opacity: 0.7 },
            onEachFeature: (feature, layer) => {
              const props = feature.properties || {};
              const name = props.name ? `<strong>${props.name}</strong><br/>` : '';
              const type = props.natural === 'wood' ? 'Natural woodland' : 'Forest';
              layer.bindTooltip(`${name}${type}`, { sticky: true });
            },
          });
        }
        return null;
      
      case 'population':
        if (data.geoJson?.features) {
          return L.geoJSON(data.geoJson, {
            style: { color: '#f97316', weight: 1, fillColor: '#f97316', fillOpacity: 0.3, opacity: 0.6 },
            onEachFeature: (feature, layer) => {
              const props = feature.properties || {};
              const name = props.name ? `<strong>${props.name}</strong><br/>` : '';
              layer.bindTooltip(`${name}Residential area`, { sticky: true });
            },
          });
        }
        return null;
      
      default:
        // OSM reference layers — generic GeoJSON rendering
        if (layerId.startsWith('osm_') && data.geoJson?.features) {
          const layerConfig = LAYER_CONFIGS.find(l => l.id === layerId);
          const color = layerConfig?.color || '#888';
          return L.geoJSON(data.geoJson, {
            style: { color, weight: 1.5, fillColor: color, fillOpacity: 0.3, opacity: 0.7 },
            pointToLayer: (_feature, latlng) => L.circleMarker(latlng, {
              radius: 5, color, fillColor: color, fillOpacity: 0.6, weight: 1,
            }),
            onEachFeature: (feature, layer) => {
              const p = feature.properties || {};
              const name = p.name ? `<strong>${p.name}</strong>` : '';
              const type = p.amenity || p.leisure || p.natural || p.landuse || '';
              const label = [name, type].filter(Boolean).join('<br/>') || 'OSM Feature';
              layer.bindTooltip(label, { sticky: true });
            },
          });
        }
        // Official risk sectors (SGB/CPRM) — polygons styled by grau_risco, with
        // the survey record itself in the popup. See shared/official-risk.ts.
        if (OFFICIAL_VECTOR_LAYERS.some(l => l.id === layerId) && data.geoJson?.features) {
          return L.geoJSON(data.geoJson, {
            style: (feature) => {
              const c = sectorColors(feature?.properties?.grau_risco);
              // Near-black outline and a denser fill: the sectors are the
              // landslide map's companion, and the grade's own dark red line
              // disappeared into SGB's orange/red susceptibility classes.
              return {
                color: '#1c1917',
                weight: 2,
                fillColor: c.fill,
                fillOpacity: 0.6,
                opacity: 1,
              };
            },
            onEachFeature: (feature, layer) => {
              layer.bindPopup(
                sectorPopupHtml(feature.properties || {}, SECTOR_POPUP_LABELS),
                { maxWidth: 340 }
              );
              const p = feature.properties || {};
              layer.bindTooltip(
                `${p.local || p.num_setor || 'Setor'} — ${p.grau_risco || ''}`,
                { sticky: true }
              );
            },
          });
        }
        return null;
    }
  }, []);

  const createTileLayer = useCallback((layerConfig: LayerState): L.TileLayer | null => {
    if (!layerConfig.tileLayerId) return null;
    // Local risk tiles use /tiles/, WMS-backed official layers use the WMS
    // proxy, S3 catalog tiles use the tile proxy. All three are already encoded
    // in the shared catalog — resolve through tileVisualUrl so this and the CBO
    // MapMicroapp cannot disagree about a layer's URL.
    const def = ALL_TILE_LAYERS.find(l => l.id === layerConfig.id);
    const isLocal = layerConfig.tileLayerId.startsWith('_local_');
    const tileUrl = def
      ? tileVisualUrl(def)
      : isLocal
        ? `/tiles/${layerConfig.tileLayerId.replace('_local_', '')}/{z}/{x}/{y}.png`
        : `/api/geospatial/tiles/${layerConfig.tileLayerId}/{z}/{x}/{y}.png`;
    // SGB serves its WMS from a regional cache; asking past z15 just upscales.
    const isWms = tileUrl.startsWith('/api/geospatial/wms/');
    const look = layerLookRef.current.get(layerConfig.id);
    return L.tileLayer(tileUrl, {
      pane: OFFICIAL_RASTER_GROUPS.includes(layerConfig.group) ? PANE_RASTER : PANE_RASTER_CITY,
      opacity: look?.opacity ?? DEFAULT_TILE_OPACITY,
      ...(look?.zIndex != null ? { zIndex: look.zIndex } : {}),
      maxNativeZoom: isLocal ? 14 : 15,
      maxZoom: 19,
      minZoom: isLocal ? 10 : 10,
      errorTileUrl: '',
      className: isLocal ? 'risk-tile-layer' : isWms ? 'sgb-tile-layer' : 'oef-tile-layer',
    });
  }, []);

  // ARVC official raster — one georeferenced PNG per layer, drawn as an image
  // overlay at full 29 m detail. The pixels are also the values (palette index
  // ÷ 254), so the same image answers "what is it here?" on hover; see
  // shared/arvc-official.ts for why that readout is an interval rather than a
  // single number at the top of the ramp.
  const createArvcOfficialLayer = useCallback((layerId: string): L.ImageOverlay | null => {
    const def = arvcOfficialLayer(layerId);
    if (!def) return null;

    const overlay = L.imageOverlay(arvcOfficialPngUrl(layerId), ARVC_OFFICIAL_BOUNDS, {
      pane: PANE_RASTER,
      opacity: 0.75,
      interactive: true,
      className: 'arvc-official-layer',
      alt: def.name,
    });

    // Prefer the manifest's bounds once it lands; they are computed from the
    // warp that produced the PNG, so they cannot disagree with the pixels.
    loadArvcOfficialManifest().then(man => {
      const b = man?.layers?.[layerId]?.bounds;
      if (b && overlay.setBounds) overlay.setBounds(L.latLngBounds(b[0], b[1]));
    });

    // Hover readout. The image is sampled through an offscreen canvas, which is
    // why decodeArvcFromRgb works on colour rather than palette index.
    let ctx: CanvasRenderingContext2D | null = null;
    let imgW = 0;
    let imgH = 0;
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      imgW = img.naturalWidth;
      imgH = img.naturalHeight;
      const canvas = document.createElement('canvas');
      canvas.width = imgW;
      canvas.height = imgH;
      const c = canvas.getContext('2d', { willReadFrequently: true });
      if (!c) return;
      c.drawImage(img, 0, 0);
      ctx = c;
    };
    img.src = arvcOfficialPngUrl(layerId);

    const readAt = (latlng: L.LatLng): string => {
      const head = `<strong>${def.name}</strong>`;
      if (!ctx) return head;
      const bounds = overlay.getBounds();
      const s = bounds.getSouth();
      const n = bounds.getNorth();
      const w = bounds.getWest();
      const e = bounds.getEast();
      if (latlng.lat < s || latlng.lat > n || latlng.lng < w || latlng.lng > e) return head;
      // The PNG is in EPSG:3857, so x is linear in longitude but y is linear in
      // the Mercator projection of latitude — not in latitude itself. Using lat
      // directly would drift by hundreds of metres across the city.
      const mercY = (lat: number) => Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360));
      const px = Math.floor(((latlng.lng - w) / (e - w)) * imgW);
      const py = Math.floor(((mercY(n) - mercY(latlng.lat)) / (mercY(n) - mercY(s))) * imgH);
      if (px < 0 || py < 0 || px >= imgW || py >= imgH) return head;
      const d = ctx.getImageData(px, py, 1, 1).data;
      const reading = decodeArvcFromRgb(def, d[0], d[1], d[2], d[3]);
      if (!reading) {
        return (
          `${head}<br/><span style="color:#6b7280">Outside the analysed area — ` +
          `not the same as low risk.</span>`
        );
      }
      return (
        `${head}<br/><strong>${reading.className}</strong> — ${formatArvcReading(reading)}` +
        `<br/><span style="color:#6b7280">${def.namePt}</span>` +
        `<br/><span style="color:#166534">Official — PLAC / SMAMUS, 29 m</span>`
      );
    };

    overlay.bindTooltip('', { sticky: true });
    overlay.on('mousemove', (ev: L.LeafletMouseEvent) => {
      overlay.setTooltipContent(`<div style="font-size:11px;max-width:250px">${readAt(ev.latlng)}</div>`);
    });
    return overlay;
  }, []);

  const toggleLayer = useCallback(async (layerId: string) => {
    setLayers(prev => {
      const layer = prev.find(l => l.id === layerId);
      if (!layer || !layer.available) return prev;

      if (layer.enabled) {
        console.log(`[Layer] Toggling OFF: ${layerId}`);
        const existingLayer = layerRefs.current.get(layerId);
        if (existingLayer && mapRef.current) {
          try {
            mapRef.current.removeLayer(existingLayer);
          } catch (e) {
            console.error(`[Layer] Failed to remove: ${layerId}`, e);
          }
          layerRefs.current.delete(layerId);
        }
        return prev.map(l => l.id === layerId ? { ...l, enabled: false } : l);
      } else {
        console.log(`[Layer] Toggling ON: ${layerId}`);
        
        const existingLayer = layerRefs.current.get(layerId);
        if (existingLayer && mapRef.current) {
          mapRef.current.removeLayer(existingLayer);
          layerRefs.current.delete(layerId);
        }

        // Spatial query layers — use buildSpatialQueryLayer
        if (layerId.startsWith('sq_')) {
          const queryDef = SPATIAL_QUERIES.find(q => q.id === layerId);
          if (queryDef && mapRef.current) {
            setLoadingLayers(prev => new Set(prev).add(layerId));
            buildSpatialQueryLayer(queryDef).then(result => {
              setLoadingLayers(prev => { const next = new Set(prev); next.delete(layerId); return next; });
              if (result && mapRef.current) {
                result.layer.addTo(mapRef.current);
                layerRefs.current.set(layerId, result.layer);
                setLayers(cur => cur.map(l => l.id === layerId ? { ...l, enabled: true, loaded: true } : l));
              } else {
                setLayers(cur => cur.map(l => l.id === layerId ? { ...l, enabled: false } : l));
              }
            }).catch(() => {
              setLoadingLayers(prev => { const next = new Set(prev); next.delete(layerId); return next; });
              setLayers(cur => cur.map(l => l.id === layerId ? { ...l, enabled: false } : l));
            });
            return prev.map(l => l.id === layerId ? { ...l, enabled: true } : l);
          }
          return prev;
        }

        if (layer.source === 'image') {
          if (!mapRef.current) return prev;
          const overlay = createArvcOfficialLayer(layerId);
          if (overlay) {
            overlay.addTo(mapRef.current);
            layerRefs.current.set(layerId, overlay);
            return prev.map(l => l.id === layerId ? { ...l, enabled: true, loaded: true } : l);
          }
          return prev;
        }

        if (layer.source === 'tiles') {
          if (!mapRef.current || !layer.tileLayerId) {
            console.warn(`[Layer] Cannot add tile layer: ${layerId} — map or tileLayerId missing`);
            return prev;
          }
          const tileLayer = createTileLayer(layer);
          if (tileLayer) {
            tileLayer.addTo(mapRef.current);
            layerRefs.current.set(layerId, tileLayer);
            console.log(`[Layer] Added tile layer: ${layerId}`);
            return prev.map(l => l.id === layerId ? { ...l, enabled: true, loaded: true } : l);
          }
          return prev;
        }
        
        const cachedData = layerDataCache.current.get(layerId);
        
        if (cachedData && mapRef.current) {
          console.log(`[Layer] Using cached data for: ${layerId}`);
          const leafletLayer = createLayerFromData(layerId, cachedData);
          if (leafletLayer) {
            leafletLayer.addTo(mapRef.current);
            layerRefs.current.set(layerId, leafletLayer);
          }
          return prev.map(l => l.id === layerId ? { ...l, enabled: true, loaded: true, data: cachedData } : l);
        }
        
        if (layer.loaded && layer.data && mapRef.current) {
          const leafletLayer = createLayerFromData(layerId, layer.data);
          if (leafletLayer) {
            leafletLayer.addTo(mapRef.current);
            layerRefs.current.set(layerId, leafletLayer);
          }
          return prev.map(l => l.id === layerId ? { ...l, enabled: true } : l);
        }
        
        setLoadingLayers(prev => new Set(prev).add(layerId));
        
        loadLayerData(layerId).then(data => {
          setLoadingLayers(prev => {
            const next = new Set(prev);
            next.delete(layerId);
            return next;
          });
          
          if (data) {
            layerDataCache.current.set(layerId, data);
            
            setLayers(currentLayers => {
              const currentLayer = currentLayers.find(l => l.id === layerId);
              if (!currentLayer?.enabled) return currentLayers;
              
              if (layerRefs.current.has(layerId)) {
                return currentLayers.map(l => l.id === layerId ? { ...l, loaded: true, data } : l);
              }
              
              if (mapRef.current) {
                const leafletLayer = createLayerFromData(layerId, data);
                if (leafletLayer) {
                  leafletLayer.addTo(mapRef.current);
                  layerRefs.current.set(layerId, leafletLayer);
                }
              }
              
              return currentLayers.map(l => l.id === layerId ? { ...l, loaded: true, data } : l);
            });
          }
        }).catch(error => {
          console.error(`Failed to load layer ${layerId}:`, error);
          setLoadingLayers(prev => {
            const next = new Set(prev);
            next.delete(layerId);
            return next;
          });
          setLayers(currentLayers => currentLayers.map(l => l.id === layerId ? { ...l, enabled: false } : l));
        });
        
        return prev.map(l => l.id === layerId ? { ...l, enabled: true } : l);
      }
    });
  }, [loadLayerData, createLayerFromData, createTileLayer, createArvcOfficialLayer]);

  // ── Key maps ───────────────────────────────────────────────────────────────
  // Apply one of the curated maps (shared/explorer-key-maps.ts), or null to
  // leave the one that is on. A new map replaces whatever layers are showing
  // (the zones stay, as outlines); leaving a map takes only its own layers off.
  const applyKeyMap = useCallback((id: ExplorerKeyMapId | null) => {
    if (!mapRef.current) return;
    const next = id ? explorerKeyMap(id) : null;
    const leaving = activeKeyMapRef.current ? explorerKeyMap(activeKeyMapRef.current).layers.map(l => l.id) : [];
    const wanted = new Set(next?.layers.map(l => l.id) ?? []);

    for (const l of layersRef.current) {
      if (l.id === 'intervention_zones' || !l.enabled || wanted.has(l.id)) continue;
      if (next || leaving.includes(l.id)) toggleLayer(l.id);
    }
    layerLookRef.current.clear();
    next?.layers.forEach((l, i) => {
      layerLookRef.current.set(l.id, { opacity: l.opacity, zIndex: i + 1 });
      const onMap = layerRefs.current.get(l.id) as L.TileLayer | undefined;
      if (onMap && layersRef.current.find(s => s.id === l.id)?.enabled) {
        // Already showing (shared with the map being left): restyle in place.
        onMap.setOpacity?.(l.opacity ?? DEFAULT_TILE_OPACITY);
        onMap.setZIndex?.(i + 1);
      } else {
        toggleLayer(l.id);
      }
    });
    activeKeyMapRef.current = id;
    setActiveKeyMap(id);
  }, [toggleLayer]);

  // A layer switched by hand in the drawer: the layers stay as they are, the
  // chip simply stops claiming the map is one of the six.
  const toggleLayerByHand = useCallback((layerId: string) => {
    layerLookRef.current.delete(layerId);
    activeKeyMapRef.current = null;
    setActiveKeyMap(null);
    toggleLayer(layerId);
  }, [toggleLayer]);

  // ← / → step through the key maps, for presenting. Caught in the capture
  // phase so Leaflet does not also pan the map; left alone while typing or
  // inside a widget that owns the arrows (tabs, menus, sliders, dialogs).
  useEffect(() => {
    if (!mapReady) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
      if (e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
      const el = e.target as HTMLElement | null;
      if (el?.closest?.('input, textarea, select, [contenteditable=""], [contenteditable="true"], [role="tablist"], [role="menu"], [role="listbox"], [role="slider"], [role="radiogroup"], [role="dialog"]')) return;
      const ids = EXPLORER_KEY_MAPS.map(m => m.id);
      const at = activeKeyMapRef.current ? ids.indexOf(activeKeyMapRef.current) : -1;
      const step = e.key === 'ArrowRight' ? 1 : -1;
      const to = at === -1 ? (step === 1 ? 0 : ids.length - 1) : (at + step + ids.length) % ids.length;
      e.preventDefault();
      e.stopPropagation();
      applyKeyMap(ids[to]);
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [mapReady, applyKeyMap]);

  // ── Moving the map from outside (deep link; later, the chat) ───────────────
  /** Select a bairro by name, as a click on it would. False when no bairro has that name. */
  const focusPlaceByName = useCallback((name: string, zoom?: number): boolean => {
    const zonesLayer = layerRefs.current.get('intervention_zones') as L.GeoJSON | undefined;
    if (!zonesLayer) return false;
    const wanted = foldPlaceName(name);
    let hit: any = null;
    zonesLayer.eachLayer((layer: any) => {
      const p = layer.feature?.properties;
      if (!hit && p && (foldPlaceName(p.neighbourhoodName || '') === wanted || foldPlaceName(String(p.zoneId || '').replace(/_/g, ' ')) === wanted)) hit = layer;
    });
    if (!hit) return false;
    pendingZoneZoomRef.current = zoom ?? null;
    hit.fire('click');
    // On touch-capable browsers Leaflet opens the bairro's tooltip on click.
    hit.closeTooltip?.();
    return true;
  }, []);

  const flyToPoint = useCallback((lat: number, lng: number, zoom?: number) => {
    const map = mapRef.current;
    if (!map) return;
    viewTouchedRef.current = true;
    map.flyTo([lat, lng], zoom ?? Math.max(map.getZoom(), 14), { duration: 0.8 });
  }, []);

  // Apply the deep link once: the key map as soon as the map exists, the place
  // once the bairros are on it (a name needs them). One-shot by construction —
  // `deepLinkDone` never goes back to false.
  const zonesOnMap = mapReady && layers.some(l => l.id === 'intervention_zones' && l.loaded);
  const deepLinkMapApplied = useRef(false);
  useEffect(() => {
    if (deepLinkDone || !mapReady) return;
    if (!deepLinkMapApplied.current) {
      deepLinkMapApplied.current = true;
      if (deepLink.map) applyKeyMap(deepLink.map);
    }
    const place = deepLink.place;
    if (!place) {
      if (deepLink.zoom != null) { viewTouchedRef.current = true; mapRef.current?.setZoom(deepLink.zoom); }
      setDeepLinkDone(true);
      return;
    }
    if (place.kind === 'point') {
      viewTouchedRef.current = true;
      mapRef.current?.setView([place.lat, place.lng], deepLink.zoom ?? 14);
      setDeepLinkDone(true);
      return;
    }
    // A name: wait for the bairros (sample data); elsewhere there are none to wait for.
    if (!zonesOnMap && isSampleModeActive) return;
    focusPlaceByName(place.name, deepLink.zoom ?? undefined);
    setDeepLinkDone(true);
  }, [deepLinkDone, mapReady, zonesOnMap, isSampleModeActive, deepLink, applyKeyMap, focusPlaceByName]);

  // Keep the address bar copyable: the key map always, the view once someone
  // has moved it. replaceState only — no history entries, no navigation.
  const writeViewToUrl = useCallback(() => {
    const map = mapRef.current;
    if (!map || typeof window === 'undefined') return;
    const url = new URL(window.location.href);
    if (activeKeyMapRef.current) url.searchParams.set('map', activeKeyMapRef.current);
    else url.searchParams.delete('map');
    if (viewTouchedRef.current) {
      // A selected bairro is written by name, so the link reopens it selected.
      const c = map.getCenter();
      url.searchParams.set('place', selectedZoneNameRef.current || `${c.lat.toFixed(5)},${c.lng.toFixed(5)}`);
      url.searchParams.set('z', String(Math.round(map.getZoom() * 10) / 10));
    } else {
      // Nothing moved the map: whatever place/z the link carried was not understood.
      url.searchParams.delete('place');
      url.searchParams.delete('z');
    }
    // Commas stay readable; URLSearchParams would write %2C.
    const next = `${url.pathname}${url.search.replace(/%2C/gi, ',')}${url.hash}`;
    if (next !== `${window.location.pathname}${window.location.search}${window.location.hash}`) {
      window.history.replaceState(window.history.state, '', next);
    }
  }, []);

  selectedZoneNameRef.current = selectedZone ? (selectedZone.neighbourhoodName || selectedZone.zoneId) : null;
  useEffect(() => {
    if (deepLinkDone) writeViewToUrl();
  }, [deepLinkDone, activeKeyMap, selectedZone, writeViewToUrl]);

  useEffect(() => {
    const map = mapRef.current;
    if (!deepLinkDone || !mapReady || !map) return;
    const el = map.getContainer();
    const touched = () => { viewTouchedRef.current = true; };
    const onMoveEnd = () => writeViewToUrl();
    el.addEventListener('pointerdown', touched);
    el.addEventListener('wheel', touched, { passive: true });
    map.on('moveend', onMoveEnd);
    return () => {
      el.removeEventListener('pointerdown', touched);
      el.removeEventListener('wheel', touched);
      map.off('moveend', onMoveEnd);
    };
  }, [deepLinkDone, mapReady, writeViewToUrl]);

  // The view, for the page context: once when the map is ready, then on moveend.
  useEffect(() => {
    const map = mapRef.current;
    if (!mapReady || !map) return;
    const read = () => {
      const c = map.getCenter();
      const next = { lat: Number(c.lat.toFixed(5)), lng: Number(c.lng.toFixed(5)), zoom: Math.round(map.getZoom() * 10) / 10 };
      setMapView(prev => (prev && prev.lat === next.lat && prev.lng === next.lng && prev.zoom === next.zoom ? prev : next));
    };
    read();
    map.on('moveend', read);
    return () => { map.off('moveend', read); };
  }, [mapReady]);

  // ── Map commands (client/src/legacy/lib/explorerMapCommands.ts) ────────────
  const setPins = useCallback((places: ExplorerPinnedPlace[], fit: boolean) => {
    const map = mapRef.current;
    if (!map) return;
    pinsLayerRef.current?.remove();
    pinsLayerRef.current = null;
    const valid = places.filter(p => p && Number.isFinite(p.lat) && Number.isFinite(p.lng) && Math.abs(p.lat) <= 90 && Math.abs(p.lng) <= 180);
    setPinnedPlaces(valid);
    if (valid.length === 0) return;

    const esc = (v: unknown) => String(v ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]!));
    const group = L.layerGroup();
    // Rank 1 is added last, so where pins crowd the best-ranked one is on top.
    [...valid].sort((a, b) => b.rank - a.rank).forEach(place => {
      const marker = L.marker([place.lat, place.lng], {
        icon: L.divIcon({
          className: 'explorer-pin',
          html: `<div style="width:26px;height:26px;border-radius:9999px;background:#18181b;border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.45);color:#fff;font:700 12px/22px system-ui,sans-serif;text-align:center">${esc(place.rank)}</div>`,
          iconSize: [26, 26],
          iconAnchor: [13, 13],
        }),
        title: place.name,
        keyboard: false,
        zIndexOffset: 1000 - place.rank,
      });
      marker.bindTooltip(
        `<strong>${esc(place.rank)}. ${esc(place.name)}</strong>` + (place.subtitle ? `<br/><span style="opacity:.75">${esc(place.subtitle)}</span>` : ''),
        { direction: 'top', offset: [0, -14] }
      );
      marker.on('click', () => {
        window.dispatchEvent(new CustomEvent<ExplorerPinnedPlace>(EXPLORER_PIN_CLICKED_EVENT, { detail: place }));
      });
      marker.addTo(group);
    });
    group.addTo(map);
    pinsLayerRef.current = group;

    if (fit) {
      viewTouchedRef.current = true;
      // Top padding clears the key maps row.
      map.fitBounds(L.latLngBounds(valid.map(p => [p.lat, p.lng] as [number, number])), {
        paddingTopLeft: [60, 120], paddingBottomRight: [60, 60], maxZoom: 16,
      });
    }
  }, []);

  const runMapCommand = useCallback((cmd: ExplorerMapCommand) => {
    switch (cmd.type) {
      case 'show_map':
        if (cmd.preset === null || isExplorerKeyMapId(cmd.preset)) applyKeyMap(cmd.preset);
        break;
      case 'fly_to':
        if (Number.isFinite(cmd.lat) && Number.isFinite(cmd.lng)) flyToPoint(cmd.lat, cmd.lng, cmd.zoom);
        break;
      case 'focus_place':
        if (typeof cmd.name === 'string') focusPlaceByName(cmd.name);
        break;
      case 'pin_places':
        setPins(Array.isArray(cmd.places) ? cmd.places : [], cmd.fit !== false);
        break;
      case 'clear_pins':
        setPins([], false);
        break;
    }
  }, [applyKeyMap, flyToPoint, focusPlaceByName, setPins]);

  // Commands that arrive before the map (and, for a place name, the bairros)
  // are held and run in order once it is there.
  const pendingCommandsRef = useRef<ExplorerMapCommand[]>([]);
  const commandsReady = mapReady && (zonesOnMap || !isSampleModeActive);
  const commandsReadyRef = useRef(commandsReady);
  commandsReadyRef.current = commandsReady;
  const runMapCommandRef = useRef(runMapCommand);
  runMapCommandRef.current = runMapCommand;
  useEffect(() => onExplorerMapCommand(cmd => {
    if (commandsReadyRef.current) runMapCommandRef.current(cmd);
    else pendingCommandsRef.current.push(cmd);
  }), []);
  useEffect(() => {
    if (!commandsReady) return;
    const held = pendingCommandsRef.current;
    pendingCommandsRef.current = [];
    held.forEach(cmd => runMapCommandRef.current(cmd));
  }, [commandsReady]);

  // Cache elevation data when it arrives (don't auto-add to map)
  useEffect(() => {
    if (elevationData) {
      layerDataCache.current.set('elevation', elevationData);
      setLayers(prev => prev.map(l => l.id === 'elevation' ? { ...l, loaded: true, data: elevationData } : l));
    }
  }, [elevationData]);

  // Load and display intervention zones layer in sample mode
  useEffect(() => {
    if (!mapReady || !isSampleModeActive || !mapRef.current) return;
    
    const zonesLayer = layers.find(l => l.id === 'intervention_zones');
    
    // If layer is enabled and not yet on map, add it
    if (zonesLayer?.enabled && !layerRefs.current.has('intervention_zones')) {
      if (layerDataCache.current.has('intervention_zones')) {
        // Data already cached, just add the layer
        const data = layerDataCache.current.get('intervention_zones');
        const leafletLayer = createLayerFromData('intervention_zones', data);
        if (leafletLayer && mapRef.current) {
          leafletLayer.addTo(mapRef.current);
          layerRefs.current.set('intervention_zones', leafletLayer);
          console.log('[Layer] Auto-added intervention_zones from cache on mount');
        }
      } else {
        // Load data and add to map
        loadLayerData('intervention_zones').then(data => {
          if (data) {
            layerDataCache.current.set('intervention_zones', data);
            setLayers(prev => prev.map(l => l.id === 'intervention_zones' ? { ...l, loaded: true, data } : l));
            
            // Add to map if still enabled and map exists
            if (mapRef.current && !layerRefs.current.has('intervention_zones')) {
              const leafletLayer = createLayerFromData('intervention_zones', data);
              if (leafletLayer) {
                leafletLayer.addTo(mapRef.current);
                layerRefs.current.set('intervention_zones', leafletLayer);
                console.log('[Layer] Auto-added intervention_zones after load');
              }
            }
          }
        });
      }
    }
  }, [mapReady, isSampleModeActive, loadLayerData, layers, createLayerFromData]);

  // Drawer search: by layer name, ignoring case and accents.
  const foldText = (v: string) => v.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const layerSearchNeedle = foldText(layerSearch.trim());
  const matchesLayerSearch = (l: { name: string }) => !layerSearchNeedle || foldText(l.name).includes(layerSearchNeedle);
  const activeKeyMapDef = activeKeyMap ? explorerKeyMap(activeKeyMap) : null;
  // Beside the zone card when one is open; otherwise just clear of the zoom control.
  const keyMapsLeft = selectedZone ? 448 : 56;

  const isNotFound = isSampleModeActive 
    ? (!sampleAction || !isSampleProjectInitiated)
    : (!projectData?.project && !isLoadingProject);

  if (isNotFound) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <div className="container mx-auto px-4 py-8">
          <Link href={`${routePrefix}/cities`}>
            <Button variant="ghost" className="mb-4">
              <ArrowLeft className="h-4 w-4 mr-2" />
              {t('common.back')}
            </Button>
          </Link>
          <p>{t('project.notFound')}</p>
        </div>
      </div>
    );
  }

  const isLoading = isLoadingSampleData || (!isSampleModeActive && (isLoadingProject || isLoadingCity || boundaryMutation.isPending || elevationMutation.isPending));

  if (!navigationRestored || !dataHydrated) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <div className="container mx-auto px-4 py-8 flex items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col bg-background">
      <Header />
      <div className="flex-1 flex flex-col">
        <div className="px-4 py-3 flex items-center gap-4 border-b">
          <Link href={`${routePrefix}/project/${projectId}`}>
            <Button variant="ghost" size="sm">
              <ArrowLeft className="h-4 w-4 mr-2" />
              {t('common.back')}
            </Button>
          </Link>
          <div className="flex items-center gap-3">
            <span className="font-semibold">{t('siteExplorer.title')}</span>
            {isSampleModeActive && (
              <Badge variant="secondary" className="text-xs">{t('cityInfo.sampleDataBadge')}</Badge>
            )}
            {(sampleAction || projectData?.project) && (
              <span className="text-muted-foreground text-sm">
                {sampleAction?.name || projectData?.project?.actionName}
              </span>
            )}
          </div>
        </div>
        {/* `isolate`: the zone panel / evidence drawer / zone card below are
            z-1001 and live outside .leaflet-container, so without a local
            stacking context they paint over every portalled Radix overlay
            (all z-50) — including the ⓘ data-provenance dialog. */}
        <div className="flex-1 relative isolate">
          {/* Map container - leaves room for right panel and bottom drawer */}
          <div
            ref={mapContainerRef}
            className="absolute top-0 left-0 z-0 h-full"
            style={{
              right: '320px',
              bottom: showEvidenceDrawer ? '180px' : '48px',
              transition: 'bottom 0.3s ease'
            }}
          >
            <ValueTooltip mapRef={mapRef} enabledLayers={enabledTileLayerDefs} mapReady={mapReady} />
          </div>
          
          {isLoading && (
            <div className="absolute inset-0 flex items-center justify-center bg-background/80 z-10 pointer-events-none">
              <div className="flex flex-col items-center gap-3">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
                <p className="text-sm text-muted-foreground">
                  {isLoadingSampleData 
                    ? t('siteExplorer.loadingData')
                    : boundaryMutation.isPending 
                      ? t('siteExplorer.loadingBoundary')
                      : t('siteExplorer.loadingElevation')}
                </p>
              </div>
            </div>
          )}
          
          {/* Key maps: the six curated maps, always in view over the top of the
              map. Clear of the zoom control on the left and of the zone panel
              on the right; steps aside when the zone card opens. */}
          <div
            className="absolute top-2.5 z-[1001] flex pointer-events-none"
            style={{ left: `${keyMapsLeft}px`, right: '332px', transition: 'left 0.2s ease' }}
          >
            <div
              data-testid="key-maps"
              className="pointer-events-auto max-w-full rounded-xl bg-zinc-900/90 backdrop-blur-sm border border-zinc-700 shadow-lg"
            >
              <div role="toolbar" aria-label={t('siteExplorer.keyMaps.ariaLabel')} className="flex flex-wrap items-center gap-1 p-1">
                {EXPLORER_KEY_MAPS.map(m => {
                  const isActive = activeKeyMap === m.id;
                  return (
                    <button
                      key={m.id}
                      type="button"
                      data-testid={`key-map-${m.id}`}
                      aria-pressed={isActive}
                      disabled={!mapReady}
                      onClick={(e) => { applyKeyMap(isActive ? null : m.id); e.currentTarget.blur(); }}
                      className={`h-8 px-3 rounded-lg text-[13px] font-medium whitespace-nowrap flex items-center gap-2 transition-colors disabled:opacity-50 ${
                        isActive
                          ? 'bg-white text-zinc-900 shadow'
                          : 'text-zinc-300 hover:text-white hover:bg-white/10'
                      }`}
                    >
                      <i
                        className={`w-2 h-2 rounded-full flex-shrink-0 ${isActive ? 'ring-2 ring-zinc-900/15' : ''}`}
                        style={{ backgroundColor: m.color }}
                      />
                      {t(`siteExplorer.keyMaps.${m.id}.label`, { defaultValue: m.label.en })}
                    </button>
                  );
                })}
                <span
                  className={`${selectedZone ? 'hidden' : 'hidden xl:inline'} px-1.5 text-[11px] text-zinc-500 select-none whitespace-nowrap`}
                  title={t('siteExplorer.keyMaps.arrowsHint')}
                  aria-hidden="true"
                >
                  ← →
                </span>
              </div>
              {activeKeyMapDef && (
                // width:0 + min-width:100% — the caption wraps to the chips'
                // width instead of stretching the panel across the map.
                <div
                  data-testid="key-map-caption"
                  className="border-t border-white/10 px-3 py-1.5 leading-snug"
                  style={{ width: 0, minWidth: '100%' }}
                >
                  <div className="text-[12.5px] text-zinc-100">
                    {t(`siteExplorer.keyMaps.${activeKeyMapDef.id}.caption`, { defaultValue: activeKeyMapDef.caption.en })}
                  </div>
                  <div className="text-[11px] text-zinc-400 mt-0.5">
                    {t('siteExplorer.keyMaps.sourceLine', { source: t(`siteExplorer.keyMaps.${activeKeyMapDef.id}.source`, { defaultValue: activeKeyMapDef.source.en }) })}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Right Panel - Zone Priority List (Frosted Glass) - ends at 30% from bottom */}
          <div 
            className="absolute top-0 right-0 w-[320px] z-[1001] bg-zinc-900/80 backdrop-blur-xl border-l border-white/10 shadow-2xl flex flex-col rounded-bl-xl"
            style={{ pointerEvents: 'auto', bottom: '30%' }}
            onWheel={(e) => e.stopPropagation()}
            onMouseEnter={() => mapRef.current?.scrollWheelZoom.disable()}
            onMouseLeave={() => mapRef.current?.scrollWheelZoom.enable()}
          >
            <div className="p-3 border-b border-white/10 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <MapPinned className="h-4 w-4 text-primary" />
                <span className="font-semibold text-sm text-white">{t('siteExplorer.zonePriority')}</span>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span
                      data-testid="zone-priority-oef-estimate"
                      className="text-[10px] font-medium uppercase tracking-wide px-1.5 py-0.5 rounded border border-amber-400/40 text-amber-300 cursor-help"
                    >
                      {t('siteExplorer.oefEstimate')}
                    </span>
                  </TooltipTrigger>
                  <TooltipContent side="bottom" className="text-xs max-w-[240px]">
                    {t('siteExplorer.oefEstimateHint')}
                  </TooltipContent>
                </Tooltip>
              </div>
              <div className="flex items-center gap-2">
                <Button 
                  variant="ghost" 
                  size="sm"
                  onClick={() => toggleLayer('intervention_zones')}
                  className="h-8 px-2 text-white hover:bg-white/10"
                >
                  {zonesLayerEnabled ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
                </Button>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-2 space-y-1">
              {sortedZonesByRisk.length === 0 ? (
                <div className="text-center py-8 text-zinc-400 text-sm">
                  <MapPinned className="h-8 w-8 mx-auto mb-2 opacity-50" />
                  <p>{t('siteExplorer.noZonesLoaded')}</p>
                </div>
              ) : (
                sortedZonesByRisk.map((zone: any) => {
                  const portfolio = zonePortfolios[zone.zoneId] || [];
                  const isSelected = selectedZone?.zoneId === zone.zoneId;
                  const groupedByCategory = portfolio.reduce((acc: any, item: SelectedIntervention) => {
                    if (!acc[item.category]) acc[item.category] = [];
                    acc[item.category].push(item);
                    return acc;
                  }, {});
                  
                  const handleZoneClick = () => {
                    const zonesLayer = layerRefs.current.get('intervention_zones') as L.GeoJSON | undefined;
                    if (zonesLayer) {
                      zonesLayer.eachLayer((layer: any) => {
                        if (layer.feature?.properties?.zoneId === zone.zoneId) {
                          layer.fire('click');
                        }
                      });
                    }
                  };
                  
                  return (
                    <div 
                      key={zone.zoneId}
                      className={`rounded-lg border transition-colors cursor-pointer ${isSelected ? 'border-primary bg-primary/20' : 'border-white/5 hover:border-white/20 hover:bg-white/5'}`}
                      onClick={handleZoneClick}
                    >
                      <div
                        className="w-full p-2 text-left flex items-center gap-2"
                      >
                        <div 
                          className="w-3 h-3 rounded-full flex-shrink-0"
                          style={{ backgroundColor: TYPOLOGY_COLORS[zone.typologyLabel] || '#10b981' }}
                        />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-sm truncate text-white min-w-0 flex-1">{zone.neighbourhoodName || formatZoneName(zone.zoneId)}</span>
                            {(() => {
                              const band = riskBand(zone.dominantPct);
                              return (
                                <span
                                  className="text-xs px-1.5 py-0.5 rounded flex-shrink-0 font-medium"
                                  style={{ backgroundColor: `${band.color}26`, color: band.color }}
                                  title={`${t('siteExplorer.oefEstimate')} · ${t('siteExplorer.relativeToCity') || 'relative to PoA neighborhoods'}`}
                                >
                                  {t(`riskBands.${band.key}`) || band.label} · {zone.dominantPct}
                                </span>
                              );
                            })()}
                          </div>
                          {/* The slope chip sits on the second line, beside the
                              typology. On the first line it competed with the
                              risk badge for space and — both being flex-shrink-0
                              — squeezed the bairro NAME to zero width. */}
                          <div className="text-xs text-zinc-400 flex items-center gap-2 min-w-0">
                            <span className="truncate">
                              {t(`interventionZones.typologies.${zone.typologyLabel}`)}
                            </span>
                            {zone.landslideSusceptible && (
                              <span
                                className="text-[10px] px-1.5 rounded flex-shrink-0 font-medium border border-dashed"
                                style={{ borderColor: TYPOLOGY_COLORS.LANDSLIDE, color: TYPOLOGY_COLORS.LANDSLIDE }}
                                title={t('siteExplorer.landslideProne')}
                              >
                                ▨ {t('siteExplorer.landslideProneShort')}
                              </span>
                            )}
                          </div>
                        </div>
                        {portfolio.length > 0 && (
                          <Badge className="flex-shrink-0 text-xs bg-primary/20 text-primary-foreground border-primary/30">
                            {portfolio.length}
                          </Badge>
                        )}
                        <ChevronRight className="h-4 w-4 text-zinc-400 flex-shrink-0" />
                      </div>
                      
                      {portfolio.length > 0 && (
                        <div className="px-2 pb-2 space-y-1">
                          {/* Only show +N more if total sites in zone > 5 */}
                          {portfolio.length <= 5 ? (
                            // Show all items when 5 or fewer
                            Object.entries(groupedByCategory).map(([category, items]: [string, any]) => (
                              <div key={category} className="ml-5 pl-2 border-l border-white/20">
                                <div className="text-xs text-zinc-400 font-medium py-1">
                                  {interventionsData?.categories[category]?.name || category} ({items.length})
                                </div>
                                {items.map((item: SelectedIntervention) => (
                                  <div key={item.assetId || item.interventionId} className="text-xs py-0.5 truncate text-zinc-300">
                                    {item.assetName || item.interventionName}
                                  </div>
                                ))}
                              </div>
                            ))
                          ) : (
                            // Show limited items with +N more when > 5 total
                            Object.entries(groupedByCategory).map(([category, items]: [string, any]) => (
                              <div key={category} className="ml-5 pl-2 border-l border-white/20">
                                <div className="text-xs text-zinc-400 font-medium py-1">
                                  {interventionsData?.categories[category]?.name || category} ({items.length})
                                </div>
                                {items.slice(0, 2).map((item: SelectedIntervention) => (
                                  <div key={item.assetId || item.interventionId} className="text-xs py-0.5 truncate text-zinc-300">
                                    {item.assetName || item.interventionName}
                                  </div>
                                ))}
                                {items.length > 2 && (
                                  <div className="text-xs text-zinc-500">+{items.length - 2} more</div>
                                )}
                              </div>
                            ))
                          )}
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Bottom Drawer - Evidence Layers - takes 70% width with rounded top-right */}
          <div 
            ref={drawerRef}
            className={`absolute left-0 bottom-0 z-[1001] bg-zinc-900/95 backdrop-blur-sm border-t border-r border-zinc-700 transition-all duration-300 rounded-tr-xl ${showEvidenceDrawer ? 'max-h-[320px]' : 'h-[48px]'}`}
            style={{ pointerEvents: 'auto', width: '75%' }}
          >
            {/* The whole catalogue, one click away; the key maps above the map
                are what people meet first. */}
            <div className="h-[48px] flex items-center hover:bg-zinc-800/50 transition-colors rounded-tr-xl">
              <button
                className="flex-1 min-w-0 h-full pl-4 pr-2 flex items-center gap-3 text-left"
                onClick={() => setShowEvidenceDrawer(!showEvidenceDrawer)}
                aria-expanded={showEvidenceDrawer}
                data-testid="all-layers-toggle"
              >
                <Layers className="h-4 w-4 text-zinc-400 flex-shrink-0" />
                <span className="font-medium text-sm text-white whitespace-nowrap">{t('siteExplorer.allLayers', { count: evidenceLayers.length })}</span>
                <span className="text-xs text-zinc-500 whitespace-nowrap">
                  {t('siteExplorer.layersActive', { count: evidenceLayers.filter(l => l.enabled).length })}
                </span>
              </button>
              {showEvidenceDrawer && (
                <div className="relative w-[240px] flex-shrink-0">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-zinc-500 pointer-events-none" />
                  <input
                    type="search"
                    autoFocus
                    value={layerSearch}
                    onChange={(e) => setLayerSearch(e.target.value)}
                    placeholder={t('siteExplorer.searchLayers')}
                    aria-label={t('siteExplorer.searchLayers')}
                    data-testid="layer-search"
                    className="w-full h-8 pl-8 pr-2 rounded-md bg-zinc-800 border border-zinc-700 text-xs text-white placeholder:text-zinc-500 focus:outline-none focus:border-zinc-500"
                  />
                </div>
              )}
              <button
                className="h-full px-4 flex items-center"
                onClick={() => setShowEvidenceDrawer(!showEvidenceDrawer)}
                aria-label={t('siteExplorer.allLayers', { count: evidenceLayers.length })}
                tabIndex={-1}
              >
                {showEvidenceDrawer ? (
                  <ChevronDown className="h-5 w-5 text-zinc-400" />
                ) : (
                  <ChevronUp className="h-5 w-5 text-zinc-400" />
                )}
              </button>
            </div>
            
            {showEvidenceDrawer && (
              <div className="px-4 pb-4 overflow-y-auto" style={{ maxHeight: '270px' }}>
                {layerSearchNeedle && !evidenceLayers.some(matchesLayerSearch) && (
                  <div className="py-6 text-center text-xs text-zinc-500" data-testid="layer-search-empty">
                    {t('siteExplorer.noLayersMatch', { query: layerSearch.trim() })}
                  </div>
                )}
                {LAYER_GROUPS.map(group => {
                  const groupLayers = evidenceLayers.filter(l => l.group === group.id && matchesLayerSearch(l));
                  if (groupLayers.length === 0) return null;
                  return (
                    <div key={group.id} className="mb-3">
                      <div className="flex items-center gap-2 mb-1.5">
                        <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">{group.label}</span>
                        <div className="flex-1 h-px bg-zinc-800" />
                      </div>
                      <div className="grid grid-cols-6 gap-1.5">
                        {groupLayers.map((layer) => {
                          const IconComponent = layer.icon;
                          const isLoading = loadingLayers.has(layer.id);
                          const isUnavailable = !layer.available;
                          return (
                            <Tooltip key={layer.id}>
                              <TooltipTrigger asChild>
                                <button
                                  data-layer-id={layer.id}
                                  className={`p-1.5 rounded-lg border transition-colors flex flex-col items-center gap-0.5 ${
                                    isUnavailable
                                      ? 'border-zinc-800 opacity-40 cursor-not-allowed'
                                      : layer.enabled 
                                        ? 'border-primary bg-primary/10' 
                                        : 'border-zinc-700 hover:border-zinc-600 hover:bg-zinc-800/50'
                                  } ${isLoading ? 'opacity-70' : ''}`}
                                  onClick={() => !isUnavailable && toggleLayerByHand(layer.id)}
                                  disabled={isLoading || isUnavailable}
                                >
                                  <div 
                                    className="w-7 h-7 rounded-lg flex items-center justify-center relative"
                                    style={{ backgroundColor: layer.enabled ? `${layer.color}30` : 'transparent' }}
                                  >
                                    {isLoading ? (
                                      <Loader2 className="h-3.5 w-3.5 animate-spin" style={{ color: layer.color }} />
                                    ) : (
                                      <IconComponent className="h-3.5 w-3.5" style={{ color: layer.enabled ? layer.color : isUnavailable ? '#3f3f46' : '#71717a' }} />
                                    )}
                                    {layer.hasValueTiles && (
                                      <span className="absolute -top-0.5 -right-0.5 w-1.5 h-1.5 rounded-full bg-emerald-500" title="Values on hover" />
                                    )}
                                  </div>
                                  <span className={`text-[10px] text-center leading-tight line-clamp-2 ${
                                    isUnavailable ? 'text-zinc-600' : layer.enabled ? 'text-white' : 'text-zinc-500'
                                  }`}>
                                    {layer.name}
                                  </span>
                                </button>
                              </TooltipTrigger>
                              {isUnavailable ? (
                                <TooltipContent side="top" className="text-xs">
                                  Coming soon — data not yet available
                                </TooltipContent>
                              ) : layer.description ? (
                                <TooltipContent side="top" className="text-xs max-w-[260px]" data-testid={`layer-description-${layer.id}`}>
                                  <div className="font-medium mb-0.5">{layer.name}</div>
                                  {layer.description}
                                </TooltipContent>
                              ) : null}
                            </Tooltip>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Legends of the active layers, ON the map: bottom-left, just above
              the drawer whether it is open or closed (so there is one legend,
              not one in the drawer and one here), and beside the zone card when
              a zone is open. Roughly three fit; the rest scroll. */}
          {activeLegends.length > 0 && (
            <div
              data-testid="map-legends"
              className="absolute z-[1001] w-[264px] max-h-[172px] overflow-y-auto rounded-lg bg-zinc-900/90 backdrop-blur-sm border border-zinc-700 shadow-lg px-2.5 py-2 space-y-2"
              style={{
                left: selectedZone ? '448px' : '12px',
                bottom: `${drawerHeight + 12}px`,
                transition: 'left 0.2s ease',
              }}
              onWheel={(e) => e.stopPropagation()}
              onMouseEnter={() => mapRef.current?.scrollWheelZoom.disable()}
              onMouseLeave={() => mapRef.current?.scrollWheelZoom.enable()}
            >
              {activeLegends.map(l => (
                <div key={l.id}>
                  <div className="text-[11px] font-medium text-zinc-100 mb-1 leading-tight line-clamp-2">{l.name}</div>
                  <LayerLegend spec={legends[l.id]} />
                </div>
              ))}
            </div>
          )}

          {selectedZone && (
            <div 
              className="site-explorer-panel absolute top-4 left-4 z-[1001] w-[420px] max-h-[calc(100vh-160px)] bg-background rounded-lg shadow-xl border overflow-hidden flex flex-col"
              style={{ pointerEvents: 'auto' }}
              onWheel={(e) => e.stopPropagation()}
              onMouseDown={(e) => e.stopPropagation()}
              onTouchStart={(e) => e.stopPropagation()}
              onMouseEnter={() => mapRef.current?.scrollWheelZoom.disable()}
              onMouseLeave={() => mapRef.current?.scrollWheelZoom.enable()}
            >
              <div className="p-4 border-b bg-muted/50 flex-shrink-0">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div 
                      className="w-4 h-4 rounded"
                      style={{ backgroundColor: TYPOLOGY_COLORS[selectedZone.typologyLabel] || '#10b981' }}
                    />
                    <div>
                      <h3 className="font-semibold">{selectedZone.neighbourhoodName || formatZoneName(selectedZone.zoneId)}</h3>
                      <p className="text-sm text-muted-foreground">
                        {t(`interventionZones.typologies.${selectedZone.typologyLabel}`)}
                      </p>
                    </div>
                  </div>
                  <Button variant="ghost" size="icon" onClick={() => {
                    setSelectedZone(null);
                    setSelectedZoneFeature(null);
                    setSelectedCategory(null);
                    setSelectedAsset(null);
                    setOsmAssets([]);
                  }}>
                    <X className="h-4 w-4" />
                  </Button>
                </div>
                
                <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                  {([
                    ['flood', 'interventionZones.metrics.meanFlood'],
                    ['heat', 'interventionZones.metrics.meanHeat'],
                    ['landslide', 'interventionZones.metrics.meanLandslide'],
                  ] as [HazardKey, string][]).map(([hz, labelKey]) => {
                    const pct = hazardPercentile(selectedZone, hz);
                    const band = riskBand(pct);
                    const anchor = riskAnchor(selectedZone, hz);
                    return (
                      <div key={hz} className="p-2 rounded" style={{ backgroundColor: `${band.color}1f` }}>
                        <div className="text-lg font-semibold" style={{ color: band.color }}>{pct}</div>
                        <div className="text-xs text-muted-foreground">{t(labelKey)}</div>
                        <div className="text-[10px] font-medium" style={{ color: band.color }}>{t(`riskBands.${band.key}`) || band.label}</div>
                        {anchor && <div className="text-[9px] text-muted-foreground/70 mt-0.5 leading-tight">{anchor}</div>}
                      </div>
                    );
                  })}
                </div>

                <div className="mt-3 flex items-center gap-4 text-sm text-muted-foreground">
                  <span>{t('interventionZones.metrics.area')}: {(selectedZone.areaKm2 || 0).toFixed(1)} km²</span>
                  {selectedZone.populationSum && (
                    <span>Pop: {(selectedZone.populationSum / 1000).toFixed(0)}K</span>
                  )}
                </div>
              </div>

              <div 
                className="flex-1 min-h-0 overflow-y-auto"
                style={{ pointerEvents: 'auto', maxHeight: 'calc(100vh - 350px)' }}
                onWheel={(e) => e.stopPropagation()}
              >
                <div className="p-4 space-y-4">
                  {!selectedCategory ? (
                    <>
                      <h4 className="font-medium text-sm">Select Intervention Category</h4>
                      <div className="space-y-2">
                        {getApplicableCategories(selectedZone.typologyLabel).map(category => (
                          <button
                            key={category.id}
                            className="w-full p-3 rounded-lg border hover:border-primary hover:bg-primary/5 transition-colors text-left flex items-center gap-3"
                            onClick={() => setSelectedCategory(category.id)}
                          >
                            <div 
                              className="p-2 rounded-lg"
                              style={{ backgroundColor: `${category.color}20`, color: category.color }}
                            >
                              {getCategoryIcon(category.icon)}
                            </div>
                            <div className="flex-1">
                              <div className="font-medium">{category.name}</div>
                              <div className="text-sm text-muted-foreground">{category.description}</div>
                            </div>
                            <ChevronRight className="h-5 w-5 text-muted-foreground" />
                          </button>
                        ))}
                      </div>

                      {(zonePortfolios[selectedZone.zoneId]?.length || 0) > 0 && (
                        <div className="mt-6">
                          <div className="flex items-center justify-between mb-2">
                            <h4 className="font-medium text-sm">Intervention Portfolio</h4>
                            <Badge variant="secondary">{zonePortfolios[selectedZone.zoneId]?.length || 0} sites</Badge>
                          </div>
                          <div className="space-y-2">
                            {zonePortfolios[selectedZone.zoneId]?.map(intervention => (
                              <div key={intervention.assetId || intervention.interventionId} className="p-3 rounded-lg border bg-muted/30">
                                <div className="flex items-start justify-between">
                                  <div className="flex-1 min-w-0">
                                    {intervention.assetName && (
                                      <div className="font-medium text-sm truncate">{intervention.assetName}</div>
                                    )}
                                    <div className={`text-sm ${intervention.assetName ? 'text-muted-foreground' : 'font-medium'}`}>
                                      {intervention.interventionName}
                                    </div>
                                    <div className="text-xs text-muted-foreground mt-1">
                                      {intervention.estimatedArea?.toFixed(2) || '?'} {intervention.areaUnit || 'ha'}
                                      {intervention.estimatedCost && ` • ${formatCost(intervention.estimatedCost.min, intervention.estimatedCost.max)}`}
                                    </div>
                                  </div>
                                  <Button 
                                    variant="ghost" 
                                    size="icon"
                                    className="flex-shrink-0"
                                    onClick={() => removeInterventionFromPortfolio(
                                      selectedZone.zoneId, 
                                      intervention.assetId ? `${intervention.assetId}_${intervention.interventionId}` : intervention.interventionId
                                    )}
                                  >
                                    <Trash2 className="h-4 w-4 text-destructive" />
                                  </Button>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </>
                  ) : !selectedAsset ? (
                    <>
                      <div className="flex items-center gap-2">
                        <Button variant="ghost" size="sm" onClick={() => { setSelectedCategory(null); setOsmAssets([]); }}>
                          <ArrowLeft className="h-4 w-4 mr-1" />
                          Back
                        </Button>
                        <span className="font-medium">
                          {interventionsData?.categories[selectedCategory]?.name}
                        </span>
                      </div>

                      {isLoadingOsmAssets ? (
                        <div className="flex flex-col items-center justify-center py-8 gap-3">
                          <Loader2 className="h-8 w-8 animate-spin text-primary" />
                          <p className="text-sm text-muted-foreground">Searching for compatible assets...</p>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setShowAddAssetDialog(true)}
                            className="gap-1 mt-2"
                          >
                            <Plus className="h-4 w-4" />
                            Add Custom Site
                          </Button>
                        </div>
                      ) : osmAssets.length === 0 ? (
                        <div className="text-center py-8">
                          <MapPinned className="h-12 w-12 mx-auto text-muted-foreground/50 mb-3" />
                          {osmError ? (
                            <>
                              <p className="text-destructive font-medium">{t('siteExplorer.assetLoadError')}</p>
                              <p className="text-sm text-muted-foreground mt-1">{osmError}</p>
                              <Button 
                                variant="outline" 
                                size="sm" 
                                className="mt-3"
                                onClick={() => selectedZoneFeature && selectedCategory && fetchOsmAssets(selectedZoneFeature, selectedCategory)}
                              >
                                {t('siteExplorer.assetLoadErrorRetry')}
                              </Button>
                            </>
                          ) : (
                            <>
                              <p className="text-muted-foreground">{t('siteExplorer.noAssetsError')}</p>
                              <p className="text-sm text-muted-foreground mt-1">{t('siteExplorer.noAssetsErrorDescription')}</p>
                            </>
                          )}
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setShowAddAssetDialog(true)}
                            className="gap-1 mt-3"
                          >
                            <Plus className="h-4 w-4" />
                            Add Custom Site
                          </Button>
                        </div>
                      ) : (
                        <>
                          <div className="flex items-center justify-between mb-2">
                            <p className="text-sm text-muted-foreground">
                              {osmResultsTruncated && !osmShowAll
                                ? `Showing top ${Math.min(OSM_RESULT_LIMIT, osmAssets.length)} assets (${Math.max(osmTotalFound, osmAssets.length)} available).`
                                : osmTotalFound > osmAssets.length
                                  ? t('siteExplorer.assetsShowingTop', { shown: osmAssets.length, total: osmTotalFound })
                                  : `Found ${osmAssets.length} compatible assets.`
                              }
                            </p>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => setShowAddAssetDialog(true)}
                              className="gap-1"
                            >
                              <Plus className="h-4 w-4" />
                              Add Custom Site
                            </Button>
                          </div>
                          {osmResultsTruncated && !osmShowAll && osmAssets.length > OSM_RESULT_LIMIT && (
                            <Button
                              variant="outline"
                              size="sm"
                              className="w-full mb-2"
                              onClick={() => setOsmShowAll(true)}
                            >
                              Show all {osmAssets.length} assets
                            </Button>
                          )}
                          {osmTotalFound >= OSM_EXTENDED_LIMIT && (
                            <div className="flex items-center gap-2 p-2 mb-2 bg-blue-50 dark:bg-blue-950 text-blue-700 dark:text-blue-400 rounded-lg text-xs">
                              <AlertTriangle className="h-4 w-4 flex-shrink-0" />
                              <span>Many assets in this zone. Select a smaller zone or zoom in for more targeted selection.</span>
                            </div>
                          )}
                          <div className="space-y-2">
                            {(osmShowAll ? osmAssets : osmAssets.slice(0, OSM_RESULT_LIMIT)).map(asset => {
                              const hasIntervention = zonePortfolios[selectedZone.zoneId]?.some(
                                i => i.assetId === asset.id
                              );
                              return (
                                <button
                                  key={asset.id}
                                  className={`w-full p-3 rounded-lg border transition-colors text-left flex items-center gap-3 ${
                                    hasIntervention 
                                      ? 'border-green-500 bg-green-50 dark:bg-green-950' 
                                      : 'hover:border-primary hover:bg-primary/5'
                                  }`}
                                  onClick={() => setSelectedAsset(asset)}
                                >
                                  <div 
                                    className="p-2 rounded-lg"
                                    style={{ 
                                      backgroundColor: `${interventionsData?.categories[selectedCategory]?.color}20`, 
                                      color: interventionsData?.categories[selectedCategory]?.color 
                                    }}
                                  >
                                    <MapPinned className="h-5 w-5" />
                                  </div>
                                  <div className="flex-1 min-w-0">
                                    <div className="font-medium truncate">{asset.name}</div>
                                    <div className="text-sm text-muted-foreground">
                                      {asset.assetType.split('=')[1]} • {asset.length > 0 ? `${asset.length.toFixed(0)} m` : `${(asset.area / 10000).toFixed(2)} ha`}
                                    </div>
                                  </div>
                                  {hasIntervention ? (
                                    <Badge className="bg-green-100 text-green-800 flex-shrink-0">
                                      <Check className="h-3 w-3 mr-1" />
                                      Assigned
                                    </Badge>
                                  ) : (
                                    <ChevronRight className="h-5 w-5 text-muted-foreground flex-shrink-0" />
                                  )}
                                </button>
                              );
                            })}
                          </div>
                        </>
                      )}
                    </>
                  ) : (
                    <>
                      <div className="flex items-center gap-2">
                        <Button variant="ghost" size="sm" onClick={() => setSelectedAsset(null)}>
                          <ArrowLeft className="h-4 w-4 mr-1" />
                          Back to assets
                        </Button>
                      </div>

                      <div className="p-3 rounded-lg border bg-muted/30">
                        <div className="font-medium">{selectedAsset.name}</div>
                        <div className="text-sm text-muted-foreground mt-1">
                          {selectedAsset.assetType.split('=')[1]} • {selectedAsset.length > 0 ? `${selectedAsset.length.toFixed(0)} m` : `${(selectedAsset.area / 10000).toFixed(2)} ha`}
                        </div>
                      </div>

                      <h4 className="font-medium text-sm mt-4">Select Intervention for this Asset</h4>
                      <div className="space-y-3">
                        {selectedAsset.compatibleInterventions.map((intervention: InterventionType) => {
                          const existingIntervention = zonePortfolios[selectedZone.zoneId]?.find(
                            i => i.assetId === selectedAsset.id
                          );
                          const isSelected = existingIntervention?.interventionId === intervention.id;
                          
                          return (
                            <Card key={intervention.id} className={isSelected ? 'border-primary bg-primary/5' : ''}>
                              <CardHeader className="p-4 pb-2">
                                <div className="flex items-start justify-between gap-2">
                                  <div>
                                    <CardTitle className="text-base">{intervention.name}</CardTitle>
                                    <CardDescription className="mt-1">{intervention.description}</CardDescription>
                                  </div>
                                  <Button
                                    variant={isSelected ? 'secondary' : 'default'}
                                    size="sm"
                                    onClick={() => {
                                      if (isSelected) {
                                        removeInterventionFromPortfolio(selectedZone.zoneId, `${selectedAsset.id}_${intervention.id}`);
                                      } else {
                                        addAssetInterventionToPortfolio(selectedZone.zoneId, selectedAsset, intervention);
                                      }
                                    }}
                                  >
                                    {isSelected ? (
                                      <>
                                        <Check className="h-4 w-4 mr-1" />
                                        Selected
                                      </>
                                    ) : (
                                      <>
                                        <Plus className="h-4 w-4 mr-1" />
                                        Select
                                      </>
                                    )}
                                  </Button>
                                </div>
                              </CardHeader>
                              <CardContent className="p-4 pt-2 space-y-3">
                                <div className="flex flex-wrap gap-2">
                                  <div className="flex items-center gap-1 text-sm">
                                    <DollarSign className="h-4 w-4 text-muted-foreground" />
                                    <span>{intervention.costRange.min.toLocaleString()}-{intervention.costRange.max.toLocaleString()} {intervention.costRange.unit}</span>
                                  </div>
                                  <div className="flex items-center gap-1 text-sm">
                                    <Clock className="h-4 w-4 text-muted-foreground" />
                                    <span>{intervention.timeToImplement.min}-{intervention.timeToImplement.max} {intervention.timeToImplement.unit}</span>
                                  </div>
                                </div>

                                <div className="flex flex-wrap gap-1">
                                  <Badge className={getImpactBadgeColor(intervention.impacts.flood)}>
                                    Flood: {intervention.impacts.flood}
                                  </Badge>
                                  <Badge className={getImpactBadgeColor(intervention.impacts.heat)}>
                                    Heat: {intervention.impacts.heat}
                                  </Badge>
                                  <Badge className={getImpactBadgeColor(intervention.impacts.landslide)}>
                                    Landslide: {intervention.impacts.landslide}
                                  </Badge>
                                </div>

                                <Accordion type="single" collapsible className="w-full">
                                  <AccordionItem value="details" className="border-none">
                                    <AccordionTrigger className="py-2 text-sm">
                                      More details
                                    </AccordionTrigger>
                                    <AccordionContent className="text-sm space-y-2">
                                      <div>
                                        <span className="font-medium">Scale:</span> {intervention.typicalScale.min}-{intervention.typicalScale.max} {intervention.typicalScale.unit}
                                      </div>
                                      <div>
                                        <span className="font-medium">Implementation:</span> {intervention.implementationNotes}
                                      </div>
                                      <div>
                                        <span className="font-medium">Maintenance:</span> {intervention.maintenanceRequirements}
                                      </div>
                                      <div>
                                        <span className="font-medium">Co-benefits:</span> {intervention.cobenefits.join(', ')}
                                      </div>
                                    </AccordionContent>
                                  </AccordionItem>
                                </Accordion>
                              </CardContent>
                            </Card>
                          );
                        })}
                      </div>
                    </>
                  )}
                </div>
              </div>

              {(zonePortfolios[selectedZone.zoneId]?.length || 0) > 0 && (
                <div className="p-4 border-t bg-muted/30 flex-shrink-0" style={{ pointerEvents: 'auto' }}>
                  <Button 
                    className={`w-full relative z-10 transition-all ${saveSuccess === selectedZone.zoneId ? 'bg-green-600 hover:bg-green-600' : ''}`}
                    onClick={savePortfolioToContext} 
                    style={{ pointerEvents: 'auto' }}
                  >
                    {saveSuccess === selectedZone.zoneId ? (
                      <>
                        <CheckCircle className="h-4 w-4 mr-2" />
                        {t('siteExplorer.saved')}
                      </>
                    ) : (
                      <>
                        <Check className="h-4 w-4 mr-2" />
                        {t('siteExplorer.saveInterventions')} ({zonePortfolios[selectedZone.zoneId]?.length || 0})
                      </>
                    )}
                  </Button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      <Dialog open={showAddAssetDialog} onOpenChange={setShowAddAssetDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Add Custom Asset</DialogTitle>
            <DialogDescription>
              Search for a location by name or manually enter coordinates.
            </DialogDescription>
          </DialogHeader>
          
          <div className="flex gap-2 mb-4">
            <Button
              variant={addAssetTab === 'search' ? 'default' : 'outline'}
              size="sm"
              className="flex-1"
              onClick={() => setAddAssetTab('search')}
            >
              <Search className="h-4 w-4 mr-2" />
              Search OSM
            </Button>
            <Button
              variant={addAssetTab === 'manual' ? 'default' : 'outline'}
              size="sm"
              className="flex-1"
              onClick={() => setAddAssetTab('manual')}
            >
              <MapPin className="h-4 w-4 mr-2" />
              Manual Entry
            </Button>
          </div>
          
          {addAssetTab === 'search' ? (
            <div className="space-y-4">
              <div className="flex gap-2">
                <Input
                  placeholder="Search for a place (e.g., 'Central Park')"
                  value={osmSearchQuery}
                  onChange={(e) => setOsmSearchQuery(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && searchOsmByName()}
                />
                <Button onClick={searchOsmByName} disabled={isSearchingOsm}>
                  {isSearchingOsm ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                </Button>
              </div>
              
              {osmSearchResults.length > 0 && (
                <div className="max-h-60 overflow-y-auto space-y-2">
                  {osmSearchResults.map((result: any) => (
                    <button
                      key={result.id}
                      className="w-full p-3 text-left rounded-lg border hover:border-primary hover:bg-primary/5 transition-colors"
                      onClick={() => selectSearchResult(result)}
                    >
                      <div className="font-medium">{result.name || result.assetType}</div>
                      <div className="text-xs text-muted-foreground">
                        {result.area ? `${(result.area / 10000).toFixed(2)} ha` : result.length ? `${result.length.toFixed(0)}m` : 'Point'}
                      </div>
                    </button>
                  ))}
                </div>
              )}
              
              {isSearchingOsm && (
                <div className="flex items-center justify-center py-4">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              <div>
                <Label htmlFor="assetName">Site Name</Label>
                <Input
                  id="assetName"
                  placeholder="Enter a name for this site"
                  value={manualAssetName}
                  onChange={(e) => setManualAssetName(e.target.value)}
                />
              </div>
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <Label htmlFor="coords">Coordinates</Label>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button type="button" className="text-muted-foreground hover:text-foreground">
                        <Info className="h-4 w-4" />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent className="max-w-xs">
                      <p className="text-sm">
                        <strong>How to get coordinates from Google Maps:</strong><br />
                        1. Open Google Maps and find your location<br />
                        2. Right-click on the exact spot<br />
                        3. Click the coordinates shown at the top (they'll be copied)<br />
                        4. Paste here directly<br /><br />
                        <span className="text-muted-foreground">Format: latitude, longitude (e.g., -30.024, -51.220)</span>
                      </p>
                    </TooltipContent>
                  </Tooltip>
                </div>
                <Input
                  id="coords"
                  placeholder="-30.024, -51.220"
                  value={manualAssetCoords}
                  onChange={(e) => setManualAssetCoords(e.target.value)}
                />
              </div>
              <div>
                <Label htmlFor="assetType">Site Type</Label>
                <Select value={manualAssetType} onValueChange={setManualAssetType}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select a site type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="park">Park / Green Space</SelectItem>
                    <SelectItem value="plaza">Plaza / Public Square</SelectItem>
                    <SelectItem value="street">Street / Road</SelectItem>
                    <SelectItem value="building">Building / Structure</SelectItem>
                    <SelectItem value="waterway">Waterway / Canal</SelectItem>
                    <SelectItem value="slope">Slope / Hillside</SelectItem>
                    <SelectItem value="wetland">Wetland / Retention Area</SelectItem>
                    <SelectItem value="rooftop">Rooftop</SelectItem>
                    <SelectItem value="parking">Parking Lot</SelectItem>
                    <SelectItem value="vacant">Vacant Land</SelectItem>
                    <SelectItem value="other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="area">Approximate Area (hectares, optional)</Label>
                <Input
                  id="area"
                  type="number"
                  step="0.01"
                  placeholder="1.0"
                  value={manualAssetArea}
                  onChange={(e) => setManualAssetArea(e.target.value)}
                />
              </div>
              <Button
                className="w-full"
                onClick={createManualAsset}
                disabled={!manualAssetName.trim() || !manualAssetCoords.trim()}
              >
                <Plus className="h-4 w-4 mr-2" />
                Add Site
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

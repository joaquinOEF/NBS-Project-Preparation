import { useState, useEffect, useRef, useCallback } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

// ⚠️ MAP-CLICK-EATEN-BY-DRIFT (JVP, 2026-08-03: "I can't actually select any
// neighborhood, so no way to select").
//
// Leaflet's Draggable flags a gesture as a map DRAG as soon as the pointer
// moves `clickTolerance` (default 3) in Manhattan distance between down and up,
// and `Map._handleDOMEvent` then swallows the `click` that follows — so the
// bairro under the cursor never fires its handler. Three pixels is nothing: a
// trackpad click drifts 1–4px routinely and a thumb tap on a phone always does.
// The result is a map that pans fine and selects nothing, intermittently, which
// is exactly how it was reported.
//
// Every e2e click we had used `page.mouse.click()` — pixel-perfect, zero drift —
// so the whole suite passed while the real thing was broken. See
// cougar-e2-bairro-selectable.spec.ts, which now clicks WITH drift.
//
// Leaflet's Map.Drag constructs its Draggable with no options, so the prototype
// default is the only lever. 12px keeps panning responsive (a real pan clears
// it in the first frame) while making an ordinary tap or click reliable.
// (`options` is real at runtime; @types/leaflet just doesn't declare it on the
// Draggable prototype.)
(L.Draggable.prototype as any).options.clickTolerance = 12;
import { useTranslation } from 'react-i18next';
import { Button } from '@/core/components/ui/button';
import { Badge } from '@/core/components/ui/badge';
import {
  Check,
  X,
  MapPin,
  Pencil,
  Loader2,
  Trash2,
  Eye,
  EyeOff,
  ChevronRight,
  Search,
  Plus,
  Crosshair,
} from 'lucide-react';
import { Input } from '@/core/components/ui/input';
import {
  TILE_LAYERS,
  ALL_TILE_LAYERS,
  tileVisualUrl,
  OSM_LAYERS,
  SPATIAL_QUERIES,
} from '@shared/geospatial-layers';
import {
  riskBand,
  hazardPercentile,
  TYPOLOGY_COLORS,
  zoneRiskOpacity,
  type HazardKey,
} from '@shared/risk-display';
import { normalizeZoneName } from '@shared/bairro-match';
import { RISK_BANDS } from '@shared/risk-display';
import type { LegendSpec } from '@shared/legend-types';
import { describeRamp } from '@shared/hazard-legend';
import { DataProvenanceDialog } from '@/core/components/maps/DataProvenanceDialog';
import HazardLegendSheet from '@/core/components/maps/HazardLegendSheet';
import type { ProvenanceKey } from '@shared/data-provenance';
import type {
  OpenMapParams,
  SelectedAsset,
  SampledPoint,
  MapSelectionResult,
} from '@shared/concept-note-schema';
import { sampleRasterAtPoint, geometryCentroid } from '@/lib/valueTileUtils';
import { buildSpatialQueryLayer } from '@/lib/spatialQueryBuilder';
import ValueTooltip from './ValueTooltip';

// Intervention type → fill color (matches ConceptNoteMap)
const INTERVENTION_COLORS: Record<string, string> = {
  sponge_network: '#1d4ed8',
  cooling_network: '#dc2626',
  slope_stabilization: '#d97706',
  multi_benefit: '#10b981',
};

const OSM_VISUALS: Record<string, { emoji: string; label: string }> = {
  osm_parks: { emoji: '🌳', label: 'Park' },
  osm_schools: { emoji: '🏫', label: 'School' },
  osm_hospitals: { emoji: '🏥', label: 'Hospital' },
  osm_wetlands: { emoji: '💧', label: 'Wetland' },
};

interface Props {
  params: OpenMapParams;
  onConfirm: (result: MapSelectionResult) => void;
  onCancel: () => void;
  /**
   * Hazard-tour position, owned by the parent. Without this the tour lives in
   * local useState and restarts at Enchente every time the map unmounts — which
   * cbo-profile does whenever the user visits another right-panel tab. Omit in
   * flows that don't run the tour (concept-note).
   */
  tourIdx?: number;
  onTourIdxChange?: (idx: number) => void;
  /**
   * Escalate a "how do I read this?" question into the chat, carrying the
   * hazard and its actual color ramp so the agent reasons from the real stops.
   */
  onAskMapHelp?: (family: HazardFamily, rampNote: string) => void;
}

// Composite mode has two steps: 1) pick zone, 2) pick assets within it
type CompositeStep = 'zone' | 'assets';

// Classify an evidence-layer id into its hazard family, for the simplified E2
// legend (flood / heat / landslide). Returns null for non-hazard layers.
type HazardFamily = 'flood' | 'heat' | 'landslide';
function hazardFamilyOf(id: string): HazardFamily | null {
  if (id.includes('flood')) return 'flood';
  if (id.includes('heat')) return 'heat';
  if (id.includes('landslide')) return 'landslide';
  return null;
}
const HAZARD_LEGEND: Record<
  HazardFamily,
  { color: string; labelKey: string; defaultLabel: string }
> = {
  flood: {
    color: TYPOLOGY_COLORS.FLOOD,
    labelKey: 'mapMicroapp.hazardFlood',
    defaultLabel: 'Flood',
  },
  heat: {
    color: TYPOLOGY_COLORS.HEAT,
    labelKey: 'mapMicroapp.hazardHeat',
    defaultLabel: 'Heat',
  },
  landslide: {
    color: TYPOLOGY_COLORS.LANDSLIDE,
    labelKey: 'mapMicroapp.hazardLandslide',
    defaultLabel: 'Landslide',
  },
};

// E2 guided hazard tour: the order to walk through, and the per-hazard caption
// shown while that single layer is visible. Defaults are Portuguese (the CBO
// cohort is pt-forced); en keys live in the locale files.
const HAZARD_ORDER: HazardFamily[] = ['flood', 'heat', 'landslide'];
// Captions describe the HAZARD, not a color — the real color scale is shown by
// the legend bar (built from the layer's actual legend spec) so it always
// matches the map.
const TOUR_COPY: Record<
  HazardFamily,
  {
    emoji: string;
    titleKey: string;
    title: string;
    bodyKey: string;
    body: string;
  }
> = {
  flood: {
    emoji: '🌊',
    titleKey: 'mapMicroapp.tourFloodTitle',
    title: 'Enchente',
    bodyKey: 'mapMicroapp.tourFloodBody',
    body: 'Onde a água tende a se acumular quando chove forte.',
  },
  heat: {
    emoji: '🔥',
    titleKey: 'mapMicroapp.tourHeatTitle',
    title: 'Calor',
    bodyKey: 'mapMicroapp.tourHeatBody',
    body: 'Onde a temperatura sobe mais — o efeito ilha de calor.',
  },
  landslide: {
    emoji: '⛰️',
    titleKey: 'mapMicroapp.tourLandslideTitle',
    title: 'Deslizamento',
    bodyKey: 'mapMicroapp.tourLandslideBody',
    body: 'As encostas com risco de deslizar.',
  },
};

// Build a CSS gradient from a layer's legend stops (same source as the map's
// real legends), so the tour shows the actual color→risk scale.
function legendGradientCss(spec: LegendSpec | undefined): string | null {
  if (!spec || spec.kind !== 'gradient' || !spec.stops?.length) return null;
  const min = spec.min ?? spec.stops[0].value;
  const max = spec.max ?? spec.stops[spec.stops.length - 1].value;
  const span = max - min || 1;
  return `linear-gradient(to right, ${spec.stops
    .map(s => `${s.color} ${(((s.value - min) / span) * 100).toFixed(1)}%`)
    .join(', ')})`;
}

export default function MapMicroapp({
  params,
  onConfirm,
  onCancel,
  tourIdx: tourIdxProp,
  onTourIdxChange,
  onAskMapHelp,
}: Props) {
  const { t, i18n } = useTranslation();
  const provLang: 'en' | 'pt' = i18n.language?.startsWith('pt') ? 'pt' : 'en';
  const mapRef = useRef<L.Map | null>(null);
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const tileLayerRefs = useRef<Record<string, L.TileLayer>>({});
  const osmLayerRefs = useRef<Record<string, L.GeoJSON>>({});
  const zonesLayerRef = useRef<L.GeoJSON | null>(null);
  const zoneDefaultStyleRef = useRef<((p: any) => any) | null>(null);
  // Site-step boundary of the chosen bairro(s) — the interactive zones layer
  // is removed on advanceToAssets, so this inert outline is what orients the
  // user while they drop points on satellite imagery.
  const focusOutlineRef = useRef<L.GeoJSON | null>(null);
  const politicalBaseRef = useRef<L.TileLayer | null>(null);
  const satelliteBaseRef = useRef<L.TileLayer | null>(null);
  const customMarkersRef = useRef<L.Layer[]>([]);
  const selectedHighlightsRef = useRef<Map<string, L.Layer>>(new Map());

  const [mapReady, setMapReady] = useState(false);
  const [zonesLoaded, setZonesLoaded] = useState(false);
  const [selectedAssets, setSelectedAssets] = useState<SelectedAsset[]>([]);
  // Live mirror of selectedAssets for once-bound Leaflet handlers (avoids the
  // stale-closure that wiped a zone's highlight on mouseout — see MAP-SEL-STALE).
  const selectedAssetsRef = useRef<SelectedAsset[]>([]);
  selectedAssetsRef.current = selectedAssets;
  // Blue "selected zone" style, shared by click-select and the mouseout restore.
  const SELECTED_ZONE_STYLE = {
    color: '#1d4ed8',
    weight: 3,
    fillColor: '#3b82f6',
    fillOpacity: 0.25,
  };
  const [sampledPoints, setSampledPoints] = useState<SampledPoint[]>([]);
  const [drawMode, setDrawMode] = useState<'off' | 'point' | 'polygon'>('off');
  const drawModeRef = useRef(drawMode);
  drawModeRef.current = drawMode;
  // Basemap: light political map (default) ↔ satellite. The CBO site step opens
  // on satellite so people recognize their actual place; everything else stays
  // political. Gated to the CBO step (allowDeferSite) so the city flow is unchanged.
  const [basemap, setBasemap] = useState<'political' | 'satellite'>(
    'political'
  );
  const [loading, setLoading] = useState(true);
  const [loadingStatus, setLoadingStatus] = useState('');
  const [enabledTiles, setEnabledTiles] = useState<Set<string>>(new Set());
  // Composite stepper: step 1 = pick zone, step 2 = pick assets
  const [compositeStep, setCompositeStep] = useState<CompositeStep>('zone');
  const [selectedZone, setSelectedZone] = useState<SelectedAsset | null>(null);

  // "Add your own site" panel (E2 gap): the CBO can add an intervention site the
  // OSM suggestions miss — by name (Nominatim search, biased to the chosen
  // neighborhood) or by pasting a coordinate. Mirrors site-explorer's capability
  // for the mobile CBO flow.
  const [addSiteOpen, setAddSiteOpen] = useState(false);
  const [siteQuery, setSiteQuery] = useState('');
  const [siteSearching, setSiteSearching] = useState(false);
  const [siteResults, setSiteResults] = useState<
    Array<{ name: string; centroid: [number, number] }>
  >([]);
  const [coordInput, setCoordInput] = useState('');
  const [coordError, setCoordError] = useState<false | 'format' | 'outside'>(
    false
  );

  const selectionMode = params.selectionMode;
  const isComposite = selectionMode === 'composite';
  const isBrowseOnly = selectionMode === 'browse-only';

  // Simple site mode (E2 linear flow, focusZone sessions): the map does ONE
  // thing — find the place. A chooser overlay offers "buscar pelo nome" or
  // "marcar no mapa"; everything else (mode picker, stepper, lat/lng input,
  // area drawing, selection trash) is hidden. One pin at a time: a new tap
  // replaces the previous one.
  const simpleSite = !!params.focusZone && isComposite;
  const [simpleChoice, setSimpleChoice] = useState<'none' | 'search' | 'map'>(
    'none'
  );
  // Known places INSIDE the bairro (parks/schools/wetlands from the OSM
  // snapshots, clipped to the zone polygon) offered as one-tap picks in the
  // chooser — most orgs' sites are a known praça or escola, so this beats both
  // search and pin for the common case. null = not fetched yet.
  const [bairroPlaces, setBairroPlaces] = useState<Array<{
    name: string;
    lat: number;
    lng: number;
    emoji: string;
  }> | null>(null);

  // E2 guided hazard tour. tourLayers = the hazard tiles present, in flood→heat
  // →landslide order. tourIdx: 0..n-1 = touring that hazard (only it visible);
  // n = done (all visible, selection unlocked); -1 = tour off.
  const tourLayers = HAZARD_ORDER.map(fam =>
    (params.tileLayers || []).find(id => hazardFamilyOf(id) === fam)
  ).filter(Boolean) as string[];
  // Position is the parent's when it offers one (cbo-profile, so a trip to the
  // Perfil tab doesn't restart the tour); otherwise local.
  const [localTourIdx, setLocalTourIdx] = useState(
    params.hazardTour && tourLayers.length > 0 ? 0 : -1
  );
  const controlledTour = onTourIdxChange != null && tourIdxProp != null;
  const tourIdx =
    params.hazardTour && tourLayers.length > 0
      ? controlledTour
        ? tourIdxProp
        : localTourIdx
      : -1;
  const setTourIdx = useCallback(
    (next: number) => {
      if (controlledTour) onTourIdxChange(next);
      else setLocalTourIdx(next);
    },
    [controlledTour, onTourIdxChange]
  );
  const tourActive = tourIdx >= 0 && tourIdx < tourLayers.length;

  // "Como ler este mapa" sheet, scoped to the hazard currently on screen.
  const [helpOpen, setHelpOpen] = useState(false);

  // During the tour, suppress zone/asset selection — it's hazard education only.
  const showZones = !tourActive && (!isComposite || compositeStep === 'zone');
  const showAssets =
    !tourActive && (!isComposite || compositeStep === 'assets');
  const polygonHelp =
    drawMode === 'polygon' ? t('mapMicroapp.polygonHelp') : '';
  const tourFamily = tourActive ? hazardFamilyOf(tourLayers[tourIdx]) : null;
  const advanceTour = useCallback(() => {
    setHelpOpen(false);
    setTourIdx(tourIdx + 1);
  }, [setTourIdx, tourIdx]);

  // Real per-layer legend specs (same source as the map's legends) so the tour
  // shows the ACTUAL color scale, not a hand-written color word.
  const [legends, setLegends] = useState<Record<string, LegendSpec>>({});
  useEffect(() => {
    fetch('/sample-data/layer-legends.json')
      .then(r => (r.ok ? r.json() : {}))
      .then(setLegends)
      .catch(() => {});
  }, []);

  // E2: auto-enable requested tile layers on mount so the user immediately sees
  // the hazard colors (browse-only exploration, and any flow asking for the
  // simplified hazard legend). They can still toggle them off.
  useEffect(() => {
    if (params.hazardTour) return; // the tour effect below owns tile visibility
    if (!isBrowseOnly && !params.showLegendSimple) return;
    if (!params.tileLayers || params.tileLayers.length === 0) return;
    setEnabledTiles(new Set(params.tileLayers));
  }, [
    isBrowseOnly,
    params.showLegendSimple,
    params.tileLayers,
    params.hazardTour,
  ]);

  // Hazard tour: while touring, show ONLY the active hazard. Once done we hide
  // the rasters entirely — the bairro choropleth carries the risk colour at the
  // selection step, and leaving three rasters under it made both unreadable.
  // (The comment here used to claim all three stay on; verified against the
  // tiles on 2026-07-31 — they do not.)
  useEffect(() => {
    if (!params.hazardTour || tourLayers.length === 0) return;
    if (tourIdx >= 0 && tourIdx < tourLayers.length) {
      setEnabledTiles(new Set([tourLayers[tourIdx]]));
    } else if (tourIdx >= tourLayers.length) {
      // Tour done → hide the rasters so the neighborhood choropleth (colored by
      // risk, like the orchestrator) reads cleanly for selection.
      setEnabledTiles(new Set());
    }
    // tourLayers is derived from the stable params.tileLayers for this open.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tourIdx, params.hazardTour]);

  const enabledTileLayerDefs = Array.from(enabledTiles)
    .map(id => ALL_TILE_LAYERS.find(l => l.id === id))
    .filter(Boolean) as typeof TILE_LAYERS;

  // ── One color encoding per step (CBO E2) ────────────────────────────────────
  // The zones choropleth used to render fully colored from map-ready onward, so
  // the hazard tour stacked TWO encodings (raster + typology fills) and the site
  // step kept 90+ colored polygons under the point-drop tools. Contract:
  //   tour  → hazard raster only; bairros as thin inert outlines (orientation)
  //   zone  → choropleth only (rasters are already off post-tour), interactive
  //   site  → selected bairro as a bold blue OUTLINE (no fill — satellite must
  //           show through to find the spot); every other bairro hidden & inert.
  // Scoped to the CBO flow (allowDeferSite) — city/orchestrator flows keep the
  // always-on choropleth. pointerEvents doubles as the interactivity gate: inert
  // zones also stop stealing taps from point-dropping on the site step.
  const zoneDisplayMode: 'outline' | 'focus' | 'choropleth' =
    params.allowDeferSite && tourActive
      ? 'outline'
      : params.allowDeferSite && isComposite && compositeStep === 'assets'
        ? 'focus'
        : 'choropleth';
  const zoneDisplayModeRef = useRef(zoneDisplayMode);
  zoneDisplayModeRef.current = zoneDisplayMode;
  useEffect(() => {
    const zl = zonesLayerRef.current;
    const styleOf = zoneDefaultStyleRef.current;
    if (!zl || !styleOf) return;
    zl.eachLayer((layer: any) => {
      const props = layer.feature?.properties || {};
      const name =
        props.neighbourhoodName || props.neighbourhood_name || props.zoneId;
      const isSelected = selectedAssetsRef.current.some(
        a => a.type === 'zone' && a.name === name
      );
      const el = layer.getElement?.();
      if (zoneDisplayMode === 'outline') {
        layer.setStyle({
          color: '#1e293b',
          weight: 1.2,
          opacity: 0.85,
          fillOpacity: 0,
          dashArray: undefined,
        });
        layer.closeTooltip?.();
        if (el) el.style.pointerEvents = 'none';
      } else if (zoneDisplayMode === 'focus') {
        if (isSelected)
          layer.setStyle({
            color: '#1d4ed8',
            weight: 3,
            opacity: 1,
            fillOpacity: 0,
          });
        else layer.setStyle({ opacity: 0, fillOpacity: 0 });
        layer.closeTooltip?.();
        if (el) el.style.pointerEvents = 'none';
      } else {
        layer.setStyle(
          isSelected ? SELECTED_ZONE_STYLE : { ...styleOf(props), opacity: 1 }
        );
        if (el) el.style.pointerEvents = '';
      }
    });
    // The zones may finish loading after this effect ran (async fetch) — the
    // load path applies the choropleth default, so re-run once they land.
  }, [zoneDisplayMode, mapReady, zonesLoaded]);

  // Focus mode's boundary overlay. advanceToAssets removes the interactive
  // zones layer wholesale (the site step used to show NO boundary at all);
  // the chosen bairro's outline is re-drawn as a separate inert layer so the
  // user sees where their bairro ends without any fill over the satellite.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (focusOutlineRef.current) {
      map.removeLayer(focusOutlineRef.current);
      focusOutlineRef.current = null;
    }
    if (zoneDisplayMode !== 'focus') return;
    const zoneAssets = selectedAssetsRef.current.filter(
      a => a.type === 'zone' && a.geometry
    );
    if (zoneAssets.length === 0) return;
    const fc = {
      type: 'FeatureCollection',
      features: zoneAssets.map(a => ({
        type: 'Feature',
        geometry: a.geometry,
        properties: {},
      })),
    };
    const outline = L.geoJSON(fc as any, {
      style: { color: '#1d4ed8', weight: 3, opacity: 1, fillOpacity: 0 },
      interactive: false,
    });
    outline.addTo(map);
    focusOutlineRef.current = outline;
  }, [zoneDisplayMode, mapReady]);

  // ── Init map ────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;
    const map = L.map(mapContainerRef.current, {
      zoomControl: false,
      attributionControl: false,
      center: [-30.03, -51.22],
      zoom: 11,
      maxZoom: 19,
      // ⚠️ MAP-CITY-AT-HALF-SIZE (JVP, 2026-08-04, while reporting the click
      // bug: the bairros were unmissably tiny in his screenshots).
      //
      // Leaflet snaps fitBounds to WHOLE zoom levels by default, and Porto
      // Alegre is a near-miss: the municipality needs ~568px of height at zoom
      // 11 and the CBO panel offers ~564. Four pixels short, so the fit drops a
      // full level — and a level is 2×. Measured at his window: the city filled
      // 212×284 of a 590×596 map (36% of the width), median bairro 15px across,
      // smallest tenth 8px. Apple's minimum touch target is 44px.
      //
      // zoomSnap:0 lets fitBounds pick 10.99 instead of falling to 10. Scoped to
      // the CBO flow (allowDeferSite) — the city/concept-note maps are not in a
      // half-width panel and were never asked to frame a whole municipality.
      ...(params.allowDeferSite ? { zoomSnap: 0 } : {}),
    });
    // Two base layers; the swap effect below shows one. Esri World Imagery is
    // free (no key) and zooms to ~19 for site-level detail.
    politicalBaseRef.current = L.tileLayer(
      'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',
      { maxZoom: 19 }
    );
    satelliteBaseRef.current = L.tileLayer(
      'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
      { maxZoom: 19, attribution: 'Tiles © Esri' }
    );
    politicalBaseRef.current.addTo(map);
    L.control.zoom({ position: 'bottomright' }).addTo(map);
    mapRef.current = map;
    setMapReady(true);
    return () => {
      // Neutralise a zoom animation still in flight, or unmounting throws.
      //
      // Leaflet 1.9.4 `_animateZoom` schedules `setTimeout(_onZoomTransitionEnd,
      // 250)` as a workaround for WebKit not firing `transitionend`, and
      // `remove()` never cancels that timer. The handler bails only when
      // `_animatingZoom` is falsy — which `remove()` also doesn't clear. So
      // closing this panel mid-zoom (confirming a site does exactly that) lets
      // the orphan timer fire against a detached `_mapPane`, and
      // `getPosition()` reads `_leaflet_pos` off undefined. It throws from a
      // timer, so no try/catch at the call site can see it; in dev it raises a
      // runtime-error overlay that then swallows every click on the page.
      //
      // Clearing the flag makes the orphan timer a no-op, which is precisely
      // the early-return Leaflet already intends. Note `map.stop()` is NOT a
      // substitute: it calls setZoom() and can start a fresh animation.
      // The WebKit detail matters here — iOS Safari is what the CBOs use.
      try { (map as any)._animatingZoom = false; } catch {}
      try { map.remove(); } catch {}
      mapRef.current = null;
    };
  }, []);

  // Swap the active base layer; bringToBack so it never covers zones/markers.
  useEffect(() => {
    if (!mapReady || !mapRef.current) return;
    const map = mapRef.current;
    const pol = politicalBaseRef.current,
      sat = satelliteBaseRef.current;
    if (!pol || !sat) return;
    const [show, hide] = basemap === 'satellite' ? [sat, pol] : [pol, sat];
    if (!map.hasLayer(show)) show.addTo(map);
    if (map.hasLayer(hide)) map.removeLayer(hide);
    show.bringToBack();
  }, [basemap, mapReady]);

  // Every CBO step opens on the political basemap. The site step used to force
  // satellite, on the theory that imagery helps you recognise your own yard —
  // but you have to FIND the yard first, and satellite carries no street names,
  // no bus stops, no praça labels (JVP, 2026-08-03: "hard to choose a location
  // here"). Orientation comes from streets; recognition comes from imagery, and
  // orientation comes first. Satellite stays one tap away on the toggle, which
  // is where it earns its keep — checking you pinned the right side of the
  // street once you know which street it is.
  //
  // Fires on step change only, so a manual toggle within a step isn't overridden.
  useEffect(() => {
    if (!params.allowDeferSite) return;
    setBasemap('political');
  }, [compositeStep, params.allowDeferSite]);

  // CBO site step: draw mode starts OFF — the user arms "Um ponto" / "Desenhar
  // a área" explicitly. Auto-arming 'point' here meant the first thing every
  // phone user did (pan the satellite map to find their building) dropped a
  // wrong pin instead, which then flipped the confirm button (P0 mobile bug).

  // ── Load boundary ───────────────────────────────────────────────────────────
  useEffect(() => {
    if (!mapReady || !mapRef.current) return;
    (async () => {
      try {
        const res = await fetch('/sample-data/porto-alegre-boundary.json');
        const data = await res.json();
        if (data.boundaryGeoJson) {
          const bl = L.geoJSON(data.boundaryGeoJson, {
            style: {
              color: '#94a3b8',
              weight: 2,
              fillOpacity: 0.02,
              dashArray: '6 3',
            },
            // ⚠️ MAP-BOUNDARY-EATS-CLICKS (JVP, 2026-08-04: "I cant click here on
            // neighborhood… cant select"). Leaflet paths are interactive by
            // DEFAULT, and this one is a filled polygon covering the entire
            // municipality — so it is a city-sized click target sitting in the
            // same SVG pane as the 94 bairros. Whichever of the two async fetches
            // resolves LAST paints on top: locally the 2.5MB zones file lands
            // after this one and the bairros win, so the bug is invisible here;
            // with a warm cache (JVP's browser) this lands last and swallows
            // every tap. His console proved it — `elementsFromPoint` at the tap
            // returned `path.leaflet-interactive > path.leaflet-interactive`,
            // this outline on top of the bairro it hid.
            //
            // It is decoration. It must never take a click, and then the race
            // stops mattering rather than being one we have to win.
            interactive: false,
          }).addTo(mapRef.current!);
          // Keep the outline, but don't let it drive the view on the bairro
          // step: the municipal boundary runs far south past Lami, so fitting
          // to it frames a lot of countryside and shrinks the bairros — the one
          // thing the user has to tap — into a clump in the middle. The
          // zones-bounds fit below owns the view there. (Both are async, so
          // this raced rather than lost outright, which is worse: the framing
          // depended on which fetch returned first.)
          if (!params.confirmAtZone) {
            mapRef.current!.fitBounds(bl.getBounds(), { padding: [20, 20] });
          }
        }
      } catch {}
    })();
  }, [mapReady]);

  // ── Load zone/neighborhood boundaries (step 1 of composite) ─────────────────
  // Default: neighborhood-based zones (IBGE bairros with risk scores + vulnerability)
  // Legacy: 'intervention_zones' for old synthetic zones, 'neighborhoods' for raw IBGE
  const zoneSource = params.zoneSource || 'neighborhood_zones';
  const isNeighborhoods =
    zoneSource === 'neighborhoods' || zoneSource === 'neighborhood_zones';

  useEffect(() => {
    if (!mapReady || !mapRef.current) return;
    if (selectionMode !== 'zones' && selectionMode !== 'composite') return;
    const map = mapRef.current;

    setLoadingStatus(
      t('mapMicroapp.loadingNeighborhoods', {
        defaultValue: 'Loading neighborhoods...',
      })
    );
    (async () => {
      try {
        const url =
          zoneSource === 'neighborhoods'
            ? '/sample-data/porto-alegre-ibge-indicators.json'
            : zoneSource === 'intervention_zones'
              ? '/sample-data/porto-alegre-zones.json'
              : '/sample-data/porto-alegre-neighborhood-zones.json';
        const res = await fetch(url);
        const data = await res.json();
        const geojson = zoneSource === 'neighborhoods' ? data : data.geoJson;
        if (!geojson?.features) {
          setLoading(false);
          return;
        }

        // Compute priority range for opacity normalization
        const allPriorities = geojson.features.map(
          (f: any) => f.properties?.priorityScore ?? 0
        );
        const maxPriority = Math.max(...allPriorities, 0.01);
        const minPriority = Math.min(...allPriorities);
        const priorityRange = maxPriority - minPriority || 0.01;
        // CBO E2: risk range (max hazard per zone) for the orchestrator-style fill.
        const zoneRisk = (p: any) =>
          Math.max(p?.meanFlood || 0, p?.meanHeat || 0, p?.meanLandslide || 0);
        const allRisk = geojson.features.map((f: any) =>
          zoneRisk(f.properties)
        );
        const riskMin = Math.min(...allRisk, 0);
        const riskSpan = Math.max(...allRisk, 0.01) - riskMin || 0.01;

        // Within-city percentile rank of priorityScore. Computed once over the
        // whole city here, because a percentile is meaningless per-feature.
        const prioritySorted = [...allPriorities].sort((a, b) => a - b);
        const priorityPercentile = (p: any): number => {
          const v = p?.priorityScore ?? 0;
          if (prioritySorted.length < 2) return 0;
          let below = 0;
          for (const x of prioritySorted) if (x < v) below++;
          return Math.round((below / (prioritySorted.length - 1)) * 100);
        };

        const getDefaultStyle = (p: any) => {
          // E2 Map 1: ONE sequential ramp, by the bairro's worst within-city
          // hazard percentile.
          //
          // Two encodings were the original problem — the typology choropleth
          // below used hue for WHICH hazard and opacity for HOW MUCH, and named
          // neither in a legend anyone could follow. One channel, one legend.
          //
          // The percentile is what makes this worth drawing at all: on the
          // absolute means it was arithmetically impossible for a POA bairro to
          // read above the lowest band (see CBO-RISK-SCALE), so the map could
          // only ever have been flat. `hazardPercentile` ranks within the city,
          // so the ramp actually separates it.
          //
          // Colours come from risk-display.RISK_BANDS — the same five the site
          // card and the coordinator use, so one vocabulary spans the product.
          if (params.zoneRiskRamp) {
            // The percentile RANK of this bairro's priority score among all of
            // them — not the max of the three hazard percentiles.
            //
            // Max-of-three was the obvious move and it is wrong: every bairro is
            // the worst at SOMETHING, so the max skews hard high (E[max of 3
            // uniforms] ≈ 0.75). Measured on the 94 POA zones it put 56 in the
            // top band and 84 in the top two — the same "everything is one
            // colour" failure as the typology choropleth, in a new costume.
            //
            // Ranking priorityScore is a near-identity now (see below): 20/18/19/18/19
            // across the five bands. It is also the ordering the coordinator's
            // priority list already uses, so the two views agree on which
            // bairros are worst.
            const worst = priorityPercentile(p);
            return {
              color: '#334155',
              weight: 0.9,
              fillColor: riskBand(worst).color,
              // Floor the alpha: the lowest band is near-white, and a bairro you
              // cannot see is a bairro you cannot tap.
              fillOpacity: 0.3 + (worst / 100) * 0.4,
              dashArray: undefined as string | undefined,
            };
          }
          // CBO E2 colors neighborhoods exactly like the orchestrator — HUE =
          // which risk (typology), OPACITY = how risky — so first-time users see
          // the same map the coordinator does. The city/concept-note flow keeps
          // the intervention-type coloring.
          if (params.allowDeferSite) {
            const norm = (zoneRisk(p) - riskMin) / riskSpan;
            return {
              // Dark border (the CBO zone step is on the LIGHT basemap — a white
              // border like the orchestrator's dark-map view would be invisible).
              color: '#334155',
              weight: 0.8 + Math.max(0, Math.min(1, norm)) * 1.4,
              fillColor:
                TYPOLOGY_COLORS[p?.typologyLabel] || TYPOLOGY_COLORS.LOW,
              fillOpacity: Math.max(0.35, zoneRiskOpacity(norm)),
              dashArray: undefined as string | undefined,
            };
          }
          const interventionColor =
            INTERVENTION_COLORS[p?.interventionType] || '#94a3b8';
          const normalizedPriority =
            ((p?.priorityScore ?? 0) - minPriority) / priorityRange;
          const fillOpacity =
            p?.priorityScore != null ? 0.05 + normalizedPriority * 0.65 : 0;
          return {
            color: '#1e293b',
            weight: 1.5,
            fillColor: interventionColor,
            fillOpacity,
            dashArray: undefined as string | undefined,
          };
        };

        zoneDefaultStyleRef.current = getDefaultStyle;
        const zonesLayer = L.geoJSON(geojson, {
          style: feature => getDefaultStyle(feature?.properties),
          onEachFeature: (feature, featureLayer) => {
            const p = feature.properties || {};

            // E2 Map 1: the name, and nothing else. The rich tooltip below is
            // written for the coordinator — H·E·V, priority score, poverty rate
            // — and on a CBO phone it opened a 130px opaque panel over the very
            // bairros the user is trying to tap, in vocabulary the flow has not
            // introduced. Here the only question is "which one is yours?".
            if (
              params.zoneRiskRamp &&
              (p.neighbourhoodName || p.neighbourhood_name)
            ) {
              // Name + the hazard driving the colour. The ramp says HOW MUCH;
              // without this the user can see a bairro is dark and still not
              // know of what, which is the question the tour just raised.
              const ranked = (['flood', 'heat', 'landslide'] as HazardKey[])
                .map(h => ({ h, pct: hazardPercentile(p, h) }))
                .sort((a, b) => b.pct - a.pct)[0];
              const hazardName = t(
                `mapMicroapp.hazard${ranked.h === 'flood' ? 'Flood' : ranked.h === 'heat' ? 'Heat' : 'Landslide'}`,
                { defaultValue: ranked.h },
              );
              const bandName = t(`riskBands.${riskBand(ranked.pct).key}`, {
                defaultValue: riskBand(ranked.pct).label,
              });
              featureLayer.bindTooltip(
                `<div style="font-size:12px"><strong>${p.neighbourhoodName || p.neighbourhood_name}</strong>` +
                  `<br/><span style="color:${riskBand(ranked.pct).color === '#e5e7eb' ? '#64748b' : riskBand(ranked.pct).color}">${hazardName}: ${bandName}</span></div>`,
                { direction: 'top' }
              );
            } else if (p.neighbourhoodName || p.neighbourhood_name) {
              // Rich tooltip with name, risks, poverty, priority
              const name = p.neighbourhoodName || p.neighbourhood_name;
              const pop =
                (p.populationTotal || p.population_total)?.toLocaleString() ||
                '?';
              const poverty =
                p.povertyRate != null
                  ? `${(p.povertyRate * 100).toFixed(1)}%`
                  : p.poverty_rate != null
                    ? `${(p.poverty_rate * 100).toFixed(1)}%`
                    : '?';
              const hc =
                p.primaryHazard === 'FLOOD'
                  ? '#3b82f6'
                  : p.primaryHazard === 'HEAT'
                    ? '#ef4444'
                    : p.primaryHazard === 'LANDSLIDE'
                      ? '#a16207'
                      : '#888';
              const hazardLine = p.primaryHazard
                ? `<span style="color:${hc}">${p.typologyLabel}</span> — ${(p.interventionType || '').replace(/_/g, ' ')}<br/>`
                : '';
              const priorityLine =
                p.priorityScore != null
                  ? `${t('mapMicroapp.tipPriority', { defaultValue: 'Priority' })}: <strong>${p.priorityScore.toFixed(2)}</strong><br/>`
                  : '';
              // Within-city percentile band per hazard (comparable across hazards;
              // see risk-display.ts). Labels + band names localized — PT users saw
              // raw "Flood: High" in the tooltip.
              const bandSpan = (hz: HazardKey, label: string) => {
                const pct = hazardPercentile(p, hz);
                const band = riskBand(pct);
                return `${label}: <strong style="color:${band.color}">${t(`riskBands.${band.key}`, { defaultValue: band.label })} (${pct})</strong>`;
              };
              const riskLine = [
                bandSpan(
                  'flood',
                  t('mapMicroapp.hazardFlood', { defaultValue: 'Flood' })
                ),
                bandSpan(
                  'heat',
                  t('mapMicroapp.hazardHeat', { defaultValue: 'Heat' })
                ),
                bandSpan(
                  'landslide',
                  t('mapMicroapp.hazardLandslide', {
                    defaultValue: 'Landslide',
                  })
                ),
              ].join(' · ');
              // Catalog flood H×E×V breakdown (hazard·exposure·vulnerability)
              const fhxv =
                p.meanFloodHazard != null
                  ? `<span style="color:#888">Flood H·E·V: ${(p.meanFloodHazard * 100).toFixed(0)}·${((p.meanFloodExposure ?? 0) * 100).toFixed(0)}·${((p.meanFloodVulnerability ?? 0) * 100).toFixed(0)}</span><br/>`
                  : '';
              featureLayer.bindTooltip(
                `<div style="font-size:11px"><strong>${name}</strong><br/>` +
                  hazardLine +
                  (riskLine ? riskLine + '<br/>' : '') +
                  fhxv +
                  priorityLine +
                  `${pop} hab. · ${(p.areaKm2 || p.area_km2)?.toFixed(1) || '?'} km²<br/>` +
                  `<span style="color:#888">${t('mapMicroapp.tipPoverty', { defaultValue: 'Poverty' })}: ${poverty}</span></div>`,
                { direction: 'top' }
              );
            } else if (zoneSource === 'intervention_zones') {
              const hc =
                p.primaryHazard === 'FLOOD'
                  ? '#3b82f6'
                  : p.primaryHazard === 'HEAT'
                    ? '#ef4444'
                    : '#a16207';
              featureLayer.bindTooltip(
                `<div style="font-size:11px"><strong>${p.zoneId}</strong><br/><span style="color:${hc}">${p.typologyLabel}</span> — ${(p.interventionType || '').replace(/_/g, ' ')}<br/>${p.areaKm2?.toFixed(1)} km² · ${p.populationSum?.toLocaleString() || '?'} ${t('mapMicroapp.tipPeople', { defaultValue: 'people' })}</div>`,
                { direction: 'top' }
              );
            }

            // Click to select
            const zoneName =
              p.neighbourhoodName || p.neighbourhood_name || p.zoneId;
            const zoneSourceId = zoneSource;
            const featureDefaultStyle = getDefaultStyle(p);

            (featureLayer as any).on('click', (e: any) => {
              if (zoneDisplayModeRef.current !== 'choropleth') return;
              if (drawModeRef.current !== 'off') return;
              L.DomEvent.stopPropagation(e);
              const centroid = geometryCentroid(feature.geometry);
              if (!centroid) return;

              const asset: SelectedAsset = {
                type: 'zone',
                source: zoneSourceId,
                name: zoneName,
                geometry: feature.geometry,
                coordinates: centroid,
                properties: p,
              };

              // Both composite and zones mode: toggle multi-select
              setSelectedAssets(prev => {
                const existing = prev.findIndex(
                  a => a.type === 'zone' && a.name === asset.name
                );
                if (existing >= 0) {
                  (featureLayer as any).setStyle(featureDefaultStyle);
                  // If deselecting in composite, clear selectedZone if it matches
                  if (isComposite && selectedZone?.name === asset.name)
                    setSelectedZone(null);
                  return prev.filter((_, i) => i !== existing);
                }
                (featureLayer as any).setStyle(SELECTED_ZONE_STYLE);
                // In composite, track the last selected zone for step 2 zoom
                if (isComposite) setSelectedZone(asset);
                return [...prev, asset];
              });
            });

            (featureLayer as any).on('mouseover', () => {
              if (zoneDisplayModeRef.current !== 'choropleth') return;
              (featureLayer as any).setStyle({
                weight: 3,
                fillOpacity: Math.max(
                  featureDefaultStyle.fillOpacity + 0.1,
                  0.15
                ),
              });
            });
            (featureLayer as any).on('mouseout', () => {
              if (zoneDisplayModeRef.current !== 'choropleth') return;
              // Read the live ref, not the stale closure — otherwise a just-selected
              // zone loses its highlight the instant the pointer leaves (worst on
              // touch, where tap fires mouseover→click→mouseout in a burst).
              const isSelected = selectedAssetsRef.current.some(
                a => a.type === 'zone' && a.name === zoneName
              );
              (featureLayer as any).setStyle(
                isSelected ? SELECTED_ZONE_STYLE : featureDefaultStyle
              );
              (featureLayer as any).closeTooltip();
            });
          },
        });
        zonesLayer.addTo(map);
        zonesLayerRef.current = zonesLayer;
        setZonesLoaded(true);
      } catch {}
      setLoading(false);
    })();
  }, [mapReady]);

  // ── Load OSM layers (deferred in composite mode until step 2) ───────────────
  const osmLoadedRef = useRef(false);

  useEffect(() => {
    if (!mapReady || !mapRef.current) return;
    if (osmLoadedRef.current) return;
    // In composite mode, only load OSM when we reach step 2
    if (isComposite && compositeStep !== 'assets') return;
    // In zones-only mode, don't load OSM at all
    if (selectionMode === 'zones') return;

    osmLoadedRef.current = true;
    const map = mapRef.current;

    (async () => {
      const addOsmLayer = (
        osmId: string,
        osmDef: (typeof OSM_LAYERS)[number],
        geojson: any
      ) => {
        const visual = OSM_VISUALS[osmId] || { emoji: '📍', label: 'Feature' };
        const layer = L.geoJSON(geojson, {
          style: {
            color: osmDef.color,
            weight: 2,
            fillColor: osmDef.color,
            fillOpacity: 0.25,
            opacity: 0.8,
          },
          pointToLayer: (_f, latlng) => {
            const icon = L.divIcon({
              html: `<div style="font-size:18px;text-align:center;line-height:1;filter:drop-shadow(0 1px 2px rgba(0,0,0,0.4));cursor:pointer">${visual.emoji}</div>`,
              className: '',
              iconSize: [28, 28],
              iconAnchor: [14, 14],
            });
            return L.marker(latlng, { icon });
          },
          onEachFeature: (feature, featureLayer) => {
            const p = feature.properties || {};
            const name =
              p.name || p.amenity || p.leisure || p.natural || visual.label;

            featureLayer.bindTooltip(
              `<div style="font-size:11px"><strong>${visual.emoji} ${name}</strong><br/><span style="color:#888">${visual.label} — ${t('mapMicroapp.clickToSelect', { defaultValue: 'click to select' })}</span></div>`,
              { direction: 'top' }
            );

            (featureLayer as any).on('click', async (e: any) => {
              if (drawModeRef.current !== 'off') return;
              L.DomEvent.stopPropagation(e);
              const centroid = geometryCentroid(feature.geometry);
              if (!centroid) return;

              const rasterValues: Record<string, number> = {};
              for (const tileId of Array.from(enabledTiles)) {
                const tileDef = ALL_TILE_LAYERS.find(l => l.id === tileId);
                if (!tileDef?.valueEncoding?.urlTemplate) continue;
                const val = await sampleRasterAtPoint(
                  centroid[0],
                  centroid[1],
                  tileDef.valueEncoding,
                  11
                );
                if (val !== null) rasterValues[tileDef.name] = val;
              }

              const asset: SelectedAsset = {
                type: 'osm',
                source: osmId,
                name: typeof name === 'string' ? name : String(name),
                geometry: feature.geometry,
                coordinates: centroid,
                properties: p,
                rasterValues,
              };

              setSelectedAssets(prev => {
                const key = `osm:${osmId}:${asset.name}:${centroid[0].toFixed(4)}`;
                const existing = prev.findIndex(
                  a =>
                    a.type === 'osm' &&
                    `osm:${a.source}:${a.name}:${a.coordinates[0].toFixed(4)}` ===
                      key
                );
                if (existing >= 0) {
                  selectedHighlightsRef.current.get(key)?.remove();
                  selectedHighlightsRef.current.delete(key);
                  return prev.filter((_, i) => i !== existing);
                }
                const highlight = L.circleMarker([centroid[0], centroid[1]], {
                  radius: 16,
                  color: '#fff',
                  fillColor: osmDef.color,
                  fillOpacity: 0.3,
                  weight: 3,
                }).addTo(map);
                selectedHighlightsRef.current.set(key, highlight);
                return [...prev, asset];
              });
            });

            (featureLayer as any).on('mouseover', () => {
              map.getContainer().style.cursor = 'pointer';
            });
            (featureLayer as any).on('mouseout', () => {
              map.getContainer().style.cursor = '';
              (featureLayer as any).closeTooltip();
            });
          },
        });
        layer.addTo(map);
        osmLayerRefs.current[osmId] = layer;
      };

      const osmIds = (params.layers || []).filter(id =>
        OSM_LAYERS.some(l => l.id === id)
      );
      if (osmIds.length) {
        setLoadingStatus(
          t('mapMicroapp.loadingPlaces', {
            defaultValue: 'Finding nearby places…',
          })
        );

        // Fetch in parallel. These requests are independent, and awaiting them
        // one at a time stacked a full Overpass round-trip per layer whenever a
        // snapshot was missing — four cold layers meant four sequential waits.
        const fetched = await Promise.all(
          osmIds.map(async osmId => {
            const osmDef = OSM_LAYERS.find(l => l.id === osmId)!;
            try {
              const res = await fetch(osmDef.endpoint);
              if (!res.ok) return null;
              return { osmId, osmDef, geojson: await res.json() };
            } catch {
              return null;
            }
          })
        );

        // Add in declaration order so layer z-ordering stays stable.
        for (const entry of fetched) {
          if (!entry) continue;
          try {
            addOsmLayer(entry.osmId, entry.osmDef, entry.geojson);
          } catch {}
        }
      }

      // Spatial queries
      for (const sqId of params.spatialQueries || []) {
        const queryDef = SPATIAL_QUERIES.find(q => q.id === sqId);
        if (!queryDef) continue;
        setLoadingStatus(
          t('mapMicroapp.loadingAnalysis', {
            defaultValue: 'Running analysis…',
          })
        );
        try {
          const result = await buildSpatialQueryLayer(queryDef);
          if (result) result.layer.addTo(map);
        } catch {}
      }

      setLoading(false);
    })();
  }, [mapReady, compositeStep]);

  // ── Composite step transition: zone → assets ────────────────────────────────
  const advanceToAssets = useCallback(() => {
    const zoneAssets = selectedAssets.filter(a => a.type === 'zone');
    if (zoneAssets.length === 0 || !mapRef.current) return;
    const map = mapRef.current;

    // Hide zones layer
    if (zonesLayerRef.current) map.removeLayer(zonesLayerRef.current);

    // Zoom to fit all selected zones
    try {
      const allBounds = L.latLngBounds([]);
      for (const asset of zoneAssets) {
        if (asset.geometry)
          allBounds.extend(L.geoJSON(asset.geometry).getBounds());
      }
      if (allBounds.isValid())
        map.fitBounds(allBounds, { padding: [40, 40], maxZoom: 14 });
    } catch {}

    setCompositeStep('assets');
    setLoading(true);
    setLoadingStatus(
      t('mapMicroapp.loadingSites', { defaultValue: 'Loading sites...' })
    );
  }, [selectedAssets]);

  const backToZones = useCallback(() => {
    if (!mapRef.current) return;
    const map = mapRef.current;

    // Remove OSM layers
    Object.values(osmLayerRefs.current).forEach(l => map.removeLayer(l));
    osmLayerRefs.current = {};
    osmLoadedRef.current = false;

    // Re-add zones
    if (zonesLayerRef.current) zonesLayerRef.current.addTo(map);

    // Zoom back out
    map.setView([-30.03, -51.22], 11);

    // Remove non-zone selections
    setSelectedAssets(prev => prev.filter(a => a.type === 'zone'));
    selectedHighlightsRef.current.forEach(hl => hl.remove());
    selectedHighlightsRef.current.clear();
    for (const m of customMarkersRef.current) map.removeLayer(m);
    customMarkersRef.current = [];

    // Reset any active draw mode — otherwise it stays 'point'/'polygon' after the
    // round-trip, which early-returns the zone click handler and keeps map dragging
    // disabled (MAP-DRAWMODE-STUCK: "can't click or pan a neighborhood").
    setDrawMode('off');
    setCompositeStep('zone');
    setSelectedZone(null);
    setLoading(false);
  }, []);

  // ── Fit the bairro step to the city ─────────────────────────────────────────
  // The map opens at a fixed centre/zoom 11, which frames the whole metro region
  // — Canoas, Viamão, Barra do Ribeiro, Lagoa Negra — and leaves Porto Alegre's
  // 94 bairros as a small clump in the middle. On a phone that is most of the
  // map budget spent on land the org will never pick. Fit to the bairros
  // themselves instead. Staggered refits for the same reason as fitToBairro: the
  // panel is still opening when this first runs, so a single fitBounds computes
  // its zoom against a stale container size.
  const cityFitAppliedRef = useRef(false);
  useEffect(() => {
    if (cityFitAppliedRef.current) return;
    if (!params.confirmAtZone) return;
    if (!zonesLoaded || !mapReady || !mapRef.current) return;
    const zl = zonesLayerRef.current;
    const map = mapRef.current;
    if (!zl) return;
    cityFitAppliedRef.current = true;
    const fit = () => {
      if (mapRef.current !== map) return; // unmounted mid-timer
      try {
        map.invalidateSize();
        const b = zl.getBounds();
        // Asymmetric on purpose: the top of this map is occupied by an overlay
        // the whole time — the hazard-tour caption during the tour, then the
        // risk-ramp legend at the zone step. A symmetric fit tucks the northern
        // bairros (Arquipélago, Sarandi, Anchieta) underneath it. They stay
        // clickable — the legend is pointer-events-none — but "clickable while
        // hidden behind a card" is not selectable in any sense a user cares
        // about.
        if (b.isValid()) map.fitBounds(b, { paddingTopLeft: [16, 76], paddingBottomRight: [16, 16] });
      } catch {}
    };
    fit();
    const timers = [setTimeout(fit, 350), setTimeout(fit, 1000)];
    return () => timers.forEach(clearTimeout);
  }, [zonesLoaded, mapReady, params.confirmAtZone]);

  // ── preselectZone (E2 Map 1): confirm, don't search ─────────────────────────
  // E1 already recorded org_profile.bairro_of_operation — prefilled at invite
  // time and confirmed out loud in E1's opening line — and E2 then handed the
  // org a 94-polygon city map and asked them to find themselves on it. The zone
  // is pre-selected here so the step is a confirmation. Unlike focusZone this
  // does NOT advance to the site step or remove the zones layer: tapping a
  // different bairro still works, and "Confirmar" names the bairro so a wrong
  // invite value is visible rather than silently accepted.
  //
  // The selection is applied ONCE (ref latch) but the OUTLINE is drawn even
  // while the hazard tour is running, which is the point: the org watches flood,
  // heat and landslide sweep the city with its own territory ringed on top.
  const preselectAppliedRef = useRef(false);
  useEffect(() => {
    if (preselectAppliedRef.current) return;
    if (!params.preselectZone || !isComposite) return;
    if (!zonesLoaded || !mapReady || !mapRef.current) return;
    const zl = zonesLayerRef.current;
    if (!zl) return;
    const want = normalizeZoneName(params.preselectZone);
    if (!want) return;
    let matched: any = null;
    zl.eachLayer((layer: any) => {
      if (matched) return;
      const p = layer.feature?.properties || {};
      const name = p.neighbourhoodName || p.neighbourhood_name || p.zoneId;
      if (typeof name === 'string' && normalizeZoneName(name) === want) {
        matched = layer.feature;
      }
    });
    if (!matched) return; // unmatched name → today's behaviour, no guessing
    const p = matched.properties || {};
    const centroid = geometryCentroid(matched.geometry);
    if (!centroid) return;
    preselectAppliedRef.current = true;
    setSelectedAssets(prev =>
      prev.some(a => a.type === 'zone')
        ? prev
        : [
            ...prev,
            {
              type: 'zone',
              source: zoneSource,
              name: p.neighbourhoodName || p.neighbourhood_name || p.zoneId,
              geometry: matched.geometry,
              coordinates: centroid,
              properties: p,
            } as SelectedAsset,
          ]
    );
    setSelectedZone({
      type: 'zone',
      source: zoneSource,
      name: p.neighbourhoodName || p.neighbourhood_name || p.zoneId,
      geometry: matched.geometry,
      coordinates: centroid,
      properties: p,
    } as SelectedAsset);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zonesLoaded, mapReady, params.preselectZone]);

  // The pre-selected bairro's outline, drawn as its own inert layer so it
  // survives the tour (where the zones layer is styled down to thin outlines and
  // made non-interactive). Without this the org sees three hazard maps of a city
  // it can't locate itself in.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !params.preselectZone) return;
    const geom = selectedZone?.geometry as any;
    if (!geom) return;
    const ring = L.geoJSON(geom, {
      style: {
        color: '#0f172a',
        weight: 3,
        opacity: 0.9,
        fill: false,
        dashArray: '6 4',
      },
      interactive: false,
    });
    ring.addTo(map);
    return () => {
      try {
        map.removeLayer(ring);
      } catch {}
    };
  }, [selectedZone, params.preselectZone, mapReady]);

  // ── focusZone (E2 linear flow): open already inside the bairro ──────────────
  // The site session starts where the bairro session ended: the named zone is
  // pre-selected, the zone step skipped, the view fitted to the bairro. One-shot
  // (ref latch); a name that matches no zone falls back to the normal zone step.
  const focusZoneAppliedRef = useRef(false);
  useEffect(() => {
    if (focusZoneAppliedRef.current) return;
    if (!params.focusZone || !isComposite || params.hazardTour) return;
    if (!zonesLoaded || !mapReady || !mapRef.current) return;
    const zl = zonesLayerRef.current;
    if (!zl) return;
    const want = params.focusZone.trim().toLowerCase();
    let matched: { feature: any } | null = null;
    zl.eachLayer((layer: any) => {
      if (matched) return;
      const p = layer.feature?.properties || {};
      const name = p.neighbourhoodName || p.neighbourhood_name || p.zoneId;
      if (typeof name === 'string' && name.trim().toLowerCase() === want) {
        matched = { feature: layer.feature };
      }
    });
    if (!matched) return;
    const feature = (matched as { feature: any }).feature;
    const p = feature.properties || {};
    const centroid = geometryCentroid(feature.geometry);
    if (!centroid) return;
    focusZoneAppliedRef.current = true;
    const asset: SelectedAsset = {
      type: 'zone',
      source: zoneSource,
      name: p.neighbourhoodName || p.neighbourhood_name || p.zoneId,
      geometry: feature.geometry,
      coordinates: centroid,
      properties: p,
    };
    setSelectedAssets(prev =>
      prev.some(a => a.type === 'zone') ? prev : [...prev, asset]
    );
    setSelectedZone(asset);
    const map = mapRef.current;
    map.removeLayer(zl);
    // Fit the view to the bairro. This effect fires while the panel is still
    // opening (the container can have zero/stale size), so a single fitBounds
    // computes the wrong zoom and leaves the user staring at the whole metro
    // region (JVP video 2026-07-16). invalidateSize + staggered refits make it
    // land once layout settles; the calls are idempotent.
    const fitToBairro = () => {
      // The map may already be gone: confirming the site closes the panel and
      // unmounts it, and a refit landing after that reaches into a torn-down
      // Leaflet instance — `invalidateSize` fires a resize → pan animation that
      // throws `_leaflet_pos` of undefined from inside a rAF callback, where the
      // try/catch below cannot reach it. In dev that raises a runtime-error
      // overlay that swallows every subsequent click. The unmount handler nulls
      // mapRef, so this identity check is the reliable liveness test.
      if (mapRef.current !== map) return;
      try {
        map.invalidateSize();
        const bounds = L.geoJSON(feature.geometry).getBounds();
        if (bounds.isValid())
          map.fitBounds(bounds, { padding: [30, 30], maxZoom: 16 });
      } catch {}
    };
    fitToBairro();
    const refitTimers = [setTimeout(fitToBairro, 350), setTimeout(fitToBairro, 1000)];
    setCompositeStep('assets');
    setLoading(true);
    setLoadingStatus(
      t('mapMicroapp.loadingSites', { defaultValue: 'Loading sites...' })
    );
    return () => refitTimers.forEach(clearTimeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zonesLoaded, mapReady]);

  // Simple site mode: fetch the bairro's known places for the chooser list.
  // Ray-casting point-in-polygon — the zone geometry is small and this runs
  // once per session; no need to pull turf in for it.
  useEffect(() => {
    if (!simpleSite || bairroPlaces !== null) return;
    const zoneGeom = selectedZone?.geometry as any;
    if (!zoneGeom?.coordinates) return;
    const inRing = (pt: [number, number], ring: Array<[number, number]>) => {
      let inside = false;
      for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        const [xi, yi] = ring[i];
        const [xj, yj] = ring[j];
        if (yi > pt[1] !== yj > pt[1] && pt[0] < ((xj - xi) * (pt[1] - yi)) / (yj - yi) + xi)
          inside = !inside;
      }
      return inside;
    };
    const inZone = (lng: number, lat: number): boolean => {
      const polys: Array<Array<Array<[number, number]>>> =
        zoneGeom.type === 'MultiPolygon' ? zoneGeom.coordinates : [zoneGeom.coordinates];
      return polys.some(rings => inRing([lng, lat], rings[0]));
    };
    (async () => {
      const SOURCES: Array<{ endpoint: string; emoji: string }> = [
        { endpoint: '/api/osm/parks', emoji: '🌳' },
        { endpoint: '/api/osm/schools', emoji: '🏫' },
        { endpoint: '/api/osm/wetlands', emoji: '🌾' },
      ];
      const found: Array<{ name: string; lat: number; lng: number; emoji: string }> = [];
      await Promise.all(
        SOURCES.map(async src => {
          try {
            const res = await fetch(src.endpoint);
            if (!res.ok) return;
            const gj = await res.json();
            for (const feat of gj?.features ?? []) {
              const name = feat.properties?.name;
              if (typeof name !== 'string' || !name.trim()) continue; // unnamed = not recognizable as "their" place
              const c = geometryCentroid(feat.geometry);
              if (!c || !inZone(c[1], c[0])) continue;
              found.push({ name: name.trim(), lat: c[0], lng: c[1], emoji: src.emoji });
            }
          } catch {}
        })
      );
      const seen = new Set<string>();
      setBairroPlaces(
        found
          .filter(pl => (seen.has(pl.name) ? false : (seen.add(pl.name), true)))
          .slice(0, 6)
      );
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [simpleSite, selectedZone, bairroPlaces]);

  // ── Toggle tile layer ───────────────────────────────────────────────────────
  // State-only: just flip membership in enabledTiles. The reconcile effect below
  // is the single place that adds/removes the actual Leaflet layers, so an
  // auto-enabled overlay (browse-only / showLegendSimple) renders too — not only
  // ones toggled by a click.
  const toggleTileLayer = useCallback((tileId: string) => {
    setEnabledTiles(prev => {
      const n = new Set(prev);
      n.has(tileId) ? n.delete(tileId) : n.add(tileId);
      return n;
    });
  }, []);

  // Reconcile the Leaflet tile layers with enabledTiles (add missing, remove
  // gone). Runs for both click-toggles and auto-enabled overlays.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    // Remove layers no longer enabled.
    for (const id of Object.keys(tileLayerRefs.current)) {
      if (!enabledTiles.has(id)) {
        map.removeLayer(tileLayerRefs.current[id]);
        delete tileLayerRefs.current[id];
      }
    }
    // Add newly enabled layers.
    for (const id of Array.from(enabledTiles)) {
      if (tileLayerRefs.current[id]) continue;
      const layerDef = ALL_TILE_LAYERS.find(l => l.id === id);
      if (!layerDef) continue;
      const tl = L.tileLayer(tileVisualUrl(layerDef), {
        opacity: 0.6,
        maxNativeZoom: 15,
        maxZoom: 19,
        minZoom: 8,
        errorTileUrl: '',
      });
      tl.addTo(map);
      tileLayerRefs.current[id] = tl;
    }
  }, [enabledTiles, mapReady]);

  // ── Sample mode ─────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!mapReady || !mapRef.current || selectionMode !== 'sample') return;
    const map = mapRef.current;
    const handleClick = async (e: L.LeafletMouseEvent) => {
      const { lat, lng } = e.latlng;
      const values: Record<string, number> = {};
      for (const tileId of params.sampleLayers || params.tileLayers || []) {
        const tileDef = ALL_TILE_LAYERS.find(l => l.id === tileId);
        if (!tileDef?.valueEncoding?.urlTemplate) continue;
        const val = await sampleRasterAtPoint(
          lat,
          lng,
          tileDef.valueEncoding,
          11
        );
        if (val !== null) values[tileDef.name] = val;
      }
      if (Object.keys(values).length > 0) {
        const marker = L.circleMarker([lat, lng], {
          radius: 6,
          color: '#ef4444',
          fillColor: '#ef4444',
          fillOpacity: 0.8,
          weight: 2,
        });
        marker.bindTooltip(
          Object.entries(values)
            .map(([k, v]) => `${k}: <strong>${v.toFixed(3)}</strong>`)
            .join('<br/>'),
          { permanent: true, direction: 'top' }
        );
        marker.addTo(map);
        customMarkersRef.current.push(marker);
        setSampledPoints(prev => [...prev, { lat, lng, values }]);
      }
    };
    map.on('click', handleClick);
    map.getContainer().style.cursor = 'crosshair';
    return () => {
      map.off('click', handleClick);
      map.getContainer().style.cursor = '';
    };
  }, [mapReady, selectionMode]);

  // ── Custom draw ─────────────────────────────────────────────────────────────
  const polygonPointsRef = useRef<L.LatLng[]>([]);
  const polygonPreviewRef = useRef<L.Polyline | null>(null);

  useEffect(() => {
    if (
      !mapReady ||
      !mapRef.current ||
      (drawMode !== 'point' && drawMode !== 'polygon')
    )
      return;
    const map = mapRef.current;

    const handleClick = async (e: L.LeafletMouseEvent) => {
      const { lat, lng } = e.latlng;
      if (drawMode === 'point') {
        const rasterValues: Record<string, number> = {};
        for (const tileId of Array.from(enabledTiles)) {
          const tileDef = ALL_TILE_LAYERS.find(l => l.id === tileId);
          if (!tileDef?.valueEncoding?.urlTemplate) continue;
          const val = await sampleRasterAtPoint(
            lat,
            lng,
            tileDef.valueEncoding,
            11
          );
          if (val !== null) rasterValues[tileDef.name] = val;
        }
        const marker = L.circleMarker([lat, lng], {
          radius: 8,
          color: '#8b5cf6',
          fillColor: '#8b5cf6',
          fillOpacity: 0.8,
          weight: 2,
        });
        marker.bindTooltip(
          t('mapMicroapp.customSite', { defaultValue: 'Custom site' }),
          { permanent: false }
        );
        marker.addTo(map);
        customMarkersRef.current.push(marker);
        setSelectedAssets(prev => [
          ...prev,
          {
            type: 'custom',
            name: `${t('mapMicroapp.customPointName', { defaultValue: 'Custom point' })} (${lat.toFixed(4)}, ${lng.toFixed(4)})`,
            coordinates: [lat, lng],
            properties: {},
            rasterValues,
          },
        ]);
        setDrawMode('off');
      }
      if (drawMode === 'polygon') {
        // Close by tapping the FIRST vertex again (what the PT help copy says:
        // "feche no primeiro ponto") — double-tap still works as a fallback.
        if (polygonPointsRef.current.length >= 3) {
          const firstPt = map.latLngToContainerPoint(
            polygonPointsRef.current[0]
          );
          const clickPt = map.latLngToContainerPoint(e.latlng);
          if (firstPt.distanceTo(clickPt) < 24) {
            await closePolygon();
            return;
          }
        }
        polygonPointsRef.current.push(e.latlng);
        if (polygonPreviewRef.current)
          map.removeLayer(polygonPreviewRef.current);
        if (polygonPointsRef.current.length >= 2) {
          // interactive:false throughout the draw path — same family as
          // MAP-BOUNDARY-EATS-CLICKS. Every shape here is FEEDBACK about what the
          // user is drawing, and the drawing itself is driven by taps on the map.
          // Left interactive, the preview line and the vertex dots sit exactly
          // where the next tap is likely to land and eat it, so the polygon
          // silently stops growing.
          polygonPreviewRef.current = L.polyline(
            [...polygonPointsRef.current, polygonPointsRef.current[0]],
            { color: '#8b5cf6', weight: 2, dashArray: '4 4', interactive: false }
          ).addTo(map);
        }
        const vm = L.circleMarker([lat, lng], {
          radius: 4,
          color: '#8b5cf6',
          fillColor: '#fff',
          fillOpacity: 1,
          weight: 2,
          interactive: false,
        });
        vm.addTo(map);
        customMarkersRef.current.push(vm);
      }
    };

    const closePolygon = async () => {
      if (polygonPointsRef.current.length < 3) return;
      const coords = polygonPointsRef.current.map(
        p => [p.lng, p.lat] as [number, number]
      );
      coords.push(coords[0]);
      const geometry = { type: 'Polygon' as const, coordinates: [coords] };
      if (polygonPreviewRef.current) {
        map.removeLayer(polygonPreviewRef.current);
        polygonPreviewRef.current = null;
      }
      const poly = L.polygon(polygonPointsRef.current, {
        color: '#8b5cf6',
        fillColor: '#8b5cf6',
        fillOpacity: 0.3,
        weight: 2,
        // The drawn area is a RESULT, not a control — and a filled one, so left
        // interactive it covers its own footprint and blocks re-drawing over it.
        interactive: false,
      });
      poly.addTo(map);
      customMarkersRef.current.push(poly);
      const centroid = geometryCentroid(geometry);
      const rasterValues: Record<string, number> = {};
      if (centroid) {
        for (const tileId of Array.from(enabledTiles)) {
          const tileDef = ALL_TILE_LAYERS.find(l => l.id === tileId);
          if (!tileDef?.valueEncoding?.urlTemplate) continue;
          const val = await sampleRasterAtPoint(
            centroid[0],
            centroid[1],
            tileDef.valueEncoding,
            11
          );
          if (val !== null) rasterValues[tileDef.name] = val;
        }
      }
      setSelectedAssets(prev => [
        ...prev,
        {
          type: 'custom',
          name: t('mapMicroapp.customAreaName', {
            defaultValue: 'Custom area ({{n}} vertices)',
            n: polygonPointsRef.current.length,
          }),
          geometry,
          coordinates: centroid || [
            polygonPointsRef.current[0].lat,
            polygonPointsRef.current[0].lng,
          ],
          properties: {},
          rasterValues,
        },
      ]);
      polygonPointsRef.current = [];
      setDrawMode('off');
    };

    const handleDblClick = async (e: L.LeafletMouseEvent) => {
      if (drawMode !== 'polygon' || polygonPointsRef.current.length < 3) return;
      e.originalEvent.preventDefault();
      await closePolygon();
    };

    map.on('click', handleClick);
    map.on('dblclick', handleDblClick);
    map.doubleClickZoom.disable();
    // NOTE: map dragging stays ENABLED while drawing. Leaflet already tells a
    // tap (click) apart from a drag, so vertex/pin placement works fine with
    // panning on — and phone users MUST be able to pan the satellite view to
    // find their building. The old dragging.disable() froze one-finger pan for
    // the whole site step (P0 mobile bug).
    map.getContainer().style.cursor = 'crosshair';
    return () => {
      map.off('click', handleClick);
      map.off('dblclick', handleDblClick);
      map.doubleClickZoom.enable();
      map.getContainer().style.cursor = '';
      polygonPointsRef.current = [];
      if (polygonPreviewRef.current) {
        map.removeLayer(polygonPreviewRef.current);
        polygonPreviewRef.current = null;
      }
    };
  }, [mapReady, drawMode, enabledTiles]);

  // ── Add-your-own-site (search by name / paste coordinate) ────────────────────
  // Shared add: drop a marker, sample the active rasters at the point, push it
  // into the selection (type 'custom' so it flows through confirm like a drawn
  // point), and pan the map there.
  const addCustomSite = useCallback(
    async (lat: number, lng: number, name: string) => {
      const map = mapRef.current;
      const rasterValues: Record<string, number> = {};
      for (const tileId of Array.from(enabledTiles)) {
        const tileDef = ALL_TILE_LAYERS.find(l => l.id === tileId);
        if (!tileDef?.valueEncoding?.urlTemplate) continue;
        const val = await sampleRasterAtPoint(
          lat,
          lng,
          tileDef.valueEncoding,
          11
        );
        if (val !== null) rasterValues[tileDef.name] = val;
      }
      if (map) {
        const marker = L.circleMarker([lat, lng], {
          radius: 8,
          color: '#8b5cf6',
          fillColor: '#8b5cf6',
          fillOpacity: 0.8,
          weight: 2,
        });
        marker.bindTooltip(name, { permanent: false });
        marker.addTo(map);
        customMarkersRef.current.push(marker);
        map.setView([lat, lng], Math.max(map.getZoom(), 15));
      }
      setSelectedAssets(prev => [
        ...prev,
        {
          type: 'custom',
          name,
          coordinates: [lat, lng],
          properties: { source: 'user-added' },
          rasterValues,
        },
      ]);
    },
    [enabledTiles]
  );

  // Bounding box [minLng, minLat, maxLng, maxLat] (turf.bbox order) of the chosen
  // zone, to bias the name search to the CBO's neighborhood.
  const zoneBbox = useCallback((): [number, number, number, number] | null => {
    const geom = selectedZone?.geometry;
    if (!geom?.coordinates) return null;
    let minLat = 90,
      minLng = 180,
      maxLat = -90,
      maxLng = -180;
    const walk = (c: any) => {
      if (typeof c[0] === 'number') {
        const [lng, lat] = c;
        minLat = Math.min(minLat, lat);
        maxLat = Math.max(maxLat, lat);
        minLng = Math.min(minLng, lng);
        maxLng = Math.max(maxLng, lng);
      } else c.forEach(walk);
    };
    walk(geom.coordinates);
    return [minLng, minLat, maxLng, maxLat];
  }, [selectedZone]);

  const searchSites = useCallback(async () => {
    if (!siteQuery.trim()) return;
    setSiteSearching(true);
    setSiteResults([]);
    try {
      const res = await fetch('/api/geospatial/osm-search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: siteQuery.trim(), bbox: zoneBbox() }),
      });
      const data = await res.json();
      setSiteResults(
        (data.assets || [])
          .filter(
            (a: any) => Array.isArray(a.centroid) && a.centroid.length === 2
          )
          .slice(0, 8)
          .map((a: any) => ({
            name: a.name as string,
            centroid: a.centroid as [number, number],
          }))
      );
    } catch {
      setSiteResults([]);
    } finally {
      setSiteSearching(false);
    }
  }, [siteQuery, zoneBbox]);

  const addByCoordinate = useCallback(async () => {
    // Accept Brazilian decimal-comma input — the PT placeholder itself teaches
    // "-30,03, -51,22", which the old split-on-comma parser mangled into
    // lat -30 / lng 3 (a point in the ocean, silently accepted). Extract signed
    // numeric tokens where ",digits" binds as a decimal separator, and
    // recombine the space-split "lat, frac, lng, frac" shape.
    const tokens = coordInput.match(/-?\d+(?:[.,]\d+)?/g) ?? [];
    const num = (s: string) => parseFloat(s.replace(',', '.'));
    let lat = NaN,
      lng = NaN;
    if (tokens.length === 2) {
      lat = num(tokens[0]);
      lng = num(tokens[1]);
    } else if (
      tokens.length === 4 &&
      /^\d+$/.test(tokens[1]) &&
      /^\d+$/.test(tokens[3])
    ) {
      lat = num(`${tokens[0]}.${tokens[1]}`);
      lng = num(`${tokens[2]}.${tokens[3]}`);
    }
    if (
      isNaN(lat) ||
      isNaN(lng) ||
      lat < -90 ||
      lat > 90 ||
      lng < -180 ||
      lng > 180
    ) {
      setCoordError('format');
      return;
    }
    // Sanity net: this map is Porto Alegre — a coordinate outside the metro
    // region is almost certainly a typo/mis-paste, and would otherwise be
    // persisted as the org's site with no visible feedback.
    if (lat < -31.5 || lat > -29.2 || lng < -52.5 || lng > -50.2) {
      setCoordError('outside');
      return;
    }
    setCoordError(false);
    await addCustomSite(
      lat,
      lng,
      `${t('mapMicroapp.siteName', { defaultValue: 'Site' })} (${lat.toFixed(4)}, ${lng.toFixed(4)})`
    );
    setCoordInput('');
    setAddSiteOpen(false);
  }, [coordInput, addCustomSite]);

  // ── Confirm ─────────────────────────────────────────────────────────────────
  // A real site = any non-zone asset (OSM/custom) or a sampled point. The zone
  // alone is not a site (it's the neighborhood).
  const hasSite =
    selectedAssets.some(a => a.type !== 'zone') || sampledPoints.length > 0;
  const handleConfirm = useCallback(() => {
    onConfirm({
      selectionMode,
      selectedAssets,
      sampledPoints,
      enabledLayers: [
        ...(params.layers || []),
        ...Array.from(enabledTiles),
        ...(params.spatialQueries || []),
      ],
      siteSource: 'user',
    });
  }, [
    selectedAssets,
    sampledPoints,
    selectionMode,
    params,
    onConfirm,
    enabledTiles,
  ]);
  // E2 linear flow (confirmAtZone): the bairro session ends HERE — confirm the
  // selected zone(s) only, no site step, no deferred marker (the site question
  // is the chat's job, in its own later session).
  const confirmZoneOnly = useCallback(() => {
    onConfirm({
      selectionMode,
      selectedAssets: selectedAssets.filter(a => a.type === 'zone'),
      sampledPoints: [],
      enabledLayers: [
        ...(params.layers || []),
        ...Array.from(enabledTiles),
        ...(params.spatialQueries || []),
      ],
      siteSource: 'user',
    });
  }, [selectedAssets, selectionMode, params, onConfirm, enabledTiles]);
  // No-site path (E2 "usar o bairro todo"): commit the neighborhood, mark the
  // site deferred. Keeps the zone, drops any site assets.
  const confirmDeferred = useCallback(() => {
    onConfirm({
      selectionMode,
      selectedAssets: selectedAssets.filter(a => a.type === 'zone'),
      sampledPoints: [],
      enabledLayers: [
        ...(params.layers || []),
        ...Array.from(enabledTiles),
        ...(params.spatialQueries || []),
      ],
      siteDeferred: true,
      siteSource: 'user',
    });
  }, [selectedAssets, selectionMode, params, onConfirm, enabledTiles]);

  const removeAsset = (index: number) =>
    setSelectedAssets(prev => prev.filter((_, i) => i !== index));
  const clearAll = () => {
    setSelectedAssets(prev =>
      isComposite ? prev.filter(a => a.type === 'zone') : []
    );
    setSampledPoints([]);
    for (const m of customMarkersRef.current) mapRef.current?.removeLayer(m);
    customMarkersRef.current = [];
    selectedHighlightsRef.current.forEach(hl => hl.remove());
    selectedHighlightsRef.current.clear();
  };

  // Simple site mode: "Marcar no mapa" arms point-dropping and KEEPS it armed
  // (the generic point handler disarms after each drop), so a second tap moves
  // the pin instead of requiring a re-tap on a mode button.
  const nonZoneCount = selectedAssets.filter(a => a.type !== 'zone').length;
  useEffect(() => {
    if (!simpleSite || simpleChoice !== 'map') return;
    if (drawMode === 'off') setDrawMode('point');
  }, [simpleSite, simpleChoice, drawMode]);
  // Simple site mode is single-pin: keep only the newest non-zone asset and
  // its marker (markers push in the same order the assets do).
  useEffect(() => {
    if (!simpleSite || nonZoneCount <= 1) return;
    setSelectedAssets(prev => {
      const zones = prev.filter(a => a.type === 'zone');
      const others = prev.filter(a => a.type !== 'zone');
      return [...zones, others[others.length - 1]];
    });
    const map = mapRef.current;
    while (customMarkersRef.current.length > 1) {
      const old = customMarkersRef.current.shift();
      if (old && map) map.removeLayer(old);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [simpleSite, nonZoneCount]);

  const totalSelections = selectedAssets.length + sampledPoints.length;
  const availableTileLayers = (params.tileLayers || [])
    .map(id => ALL_TILE_LAYERS.find(l => l.id === id))
    .filter(Boolean) as typeof TILE_LAYERS;

  // Simplified E2 legend: collapse the layer toolkit into ≤3 hazard chips
  // (flood/heat/landslide), each tied to the first matching available layer.
  const simpleLegend = (params.showLegendSimple ? availableTileLayers : [])
    .map(l => ({ layer: l, fam: hazardFamilyOf(l.id) }))
    .filter(
      (
        x
      ): x is {
        layer: (typeof availableTileLayers)[number];
        fam: HazardFamily;
      } => x.fam !== null
    )
    .filter((x, i, arr) => arr.findIndex(y => y.fam === x.fam) === i); // one chip per hazard

  // The hazard chips are LAYER TOGGLES, not a key to what's on screen — and on
  // a confirmAtZone map they never appear anywhere they'd be true. The tools bar
  // is hidden for the whole tour (the tour carries its own locked legend), and
  // the tour turns every raster OFF when it ends, so the only moment the chips
  // rendered was the bairro step: three dead switches that read as the key to
  // the polygon colours while controlling a different encoding entirely, where
  // tapping one stacked a raster back over the map. Other presets (browse, the
  // legacy combined session) still show them over live rasters, so this is
  // scoped rather than deleted.
  const showHazardChips = simpleLegend.length > 0 && !params.confirmAtZone;
  const canDraw =
    showAssets && (selectionMode === 'assets' || selectionMode === 'composite');

  // The bairro we pre-selected from E1, once it actually matched a polygon.
  // Naming it on the confirm button is the safeguard against a wrong invite
  // value: "Confirmar Sarandi" can be disagreed with, "Confirmar bairro" can't.
  const selectedZoneName = selectedAssets.find(a => a.type === 'zone')?.name;
  const preselectedName =
    params.preselectZone &&
    selectedZoneName &&
    normalizeZoneName(selectedZoneName) === normalizeZoneName(params.preselectZone)
      ? selectedZoneName
      : null;

  // Step instructions
  const step1Key = isNeighborhoods
    ? 'mapMicroapp.step1Neighborhood'
    : 'mapMicroapp.step1Zone';
  const stepInstruction = isComposite
    ? compositeStep === 'zone'
      // During the hazard tour, zone selection is deliberately suppressed
      // (`showZones = !tourActive`) — so telling the user to tap their bairro
      // invites the one gesture that cannot work, and a tap on a dead map gives
      // no feedback at all. Almost certainly the "I tapped and nothing
      // happened" failure: an automated harness needed eight jittered offsets
      // before a bairro would select at phone size.
      ? tourActive
        ? t('mapMicroapp.tourHint', {
            defaultValue: 'Veja como cada risco se espalha pela cidade.',
          })
        : preselectedName
          ? t('mapMicroapp.step1Preselected', {
              bairro: preselectedName,
              defaultValue:
                'Já marcamos {{bairro}}. Confirme, ou toque em outro bairro.',
            })
          : params.confirmAtZone
            ? // No "Passo 1:" — this session has no step 2 (that's why the
              // stepper is gone), and the cohort is on phones, where "clique"
              // is the wrong verb.
              t('mapMicroapp.tapYourBairro', {
                defaultValue: 'Toque no bairro onde vocês atuam.',
              })
            : t(step1Key)
      : t('mapMicroapp.step2Sites', {
          zone:
            selectedAssets
              .filter(a => a.type === 'zone')
              .map(a => a.name)
              .join(', ') || 'zone',
        })
    : selectionMode === 'assets'
      ? t('mapMicroapp.clickFeatures')
      : selectionMode === 'sample'
        ? t('mapMicroapp.clickSample')
        : t('mapMicroapp.clickZones');

  return (
    // `isolate` is load-bearing. The overlays below (tour caption z-900, legend
    // sheet z-1001, loading veil z-1000) sit OUTSIDE .leaflet-container, so
    // without a stacking context here their z-indices compete in the root
    // context and beat every portalled Radix overlay — all of which are z-50.
    // The ⓘ "De onde vêm estes dados" dialog opened *underneath* the hazard
    // legend because of this. Leaflet solves it for its own panes the same way
    // (.leaflet-container is z-index:0); we just do it for ours.
    <div className='relative isolate flex flex-col h-full w-full bg-background overflow-hidden'>
      {/* Header */}
      <div className='px-3 py-2 border-b bg-muted/30 shrink-0 flex items-start gap-2'>
        <div className='min-w-0 flex-1'>
          <p className='text-xs font-medium leading-tight'>{params.prompt}</p>
          <p className='text-[10px] text-muted-foreground mt-0.5'>
            {polygonHelp || stepInstruction}
          </p>
        </div>
        {/* "Where this data comes from" — data-literacy for the hazard/zone layers. */}
        {(isComposite || simpleLegend.length > 0) && (
          <DataProvenanceDialog
            lang={provLang}
            compact
            className='shrink-0'
            entries={
              (compositeStep === 'assets'
                ? ['flood', 'heat', 'landslide', 'neighborhoods', 'sites']
                : [
                    'flood',
                    'heat',
                    'landslide',
                    'neighborhoods',
                  ]) as ProvenanceKey[]
            }
          />
        )}
      </div>

      {/* Prominent point-vs-area control — CBO site step. Replaces the tiny draw
          chips so "draw the area" is clearly available, not just a point.
          Hidden in simple site mode: the chooser overlay is the only control. */}
      {params.allowDeferSite &&
        isComposite &&
        compositeStep === 'assets' &&
        !tourActive &&
        !simpleSite && (
          <div className='px-3 py-2 border-b bg-muted/10 shrink-0'>
            <p className='text-[10px] text-muted-foreground mb-1'>
              {t('mapMicroapp.siteHowToMark', {
                defaultValue: 'Como marcar seu lugar?',
              })}
            </p>
            <div className='flex gap-1.5'>
              {/* True three-state toggles: nothing is armed until the user picks a
                mode (re-tapping disarms). The old default made "Um ponto" LOOK
                active while drawMode was off — and pairing that with auto-arm
                meant panning taps dropped pins. */}
              <Button
                variant={drawMode === 'point' ? 'default' : 'outline'}
                size='sm'
                className='h-9 text-[11px] gap-1 flex-1'
                onClick={() =>
                  setDrawMode(drawMode === 'point' ? 'off' : 'point')
                }
                data-testid='map-draw-point'
              >
                <MapPin className='w-3 h-3' />{' '}
                {t('mapMicroapp.drawPoint', { defaultValue: 'Um ponto' })}
              </Button>
              <Button
                variant={drawMode === 'polygon' ? 'default' : 'outline'}
                size='sm'
                className='h-9 text-[11px] gap-1 flex-1'
                onClick={() =>
                  setDrawMode(drawMode === 'polygon' ? 'off' : 'polygon')
                }
                data-testid='map-draw-area'
              >
                <Pencil className='w-3 h-3' />{' '}
                {t('mapMicroapp.drawArea', { defaultValue: 'Desenhar a área' })}
              </Button>
            </div>
            <p
              className='text-[10px] text-muted-foreground mt-1'
              data-testid='map-draw-help'
            >
              {drawMode === 'polygon'
                ? t('mapMicroapp.drawHelpArea', {
                    defaultValue:
                      'Toque nos cantos do lugar; feche no primeiro ponto.',
                  })
                : drawMode === 'point'
                  ? t('mapMicroapp.drawHelpPoint', {
                      defaultValue: 'Toque no mapa pra marcar o lugar.',
                    })
                  : t('mapMicroapp.drawHelpOff', {
                      defaultValue:
                        'Arraste pra navegar no mapa. Pra marcar, escolha uma opção acima.',
                    })}
            </p>
          </div>
        )}

      {/* Stepper bar (composite mode) — hidden during the hazard tour, in simple
          site mode (there is no step 1 to go back to), and whenever the session
          ENDS at the zone step: `confirmAtZone` means there is no step 2 in this
          map at all, so "1 Bairro › 2 Locais" advertised a destination the
          Confirmar button never goes to. The site gets its own later session. */}
      {!tourActive && isComposite && !simpleSite && !params.confirmAtZone && (
        <div className='flex items-center gap-2 px-3 py-1.5 border-b bg-muted/20 shrink-0'>
          <button
            onClick={compositeStep === 'assets' ? backToZones : undefined}
            className={`flex items-center gap-1 text-[10px] px-2 py-0.5 rounded ${compositeStep === 'zone' ? 'bg-primary text-primary-foreground font-medium' : 'text-muted-foreground hover:bg-muted/50'}`}
          >
            <span className='w-4 h-4 rounded-full bg-current/20 flex items-center justify-center text-[9px] font-bold'>
              1
            </span>
            {isNeighborhoods
              ? t('mapMicroapp.neighborhood')
              : t('mapMicroapp.zone')}
            {selectedAssets.some(a => a.type === 'zone') && (
              <Check className='w-3 h-3 text-emerald-500' />
            )}
          </button>
          <ChevronRight className='w-3 h-3 text-muted-foreground' />
          <button
            onClick={
              selectedAssets.some(a => a.type === 'zone')
                ? advanceToAssets
                : undefined
            }
            className={`flex items-center gap-1 text-[10px] px-2 py-0.5 rounded ${compositeStep === 'assets' ? 'bg-primary text-primary-foreground font-medium' : selectedAssets.some(a => a.type === 'zone') ? 'text-foreground hover:bg-muted/50' : 'text-muted-foreground/50 cursor-not-allowed'}`}
          >
            <span className='w-4 h-4 rounded-full bg-current/20 flex items-center justify-center text-[9px] font-bold'>
              2
            </span>
            {t('mapMicroapp.sites')}
          </button>
          {isComposite &&
            compositeStep === 'zone' &&
            selectedAssets.some(a => a.type === 'zone') && (
              <Button
                size='sm'
                className='h-6 text-[10px] gap-1 ml-auto'
                onClick={advanceToAssets}
              >
                {t('mapMicroapp.nextSites')}{' '}
                <ChevronRight className='w-3 h-3' />
              </Button>
            )}
        </div>
      )}

      {/* Tools bar — hidden during the hazard tour (legend is locked), and on
          the bairro-confirm step, where everything it can hold is either gone
          (the hazard chips) or wrong for the step (the draw tools, and a bare
          trash icon that would silently drop the pre-selected bairro). Leaving
          the bar up would render an empty bordered strip eating vertical space
          the map needs on a phone. */}
      {!tourActive && !(params.confirmAtZone && compositeStep === 'zone') && (
        <div className='flex items-center gap-1.5 px-3 py-1 border-b bg-muted/10 shrink-0'>
          {/* Simplified hazard legend (E2): ≤3 colored chips standing in for the
            full layer toolkit, so first-time CBO users see only flood / heat /
            landslide. Each chip toggles its hazard overlay. */}
          {showHazardChips ? (
            <div
              className='flex items-center gap-1.5'
              data-testid='map-simple-legend'
            >
              <span className='text-[9px] text-muted-foreground shrink-0'>
                {t('mapMicroapp.risks', { defaultValue: 'Riscos' })}:
              </span>
              {simpleLegend.map(({ layer, fam }) => {
                const isOn = enabledTiles.has(layer.id);
                const meta = HAZARD_LEGEND[fam];
                return (
                  <button
                    key={layer.id}
                    onClick={() => toggleTileLayer(layer.id)}
                    data-testid={`map-hazard-chip-${fam}`}
                    aria-pressed={isOn}
                    className={`flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] shrink-0 border ${isOn ? 'font-semibold' : 'text-muted-foreground border-transparent hover:bg-muted/50'}`}
                    style={
                      isOn
                        ? {
                            backgroundColor: `${meta.color}22`,
                            borderColor: meta.color,
                            color: meta.color,
                          }
                        : undefined
                    }
                  >
                    <span
                      className='w-2.5 h-2.5 rounded-full shrink-0'
                      style={{ backgroundColor: meta.color }}
                    />
                    {t(meta.labelKey, { defaultValue: meta.defaultLabel })}
                  </button>
                );
              })}
            </div>
          ) : (
            // Full layer toolkit — the city/concept-note flows. Never fall back
            // to it when the caller asked for the simplified legend: hiding the
            // 3 hazard chips on the bairro step must not swap in the 48-layer
            // control they were introduced to replace.
            !params.showLegendSimple &&
            availableTileLayers.length > 0 && (
              <>
                <span className='text-[9px] text-muted-foreground shrink-0'>
                  {t('mapMicroapp.layers')}:
                </span>
                {availableTileLayers.map(layer => {
                  const isOn = enabledTiles.has(layer.id);
                  return (
                    <button
                      key={layer.id}
                      onClick={() => toggleTileLayer(layer.id)}
                      className={`flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] shrink-0 ${isOn ? 'bg-primary/15 text-primary font-medium' : 'text-muted-foreground hover:bg-muted/50'}`}
                    >
                      {isOn ? (
                        <Eye className='w-2.5 h-2.5' />
                      ) : (
                        <EyeOff className='w-2.5 h-2.5' />
                      )}
                      {layer.name.length > 18
                        ? layer.name.slice(0, 16) + '…'
                        : layer.name}
                    </button>
                  );
                })}
              </>
            )
          )}
          <div className='flex-1' />
          {/* Draw buttons — tiny chips for the city flow; the CBO site step uses
            the prominent point/area control above instead. */}
          {canDraw && !params.allowDeferSite && (
            <>
              <Button
                variant={drawMode === 'point' ? 'default' : 'outline'}
                size='sm'
                className='h-5 text-[9px] gap-1 px-1.5'
                onClick={() =>
                  setDrawMode(drawMode === 'point' ? 'off' : 'point')
                }
              >
                <MapPin className='w-2.5 h-2.5' /> {t('mapMicroapp.point')}
              </Button>
              <Button
                variant={drawMode === 'polygon' ? 'default' : 'outline'}
                size='sm'
                className='h-5 text-[9px] gap-1 px-1.5'
                onClick={() =>
                  setDrawMode(drawMode === 'polygon' ? 'off' : 'polygon')
                }
              >
                <Pencil className='w-2.5 h-2.5' /> {t('mapMicroapp.area')}
              </Button>
            </>
          )}
          {totalSelections > 0 && !simpleSite && (
            <Button
              variant='ghost'
              size='sm'
              className='h-5 px-1'
              onClick={clearAll}
            >
              <Trash2 className='w-3 h-3' />
            </Button>
          )}
        </div>
      )}

      {/* Add-your-own-site panel (assets step) — search by name or coordinate
          for sites the OSM suggestions miss. Mobile-friendly: collapsed to a
          single chip until tapped. Simple site mode has its own search in the
          chooser overlay instead. */}
      {canDraw && !simpleSite && (
        <div className='border-b bg-muted/10 shrink-0'>
          {!addSiteOpen ? (
            <button
              onClick={() => setAddSiteOpen(true)}
              data-testid='map-add-site-toggle'
              className='flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-medium text-primary hover:bg-muted/40 w-full'
            >
              <Plus className='w-3 h-3' />{' '}
              {t('mapMicroapp.addSite', {
                defaultValue: 'Add a site by name or coordinate',
              })}
            </button>
          ) : (
            <div className='px-3 py-2 space-y-2'>
              <div className='flex items-center gap-1.5'>
                <Search className='w-3 h-3 text-muted-foreground shrink-0' />
                <Input
                  value={siteQuery}
                  onChange={e => setSiteQuery(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') searchSites();
                  }}
                  placeholder={
                    t('mapMicroapp.searchPlaceholder', {
                      defaultValue: 'Search a place name…',
                    }) as string
                  }
                  className='h-7 text-xs'
                  data-testid='map-site-search-input'
                  autoFocus
                />
                <Button
                  size='sm'
                  className='h-7 text-[10px] px-2'
                  onClick={searchSites}
                  disabled={siteSearching || !siteQuery.trim()}
                  data-testid='map-site-search-btn'
                >
                  {siteSearching ? (
                    <Loader2 className='w-3 h-3 animate-spin' />
                  ) : (
                    t('mapMicroapp.search', { defaultValue: 'Search' })
                  )}
                </Button>
                <button
                  onClick={() => {
                    setAddSiteOpen(false);
                    setSiteResults([]);
                    setCoordError(false);
                  }}
                  className='shrink-0 text-muted-foreground'
                >
                  <X className='w-3.5 h-3.5' />
                </button>
              </div>
              {siteResults.length > 0 && (
                <div
                  className='max-h-24 overflow-y-auto space-y-0.5'
                  data-testid='map-site-results'
                >
                  {siteResults.map((r, i) => (
                    <button
                      key={i}
                      onClick={() => {
                        addCustomSite(r.centroid[0], r.centroid[1], r.name);
                        setSiteResults([]);
                        setSiteQuery('');
                        setAddSiteOpen(false);
                      }}
                      data-testid={`map-site-result-${i}`}
                      className='flex items-center gap-1.5 w-full text-left px-2 py-1 rounded text-[11px] hover:bg-muted/60'
                    >
                      <MapPin className='w-3 h-3 text-primary shrink-0' />
                      <span className='truncate'>{r.name}</span>
                    </button>
                  ))}
                </div>
              )}
              <div className='flex items-center gap-1.5'>
                <Crosshair className='w-3 h-3 text-muted-foreground shrink-0' />
                <Input
                  value={coordInput}
                  onChange={e => {
                    setCoordInput(e.target.value);
                    setCoordError(false);
                  }}
                  onKeyDown={e => {
                    if (e.key === 'Enter') addByCoordinate();
                  }}
                  placeholder={
                    t('mapMicroapp.coordPlaceholder', {
                      defaultValue: 'lat, lng (e.g. -30.03, -51.22)',
                    }) as string
                  }
                  className={`h-7 text-xs ${coordError ? 'border-red-500' : ''}`}
                  data-testid='map-site-coord-input'
                />
                <Button
                  size='sm'
                  variant='outline'
                  className='h-7 text-[10px] px-2'
                  onClick={addByCoordinate}
                  disabled={!coordInput.trim()}
                  data-testid='map-site-coord-btn'
                >
                  {t('mapMicroapp.addPin', { defaultValue: 'Add' })}
                </Button>
              </div>
              {coordError && (
                <p
                  className='text-[10px] text-red-500'
                  data-testid='map-coord-error'
                >
                  {coordError === 'outside'
                    ? t('mapMicroapp.coordOutside', {
                        defaultValue:
                          'That point is outside the Porto Alegre region — double-check the numbers.',
                      })
                    : t('mapMicroapp.coordInvalid', {
                        defaultValue: 'Enter as: latitude, longitude',
                      })}
                </p>
              )}
            </div>
          )}
        </div>
      )}

      {/* Map */}
      <div className='flex-1 relative min-h-0 overflow-hidden'>
        <div ref={mapContainerRef} className='absolute inset-0'>
          <ValueTooltip
            mapRef={mapRef}
            enabledLayers={enabledTileLayerDefs}
            mapReady={mapReady}
          />
        </div>
        {/* Narration overlay (E2 needs-help). Translucent banner pinned to
            the top of the map so the agent can explain colors as the user
            scrolls. Pointer-events disabled so it doesn't block the map. */}
        {params.narrationOverlay && !tourActive && (
          <div className='absolute top-2 left-2 right-2 z-[900] pointer-events-none'>
            <div className='bg-background/85 backdrop-blur-sm border border-foreground/10 rounded-lg px-3 py-2 shadow-sm'>
              <p className='text-[11px] text-foreground/85 leading-snug'>
                {params.narrationOverlay}
              </p>
            </div>
          </div>
        )}
        {/* Hazard-tour caption — pinned over the map while a single hazard is
            shown. Pointer-events disabled so the user can still pan underneath. */}
        {tourActive && tourFamily && (
          <div className='absolute top-2 left-2 right-2 z-[900] pointer-events-none'>
            <div
              className='bg-background/90 backdrop-blur-sm border-2 rounded-lg px-3 py-2 shadow-md'
              style={{ borderColor: HAZARD_LEGEND[tourFamily].color }}
            >
              <p
                className='text-xs font-semibold flex items-center gap-1.5'
                style={{ color: HAZARD_LEGEND[tourFamily].color }}
              >
                <span>{TOUR_COPY[tourFamily].emoji}</span>
                {t(TOUR_COPY[tourFamily].titleKey, {
                  defaultValue: TOUR_COPY[tourFamily].title,
                })}
                <span className='ml-auto text-[10px] font-medium text-muted-foreground'>
                  {tourIdx + 1}/{tourLayers.length}
                </span>
              </p>
              <p className='text-[11px] text-foreground/85 leading-snug mt-0.5'>
                {t(TOUR_COPY[tourFamily].bodyKey, {
                  defaultValue: TOUR_COPY[tourFamily].body,
                })}
              </p>
              {/* Real color scale for the active hazard layer (from the map's
                  own legend data), so the colors always match. */}
              {(() => {
                const grad = legendGradientCss(legends[tourLayers[tourIdx]]);
                if (!grad) return null;
                return (
                  <div className='mt-1.5'>
                    <div
                      className='h-2 rounded-sm w-full border border-foreground/10'
                      style={{ background: grad }}
                    />
                    <div className='flex justify-between text-[9px] text-muted-foreground mt-0.5'>
                      <span>
                        {t('mapMicroapp.lessRisk', {
                          defaultValue: 'menos risco',
                        })}
                      </span>
                      <span>
                        {t('mapMicroapp.moreRisk', {
                          defaultValue: 'mais risco',
                        })}
                      </span>
                    </div>
                  </div>
                );
              })()}
            </div>
          </div>
        )}
        {/* Neighborhood-coloring explainer (CBO zone step) — same encoding as the
            orchestrator: hue = which risk, stronger color = more risk.
            Suppressed under `zoneRiskRamp`, which has its own single-scale legend:
            it repeated the three hazard dots already sitting in the chip row
            directly above it (two legends for one map), and named a brown that
            appears on ZERO of Porto Alegre's 94 bairros while saying nothing
            about the purple and green that cover 26 of them. */}
        {/* One-scale risk legend (E2 Map 1). Replaces the two-encoding explainer
            below: a single sequential ramp needs a single key, and the five
            bands are the same ones the site card and the coordinator use. */}
        {!tourActive &&
          params.zoneRiskRamp &&
          isComposite &&
          compositeStep === 'zone' && (
            <div
              className='absolute top-2 left-2 right-2 z-[900] pointer-events-none'
              data-testid='map-risk-ramp-legend'
            >
              <div className='bg-background/92 backdrop-blur-sm border border-foreground/10 rounded-lg px-3 py-2 shadow-sm'>
                <p className='text-[11px] text-foreground/85 leading-snug'>
                  {t('mapMicroapp.rampExplainer', {
                    defaultValue:
                      'A cor mostra o risco de cada bairro comparado com o resto de Porto Alegre. Toque num bairro pra ver qual risco é.',
                  })}
                </p>
                <div className='flex items-center gap-1 mt-1.5'>
                  {RISK_BANDS.map(b => (
                    <div key={b.key} className='flex-1'>
                      <div
                        className='h-2 rounded-sm border border-foreground/10'
                        style={{ backgroundColor: b.color }}
                      />
                    </div>
                  ))}
                </div>
                <div className='flex items-center justify-between mt-0.5'>
                  <span className='text-[9px] text-muted-foreground'>
                    {t('mapMicroapp.lessRisk', { defaultValue: 'menos risco' })}
                  </span>
                  <span className='text-[9px] text-muted-foreground'>
                    {t('mapMicroapp.moreRisk', { defaultValue: 'mais risco' })}
                  </span>
                </div>
              </div>
            </div>
          )}
        {!tourActive &&
          params.allowDeferSite &&
          !params.zoneRiskRamp &&
          isComposite &&
          compositeStep === 'zone' && (
            <div className='absolute top-2 left-2 right-2 z-[900] pointer-events-none'>
              <div className='bg-background/90 backdrop-blur-sm border border-foreground/10 rounded-lg px-3 py-2 shadow-sm'>
                <p className='text-[11px] text-foreground/85 leading-snug'>
                  {t('mapMicroapp.zoneRiskExplainer', {
                    defaultValue:
                      'Cada bairro está colorido pelo risco principal — quanto mais forte a cor, maior o risco. Toque no seu bairro.',
                  })}
                </p>
                <div className='flex items-center gap-2.5 mt-1 flex-wrap'>
                  {(
                    [
                      [
                        'FLOOD',
                        t('mapMicroapp.hazardFlood', {
                          defaultValue: 'Enchente',
                        }),
                      ],
                      [
                        'HEAT',
                        t('mapMicroapp.hazardHeat', { defaultValue: 'Calor' }),
                      ],
                      [
                        'LANDSLIDE',
                        t('mapMicroapp.hazardLandslide', {
                          defaultValue: 'Deslizamento',
                        }),
                      ],
                    ] as [keyof typeof TYPOLOGY_COLORS, string][]
                  ).map(([key, label]) => (
                    <span
                      key={key}
                      className='flex items-center gap-1 text-[9px] text-muted-foreground'
                    >
                      <span
                        className='w-2.5 h-2.5 rounded-sm'
                        style={{ backgroundColor: TYPOLOGY_COLORS[key] }}
                      />
                      {label}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          )}
        {/* Basemap toggle — CBO site step only (satellite to recognize the place,
            or back to the political map). */}
        {params.allowDeferSite &&
          isComposite &&
          compositeStep === 'assets' &&
          !tourActive && (
            <div className='absolute top-2 right-2 z-[900] flex rounded-md overflow-hidden border border-foreground/15 shadow-sm text-[10px] font-medium'>
              <button
                onClick={() => setBasemap('satellite')}
                className={`px-2 py-1 ${basemap === 'satellite' ? 'bg-primary text-primary-foreground' : 'bg-background/90 text-foreground hover:bg-muted'}`}
                data-testid='map-basemap-satellite'
              >
                {t('mapMicroapp.basemapSatellite', {
                  defaultValue: 'Satélite',
                })}
              </button>
              <button
                onClick={() => setBasemap('political')}
                className={`px-2 py-1 border-l border-foreground/15 ${basemap === 'political' ? 'bg-primary text-primary-foreground' : 'bg-background/90 text-foreground hover:bg-muted'}`}
                data-testid='map-basemap-political'
              >
                {t('mapMicroapp.basemapPolitical', { defaultValue: 'Mapa' })}
              </button>
            </div>
          )}
        {loading && (
          <div className='absolute inset-0 bg-background/70 flex items-center justify-center z-[1000]'>
            <div className='bg-background border rounded-lg px-4 py-3 shadow-lg flex items-center gap-2 text-xs text-muted-foreground'>
              <Loader2 className='w-4 h-4 animate-spin' /> {loadingStatus}
            </div>
          </div>
        )}

        {/* Simple site mode — the chooser overlay: ONE question, two big
            buttons; the search lives here too. Gone the moment a site exists. */}
        {simpleSite &&
          compositeStep === 'assets' &&
          !tourActive &&
          !hasSite &&
          simpleChoice !== 'map' && (
            <div className='absolute inset-0 z-[950] flex items-center justify-center bg-black/25 p-4'>
              <div
                className='bg-background rounded-xl shadow-xl border p-4 w-full max-w-xs space-y-2'
                data-testid='map-simple-chooser'
              >
                {simpleChoice === 'none' ? (
                  <>
                    <p className='text-sm font-medium text-center'>
                      {t('mapMicroapp.simpleHowFind', {
                        defaultValue: 'Como você quer achar o lugar?',
                      })}
                    </p>
                    <Button
                      className='w-full h-11 gap-2 text-sm'
                      onClick={() => setSimpleChoice('search')}
                      data-testid='map-simple-search'
                    >
                      <Search className='w-4 h-4' />
                      {t('mapMicroapp.simpleSearchName', {
                        defaultValue: 'Buscar pelo nome',
                      })}
                    </Button>
                    <Button
                      variant='outline'
                      className='w-full h-11 gap-2 text-sm'
                      onClick={() => setSimpleChoice('map')}
                      data-testid='map-simple-pin'
                    >
                      <MapPin className='w-4 h-4' />
                      {t('mapMicroapp.simplePinMap', {
                        defaultValue: 'Marcar no mapa',
                      })}
                    </Button>
                    {(bairroPlaces?.length ?? 0) > 0 && (
                      <div className='pt-1' data-testid='map-simple-places'>
                        <p className='text-[10px] uppercase tracking-wide text-muted-foreground text-center mb-1'>
                          {t('mapMicroapp.simpleKnownPlaces', {
                            defaultValue: 'ou toca num lugar conhecido do bairro',
                          })}
                        </p>
                        <div className='max-h-36 overflow-y-auto space-y-0.5'>
                          {bairroPlaces!.map((pl, i) => (
                            <button
                              key={i}
                              onClick={() => addCustomSite(pl.lat, pl.lng, pl.name)}
                              data-testid={`map-simple-place-${i}`}
                              className='flex items-center gap-2 w-full text-left px-2 py-1.5 rounded text-xs hover:bg-muted/60'
                            >
                              <span className='shrink-0'>{pl.emoji}</span>
                              <span className='truncate'>{pl.name}</span>
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </>
                ) : (
                  <>
                    <div className='flex items-center gap-1.5'>
                      <button
                        onClick={() => setSimpleChoice('none')}
                        className='text-muted-foreground px-1'
                        data-testid='map-simple-back'
                      >
                        ←
                      </button>
                      <Input
                        value={siteQuery}
                        onChange={e => setSiteQuery(e.target.value)}
                        onKeyDown={e => {
                          if (e.key === 'Enter') searchSites();
                        }}
                        placeholder={t('mapMicroapp.searchPlaceholder', {
                          defaultValue: 'Search a place name…',
                        })}
                        className='h-9 text-sm'
                        data-testid='map-simple-search-input'
                        autoFocus
                      />
                      <Button
                        size='sm'
                        className='h-9 text-xs'
                        onClick={searchSites}
                        disabled={siteSearching || !siteQuery.trim()}
                        data-testid='map-simple-search-btn'
                      >
                        {siteSearching ? (
                          <Loader2 className='w-3 h-3 animate-spin' />
                        ) : (
                          t('mapMicroapp.search', { defaultValue: 'Search' })
                        )}
                      </Button>
                    </div>
                    {siteResults.length > 0 && (
                      <div
                        className='max-h-40 overflow-y-auto space-y-0.5'
                        data-testid='map-simple-results'
                      >
                        {siteResults.map((r, i) => (
                          <button
                            key={i}
                            onClick={() => {
                              addCustomSite(r.centroid[0], r.centroid[1], r.name);
                              setSiteResults([]);
                              setSiteQuery('');
                            }}
                            data-testid={`map-simple-result-${i}`}
                            className='flex items-center gap-1.5 w-full text-left px-2 py-1.5 rounded text-xs hover:bg-muted/60'
                          >
                            <MapPin className='w-3 h-3 text-primary shrink-0' />
                            <span className='truncate'>{r.name}</span>
                          </button>
                        ))}
                      </div>
                    )}
                    <button
                      onClick={() => setSimpleChoice('map')}
                      className='w-full text-center text-xs text-primary underline pt-1'
                      data-testid='map-simple-notfound'
                    >
                      {t('mapMicroapp.simpleNotFound', {
                        defaultValue: 'Não achei — prefiro marcar no mapa',
                      })}
                    </button>
                  </>
                )}
              </div>
            </div>
          )}

        {/* Simple site mode, map path: one instruction, nothing else. Solid
            card below the basemap toggle — the first translucent version was
            unreadable over satellite imagery (JVP video 2026-07-16). */}
        {simpleSite &&
          compositeStep === 'assets' &&
          simpleChoice === 'map' &&
          !hasSite && (
            <div
              className='absolute top-12 left-1/2 -translate-x-1/2 z-[900] bg-background border rounded-xl px-4 py-2.5 text-sm font-medium text-center shadow-lg max-w-[90%]'
              data-testid='map-simple-tap-banner'
            >
              📍{' '}
              {t('mapMicroapp.simpleTapToMark', {
                defaultValue: 'Toque no lugar exato pra marcar',
              })}
              <button
                onClick={() => setSimpleChoice('search')}
                className='block w-full text-xs font-normal text-primary underline mt-0.5'
              >
                {t('mapMicroapp.simpleOrSearch', {
                  defaultValue: 'ou buscar pelo nome',
                })}
              </button>
            </div>
          )}
      </div>

      {/* Selection list */}
      {totalSelections > 0 && (
        <div className='border-t px-3 py-1.5 max-h-20 overflow-y-auto shrink-0'>
          <div className='flex flex-wrap gap-1'>
            {selectedAssets.map((asset, i) => {
              // Simple site mode: the bairro is a fixed frame, not a removable
              // selection — only the picked place shows as a chip.
              if (simpleSite && asset.type === 'zone') return null;
              const visual = asset.source ? OSM_VISUALS[asset.source] : null;
              return (
                <Badge
                  key={i}
                  variant='secondary'
                  className='text-[9px] h-5 gap-1'
                >
                  {asset.type === 'zone'
                    ? '📍'
                    : asset.type === 'custom'
                      ? '✏️'
                      : visual?.emoji || '📌'}
                  <span className='max-w-[120px] truncate'>{asset.name}</span>
                  {asset.rasterValues &&
                    Object.keys(asset.rasterValues).length > 0 && (
                      <span className='text-emerald-500 text-[8px]'>
                        {Object.values(asset.rasterValues)
                          .map(v => v.toFixed(2))
                          .join(' ')}
                      </span>
                    )}
                  <button onClick={() => removeAsset(i)}>
                    <X className='w-2.5 h-2.5' />
                  </button>
                </Badge>
              );
            })}
          </div>
        </div>
      )}

      {/* Action bar */}
      <div className='flex items-center gap-2 px-3 py-2 border-t bg-background shrink-0'>
        {tourActive ? (
          /* Hazard tour: advance flood→heat→landslide, then hand off to
             neighborhood selection. Below it, the way out of "I see colors but
             I don't know what they mean" — the tour's only other control. */
          <div className='flex flex-col gap-1.5 w-full'>
            <Button
              size='sm'
              className='h-7 text-xs gap-1 w-full'
              onClick={advanceTour}
              data-testid='map-tour-next'
            >
              {tourIdx < tourLayers.length - 1 ? (
                <>
                  {t('mapMicroapp.tourNext', { defaultValue: 'Próximo risco' })}{' '}
                  <ChevronRight className='w-3 h-3' />
                </>
              ) : (
                <>
                  {t('mapMicroapp.tourToZone', {
                    defaultValue: 'Escolher meu bairro',
                  })}{' '}
                  <ChevronRight className='w-3 h-3' />
                </>
              )}
            </Button>
            <Button
              size='sm'
              variant='outline'
              className='h-7 text-xs w-full'
              onClick={() => setHelpOpen(true)}
              data-testid='map-tour-howto'
            >
              {t('mapMicroapp.howToRead', {
                defaultValue: 'Como ler este mapa',
              })}
            </Button>
          </div>
        ) : isBrowseOnly ? (
          /* Browse-only mode (E2 needs-help): single CTA back to chat. No
             confirm because the user isn't committing to anything. */
          <Button
            size='sm'
            className='h-7 text-xs gap-1 flex-1'
            onClick={onCancel}
            data-testid='map-back-to-chat'
          >
            ← {t('mapMicroapp.backToChat', { defaultValue: 'Voltar ao chat' })}
          </Button>
        ) : (
          <>
            <Button
              variant='ghost'
              size='sm'
              className='h-7 text-xs'
              data-testid={
                isComposite && compositeStep === 'assets' && !params.focusZone
                  ? 'map-back-to-zones'
                  : 'map-cancel'
              }
              onClick={
                isComposite && compositeStep === 'assets' && !params.focusZone
                  ? backToZones
                  : onCancel
              }
            >
              {isComposite && compositeStep === 'assets' && !params.focusZone
                ? '← ' +
                  (isNeighborhoods
                    ? t('mapMicroapp.neighborhood')
                    : t('mapMicroapp.zone'))
                : t('mapMicroapp.cancel')}
            </Button>
            {isComposite && compositeStep === 'zone' ? (
              params.confirmAtZone ? (
                /* E2 linear flow: the bairro session ends at the zone step —
                   no "Próximo (sites)", the site gets its own session. */
                <Button
                  size='sm'
                  className='h-7 text-xs gap-1 flex-1'
                  onClick={confirmZoneOnly}
                  disabled={!selectedAssets.some(a => a.type === 'zone')}
                  data-testid='map-confirm-bairro'
                >
                  <Check className='w-3 h-3' />{' '}
                  {/* Name the bairro when we pre-selected it. "Confirmar bairro"
                      is unfalsifiable — you can't disagree with a label that
                      doesn't say what it's confirming, and the value came from
                      whatever an orchestrator typed at invite time. */}
                  {selectedZoneName
                    ? t('mapMicroapp.confirmBairroNamed', {
                        bairro: selectedZoneName,
                        defaultValue: 'Confirmar {{bairro}}',
                      })
                    : t('mapMicroapp.confirmBairro', {
                        defaultValue: 'Confirmar bairro',
                      })}
                </Button>
              ) : (
                <Button
                  size='sm'
                  className='h-7 text-xs gap-1 flex-1'
                  onClick={advanceToAssets}
                  disabled={!selectedAssets.some(a => a.type === 'zone')}
                >
                  {t('mapMicroapp.nextSites')}{' '}
                  <ChevronRight className='w-3 h-3' />
                </Button>
              )
            ) : isComposite &&
              compositeStep === 'assets' &&
              params.allowDeferSite ? (
              /* E2 site step: a real site → Confirm; no site yet → "usar o bairro
             todo" (commit the neighborhood, defer the site). Gated to the CBO
             map step so the city/concept-note composite flow is unaffected. */
              hasSite ? (
                <Button
                  size='sm'
                  className='h-7 text-xs gap-1 flex-1'
                  onClick={handleConfirm}
                  data-testid='map-confirm-site'
                >
                  <Check className='w-3 h-3' />{' '}
                  {simpleSite
                    ? t('mapMicroapp.confirmPlace', {
                        defaultValue: 'Confirmar lugar',
                      })
                    : t('mapMicroapp.confirm', { count: totalSelections })}
                </Button>
              ) : params.focusZone ? (
                /* Focused site session (E2 linear): the user already said they
                   HAVE a place — no whole-bairro escape here; the "don't have a
                   site" paths (pedir apoio / voltar depois) live in the chat. */
                <Button
                  size='sm'
                  className='h-7 text-xs gap-1 flex-1'
                  disabled
                  data-testid='map-confirm-site'
                >
                  <Check className='w-3 h-3' />{' '}
                  {t('mapMicroapp.confirmPlace', {
                    defaultValue: 'Confirmar lugar',
                  })}
                </Button>
              ) : (
                <Button
                  size='sm'
                  variant='outline'
                  className='h-7 text-xs gap-1 flex-1'
                  onClick={confirmDeferred}
                  data-testid='map-use-whole-bairro'
                >
                  {t('mapMicroapp.useWholeBairro', {
                    defaultValue: 'Usar o bairro todo',
                  })}
                </Button>
              )
            ) : (
              <Button
                size='sm'
                className='h-7 text-xs gap-1 flex-1'
                onClick={handleConfirm}
                disabled={totalSelections === 0}
              >
                <Check className='w-3 h-3' />{' '}
                {t('mapMicroapp.confirm', { count: totalSelections })}
              </Button>
            )}
          </>
        )}
      </div>

      {/* "Como ler este mapa" — swatches + caveats for the hazard on screen,
          read out of the same legend spec the gradient bar uses. Over the map
          (not in the chat) because on a phone the chat is a different tab: you
          cannot read about a color you cannot see. Rendered at the root so its
          scrim also covers the action bar — otherwise "Próximo risco" stays
          tappable behind the sheet. */}
      {tourActive && tourFamily && (
        <HazardLegendSheet
          open={helpOpen}
          family={tourFamily}
          spec={legends[tourLayers[tourIdx]]}
          lang={provLang}
          onClose={() => setHelpOpen(false)}
          onAskAgent={
            onAskMapHelp
              ? () => {
                  setHelpOpen(false);
                  onAskMapHelp(
                    tourFamily,
                    describeRamp(legends[tourLayers[tourIdx]])
                  );
                }
              : undefined
          }
        />
      )}
    </div>
  );
}

/**
 * Orchestrator portfolio preview — diagnostic-pipeline view (Phase 1 demo).
 *
 * Shape of the view:
 *   Left (map, ~60% on desktop)     Right (CBO cards, scrollable)
 *
 * Each card surfaces where each community-based organization is in the CBO
 * profile diagnostic (see `shared/cbo-schema.ts`): phase reached, sections
 * complete (of 7), intervention chosen (or not), COUGAR maturity total
 * (of 27), priority flags met (of 6). Hovering a card highlights its marker
 * on the map; hovering a marker highlights its card. All data is hardcoded —
 * Phase 3 will wire this to a real portfolio endpoint.
 *
 * See docs/ROLE-ARCHITECTURE.md.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { useTranslation } from 'react-i18next';
import { motion } from 'framer-motion';
import {
  ArrowLeft, Check, Clock, Compass, Copy, Droplets, Eye, Leaf, LifeBuoy, Lightbulb, MapPin, Target,
  Mountain, Network, Paperclip, Plus, RotateCcw, Sprout, Trash2, Trees, Unlock, Waves,
} from 'lucide-react';
import { Card, CardContent } from '@/core/components/ui/card';
import { Button } from '@/core/components/ui/button';
import { TitleLarge, BodyMedium, BodySmall } from '@oef/components';
import { useToast } from '@/core/hooks/use-toast';
import { useResetRole } from '@/core/contexts/role-context';
import { useCohort } from '@/core/hooks/useCohort';
import { useLocation } from 'wouter';
import type { CohortMember, WorkshopConfig } from '@shared/cohort-schema';
import { TYPOLOGY_COLORS, zoneRiskOpacity } from '@shared/risk-display';
import {
  InviteCboDialog,
  ShareLinkDialog,
  BulkInviteSummaryDialog,
  ResetConfirmDialog,
  DeleteCohortConfirmDialog,
  ProvisionCohortDialog,
  type BulkInviteResult,
} from '@/core/components/orchestrator/CohortDialogs';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/core/components/ui/select';
import { WorkshopCadence } from '@/core/components/orchestrator/WorkshopCadence';
import { SupportInbox } from '@/core/components/orchestrator/SupportInbox';
import { LanguageSwitcher } from '@/core/components/i18n/language-switcher';
import { DataProvenanceDialog } from '@/core/components/maps/DataProvenanceDialog';
import type { ProvenanceKey } from '@shared/data-provenance';
import { CboFilesDrawer, type FilesDrawerMember, type CboDrawerTab } from '@/core/components/orchestrator/CboFilesDrawer';

// ---------------------------------------------------------------------------
// Data model — mirrors shared/cbo-schema.ts fields relevant to a portfolio
// coordinator. Kept local to this stub; when Phase 3 lands, the shape will
// move to shared/ and be populated from a server endpoint.
// ---------------------------------------------------------------------------

/** CBO profile phase keys — matches the shape in shared/cbo-schema.ts. */
type PhaseKey = 'who' | 'where' | 'building' | 'impact' | 'operations' | 'needs' | 'results';

type InterventionKey =
  | 'bioswales'
  | 'flood-parks'
  | 'urban-forests'
  | 'green-corridors'
  | 'wetlands'
  | 'slope-stabilization';

type Tone = 'flood' | 'heat' | 'landslide' | 'biodiversity';

type CboDemoProject = {
  id: string;
  name: { en: string; pt: string };
  neighborhood: string;
  /** Latitude, longitude. `null` means Phase 1 — site not yet plotted. */
  coords: [number, number] | null;
  currentPhase: PhaseKey;
  /** Of 7 total CBO_SECTIONS (org, site, 3a/b/c, needs, results). */
  sectionsComplete: number;
  /** `null` means the CBO has not chosen an intervention yet (before 3a). */
  interventionKey: InterventionKey | null;
  /** 0..27 — sum across 9 COUGAR maturity metrics scored 0..3. */
  maturityScore: number;
  /** 0..6 — priority flags met (per shared/cbo-schema.PRIORITY_FLAG_DEFINITIONS). */
  priorityFlagsMet: number;
  updatedDaysAgo: number;
  /** i18n key for the 'next action' line on the card. */
  nextActionKey: string;
  /** Project-readiness triage from E1 — drives a chip on the card so the
   *  coordinator sees who has a selected project (has-project) vs an idea
   *  (has-idea) vs who needs more hand-holding (needs-help). Null until E1's
   *  set_path tool fires. */
  path: 'has-project' | 'has-idea' | 'needs-help' | null;
  /** Count of unresolved RequestSupport entries — surfaces an amber chip
   *  on the card so the coordinator can sweep pendencies daily. */
  supportPendingCount: number;
  /** How many files this CBO has uploaded — drives the 📎 chip + files drawer. */
  documentCount: number;
  /** E2 "usar o bairro todo": the org committed a neighborhood but deferred the
   *  exact site (coords are the bairro centroid). Drives an amber chip and is
   *  excluded from the sites-mapped KPI. */
  siteDeferred: boolean;
};

const TOTAL_SECTIONS = 7;
const TOTAL_FLAGS = 6;
const TOTAL_MATURITY = 27;

// Build a member's invite/profile URL, preferring the unguessable capability
// token over the legacy org-name slug (Phase 3a). Falls back to the slug for
// any member that predates the token backfill.
function memberInviteUrl(m: { capabilityToken?: string | null; memberSlug?: string | null }): string {
  const base = window.location.origin;
  return m.capabilityToken
    ? `${base}/cbo-profile?t=${m.capabilityToken}`
    : `${base}/cbo-profile?cbo=${m.memberSlug}`;
}

// Adapter: convert a CohortMember (server or sample) into the view-model the
// existing card + map render from. Keeps the rendering code path single while
// data source changes.
const PHASE_TO_KEY: Record<number, PhaseKey> = {
  1: 'who', 2: 'where', 3: 'building', 4: 'needs', 5: 'results',
};
const NEXT_ACTION_KEY: Record<number, string> = {
  0: 'orchestrator.demo.nextAction.beginProfile',
  1: 'orchestrator.demo.nextAction.beginProfile',
  2: 'orchestrator.demo.nextAction.completeIntervention',
  3: 'orchestrator.demo.nextAction.completeIntervention',
  4: 'orchestrator.demo.nextAction.reviewNeeds',
  5: 'orchestrator.demo.nextAction.publishScorecard',
};

function memberToView(m: CohortMember): CboDemoProject {
  const sm = m as CohortMember & {
    displayName?: { en: string; pt: string };
    derivedSectionsComplete?: number;
  };
  const updatedAt = m.snapshotUpdatedAt ? new Date(m.snapshotUpdatedAt) : null;
  const daysAgo = updatedAt
    ? Math.max(0, Math.floor((Date.now() - updatedAt.getTime()) / 86400000))
    : 0;
  const phaseNum = m.snapshotPhase ?? 1;
  // Coords come from the structured E2 site commit (member.site.coordinates,
  // [lat,lng] centroid) — the previous read (`sm.coords`) was a field nothing
  // populates, so the cohort map rendered zero markers for live cohorts.
  const site = m.site ?? null;
  return {
    id: m.id,
    name: sm.displayName ?? { en: m.orgName, pt: m.orgName },
    neighborhood: m.neighborhood ?? '',
    coords: site?.coordinates ?? null,
    currentPhase: PHASE_TO_KEY[phaseNum] ?? 'who',
    // Server-derived from the live cbo_state (attachDerivedSections); the raw
    // snapshot column is only written by a PATCH no client sends, so it reads
    // 0 forever. Snapshot kept as fallback for pre-derivation payloads.
    sectionsComplete: sm.derivedSectionsComplete ?? m.snapshotSectionsComplete ?? 0,
    interventionKey: (m.snapshotIntervention as InterventionKey | null) ?? null,
    maturityScore: m.snapshotMaturityScore ?? 0,
    priorityFlagsMet: m.snapshotFlagsMet ?? 0,
    updatedDaysAgo: daysAgo,
    nextActionKey: NEXT_ACTION_KEY[phaseNum] ?? NEXT_ACTION_KEY[1],
    path: (m.path as 'has-project' | 'has-idea' | 'needs-help' | null | undefined) ?? null,
    supportPendingCount: Array.isArray((m as any).supportRequests)
      ? ((m as any).supportRequests as { resolvedAt: string | null }[]).filter(r => !r.resolvedAt).length
      : 0,
    documentCount: (m as any).documentCount ?? 0,
    siteDeferred: site?.deferred === true,
  };
}

// Intervention → icon + tone (color family). Mirrors the landing showcase.
const INTERVENTION_META: Record<InterventionKey, { Icon: typeof Leaf; tone: Tone }> = {
  'bioswales':           { Icon: Leaf,     tone: 'flood' },
  'flood-parks':         { Icon: Droplets, tone: 'flood' },
  'urban-forests':       { Icon: Trees,    tone: 'heat' },
  'green-corridors':     { Icon: Sprout,   tone: 'biodiversity' },
  'wetlands':            { Icon: Waves,    tone: 'flood' },
  'slope-stabilization': { Icon: Mountain, tone: 'landslide' },
};

const TONE_STYLES: Record<Tone, { bubble: string; fg: string; ring: string; marker: string }> = {
  flood:        { bubble: 'bg-sky-50 dark:bg-sky-950/40',         fg: 'text-sky-600 dark:text-sky-300',         ring: 'ring-sky-400',         marker: '#0284c7' },
  heat:         { bubble: 'bg-amber-50 dark:bg-amber-950/40',     fg: 'text-amber-600 dark:text-amber-300',     ring: 'ring-amber-400',       marker: '#d97706' },
  landslide:    { bubble: 'bg-orange-50 dark:bg-orange-950/40',   fg: 'text-orange-600 dark:text-orange-300',   ring: 'ring-orange-400',      marker: '#ea580c' },
  biodiversity: { bubble: 'bg-emerald-50 dark:bg-emerald-950/40', fg: 'text-emerald-600 dark:text-emerald-300', ring: 'ring-emerald-400',     marker: '#059669' },
};

// Maturity band: 0..27 → 'emerging' / 'developing' / 'building' / 'mature'
function maturityBand(score: number): 'emerging' | 'developing' | 'building' | 'mature' {
  if (score >= 21) return 'mature';
  if (score >= 14) return 'building';
  if (score >= 7)  return 'developing';
  return 'emerging';
}

const BAND_CHIP: Record<ReturnType<typeof maturityBand>, string> = {
  emerging:   'bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-900/40 dark:text-slate-300 dark:border-slate-700',
  developing: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800',
  building:   'bg-sky-50 text-sky-700 border-sky-200 dark:bg-sky-950/40 dark:text-sky-300 dark:border-sky-800',
  mature:     'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800',
};

// ---------------------------------------------------------------------------
// Risk layer styling — neighborhood choropleth keyed by priorityScore from
// `porto-alegre-neighborhood-zones.json`. Bands are derived from the
// distribution in that file (scores ~0..2.5+); colors progress from green to
// red so the eye lands first on the urgent recruitment targets.
// ---------------------------------------------------------------------------
// The coordinator risk map shows ONE view at a time over the always-on bairro
// outlines: a hazard RASTER overlay (flood / heat / landslide) or the
// neighborhood RISK choropleth (composite priority). Exclusive — one at a time,
// clicking the active one turns it off (just the outlines + CBO markers remain).
type RiskView = 'flood' | 'heat' | 'landslide' | 'risk';

// Hazard raster overlays, fed LIVE from the data catalog via the tile proxy.
// All three = the catalog poa_<haz>_HAZARD (gap-free, covers the whole territory,
// unlike the sparse H×E×V risk composite). The landslide hazard tiles are now
// published publicly (they were briefly 403 — fixed on the catalog side).
const HAZARD_RASTER: Record<'flood' | 'heat' | 'landslide', { url: string; attribution: string }> = {
  flood:     { url: '/api/geospatial/tiles/poa_flood_hazard/{z}/{x}/{y}.png',     attribution: 'OEF catalog · flood hazard (interpolated)' },
  heat:      { url: '/api/geospatial/tiles/poa_heat_hazard/{z}/{x}/{y}.png',      attribution: 'OEF catalog · heat hazard' },
  landslide: { url: '/api/geospatial/tiles/poa_landslide_hazard/{z}/{x}/{y}.png', attribution: 'OEF catalog · landslide hazard' },
};

// Legend color ramps that MATCH each catalog overlay's actual colormap (sampled
// from the tiles), so the intensity bar reflects what's painted on the map:
// flood = viridis (purple→yellow); heat + landslide = green→yellow→red (RdYlGn).
const HAZARD_RAMPS: Record<'flood' | 'heat' | 'landslide', string[]> = {
  flood:     ['#440154', '#414487', '#2a788e', '#22a884', '#7ad151', '#fde725'],
  heat:      ['#1a9850', '#a6d96a', '#ffffbf', '#fdae61', '#d73027'],
  landslide: ['#1a9641', '#a6d96a', '#ffffbf', '#fdae61', '#d7191c'],
};

// City-wide min/max of the per-zone max-hazard mean, for normalizing the 'risk'
// choropleth opacity (same approach as the site-explorer). Filled when the
// bairro layer is built.
type RiskRange = { min: number; max: number };
function zoneMaxRisk(p: any): number {
  return Math.max(p?.meanFlood || 0, p?.meanHeat || 0, p?.meanLandslide || 0);
}

// Bairro polygon style. Always outlined. In the 'risk' view it fills with the
// site-explorer encoding — HUE = typology (which risk), OPACITY = how risky
// (normalized to the city's range) — so the most at-risk bairros read strongest.
// In a hazard view it's outline-only so the raster reads underneath.
function bairroStyle(feat: any, view: RiskView | null, range: RiskRange): L.PathOptions {
  if (view === 'risk') {
    const p = feat?.properties || {};
    const norm = (zoneMaxRisk(p) - range.min) / ((range.max - range.min) || 0.01);
    // Landslide-prone TERRAIN (susceptibility) is shown as a brown dashed outline
    // ON TOP of the primary-risk fill — so a heat-dominant morro reads "heat +
    // landslide-prone", not "landslide". (Landslide risk is too low to be primary.)
    const prone = !!p.landslideSusceptible;
    return {
      color: prone ? TYPOLOGY_COLORS.LANDSLIDE : '#ffffff',
      weight: prone ? 2 : 1 + Math.max(0, Math.min(1, norm)) * 1.5,
      dashArray: prone ? '4 3' : undefined,
      opacity: 0.9,
      fillColor: TYPOLOGY_COLORS[p.typologyLabel] || TYPOLOGY_COLORS.LOW,
      fillOpacity: zoneRiskOpacity(norm),
    };
  }
  return { color: '#475569', weight: 1, opacity: 0.85, fillOpacity: 0 };
}

// ---------------------------------------------------------------------------
// Map panel — CartoDB Positron base + CBO markers + toggleable risk overlays
// (composite hotspot raster, bairro choropleth). Selected state synced with
// the right-rail cards via `selectedId` / `onSelect`.
// ---------------------------------------------------------------------------
function MapPanel({
  projects,
  selectedId,
  onSelect,
  activeRisk,
  onBairroClick,
}: {
  projects: CboDemoProject[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  activeRisk: RiskView | null;
  onBairroClick: (info: { name: string; primaryHazard: string; population: number; priorityScore: number }) => void;
}) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const markersRef = useRef<Map<string, L.Marker>>(new Map());
  const rasterLayerRef = useRef<L.TileLayer | null>(null);
  const recruitLayerRef = useRef<L.GeoJSON | null>(null);
  const neighborhoodCacheRef = useRef<any>(null);
  // City-wide risk range for the 'risk' choropleth opacity normalization.
  const riskRangeRef = useRef<RiskRange>({ min: 0, max: 1 });
  // Latest activeRisk for the async layer-build closure (the bairro GeoJSON
  // loads once; this lets the first build style itself for the current view).
  const activeRiskRef = useRef(activeRisk);
  useEffect(() => { activeRiskRef.current = activeRisk; }, [activeRisk]);

  // Stable refs for callbacks so adding/removing layers doesn't remount the map.
  const onSelectRef = useRef(onSelect);
  useEffect(() => { onSelectRef.current = onSelect; }, [onSelect]);
  const onBairroClickRef = useRef(onBairroClick);
  useEffect(() => { onBairroClickRef.current = onBairroClick; }, [onBairroClick]);

  // Mount the map once.
  useEffect(() => {
    if (!mapRef.current || mapInstanceRef.current) return;

    const map = L.map(mapRef.current, {
      zoomControl: true,
      attributionControl: true,
      scrollWheelZoom: false, // keep page scrollable — zoom via + / –
    });
    L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
      subdomains: 'abcd',
      attribution: '© <a href="https://carto.com/attributions">CARTO</a> · © <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      maxZoom: 19,
    }).addTo(map);

    const mapped = projects.filter(p => p.coords);
    if (mapped.length > 0) {
      const bounds = L.latLngBounds(mapped.map(p => p.coords!));
      map.fitBounds(bounds, { padding: [48, 48], maxZoom: 13 });
    } else {
      map.setView([-30.03, -51.22], 11); // fallback to Porto Alegre center
    }

    mapInstanceRef.current = map;

    for (const p of mapped) {
      const tone = p.interventionKey ? INTERVENTION_META[p.interventionKey].tone : 'biodiversity';
      const color = TONE_STYLES[tone].marker;
      const icon = L.divIcon({
        className: 'orch-marker',
        html: `<div class="orch-marker-inner" data-id="${p.id}" style="--m:${color}"></div>`,
        iconSize: [24, 24],
        iconAnchor: [12, 12],
      });
      const marker = L.marker(p.coords!, { icon })
        .bindTooltip(p.name.en, { direction: 'top', offset: [0, -14], className: 'orch-marker-tip' })
        .addTo(map);

      // Defer handlers to refs so identity is stable.
      marker.on('click',     () => onSelectRef.current(p.id));
      marker.on('mouseover', () => onSelectRef.current(p.id));
      marker.on('mouseout',  () => onSelectRef.current(null));

      markersRef.current.set(p.id, marker);
    }

    return () => {
      map.remove();
      mapInstanceRef.current = null;
      markersRef.current.clear();
      rasterLayerRef.current = null;
      recruitLayerRef.current = null;
    };
    // Intentionally run once; projects is stable demo data.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Drive the selected class on the marker DOM from props.
  useEffect(() => {
    markersRef.current.forEach((marker, id) => {
      const el = marker.getElement();
      if (!el) return;
      el.classList.toggle('orch-marker-selected', id === selectedId);
    });
  }, [selectedId]);

  // Neighborhoods are ALWAYS shown — outlined bairro polygons under the markers.
  // Built once from the zones JSON (cached). Styling reacts to activeRisk in a
  // separate effect below (outline-only for a hazard raster; filled for 'risk').
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;
    let cancelled = false;

    const buildLayer = (fc: any) => {
      if (!mapInstanceRef.current || cancelled || recruitLayerRef.current) return;
      // City-wide risk range, for the 'risk' choropleth opacity (site-explorer parity).
      const risks = (fc.features ?? []).map((f: any) => zoneMaxRisk(f?.properties));
      riskRangeRef.current = { min: Math.min(...risks, 0), max: Math.max(...risks, 0.01) };
      const layer = L.geoJSON(fc, {
        style: (feat: any) => bairroStyle(feat, activeRiskRef.current, riskRangeRef.current),
        onEachFeature: (feat: any, lyr: L.Layer) => {
          const p = feat.properties || {};
          const name: string = p.neighbourhoodName || 'Unknown';
          const hazard: string = (p.primaryHazard || '').toString();
          const pop: number = Math.round(p.populationTotal || 0);
          const score: number = +p.priorityScore || 0;
          // Landslide-prone terrain → also recommend slope stabilization (additive to
          // the dominant-risk intervention). Surfaced even when heat is the primary risk.
          const proneHtml = p.landslideSusceptible
            ? `<br/><span style="color:${TYPOLOGY_COLORS.LANDSLIDE}">▨ landslide-prone · slope stabilization</span>`
            : '';
          const tipHtml = `<b>${name}</b><br/>${hazard ? hazard.toLowerCase() + ' risk · ' : ''}${pop.toLocaleString()} people<br/>priority ${score.toFixed(2)}${proneHtml}`;
          // Anchored (not sticky): a sticky tooltip follows the pointer and its
          // per-layer mouseout→close doesn't reliably fire when crossing a shared
          // bairro border, so tooltips pile up unreadably (ORCH-1). Anchor it to
          // the bairro and close it explicitly on mouseout.
          (lyr as L.Path).bindTooltip(tipHtml, { direction: 'top', className: 'orch-marker-tip' });
          lyr.on('click', () => onBairroClickRef.current({ name, primaryHazard: hazard, population: pop, priorityScore: score }));
          lyr.on('mouseover', () => (lyr as L.Path).setStyle({ weight: 2.5, color: '#0f172a' }));
          lyr.on('mouseout', () => {
            (lyr as L.Path).setStyle(bairroStyle(feat, activeRiskRef.current, riskRangeRef.current));
            (lyr as L.Path).closeTooltip();
          });
        },
      });
      layer.addTo(mapInstanceRef.current);
      layer.bringToBack(); // under the CBO markers so cards stay clickable
      recruitLayerRef.current = layer;
    };

    if (neighborhoodCacheRef.current) {
      buildLayer(neighborhoodCacheRef.current);
    } else {
      fetch('/sample-data/porto-alegre-neighborhood-zones.json')
        .then(r => r.ok ? r.json() : null)
        .then(data => {
          if (cancelled || !data?.geoJson) return;
          neighborhoodCacheRef.current = data.geoJson;
          buildLayer(data.geoJson);
        })
        .catch(() => {});
    }

    return () => { cancelled = true; };
  }, []);

  // Restyle the always-on bairro layer when the view changes (fill on 'risk',
  // outline-only otherwise). bringToBack keeps the raster/markers ordering right.
  useEffect(() => {
    const layer = recruitLayerRef.current;
    if (!layer) return;
    layer.setStyle((feat: any) => bairroStyle(feat, activeRisk, riskRangeRef.current));
    layer.bringToBack();
  }, [activeRisk]);

  // Exclusive hazard raster overlay (flood / heat / landslide). Swaps on change;
  // removed entirely for the 'risk' choropleth view or when nothing is active.
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;
    if (rasterLayerRef.current) {
      map.removeLayer(rasterLayerRef.current);
      rasterLayerRef.current = null;
    }
    if (activeRisk && activeRisk !== 'risk') {
      const cfg = HAZARD_RASTER[activeRisk];
      rasterLayerRef.current = L.tileLayer(cfg.url, {
        opacity: 0.6,
        maxNativeZoom: 14,
        attribution: cfg.attribution,
      }).addTo(map);
    }
  }, [activeRisk]);

  return (
    <div className="relative h-full w-full overflow-hidden rounded-xl border border-foreground/10 bg-muted">
      <div ref={mapRef} className="absolute inset-0" />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Risk view controls — overlay top-right of the map. FOUR exclusive views over
// the always-on neighborhoods: Flood / Heat / Landslide hazard rasters + the
// composite Risk-by-neighborhood choropleth. One at a time; click the active to
// turn it off. Legend adapts to the active view.
// ---------------------------------------------------------------------------
function MapLayerControls({
  active,
  onChange,
}: {
  active: RiskView | null;
  onChange: (next: RiskView | null) => void;
}) {
  const { t, i18n } = useTranslation();
  const provLang: 'en' | 'pt' = i18n.language?.startsWith('pt') ? 'pt' : 'en';
  const VIEWS: Array<{ id: RiskView; label: string; dot: string }> = [
    { id: 'flood',     label: t('orchestrator.map.flood', { defaultValue: 'Flood hazard' }),         dot: '#2563eb' },
    { id: 'heat',      label: t('orchestrator.map.heat', { defaultValue: 'Heat hazard' }),           dot: '#dc2626' },
    { id: 'landslide', label: t('orchestrator.map.landslide', { defaultValue: 'Landslide hazard' }), dot: '#a16207' },
    { id: 'risk',      label: t('orchestrator.map.riskByBairro', { defaultValue: 'Risk by neighborhood' }), dot: '#8b5cf6' },
  ];
  return (
    <div className="absolute top-3 right-3 z-[400] rounded-lg border border-foreground/10 bg-background/90 backdrop-blur-sm px-2.5 py-2 shadow-md text-xs w-[196px]">
      <div className="font-medium text-foreground/80 uppercase tracking-wide text-[10px] px-0.5 pb-1.5">
        {t('orchestrator.map.riskView', { defaultValue: 'Risk view' })}
      </div>
      <div className="space-y-1">
        {VIEWS.map(v => {
          const on = active === v.id;
          return (
            <button
              key={v.id}
              type="button"
              onClick={() => onChange(on ? null : v.id)}
              aria-pressed={on}
              data-testid={`risk-view-${v.id}`}
              // Active view fills with its own accent color + white text so the
              // selection is unmistakable (bold alone wasn't enough).
              style={on ? { backgroundColor: v.dot, borderColor: v.dot } : undefined}
              className={`w-full flex items-center gap-2 rounded-md border px-2 py-1.5 text-left transition-all ${
                on
                  ? 'text-white font-semibold shadow-md'
                  : 'border-foreground/10 text-foreground/75 hover:bg-foreground/[0.05]'
              }`}
            >
              <span
                className={`inline-block w-2.5 h-2.5 rounded-full shrink-0 ${on ? 'ring-2 ring-white/70' : ''}`}
                style={{ background: on ? '#ffffff' : v.dot }}
              />
              <span className="leading-tight">{v.label}</span>
              {on && <Check className="w-3.5 h-3.5 ml-auto shrink-0" strokeWidth={3} />}
            </button>
          );
        })}
      </div>

      {active === 'risk' && (
        <div className="pt-1.5 mt-1.5 border-t border-foreground/5 space-y-0.5">
          <div className="text-[9px] uppercase tracking-wide text-muted-foreground">
            {t('orchestrator.map.zonePriority', { defaultValue: 'Zone priority' })}
          </div>
          {([
            ['FLOOD', t('orchestrator.map.flood', { defaultValue: 'Flood' })],
            ['HEAT', t('orchestrator.map.heat', { defaultValue: 'Heat' })],
            ['FLOOD_HEAT', t('orchestrator.map.multiHazard', { defaultValue: 'Multi-hazard' })],
          ] as const).map(([key, label]) => (
            <div key={key} className="flex items-center gap-1.5">
              <span className="inline-block w-3 h-3 rounded-sm" style={{ background: TYPOLOGY_COLORS[key] }} />
              <span className="text-[10px] text-muted-foreground">{label}</span>
            </div>
          ))}
          {/* Landslide is a SUSCEPTIBILITY (terrain) flag, not a primary risk —
              shown as a dashed brown outline on the morros, distinct from the fill. */}
          <div className="flex items-center gap-1.5">
            <span className="inline-block w-3 h-3 rounded-sm border-2 border-dashed" style={{ borderColor: TYPOLOGY_COLORS.LANDSLIDE }} />
            <span className="text-[10px] text-muted-foreground">{t('orchestrator.map.landslideProne', { defaultValue: 'Landslide-prone terrain' })}</span>
          </div>
          <div className="text-[9px] text-muted-foreground/80 pt-0.5">
            {t('orchestrator.map.intensityNote', { defaultValue: 'Stronger fill = higher risk' })}
          </div>
        </div>
      )}
      {active && active !== 'risk' && (
        <div className="pt-1.5 mt-1.5 border-t border-foreground/5">
          <div className="text-[9px] uppercase tracking-wide text-muted-foreground mb-1">
            {t('orchestrator.map.hazardIntensity', { defaultValue: 'Hazard intensity' })}
          </div>
          {/* Gradient mirrors the selected overlay's actual colormap (flood = viridis,
              heat/landslide = green→red) so the legend matches the map. */}
          <div
            className="h-2 rounded-full"
            style={{ background: `linear-gradient(to right, ${HAZARD_RAMPS[active].join(', ')})` }}
          />
          <div className="flex justify-between text-[9px] text-muted-foreground mt-0.5">
            <span>{t('orchestrator.map.low', { defaultValue: 'low' })}</span>
            <span>{t('orchestrator.map.high', { defaultValue: 'high' })}</span>
          </div>
        </div>
      )}
      {/* "Where this data comes from" — same shared dialog as the CBO map. */}
      <div className="pt-1.5 mt-1.5 border-t border-foreground/5">
        <DataProvenanceDialog
          lang={provLang}
          className="w-full justify-center"
          entries={['flood', 'heat', 'landslide', 'neighborhoods'] as ProvenanceKey[]}
        />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Portfolio card — replaces the old funding-oriented card.
// ---------------------------------------------------------------------------
function ProjectCard({
  project,
  locale,
  selected,
  onHover,
  onOpen,
  onOpenCbo,
}: {
  project: CboDemoProject;
  locale: 'en' | 'pt';
  selected: boolean;
  onHover: (id: string | null) => void;
  onOpen: (p: CboDemoProject) => void;
  onOpenCbo: (p: CboDemoProject, tab: 'arquivos' | 'conversa' | 'perfil') => void;
}) {
  const { t } = useTranslation();
  const hasIntervention = project.interventionKey !== null;
  const tone: Tone = hasIntervention
    ? INTERVENTION_META[project.interventionKey!].tone
    : 'biodiversity';
  const toneStyle = TONE_STYLES[tone];
  const Icon = hasIntervention
    ? INTERVENTION_META[project.interventionKey!].Icon
    : Sprout;
  const band = maturityBand(project.maturityScore);
  const sectionsPct = Math.round((project.sectionsComplete / TOTAL_SECTIONS) * 100);

  return (
    <div
      role="button"
      tabIndex={0}
      className="group text-left w-full cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-foreground/30 rounded-xl"
      onMouseEnter={() => onHover(project.id)}
      onMouseLeave={() => onHover(null)}
      onFocus={() => onHover(project.id)}
      onClick={() => onOpen(project)}
      onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen(project); } }}
      data-testid={`card-orchestrator-project-${project.id}`}
    >
      <Card
        className={`transition-all duration-200 ${
          selected ? `ring-2 ${toneStyle.ring} shadow-lg` : 'group-hover:shadow-md'
        }`}
      >
        <CardContent className="p-5 space-y-4">
          {/* Header */}
          <div className="flex items-start gap-3">
            <div
              className={`shrink-0 w-10 h-10 rounded-lg flex items-center justify-center ${toneStyle.bubble} ${toneStyle.fg}`}
            >
              <Icon className="w-5 h-5" strokeWidth={1.75} />
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="text-sm font-semibold tracking-tight truncate">
                {project.name[locale]}
              </h3>
              <div className="flex items-center gap-1 text-xs text-muted-foreground mt-0.5">
                <MapPin className="w-3 h-3" />
                <span>{project.neighborhood}</span>
                {!project.coords && (
                  <span className="ml-1.5 inline-flex items-center text-[10px] font-medium uppercase tracking-wide px-1.5 py-0.5 rounded-full border border-foreground/15 bg-background text-foreground/60">
                    {t('orchestrator.demo.locationPending')}
                  </span>
                )}
                {project.coords && project.siteDeferred && (
                  <span className="ml-1.5 inline-flex items-center text-[10px] font-medium uppercase tracking-wide px-1.5 py-0.5 rounded-full border border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400">
                    {t('orchestrator.demo.siteDeferred', { defaultValue: 'Site TBD — neighborhood level' })}
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Phase + Path + Intervention row */}
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center text-[10px] font-medium uppercase tracking-wide px-2 py-0.5 rounded-full border border-foreground/10 bg-foreground/5 text-foreground/75">
              {t(`orchestrator.demo.phase.${project.currentPhase}`)}
            </span>
            {project.path && (
              <span
                className="inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border border-emerald-200/60 dark:border-emerald-900/40"
                title={project.path === 'has-project'
                  ? t('orchestrator.demo.path.hasProjectFull', { defaultValue: 'CBO arrived with a selected, scoped NBS project — more mature / implementer-ready' })
                  : project.path === 'has-idea'
                    ? t('orchestrator.demo.path.hasIdeaFull', { defaultValue: 'CBO arrived with a specific NBS project idea in mind' })
                    : t('orchestrator.demo.path.needsHelpFull', { defaultValue: 'CBO wants help discovering a project — needs more hand-holding' })}
              >
                {project.path === 'has-project'
                  ? <Target className="w-3 h-3" strokeWidth={2} />
                  : project.path === 'has-idea'
                    ? <Lightbulb className="w-3 h-3" strokeWidth={2} />
                    : <Compass className="w-3 h-3" strokeWidth={2} />}
                {project.path === 'has-project'
                  ? t('orchestrator.demo.path.hasProject', { defaultValue: 'Projeto definido' })
                  : project.path === 'has-idea'
                    ? t('orchestrator.demo.path.hasIdea', { defaultValue: 'Tem ideia' })
                    : t('orchestrator.demo.path.needsHelp', { defaultValue: 'Quer descobrir' })}
              </span>
            )}
            {project.supportPendingCount > 0 && (
              <span
                className="inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border border-amber-200/60 dark:border-amber-900/40"
                title={t('orchestrator.demo.support.pendingTooltip', {
                  defaultValue: '{{n}} pedido(s) de apoio aguardando',
                  n: project.supportPendingCount,
                })}
              >
                <LifeBuoy className="w-3 h-3" strokeWidth={2} />
                {t('orchestrator.demo.support.pendingChip', {
                  defaultValue: '{{n}} pedência(s)',
                  n: project.supportPendingCount,
                })}
              </span>
            )}
            {project.documentCount > 0 && (
              <button
                type="button"
                onClick={e => { e.stopPropagation(); onOpenCbo(project, 'arquivos'); }}
                className="inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full bg-sky-50 dark:bg-sky-950/40 text-sky-700 dark:text-sky-300 border border-sky-200/60 dark:border-sky-900/40 hover:bg-sky-100 dark:hover:bg-sky-900/50 transition-colors"
                title={t('orchestrator.files.chipTooltip', { defaultValue: '{{n}} file(s) shared — tap to view', n: project.documentCount })}
                data-testid={`button-cbo-files-${project.id}`}
              >
                <Paperclip className="w-3 h-3" strokeWidth={2} />
                {project.documentCount}
              </button>
            )}
            <button
              type="button"
              onClick={e => { e.stopPropagation(); onOpenCbo(project, 'perfil'); }}
              className="inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full border border-foreground/15 text-foreground/70 hover:bg-foreground/5 transition-colors"
              title={t('orchestrator.cboView.openTooltip', { defaultValue: 'View conversation + profile' })}
              data-testid={`button-cbo-view-${project.id}`}
            >
              <Eye className="w-3 h-3" strokeWidth={2} />
              {t('orchestrator.cboView.open', { defaultValue: 'View' })}
            </button>
            {hasIntervention ? (
              <span
                className={`inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full border ${toneStyle.bubble} ${toneStyle.fg} border-foreground/10`}
              >
                <Icon className="w-3 h-3" strokeWidth={2} />
                {t(`orchestrator.demo.intervention.${project.interventionKey}`)}
              </span>
            ) : (
              <span className="inline-flex items-center text-[11px] font-medium px-2 py-0.5 rounded-full border border-dashed border-foreground/20 text-muted-foreground">
                {t('orchestrator.demo.intervention.notChosen')}
              </span>
            )}
          </div>

          {/* Sections progress */}
          <div>
            <div className="flex items-center justify-between text-xs mb-1.5">
              <span className="text-muted-foreground">{t('orchestrator.demo.sectionsLabel')}</span>
              <span className="font-medium text-foreground/80">
                {t('orchestrator.demo.sectionsCount', {
                  done: project.sectionsComplete,
                  total: TOTAL_SECTIONS,
                })}
              </span>
            </div>
            <div className="h-1.5 rounded-full bg-foreground/5 overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-500 ${
                  hasIntervention ? 'bg-emerald-500' : 'bg-foreground/30'
                }`}
                style={{ width: `${sectionsPct}%` }}
              />
            </div>
          </div>

          {/* Maturity + flags row */}
          <div className="flex items-center justify-between gap-2">
            <span
              className={`inline-flex items-center text-[11px] font-semibold px-2 py-1 rounded-md border ${BAND_CHIP[band]}`}
              title={t('orchestrator.demo.maturityTooltip')}
            >
              {project.maturityScore}/{TOTAL_MATURITY} · {t(`orchestrator.demo.maturityBand.${band}`)}
            </span>
            <span className="text-xs text-muted-foreground">
              {t('orchestrator.demo.flagsCount', {
                met: project.priorityFlagsMet,
                total: TOTAL_FLAGS,
              })}
            </span>
          </div>

          {/* Next action + updated */}
          <div className="pt-3 border-t border-foreground/5 space-y-1.5">
            <div className="flex items-center gap-2 text-xs">
              <Check className="w-3 h-3 text-foreground/50" />
              <span className="text-foreground/80">{t(project.nextActionKey)}</span>
            </div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Clock className="w-3 h-3" />
              <span>
                {project.updatedDaysAgo === 0
                  ? t('orchestrator.demo.updatedJust')
                  : t('orchestrator.demo.updatedAgo', { count: project.updatedDaysAgo })}
              </span>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------
export default function OrchestratorLandingPage() {
  const { t, i18n } = useTranslation();
  const switchRole = useResetRole();
  const { toast } = useToast();
  const locale: 'en' | 'pt' = i18n.language?.startsWith('pt') ? 'pt' : 'en';

  const [selectedId, setSelectedId] = useState<string | null>(null);
  // Active risk view on the coordinator map (one at a time). Defaults to flood —
  // the primary POA hazard — so the map lands on something meaningful.
  const [activeRisk, setActiveRisk] = useState<RiskView | null>('flood');

  // Phase 3c-ii — require a coordinator session. On 401, bounce to login.
  // `authed`: null = checking, false = redirecting, true = render the dashboard.
  const [, navigate] = useLocation();
  const [authed, setAuthed] = useState<boolean | null>(null);
  useEffect(() => {
    let cancelled = false;
    fetch('/api/coordinator/me', { credentials: 'include' })
      .then(r => { if (!cancelled) { if (r.ok) setAuthed(true); else { setAuthed(false); navigate('/coordinator-login'); } } })
      .catch(() => { if (!cancelled) { setAuthed(false); navigate('/coordinator-login'); } });
    return () => { cancelled = true; };
  }, [navigate]);

  const handleBairroClick = (info: { name: string; primaryHazard: string; population: number; priorityScore: number }) => {
    // For this PR: surface a toast describing the bairro. The follow-up PR
    // (once #132's invite dialog is on main) wires this into a pre-filled
    // "Invite a CBO" flow so the recruit zone → invitation step is one click.
    const hazardLabel = info.primaryHazard
      ? t(`orchestrator.map.hazard.${info.primaryHazard.toLowerCase()}`, {
          defaultValue: info.primaryHazard.toLowerCase().replace(/_/g, ' + '),
        })
      : '';
    toast({
      title: t('orchestrator.map.recruitFrom', {
        defaultValue: 'Recruit from {{name}}',
        name: info.name,
      }),
      description: t('orchestrator.map.recruitDesc', {
        defaultValue: '{{hazard}} risk · {{pop}} people · priority {{score}}',
        hazard: hazardLabel || 'mixed',
        pop: info.population.toLocaleString(),
        score: info.priorityScore.toFixed(2),
      }),
    });
  };

  const {
    cohort, members, isAdmin, allCohorts,
    invite, unlockPhase, saveWorkshops, resetCohort, saveLanguage, deleteCohort,
    switchCohort, provisionCohort,
  } = useCohort();
  const cohortLanguage = (cohort?.settings as { language?: 'pt' | 'en' } | null)?.language ?? null;

  const projects = useMemo(() => members.map(memberToView), [members]);
  const memberById = useMemo(() => new Map(members.map(m => [m.id, m])), [members]);

  // Initialize the inbox badge from already-loaded members so it lights up
  // before the user opens the drawer. SupportInbox re-counts on open.
  useEffect(() => {
    setSupportInboxPendingCount(projects.reduce((sum, p) => sum + p.supportPendingCount, 0));
  }, [projects]);

  // Default the coordinator console to the cohort's forced language. When a PT
  // cohort loads, the orchestrator UI shows in Portuguese (matching what the
  // CBOs see) without the coordinator having to flip the header switcher. We
  // apply this ONCE per cohort id, so a manual switch afterwards wins; switching
  // to another cohort re-applies that cohort's language.
  const appliedLangForCohort = useRef<string | null>(null);
  useEffect(() => {
    if (!cohort?.id || !cohortLanguage) return;
    if (appliedLangForCohort.current === cohort.id) return;
    appliedLangForCohort.current = cohort.id;
    if (i18n.language?.startsWith(cohortLanguage)) return;
    i18n.changeLanguage(cohortLanguage);
  }, [cohort?.id, cohortLanguage, i18n]);

  const stats = useMemo(() => {
    // Deferred sites ("usar o bairro todo") have centroid coords for the map
    // but are not a mapped SITE — counting them would overstate E2 completion.
    const sitesMapped = projects.filter(p => p.coords && !p.siteDeferred).length;
    const profilesInProgress = projects.filter(
      p => p.sectionsComplete > 0 && p.sectionsComplete < TOTAL_SECTIONS
    ).length;
    const profilesComplete = projects.filter(p => p.sectionsComplete === TOTAL_SECTIONS).length;
    return { sitesMapped, profilesInProgress, profilesComplete, total: projects.length };
  }, [projects]);

  // Dialog state
  const [inviteOpen, setInviteOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [shareUrl, setShareUrl] = useState<string>('');
  const [shareContext, setShareContext] = useState<
    | { kind: 'cbo'; orgName: string }
    | null
  >(null);
  const [bulkSummaryOpen, setBulkSummaryOpen] = useState(false);
  const [bulkInvitations, setBulkInvitations] = useState<BulkInviteResult[]>([]);
  const [resetConfirmOpen, setResetConfirmOpen] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [provisionOpen, setProvisionOpen] = useState(false);
  const [supportInboxOpen, setSupportInboxOpen] = useState(false);
  // Mirrored from /support-requests?status=pending — drives the badge on
  // the inbox trigger. Initialized from member.supportRequests when the
  // cohort loads (below).
  const [supportInboxPendingCount, setSupportInboxPendingCount] = useState(0);
  // Which CBO the coordinator is inspecting (null = drawer closed) + which tab.
  const [filesMember, setFilesMember] = useState<FilesDrawerMember | null>(null);
  const [filesTab, setFilesTab] = useState<CboDrawerTab>('arquivos');

  const openShare = (url: string, ctx: typeof shareContext) => {
    setShareUrl(url);
    setShareContext(ctx);
    setShareOpen(true);
  };

  // Open the unified per-CBO panel. The invite link/message now lives in the
  // panel's Convite tab, so clicking a CBO card opens here (not the share modal).
  // The share modal is kept only for the just-created new-invite moment.
  const openCbo = (p: CboDemoProject, tab: CboDrawerTab) => {
    const member = memberById.get(p.id);
    const inviteUrl = member ? memberInviteUrl(member) : '';
    setFilesMember({ id: p.id, orgName: p.name[locale], inviteUrl });
    setFilesTab(tab);
  };

  const handleUnlockNext = async (member: CohortMember) => {
    const current = Array.isArray(member.unlockedPhases) ? member.unlockedPhases : [1];
    const max = Math.max(0, ...current);
    const next = Math.min(5, max + 1);
    if (next === max) {
      toast({ title: t('orchestrator.cohort.allUnlocked', { defaultValue: 'All phases already unlocked' }) });
      return;
    }
    await unlockPhase([member.id], next);
    toast({ title: t('orchestrator.cohort.phaseUnlocked', { defaultValue: `Phase ${next} unlocked`, phase: next }) });
  };

  // Coordinator clicked "Open for cohort" on a specific workshop. Two things
  // happen together: (1) bulk-unlock the workshop's phase for every member,
  // (2) auto-stamp today's date into the workshop's `openedAt` so the cadence
  // accumulates a real timeline as it runs. Scheduled `date` is left alone.
  const handleOpenWorkshop = async (workshopIndex: number, todayISO: string) => {
    const workshop = (cohort?.settings as any)?.workshops?.[workshopIndex] as WorkshopConfig | undefined;
    if (!workshop) return;
    await unlockPhase('all', workshop.unlocksPhase);
    if (!workshop.openedAt) {
      const updated: WorkshopConfig[] = ((cohort?.settings as any)?.workshops ?? []).map(
        (w: WorkshopConfig, j: number) => (j === workshopIndex ? { ...w, openedAt: todayISO } : w),
      );
      await saveWorkshops(updated);
    }
    toast({
      title: t('orchestrator.cohort.workshopOpened', {
        defaultValue: `${workshop.name} opened for cohort`,
        workshop: workshop.name,
      }),
    });
  };

  const handleUpdateWorkshops = async (next: WorkshopConfig[]) => {
    await saveWorkshops(next);
  };

  const handleResetConfirm = async () => {
    setResetConfirmOpen(false);
    await resetCohort();
    toast({ title: t('orchestrator.cohort.resetDone', { defaultValue: 'Cohort reset' }) });
  };

  const handleDeleteConfirm = async () => {
    setDeleteConfirmOpen(false);
    await deleteCohort();
    toast({ title: t('orchestrator.cohort.deleteDone', { defaultValue: 'Cohort deleted' }) });
  };

  // Admin picked a different cohort from the switcher — load it into the board.
  const handleSwitchCohort = async (coordinatorSlug: string) => {
    if (!coordinatorSlug || coordinatorSlug === cohort?.coordinatorSlug) return;
    await switchCohort(coordinatorSlug);
    const picked = allCohorts.find(c => c.coordinatorSlug === coordinatorSlug);
    toast({
      title: t('orchestrator.cohort.switched', {
        defaultValue: 'Viewing {{name}}',
        name: picked?.name ?? '',
      }),
    });
  };

  // Admin created a coordinator + cohort. On success the hook already switched
  // the board to the new cohort; surface the login email so credentials can be
  // handed off immediately.
  const handleProvision = async (input: {
    coordinatorName?: string; email: string; password: string;
    cohortName: string; language?: 'pt' | 'en' | null;
  }) => {
    const res = await provisionCohort(input);
    if (res.ok) {
      toast({
        title: t('orchestrator.cohort.provisionDone', {
          defaultValue: 'Cohort created — {{email}} can log in now',
          email: res.coordinatorEmail ?? input.email,
        }),
      });
    }
    return res;
  };

  const handleInviteOpen = () => setInviteOpen(true);

  // Pure: just makes the invite. The post-success share dialog is wired
  // separately via onSingleSuccess so the bulk-invite loop doesn't trigger
  // N share dialogs (it uses onBulkComplete instead).
  const handleInviteSubmit = async (params: { orgName: string; neighborhood?: string }) => {
    const created = await invite(params);
    if (!created) {
      toast({ title: t('orchestrator.cohort.inviteFailed', { defaultValue: 'Could not create invitation' }) });
      return null;
    }
    return { memberSlug: created.memberSlug, capabilityToken: created.capabilityToken, orgName: created.orgName };
  };

  const handleSingleInviteSuccess = (result: { memberSlug: string; capabilityToken?: string | null; orgName: string }) => {
    openShare(
      memberInviteUrl(result),
      { kind: 'cbo', orgName: result.orgName },
    );
  };

  const workshops: WorkshopConfig[] = cohort?.settings?.workshops ?? [];

  // Hold the dashboard until the coordinator session is confirmed — avoids a
  // flash of (now-empty, 401'd) cohort data before the redirect to login.
  if (authed !== true) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-slate-50 to-white dark:from-slate-950 dark:to-background">
        <Compass className="w-5 h-5 text-muted-foreground animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen relative bg-gradient-to-b from-slate-50 via-white to-slate-50 dark:from-slate-950 dark:via-background dark:to-slate-950">
      {/* Header */}
      <header className="relative z-10 px-6 sm:px-10 py-6 border-b border-foreground/5 bg-background/40 backdrop-blur-sm">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-300 flex items-center justify-center">
              <Compass className="w-5 h-5" strokeWidth={1.75} />
            </div>
            <div>
              <BodySmall className="text-muted-foreground uppercase tracking-wide text-[11px]">
                {t('orchestrator.demo.headerEyebrow')}
              </BodySmall>
              <TitleLarge className="!text-lg tracking-tight">
                {t('orchestrator.demo.headerTitle')}
              </TitleLarge>
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            {/* Coordinator's own console language. Defaults to the cohort's
                forced language (see effect above) but the coordinator can flip
                it here — independent of the cohort/CBO language toggle below. */}
            <LanguageSwitcher variant="plain" />
            {cohort && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setSupportInboxOpen(true)}
                className="relative"
                data-testid="button-orchestrator-support-inbox"
                title={t('orchestrator.support.openInbox', { defaultValue: 'Pedidos de apoio' }) as string}
              >
                <LifeBuoy className="w-4 h-4 mr-1.5" />
                <span className="hidden sm:inline">{t('orchestrator.support.inboxLabel', { defaultValue: 'Apoio' })}</span>
                {supportInboxPendingCount > 0 && (
                  <span className="ml-1.5 inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 text-[10px] font-bold rounded-full bg-amber-100 text-amber-900 dark:bg-amber-900/50 dark:text-amber-200">
                    {supportInboxPendingCount}
                  </span>
                )}
              </Button>
            )}
            <Button variant="ghost" size="sm" onClick={switchRole} data-testid="button-orchestrator-switch-role">
              <ArrowLeft className="w-4 h-4 mr-2" />
              {t('orchestrator.switchRole')}
            </Button>
          </div>
        </div>
      </header>
      {cohort && (
        <SupportInbox
          open={supportInboxOpen}
          onOpenChange={setSupportInboxOpen}
          coordinatorSlug={cohort.coordinatorSlug}
          onCountChange={setSupportInboxPendingCount}
        />
      )}
      <CboFilesDrawer
        cohortSlug={cohort?.coordinatorSlug ?? null}
        member={filesMember}
        cohortLanguage={cohortLanguage}
        initialTab={filesTab}
        onClose={() => setFilesMember(null)}
      />

      <main className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 py-8 sm:py-10">
        {/* Cohort header — singleton model. One cohort for the pilot,
            no slug to manage. Reset (with confirmation) wipes members and
            restores the default workshop cadence. */}
        <div className="mb-6 rounded-xl border border-foreground/10 bg-card/60 px-4 py-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2 min-w-0">
              <span className="inline-flex items-center text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-full border border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300">
                {t('orchestrator.cohort.modePilot', { defaultValue: 'Pilot' })}
              </span>
              {/* Admin sees a switcher over every cohort; a scoped coordinator
                  just sees their own cohort's name. */}
              {isAdmin && allCohorts.length > 0 ? (
                <Select value={cohort?.coordinatorSlug ?? ''} onValueChange={handleSwitchCohort}>
                  <SelectTrigger
                    className="h-7 w-auto min-w-[150px] gap-1 border-foreground/10 text-sm font-medium"
                    data-testid="select-cohort-switcher"
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {allCohorts.map(c => (
                      <SelectItem
                        key={c.coordinatorSlug}
                        value={c.coordinatorSlug}
                        data-testid={`option-cohort-${c.coordinatorSlug}`}
                      >
                        {c.name}
                        {c.coordinatorName ? ` · ${c.coordinatorName}` : ''}
                        {` (${c.memberCount})`}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <span className="text-sm font-medium tracking-tight truncate">{cohort?.name ?? 'Vila Flores'}</span>
              )}
              {members.length > 0 && (
                <span className="text-[11px] text-muted-foreground">
                  {t('orchestrator.cohort.memberCount', {
                    defaultValue: '{{n}} CBOs',
                    n: members.length,
                  })}
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              {/* Forced cohort language — overrides each org's browser detection.
                  Auto = fall back to detection. */}
              <div
                className="inline-flex items-center rounded-md border border-foreground/10 overflow-hidden"
                title={t('orchestrator.cohort.languageTooltip', { defaultValue: 'Force the language for every org in this cohort (overrides their phone language)' })}
              >
                <span className="pl-2 pr-1 text-[10px] uppercase tracking-wide text-muted-foreground">
                  {t('orchestrator.cohort.language', { defaultValue: 'Lang' })}
                </span>
                {([['auto', null], ['pt', 'pt'], ['en', 'en']] as const).map(([label, val]) => {
                  const on = cohortLanguage === val;
                  const labelText = label === 'auto' ? t('orchestrator.cohort.langAuto', { defaultValue: 'Auto' }) : label.toUpperCase();
                  return (
                    <button
                      key={label}
                      type="button"
                      onClick={async () => {
                        await saveLanguage(val);
                        toast({
                          title: val
                            ? t('orchestrator.cohort.languageSet', { defaultValue: 'Cohort language: {{lang}}', lang: labelText })
                            : t('orchestrator.cohort.languageAutoSet', { defaultValue: 'Cohort language: auto (phone language)' }),
                        });
                      }}
                      data-testid={`button-cohort-lang-${label}`}
                      aria-pressed={on}
                      // Active = solid emerald + white so the selected language is
                      // unmistakable (the faint highlight read as "nothing happened").
                      className={`px-2.5 py-1 text-[11px] font-semibold transition-colors ${
                        on ? 'bg-emerald-600 text-white' : 'text-muted-foreground hover:bg-foreground/[0.06]'
                      }`}
                    >
                      {labelText}
                    </button>
                  );
                })}
              </div>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setResetConfirmOpen(true)}
                className="text-muted-foreground hover:text-foreground/80"
                data-testid="button-reset-cohort"
                title={t('orchestrator.cohort.resetTooltip', { defaultValue: 'Wipe members and restart' })}
              >
                <RotateCcw className="w-3.5 h-3.5 mr-1.5" />
                {t('orchestrator.cohort.reset', { defaultValue: 'Reset' })}
              </Button>
              {isAdmin && (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setDeleteConfirmOpen(true)}
                  className="text-muted-foreground hover:text-red-600"
                  data-testid="button-delete-cohort"
                  title={t('orchestrator.cohort.deleteTooltip', { defaultValue: 'Delete this cohort entirely' })}
                >
                  <Trash2 className="w-3.5 h-3.5 mr-1.5" />
                  {t('orchestrator.cohort.delete', { defaultValue: 'Delete cohort' })}
                </Button>
              )}
              {isAdmin && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setProvisionOpen(true)}
                  data-testid="button-new-cohort"
                  title={t('orchestrator.cohort.newTooltip', { defaultValue: 'Create a new cohort and its coordinator' })}
                >
                  <Plus className="w-3.5 h-3.5 mr-1.5" />
                  {t('orchestrator.cohort.new', { defaultValue: 'New cohort' })}
                </Button>
              )}
              <Button size="sm" onClick={handleInviteOpen} data-testid="button-invite-cbo">
                <Plus className="w-3.5 h-3.5 mr-1.5" />
                {t('orchestrator.cohort.invite', { defaultValue: 'Invite CBO' })}
              </Button>
            </div>
          </div>

          <WorkshopCadence
            workshops={workshops}
            onOpenWorkshop={handleOpenWorkshop}
            onUpdateWorkshops={handleUpdateWorkshops}
          />
        </div>


        {/* Aggregate stats — diagnostic pipeline */}
        <motion.div
          className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8"
          initial="hidden"
          animate="show"
          variants={{ hidden: {}, show: { transition: { staggerChildren: 0.08, delayChildren: 0.1 } } }}
        >
          {[
            { label: t('orchestrator.demo.pipeline.sitesMapped'),       value: `${stats.sitesMapped} / ${stats.total}` },
            { label: t('orchestrator.demo.pipeline.profilesInProgress'), value: `${stats.profilesInProgress} / ${stats.total}` },
            { label: t('orchestrator.demo.pipeline.profilesComplete'),  value: `${stats.profilesComplete} / ${stats.total}` },
          ].map((s, i) => (
            <motion.div
              key={i}
              variants={{ hidden: { opacity: 0, y: 8 }, show: { opacity: 1, y: 0, transition: { duration: 0.4 } } }}
            >
              <Card>
                <CardContent className="p-5">
                  <BodySmall className="text-muted-foreground uppercase tracking-wide text-[11px] mb-1">
                    {s.label}
                  </BodySmall>
                  <div className="text-2xl font-semibold tracking-tight">{s.value}</div>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </motion.div>

        {/* Section heading */}
        <div className="mb-5">
          <TitleLarge className="!text-xl tracking-tight mb-0.5">
            {t('orchestrator.demo.portfolioTitle')}
          </TitleLarge>
          <BodySmall className="text-muted-foreground">
            {t('orchestrator.demo.portfolioSubtitle')}
          </BodySmall>
        </div>

        {/* Map (full width) on top, participants list below. Presenting the map
            this way keeps the orgs' states off-screen (below the fold). */}
        <div className="flex flex-col gap-5">
          {/* Map — full width */}
          <div className="w-full">
            <div className="relative h-[56vh] md:h-[64vh] w-full">
              <MapPanel
                projects={projects}
                selectedId={selectedId}
                onSelect={setSelectedId}
                activeRisk={activeRisk}
                onBairroClick={handleBairroClick}
              />
              <MapLayerControls active={activeRisk} onChange={setActiveRisk} />
            </div>
          </div>

          {/* Participants — full-width list/grid below the map */}
          <div className="w-full grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {projects.map((p, i) => {
              const member = memberById.get(p.id);
              const maxUnlocked = Math.max(0, ...(member?.unlockedPhases ?? [1]));
              const canUnlockNext = maxUnlocked < 5;
              return (
                <motion.div
                  key={p.id}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.4, delay: 0.15 + i * 0.06 }}
                >
                  <ProjectCard
                    project={p}
                    locale={locale}
                    selected={selectedId === p.id}
                    onHover={setSelectedId}
                    onOpen={(p) => openCbo(p, 'convite')}
                    onOpenCbo={openCbo}
                  />
                  {member && (
                    <div className="mt-1.5 flex items-center justify-between gap-2 px-1 text-[11px] text-muted-foreground">
                      <span className="inline-flex items-center gap-1">
                        <Unlock className="w-3 h-3" />
                        {t('orchestrator.cohort.unlockedThrough', {
                          defaultValue: `Unlocked through Phase ${maxUnlocked}`,
                          phase: maxUnlocked,
                        })}
                      </span>
                      {canUnlockNext && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 px-2 text-[11px]"
                          onClick={(e) => { e.stopPropagation(); handleUnlockNext(member); }}
                          data-testid={`button-unlock-next-${p.id}`}
                        >
                          {t('orchestrator.cohort.unlockNext', { defaultValue: 'Unlock next phase' })}
                        </Button>
                      )}
                    </div>
                  )}
                </motion.div>
              );
            })}
          </div>
        </div>
      </main>

      {/* Cohort flow dialogs */}
      <ResetConfirmDialog
        open={resetConfirmOpen}
        onOpenChange={setResetConfirmOpen}
        onConfirm={handleResetConfirm}
      />
      <DeleteCohortConfirmDialog
        open={deleteConfirmOpen}
        onOpenChange={setDeleteConfirmOpen}
        onConfirm={handleDeleteConfirm}
      />
      <ProvisionCohortDialog
        open={provisionOpen}
        onOpenChange={setProvisionOpen}
        onSubmit={handleProvision}
      />
      <InviteCboDialog
        open={inviteOpen}
        onOpenChange={setInviteOpen}
        onSubmit={handleInviteSubmit}
        onSingleSuccess={handleSingleInviteSuccess}
        onBulkComplete={(results) => {
          if (results.length === 0) return;
          setBulkInvitations(results);
          setBulkSummaryOpen(true);
        }}
      />
      <ShareLinkDialog open={shareOpen} onOpenChange={setShareOpen} url={shareUrl} context={shareContext} cohortLanguage={cohortLanguage} />
      <BulkInviteSummaryDialog
        open={bulkSummaryOpen}
        onOpenChange={setBulkSummaryOpen}
        invitations={bulkInvitations}
        origin={typeof window !== 'undefined' ? window.location.origin : ''}
        cohortLanguage={cohortLanguage}
      />
    </div>
  );
}

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
  ArrowLeft, Check, Clock, Compass, Copy, Droplets, Leaf, MapPin,
  Mountain, Network, Plus, Sparkles, Sprout, Trees, Unlock, Users, Waves,
} from 'lucide-react';
import { Card, CardContent } from '@/core/components/ui/card';
import { Button } from '@/core/components/ui/button';
import { TitleLarge, BodyMedium, BodySmall } from '@oef/components';
import { useToast } from '@/core/hooks/use-toast';
import { useResetRole } from '@/core/contexts/role-context';
import { useCohort } from '@/core/hooks/useCohort';
import type { CohortMember, WorkshopConfig } from '@shared/cohort-schema';
import {
  CreateCohortDialog,
  LoadCohortDialog,
  InviteCboDialog,
  ShareLinkDialog,
} from '@/core/components/orchestrator/CohortDialogs';

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
};

const TOTAL_SECTIONS = 7;
const TOTAL_FLAGS = 6;
const TOTAL_MATURITY = 27;

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
  const sm = m as CohortMember & { displayName?: { en: string; pt: string }; coords?: [number, number] | null };
  const updatedAt = m.snapshotUpdatedAt ? new Date(m.snapshotUpdatedAt) : null;
  const daysAgo = updatedAt
    ? Math.max(0, Math.floor((Date.now() - updatedAt.getTime()) / 86400000))
    : 0;
  const phaseNum = m.snapshotPhase ?? 1;
  return {
    id: m.id,
    name: sm.displayName ?? { en: m.orgName, pt: m.orgName },
    neighborhood: m.neighborhood ?? '',
    coords: sm.coords ?? null,
    currentPhase: PHASE_TO_KEY[phaseNum] ?? 'who',
    sectionsComplete: m.snapshotSectionsComplete ?? 0,
    interventionKey: (m.snapshotIntervention as InterventionKey | null) ?? null,
    maturityScore: m.snapshotMaturityScore ?? 0,
    priorityFlagsMet: m.snapshotFlagsMet ?? 0,
    updatedDaysAgo: daysAgo,
    nextActionKey: NEXT_ACTION_KEY[phaseNum] ?? NEXT_ACTION_KEY[1],
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
type RiskLayers = {
  hotspots: boolean;     // composite_hotspot raster tiles
  recruitZones: boolean; // bairro choropleth by priorityScore
};

const PRIORITY_BANDS: Array<{ max: number; fill: string; label: string }> = [
  { max: 0.5, fill: '#86efac', label: 'low' },        // emerald-300
  { max: 1.0, fill: '#fde68a', label: 'medium' },     // amber-200
  { max: 1.5, fill: '#fb923c', label: 'high' },       // orange-400
  { max: Infinity, fill: '#ef4444', label: 'very high' }, // red-500
];

function priorityFill(score: number): string {
  for (const band of PRIORITY_BANDS) if (score <= band.max) return band.fill;
  return PRIORITY_BANDS[PRIORITY_BANDS.length - 1].fill;
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
  layers,
  onBairroClick,
}: {
  projects: CboDemoProject[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  layers: RiskLayers;
  onBairroClick: (info: { name: string; primaryHazard: string; population: number; priorityScore: number }) => void;
}) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const markersRef = useRef<Map<string, L.Marker>>(new Map());
  const hotspotsLayerRef = useRef<L.TileLayer | null>(null);
  const recruitLayerRef = useRef<L.GeoJSON | null>(null);
  const neighborhoodCacheRef = useRef<any>(null);

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
      hotspotsLayerRef.current = null;
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

  // Toggle the hotspot raster layer.
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;
    if (layers.hotspots && !hotspotsLayerRef.current) {
      hotspotsLayerRef.current = L.tileLayer('/tiles/composite_hotspot/{z}/{x}/{y}.png', {
        opacity: 0.65,
        maxNativeZoom: 14,
        attribution: 'OEF risk grid (250m)',
      }).addTo(map);
    } else if (!layers.hotspots && hotspotsLayerRef.current) {
      map.removeLayer(hotspotsLayerRef.current);
      hotspotsLayerRef.current = null;
    }
  }, [layers.hotspots]);

  // Toggle the bairro choropleth (priorityScore). GeoJSON loaded lazily +
  // cached in a ref so repeat toggles are instant.
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;
    let cancelled = false;

    if (layers.recruitZones && !recruitLayerRef.current) {
      const buildLayer = (fc: any) => {
        if (!mapInstanceRef.current || cancelled) return;
        const layer = L.geoJSON(fc, {
          style: (feat: any) => ({
            color: '#ffffff',
            weight: 1,
            opacity: 0.85,
            fillColor: priorityFill(feat?.properties?.priorityScore ?? 0),
            fillOpacity: 0.5,
          }),
          onEachFeature: (feat: any, lyr: L.Layer) => {
            const p = feat.properties || {};
            const name: string = p.neighbourhoodName || 'Unknown';
            const hazard: string = (p.primaryHazard || '').toString();
            const pop: number = Math.round(p.populationTotal || 0);
            const score: number = +p.priorityScore || 0;
            const tipHtml = `<b>${name}</b><br/>${hazard ? hazard.toLowerCase() + ' risk · ' : ''}${pop.toLocaleString()} people<br/>priority ${score.toFixed(2)}`;
            (lyr as L.Path).bindTooltip(tipHtml, { direction: 'top', className: 'orch-marker-tip', sticky: true });
            lyr.on('click', () => onBairroClickRef.current({ name, primaryHazard: hazard, population: pop, priorityScore: score }));
            lyr.on('mouseover', () => (lyr as L.Path).setStyle({ weight: 2.5, color: '#0f172a' }));
            lyr.on('mouseout', () => (lyr as L.Path).setStyle({ weight: 1, color: '#ffffff' }));
          },
        });
        layer.addTo(mapInstanceRef.current);
        // Send the choropleth underneath the CBO markers so cards stay clickable.
        layer.bringToBack();
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
    } else if (!layers.recruitZones && recruitLayerRef.current) {
      map.removeLayer(recruitLayerRef.current);
      recruitLayerRef.current = null;
    }

    return () => { cancelled = true; };
  }, [layers.recruitZones]);

  return (
    <div className="relative h-[420px] md:h-full w-full overflow-hidden rounded-xl border border-foreground/10 bg-muted">
      <div ref={mapRef} className="absolute inset-0" />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Layer controls — small overlay top-right of the map. Toggles each risk
// overlay; expands to show a band legend when the choropleth is on.
// ---------------------------------------------------------------------------
function MapLayerControls({
  layers,
  onChange,
}: {
  layers: RiskLayers;
  onChange: (next: RiskLayers) => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="absolute top-3 right-3 z-[400] rounded-lg border border-foreground/10 bg-background/90 backdrop-blur-sm px-3 py-2.5 shadow-md text-xs space-y-1.5 w-[200px]">
      <div className="font-medium text-foreground/80 uppercase tracking-wide text-[10px]">
        {t('orchestrator.map.riskOverlays', { defaultValue: 'Risk overlays' })}
      </div>
      <label className="flex items-center gap-2 cursor-pointer select-none">
        <input
          type="checkbox"
          checked={layers.recruitZones}
          onChange={(e) => onChange({ ...layers, recruitZones: e.target.checked })}
          className="h-3.5 w-3.5 accent-red-500"
          data-testid="toggle-recruit-zones"
        />
        <span className="text-foreground/90">
          {t('orchestrator.map.recruitZones', { defaultValue: 'Recruit zones (bairros)' })}
        </span>
      </label>
      <label className="flex items-center gap-2 cursor-pointer select-none">
        <input
          type="checkbox"
          checked={layers.hotspots}
          onChange={(e) => onChange({ ...layers, hotspots: e.target.checked })}
          className="h-3.5 w-3.5 accent-amber-500"
          data-testid="toggle-hotspots"
        />
        <span className="text-foreground/90">
          {t('orchestrator.map.hotspots', { defaultValue: 'Hazard hotspots (250m)' })}
        </span>
      </label>

      {layers.recruitZones && (
        <div className="pt-1.5 mt-1 border-t border-foreground/5 space-y-0.5">
          <div className="text-[9px] uppercase tracking-wide text-muted-foreground">
            {t('orchestrator.map.priorityScore', { defaultValue: 'Priority score' })}
          </div>
          {PRIORITY_BANDS.map((b, i) => (
            <div key={i} className="flex items-center gap-1.5">
              <span className="inline-block w-3 h-3 rounded-sm" style={{ background: b.fill }} />
              <span className="text-[10px] text-muted-foreground">
                {i === 0 ? `≤ ${b.max.toFixed(1)}` :
                 i === PRIORITY_BANDS.length - 1 ? `> ${PRIORITY_BANDS[i - 1].max.toFixed(1)}` :
                 `${PRIORITY_BANDS[i - 1].max.toFixed(1)} – ${b.max.toFixed(1)}`}
              </span>
            </div>
          ))}
        </div>
      )}
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
}: {
  project: CboDemoProject;
  locale: 'en' | 'pt';
  selected: boolean;
  onHover: (id: string | null) => void;
  onOpen: (p: CboDemoProject) => void;
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
    <button
      type="button"
      className="group text-left w-full focus:outline-none focus-visible:ring-2 focus-visible:ring-foreground/30 rounded-xl"
      onMouseEnter={() => onHover(project.id)}
      onMouseLeave={() => onHover(null)}
      onFocus={() => onHover(project.id)}
      onClick={() => onOpen(project)}
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
              </div>
            </div>
          </div>

          {/* Phase + Intervention row */}
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center text-[10px] font-medium uppercase tracking-wide px-2 py-0.5 rounded-full border border-foreground/10 bg-foreground/5 text-foreground/75">
              {t(`orchestrator.demo.phase.${project.currentPhase}`)}
            </span>
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
    </button>
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
  const [riskLayers, setRiskLayers] = useState<RiskLayers>({ hotspots: false, recruitZones: false });

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
    mode, cohort, members, coordinatorSlug,
    createCohort, loadCohort, invite, unlockPhase,
  } = useCohort();

  const projects = useMemo(() => members.map(memberToView), [members]);
  const memberById = useMemo(() => new Map(members.map(m => [m.id, m])), [members]);

  const stats = useMemo(() => {
    const sitesMapped = projects.filter(p => p.coords).length;
    const profilesInProgress = projects.filter(
      p => p.sectionsComplete > 0 && p.sectionsComplete < TOTAL_SECTIONS
    ).length;
    const profilesComplete = projects.filter(p => p.sectionsComplete === TOTAL_SECTIONS).length;
    return { sitesMapped, profilesInProgress, profilesComplete, total: projects.length };
  }, [projects]);

  // Dialog state
  const [createOpen, setCreateOpen] = useState(false);
  const [loadOpen, setLoadOpen] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [shareUrl, setShareUrl] = useState<string>('');
  const [shareContext, setShareContext] = useState<
    | { kind: 'cbo'; orgName: string }
    | { kind: 'coordinator'; cohortName: string }
    | null
  >(null);

  const openShare = (url: string, ctx: typeof shareContext) => {
    setShareUrl(url);
    setShareContext(ctx);
    setShareOpen(true);
  };

  const openProject = (p: CboDemoProject) => {
    const member = memberById.get(p.id);
    if (mode === 'live' && member?.memberSlug) {
      openShare(
        `${window.location.origin}/cbo-profile?cbo=${member.memberSlug}`,
        { kind: 'cbo', orgName: member.orgName }
      );
      return;
    }
    toast({
      title: t('orchestrator.demo.toastTitle'),
      description: t('orchestrator.demo.toastBody', { project: p.name[locale] }),
    });
  };

  const handleUnlockNext = async (member: CohortMember) => {
    if (mode !== 'live') {
      toast({ title: t('orchestrator.cohort.sampleModeNotice', { defaultValue: 'Create a cohort to enable unlocks' }) });
      return;
    }
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

  const handleBulkUnlock = async (phase: number) => {
    if (mode !== 'live') {
      toast({ title: t('orchestrator.cohort.sampleModeNotice', { defaultValue: 'Create a cohort to enable unlocks' }) });
      return;
    }
    await unlockPhase('all', phase);
    toast({ title: t('orchestrator.cohort.bulkUnlocked', { defaultValue: `Phase ${phase} unlocked for cohort`, phase }) });
  };

  const handleInviteOpen = () => {
    if (mode !== 'live') {
      toast({ title: t('orchestrator.cohort.sampleModeNotice', { defaultValue: 'Create a cohort to invite CBOs' }) });
      return;
    }
    setInviteOpen(true);
  };

  const handleInviteSubmit = async (params: { orgName: string; neighborhood?: string; role: 'priority' | 'alternate' }) => {
    const created = await invite(params);
    if (!created) {
      toast({ title: t('orchestrator.cohort.inviteFailed', { defaultValue: 'Could not create invitation' }) });
      return null;
    }
    // Open the share dialog with the new CBO link.
    openShare(
      `${window.location.origin}/cbo-profile?cbo=${created.memberSlug}`,
      { kind: 'cbo', orgName: created.orgName }
    );
    return { memberSlug: created.memberSlug, orgName: created.orgName };
  };

  const handleCreateSubmit = async (name: string) => {
    await createCohort(name);
    toast({ title: t('orchestrator.cohort.created', { defaultValue: 'Cohort created' }) });
  };

  const handleLoadSubmit = async (slug: string) => {
    await loadCohort(slug);
  };

  const handleCopyCoordinatorLink = () => {
    if (!coordinatorSlug || !cohort) return;
    openShare(
      `${window.location.origin}/orchestrator?coord=${coordinatorSlug}`,
      { kind: 'coordinator', cohortName: cohort.name }
    );
  };

  const workshops: WorkshopConfig[] = cohort?.settings?.workshops ?? [];

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
          <Button variant="ghost" size="sm" onClick={switchRole} data-testid="button-orchestrator-switch-role">
            <ArrowLeft className="w-4 h-4 mr-2" />
            {t('orchestrator.switchRole')}
          </Button>
        </div>
      </header>

      <main className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 py-8 sm:py-10">
        {/* Cohort header — mode banner + actions */}
        <div className="mb-6 rounded-xl border border-foreground/10 bg-card/60 px-4 py-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <span className={`inline-flex items-center text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-full border ${
                mode === 'live'
                  ? 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300'
                  : 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300'
              }`}>
                {mode === 'live'
                  ? t('orchestrator.cohort.modeLive', { defaultValue: 'Live cohort' })
                  : t('orchestrator.cohort.modeSample', { defaultValue: 'Sample mode' })}
              </span>
              <span className="text-sm font-medium tracking-tight">{cohort?.name ?? '—'}</span>
            </div>
            <div className="flex items-center gap-2">
              {mode === 'live' ? (
                <>
                  <Button size="sm" variant="outline" onClick={handleCopyCoordinatorLink} data-testid="button-copy-coord-link">
                    <Copy className="w-3.5 h-3.5 mr-1.5" />
                    {t('orchestrator.cohort.copyCoordLink', { defaultValue: 'My link' })}
                  </Button>
                  <Button size="sm" onClick={handleInviteOpen} data-testid="button-invite-cbo">
                    <Plus className="w-3.5 h-3.5 mr-1.5" />
                    {t('orchestrator.cohort.invite', { defaultValue: 'Invite CBO' })}
                  </Button>
                </>
              ) : (
                <>
                  <Button size="sm" variant="outline" onClick={() => setLoadOpen(true)} data-testid="button-load-cohort">
                    {t('orchestrator.cohort.loadExisting', { defaultValue: 'Load existing' })}
                  </Button>
                  <Button size="sm" onClick={() => setCreateOpen(true)} data-testid="button-create-cohort">
                    <Plus className="w-3.5 h-3.5 mr-1.5" />
                    {t('orchestrator.cohort.create', { defaultValue: 'Create cohort' })}
                  </Button>
                </>
              )}
            </div>
          </div>

          {/* Workshop cadence strip */}
          {workshops.length > 0 && (
            <div className="mt-3 pt-3 border-t border-foreground/5">
              <div className="flex items-center justify-between mb-2">
                <BodySmall className="text-muted-foreground uppercase tracking-wide text-[10px]">
                  {t('orchestrator.cohort.workshops', { defaultValue: 'Workshop cadence' })}
                </BodySmall>
              </div>
              <div className="flex flex-wrap gap-2">
                {workshops.map((w, i) => (
                  <div
                    key={i}
                    className="flex items-center gap-2 rounded-lg border border-foreground/10 bg-background px-2.5 py-1.5"
                  >
                    <div className="flex flex-col">
                      <span className="text-[11px] font-medium leading-tight">{w.name}</span>
                      <span className="text-[10px] text-muted-foreground leading-tight">
                        {w.date ?? t('orchestrator.cohort.noDate', { defaultValue: 'no date' })}
                        {' · '}
                        {t('orchestrator.cohort.unlocksPhase', { defaultValue: 'unlocks P{{phase}}', phase: w.unlocksPhase })}
                      </span>
                    </div>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 px-2 text-[10px]"
                      onClick={() => handleBulkUnlock(w.unlocksPhase)}
                      data-testid={`button-bulk-unlock-${i}`}
                    >
                      <Unlock className="w-3 h-3 mr-1" />
                      {t('orchestrator.cohort.unlockForCohort', { defaultValue: 'Unlock for cohort' })}
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Co-design ribbon */}
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="mb-6 flex items-start gap-3 rounded-lg border border-amber-200 dark:border-amber-900 bg-amber-50 dark:bg-amber-950/30 px-4 py-3"
        >
          <Sparkles className="w-4 h-4 text-amber-600 dark:text-amber-300 mt-0.5 shrink-0" />
          <div className="flex-1">
            <BodySmall className="text-amber-900 dark:text-amber-200 font-medium">
              {t('orchestrator.demo.codesignBannerTitle')}
            </BodySmall>
            <BodySmall className="text-amber-900/80 dark:text-amber-200/80 mt-0.5 text-xs">
              {t('orchestrator.demo.codesignBannerBody')}
            </BodySmall>
          </div>
        </motion.div>

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

        {/* Map + cards */}
        <div className="flex flex-col md:flex-row gap-4 md:gap-6 md:items-stretch">
          {/* Map column — ~60% on desktop */}
          <div className="md:flex-[3] md:min-h-[640px]">
            <div className="relative h-[420px] md:h-full w-full">
              <MapPanel
                projects={projects}
                selectedId={selectedId}
                onSelect={setSelectedId}
                layers={riskLayers}
                onBairroClick={handleBairroClick}
              />
              <MapLayerControls layers={riskLayers} onChange={setRiskLayers} />
            </div>
          </div>

          {/* Card list column — ~40%, independently scrollable */}
          <div className="md:flex-[2] md:max-h-[640px] md:overflow-y-auto pr-1 space-y-3">
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
                    onOpen={openProject}
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

        {/* Feedback prompt */}
        <motion.div
          className="mt-10 rounded-xl border border-dashed border-foreground/15 bg-card/40 p-6 text-center"
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
        >
          <div className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-foreground/5 mb-3">
            <Users className="w-4 h-4 text-foreground/60" />
          </div>
          <TitleLarge className="!text-base tracking-tight mb-1">
            {t('orchestrator.demo.feedbackTitle')}
          </TitleLarge>
          <BodySmall className="text-muted-foreground max-w-xl mx-auto">
            {t('orchestrator.demo.feedbackBody')}
          </BodySmall>
        </motion.div>
      </main>

      {/* Cohort flow dialogs */}
      <CreateCohortDialog open={createOpen} onOpenChange={setCreateOpen} onSubmit={handleCreateSubmit} />
      <LoadCohortDialog open={loadOpen} onOpenChange={setLoadOpen} onSubmit={handleLoadSubmit} />
      <InviteCboDialog open={inviteOpen} onOpenChange={setInviteOpen} onSubmit={handleInviteSubmit} />
      <ShareLinkDialog open={shareOpen} onOpenChange={setShareOpen} url={shareUrl} context={shareContext} />
    </div>
  );
}

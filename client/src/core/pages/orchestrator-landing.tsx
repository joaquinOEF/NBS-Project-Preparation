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
  ArrowLeft, Check, Clock, Compass, Droplets, Leaf, MapPin, Mountain,
  Network, Sparkles, Sprout, Trees, Users, Waves,
} from 'lucide-react';
import { Card, CardContent } from '@/core/components/ui/card';
import { Button } from '@/core/components/ui/button';
import { TitleLarge, BodyMedium, BodySmall } from '@oef/components';
import { useToast } from '@/core/hooks/use-toast';
import { useResetRole } from '@/core/contexts/role-context';

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

const DEMO_PROJECTS: CboDemoProject[] = [
  {
    id: 'horta-cascata',
    name: { en: 'Horta Comunitária Cascata', pt: 'Horta Comunitária Cascata' },
    neighborhood: 'Cascata',
    coords: [-30.115, -51.178],
    currentPhase: 'needs',
    sectionsComplete: 4,
    interventionKey: 'bioswales',
    maturityScore: 15,
    priorityFlagsMet: 3,
    updatedDaysAgo: 2,
    nextActionKey: 'orchestrator.demo.nextAction.reviewNeeds',
  },
  {
    id: 'arquipelago-verde',
    name: { en: 'Coletivo Arquipélago Verde', pt: 'Coletivo Arquipélago Verde' },
    neighborhood: 'Arquipélago',
    coords: [-29.993, -51.263],
    currentPhase: 'building',
    sectionsComplete: 2,
    interventionKey: 'wetlands',
    maturityScore: 8,
    priorityFlagsMet: 2,
    updatedDaysAgo: 7,
    nextActionKey: 'orchestrator.demo.nextAction.completeIntervention',
  },
  {
    id: 'bosque-humaita',
    name: { en: 'Agentes do Bosque Humaitá', pt: 'Agentes do Bosque Humaitá' },
    neighborhood: 'Humaitá',
    coords: [-29.995, -51.195],
    currentPhase: 'results',
    sectionsComplete: 7,
    interventionKey: 'urban-forests',
    maturityScore: 22,
    priorityFlagsMet: 5,
    updatedDaysAgo: 1,
    nextActionKey: 'orchestrator.demo.nextAction.publishScorecard',
  },
  {
    id: 'restinga-nova',
    name: { en: 'Coletivo Restinga Nova', pt: 'Coletivo Restinga Nova' },
    neighborhood: 'Restinga',
    coords: null,
    currentPhase: 'who',
    sectionsComplete: 0,
    interventionKey: null,
    maturityScore: 0,
    priorityFlagsMet: 0,
    updatedDaysAgo: 0,
    nextActionKey: 'orchestrator.demo.nextAction.beginProfile',
  },
];

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
// Map panel — CartoDB Positron tiles, one marker per CBO with coords.
// Selected state is driven by `selectedId`; clicks and mouseovers call
// `onSelect`, which the parent also uses to sync card hover highlighting.
// ---------------------------------------------------------------------------
function MapPanel({
  projects,
  selectedId,
  onSelect,
}: {
  projects: CboDemoProject[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
}) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const markersRef = useRef<Map<string, L.Marker>>(new Map());

  // Keep a ref to the latest onSelect so we don't re-create the map when the
  // parent's callback identity changes.
  const onSelectRef = useRef(onSelect);
  useEffect(() => { onSelectRef.current = onSelect; }, [onSelect]);

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

  return (
    <div className="relative h-[420px] md:h-full w-full overflow-hidden rounded-xl border border-foreground/10 bg-muted">
      <div ref={mapRef} className="absolute inset-0" />
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

  const stats = useMemo(() => {
    const sitesMapped = DEMO_PROJECTS.filter(p => p.coords).length;
    const profilesInProgress = DEMO_PROJECTS.filter(
      p => p.sectionsComplete > 0 && p.sectionsComplete < TOTAL_SECTIONS
    ).length;
    const profilesComplete = DEMO_PROJECTS.filter(p => p.sectionsComplete === TOTAL_SECTIONS).length;
    return { sitesMapped, profilesInProgress, profilesComplete, total: DEMO_PROJECTS.length };
  }, []);

  const openProject = (p: CboDemoProject) => {
    toast({
      title: t('orchestrator.demo.toastTitle'),
      description: t('orchestrator.demo.toastBody', { project: p.name[locale] }),
    });
  };

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
            <MapPanel
              projects={DEMO_PROJECTS}
              selectedId={selectedId}
              onSelect={setSelectedId}
            />
          </div>

          {/* Card list column — ~40%, independently scrollable */}
          <div className="md:flex-[2] md:max-h-[640px] md:overflow-y-auto pr-1 space-y-3">
            {DEMO_PROJECTS.map((p, i) => (
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
              </motion.div>
            ))}
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
    </div>
  );
}

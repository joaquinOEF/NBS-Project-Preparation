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
import { WORRY_SUBTYPES } from '@shared/site-knowledge';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { useTranslation } from 'react-i18next';
import { BASEMAPS } from '@/core/lib/basemaps';
import { motion } from 'framer-motion';
import {
  ArrowLeft, BookOpen, Check, Compass, Droplets, Leaf, LifeBuoy, Target,
  Map as MapIcon, Mountain, Network, Plus, RotateCcw, Sprout, Trash2, Trees, Unlock, Waves,
  FileText, Loader2, Share2, Sparkles, Download, ChevronRight,
} from 'lucide-react';
import { Card, CardContent } from '@/core/components/ui/card';
import { Button } from '@/core/components/ui/button';
import {
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
} from '@/core/components/ui/tabs';
import {
  NbsSolutionsGrid,
  NbsCasesGrid,
} from '@/core/components/cbo/NbsDesktopGrids';
import { NBS_SHOWCASE_CARDS } from '@shared/nbs-showcase-cards';
import { TitleLarge, BodySmall } from '@oef/components';
import { useToast } from '@/core/hooks/use-toast';
import { RedeMark } from '@/core/components/RedeMark';
import { useResetRole } from '@/core/contexts/role-context';
import { useCohort } from '@/core/hooks/useCohort';
import { useLocation } from 'wouter';
import type { CohortMember, CohortProject, WorkshopConfig } from '@shared/cohort-schema';
import { TYPOLOGY_COLORS, zoneRiskOpacity } from '@shared/risk-display';
import { HAZARD_TILE_RAMP } from '@shared/arvc-official';
import {
  InviteCboDialog,
  ShareLinkDialog,
  BulkInviteSummaryDialog,
  ResetConfirmDialog,
  MemberResetConfirmDialog,
  MemberRemoveConfirmDialog,
  DeleteCohortConfirmDialog,
  ProvisionCohortDialog,
  CreateProjectDialog,
  ProjectDeleteConfirmDialog,
  ImportOrgDialog,
  type BulkInviteResult,
  type ShareLinkContext,
} from '@/core/components/orchestrator/CohortDialogs';
import { ProjectsView, projectLinkUrl } from '@/core/components/orchestrator/ProjectsView';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/core/components/ui/select';
import { WorkshopCadence } from '@/core/components/orchestrator/WorkshopCadence';
import { SupportInbox } from '@/core/components/orchestrator/SupportInbox';
import { LanguageSwitcher } from '@/core/components/i18n/language-switcher';
import { DataProvenanceDialog } from '@/core/components/maps/DataProvenanceDialog';
import type { ProvenanceKey } from '@shared/data-provenance';
import { CboFilesDrawer, type FilesDrawerMember, type CboDrawerTab } from '@/core/components/orchestrator/CboFilesDrawer';
import { SimulationStrip, useSimulations } from '@/core/components/orchestrator/SimulationStrip';
import { JourneyCard, nextStepOf, type Actor, type JourneyCardData } from '@/core/components/orchestrator/JourneyCard';
import { usePersistedFlag } from '@/core/hooks/usePersistedFlag';

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
  /** Null when the record never reported a time (an imported copy) — said as nothing, not as "agora". */
  updatedDaysAgo: number | null;
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
  // The W2 read the convening asked to see at a glance (backlog #25).
  w2: { worry: string | null; worryCount: number; depth: 'thin' | 'partial' | 'strong' | null;
        teiaSprint: string | null; priorCollaboration: string | null };
  // The W3 read. ⚠️ FOUR states, not the two the 27 August meeting agreed —
  // see MemberW3Signal in server/routes/cohortRoutes.ts and docs/w3-flow.md for
  // the four real records that broke the two-way split. This is the one change
  // to what was decided, and it needs re-explaining to the group rather than
  // just reviewing.
  w3: {
    state: 'ready' | 'needs_study' | 'needs_permission' | 'needs_site' | null;
    unblockedBy: string | null;
    capacity: 'exploratory' | 'emerging' | 'established' | null;
    solutions: string[];
    areaM2: number | null;
    gapCount: number;
    coordinationItems: number;
    tested?: number;
    visit?: { solutionId: string; summary: string } | null;
  };
  docPreview: { total: number; imageIds: string[]; filenames: string[]; teiaSprint: boolean };
  /** Persisted org maturity tier (EF-5): set by the agent at E1 close,
   *  coordinator-overridable from the card. Null until E1 completes. */
  maturityTier: 'emerging' | 'developing' | 'advanced' | null;
  /** Kept out of the portfolio synergy analysis — a test/demo member. Still on
   *  the roster: hiding it from the board would just lose track of it. */
  excludeFromPortfolio: boolean;
  /** E2 "usar o bairro todo": the org committed a neighborhood but deferred the
   *  exact site (coords are the bairro centroid). Drives an amber chip and is
   *  excluded from the sites-mapped KPI. */
  siteDeferred: boolean;
};

// ── W3 verdicts ─────────────────────────────────────────────────────────────
// The coordinator's actual question out of Encontro 3 is not "how far along is
// each org" — it is "which pile is this project in, and who has to move next".
// Four piles, and each one routes to a different person:
//
//   ready             → the ORG, to get a quote and a signature
//   needs_permission  → the COORDINATION, to open a door with an owner or a
//                       secretariat. Cheap, and unblocks a whole project.
//   needs_study       → the COORDINATION, to find a técnico. This is the pile
//                       that becomes a shared procurement, which is the single
//                       biggest thing the programme can do that an individual
//                       organisation cannot.
//   needs_site        → back to the map, with support.
//
// Ordered worst-first: the piles that need someone else to act come before the
// pile that is already moving.
const W3_STATES = ['needs_site', 'needs_study', 'needs_permission', 'ready'] as const;
type W3State = (typeof W3_STATES)[number];

/** The colour each pile's top edge carries — the same hue as its pill. */
const W3_BAR: Record<W3State, string> = {
  needs_site: 'bg-stone-400',
  needs_study: 'bg-sky-500',
  needs_permission: 'bg-amber-500',
  ready: 'bg-emerald-500',
};

const W3_META: Record<W3State, { pt: string; en: string; cls: string }> = {
  needs_site: {
    pt: 'falta o lugar', en: 'no place yet',
    cls: 'border-stone-300 bg-stone-100 text-stone-700 dark:bg-stone-900 dark:text-stone-300 dark:border-stone-700',
  },
  needs_study: {
    pt: 'precisa de estudo', en: 'needs a study',
    cls: 'border-sky-200/60 bg-sky-50 text-sky-700 dark:bg-sky-950/40 dark:text-sky-300 dark:border-sky-900/40',
  },
  needs_permission: {
    pt: 'precisa de autorização', en: 'needs permission',
    cls: 'border-amber-200/60 bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-900/40',
  },
  ready: {
    pt: 'pronto pra orçar', en: 'ready to quote',
    cls: 'border-emerald-200/60 bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-900/40',
  },
};

/**
 * "Mapear sinergias" — the button that replaces a hand-written document.
 *
 * The report it produces was written by hand for ten organisations on 21 August
 * and went stale the moment anyone answered another question. Three things
 * about how it behaves matter more than how it looks:
 *
 *  · It is EXPLICIT. Nothing runs on page load — a pass over every
 *    organisation's full record costs a model call, and a coordinator pressing
 *    it is choosing to spend it.
 *  · It SURVIVES. The last completed report is a row, so it opens instantly and
 *    is still there after a redeploy — which matters because it is the input to
 *    an in-person meeting, and Replit recycles when it feels like it.
 *  · It is HYPOTHESES. The panel says so before it says anything else. A
 *    cluster an organisation did not agree to falls apart in the room.
 */

/**
 * ⚠️ The organisation that finished and cannot move is invisible from this
 * board. The rail shows the encontro open, the card shows a phase, and nothing
 * says "this one is done and stuck" — a coordinator only found out because an
 * org said so, a week later.
 *
 * Reads the same verdicts the pre-session script does, from the database this
 * deployment is actually using (which is why it is an endpoint and not a
 * script: `npm run cohort:doctor` can only reach the workspace DB).
 */
/**
 * One heading pattern for every section of the dashboard — title, one muted
 * line, actions on the right — so the page reads as one surface rather than
 * features added one at a time, each with its own idea of a header.
 */
const SECTION_TONE = {
  emerald: 'bg-emerald-50 text-emerald-700 ring-emerald-200/70 dark:bg-emerald-950/40 dark:text-emerald-300 dark:ring-emerald-900',
  amber: 'bg-amber-50 text-amber-700 ring-amber-200/70 dark:bg-amber-950/40 dark:text-amber-300 dark:ring-amber-900',
  blue: 'bg-blue-50 text-[#1a3da6] ring-blue-200/70 dark:bg-blue-950/40 dark:text-blue-300 dark:ring-blue-900',
} as const;

function SectionHeader({ title, meta, actions, testId, icon: Icon, tone = 'emerald' }: {
  title: React.ReactNode; meta?: React.ReactNode; actions?: React.ReactNode; testId?: string;
  /** A small tile in the section's colour — the colour says what kind of section it is, not decoration. */
  icon?: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  tone?: keyof typeof SECTION_TONE;
}) {
  return (
    <div className="mb-3 flex flex-wrap items-end justify-between gap-x-4 gap-y-2" data-testid={testId}>
      <div className="flex min-w-0 items-center gap-3">
        {Icon && (
          <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ring-1 ring-inset ${SECTION_TONE[tone]}`}>
            <Icon className="h-[18px] w-[18px]" strokeWidth={2} />
          </span>
        )}
        <div className="min-w-0">
          <TitleLarge className="!text-xl tracking-tight mb-0">{title}</TitleLarge>
          {meta && <BodySmall className="text-muted-foreground">{meta}</BodySmall>}
        </div>
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

function CohortDoctorPanel({ coordinatorSlug, stats, variant = 'line' }: {
  coordinatorSlug: string | null;
  /** 'aurora': the message alone, white on the overview's gradient. */
  variant?: 'line' | 'aurora';
  /** The three counts that used to be tiles, said in one line beside the diagnosis. */
  stats?: { sitesMapped: number; profilesInProgress: number; total: number };
}) {
  const { i18n } = useTranslation();
  const isPt = i18n.language?.startsWith('pt');
  const [data, setData] = useState<any>(null);

  useEffect(() => {
    if (!coordinatorSlug) return;
    let alive = true;
    void (async () => {
      try {
        const r = await fetch(`/api/cohort/${coordinatorSlug}/doctor`, { credentials: 'include' });
        if (r.ok && alive) setData(await r.json());
      } catch { /* a missing report is not an error to shout about */ }
    })();
    return () => { alive = false; };
  }, [coordinatorSlug]);

  if (variant === 'aurora') {
    if (!data) return null;
    const w = (data.orgs ?? []).filter((o: any) => o.verdict === 'ready-waiting');
    return (
      <div data-testid="cohort-doctor">
        {w.length === 0 ? (
          <p className="text-[12.5px] text-white/80" data-testid="doctor-all-clear">
            {isPt ? 'Ninguém está travado: toda organização que terminou tem para onde ir.' : 'Nobody is stuck: every org that finished has somewhere to go.'}
          </p>
        ) : (
          <div data-testid="doctor-waiting">
            <p className="text-[12.5px] font-medium text-amber-200">
              {isPt
                ? `${w.length === 1 ? '1 organização terminou o encontro' : `${w.length} organizações terminaram o encontro`} e não têm o próximo aberto.`
                : `${w.length} finished their encontro and have no next one open.`}
            </p>
            <ul className="mt-1.5 flex flex-wrap gap-1.5">
              {w.map((o: any) => (
                <li key={o.id} className="rounded-full bg-white/15 px-2.5 py-0.5 text-[11px] text-white ring-1 ring-inset ring-white/20" title={`fase ${o.phase}`}>{o.orgName}</li>
              ))}
            </ul>
          </div>
        )}
      </div>
    );
  }
  if (!data && !stats) return null;
  const waiting = (data?.orgs ?? []).filter((o: any) => o.verdict === 'ready-waiting');
  const counts = stats
    ? (isPt
      ? `${stats.sitesMapped} de ${stats.total} com local mapeado · ${stats.profilesInProgress} em andamento`
      : `${stats.sitesMapped} of ${stats.total} with a mapped site · ${stats.profilesInProgress} in progress`)
    : '';
  const stuckLabel = isPt ? 'terminou e está esperando' : 'finished, waiting on you';

  return (
    <div className="mt-3 border-t border-foreground/10 pt-3" data-testid="cohort-doctor">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <span className="text-[12.5px] text-foreground/80 tabular-nums" data-testid="cohort-counts">
          <span className="mr-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            {isPt ? 'O grupo' : 'The cohort'}
          </span>
          {counts}
        </span>
        {data && waiting.length === 0 && (
        <span className="text-[12.5px] text-muted-foreground" data-testid="doctor-all-clear">
          {isPt
            ? 'Ninguém está travado: toda organização que terminou tem para onde ir.'
            : 'Nobody is stuck: every org that finished has somewhere to go.'}
        </span>
        )}
      </div>

      {waiting.length > 0 && (
        <div className="mt-2" data-testid="doctor-waiting">
          <p className="text-[12.5px] font-medium text-amber-800 dark:text-amber-300">
            {isPt
              ? `${waiting.length === 1 ? '1 organização terminou o encontro' : `${waiting.length} organizações terminaram o encontro`} e não têm o próximo aberto.`
              : `${waiting.length} finished their encontro and have no next one open.`}
          </p>
          <ul className="mt-1.5 flex flex-wrap gap-1.5">
            {waiting.map((o: any) => (
              <li
                key={o.id}
                className="rounded-full border border-amber-300 bg-amber-50 px-2.5 py-1 text-[11px] text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300"
                title={`${stuckLabel} — fase ${o.phase}`}
              >
                {o.orgName}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function SynergyPanel({ cohortId, excluded = 0 }: { cohortId: string | null; excluded?: number }) {
  const { t, i18n } = useTranslation();
  const isPt = i18n.language?.startsWith('pt');
  const [state, setState] = useState<{ status: string; report: any; finishedAt?: string; stale?: boolean } | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!cohortId) return;
    try {
      const r = await fetch(`/api/cohort/${cohortId}/synergies`, { credentials: 'include' });
      if (r.ok) setState(await r.json());
    } catch { /* a missing report is a normal state, not an error to surface */ }
  }, [cohortId]);

  useEffect(() => { void load(); }, [load]);

  // Poll only while a pass is actually running, and stop the moment it lands.
  useEffect(() => {
    if (state?.status !== 'running') return;
    const id = setInterval(() => { void load(); }, 4000);
    return () => clearInterval(id);
  }, [state?.status, load]);

  const run = async () => {
    if (!cohortId || busy) return;
    setBusy(true);
    try {
      await fetch(`/api/cohort/${cohortId}/synergies`, { method: 'POST', credentials: 'include' });
      setState({ status: 'running', report: null });
    } finally {
      setBusy(false);
    }
  };

  if (!cohortId) return null;
  const running = state?.status === 'running';
  const report = state?.report;
  const groups = report?.analysis?.groups?.length ?? 0;
  const lines = report?.narrative?.lines?.length ?? 0;
  const pooled = report?.analysis?.pooledStudies?.length ?? 0;

  const stat = (value: number, labelPt: string, labelEn: string, emphasis = false) => (
    <div className="flex items-baseline gap-1.5">
      <span className={`text-lg font-semibold tabular-nums ${emphasis ? 'text-emerald-700 dark:text-emerald-300' : 'text-foreground'}`}>
        {value}
      </span>
      <span className="text-[11px] leading-tight text-muted-foreground">{isPt ? labelPt : labelEn}</span>
    </div>
  );

  return (
    <div className="rounded-xl border border-foreground/10 bg-card" data-testid="synergy-panel">
      <div className="flex flex-wrap items-start justify-between gap-x-8 gap-y-4 p-5">
        <div className="flex min-w-0 flex-1 items-start gap-4">
          <div className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">
            <Share2 className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              {isPt ? 'Portfólio da Rede' : 'Network portfolio'}
            </div>
            <h3 className="text-base font-semibold leading-tight tracking-tight">
              {t('orchestrator.synergy.title', { defaultValue: isPt ? 'Mapear sinergias' : 'Map synergies' })}
            </h3>
            <p className="mt-1 max-w-[62ch] text-[13px] leading-snug text-muted-foreground">
              {t('orchestrator.synergy.lede', {
                defaultValue: isPt
                  ? 'Cruza territórios, riscos, soluções e capacidades de todas as organizações — e mostra onde uma contratação conjunta economiza de verdade. São hipóteses para validar no encontro, não decisões.'
                  : 'Crosses territories, hazards, solutions and capacities across every organisation — and shows where commissioning together actually saves. These are hypotheses to validate in the meeting, not decisions.',
              })}
            </p>

            {running && (
              <p className="mt-3 flex items-center gap-2 text-[12.5px] text-foreground/80" data-testid="synergy-running">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                {isPt
                  ? `Lendo o registro de cada organização. Pode fechar esta página — o relatório fica salvo.${report ? ' O relatório anterior segue aberto ao lado.' : ''}`
                  : `Reading every organisation's record. You can close this page — the report is saved.${report ? ' The previous report is still open beside this.' : ''}`}
              </p>
            )}

            {report && !running && (
              <div className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-2" data-testid="synergy-summary">
                {stat(groups, 'agrupamentos', 'groupings')}
                {lines > 0 && stat(lines, 'linhas de programa', 'programme lines')}
                {/* The one number that is money rather than description. */}
                {pooled > 0 && stat(pooled, 'necessidades técnicas em comum', 'shared technical needs', true)}
                {state?.finishedAt && (
                  <span className="text-[11px] text-muted-foreground">
                    {isPt ? 'gerado em ' : 'generated '}
                    {new Date(state.finishedAt).toLocaleDateString(isPt ? 'pt-BR' : 'en-GB')}
                  </span>
                )}
              </div>
            )}

            {/* An excluded member must never be silently missing. A report
                built on nine of ten organisations, with nothing saying so, is
                the kind of thing someone discovers in the room. */}
            {excluded > 0 && (
              <p className="mt-2 text-[11.5px] text-muted-foreground" data-testid="synergy-excluded">
                {isPt
                  ? `${excluded === 1 ? '1 organização está' : `${excluded} organizações estão`} fora desta análise (marcadas na lista de organizações).`
                  : `${excluded === 1 ? '1 organisation is' : `${excluded} organisations are`} kept out of this analysis (marked in the organisations list).`}
              </p>
            )}

            {state?.status === 'failed' && (
              <p className="mt-3 text-[12.5px] text-destructive" data-testid="synergy-failed">
                {isPt ? 'A análise falhou. Dá pra rodar de novo.' : 'The analysis failed. You can run it again.'}
              </p>
            )}
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          {report && (
            <a
              href={`/api/cohort/${cohortId}/synergies/print`}
              target="_blank"
              rel="noreferrer"
              data-testid="synergy-print"
              className="inline-flex h-9 items-center gap-1.5 rounded-md border border-input bg-background px-3 text-[13px] font-medium transition-colors hover:bg-muted"
            >
              <FileText className="h-3.5 w-3.5" />
              {state?.stale
                ? (isPt ? 'Abrir relatório anterior' : 'Open previous report')
                : (isPt ? 'Abrir relatório' : 'Open report')}
            </a>
          )}
          <button
            onClick={run}
            disabled={running || busy}
            data-testid="synergy-run"
            className="inline-flex h-9 items-center gap-1.5 rounded-md border border-input bg-background px-3 text-[13px] font-semibold transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60"
          >
            {running ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Sparkles className="h-3.5 w-3.5" />
            )}
            {running
              ? (isPt ? 'Analisando…' : 'Analysing…')
              : report
                ? (isPt ? 'Rodar de novo' : 'Run again')
                : (isPt ? 'Mapear sinergias' : 'Map synergies')}
          </button>
        </div>
      </div>
    </div>
  );
}

const TOTAL_SECTIONS = 7;
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

/**
 * The mechanism the org named, in the coordinator's language — reusing the very
 * chip they tapped (WORRY_SUBTYPES), so the roster and the org's own screen say
 * the same word. Unknown/free-text worries pass through as written: "Outra
 * coisa" answers are the org's words and translating them would be a guess.
 */
function worryLabel(id: string, locale: 'pt' | 'en'): string {
  const hit = WORRY_SUBTYPES.find(w => w.id === id);
  if (hit) return locale === 'pt' ? hit.pt : hit.en;
  // Legacy rows stored the family id before the split (backlog #24).
  const legacy: Record<string, { pt: string; en: string }> = {
    flood: { pt: '💧 Água', en: '💧 Water' },
    heat: { pt: '🌡️ Calor', en: '🌡️ Heat' },
    landslide: { pt: '⛰️ O barranco', en: '⛰️ The slope' },
    'agua-calor': { pt: '💧 Água e calor', en: '💧 Water and heat' },
  };
  const l = legacy[id];
  return l ? (locale === 'pt' ? l.pt : l.en) : id;
}

/** No activity for this long, mid-workshop, and the board surfaces them. */
const STUCK_AFTER_DAYS = 7;
/** org_profile, intervention_site, 3a/3b/3c, needs, results. */
const CBO_SECTION_COUNT = 7;

function memberToView(m: CohortMember): CboDemoProject {
  const sm = m as CohortMember & {
    displayName?: { en: string; pt: string };
    derivedSectionsComplete?: number;
  };
  const updatedAt = m.snapshotUpdatedAt ? new Date(m.snapshotUpdatedAt) : null;
  const daysAgo = updatedAt
    ? Math.max(0, Math.floor((Date.now() - updatedAt.getTime()) / 86400000))
    : null;
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
    w2: (m as any).w2 ?? { worry: null, worryCount: 0, depth: null, teiaSprint: null, priorCollaboration: null },
    w3: (m as any).w3 ?? { state: null, unblockedBy: null, capacity: null, solutions: [], areaM2: null, gapCount: 0, coordinationItems: 0, tested: 0 },
    docPreview: (m as any).docPreview ?? { total: 0, imageIds: [], filenames: [], teiaSprint: false },
    maturityTier: ((m as any).maturityTier as 'emerging' | 'developing' | 'advanced' | null) ?? null,
    siteDeferred: site?.deferred === true,
    excludeFromPortfolio: (m as any).excludeFromPortfolio === true,
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


// ---------------------------------------------------------------------------
// Risk layer styling — neighborhood choropleth keyed by priorityScore from
// `porto-alegre-neighborhood-zones.json`. Bands are derived from the
// distribution in that file (scores ~0..1 percentile rank+); colors progress from green to
// red so the eye lands first on the urgent recruitment targets.
// ---------------------------------------------------------------------------
// The coordinator risk map shows ONE view at a time over the always-on bairro
// outlines: a hazard RASTER overlay (flood / heat / landslide) or the
// neighborhood RISK choropleth (composite priority). Exclusive — one at a time,
// clicking the active one turns it off (just the outlines + CBO markers remain).
type RiskView = 'flood' | 'heat' | 'landslide' | 'risk';

// Hazard raster overlays — the municipality's own ameaça maps from the Plano de
// Ação Climática (produto P3 / ARVC, 2050), cut into tiles from the official
// rasters by server/routes/arvcTileRoutes.ts.
//
// These replaced the OEF catalog's poa_<haz>_hazard layers, for two reasons.
// The catalog rasters cover a bounding box that spills into Canoas, Alvorada and
// Viamão, so the map showed hazard outside the city it is about; the ARVC rasters
// are clipped to the municipal boundary. And the bairro ranking underneath this
// choropleth is now derived from ARVC, so showing a catalog tile on top of it
// meant a coordinator could read a low-hazard tile under a bairro ranked
// FLOOD-primary. One source on both layers now.
//
// AMEAÇA, not RISCO: the published risk composites cross-correlate at 0.85
// (exposure carries 92–95% of the log-variance and is shared across all six
// hazards), so the three risk maps would be near-identical. See docs/arvc-official.md.
const HAZARD_RASTER: Record<'flood' | 'heat' | 'landslide', { url: string; attribution: string }> = {
  flood:     { url: '/api/geospatial/arvc/arvc_flood_hazard/{z}/{x}/{y}.png',     attribution: 'PLAC/ARVC · ameaça de inundação fluvial 2050' },
  heat:      { url: '/api/geospatial/arvc/arvc_heat_hazard/{z}/{x}/{y}.png',      attribution: 'PLAC/ARVC · ameaça de ondas de calor 2050' },
  landslide: { url: '/api/geospatial/arvc/arvc_landslide_hazard/{z}/{x}/{y}.png', attribution: 'PLAC/ARVC · ameaça de deslizamento 2050' },
};

// Legend ramps must MATCH what is painted on the map. All three overlays are now
// the ARVC ameaça rasters, repainted onto ONE shared sequential ramp by
// arvcTileRoutes.ts — see HAZARD_TILE_RAMP for why not WayCarbon's teal→olive
// (pale = dangerous reads backwards, and washes out on a light basemap).
//
// The previous per-hazard ramps (viridis for flood, RdYlGn for heat/landslide)
// described the OEF catalog tiles that used to be here; leaving them would have
// put a purple-to-yellow key under a teal-to-olive map.
const HAZARD_RAMPS: Record<'flood' | 'heat' | 'landslide', string[]> = {
  flood:     [...HAZARD_TILE_RAMP],
  heat:      [...HAZARD_TILE_RAMP],
  landslide: [...HAZARD_TILE_RAMP],
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
  compact = false,
}: {
  projects: CboDemoProject[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  activeRisk: RiskView | null;
  onBairroClick: (info: { name: string; primaryHazard: string; population: number; priorityScore: number }) => void;
  /** The overview's thumbnail: no zoom buttons, the same map. */
  compact?: boolean;
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
    // Ground, then place names — two Esri services, no key. This is the map the
    // "API KEY REQUIRED" watermark was painted across. See core/lib/basemaps.ts.
    L.tileLayer(BASEMAPS.light.url, {
      attribution: `${BASEMAPS.light.attribution} · © <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>`,
      maxZoom: 19, maxNativeZoom: BASEMAPS.light.maxNativeZoom,
    }).addTo(map);
    L.tileLayer(BASEMAPS.light.labelsUrl!, {
      maxZoom: 19, maxNativeZoom: BASEMAPS.light.maxNativeZoom,
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

  // The overview grows the same map from a thumbnail to full height rather
  // than mounting a second one — so Leaflet has to be told its box changed,
  // or it paints the old size and greys out the rest.
  useEffect(() => {
    const el = mapRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => mapInstanceRef.current?.invalidateSize());
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;
    if (compact) { map.zoomControl?.remove(); return; }
    // Bottom-left when expanded: the tabs sit in the top-left corner.
    map.zoomControl?.setPosition('bottomleft');
    map.zoomControl?.addTo(map);
  }, [compact]);

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

// The roster card lives in components/orchestrator/JourneyCard.tsx.

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------
export default function OrchestratorLandingPage() {
  const { t, i18n } = useTranslation();
  const switchRole = useResetRole();
  const { toast } = useToast();
  const locale: 'en' | 'pt' = i18n.language?.startsWith('pt') ? 'pt' : 'en';

  const [selectedId, setSelectedId] = useState<string | null>(null);
  // Which view fills the map region: the bairro map, the six NBS type cards, or
  // the Brazilian case studies. The map stays mounted underneath either panel.
  const [regionTab, setRegionTab] = useState<'map' | 'solutions' | 'cases'>(
    'map'
  );
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
    cohort, members, leftMembers, isAdmin, allCohorts,
    invite, unlockPhase, openWorkshopPhase, closeWorkshopPhase, saveWorkshops, resetCohort, resetMember, removeMember, saveLanguage, deleteCohort,
    switchCohort, provisionCohort, refresh, refreshProjects,
    projects: cohortProjects, createProject, updateProject, deleteProject,
    cloneMember, importMember, importCohort,
  } = useCohort();
  const [importOrgOpen, setImportOrgOpen] = useState(false);
  const sim = useSimulations(cohort?.coordinatorSlug ?? null, () => { void refresh(); });
  const [advancedOpen, setAdvancedOpen] = usePersistedFlag('cougar.orchestrator.advanced', false);
  const [mapOpen, setMapOpen] = usePersistedFlag('cougar.orchestrator.map', false);
  // A simulation in flight shows its progress where it was started.
  useEffect(() => { if (sim.busy.size > 0) setAdvancedOpen(true); }, [sim.busy.size, setAdvancedOpen]);

  // Organizações | Projetos. The choice rides in the URL (?view=projects) for
  // the same reason the cohort does: a reload must land where the coordinator
  // was, and a link to "the projects" must be sendable.
  const [view, setView] = useState<'orgs' | 'projects'>(() => {
    if (typeof window === 'undefined') return 'orgs';
    return new URLSearchParams(window.location.search).get('view') === 'projects' ? 'projects' : 'orgs';
  });
  const switchView = (v: 'orgs' | 'projects') => {
    setView(v);
    const url = new URL(window.location.href);
    if (v === 'projects') url.searchParams.set('view', 'projects'); else url.searchParams.delete('view');
    window.history.replaceState(null, '', url.toString());
  };
  const [createProjectOpen, setCreateProjectOpen] = useState(false);
  const [createProjectInitial, setCreateProjectInitial] = useState<{ title?: string; memberIds?: string[] } | null>(null);
  const [projectDeleteTarget, setProjectDeleteTarget] = useState<CohortProject | null>(null);
  const cohortLanguage = (cohort?.settings as { language?: 'pt' | 'en' } | null)?.language ?? null;

  // Stuck orgs rise (backlog #25). "Stuck" = parked mid-workshop with nothing
  // for a week — the signal that turns a roster into the thing that says who to
  // call before the next convening. Deliberately a SORT, not a filter: an org
  // never disappears from its own coordinator's board.
  const projects = useMemo(() => {
    const stuck = (p: CboDemoProject) =>
      (p.updatedDaysAgo ?? 0) >= STUCK_AFTER_DAYS && p.sectionsComplete < CBO_SECTION_COUNT;
    return members
      .map(memberToView)
      .sort((a, b) => Number(stuck(b)) - Number(stuck(a)));
  }, [members]);

  // Coordinator tier override (EF-5) — one tap on the card's tier select.
  const handleSetTier = async (p: CboDemoProject, tier: 'emerging' | 'developing' | 'advanced') => {
    if (!cohort?.coordinatorSlug) return;
    const r = await fetch(`/api/cohort/${cohort.coordinatorSlug}/member/${p.id}/tier`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tier }),
    });
    if (!r.ok) {
      toast({ title: t('orchestrator.demo.tierFailed', { defaultValue: 'Could not update the tier' }) });
      return;
    }
    await refresh();
  };
  /**
   * In or out of the portfolio analysis. Reversible, and never destructive —
   * the member stays on the board either way.
   */
  /** "Saiu da rede" and back — reversible; the server keeps them out of every analysis meanwhile. */
  const handleLeftNetwork = async (memberId: string, orgName: string, left: boolean) => {
    if (!cohort?.coordinatorSlug) return;
    const r = await fetch(`/api/cohort/${cohort.coordinatorSlug}/member/${memberId}/left-network`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ left }),
    });
    if (!r.ok) { toast({ title: t('orchestrator.leftNetwork.failed', { defaultValue: 'Não foi possível atualizar' }) }); return; }
    if (left) setFilesMember(null);
    toast({ title: left
      ? t('orchestrator.leftNetwork.doneOut', { defaultValue: '{{org}} saiu da rede — o registro fica guardado', org: orgName })
      : t('orchestrator.leftNetwork.doneBack', { defaultValue: '{{org}} voltou para a rede', org: orgName }) });
    await refresh();
  };

  const handleTogglePortfolio = async (p: CboDemoProject) => {
    if (!cohort?.coordinatorSlug) return;
    const exclude = !p.excludeFromPortfolio;
    const r = await fetch(`/api/cohort/${cohort.coordinatorSlug}/member/${p.id}/portfolio`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ exclude }),
    });
    if (!r.ok) {
      toast({ title: t('orchestrator.portfolioExclude.failed', { defaultValue: 'Could not update that' }) });
      return;
    }
    toast({
      title: exclude
        ? t('orchestrator.portfolioExclude.doneOut', {
            defaultValue: '{{org}} fica fora do relatório de sinergias',
            org: p.name[locale.startsWith('pt') ? 'pt' : 'en'],
          })
        : t('orchestrator.portfolioExclude.doneIn', {
            defaultValue: '{{org}} volta para o relatório de sinergias',
            org: p.name[locale.startsWith('pt') ? 'pt' : 'en'],
          }),
    });
    await refresh();
  };

  const memberById = useMemo(() => new Map(members.map(m => [m.id, m])), [members]);
  const projectById = useMemo(() => new Map(projects.map(p => [p.id, p])), [projects]);
  /** The card's data, from the roster's view of a member. */
  const journeyOf = (p: CboDemoProject): JourneyCardData => {
    const m = memberById.get(p.id);
    return {
      id: p.id,
      name: p.name[locale],
      neighborhood: p.neighborhood,
      hasPlace: !!p.coords,
      phase: Number(m?.snapshotPhase ?? 1) || 1,
      worry: p.w2.worry,
      worryCount: p.w2.worryCount,
      // The card's icon already says the hazard; the label goes without its emoji.
      worryLabel: p.w2.worry ? worryLabel(p.w2.worry, locale).replace(/^[^A-Za-zÀ-ÿ0-9]+/, '').replace(/^outro:\s*/i, '') : null,
      documentCount: p.documentCount,
      maturityScore: p.maturityScore,
      maturityTotal: TOTAL_MATURITY,
      excludeFromPortfolio: p.excludeFromPortfolio,
      simulated: sim.simulatedBy.get(p.id) ?? null,
      w3: p.w3 as JourneyCardData['w3'],
    };
  };

  // ⚠️ How many organisations can actually enter each encontro. The rail reads
  // the cohort's `openedAt`; the gate an org hits reads its own
  // `unlockedPhases`. An org whose row missed the opening is told "o coordenador
  // vai abrir o acesso em breve" while this board says AO VIVO — and the card
  // stops offering "Abrir para o grupo" once open, so the coordinator had
  // neither a symptom nor a repair. The server heals a row the moment the org
  // loads; this is so the coordinator can see it before the meeting instead of
  // during it.
  const accessByPhase = useMemo(() => {
    const by = new Map<number, { withAccess: number; total: number }>();
    for (const m of members) {
      const unlocked = Array.isArray(m.unlockedPhases) ? (m.unlockedPhases as number[]) : [1];
      for (let phase = 1; phase <= 6; phase++) {
        const row = by.get(phase) ?? { withAccess: 0, total: 0 };
        row.total += 1;
        if (unlocked.includes(phase)) row.withAccess += 1;
        by.set(phase, row);
      }
    }
    return by;
  }, [members]);

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

  // The W3 portfolio, in the four piles. Only orgs that actually started W3
  // count — a cohort mid-W2 must not read as "0 pronto pra orçar", which would
  // frame an unstarted workshop as a failing one.
  const w3Stats = useMemo(() => {
    const scoped = projects.filter(p => p.w3.state);
    const by = Object.fromEntries(
      W3_STATES.map(st => [st, scoped.filter(p => p.w3.state === st)]),
    ) as Record<W3State, CboDemoProject[]>;
    return {
      scoped,
      by,
      // What the coordination itself has to move, across the whole cohort.
      // This is the number that turns a roster into a work queue: the studies
      // and the doors, pooled, are the thing the programme can do that no
      // single organisation can.
      coordinationItems: scoped.reduce((n, p) => n + p.w3.coordinationItems, 0),
    };
  }, [projects]);

  // Dialog state
  const [inviteOpen, setInviteOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [shareUrl, setShareUrl] = useState<string>('');
  const [shareContext, setShareContext] = useState<ShareLinkContext | null>(null);
  const [bulkSummaryOpen, setBulkSummaryOpen] = useState(false);
  const [bulkInvitations, setBulkInvitations] = useState<BulkInviteResult[]>([]);
  const [resetConfirmOpen, setResetConfirmOpen] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  // Per-org reset: the card whose profile is about to be erased (null = closed).
  const [memberResetTarget, setMemberResetTarget] = useState<CboDemoProject | null>(null);
  // Per-org remove: the card about to leave the cohort entirely (null = closed).
  const [memberRemoveTarget, setMemberRemoveTarget] = useState<CboDemoProject | null>(null);
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
    setFilesMember({
      id: p.id, orgName: p.name[locale], inviteUrl,
      // What the drawer shows under the name — and, for Documentos, the tested
      // solutions: without `w3` the per-scenario links never rendered at all.
      neighborhood: p.neighborhood || undefined,
      encontro: (['who', 'where', 'building', 'impact', 'operations', 'needs', 'results'] as const).indexOf(p.currentPhase) + 1 || undefined,
      isTest: p.excludeFromPortfolio,
      w3: { testedIds: ((p.w3 as any)?.testedIds ?? []) as string[], detailed: !!(p.w3 as any)?.detailed },
    });
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

  // Coordinator clicked "Open for cohort". ONE server call now does both halves
  // — unlock the phase for every member AND stamp `openedAt` — in a single
  // transaction. This used to be two sequential client-driven writes to two
  // different tables, neither of which checked whether it succeeded, while the
  // toast fired regardless: a failed or interrupted second write left the phase
  // unlocked and the cadence rail showing the workshop as never opened, with no
  // sign anything had gone wrong. Scheduled `date` is left alone.
  const handleOpenWorkshop = async (workshopIndex: number, todayISO: string) => {
    const workshop = (cohort?.settings as any)?.workshops?.[workshopIndex] as WorkshopConfig | undefined;
    if (!workshop) return;
    const ok = await openWorkshopPhase(workshop.unlocksPhase, todayISO);
    toast({
      variant: ok ? undefined : 'destructive',
      title: ok
        ? t('orchestrator.cohort.workshopOpened', {
            defaultValue: `${workshop.name} opened for cohort`,
            workshop: workshop.name,
          })
        : t('orchestrator.cohort.workshopOpenFailed', {
            defaultValue: `Could not open ${workshop.name} — nothing was changed. Try again.`,
            workshop: workshop.name,
          }),
    });
  };

  const handleUpdateWorkshops = async (next: WorkshopConfig[]) => {
    await saveWorkshops(next);
  };

  // Coordinator confirmed "Close workshop" (opened by mistake — field ask
  // 2026-07-16). The server clears openedAt, re-locks the phase for every
  // member, and rolls back sessions already sitting in it; their answers stay.
  const handleCloseWorkshop = async (workshopIndex: number) => {
    const workshop = (cohort?.settings as any)?.workshops?.[workshopIndex] as WorkshopConfig | undefined;
    if (!workshop) return;
    const result = await closeWorkshopPhase(workshop.unlocksPhase);
    toast({
      title: result
        ? t('orchestrator.cohort.workshopClosed', {
            defaultValue: '{{workshop}} closed — {{n}} org(s) re-locked',
            workshop: workshop.name,
            n: result.relocked,
          })
        : t('orchestrator.cohort.workshopCloseFailed', { defaultValue: 'Could not close the workshop' }),
    });
  };

  const handleResetConfirm = async () => {
    setResetConfirmOpen(false);
    await resetCohort();
    toast({ title: t('orchestrator.cohort.resetDone', { defaultValue: 'Cohort reset' }) });
  };

  const handleMemberResetConfirm = async () => {
    const target = memberResetTarget;
    setMemberResetTarget(null);
    if (!target) return;
    const ok = await resetMember(target.id);
    toast({
      title: ok
        ? t('orchestrator.memberReset.done', { defaultValue: '{{org}} reset — the invite link starts fresh', org: target.name[locale] })
        : t('orchestrator.memberReset.failed', { defaultValue: 'Could not reset {{org}}', org: target.name[locale] }),
    });
  };

  const handleMemberRemoveConfirm = async () => {
    const target = memberRemoveTarget;
    setMemberRemoveTarget(null);
    if (!target) return;
    const ok = await removeMember(target.id);
    toast({
      title: ok
        ? t('orchestrator.memberRemove.done', { defaultValue: '{{org}} removed from the cohort', org: target.name[locale] })
        : t('orchestrator.memberRemove.failed', { defaultValue: 'Could not remove {{org}}', org: target.name[locale] }),
    });
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
  const handleInviteSubmit = async (params: { orgName: string; neighborhood?: string; orgType?: 'community' | 'implementer' }) => {
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
  const cohortOpenMax = Math.max(1, ...workshops.filter(w => !!w.openedAt).map(w => Number(w.unlocksPhase) || 1));
  const liveEncontro = workshops.some(w => !!w.openedAt) ? cohortOpenMax : null;

  // ── Test copies (docs/test-orgs.md) ───────────────────────────────────────
  // A copy of a real record, landed at the end of Encontro 2, with its own
  // link — so Encontro 3 is tried on what an organisation actually said.
  const handleCloneTest = async (m: FilesDrawerMember) => {
    const r = await cloneMember(m.id, { asOf: 'end-of-e2' });
    if ('error' in r) {
      toast({ title: t('orchestrator.importOrg.failed', { defaultValue: 'Could not create the copy' }), description: r.error, variant: 'destructive' });
      return;
    }
    setFilesMember(null);
    openShare(memberInviteUrl(r.member), { kind: 'cbo', orgName: r.member.orgName });
  };
  const handleImportCohort = async (bundle: unknown) => {
    const r = await importCohort(bundle);
    if ('error' in r) return r.error;
    toast({
      title: t('orchestrator.importCohort.done', { defaultValue: 'Cohort created: {{name}}', name: r.name }),
      description: r.failed.length ? t('orchestrator.importCohort.failedSome', { defaultValue: 'Not copied: {{names}}', names: r.failed.join(', ') }) : undefined,
    });
    return null;
  };
  const handleImportOrg = async (input: { snapshot: unknown; orgName?: string; asOf: 'end-of-e2' | 'as-is' }) => {
    const r = await importMember(input);
    if ('error' in r) return r.error;
    openShare(memberInviteUrl(r.member), { kind: 'cbo', orgName: r.member.orgName });
    return null;
  };

  // ── Projects ──────────────────────────────────────────────────────────────
  const openCreateProject = (initial?: { title?: string; memberIds?: string[] } | null) => {
    setCreateProjectInitial(initial ?? null);
    setCreateProjectOpen(true);
  };
  const projectOrgNames = (p: CohortProject) =>
    p.memberIds.map(id => memberById.get(id)?.orgName).filter((n): n is string => !!n);
  const shareProject = (p: CohortProject) =>
    openShare(projectLinkUrl(p), { kind: 'project', title: p.title, orgNames: projectOrgNames(p) });
  const handleCreateProject = async (input: { title: string; memberIds: string[] }) => {
    const p = await createProject(input);
    if (!p) {
      toast({ title: t('orchestrator.projects.createFailed', { defaultValue: 'Could not create the project' }), variant: 'destructive' });
      return false;
    }
    // The link is the point of the project — it is in hand the moment it exists.
    shareProject(p);
    return true;
  };
  const handleArchiveProject = async (p: CohortProject, archived: boolean) => {
    const r = await updateProject(p.id, { archived });
    if (!r) toast({ title: t('orchestrator.projects.updateFailed', { defaultValue: 'Could not update the project' }), variant: 'destructive' });
  };
  const handleDeleteProjectConfirm = async () => {
    if (!projectDeleteTarget) return;
    const ok = await deleteProject(projectDeleteTarget.id);
    setProjectDeleteTarget(null);
    toast({
      title: ok
        ? t('orchestrator.projects.deleted', { defaultValue: 'Project deleted' })
        : t('orchestrator.projects.deleteFailed', { defaultValue: 'Could not delete the project' }),
      variant: ok ? undefined : 'destructive',
    });
  };

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
    <div className="min-h-screen relative bg-gradient-to-b from-[#F2EDE0] via-white to-[#F2EDE0] dark:from-slate-950 dark:via-background dark:to-slate-950">
      {/* Header — carries the Rede SCbN POA palette (colors only, no logo:
          the platform serves the whole network, not one org). */}
      <header className="relative z-10 px-6 sm:px-10 py-6 border-b border-[#3F4A46]/10 dark:border-foreground/5 bg-background/40 backdrop-blur-sm">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-white/80 border border-[#3F4A46]/10 dark:bg-amber-950/40 dark:border-transparent flex items-center justify-center">
              <RedeMark size="md" />
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
        onCloneTest={handleCloneTest}
        onSimulateE3={filesMember && sim.eligible.has(filesMember.id) ? (m) => void sim.start([m.id]) : undefined}
        // Taken off the card (ferramentas que se usam pouco): the confirm
        // dialogs are the same ones, opened from here.
        memberActions={filesMember && projectById.get(filesMember.id) ? {
          inPortfolio: !projectById.get(filesMember.id)!.excludeFromPortfolio,
          onTogglePortfolio: () => handleTogglePortfolio(projectById.get(filesMember.id)!),
          onReset: () => { const p = projectById.get(filesMember.id)!; setFilesMember(null); setMemberResetTarget(p); },
          onRemove: () => { const p = projectById.get(filesMember.id)!; setFilesMember(null); setMemberRemoveTarget(p); },
          onLeaveNetwork: () => { void handleLeftNetwork(filesMember.id, filesMember.orgName ?? '', true); },
        } : undefined}
        simulating={!!filesMember && sim.busy.has(filesMember.id)}
      />

      <main className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 py-8 sm:py-10">
        {/* Cohort header — singleton model. One cohort for the pilot,
            no slug to manage. Reset (with confirmation) wipes members and
            restores the default workshop cadence. */}
        <div className="mb-4 rounded-xl border border-foreground/10 bg-card/60 px-4 py-3">
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
            <div className="flex flex-wrap items-center gap-2">
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
                onClick={() => setAdvancedOpen(o => !o)}
                aria-expanded={advancedOpen}
                className="text-muted-foreground hover:text-foreground/80"
                data-testid="button-advanced-tools"
              >
                <ChevronRight className={`w-3.5 h-3.5 mr-1 transition-transform ${advancedOpen ? 'rotate-90' : ''}`} />
                {t('orchestrator.advanced.toggle', { defaultValue: 'Advanced tools' })}
              </Button>
              <Button size="sm" onClick={handleInviteOpen} data-testid="button-invite-cbo">
                <Plus className="w-3.5 h-3.5 mr-1.5" />
                {t('orchestrator.cohort.invite', { defaultValue: 'Invite CBO' })}
              </Button>
            </div>
          </div>

          {/* Ferramentas avançadas — what a coordinator does rarely, or what
              only an admin or a test needs: wiping or deleting the cohort,
              another cohort, moving organisations between environments, the
              simulated Encontro 3. Closed by default and remembered, so the
              header is the cohort, its language and "Convidar CBO". */}
          {advancedOpen && (
            <div className="mb-3 rounded-lg border border-foreground/10 bg-muted/40 p-3" data-testid="advanced-tools">
              <div className="flex flex-wrap items-center gap-2">
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
                {cohort?.coordinatorSlug && (
                  <Button asChild size="sm" variant="ghost" className="text-muted-foreground hover:text-foreground/80">
                    <a
                      href={`/api/cohort/${cohort.coordinatorSlug}/export`}
                      data-testid="button-export-cohort"
                      title={t('orchestrator.exportCohort.tooltip', { defaultValue: 'Download every organisation as it stands (no contact details) — to import as a test cohort in another environment' }) as string}
                    >
                      <Download className="w-3.5 h-3.5 mr-1.5" />
                      {t('orchestrator.exportCohort.button', { defaultValue: 'Export cohort' })}
                    </a>
                  </Button>
                )}
                <Button
                  size="sm" variant="outline" onClick={() => setImportOrgOpen(true)} data-testid="button-import-org"
                  title={t('orchestrator.importOrg.tooltip', { defaultValue: 'Create a test organisation from a snapshot of a real one' })}
                >
                  <Plus className="w-3.5 h-3.5 mr-1.5" />
                  {t('orchestrator.importOrg.button', { defaultValue: 'Import org' })}
                </Button>
              </div>
              <div className="mt-3 empty:hidden"><SimulationStrip sim={sim} /></div>
            </div>
          )}

        </div>

        {/* ── Overview: the cohort at a glance, and the place ────────────────
            The aurora (the platform's blue drifting into the NBS green) carries
            the numbers and the diagnosis; beside it, the risk map with every
            organisation on it, as a thumbnail. "Expandir" grows the SAME map
            to full height with Mapa / Soluções / Casos — remembered per browser.
            The map is the one thing that says where this programme is. */}
        <section className="mb-4" data-testid="overview-hero">
          <Tabs value={regionTab} onValueChange={v => setRegionTab(v as typeof regionTab)} className="w-full">
          <div className={`grid gap-3 ${mapOpen ? 'grid-cols-1' : 'lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]'}`}>
            <div className="relative overflow-hidden rounded-2xl text-white shadow-sm">
              <div aria-hidden="true" className="pointer-events-none absolute inset-0" style={{ background: 'radial-gradient(125% 150% at 4% 0%, #2f66e8 0%, #1a3da6 38%, #001444 100%)' }} />
              <div aria-hidden="true" className="pointer-events-none absolute inset-0" style={{ background: 'radial-gradient(70% 150% at 72% 0%, rgba(22,163,74,.8) 0%, rgba(22,163,74,0) 62%), radial-gradient(48% 110% at 92% 88%, rgba(103,232,249,.5) 0%, rgba(103,232,249,0) 70%)' }} />
              <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/40 to-transparent" />
              <div className={`relative flex h-full flex-col justify-between gap-5 p-5 ${mapOpen ? 'lg:flex-row lg:items-center' : ''}`}>
                <div>
                  <div className="mb-2 flex flex-wrap items-center gap-2">
                    <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-emerald-200/90">
                      {t('orchestrator.hero.kicker', { defaultValue: 'The cohort today' })}
                    </span>
                    {liveEncontro && (
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ring-1 ring-inset ring-white/25" data-testid="hero-live">
                        <span className="relative flex h-1.5 w-1.5"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-300 opacity-75" /><span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-300" /></span>
                        {t('orchestrator.hero.live', { defaultValue: 'Encontro {{n}} live', n: liveEncontro })}
                      </span>
                    )}
                  </div>
                  <div className={`grid gap-x-6 gap-y-4 ${mapOpen ? 'grid-cols-2 sm:grid-cols-4' : 'grid-cols-2'}`} data-testid="cohort-counts">
                    {([
                      [stats.total, t('orchestrator.hero.orgs', { defaultValue: 'organisations' })],
                      [stats.sitesMapped, t('orchestrator.hero.sites', { defaultValue: 'with a mapped site' })],
                      [stats.profilesInProgress, t('orchestrator.hero.inProgress', { defaultValue: 'in progress' })],
                      [w3Stats.scoped.length, t('orchestrator.hero.tested', { defaultValue: 'tested solutions' })],
                    ] as const).map(([n, label]) => (
                      <div key={label} className="min-w-[5.5rem]">
                        <div className="text-3xl font-semibold tabular-nums leading-none">{n}</div>
                        <div className="mt-1 text-[11px] leading-tight text-white/70">{label}</div>
                      </div>
                    ))}
                  </div>
                </div>
                <CohortDoctorPanel coordinatorSlug={cohort?.coordinatorSlug ?? null} variant="aurora" />
              </div>
            </div>

            {/* `isolate`: MapLayerControls is z-400 and sits outside
                .leaflet-container; without a local stacking context the legend
                paints over any dialog opened from this page. */}
            <div className={`relative isolate w-full ${mapOpen ? 'h-[64vh] md:h-[74vh]' : 'h-[260px] lg:h-full lg:min-h-[260px]'}`}>
              <div className="absolute inset-0" aria-label="Mapa" role="group">
                <MapPanel
                  key={`${cohort?.id ?? ''}:${projects.filter(p => p.coords).map(p => p.id).join(',')}`}
                  projects={projects}
                  selectedId={selectedId}
                  onSelect={setSelectedId}
                  activeRisk={activeRisk}
                  onBairroClick={handleBairroClick}
                  compact={!mapOpen}
                />
                {mapOpen && <MapLayerControls active={activeRisk} onChange={setActiveRisk} />}
              </div>
              {mapOpen && (
                <>
                  <TabsList className="absolute left-3 top-3 z-[600] shadow-sm">
                    <TabsTrigger value="map" data-testid="region-tab-map">
                      <MapIcon className="w-3.5 h-3.5 mr-1.5" />
                      {t('orchestrator.regionTabs.map', { defaultValue: 'Mapa' })}
                    </TabsTrigger>
                    <TabsTrigger value="solutions" data-testid="region-tab-solutions">
                      <Sprout className="w-3.5 h-3.5 mr-1.5" />
                      {t('orchestrator.regionTabs.solutions', { defaultValue: 'Soluções' })}
                    </TabsTrigger>
                    <TabsTrigger value="cases" data-testid="region-tab-cases">
                      <BookOpen className="w-3.5 h-3.5 mr-1.5" />
                      {t('orchestrator.regionTabs.cases', { defaultValue: 'Casos' })}
                    </TabsTrigger>
                  </TabsList>
                  <TabsContent value="solutions" className="absolute inset-0 z-[500] m-0 overflow-y-auto overscroll-contain rounded-xl border border-foreground/10 bg-background p-4 pt-16 focus-visible:outline-none">
                    <NbsSolutionsGrid lang={locale} />
                  </TabsContent>
                  <TabsContent value="cases" className="absolute inset-0 z-[500] m-0 overflow-y-auto overscroll-contain rounded-xl border border-foreground/10 bg-background p-4 pt-16 focus-visible:outline-none">
                    <NbsCasesGrid cards={NBS_SHOWCASE_CARDS} lang={locale} />
                  </TabsContent>
                </>
              )}
              <Button
                size="sm" variant="outline"
                onClick={() => setMapOpen(o => !o)} aria-expanded={mapOpen}
                className={`absolute z-[600] bg-background/95 shadow-sm backdrop-blur ${mapOpen ? 'right-3 bottom-3' : 'right-3 top-3'}`}
                data-testid="button-toggle-map"
              >
                <MapIcon className="w-3.5 h-3.5 mr-1.5" />
                {mapOpen
                  ? t('orchestrator.hero.collapse', { defaultValue: 'Collapse map' })
                  : t('orchestrator.hero.expand', { defaultValue: 'Map, solutions and cases' })}
              </Button>
            </div>
          </div>
          </Tabs>
        </section>

        {/* The encontros — their own card now, under the overview: the
            first screen is the cohort at a glance, the calendar right below. */}
        <div className="mb-10 rounded-xl border border-foreground/10 bg-card/60 px-4 py-3" data-testid="encontros-card">
          <WorkshopCadence
            workshops={workshops}
            accessByPhase={accessByPhase}
            onOpenWorkshop={handleOpenWorkshop}
            onCloseWorkshop={handleCloseWorkshop}
            onUpdateWorkshops={handleUpdateWorkshops}
          />
        </div>


        {/* ── The W3 portfolio ─────────────────────────────────────────────
            Four piles, worst-first, because each routes to a different person:
            needs_study and needs_permission are the COORDINATION's queue, and
            pooling the studies across the cohort is the single biggest thing
            the programme can do that an individual organisation cannot.

            Hidden until at least one org has been through W3 — an empty
            "0 pronto pra orçar" on a cohort still in W2 reads as failure. */}
        {w3Stats.scoped.length > 0 && (
          <div className="mb-10" data-testid="w3-portfolio">
            <SectionHeader
              icon={Target}
              tone="amber"
              title={t('orchestrator.w3.portfolioTitle', { defaultValue: 'Projetos do Encontro 3' })}
              meta={t('orchestrator.w3.portfolioSubtitle', {
                defaultValue: '{{n}} de {{total}} organizações · {{items}} itens na fila da coordenação',
                n: w3Stats.scoped.length,
                total: stats.total,
                items: w3Stats.coordinationItems,
              })}
            />
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              {W3_STATES.map(st => {
                const rows = w3Stats.by[st];
                const meta = W3_META[st];
                return (
                  <Card key={st} data-testid={`w3-pile-${st}`} className="overflow-hidden">
                    <div aria-hidden="true" className={`h-1 w-full ${W3_BAR[st]} ${rows.length ? '' : 'opacity-30'}`} />
                    <CardContent className="p-4">
                      <div className="flex items-baseline gap-2">
                        <div className="text-2xl font-semibold tracking-tight tabular-nums">
                          {rows.length}
                        </div>
                        <span className={`inline-flex items-center text-[10px] font-medium px-2 py-0.5 rounded-full border ${meta.cls}`}>
                          {meta[locale.startsWith('pt') ? 'pt' : 'en']}
                        </span>
                      </div>
                      {rows.length > 0 && (
                        <ul className="mt-2 space-y-0.5">
                          {rows.slice(0, 4).map(r => (
                            <li key={r.id} className="truncate text-[11px] text-muted-foreground">
                              {r.name[locale.startsWith('pt') ? 'pt' : 'en']}
                            </li>
                          ))}
                          {rows.length > 4 && (
                            <li className="text-[11px] text-muted-foreground/70">
                              +{rows.length - 4}
                            </li>
                          )}
                        </ul>
                      )}
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </div>
        )}

        {/* Section heading */}
        <SectionHeader
          icon={Network}
          tone="blue"
          title={t('orchestrator.demo.portfolioTitle')}
          meta={t('orchestrator.demo.portfolioSubtitle')}
          actions={<>
            {view === 'orgs' && members.length > 0 && cohort?.coordinatorSlug && (
              <Button asChild size="sm" variant="outline">
                <a
                  href={`/api/cohort/${cohort.coordinatorSlug}/profiles`}
                  target="_blank"
                  rel="noreferrer"
                  data-testid="link-all-profiles"
                  title={t('orchestrator.profiles.allHint', { defaultValue: 'One print-ready page per organisation, with everything each has shared so far' }) as string}
                >
                  <FileText className="w-3.5 h-3.5 mr-1.5" />
                  {t('orchestrator.profiles.all', { defaultValue: 'All profiles (PDF)' })}
                </a>
              </Button>
            )}
          </>}
        />

        <div className="flex flex-col gap-5">

          {/* Organizações | Projetos — below the map, where the roster lives.
              Everything above (stats, diagnosis, synergies, the Encontro 3
              piles, the map) is the cohort's and stays in both views; only
              what is listed here swaps: the organisations, or the projects
              made of them (docs/projects.md). */}
          <div className="mb-3 flex items-center gap-3" data-testid="orchestrator-view-switch">
            <div className="inline-flex rounded-lg border border-foreground/10 bg-muted/40 p-0.5">
              {([
                ['orgs', t('orchestrator.views.orgs', { defaultValue: 'Organisations' }), members.length],
                ['projects', t('orchestrator.views.projects', { defaultValue: 'Projects' }), cohortProjects.filter(p => !p.archivedAt).length],
              ] as const).map(([key, label, n]) => {
                const on = view === key;
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => switchView(key)}
                    aria-pressed={on}
                    data-testid={`view-${key}`}
                    className={`inline-flex items-center gap-1.5 rounded-md px-3.5 py-1.5 text-[13px] font-semibold transition-colors ${
                      on ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    {label}
                    <span className={`rounded-full px-1.5 text-[11px] tabular-nums ${on ? 'bg-emerald-600 text-white' : 'bg-foreground/10'}`}>{n}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {view === 'projects' && (
            <ProjectsView
              projects={cohortProjects}
              members={members}
              cohortId={cohort?.id ?? null}
              cohortSlug={cohort?.coordinatorSlug ?? null}
              onRefresh={() => { void refreshProjects(); }}
              onCreate={openCreateProject}
              onShare={shareProject}
              onArchive={handleArchiveProject}
              onDelete={setProjectDeleteTarget}
            />
          )}
          {/* The synergy reading feeds "Começar por" on the board — it lives
              with the projects, not above the whole page. */}
          {view === 'projects' && (
            <div className="mt-6">
              <SynergyPanel cohortId={cohort?.id ?? null} excluded={projects.filter(p => p.excludeFromPortfolio).length} />
            </div>
          )}

          {/* Participants, grouped by who has to act next (refine 2026-10-17, R1):
              the coordination's queue first — the technical visit, an
              authorisation, a study — then the organisations' own next
              encontro, then the ones ready for the pre-portfolio, then those
              still in Encontros 1–2. One rule (nextStepOf) for the card and
              the grouping. */}
          {view === 'orgs' && (() => {
            const order: Actor[] = ['coordination', 'organisation', 'ready', 'early'];
            const title: Record<Actor, string> = {
              coordination: t('orchestrator.journey.groupCoord', { defaultValue: 'The coordination acts' }),
              organisation: t('orchestrator.journey.groupOrg', { defaultValue: 'The organisations continue' }),
              ready: t('orchestrator.journey.groupReady', { defaultValue: 'Ready for the pre-portfolio' }),
              early: t('orchestrator.journey.groupEarly', { defaultValue: 'Still in Encontros 1–2' }),
            };
            const groups = new Map<Actor, CboDemoProject[]>(order.map(x => [x, []]));
            for (const p of projects) groups.get(nextStepOf(journeyOf(p)).actor)!.push(p);
            let i = 0;
            return (
              <div className="space-y-6">
                {order.filter(x => groups.get(x)!.length).map(actor => (
                  <section key={actor} data-testid={`roster-group-${actor}`}>
                    <h4 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                      {title[actor]} <span className="font-normal">· {groups.get(actor)!.length}</span>
                    </h4>
                    <div className="grid w-full grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                      {groups.get(actor)!.map(p => {
                        const member = memberById.get(p.id);
                        const maxUnlocked = Math.max(0, ...(member?.unlockedPhases ?? [1]));
                        const canUnlockNext = maxUnlocked < 5;
                        // The per-organisation unlock is the exception: said only when this
                        // organisation's access differs from what the cohort has open.
                        const unlockDiffers = maxUnlocked !== cohortOpenMax;
                        return (
                          <motion.div
                            key={p.id}
                            initial={{ opacity: 0, y: 12 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ duration: 0.35, delay: 0.05 + Math.min(i++, 12) * 0.03 }}
                          >
                            <JourneyCard
                              p={journeyOf(p)}
                              selected={selectedId === p.id}
                              onHover={setSelectedId}
                              onOpen={() => openCbo(p, 'convite')}
                              onOpenTab={tab => openCbo(p, tab)}
                              tierControl={p.maturityTier ? (
                                <select
                                  value={p.maturityTier}
                                  onClick={e => e.stopPropagation()}
                                  onChange={e => { e.stopPropagation(); handleSetTier(p, e.target.value as 'emerging' | 'developing' | 'advanced'); }}
                                  data-testid={`tier-select-${p.id}`}
                                  className="rounded border border-foreground/10 bg-transparent px-1 py-0 text-[10.5px]"
                                  title={t('orchestrator.demo.tierTitle', { defaultValue: 'Maturity tier (agent-read at E1 — you can override it)' }) as string}
                                >
                                  <option value="emerging">{t('orchestrator.demo.tier.emerging', { defaultValue: 'Emerging' })}</option>
                                  <option value="developing">{t('orchestrator.demo.tier.developing', { defaultValue: 'Developing' })}</option>
                                  <option value="advanced">{t('orchestrator.demo.tier.advanced', { defaultValue: 'Advanced' })}</option>
                                </select>
                              ) : undefined}
                            />
                            {member && unlockDiffers && (
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
                  </section>
                ))}
                {/* Who left the network: off the board and every count, kept and restorable. */}
                {leftMembers.length > 0 && (
                  <details className="rounded-lg border border-dashed border-foreground/15 px-3 py-2 text-xs text-muted-foreground" data-testid="roster-left-network">
                    <summary className="cursor-pointer select-none">
                      {t('orchestrator.leftNetwork.group', { defaultValue: 'Saíram da rede ({{n}})', n: leftMembers.length })}
                    </summary>
                    <ul className="mt-2 space-y-1">
                      {leftMembers.map(l => (
                        <li key={l.id} className="flex items-center justify-between gap-2">
                          <span>{l.orgName}{l.neighborhood ? ` · ${l.neighborhood}` : ''}</span>
                          <Button variant="ghost" size="sm" className="h-6 px-2 text-[11px]" onClick={() => void handleLeftNetwork(l.id, l.orgName ?? '', false)} data-testid={`button-restore-network-${l.id}`}>
                            {t('orchestrator.leftNetwork.restore', { defaultValue: 'Restaurar' })}
                          </Button>
                        </li>
                      ))}
                    </ul>
                  </details>
                )}
              </div>
            );
          })()}
        </div>
      </main>

      {/* Cohort flow dialogs */}
      <ImportOrgDialog open={importOrgOpen} onOpenChange={setImportOrgOpen} onSubmit={handleImportOrg} onSubmitCohort={handleImportCohort} />
      <CreateProjectDialog
        open={createProjectOpen}
        onOpenChange={setCreateProjectOpen}
        members={members.map(m => ({ id: m.id, orgName: m.orgName, neighborhood: m.neighborhood }))}
        initial={createProjectInitial}
        onSubmit={handleCreateProject}
      />
      <ProjectDeleteConfirmDialog
        open={projectDeleteTarget != null}
        title={projectDeleteTarget?.title ?? ''}
        onOpenChange={(open) => { if (!open) setProjectDeleteTarget(null); }}
        onConfirm={handleDeleteProjectConfirm}
      />
      <ResetConfirmDialog
        open={resetConfirmOpen}
        onOpenChange={setResetConfirmOpen}
        onConfirm={handleResetConfirm}
      />
      <MemberResetConfirmDialog
        open={memberResetTarget != null}
        orgName={memberResetTarget?.name[locale] ?? ''}
        onOpenChange={(open) => { if (!open) setMemberResetTarget(null); }}
        onConfirm={handleMemberResetConfirm}
      />
      <MemberRemoveConfirmDialog
        open={memberRemoveTarget != null}
        orgName={memberRemoveTarget?.name[locale] ?? ''}
        onOpenChange={(open) => { if (!open) setMemberRemoveTarget(null); }}
        onConfirm={handleMemberRemoveConfirm}
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

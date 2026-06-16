import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Calendar, Check, ChevronDown, ChevronRight, Lock, Pencil, Unlock,
  Users, MapPin, Sprout, HandCoins, ClipboardCheck, Send,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { Button } from '@/core/components/ui/button';
import { formatCalendarDate } from '@/lib/dateHelpers';
import { DEFAULT_WORKSHOPS, type WorkshopConfig } from '@shared/cohort-schema';

// Per-workshop topic icon — gives each card a visual identity beyond
// just the state badge. Keyed by index (W1..W6). Falls back to a
// generic icon if a cohort has more or fewer workshops than expected.
const TOPIC_ICONS: LucideIcon[] = [
  Users,            // W1 — Who We Are
  MapPin,           // W2 — Where We Work
  Sprout,           // W3 — What We Build
  HandCoins,        // W4 — What We Need
  ClipboardCheck,   // W5 — Results & Evidence
  Send,             // W6 — Wrap-up & Review
];

// ---------------------------------------------------------------------------
// WorkshopCadence — the rail of workshops on /orchestrator. Visually
// differentiates past / current / next-up / locked workshops so the
// coordinator knows at a glance where the cohort is and what to do next.
//
// Two distinct dates per workshop:
//   - `date`     — the *scheduled* workshop date (editable any time)
//   - `openedAt` — set the moment the coordinator clicks "Open for cohort".
//                  This is the source of truth for state (held vs not).
//
// The most-recent opened workshop is Open; everything earlier is Past;
// the next workshop is Next-up; everything after that is Locked. The
// "Open for cohort" CTA appears only on Next-up — a single focused action.
// ---------------------------------------------------------------------------

type WorkshopState = 'past' | 'open' | 'nextUp' | 'locked';

function computeState(workshops: WorkshopConfig[]): WorkshopState[] {
  const openedIndices = workshops
    .map((w, i) => (w.openedAt ? i : -1))
    .filter(i => i >= 0);
  const lastOpenedIndex = openedIndices.length ? Math.max(...openedIndices) : -1;

  return workshops.map((w, i) => {
    if (w.openedAt) return i < lastOpenedIndex ? 'past' : 'open';
    if (i === lastOpenedIndex + 1) return 'nextUp';
    return 'locked';
  });
}

function formatShortDate(iso: string, locale: string): string {
  return formatCalendarDate(iso, locale);
}

// ---------------------------------------------------------------------------
// Inline date editor — click the date pill, edit, blur or Enter to save.
// ---------------------------------------------------------------------------
function DatePill({
  value,
  placeholder,
  disabled,
  emphasis,
  onSave,
}: {
  value: string | null;
  placeholder: string;
  disabled?: boolean;
  emphasis?: 'muted' | 'accent';
  onSave: (next: string | null) => void;
}) {
  const { i18n } = useTranslation();
  const locale = i18n.language?.startsWith('pt') ? 'pt-BR' : 'en-US';
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value ?? '');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);
  useEffect(() => { setDraft(value ?? ''); }, [value]);

  const commit = () => {
    const next = draft.trim() ? draft.trim() : null;
    if (next !== (value ?? null)) onSave(next);
    setEditing(false);
  };

  if (editing && !disabled) {
    return (
      <input
        ref={inputRef}
        type="date"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') { e.currentTarget.blur(); }
          else if (e.key === 'Escape') { setDraft(value ?? ''); setEditing(false); }
        }}
        className="h-6 text-[11px] px-2 rounded-md border border-emerald-300 focus:ring-2 focus:ring-emerald-300/40 focus:outline-none bg-background"
      />
    );
  }

  const baseTone =
    emphasis === 'accent'
      ? 'text-emerald-700 dark:text-emerald-300 border-emerald-200/60 dark:border-emerald-900/40'
      : 'text-muted-foreground border-foreground/10';

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => !disabled && setEditing(true)}
      className={`group inline-flex items-center gap-1 text-[11px] px-2 h-6 rounded-md border bg-background/50 hover:bg-background ${baseTone} ${disabled ? 'cursor-default' : 'cursor-pointer'}`}
    >
      <Calendar className="w-3 h-3" />
      <span>{value ? formatShortDate(value, locale) : placeholder}</span>
      {!disabled && <Pencil className="w-2.5 h-2.5 opacity-0 group-hover:opacity-60 transition-opacity" />}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Held-on pill — non-editable indicator of when a workshop was opened.
// Renders for Past and Open states.
// ---------------------------------------------------------------------------
function HeldOnPill({ openedAt }: { openedAt: string }) {
  const { t, i18n } = useTranslation();
  const locale = i18n.language?.startsWith('pt') ? 'pt-BR' : 'en-US';
  return (
    <span className="inline-flex items-center gap-1 text-[11px] px-2 h-6 rounded-md border border-emerald-200/60 dark:border-emerald-900/40 bg-emerald-50/60 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-300">
      <Check className="w-3 h-3" />
      <span>
        {t('orchestrator.cohort.heldOn', {
          defaultValue: 'Held {{date}}',
          date: formatShortDate(openedAt, locale),
        })}
      </span>
    </span>
  );
}

// ---------------------------------------------------------------------------
// Single workshop row.
// ---------------------------------------------------------------------------
function WorkshopRow({
  workshop,
  state,
  index,
  disabled,
  onOpenForCohort,
  onUpdateDate,
}: {
  workshop: WorkshopConfig;
  state: WorkshopState;
  index: number;
  disabled?: boolean;
  onOpenForCohort: () => void;
  onUpdateDate: (date: string | null) => void;
}) {
  const { t, i18n } = useTranslation();
  const locale = i18n.language?.startsWith('pt') ? 'pt-BR' : 'en-US';

  // Curriculum context fallback — existing cohorts in the DB may have
  // workshops without description/expectedOutput (created before these
  // fields existed). Look up by unlocksPhase + index in DEFAULT_WORKSHOPS
  // so the orchestrator sees the curriculum context immediately, without
  // requiring a DB migration of every cohort.
  const defaultForThisWorkshop =
    DEFAULT_WORKSHOPS[index] && DEFAULT_WORKSHOPS[index].unlocksPhase === workshop.unlocksPhase
      ? DEFAULT_WORKSHOPS[index]
      : DEFAULT_WORKSHOPS.find(w => w.unlocksPhase === workshop.unlocksPhase);
  const description = workshop.description ?? defaultForThisWorkshop?.description;
  const expectedOutput = workshop.expectedOutput ?? defaultForThisWorkshop?.expectedOutput;

  // Visual treatment per state — premium, not loud.
  const stateMeta = {
    // Past: very subtle green tint + small green icon — "completed but
    // not the focus". Content still visible, just muted.
    past: {
      ring: 'border-emerald-200/40 dark:border-emerald-900/30',
      bg: 'bg-emerald-50/20 dark:bg-emerald-950/10',
      iconBg: 'bg-emerald-100/60 dark:bg-emerald-950/40',
      iconColor: 'text-emerald-700/80 dark:text-emerald-300/80',
      Icon: Check,
      titleClass: 'text-foreground/70',
      pill: t('orchestrator.cohort.statePast', { defaultValue: 'Held' }),
      pillClass: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300 border-emerald-200/50 dark:border-emerald-900/40',
      contentOpacity: 'opacity-60',
    },
    // Open / live: the strongest green treatment. Solid green wash on
    // the background + bold green border. No action button (it's
    // already open). This is the "what is happening RIGHT NOW" card.
    open: {
      ring: 'border-emerald-400 dark:border-emerald-700 ring-2 ring-emerald-200/50 dark:ring-emerald-950/40',
      bg: 'bg-emerald-50/70 dark:bg-emerald-950/30',
      iconBg: 'bg-emerald-500 dark:bg-emerald-500',
      iconColor: 'text-white',
      Icon: Check,
      titleClass: 'text-foreground font-semibold',
      pill: t('orchestrator.cohort.stateOpen', { defaultValue: 'Live now' }),
      pillClass: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300 border-emerald-300/60 dark:border-emerald-900/60',
      contentOpacity: '',
    },
    // Next up: NEUTRAL bg so it doesn't compete with OPEN. The emerald
    // CTA at the bottom is the visual anchor — the only solid-emerald
    // action on the screen.
    nextUp: {
      ring: 'border-foreground/15 dark:border-foreground/20',
      bg: 'bg-background',
      iconBg: 'bg-foreground/[0.04] dark:bg-foreground/10',
      iconColor: 'text-foreground/60',
      Icon: ChevronRight,
      titleClass: 'text-foreground font-semibold',
      pill: t('orchestrator.cohort.stateNextUp', { defaultValue: 'Next up' }),
      pillClass: 'bg-foreground/5 text-foreground/70 border-foreground/10 dark:bg-foreground/10',
      contentOpacity: '',
    },
    // Locked: lightest neutral, dimmer content, lock icon overlay on
    // the topic-icon tile.
    locked: {
      ring: 'border-foreground/8',
      bg: 'bg-background',
      iconBg: 'bg-foreground/[0.03] dark:bg-foreground/5',
      iconColor: 'text-foreground/35',
      Icon: Lock,
      titleClass: 'text-foreground/55',
      pill: t('orchestrator.cohort.stateLocked', { defaultValue: 'Locked' }),
      pillClass: 'bg-transparent text-muted-foreground border-foreground/10',
      contentOpacity: 'opacity-50',
    },
  }[state];

  const StateIcon = stateMeta.Icon;
  const TopicIcon = TOPIC_ICONS[index] ?? Calendar;

  // Split expectedOutput into bullets on sentence boundaries.
  const outputBullets = expectedOutput
    ? expectedOutput
        .split(/(?<=[.!?])\s+/)
        .map(s => s.trim())
        .filter(s => s.length > 0)
    : [];

  // Collapsible: minimized by default to keep the cadence compact, with the
  // active (open) + next-up workshops expanded so their detail + CTA are
  // immediately visible. The whole header toggles; a chevron signals state.
  const [collapsed, setCollapsed] = useState(state !== 'open' && state !== 'nextUp');

  return (
    <div
      className={`relative rounded-xl border ${stateMeta.ring} ${stateMeta.bg} transition-all ${collapsed ? 'p-2.5' : 'p-3.5'}`}
      data-testid={`workshop-row-${index}-${state}`}
    >
      {/* Header row — topic icon, name, state pill. Click to expand/collapse. */}
      <button
        type="button"
        onClick={() => setCollapsed(c => !c)}
        aria-expanded={!collapsed}
        className="w-full flex items-start gap-3 text-left"
        data-testid={`workshop-toggle-${index}`}
      >
        {/* Topic icon tile — workshop-specific identity. State overlay
            (✓ / lock) in the bottom-right corner for past + locked. */}
        <div className="relative shrink-0">
          <div
            className={`w-10 h-10 rounded-xl flex items-center justify-center ${stateMeta.iconBg} ${
              state === 'open' ? 'ring-1 ring-emerald-500/30' : ''
            } ${state === 'past' ? 'ring-1 ring-emerald-200 dark:ring-emerald-900/60' : ''}`}
          >
            <TopicIcon className={`w-5 h-5 ${stateMeta.iconColor}`} strokeWidth={2} />
          </div>
          {(state === 'past' || state === 'locked') && (
            <div
              className={`absolute -bottom-0.5 -right-0.5 w-4 h-4 rounded-full flex items-center justify-center ring-2 ring-background ${
                state === 'past' ? 'bg-emerald-600' : 'bg-foreground/40'
              }`}
            >
              <StateIcon className="w-2.5 h-2.5 text-white" strokeWidth={3} />
            </div>
          )}
        </div>

        {/* Title + state pill */}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`text-sm tracking-tight ${stateMeta.titleClass}`}>
              {workshop.name}
            </span>
            <span
              className={`inline-flex items-center gap-1 text-[9px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded-full border ${stateMeta.pillClass}`}
            >
              {state === 'open' && (
                <span className="relative flex h-1.5 w-1.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                  <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-500" />
                </span>
              )}
              {stateMeta.pill}
            </span>
          </div>
        </div>

        {/* Expand/collapse affordance */}
        <ChevronDown
          className={`shrink-0 mt-1 w-4 h-4 text-muted-foreground transition-transform ${collapsed ? '-rotate-90' : ''}`}
          strokeWidth={2}
        />
      </button>

      {!collapsed && (<>
      {/* Body + footer — shown only when the row is expanded. State-driven
          opacity dims past + locked so the eye still flows to active ones. */}
      <div className={stateMeta.contentOpacity}>
        {description && (
          <p className="mt-3 text-[12px] leading-relaxed text-foreground/80">
            {description}
          </p>
        )}

        {outputBullets.length > 0 && (
          <div className="mt-3 rounded-lg bg-background/60 dark:bg-background/40 border border-foreground/5 p-2.5">
            <div className="flex items-center gap-1.5 mb-1.5">
              <ClipboardCheck className="w-3 h-3 text-emerald-700/80 dark:text-emerald-300/80" />
              <span className="text-[9px] font-semibold uppercase tracking-wider text-emerald-700/80 dark:text-emerald-300/80">
                {t('orchestrator.cohort.expectedOutput', { defaultValue: 'Expected output' })}
              </span>
            </div>
            <ul className="space-y-1">
              {outputBullets.map((bullet, i) => (
                <li key={i} className="flex items-start gap-2 text-[11px] leading-snug text-foreground/75">
                  <span className="mt-1 shrink-0 w-1 h-1 rounded-full bg-emerald-500/60" />
                  <span>{bullet}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {/* Footer — date pill / held pill + phase label, plus the CTA on
          Next-up. The "Open for cohort" emerald button is the only solid
          emerald action on the screen, so it stands alone as the
          coordinator's primary call to action. */}
      <div className="mt-3 flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2 flex-wrap">
          {workshop.openedAt ? (
            <HeldOnPill openedAt={workshop.openedAt} />
          ) : (
            <DatePill
              value={workshop.date}
              placeholder={
                state === 'nextUp'
                  ? t('orchestrator.cohort.scheduleDate', { defaultValue: 'Schedule date' })
                  : t('orchestrator.cohort.addDate', { defaultValue: 'Add date' })
              }
              emphasis={state === 'nextUp' ? 'accent' : 'muted'}
              disabled={disabled || state === 'locked'}
              onSave={onUpdateDate}
            />
          )}
          <span className="text-[10px] text-muted-foreground">
            {t('orchestrator.cohort.unlocksPhaseLabel', {
              defaultValue: 'Opens Phase {{phase}}',
              phase: workshop.unlocksPhase,
            })}
          </span>
        </div>

        {state === 'nextUp' && (
          <Button
            size="sm"
            disabled={disabled}
            className="h-9 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold whitespace-nowrap shadow-sm"
            onClick={onOpenForCohort}
            data-testid={`button-open-workshop-${index}`}
          >
            <Unlock className="w-3.5 h-3.5 mr-1.5" />
            {t('orchestrator.cohort.openForCohort', { defaultValue: 'Open for cohort' })}
          </Button>
        )}
      </div>
      </>)}
    </div>
  );
}

// ---------------------------------------------------------------------------
// The full rail.
// ---------------------------------------------------------------------------
export function WorkshopCadence({
  workshops,
  disabled,
  onOpenWorkshop,
  onUpdateWorkshops,
}: {
  workshops: WorkshopConfig[];
  /** True in sample mode — actions are no-ops with a toast handled by caller. */
  disabled?: boolean;
  /**
   * Coordinator clicked "Open for cohort" on `index`. Caller should: bulk-unlock
   * the workshop's phase + persist `today` as the workshop's date (if blank).
   */
  onOpenWorkshop: (index: number, todayISO: string) => Promise<void>;
  /** Caller persists the workshops array (used by inline date editor). */
  onUpdateWorkshops: (workshops: WorkshopConfig[]) => Promise<void>;
}) {
  const { t } = useTranslation();
  const states = useMemo(() => computeState(workshops), [workshops]);

  if (workshops.length === 0) return null;

  return (
    <div className="mt-3 pt-3 border-t border-foreground/5">
      <div className="flex items-center justify-between mb-2.5">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          {t('orchestrator.cohort.workshops', { defaultValue: 'Workshop cadence' })}
        </span>
        <span className="text-[10px] text-muted-foreground">
          {(() => {
            const heldCount = workshops.filter(w => w.date).length;
            return t('orchestrator.cohort.heldOf', {
              defaultValue: '{{held}} of {{total}} held',
              held: heldCount,
              total: workshops.length,
            });
          })()}
        </span>
      </div>

      <div className="flex flex-col gap-2">
        {workshops.map((w, i) => (
          <WorkshopRow
            key={i}
            workshop={w}
            state={states[i]}
            index={i}
            disabled={disabled}
            onOpenForCohort={async () => {
              const today = new Date().toISOString().slice(0, 10);
              await onOpenWorkshop(i, today);
            }}
            onUpdateDate={async (next) => {
              const updated = workshops.map((w2, j) => (j === i ? { ...w2, date: next } : w2));
              await onUpdateWorkshops(updated);
            }}
          />
        ))}
      </div>
    </div>
  );
}

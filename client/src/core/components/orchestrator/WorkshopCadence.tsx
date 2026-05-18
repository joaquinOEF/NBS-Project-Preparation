import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Calendar, Check, ChevronRight, Lock, Pencil, Unlock } from 'lucide-react';
import { Button } from '@/core/components/ui/button';
import { formatCalendarDate } from '@/lib/dateHelpers';
import { DEFAULT_WORKSHOPS, type WorkshopConfig } from '@shared/cohort-schema';

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
  const { t } = useTranslation();

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
    past: {
      ring: 'border-foreground/8',
      bg: 'bg-background',
      iconBg: 'bg-emerald-100 dark:bg-emerald-950/40',
      iconColor: 'text-emerald-700 dark:text-emerald-300',
      Icon: Check,
      titleClass: 'text-foreground/75',
      pill: t('orchestrator.cohort.statePast', { defaultValue: 'Held' }),
      pillClass: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300 border-emerald-200/50 dark:border-emerald-900/40',
    },
    open: {
      ring: 'border-emerald-300/60 dark:border-emerald-800/60 ring-2 ring-emerald-200/40 dark:ring-emerald-950/40',
      bg: 'bg-emerald-50/50 dark:bg-emerald-950/20',
      iconBg: 'bg-emerald-500 dark:bg-emerald-500',
      iconColor: 'text-white',
      Icon: Check,
      titleClass: 'text-foreground font-semibold',
      pill: t('orchestrator.cohort.stateOpen', { defaultValue: 'Open · today' }),
      pillClass: 'bg-emerald-600 text-white border-emerald-700/0',
    },
    nextUp: {
      ring: 'border-emerald-300 dark:border-emerald-800',
      bg: 'bg-emerald-50/30 dark:bg-emerald-950/10',
      iconBg: 'bg-emerald-100 dark:bg-emerald-950/40',
      iconColor: 'text-emerald-700 dark:text-emerald-300',
      Icon: ChevronRight,
      titleClass: 'text-foreground font-semibold',
      pill: t('orchestrator.cohort.stateNextUp', { defaultValue: 'Next up' }),
      pillClass: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300 border-emerald-300/60 dark:border-emerald-900/60',
    },
    locked: {
      ring: 'border-foreground/8',
      bg: 'bg-background',
      iconBg: 'bg-foreground/5',
      iconColor: 'text-foreground/40',
      Icon: Lock,
      titleClass: 'text-foreground/60',
      pill: t('orchestrator.cohort.stateLocked', { defaultValue: 'Locked' }),
      pillClass: 'bg-transparent text-muted-foreground border-foreground/10',
    },
  }[state];

  const Icon = stateMeta.Icon;

  return (
    <div
      className={`flex items-center gap-3 rounded-xl border ${stateMeta.ring} ${stateMeta.bg} px-3 py-2.5 transition-all`}
      data-testid={`workshop-row-${index}-${state}`}
    >
      {/* State icon */}
      <div className={`shrink-0 w-7 h-7 rounded-full flex items-center justify-center ${stateMeta.iconBg}`}>
        <Icon className={`w-3.5 h-3.5 ${stateMeta.iconColor}`} strokeWidth={2.5} />
      </div>

      {/* Main column */}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          <span className={`text-xs tracking-tight ${stateMeta.titleClass}`}>{workshop.name}</span>
          <span className={`inline-flex items-center text-[9px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded-full border ${stateMeta.pillClass}`}>
            {stateMeta.pill}
          </span>
        </div>

        {/* Curriculum context — description + expected output. Muted but
            readable so coordinator knows at a glance what this workshop
            covers and what the CBO should have done by the end. */}
        {(description || expectedOutput) && (
          <div className={`mt-1.5 space-y-1 ${state === 'locked' ? 'opacity-60' : ''}`}>
            {description && (
              <p className="text-[11px] leading-snug text-muted-foreground">
                {description}
              </p>
            )}
            {expectedOutput && (
              <p className="text-[11px] leading-snug">
                <span className="text-[9px] font-semibold uppercase tracking-wider text-emerald-700/80 dark:text-emerald-300/80 mr-1">
                  {t('orchestrator.cohort.expectedOutput', { defaultValue: 'Expected output' })}:
                </span>
                <span className="text-foreground/70">{expectedOutput}</span>
              </p>
            )}
          </div>
        )}

        <div className="mt-2 flex items-center gap-2 flex-wrap">
          {/* For Past / Open: show the held-on date inline; the scheduled date
              is secondary. For Next-up / Locked: show the schedule pill so
              coordinator can plan ahead. */}
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
              disabled={disabled}
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
      </div>

      {/* Action column — only next-up gets the CTA */}
      {state === 'nextUp' && (
        <Button
          size="sm"
          disabled={disabled}
          className="h-8 bg-emerald-600 hover:bg-emerald-700 text-white text-xs whitespace-nowrap"
          onClick={onOpenForCohort}
          data-testid={`button-open-workshop-${index}`}
        >
          <Unlock className="w-3 h-3 mr-1.5" />
          {t('orchestrator.cohort.openForCohort', { defaultValue: 'Open for cohort' })}
        </Button>
      )}
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

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-2">
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

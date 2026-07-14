import { useTranslation } from 'react-i18next';
import { Check, Lock } from 'lucide-react';
import {
  Popover, PopoverContent, PopoverTrigger,
} from '@/core/components/ui/popover';
import type { WorkshopConfig } from '@shared/cohort-schema';
import { formatCalendarDate } from '@/lib/dateHelpers';
import { localizedWorkshopName } from '@/lib/workshopHelpers';

// ---------------------------------------------------------------------------
// CboProgress — friendly progress display that replaces the
// `1 · 2 · 3a · 3b · 3c · 4 · 5` developer strip with a calm five-segment bar
// + a "Section X of 5" caption. Locked segments are tappable on mobile and
// open a Popover explaining when the coordinator will unlock them.
// ---------------------------------------------------------------------------

type Phase = { num: 1 | 2 | 3 | 4 | 5; key: string };

const PHASES: Phase[] = [
  { num: 1, key: 'who' },
  { num: 2, key: 'where' },
  { num: 3, key: 'building' },
  { num: 4, key: 'needs' },
  { num: 5, key: 'results' },
];

export function CboProgress({
  currentPhase,
  unlockedPhases,
  workshops,
  onJumpToPhase,
}: {
  /** Numeric phase 1..5 (we collapse sub-phases 3a/b/c into 3). */
  currentPhase: number;
  unlockedPhases: number[];
  workshops: WorkshopConfig[];
  /** Called when the user taps an unlocked phase segment to navigate there.
   *  DEMO-ONLY (ENABLE_PHASE_SKIP): the jump overwrites earlier sections with
   *  sample data. Omit it (the default in prod) and the segments render as
   *  plain, non-interactive progress indicators. */
  onJumpToPhase?: (phaseNum: number) => void;
}) {
  const { t, i18n } = useTranslation();
  const isPt = i18n.language?.startsWith('pt');
  const currentLabel = t(`cbo.progress.phase.${PHASES[Math.max(0, Math.min(4, currentPhase - 1))].key}`, {
    defaultValue: {
      who: 'Who you are',
      where: 'Where you work',
      building: 'What you build',
      needs: 'What you need',
      results: 'Results & evidence',
    }[PHASES[Math.max(0, Math.min(4, currentPhase - 1))].key],
  });

  return (
    <div className="space-y-1.5">
      {/* Caption row */}
      <div className="flex items-center justify-between gap-2 text-[11px]">
        <span className="text-muted-foreground">
          {t('cbo.progress.sectionOf', {
            defaultValue: `Section ${currentPhase} of 5`,
            current: currentPhase,
            total: 5,
          })}
          {' · '}
          <span className="text-foreground/85 font-medium">{currentLabel}</span>
        </span>
      </div>

      {/* Segments */}
      <div className="flex items-center gap-1">
        {PHASES.map((p) => {
          const isCompleted = p.num < currentPhase;
          const isActive = p.num === currentPhase;
          const isUnlocked = unlockedPhases.includes(p.num);
          const segmentLabel = t(`cbo.progress.phase.${p.key}`, {
            defaultValue: {
              who: 'Who you are',
              where: 'Where you work',
              building: 'What you build',
              needs: 'What you need',
              results: 'Results & evidence',
            }[p.key],
          });

          // Color tokens — emerald gradient ⇒ muted ⇒ locked.
          const bg =
            isCompleted ? 'bg-emerald-500'
            : isActive ? 'bg-emerald-400'
            : isUnlocked ? 'bg-foreground/15'
            : 'bg-foreground/8';
          const ring = isActive ? 'ring-2 ring-emerald-500/30' : '';

          if (!isUnlocked) {
            const workshop = workshops.find(w => w.unlocksPhase === p.num);
            const workshopName = localizedWorkshopName(t, workshops, workshop);
            const workshopDate = workshop?.date
              ? formatCalendarDate(workshop.date, isPt ? 'pt-BR' : 'en-US', { weekday: 'long', day: 'numeric', month: 'short' })
              : null;
            return (
              <Popover key={p.num}>
                <PopoverTrigger asChild>
                  <button
                    className={`flex-1 h-1.5 rounded-full ${bg} relative group cursor-help`}
                    aria-label={`Phase ${p.num} locked`}
                    data-testid={`cbo-progress-locked-${p.num}`}
                  >
                    <Lock className="absolute -top-3 left-1/2 -translate-x-1/2 w-2.5 h-2.5 text-foreground/30" strokeWidth={2.5} />
                  </button>
                </PopoverTrigger>
                <PopoverContent side="top" align="center" className="w-[260px] text-xs">
                  <div className="space-y-1">
                    <p className="font-medium text-foreground/90">{segmentLabel}</p>
                    <p className="text-muted-foreground">
                      {workshop
                        ? t('cbo.progress.lockedWithWorkshop', {
                            defaultValue: `Opens after ${workshopName}${workshopDate ? ` · ${workshopDate}` : ''}`,
                            workshop: workshopName,
                            date: workshopDate ?? '',
                          })
                        : t('cbo.progress.lockedNoWorkshop', { defaultValue: 'Your coordinator will open this section.' })}
                    </p>
                  </div>
                </PopoverContent>
              </Popover>
            );
          }

          if (!onJumpToPhase) {
            // Plain indicator — no tap target at all when phase-skipping is
            // off (the prod default): a progress bar must never be one
            // accidental thumb-tap away from rewriting the profile.
            return (
              <div
                key={p.num}
                className={`flex-1 h-1.5 rounded-full ${bg} ${isCompleted ? 'flex items-center justify-center' : ''}`}
                aria-label={`Phase ${p.num} (${segmentLabel})`}
                data-testid={`cbo-progress-unlocked-${p.num}`}
                title={segmentLabel}
              >
                {isCompleted && <Check className="w-2 h-2 text-white" strokeWidth={3} />}
              </div>
            );
          }
          return (
            <button
              key={p.num}
              className={`flex-1 h-1.5 rounded-full ${bg} ${ring} transition-all hover:opacity-80 ${isCompleted ? 'flex items-center justify-center' : ''}`}
              onClick={() => onJumpToPhase(p.num)}
              aria-label={`Go to phase ${p.num} (${segmentLabel})`}
              data-testid={`cbo-progress-unlocked-${p.num}`}
              title={segmentLabel}
            >
              {isCompleted && <Check className="w-2 h-2 text-white" strokeWidth={3} />}
            </button>
          );
        })}
      </div>
    </div>
  );
}

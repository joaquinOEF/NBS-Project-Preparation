import { useTranslation } from 'react-i18next';
import { motion } from 'framer-motion';
import { Calendar, Clock, Leaf, Sprout } from 'lucide-react';
import { Button } from '@/core/components/ui/button';
import type { WorkshopConfig } from '@shared/cohort-schema';
import { formatCalendarDate } from '@/lib/dateHelpers';

// ---------------------------------------------------------------------------
// CBO welcome screen — the first thing a community leader sees after tapping
// the invite link from WhatsApp. Aims to feel calm, considered, in their
// language. No platform chrome, no chat yet. One job: build confidence and
// invite them to start.
// ---------------------------------------------------------------------------
export function CboWelcome({
  orgName,
  neighborhood,
  cohortName,
  nextWorkshop,
  unlockedPhases,
  onStart,
  onResume,
  hasExistingProgress,
}: {
  orgName: string;
  neighborhood: string | null;
  cohortName: string | null;
  nextWorkshop: WorkshopConfig | null;
  unlockedPhases: number[];
  onStart: () => void;
  onResume: () => void;
  hasExistingProgress: boolean;
}) {
  const { t, i18n } = useTranslation();
  const isPt = i18n.language?.startsWith('pt');
  const phasesUnlockedCount = unlockedPhases.length;

  const workshopDateLabel = nextWorkshop?.date
    ? formatCalendarDate(nextWorkshop.date, isPt ? 'pt-BR' : 'en-US', {
        weekday: 'long', day: 'numeric', month: 'long',
      })
    : null;

  return (
    <div className="min-h-[100dvh] flex flex-col bg-gradient-to-b from-emerald-50/60 via-white to-emerald-50/40 dark:from-emerald-950/30 dark:via-background dark:to-emerald-950/20">
      {/* Top bar — quiet brand mark, no other chrome */}
      <header className="px-5 sm:px-8 py-5 flex items-center gap-2 text-emerald-700 dark:text-emerald-400">
        <Leaf className="w-4 h-4" strokeWidth={1.75} />
        <span className="text-xs font-medium uppercase tracking-[0.18em]">
          {t('cbo.welcome.brand', { defaultValue: 'COUGAR · Vila Flores' })}
        </span>
      </header>

      {/* Hero */}
      <main className="flex-1 flex flex-col justify-center max-w-md mx-auto w-full px-5 sm:px-8 py-8">
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
          className="space-y-7"
        >
          {/* Greeting */}
          <div className="space-y-2">
            <p className="text-sm text-emerald-700/80 dark:text-emerald-300/80 font-medium">
              {t('cbo.welcome.greeting', { defaultValue: 'Olá,' })}
            </p>
            <h1 className="text-3xl sm:text-4xl font-semibold tracking-tight leading-tight text-foreground">
              {orgName}
            </h1>
            {neighborhood && (
              <p className="text-sm text-muted-foreground">
                {t('cbo.welcome.neighborhood', { defaultValue: 'from {{n}}', n: neighborhood })}
              </p>
            )}
          </div>

          {/* The invitation framing */}
          <div className="space-y-3 text-foreground/85 leading-relaxed">
            <p className="text-base">
              {t('cbo.welcome.invitationLead', {
                defaultValue: cohortName
                  ? `You've been invited to the ${cohortName} platform — a quiet space to share what your organization does, where you work, and what you need to move your project forward.`
                  : "You've been invited to a quiet space to share what your organization does, where you work, and what you need to move your project forward.",
                cohort: cohortName ?? '',
              })}
            </p>
            <p className="text-sm text-muted-foreground">
              {t('cbo.welcome.invitationFraming', {
                defaultValue: "We'll build this together, one part at a time. Each section opens after the workshop where we cover it.",
              })}
            </p>
          </div>

          {/* Next workshop card */}
          {nextWorkshop && (
            <motion.div
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.15 }}
              className="rounded-xl border border-emerald-200/60 bg-white/70 dark:border-emerald-900/40 dark:bg-emerald-950/30 px-4 py-3 backdrop-blur-sm"
            >
              <p className="text-[10px] uppercase tracking-wider text-emerald-700/70 dark:text-emerald-400/70 font-semibold mb-1.5">
                {t('cbo.welcome.nextWorkshopLabel', { defaultValue: 'Next workshop' })}
              </p>
              <p className="text-sm font-medium text-foreground/90">{nextWorkshop.name}</p>
              {workshopDateLabel && (
                <p className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Calendar className="w-3 h-3" />
                  {workshopDateLabel}
                </p>
              )}
            </motion.div>
          )}

          {/* Section preview — what we'll do */}
          <div className="space-y-1.5">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
              {t('cbo.welcome.whatWeWillDoLabel', { defaultValue: "What we'll do together" })}
            </p>
            <ol className="space-y-1.5">
              {[
                { label: t('cbo.welcome.step1', { defaultValue: 'Who you are' }), unlocked: unlockedPhases.includes(1) },
                { label: t('cbo.welcome.step2', { defaultValue: 'Where you work' }), unlocked: unlockedPhases.includes(2) },
                { label: t('cbo.welcome.step3', { defaultValue: 'What you build' }), unlocked: unlockedPhases.includes(3) },
                { label: t('cbo.welcome.step4', { defaultValue: 'What you need' }), unlocked: unlockedPhases.includes(4) },
                { label: t('cbo.welcome.step5', { defaultValue: 'Results & evidence' }), unlocked: unlockedPhases.includes(5) },
              ].map((s, i) => (
                <li key={i} className="flex items-center gap-2.5 text-sm">
                  <span className={`shrink-0 w-1.5 h-1.5 rounded-full ${s.unlocked ? 'bg-emerald-500' : 'bg-foreground/15'}`} />
                  <span className={s.unlocked ? 'text-foreground/85' : 'text-muted-foreground/60'}>{s.label}</span>
                </li>
              ))}
            </ol>
          </div>

          {/* CTA */}
          <div className="pt-2 space-y-2">
            <Button
              size="lg"
              className="w-full bg-emerald-600 hover:bg-emerald-700 text-white rounded-full h-12 text-base font-medium shadow-sm"
              onClick={hasExistingProgress ? onResume : onStart}
              data-testid="button-cbo-welcome-cta"
            >
              {hasExistingProgress
                ? t('cbo.welcome.ctaResume', { defaultValue: 'Continue where I left off' })
                : t('cbo.welcome.ctaStart', { defaultValue: 'Start' })}
            </Button>
            {hasExistingProgress && (
              <button
                className="w-full text-xs text-muted-foreground hover:text-foreground/80 py-1.5"
                onClick={onStart}
              >
                {t('cbo.welcome.ctaStartOver', { defaultValue: 'Or start over' })}
              </button>
            )}
            <p className="flex items-center justify-center gap-1.5 text-[11px] text-muted-foreground/70 pt-1">
              <Clock className="w-3 h-3" />
              {t('cbo.welcome.timeEstimate', { defaultValue: 'About 20 min total, across the workshops. Saves automatically.' })}
            </p>
          </div>
        </motion.div>

        {/* Soft footer */}
        <p className="mt-12 flex items-center justify-center gap-1.5 text-[11px] text-muted-foreground/60">
          <Sprout className="w-3 h-3" />
          {t('cbo.welcome.footer', { defaultValue: 'Open Earth Foundation · COUGAR pilot' })}
        </p>
      </main>
    </div>
  );
}

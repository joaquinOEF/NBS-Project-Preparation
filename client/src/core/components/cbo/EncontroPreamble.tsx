// Per-encontro preamble — shown once at the start of each workshop session.
// Frames what this encontro covers, what tools the user will encounter, and
// the time budget. Dismissable; the dismissal is persisted per-encontro per-CBO
// in localStorage so the same preamble doesn't fire twice.
//
// Spec: knowledge/runs/2026-05-15-encontros-curriculum/E{N}-*/spec.md (Preamble section)

import { useTranslation } from 'react-i18next';
import { motion } from 'framer-motion';
import { Clock, ArrowRight } from 'lucide-react';
import { Button } from '@/core/components/ui/button';

export type EncontroPreambleConfig = {
  /** 1-6 — used for the storage key and the eyebrow ("ENCONTRO 1") */
  encontroNumber: number;
  /** Title under the eyebrow */
  title: string;
  /** Lead sentence — "Hoje queremos…" */
  lead: string;
  /** Bullet list of what they'll do */
  bullets: string[];
  /** Optional second list — "you'll use" — for encontros with microapps */
  toolsTheyWillUse?: string[];
  /** Display string like "20–30 min · Salva sozinho" */
  timeEstimate: string;
  /** CTA label */
  cta: string;
};

export function EncontroPreamble({
  config,
  onContinue,
}: {
  config: EncontroPreambleConfig;
  onContinue: () => void;
}) {
  const { t } = useTranslation();

  return (
    <div className="min-h-[100dvh] flex flex-col bg-gradient-to-b from-emerald-50/60 via-white to-emerald-50/40 dark:from-emerald-950/30 dark:via-background dark:to-emerald-950/20 safe-top safe-bottom safe-x">
      <main className="flex-1 flex flex-col justify-center max-w-md mx-auto w-full px-5 sm:px-8 py-8">
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
          className="space-y-7"
        >
          <div className="space-y-1.5">
            <p className="text-[10px] uppercase tracking-[0.2em] text-emerald-700/80 dark:text-emerald-300/80 font-semibold">
              {t('cbo.encontroPreamble.eyebrow', {
                defaultValue: 'Encontro {{n}}',
                n: config.encontroNumber,
              })}
            </p>
            <h1 className="text-3xl sm:text-4xl font-semibold tracking-tight leading-tight text-foreground">
              {config.title}
            </h1>
          </div>

          <p className="text-base text-foreground/85 leading-relaxed">{config.lead}</p>

          <div className="space-y-1.5">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
              {t('cbo.encontroPreamble.whatWeWillDo', { defaultValue: "What we'll do together" })}
            </p>
            <ul className="space-y-1.5">
              {config.bullets.map((b, i) => (
                <li key={i} className="flex items-start gap-2.5 text-sm text-foreground/85 leading-relaxed">
                  <span className="shrink-0 mt-2 w-1.5 h-1.5 rounded-full bg-emerald-500" />
                  <span>{b}</span>
                </li>
              ))}
            </ul>
          </div>

          {config.toolsTheyWillUse && config.toolsTheyWillUse.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
                {t('cbo.encontroPreamble.youWillUse', { defaultValue: "You'll use" })}
              </p>
              <ul className="space-y-1.5">
                {config.toolsTheyWillUse.map((b, i) => (
                  <li key={i} className="flex items-start gap-2.5 text-sm text-foreground/70 leading-relaxed">
                    <span className="shrink-0 mt-2 w-1.5 h-1.5 rounded-full bg-foreground/20" />
                    <span>{b}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="pt-2 space-y-2">
            <Button
              size="lg"
              className="w-full bg-emerald-600 hover:bg-emerald-700 text-white rounded-full h-12 text-base font-medium shadow-sm"
              onClick={onContinue}
              data-testid={`button-encontro-${config.encontroNumber}-start`}
            >
              {config.cta}
              <ArrowRight className="w-4 h-4 ml-1.5" />
            </Button>
            <p className="flex items-center justify-center gap-1.5 text-[11px] text-muted-foreground/70 pt-1">
              <Clock className="w-3 h-3" />
              {config.timeEstimate}
            </p>
          </div>
        </motion.div>
      </main>
    </div>
  );
}

/** Storage helpers — per (memberSlug, encontroNumber) pair so a fresh-invite
 *  CBO always sees their preambles, but the same CBO doesn't see them twice. */
export function preambleSeenKey(memberSlugOrCboId: string, encontroNumber: number) {
  return `cbo-encontro-${encontroNumber}-preamble-seen-${memberSlugOrCboId}`;
}

export function markPreambleSeen(memberSlugOrCboId: string, encontroNumber: number) {
  try {
    localStorage.setItem(preambleSeenKey(memberSlugOrCboId, encontroNumber), '1');
  } catch {}
}

export function hasPreambleBeenSeen(memberSlugOrCboId: string, encontroNumber: number): boolean {
  try {
    return localStorage.getItem(preambleSeenKey(memberSlugOrCboId, encontroNumber)) === '1';
  } catch {
    return false;
  }
}

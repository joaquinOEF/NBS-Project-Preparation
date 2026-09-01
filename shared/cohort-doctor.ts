// ============================================================================
// COHORT DOCTOR — one verdict per organisation, computed once
// ============================================================================
// Shared deliberately. The pre-session script and the coordinator's own
// endpoint have to answer identically, or "the doctor says they're fine" and
// "the board says they're stuck" become two more records backing one fact —
// which is the shape of every bug in docs/w3-flow.md.
// ============================================================================

import { encontroClosed, cboSectionsFilledCount, type CboState } from './cbo-schema';
import { effectiveUnlockedPhases, type CohortSettings } from './cohort-schema';

export type OrgVerdict =
  | 'never-started'
  /** Still inside its encontro. Nothing to do. */
  | 'in-progress'
  /** ⚠️ Finished, and the next encontro is not open to it. Waiting on the coordination. */
  | 'ready-waiting'
  /** Finished, next encontro open — one tap away. */
  | 'ready-to-enter'
  | 'finished';

export interface OrgHealth {
  verdict: OrgVerdict;
  phase: number;
  sectionsFilled: number;
  /** What the ORG will get, cohort openings included — not the raw column. */
  unlockedPhases: number[];
  closed: boolean;
  nextOpen: number | null;
}

export function orgHealth(
  state: Pick<CboState, 'sections' | 'maturityScores'> & { phase?: number } | null | undefined,
  memberUnlockedPhases: unknown,
  settings: CohortSettings | null | undefined,
): OrgHealth {
  const phase = state?.phase ?? 0;
  const sectionsFilled = state ? cboSectionsFilledCount(state as any) : 0;
  const unlockedPhases = effectiveUnlockedPhases(memberUnlockedPhases, settings);
  const closed = !!state && phase >= 1 && encontroClosed(state, phase);
  const nextOpen = unlockedPhases.find(p => p > phase) ?? null;

  let verdict: OrgVerdict;
  if (!state || sectionsFilled === 0) verdict = 'never-started';
  else if (!closed) verdict = 'in-progress';
  else if (phase >= 5) verdict = 'finished';
  else if (nextOpen == null) verdict = 'ready-waiting';
  else verdict = 'ready-to-enter';

  return { verdict, phase, sectionsFilled, unlockedPhases, closed, nextOpen };
}

/** Worst first — in a list of eighteen the waiting ones must be impossible to miss. */
export const VERDICT_ORDER: OrgVerdict[] = [
  'ready-waiting', 'in-progress', 'never-started', 'ready-to-enter', 'finished',
];

export const VERDICT_PT: Record<OrgVerdict, string> = {
  'never-started': 'sem nenhuma resposta',
  'in-progress': 'no meio do encontro',
  'ready-waiting': 'terminou e está esperando',
  'ready-to-enter': 'pronta pra entrar no próximo',
  'finished': 'chegou ao fim do percurso',
};

export const VERDICT_EN: Record<OrgVerdict, string> = {
  'never-started': 'nothing answered yet',
  'in-progress': 'mid-encontro',
  'ready-waiting': 'finished, waiting on the coordination',
  'ready-to-enter': 'ready to enter the next one',
  'finished': 'reached the end',
};

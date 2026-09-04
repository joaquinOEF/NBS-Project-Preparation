// ============================================================================
// A TIMEOUT THAT SAYS SOMETHING
// ============================================================================
// The one thing every silently-disabled pass had in common was not the number.
// It was that losing the race produced NOTHING — no line, no marker, no
// difference visible from outside — so the pass could be dead for weeks in
// production and the only symptom was output that was thinner than it could
// have been, in a way only someone holding the whole record could see.
//
// So the race lives in one place, and losing it is loud: a grep-able marker, the
// cap that fired, and what was lost, in the words of shared/model-pass-budgets.ts.
// ============================================================================

import { capFor, passBudget } from '@shared/model-pass-budgets';

/** Marker to grep for in a deployment's logs. */
export const PASS_TIMEOUT_MARKER = '[pass-timeout]';

/**
 * Race a model call against its declared budget.
 *
 * Resolves to `null` when the cap fires — every caller already has a complete,
 * deterministic answer for that case, and none of them may throw.
 */
export async function withBudget<T>(id: string, work: Promise<T>): Promise<T | null> {
  const ms = capFor(id);
  const started = Date.now();
  const raced = await Promise.race([
    work,
    new Promise<null>(resolve => setTimeout(() => resolve(null), ms)),
  ]);
  if (raced === null) {
    const b = passBudget(id);
    console.warn(
      `⚠️ ${PASS_TIMEOUT_MARKER} ${id} gave up after ${Date.now() - started}ms (cap ${ms}ms). ` +
        `What is lost: ${b?.costsWhenItFires ?? 'unknown'}. ` +
        `Measured ${b?.measuredOn ?? '?'} at ${b?.measuredMs ?? '?'}ms — if the prompt has grown since, ` +
        `measure again and move the number (shared/model-pass-budgets.ts).`,
    );
  }
  return raced;
}

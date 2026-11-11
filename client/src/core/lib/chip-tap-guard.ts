// ============================================================================
// A NEW QUESTION'S CHIPS DO NOT ANSWER THE TAP THAT WAS MEANT FOR THE LAST ONE
// ============================================================================
// Prod, Conceito Arte, 11 Nov 2026 09:48:17–09:48:32 UTC: ~40 chip answers
// 0.2–1 s apart, nearly all at the same position (mostly option B). The next
// question renders under the finger and its chips took the tap at once, so
// tapping on answered every new question — including two "Não é pra gente"
// she most likely never meant.
//
// The guard: a question's chips accept input only CHIP_ARM_MS after they
// appear, and never within CHIP_REPEAT_MS of the previous answer. While the
// guard holds, the chips are `disabled` (so a tap does nothing, and
// Playwright's auto-wait simply waits) — not a click handler that silently
// drops the tap. Covers taps and keyboard letter / Enter selection only; a
// typed or spoken answer is deliberate and is never held.
// ============================================================================

/** How long a newly shown question's chips wait before they accept a tap. */
export const CHIP_ARM_MS = 600;

/** No second chip answer within this long of the previous answer. */
export const CHIP_REPEAT_MS = 1000;

/**
 * Milliseconds until a question's chips may accept input. Pure.
 *
 * @param now          the current time
 * @param shownAt      when this question's chips appeared
 * @param lastAnswerAt when the previous answer was sent (0 = never)
 */
export function chipArmDelay(now: number, shownAt: number, lastAnswerAt: number): number {
  const armAt = Math.max(shownAt + CHIP_ARM_MS, lastAnswerAt ? lastAnswerAt + CHIP_REPEAT_MS : 0);
  return Math.max(0, armAt - now);
}

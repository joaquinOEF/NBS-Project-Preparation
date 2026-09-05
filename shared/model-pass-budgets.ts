// ============================================================================
// HOW LONG A MODEL PASS MAY TAKE — and the measurement that says so
// ============================================================================
// Three times in this repo a timeout has quietly disabled the pass behind it:
//
//   · conceptNoteAuthor  30 s cap · ~46 s real — the concept note was never
//     once written by the pass built to write it
//   · synergyReport      45 s cap · ~49 s real — the cohort narrative had never
//     run, so nobody had ever read its output
//   · w3Advisor          25 s cap · ~29 s real — no drafts, no chosen
//     questions, no observations, on every session
//
// Each was a cap set honestly for a smaller prompt, left behind when the prompt
// grew. And every one FAILED SILENTLY: the pass resolves with its empty value,
// the flow continues, the document is the deterministic one, and nothing
// anywhere says a pass was meant to run. They were found by running the thing
// and reading the output — never by a test, because there was nothing to fail.
//
// So the cap stops being a number in a file. It lives here, next to the
// measurement that justifies it, and `e2e/model-pass-budgets.spec.ts` fails if
// a cap is not at least 3× the slowest run actually observed, or if a pass
// declares a cap of its own somewhere else.
//
// ⚠️ MEASURE, DO NOT ESTIMATE. `measuredMs` is a number somebody watched a
// clock produce, on a real record, with the provider configured. If you change
// a prompt in a way that adds material, measure again and move the date.
// ============================================================================

export interface PassBudget {
  /** Matches the pass id in shared/context-sources.ts. */
  id: string;
  /** The env var that overrides the cap, for an operator with a slow day. */
  env: string;
  /** The cap. At least 3× measuredMs — the spec enforces it. */
  capMs: number;
  /** The slowest run actually observed. Never a guess. */
  measuredMs: number;
  /** When it was measured. A prompt that grew makes this stale. */
  measuredOn: string;
  /** How, so somebody can repeat it. */
  how: string;
  /**
   * What is lost when the cap fires — the reason this is not a detail. Every
   * one of these is invisible on the page, which is the whole problem.
   */
  costsWhenItFires: string;
  /**
   * Whether anybody is waiting on it. Three of the four are fired and
   * forgotten; the W2 ranking happens while an organisation watches the chat.
   */
  blocking: boolean;
  /**
   * ⚠️ THE CAP IS NOT THE WAIT, and conflating them is what disabled all four
   * passes. The wait is however long the call actually takes; the cap only
   * bounds a bad day. Set the cap to the wait you are willing to accept and you
   * have set it AT the measurement, where half the runs land on the wrong side
   * and the pass silently stops existing.
   *
   * A blocking pass may still be capped below the 3× the spec asks of the
   * others — somebody is watching a screen — but only with the reason written
   * here, naming who decided and what they decided.
   */
  deliberatelyTight?: string;
}

export const PASS_BUDGETS: PassBudget[] = [
  {
    id: 'w3Advisor',
    env: 'CBO_ADVISOR_TIMEOUT_MS',
    capMs: 120_000,
    measuredMs: 29_276,
    measuredOn: '2026-09-04',
    how:
      'Two runs against a real Humaitá record — site story, one cohort line, both approval routes, eight funding paths: 26.8 s and 29.3 s. ' +
      '⚠️ WITHOUT PHOTOGRAPHS. The live path reads up to three, so the real ceiling is above this and the cap is set with that in mind.',
    costsWhenItFires:
      'the session runs with no drafts, no chosen questions and no observations — the organisation is asked cold for things it already wrote',
    blocking: false,
  },
  {
    id: 'familiaRanker',
    env: 'CBO_RANKER_TIMEOUT_MS',
    capMs: 25_000,
    measuredMs: 16_697,
    measuredOn: '2026-09-04',
    how:
      'Six runs against the Raízes do Sarandi test-kit record WITH its three real site photographs (231/383/141 kB): ' +
      '12.0, 12.6, 13.1, 14.1, 14.6, 15.7 s. Without photographs: 9.2–12.0 s. Re-measured at 13.4–15.6 s after the pass ' +
      'also began reading the chat and 2 000 characters of the uploaded documents. reasoningEffort low, 2000 completion tokens.',
    costsWhenItFires:
      'the organisation gets the arithmetic ranking instead of the one that read its story and its photographs — a whole list, and the wrong one for that place',
    blocking: true,
    deliberatelyTight:
      'JVP okayed ~15 s of waiting at this beat because the tool activity is narrated. That was written down as a 12 s CAP, ' +
      'which is under the measured range: it fired three times out of three with photographs attached, so the pass had never once ' +
      'run for an organisation that uploaded any. 25 s bounds a bad day; the expected wait is still the measured 12–16 s.',
  },
  {
    id: 'w3Dig',
    env: 'CBO_DIG_TIMEOUT_MS',
    capMs: 90_000,
    measuredMs: 22_000,
    measuredOn: '2026-09-04',
    how:
      'Four runs against a full Humaitá record WITH its three real site photographs (231/383/141 kB): 16.9, 17.4, 20.6 and 22.0 s. ' +
      'The photographs are the point of round 1 — the questions that come from them are the ones nobody could ask without looking — so they are in every measurement.',
    costsWhenItFires:
      'the round falls back to the bank of eight pre-written questions — the same for every organisation, which is what this pass exists to replace',
    blocking: false,
  },
  {
    id: 'w3DigFollowUp',
    env: 'CBO_DIG_FOLLOWUP_TIMEOUT_MS',
    capMs: 60_000,
    measuredMs: 12_323,
    measuredOn: '2026-09-04',
    how:
      'Three runs over three answered round-1 questions, text only: 5.3, 9.2 and 12.3 s. The last is after the pass also began ' +
      'proposing a paired solution, which grew the prompt — re-measured rather than assumed, which is the point of this file.',
    costsWhenItFires:
      'nobody follows up on the answers, so the round is three questions instead of a conversation — the half a bank could never do',
    blocking: false,
  },
  {
    id: 'conceptNoteAuthor',
    env: 'CBO_AUTHOR_TIMEOUT_MS',
    capMs: 180_000,
    measuredMs: 46_055,
    measuredOn: '2026-09-04',
    how: 'Two runs over the two richest simulated records, cohort layer included: 42.4 s and 46.1 s, 7 paragraphs accepted each.',
    costsWhenItFires:
      'the document is the deterministic one — whole, but never argued; the floor, forever, for everybody',
    blocking: false,
  },
  {
    id: 'synergyReport',
    env: 'CBO_SYNERGY_TIMEOUT_MS',
    capMs: 240_000,
    measuredMs: 72_343,
    measuredOn: '2026-09-04',
    how:
      'npx tsx scripts/w3-synergy-live.ts over all eight simulated organisations: 49.0 s, then 55.2 s, then 71.3 and 72.3 s once the ' +
      'pass was actually reading the photo observations and the published timings AND writing tensions and sequencing. ⚠️ The 55.2 s ' +
      'figure was measured on a checkout that did not yet contain those — a full test caught it, and the cap moved 180 → 240 s because ' +
      '3× the real number no longer fitted. Measure the thing you shipped, not the thing you were about to.',
    costsWhenItFires:
      'the coordinator gets the deterministic groupings with no narrative — the reading that says what to DO about them is missing',
    blocking: false,
  },
];

export function passBudget(id: string): PassBudget | null {
  return PASS_BUDGETS.find(b => b.id === id) ?? null;
}

/** The cap in force, honouring the operator override. */
export function capFor(id: string, env: NodeJS.ProcessEnv = process.env): number {
  const b = passBudget(id);
  if (!b) throw new Error(`no budget declared for model pass "${id}" — add one to shared/model-pass-budgets.ts`);
  const override = Number(env[b.env]);
  return Number.isFinite(override) && override > 0 ? override : b.capMs;
}

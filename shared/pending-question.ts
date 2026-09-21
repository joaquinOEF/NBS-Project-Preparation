// ============================================================================
// THE PENDING QUESTION — what the flow asked, remembered until it is answered
// ============================================================================
// ⚠️ THE STRUCTURAL FLAW THIS CLOSES (JVP, 2026-09-21: "a user responds, agent
// reads at some point — if not, what's the purpose?").
//
// A templated encontro had no memory of WHAT IT HAD JUST ASKED. Every turn, a
// long chain of handlers guessed what the incoming message meant from private
// flags and exact chip text. So an answer counted only if it arrived as the
// exact label, as a tap, with the right flag set, and with no earlier handler
// grabbing it first. Everything else fell through to the model — which has no
// contract to record the answer into the step the flow is waiting on — and the
// flow never advanced. Found in one afternoon of fuzzing (scripts/w3-fuzz.ts):
//
//   · "é isso", typed or spoken, at "Confere?" — unrecognised at 878 turns
//   · one tap on a stacked question → "Pronto; Pronto" → the model, 53 s, silence
//   · the entry line sent while a COUNT was pending → "Encontro 3" read as 3 units
//   · the same line while a detail was pending → stored as the detail's answer
//   · a return mid-flow re-derived a DIFFERENT question than the one on screen
//
// The contract now:
//   1. every question a checkpoint asks is RECORDED on the session, options and all
//   2. every incoming message is matched against it BEFORE any handler runs —
//      exact, stacked, typed, spoken, option letter, ordinal, unambiguous partial —
//      and a match becomes the canonical chip label, whatever the turn kind said
//   3. an answer that matches an option is NEVER handed to the model: if no
//      handler takes it, that is a bug — logged as [answer-unhandled] — and the
//      question is asked again
//   4. after any model turn the SAME pending question is asked again, exactly,
//      instead of a re-derived guess
//
// Pure. server/services/pendingQuestion.ts wires it round a checkpoint.
// ============================================================================

export interface PendingOption { label: string; description?: string; action?: string; /** Deliberately the model's to answer. */ handoff?: boolean }
export interface PendingAsk { question: string; options: PendingOption[]; /** The field this question fills, when the ask said so. */ forField?: string }
export interface Pending { asks: PendingAsk[] }

export const PENDING_FIELD = '_pending_asks_json';

export const normAnswer = (s: string) =>
  (s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();

export function parsePending(raw: string | undefined | null): Pending | null {
  if (!raw) return null;
  try {
    const p = JSON.parse(raw);
    const asks = Array.isArray(p?.asks) ? p.asks.filter((a: any) => a && typeof a.question === 'string' && Array.isArray(a.options)) : [];
    return asks.length ? { asks } : null;
  } catch { return null; }
}

export const serializePending = (asks: PendingAsk[]): string =>
  asks.length ? JSON.stringify({ asks: asks.map(a => ({ question: a.question, ...(a.forField ? { forField: a.forField } : {}), options: a.options.map(o => ({ label: o.label, ...(o.description ? { description: o.description } : {}), ...(o.action ? { action: o.action } : {}), ...(o.handoff ? { handoff: true } : {}) })) })) }) : '';

/** Chips the CLIENT acts on without posting a turn (open the keyboard, the mic, the picker). */
const CLIENT_ONLY = new Set(['write', 'record', 'upload']);

export type MatchHow = 'exact' | 'stacked' | 'letter' | 'ordinal' | 'partial' | 'none';
export interface Canonical { text: string; matched: boolean; how: MatchHow; /** The matched option is a deliberate hand-off to the model. */ handoff?: boolean }

const ORDINALS: Array<[RegExp, number]> = [
  [/^(a |o )?(primeir[ao]|1a|1o|first|the first)( opcao| option)?$/, 0],
  [/^(a |o )?(segund[ao]|2a|2o|second|the second)( opcao| option)?$/, 1],
  [/^(a |o )?(terceir[ao]|3a|3o|third|the third)( opcao| option)?$/, 2],
  [/^(a |o )?(quart[ao]|4a|4o|fourth|the fourth)( opcao| option)?$/, 3],
];

function matchOne(part: string, ask: PendingAsk): { label: string; how: MatchHow; handoff?: boolean } | null {
  const opts = ask.options.filter(o => !CLIENT_ONLY.has(o.action ?? ''));
  const n = normAnswer(part);
  if (!n) return null;
  const exact = opts.find(o => normAnswer(o.label) === n);
  if (exact) return { label: exact.label, how: 'exact', handoff: exact.handoff };

  // The composer badges options A, B, C… — "B" or "letra b" is an answer. Never
  // when the labels themselves are that short (a count question's "1", "2", "5").
  const tiny = opts.some(o => normAnswer(o.label).length <= 2);
  if (!tiny) {
    const lm = /^(?:letra |opcao |option )?([a-h])$/.exec(n);
    if (lm) { const o = opts[lm[1].charCodeAt(0) - 97]; if (o) return { label: o.label, how: 'letter' }; }
    for (const [re, idx] of ORDINALS) if (re.test(n) && opts[idx]) return { label: opts[idx].label, how: 'ordinal' };
    if (/^(a |o )?(ultim[ao]|last|the last)( opcao| option)?$/.test(n) && opts.length) return { label: opts[opts.length - 1].label, how: 'ordinal' };
  }

  // Said rather than tapped: "faz sentido" for "Faz sentido pra gente", "pronto"
  // for "Pronto, pode seguir", "é isso mesmo" for "É isso ✓". Only when exactly
  // ONE option fits — an ambiguous fragment is not an answer.
  if (n.length >= 4) {
    const fits = opts.filter(o => {
      const l = normAnswer(o.label);
      if (l.length < 3) return false;
      return l.startsWith(n) || (n.startsWith(l) && n.length <= l.length + 14) || (l.length >= 5 && n.includes(l) && n.length <= l.length + 20);
    });
    if (fits.length === 1) return { label: fits[0].label, how: 'partial', handoff: fits[0].handoff };
  }
  return null;
}

/**
 * The incoming message, read against the question that is actually pending.
 * Returns the canonical chip text when it answers it, the message untouched
 * when it does not (a real question for the model, free prose for a free-text
 * beat, an upload, a map result).
 */
export function canonicaliseAnswer(raw: string, pending: Pending | null): Canonical {
  const none: Canonical = { text: raw, matched: false, how: 'none' };
  if (!pending?.asks.length || !raw?.trim()) return none;
  const asks = pending.asks;
  const parts = raw.split(';').map(p => p.trim()).filter(Boolean);

  // A batch of questions answered together, one part each.
  if (asks.length > 1 && parts.length === asks.length) {
    const hits = parts.map((p, i) => matchOne(p, asks[i]));
    if (hits.every(Boolean)) return { text: hits.map(h => h!.label).join('; '), matched: true, how: hits.some(h => h!.how !== 'exact') ? 'partial' : 'exact' };
  }
  // The same question stacked: identical answers repeated are ONE answer.
  const last = asks[asks.length - 1];
  if (parts.length > 1 && parts.every(p => normAnswer(p) === normAnswer(parts[0]))) {
    const hit = matchOne(parts[0], last);
    if (hit) return { text: hit.label, matched: true, how: 'stacked', handoff: hit.handoff };
  }
  const hit = matchOne(raw, last);
  return hit ? { text: hit.label, matched: true, how: hit.how, handoff: hit.handoff } : none;
}

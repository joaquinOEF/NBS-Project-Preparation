// ============================================================================
// THE WAY FORWARD — deterministic, whatever the UI is doing
// ============================================================================
// An organisation that has finished its encontro and asks to start the next one
// must never be walked back into the one it just finished.
//
// It happened. Maria finished Encontro 2, the coordination had opened Encontro
// 3, and every visible affordance pointed backwards: the entry screen offered
// the Encontro 2 preamble (keyed off `state.phase`, which nothing had moved),
// and the in-chat banner that WOULD have offered Encontro 3 is suppressed
// whenever a question is still open — which, in a phase where every beat asks
// one, is most of the time. She typed "start" and got Encontro 2 again.
//
// The UI fixes are in cbo-profile.tsx. This is the belt to that pair of braces:
// whatever the screen is rendering, SAYING it advances it. It is deterministic
// rather than a tool the model may or may not decide to call, because the model
// deciding was the failure mode — the phase-2 skill is a good W2 facilitator and
// a request to leave W2 is exactly what it is least likely to honour.
//
// Two things have to be true, and they are the same two the green banner
// checks. Nothing here overrides the coordination: a phase that was never
// opened stays shut, and the organisation is told so plainly instead of being
// handed back into the previous encontro.
// ============================================================================

import { encontroClosed, type CboState } from '@shared/cbo-schema';
import { getPhasePolicyForCbo } from './phaseGating';

/**
 * Does this read as "let's start the next encontro"?
 *
 * Deliberately narrow. It fires on an explicit request to move on, never on a
 * passing mention — "no encontro 3 a gente escolhe a solução" is an
 * organisation talking about the future, not asking to go there now.
 */
export function readsAsStartNext(message: string, currentPhase: number): boolean {
  const m = message.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();
  if (m.length > 120) return false;
  const next = currentPhase + 1;
  // ⚠️ A bare phase token IS the request. "w3", "e3", "encontro 3" typed alone
  // is unambiguous — nobody types it to mean anything else — and every one of
  // these that fails to match here is a turn handed to the model, which then
  // narrates an intent the gate goes on to refuse. That contradiction, four
  // seconds apart, is backlog #41.
  const bareToken = new RegExp(`^(o\\s+)?(encontro|workshop|fase|phase|w|e)\\s*0?${next}[.!?]?$`).test(m);
  if (bareToken) return true;

  const wantsMove = /\b(vamos|quero|queremos|podemos|bora|comecar|comeca|iniciar|inicia|abrir|abre|ir para|passar para|seguir para|proximo|proxima|start|begin|next|go to|move on)\b/.test(m);
  if (!wantsMove) return false;
  // Either it names the encontro it wants, or it asks to move on generically.
  const namesNext = new RegExp(`\\b(encontro|workshop|fase|phase|w)\\s*0?${next}\\b`).test(m);
  const generic = /\b(proximo encontro|proxima etapa|next workshop|next step|seguir em frente|move on)\b/.test(m);
  // A short reply that is only a move verb — "sim start", "bora", "vamos" —
  // after an encontro is finished. Length-bounded so it cannot swallow a
  // sentence that merely contains one of those words.
  const shortMove = m.length <= 24 && /\b(start|begin|bora|vamos|comecar|proximo|next)\b/.test(m);
  return namesNext || generic || shortMove;
}

export interface NextEncontroDeps {
  say: (pt: string, en: string) => void;
  /** Move the session's phase. The same server-side advance the banner performs. */
  advanceTo: (phase: number) => Promise<void>;
  lang: 'pt' | 'en';
}

export type NextEncontroOutcome =
  | { kind: 'not-asked' }
  | { kind: 'advanced'; phase: number }
  | { kind: 'not-finished'; phase: number }
  | { kind: 'not-open'; phase: number };

/**
 * Answer an explicit request to move on. Returns what it did, so the caller can
 * decide whether the turn is over — `advanced` hands straight to the next
 * encontro's own opener rather than ending the turn on a message.
 */
export async function serveStartNext(
  cboId: string,
  message: string,
  state: CboState,
  deps: NextEncontroDeps,
): Promise<NextEncontroOutcome> {
  const current = state.phase ?? 0;
  if (current < 1 || !readsAsStartNext(message, current)) return { kind: 'not-asked' };

  const next = current + 1;

  // Not finished is not a refusal — it is the honest reason, and it names the
  // thing that would change it rather than saying "no".
  if (!encontroClosed(state, current)) {
    deps.say(
      `Ainda falta fechar o Encontro ${current} — quando isso estiver pronto, o ${next} abre em seguida.`,
      `Encontro ${current} is not closed yet — once it is, ${next} opens right after.`,
    );
    return { kind: 'not-finished', phase: current };
  }

  const policy = await getPhasePolicyForCbo(cboId);
  if (policy.gated && !policy.unlockedPhases.includes(next)) {
    // ⚠️ The one thing this must not do is drop them back into the encontro
    // they just finished. Say where they are and what is missing.
    deps.say(
      `O Encontro ${current} está fechado da parte de vocês ✓ — o Encontro ${next} ainda não foi aberto pela coordenação. Assim que abrir, ele aparece aqui.`,
      `Encontro ${current} is closed on your side ✓ — Encontro ${next} has not been opened by the coordination yet. As soon as it is, it shows up here.`,
    );
    return { kind: 'not-open', phase: next };
  }

  await deps.advanceTo(next);
  return { kind: 'advanced', phase: next };
}

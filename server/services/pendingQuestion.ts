// The pending question, wired round a templated checkpoint.
// The contract and the reasons are in shared/pending-question.ts.
import type { CboState } from '@shared/cbo-schema';
import { PENDING_FIELD, canonicaliseAnswer, parsePending, serializePending, type PendingAsk } from '@shared/pending-question';
import { isUploadNotice } from '@shared/cbo-upload-notices';
import { recordHealth } from '@shared/session-health';

type Push = (event: any) => void;

export interface PendingWiring {
  /** For the log line: which checkpoint this is. */
  label: string;
  cboId: string;
  state: CboState;
  /** The section whose private fields hold this checkpoint's flow flags. */
  sectionId: string;
  userMessage: string;
  turnKind: string | undefined;
  lang: string;
  pushEvent: Push;
  writeFields: (sectionId: string, fields: Record<string, string>) => void;
  /** Lines that are navigation, not answers (the entry line, "Continuar da Fase 3"). */
  isControlLine?: (raw: string) => boolean;
  inner: (userMessage: string, turnKind: string | undefined, pushEvent: Push) => Promise<boolean>;
}

const readPending = (state: CboState, sectionId: string) =>
  parsePending(String((state.sections as any)?.[sectionId]?.fields?.[PENDING_FIELD]?.value ?? ''));

/** Ask the recorded question(s) again, exactly. False when nothing is pending. */
export function reemitPending(state: CboState, sectionId: string, pushEvent: Push): boolean {
  const pending = readPending(state, sectionId);
  if (!pending) return false;
  for (const a of pending.asks) pushEvent({ type: 'ask_user', question: a.question, options: a.options, ...(a.forField ? { forField: a.forField } : {}) });
  return true;
}

export async function withPendingQuestion(w: PendingWiring): Promise<boolean> {
  const [body, ...rest] = w.userMessage.split('\n[LANGUAGE:');
  const suffix = rest.length ? `\n[LANGUAGE:${rest.join('\n[LANGUAGE:')}` : '';
  const raw = body.trim();
  const pending = readPending(w.state, w.sectionId);

  // Navigation, uploads and map results are not answers to the pending question.
  const notAnAnswer = !raw || w.turnKind === 'upload' || w.turnKind === 'map' || w.turnKind === 'system'
    || isUploadNotice(raw) || raw.startsWith('Map selection (') || !!w.isControlLine?.(raw);
  const canon = notAnAnswer ? { text: raw, matched: false, how: 'none' as const } : canonicaliseAnswer(raw, pending);
  if (canon.matched && canon.how !== 'exact') {
    console.log(`[answer-canonicalised] ${w.label} ${w.cboId}: "${raw.slice(0, 60)}" → "${canon.text}" (${canon.how}, kind=${w.turnKind ?? '-'})`);
  }

  const asked: PendingAsk[] = [];
  let moved = false; // the map opened, or the encontro closed — nothing is pending after that
  const push: Push = (e) => {
    if (e?.type === 'ask_user' && typeof e.question === 'string') asked.push({ question: e.question, forField: e.forField, options: (e.options ?? []).map((o: any) => ({ label: String(o.label), description: o.description, action: o.action, handoff: o.handoff })) });
    if (e?.type === 'open_map' || e?.type === 'show_roadmap') moved = true;
    w.pushEvent(e);
  };

  const served = await w.inner(canon.matched ? `${canon.text}${suffix}` : w.userMessage, canon.matched ? 'chip' : w.turnKind, push);

  if (served) {
    // ⚠️ What is on record must be what is on SCREEN. A served turn that asks
    // nothing is a beat waiting for prose, the map, or the close — the previous
    // question is answered and must not come back on a return (it did: "E quem
    // constrói isso?" re-asked after it had been answered, and its chip then had
    // no handler). The one exception is a file arriving mid-selection, which
    // leaves the door's question standing.
    const midUpload = w.turnKind === 'upload' || isUploadNotice(raw);
    if (String((w.state.sections as any)?.[w.sectionId]?.fields?._pending_unhandled?.value ?? '')) w.writeFields(w.sectionId, { _pending_unhandled: '' });
    if (asked.length) w.writeFields(w.sectionId, { [PENDING_FIELD]: serializePending(asked) });
    else if (moved || !midUpload) w.writeFields(w.sectionId, { [PENDING_FIELD]: '' });
    return true;
  }
  // A deliberate hand-off: the option exists so the model can take it.
  if (canon.matched && canon.handoff) return false;

  // ⚠️ An answer to OUR question that no handler took. Never the model's: it
  // cannot advance a step it does not own. This is a bug in the checkpoint —
  // say so where it will be seen — and the organisation gets the question back.
  if (canon.matched && pending) {
    // ⚠️ NEVER A TRAP. Asking again is right once: a second identical answer
    // that still has no handler means the question can never be answered in
    // this state, and re-asking it for ever is worse than the flaw this file
    // exists to close. The record is cleared and the turn goes to the model —
    // logged as the bug it is, where somebody will see it.
    const stuckKey = `${pending.asks[pending.asks.length - 1].question}|${canon.text}`;
    const fields = (w.state.sections as any)?.[w.sectionId]?.fields ?? {};
    if (String(fields._pending_unhandled?.value ?? '') === stuckKey) {
      console.error(`[answer-unhandled] ${w.label} ${w.cboId}: "${canon.text}" unhandled TWICE — releasing the turn to the model`);
      recordHealth(w.state, 'answer-unhandled', `${w.label}: "${canon.text}" at "${pending.asks[pending.asks.length - 1].question}" — twice; released to the model`);
      w.writeFields(w.sectionId, { [PENDING_FIELD]: '', _pending_unhandled: '' });
      return false;
    }
    w.writeFields(w.sectionId, { _pending_unhandled: stuckKey });
    console.error(`[answer-unhandled] ${w.label} ${w.cboId}: "${canon.text}" matches the pending question "${pending.asks[pending.asks.length - 1].question}" and no handler took it`);
    recordHealth(w.state, 'answer-unhandled', `${w.label}: "${canon.text}" at "${pending.asks[pending.asks.length - 1].question}"`);
    w.pushEvent({ type: 'chat', role: 'assistant', content: w.lang === 'pt' ? 'Essa resposta não entrou aqui do meu lado — toca de novo, por favor.' : 'That answer did not register on my side — please tap it again.' });
    for (const a of pending.asks) w.pushEvent({ type: 'ask_user', question: a.question, options: a.options });
    w.pushEvent({ type: 'done', summary: `${w.label} (answer-unhandled)` });
    return true;
  }
  return false;
}

/**
 * Record the questions asked through `pushEvent` OUTSIDE a wrapped checkpoint —
 * a templated entry turn, or a MODEL turn.
 *
 * ⚠️ The model's questions are recorded too, as hand-offs. Without that the
 * record still held the last TEMPLATED question while a different one was on
 * screen: an answer to the model's "Seguimos?" that happened to spell an old
 * option ("Sim") was canonicalised against a question nobody was looking at,
 * found no handler, and came back as "essa resposta não entrou" with the old
 * question re-asked. Recorded as a hand-off, the same answer is simply the
 * model's — and a return re-emits what was actually on screen.
 */
export function recordingPush(
  state: CboState,
  sectionId: string,
  writeFields: (sectionId: string, fields: Record<string, string>) => void,
  pushEvent: Push,
  opts: { handoff: boolean },
): { push: Push; commit: () => void } {
  const asked: PendingAsk[] = [];
  const push: Push = (e) => {
    if (e?.type === 'ask_user' && typeof e.question === 'string') {
      asked.push({ question: e.question, options: (e.options ?? []).map((o: any) => ({ label: String(o.label), description: o.description, action: o.action, ...(opts.handoff || o.handoff ? { handoff: true } : {}) })) });
    }
    pushEvent(e);
  };
  const commit = () => {
    if (!asked.length) return;
    if (!(state.sections as any)?.[sectionId]) return;
    writeFields(sectionId, { [PENDING_FIELD]: serializePending(asked) });
  };
  return { push, commit };
}

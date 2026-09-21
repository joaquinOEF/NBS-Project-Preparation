// The pending question, wired round a templated checkpoint.
// The contract and the reasons are in shared/pending-question.ts.
import type { CboState } from '@shared/cbo-schema';
import { PENDING_FIELD, canonicaliseAnswer, parsePending, serializePending, type PendingAsk } from '@shared/pending-question';
import { isUploadNotice } from '@shared/cbo-upload-notices';

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
    console.error(`[answer-unhandled] ${w.label} ${w.cboId}: "${canon.text}" matches the pending question "${pending.asks[pending.asks.length - 1].question}" and no handler took it`);
    w.pushEvent({ type: 'chat', role: 'assistant', content: w.lang === 'pt' ? 'Essa resposta não entrou aqui do meu lado — toca de novo, por favor.' : 'That answer did not register on my side — please tap it again.' });
    for (const a of pending.asks) w.pushEvent({ type: 'ask_user', question: a.question, options: a.options });
    w.pushEvent({ type: 'done', summary: `${w.label} (answer-unhandled)` });
    return true;
  }
  return false;
}

// ============================================================================
// SESSION HEALTH — what went wrong quietly, where somebody can see it
// ============================================================================
// Every defect of the 21 September staging run had already been DETECTED by the
// code — `[answer-unhandled]`, `[field-orphan]`, a pass that timed out — and
// every detection went to a server console nobody can read on Replit. A
// detection nobody sees is the same as none.
//
// So the session keeps a short log of its own incidents (a ring of 40, in
// `metadata.health`). It travels with the state: the coordinator's drawer shows
// it, `GET /api/cbo/:id` returns it, and a diagnosis no longer needs the logs.
// Never shown to the organisation. Never carries an answer's content beyond a
// short excerpt — it is a pointer, not a transcript.
// Pure (mutates the state it is given).
// ============================================================================

export type HealthKind =
  | 'answer-unhandled'        // a chip of the pending question no handler took — a bug in a checkpoint
  | 'model-write-rerouted'    // the model invented a field name; content kept as a note
  | 'score-refused'           // the model tried to score where it may not (upload turn, W3 metric)
  | 'score-capped'            // a score above what the tenure on record allows
  | 'flag-refused'
  | 'file-text-neutralised'   // a passage addressed to an AI was removed from file text
  | 'pass-failed';            // a model pass (advisor, document reader…) failed or timed out

export interface HealthEntry { at: string; kind: HealthKind; detail: string; phase?: number }

export const HEALTH_MAX = 40;

/** What a coordinator reads. Written register, no code words. */
export const HEALTH_LABEL: Record<HealthKind, { pt: string; en: string; severity: 'bug' | 'watch' | 'info' }> = {
  'answer-unhandled': { pt: 'Uma resposta não foi reconhecida pelo fluxo (a pergunta foi refeita)', en: 'An answer was not recognised by the flow (the question was asked again)', severity: 'bug' },
  'model-write-rerouted': { pt: 'O assistente anotou algo fora dos campos previstos (guardado nas anotações)', en: 'The assistant noted something outside the expected fields (kept in the notes)', severity: 'info' },
  'score-refused': { pt: 'O assistente tentou dar uma nota onde não pode (recusado)', en: 'The assistant tried to score where it may not (refused)', severity: 'watch' },
  'score-capped': { pt: 'Uma nota foi limitada pelo que está registrado sobre o terreno', en: 'A score was limited by what is on record about the land', severity: 'watch' },
  'flag-refused': { pt: 'O assistente tentou marcar um critério a partir de um arquivo (recusado)', en: 'The assistant tried to set a criterion from a file (refused)', severity: 'watch' },
  'file-text-neutralised': { pt: 'Um arquivo trazia um trecho dirigido a um sistema de IA (removido antes da leitura)', en: 'A file carried a passage addressed to an AI system (removed before reading)', severity: 'watch' },
  'pass-failed': { pt: 'Uma leitura automática falhou ou demorou demais (a sessão seguiu sem ela)', en: 'An automatic reading failed or took too long (the session went on without it)', severity: 'watch' },
};

export function recordHealth(state: any, kind: HealthKind, detail: string): void {
  if (!state) return;
  state.metadata = state.metadata ?? {};
  const log: HealthEntry[] = Array.isArray(state.metadata.health) ? state.metadata.health : [];
  const entry: HealthEntry = { at: new Date().toISOString(), kind, detail: String(detail ?? '').replace(/\s+/g, ' ').slice(0, 200), phase: state.phase };
  // The same incident twice in a row is one incident.
  const last = log[log.length - 1];
  if (last && last.kind === entry.kind && last.detail === entry.detail) { last.at = entry.at; state.metadata.health = log; return; }
  log.push(entry);
  state.metadata.health = log.slice(-HEALTH_MAX);
}

export const readHealth = (state: any): HealthEntry[] =>
  Array.isArray(state?.metadata?.health) ? state.metadata.health : [];

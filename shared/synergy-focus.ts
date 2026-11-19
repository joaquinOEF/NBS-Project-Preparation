// What a synergy report is asked to focus on (docs/synergy-outside-documents.md).
//
// The report grew a second input and with it five more sections. A coordinator
// preparing a meeting about one question should not print twenty pages to read
// two — so a run carries WHICH parts it wants, and one optional sentence in the
// coordination's own words.
//
// The focus decides what PRINTS and what the narrative leans on. It never
// decides what is read: the platform's whole record always goes in, and the
// narrative always writes its programme lines, because the pre-portfolio board
// starts from them.

export const SYNERGY_FOCUS = [
  { id: 'familia', pt: 'Por família de solução', en: 'By solution family', needsTable: true },
  { id: 'tem-quer', pt: 'Quem tem × quem quer', en: 'Who has × who wants', needsTable: true },
  { id: 'arquivo-plataforma', pt: 'Arquivo × plataforma', en: 'File × platform', needsTable: true },
  { id: 'risco', pt: 'Por risco', en: 'By risk', needsTable: true },
  { id: 'rede', pt: 'Território, necessidades e aprovações em comum', en: 'Territory, shared needs and approvals', needsTable: false },
] as const;

export type SynergyFocusId = (typeof SYNERGY_FOCUS)[number]['id'];
export const ALL_FOCUS: SynergyFocusId[] = SYNERGY_FOCUS.map(f => f.id);

/** One sentence, not a prompt: long enough for "estamos preparando o encontro de dezembro sobre água". */
export const MAX_FOCUS_NOTE = 280;

export interface SynergyRequest { focus: SynergyFocusId[]; note: string | null }

/** What a run was asked for, from an untyped request body. Nothing recognisable asked = everything. */
export function synergyRequestFrom(body: unknown): SynergyRequest {
  const b = (body ?? {}) as { focus?: unknown; note?: unknown };
  const asked = Array.isArray(b.focus) ? ALL_FOCUS.filter(id => (b.focus as unknown[]).includes(id)) : [];
  const note = typeof b.note === 'string' ? b.note.replace(/\s+/g, ' ').trim().slice(0, MAX_FOCUS_NOTE) : '';
  return { focus: asked.length ? asked : ALL_FOCUS, note: note || null };
}

/** True when a report (old ones carry no request) prints this part. */
export function printsFocus(request: SynergyRequest | null | undefined, id: SynergyFocusId): boolean {
  return !request || request.focus.includes(id);
}

// The name of a document's purpose, for people and for prompts. Kept apart
// from document-schema.ts so the client can import it without drizzle.

/**
 * How a purpose is NAMED wherever a model or a person reads it. The raw key
 * used to reach prompts as "(teia_sprint)"; a file the coordination attached to
 * its technical visit has to read as the coordination's, not the organisation's
 * — the same attribution `technical_note` carries (concept-note.ts
 * COORDINATION_FIELDS).
 */
export function documentPurposeLabel(purpose: string | null | undefined, lang: 'pt' | 'en' = 'pt'): string | null {
  if (purpose === 'teia_sprint') return lang === 'pt' ? 'candidatura ao Teia Sprint' : 'Teia Sprint application';
  if (purpose === 'visita_tecnica') return lang === 'pt' ? 'anexo da visita técnica da coordenação' : "attached to the coordination's technical visit";
  return null;
}

/** The short tag a file list shows beside the name. */
export function documentPurposeTag(purpose: string | null | undefined, lang: 'pt' | 'en' = 'pt'): string | null {
  if (purpose === 'teia_sprint') return 'Teia Sprint';
  if (purpose === 'visita_tecnica') return lang === 'pt' ? 'Visita técnica' : 'Technical visit';
  return null;
}

// ============================================================================
// WHAT THEIR OWN FILES SAY ABOUT A SOLUTION — on the card, beside our reading
// ============================================================================
// ⚠️ THE GAP THIS CLOSES (JVP, 2026-09-21: "the user should not be surprised
// that what they get contradicts what they shared so far").
//
// Encontro 3 opens by asking for the technical visit report, the quote, the
// plan — "tudo isso entra na leitura das soluções". And the reading DID read
// them: a live audit showed the advisor citing the sketch's 12 × 8 m strip, the
// minutes' R$ 8.200, the January-only works window. None of it reached the
// test card. The card is deterministic on purpose (verdict, price and effect
// are functions a coordinator can audit), so an organisation whose visit report
// says "não recomendo piso permeável neste pátio" tested permeable paving and
// read a card that did not mention it. That is the surprise.
//
// The split stays exactly as w3Advisor.ts draws it — the model READS and
// SELECTS, the functions DECIDE. A note never changes a verdict, a price or an
// effect. It is set BESIDE them, labelled as theirs, with the sentence it rests
// on quoted from the file and the file named. Every quote is verified against
// the stored text before it is kept (w3Advisor.verifyQuote): a note the model
// cannot ground in a real passage does not exist.
//
// Pure. Reads `_document_notes_json` (written by server/services/w3DocumentReader.ts),
// which every W3Input already carries in `w3` — so the card, the comparison
// and both printed pages get the notes with no plumbing.
// ============================================================================

export type NoteStance = 'a-favor' | 'contra' | 'condicao';

export interface DocumentNote {
  /** A catalogue id, or '*' for something true of the place whatever is built. */
  solutionId: string;
  stance: NoteStance;
  /** One sentence, written register (third person), pt-BR. */
  textPt: string;
  textEn: string;
  /** The passage it rests on, verbatim from the file. */
  quote: string;
  sourceFilename: string;
}

export const ALL_SOLUTIONS = '*';
export const NOTE_STANCES: readonly NoteStance[] = ['a-favor', 'contra', 'condicao'];

export const STANCE_LABEL: Record<NoteStance, { pt: string; en: string }> = {
  'a-favor': { pt: 'A favor', en: 'In favour' },
  contra: { pt: 'Contra', en: 'Against' },
  condicao: { pt: 'Condição', en: 'Condition' },
};

export const NOTES_HEADING = {
  pt: 'Nos arquivos enviados pela organização',
  en: 'In the files the organisation sent',
} as const;

export const DOCUMENT_NOTES_FIELD = '_document_notes_json';

export function parseDocumentNotes(json: string | undefined | null): DocumentNote[] {
  if (!json) return [];
  try {
    const notes = JSON.parse(json)?.notes;
    if (!Array.isArray(notes)) return [];
    return notes.filter((n: any) =>
      n && typeof n.solutionId === 'string' && NOTE_STANCES.includes(n.stance)
      && typeof n.textPt === 'string' && n.textPt.trim()
      && typeof n.quote === 'string' && typeof n.sourceFilename === 'string');
  } catch { return []; }
}

/** This solution's own notes first, then what holds for the place whatever is built. */
export function notesFor(solutionId: string, notes: DocumentNote[], max = 5): DocumentNote[] {
  const own = notes.filter(n => n.solutionId === solutionId);
  const place = notes.filter(n => n.solutionId === ALL_SOLUTIONS);
  return [...own, ...place].slice(0, max);
}

export const placeNotes = (notes: DocumentNote[]) => notes.filter(n => n.solutionId === ALL_SOLUTIONS);

export interface CardNote { stance: NoteStance; stanceLabel: string; text: string; quote: string; source: string; /** About this solution, or about the place whatever is built. */ scope: 'solution' | 'place' }

export const toCardNote = (n: DocumentNote, lang: 'pt' | 'en'): CardNote => ({
  stance: n.stance,
  stanceLabel: STANCE_LABEL[n.stance][lang],
  text: (lang === 'en' && n.textEn?.trim()) ? n.textEn.trim() : n.textPt.trim(),
  quote: n.quote.trim(),
  source: n.sourceFilename,
  scope: n.solutionId === ALL_SOLUTIONS ? 'place' : 'solution',
});

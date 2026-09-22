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

/** 'dito' is never the model's: it marks a line the organisation SAID, placed by the platform (see notesFromInput). */
export type NoteStance = 'a-favor' | 'contra' | 'condicao' | 'dito';

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
  /**
   * Set when the passage shows a study the fichas ask for has ALREADY BEEN DONE
   * (a StudyId from shared/w3-dossier.ts: infiltration, geotechnical…). It is a
   * PROPOSAL: Encontro 3 asks the organisation to confirm it, and only their
   * confirmation changes a verdict.
   */
  studyDone?: string;
  /**
   * The sentence of THEIR file that names the study — picked by the platform
   * from the source text, not by the model, because it is what the organisation
   * reads when asked "vocês já têm esse estudo?". A mark with no such sentence
   * in the file is dropped.
   */
  studyQuote?: string;
}

/** How a file names each study a paper can hold. Used to find the evidence sentence. */
export const STUDY_EVIDENCE: Record<string, RegExp> = {
  infiltration: /(teste|ensaio)s? (expedito )?de infiltra/i,
  geotechnical: /sondage|geot[eé]cnic/i,
  hydrological: /hidrol[oó]gic/i,
  hydraulic: /hidr[aá]ulic/i,
  report: /\blaudo\b/i,
};

/** The first sentence of `text` that names the study, or null. */
export function studyEvidenceIn(text: string, studyId: string): string | null {
  const re = STUDY_EVIDENCE[studyId];
  if (!re || !text) return null;
  const sentences = text.replace(/\s+/g, ' ').split(/(?<=[.!?])\s+/);
  const hit = sentences.find(x => re.test(x) && x.length >= 20 && !/^\d+\.\s+[A-ZÀ-Ú\s]+$/.test(x.trim()));
  return hit ? hit.trim().slice(0, 240) : null;
}

/**
 * A size their own material states for the space the project could use —
 * "faixa de terra de aproximadamente 12 × 8 m". The model supplies the PASSAGE;
 * the number is computed from it by parseSpokenArea, never by the model, and
 * it becomes the project's size only when the organisation taps it.
 */
export interface DocumentMeasure {
  labelPt: string;
  labelEn: string;
  quote: string;
  sourceFilename: string;
  m2: number;
}

/** What the organisation SAID in the conversation and the assistant noted (site_notes / project_notes) — read like a file. */
export const CONVERSATION_SOURCE = 'conversa com a organização';

export const ALL_SOLUTIONS = '*';
/** What the MODEL may return. */
export const NOTE_STANCES: readonly NoteStance[] = ['a-favor', 'contra', 'condicao'];
const STORED_STANCES: readonly string[] = ['a-favor', 'contra', 'condicao', 'dito'];

export const STANCE_LABEL: Record<NoteStance, { pt: string; en: string }> = {
  'a-favor': { pt: 'A favor', en: 'In favour' },
  contra: { pt: 'Contra', en: 'Against' },
  condicao: { pt: 'Condição', en: 'Condition' },
  dito: { pt: 'Dito na conversa', en: 'Said in conversation' },
};

export const NOTES_HEADING = {
  pt: 'No que a organização enviou e contou',
  en: 'In what the organisation sent and said',
} as const;

export const DOCUMENT_NOTES_FIELD = '_document_notes_json';

export function parseDocumentNotes(json: string | undefined | null): DocumentNote[] {
  if (!json) return [];
  try {
    const notes = JSON.parse(json)?.notes;
    if (!Array.isArray(notes)) return [];
    return notes.filter((n: any) =>
      n && typeof n.solutionId === 'string' && STORED_STANCES.includes(n.stance)
      && typeof n.textPt === 'string' && n.textPt.trim()
      && typeof n.quote === 'string' && typeof n.sourceFilename === 'string');
  } catch { return []; }
}

export function parseDocumentMeasures(json: string | undefined | null): DocumentMeasure[] {
  if (!json) return [];
  try {
    const ms = JSON.parse(json)?.measures;
    if (!Array.isArray(ms)) return [];
    return ms.filter((m: any) => m && typeof m.labelPt === 'string' && typeof m.quote === 'string' && typeof m.sourceFilename === 'string' && Number(m.m2) > 0);
  } catch { return []; }
}

/** The note proposing that a given study is already done — for this solution, or for the place. */
export function studyProposal(notes: DocumentNote[], studyId: string, solutionId: string): DocumentNote | null {
  const hit = notes.find(n => n.studyDone === studyId && n.solutionId === solutionId)
    ?? notes.find(n => n.studyDone === studyId) ?? null;
  // What they are shown is the sentence that names the study.
  return hit ? { ...hit, quote: hit.studyQuote || hit.quote } : null;
}

/**
 * ⚠️ What they SAID reaches the card whether or not a model chose to cite it.
 *
 * The reader is asked to treat the conversation as a source, and a live audit
 * showed it doing so in two runs out of three. "Two out of three" is not what
 * "a user responds, the agent reads" means — so every line the assistant noted
 * from the conversation (site_notes / project_notes) is placed here by the
 * platform, as theirs, about the place. Where the model already cited the same
 * words (with a stance, maybe tied to a solution) its note stands and the plain
 * line is not repeated.
 */
export function conversationLines(siteNotes: string | undefined, projectNotes: string | undefined): DocumentNote[] {
  const lines = `${siteNotes ?? ''}\n${projectNotes ?? ''}`.split('\n').map(l => l.trim()).filter(l => l.length >= 12);
  return lines.map(line => {
    // "Ipês to preserve: Os dois ipês ficam." — the label was the model's; the sentence is theirs.
    const m = /^[^:]{2,40}:\s+(.{20,})$/.exec(line);
    const text = (m ? m[1] : line).trim();
    return { solutionId: ALL_SOLUTIONS, stance: 'dito' as const, textPt: text, textEn: text, quote: text, sourceFilename: CONVERSATION_SOURCE };
  });
}

/** Everything a card may show: what the reader found, plus what was said and not already cited. */
export function notesFromInput(input: { site?: Record<string, string | undefined>; w3?: Record<string, string | undefined> }): DocumentNote[] {
  const read = parseDocumentNotes(input.w3?.[DOCUMENT_NOTES_FIELD]);
  const norm = (x: string) => x.toLowerCase().replace(/\s+/g, ' ').trim();
  const cited = read.filter(n => n.sourceFilename === CONVERSATION_SOURCE).map(n => norm(n.quote));
  const said = conversationLines(input.site?.site_notes, input.w3?.project_notes)
    .filter(l => !cited.some(q => norm(l.quote).includes(q.slice(0, 40)) || q.includes(norm(l.quote).slice(0, 40))));
  return [...read, ...said];
}

/**
 * What one card shows, in the order a reader needs it: this solution's own
 * notes, then what the organisation SAID (it is theirs, and it is short), then
 * what holds for the place. The cap trims the last group, never the first two —
 * a card with fifteen place-level conditions once pushed the one thing they had
 * said in the chat off the end.
 */
export function notesFor(solutionId: string, notes: DocumentNote[], max = 8): DocumentNote[] {
  const own = notes.filter(n => n.solutionId === solutionId);
  const said = notes.filter(n => n.solutionId === ALL_SOLUTIONS && n.sourceFilename === CONVERSATION_SOURCE).slice(0, 3);
  const place = notes.filter(n => n.solutionId === ALL_SOLUTIONS && n.sourceFilename !== CONVERSATION_SOURCE);
  const head = [...own, ...said];
  return [...head, ...place.slice(0, Math.max(2, max - head.length))];
}

export const placeNotes = (notes: DocumentNote[]) => notes.filter(n => n.solutionId === ALL_SOLUTIONS);

export interface CardNote { stance: NoteStance; stanceLabel: string; text: string; quote: string; source: string; /** About this solution, or about the place whatever is built. */ scope: 'solution' | 'place' }

/**
 * ⚠️ A note that says a study is already done is a CLAIM until the organisation
 * confirms it. On staging (22 Sept) a comparison printed, four rows apart,
 * "o que trava: precisa de um teste de infiltração do solo" and "o relatório
 * documenta ensaio de infiltração já realizado no local … dispensando a
 * necessidade de novo teste". Both were honest — the verdict moves only on a
 * confirmed `studies_done`, by design — and together they read as a system that
 * does not know what it is saying. So the note carries its own status:
 * confirmed studies come from the site record, and anything else says so.
 */
export const toCardNote = (n: DocumentNote, lang: 'pt' | 'en', confirmedStudies: string[] = []): CardNote => {
  const claimUnconfirmed = !!n.studyDone && !confirmedStudies.includes(n.studyDone);
  const text = (lang === 'en' && n.textEn?.trim()) ? n.textEn.trim() : n.textPt.trim();
  return {
    stance: n.stance,
    stanceLabel: STANCE_LABEL[n.stance][lang],
    text: claimUnconfirmed
      ? `${text.replace(/\s*$/, '').replace(/\.$/, '')} — ${lang === 'pt' ? 'a organização ainda não confirmou' : 'the organisation has not confirmed this yet'}.`
      : text,
    quote: n.quote.trim(),
    source: n.sourceFilename,
    scope: n.solutionId === ALL_SOLUTIONS ? 'place' : 'solution',
  };
};

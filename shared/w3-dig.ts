// ============================================================================
// THE DIG — questions written for THIS organisation, from what it told us
// ============================================================================
// JVP, 2026-09-04:
//
//   "the idea is we get as much relevant context about the proposed project so
//    that the proto concept note is as valuable as possible"
//
// Encontro 3 asked its extra questions out of a bank of eight, pre-written and
// the same for everybody — and two of those eight were unreachable, because the
// pass that picks them runs before a solution exists and their eligibility
// gates on one. A bank cannot ask "vocês falaram que a água volta pras casas do
// fundo — quantas casas são?", because it does not know what they said.
//
// So the questions are WRITTEN, per organisation, from their story, their
// photographs, the document they uploaded and the answers they have just given.
// Then the interesting half: the answers are read, and where one opens
// something, it is followed up. That is the difference between a form and a
// conversation, and it is the whole of what a consultant does in the room.
//
// ⚠️ TWO REGISTERS, ALWAYS. The question is spoken to them — second person,
// their words, their place. The NOTE is written about them — third person, on a
// page a funder reads. A generated question that carries only its own text ends
// up printed verbatim, and "vocês" appears on a nota técnica; that already
// happened once with the decisive-detail question, which is why every entry
// here carries an authored `notePt` with an {answer} slot, exactly as
// shared/w3-detail-questions.ts does. See docs/document-register.md.
// ============================================================================

import { SECTION_ORDER, type ConceptSectionId } from './concept-note';

/** How many are asked, per round. Bounded: this is a workshop, not an intake form. */
export const DIG_ROUND_1 = 3;
export const DIG_FOLLOW_UPS = 2;

export interface DigQuestion {
  /** Stable within a session; the answer is stored against it. */
  id: string;
  /** 1 = written from the record. 2 = written from a round-1 answer. */
  round: 1 | 2;
  /** Spoken to them. Second person, their place, their words. */
  askPt: string;
  askEn: string;
  /**
   * Written about them, for the page. Must contain {answer}, which is replaced
   * with what they said. Third person — the document never says "vocês".
   */
  notePt: string;
  noteEn: string;
  /** The section of the concept note the answer belongs under. */
  feeds: ConceptSectionId;
  /**
   * WHERE the prompt came from, structured rather than described.
   *
   * ⚠️ Free prose here failed on the first live run: the model wrote
   * "As próprias palavras delas: «A água fica parada por dias» — mas sem número
   * concreto registrado", and the containment check took the preamble as the
   * quote and rejected a perfectly grounded question. Worse, it rejected the
   * best question of the three — one that came from a PHOTOGRAPH, which no
   * check against a text record can ever verify.
   */
  sourceKind: 'quote' | 'photo' | 'document' | 'field' | 'answer';
  /** For a quote: the passage ALONE, so it can be checked. Otherwise: what was seen or read. */
  basedOn: string;
  /** Set once answered. Empty string means asked and skipped. */
  answer?: string;
  /** For a follow-up: the round-1 question whose answer prompted it. */
  followsUp?: string;
}

/** ⚠️ The document register, enforced rather than requested. */
const SECOND_PERSON = /\bvoc[eê]s?\b|\bvcs\b|\ba gente\b|\bseu\b|\bsua\b|\byour\b|\byou\b/i;

export interface DigVerdict {
  kept: DigQuestion[];
  dropped: Array<{ ask: string; why: string }>;
}

/**
 * Everything a generated question must satisfy before it is asked.
 *
 * ⚠️ Every rule drops ONE QUESTION, never the reply. A schema constraint on a
 * one-shot call is a total-loss constraint — the lesson `orgNames.min(2)` taught
 * when it discarded an entire cohort narrative — and a round that loses one of
 * three questions is still two questions better than the bank.
 */
export function acceptDig(
  candidates: Array<Partial<DigQuestion>>,
  opts: {
    round: 1 | 2;
    /** Everything the organisation has said, for checking quotes and numbers. */
    record: string;
    /** Questions already asked this session — nothing is asked twice. */
    already: DigQuestion[];
    max: number;
  },
): DigVerdict {
  const kept: DigQuestion[] = [];
  const dropped: DigVerdict['dropped'] = [];
  const normalise = (s: string) => s.replace(/\s+/g, ' ').trim().toLowerCase();
  const recordNorm = normalise(opts.record);
  const recordNumbers = new Set((opts.record.match(/\d[\d.,]*/g) ?? []).map(n => n.replace(/[.,]$/, '')));

  for (const c of candidates ?? []) {
    const askPt = String(c?.askPt ?? '').trim();
    const drop = (why: string) => dropped.push({ ask: askPt.slice(0, 70), why });
    const notePt = String(c?.notePt ?? '').trim();
    const noteEn = String(c?.noteEn ?? '').trim();
    const askEn = String(c?.askEn ?? '').trim();
    const sourceKind = String(c?.sourceKind ?? '').trim() as DigQuestion['sourceKind'];
    // A quote wrapped in commentary is still a quote — take what is inside the
    // quotation marks when there is any, so the check reads the passage rather
    // than the sentence about the passage.
    const rawBasedOn = String(c?.basedOn ?? '').trim();
    const quoted = /[“"«]([^”"»]{10,})[”"»]/.exec(rawBasedOn);
    const basedOn = sourceKind === 'quote' && quoted ? quoted[1].trim() : rawBasedOn;
    const feeds = String(c?.feeds ?? '') as ConceptSectionId;

    if (askPt.length < 12 || askEn.length < 12) { drop('pergunta vazia ou curta demais'); continue; }
    if (askPt.length > 240) { drop('pergunta longa demais para uma conversa'); continue; }
    if (!/\?\s*$/.test(askPt)) { drop('não é uma pergunta'); continue; }
    if (!(SECTION_ORDER as readonly string[]).includes(feeds)) { drop(`seção inexistente: "${c?.feeds}"`); continue; }
    // ⚠️ The register. The question is spoken; the note is written.
    if (!notePt.includes('{answer}') || !noteEn.includes('{answer}')) { drop('a nota não tem onde encaixar a resposta'); continue; }
    if (SECOND_PERSON.test(notePt.replace('{answer}', '')) || SECOND_PERSON.test(noteEn.replace('{answer}', ''))) {
      drop('a nota fala em segunda pessoa — ela vai para um documento');
      continue;
    }
    if (!basedOn) { drop('não diz o que no registro motivou a pergunta'); continue; }
    // ⚠️ 'answer' exists because round 2 follows up on what was just said, and
    // the first live follow-up — the best question of the whole run — was
    // dropped for calling its source "entrevista". A follow-up's provenance is
    // the answer it follows; an enum that cannot express that rejects the only
    // questions round 2 can produce.
    if (!['quote', 'photo', 'document', 'field', 'answer'].includes(sourceKind)) { drop(`origem desconhecida: "${c?.sourceKind}"`); continue; }
    // ⚠️ Only a QUOTE is checkable, and only a quote needs checking. A question
    // that came from a photograph is the strongest kind there is — it is the
    // one nobody could ask without having looked — and it cannot be found in a
    // text record. Demanding that it be there rejected exactly the questions
    // worth keeping. Images reach a checked pass PRE-DIGESTED elsewhere in this
    // repo for the same reason (docs/context-first.md); here the honest move is
    // to record the provenance and let the guards that CAN run do their work:
    // no invented numbers, no second person, no repeats.
    if (sourceKind === 'quote' && !recordNorm.includes(normalise(basedOn).slice(0, 45))) {
      drop('atribui às palavras delas uma frase que não está no registro');
      continue;
    }
    // ⚠️ A number in the QUESTION is a fact being asserted back at them. "As 8
    // casas do fundo alagam sempre?" is a different act from asking how many
    // there are, and if nobody said 8, it is us inventing one and then asking
    // them to confirm it.
    const invented = (askPt.match(/\d[\d.,]*/g) ?? []).map(n => n.replace(/[.,]$/, '')).filter(n => !recordNumbers.has(n));
    if (invented.length) { drop(`número que ninguém disse: ${invented.join(', ')}`); continue; }
    // Nothing twice — not within the round, not against an earlier one.
    const seen = [...opts.already, ...kept];
    if (seen.some(q => normalise(q.askPt) === normalise(askPt))) { drop('já perguntada'); continue; }

    kept.push({
      id: `dig-${opts.round}-${kept.length + 1}-${Date.now().toString(36).slice(-4)}`,
      round: opts.round,
      askPt, askEn, notePt, noteEn, feeds, basedOn, sourceKind,
      ...(c.followsUp ? { followsUp: String(c.followsUp) } : {}),
    });
    if (kept.length >= opts.max) break;
  }
  return { kept, dropped };
}

/** Answers worth printing. "Não sei" is a finding for the coordination, not a fact for the page. */
const NO_ANSWER = /^(n[ãa]o sei|nao sei|sei l[áa]|nenhuma?|pular|skip|-|—)\.?$/i;

export function answeredDig(all: DigQuestion[]): DigQuestion[] {
  return all.filter(q => {
    const a = (q.answer ?? '').trim();
    return a.length > 1 && !NO_ANSWER.test(a);
  });
}

/** The dig, rendered for the document: third person, the answer inside the sentence. */
export function digParagraphs(all: DigQuestion[], lang: 'pt' | 'en'): Array<{ text: string; feeds: ConceptSectionId }> {
  return answeredDig(all).map(q => {
    const template = lang === 'pt' ? q.notePt : q.noteEn;
    let answer = (q.answer ?? '').trim();
    // ⚠️ Somebody speaking ends a sentence; the template supplies its own
    // punctuation. Together they printed "…por ali.." on a funder's page. Strip
    // the speaker's full stop only where the sentence continues after it.
    const after = template.slice(template.indexOf('{answer}') + '{answer}'.length);
    if (/^[.,;:]/.test(after)) answer = answer.replace(/[.;,]+$/, '');
    return { text: template.replace('{answer}', answer), feeds: q.feeds };
  });
}

/**
 * One solution that should go BESIDE the one they chose — never instead of it.
 *
 * ⚠️ The alignment rule, decided deliberately: this may propose an addition and
 * may never question the first choice. Two reasons. Their Encontro 2 pick leads
 * — they chose with intent and we do not walk over it — and a model asked to
 * judge its own input is the sycophancy case the research warns about, where
 * "is this right?" comes back "yes" nearly always. A factual statement about
 * what a mechanism does cannot be flattery; an assessment usually is.
 *
 * So every observation about fit has to arrive as a proposal for what goes
 * beside it. If nothing sensible goes beside it, the pass says nothing.
 */
export interface DigPairing {
  /** A catalogue id. Validated against the catalogue and the shortlist. */
  solutionId: string;
  /** One sentence: the mechanism the pair adds, in their terms. Second person — it is spoken. */
  reasonPt: string;
  reasonEn: string;
}

/** Phrasings that turn an addition into a verdict on their choice. */
// ⚠️ "Em vez DO jardim" is the sentence that got through the first version,
// which matched only "em vez de". Substitution has more than one preposition.
const SUBSTITUTION =
  /\bem vez d[aeo]s?\b|\bao inv[ée]s d[aeo]s?\b|\bno lugar d[aeo]s?\b|\bn[ãa]o resolve\b|\bmelhor seria\b|\bo certo seria\b|\bdeveriam ter\b|\berrad[ao]s?\b|\bantes de pensar\b|\binstead of\b|\brather than\b|\bwon'?t work\b|\bdoes not solve\b|\bshould have\b|\bwrong\b/i;

export function acceptPairing(
  raw: Partial<DigPairing> | null | undefined,
  opts: { eligibleIds: string[]; alreadyChosen: string[] },
): { pairing: DigPairing | null; why?: string } {
  if (!raw || !raw.solutionId) return { pairing: null };
  const id = String(raw.solutionId).trim();
  const reasonPt = String(raw.reasonPt ?? '').trim();
  const reasonEn = String(raw.reasonEn ?? '').trim();
  if (opts.alreadyChosen.includes(id)) return { pairing: null, why: 'já escolhida' };
  if (!opts.eligibleIds.includes(id)) return { pairing: null, why: `fora do catálogo elegível: "${id}"` };
  if (reasonPt.length < 25 || reasonEn.length < 25) return { pairing: null, why: 'sem motivo' };
  if (reasonPt.length > 320) return { pairing: null, why: 'motivo longo demais para um beat' };
  // ⚠️ The alignment rule, enforced rather than requested.
  const bad = SUBSTITUTION.exec(`${reasonPt} ${reasonEn}`);
  if (bad) return { pairing: null, why: `questiona a escolha delas: "${bad[0]}"` };
  return { pairing: { solutionId: id, reasonPt, reasonEn } };
}

export function parseDig(json: string | undefined): DigQuestion[] {
  if (!json) return [];
  try {
    const v = JSON.parse(json);
    return Array.isArray(v) ? (v as DigQuestion[]) : [];
  } catch {
    return [];
  }
}

/** The next question waiting for an answer, in the round given. */
export function pendingDig(all: DigQuestion[], round: 1 | 2): DigQuestion | null {
  return all.find(q => q.round === round && q.answer === undefined) ?? null;
}

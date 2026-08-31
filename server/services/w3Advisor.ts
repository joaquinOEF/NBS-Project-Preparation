// ============================================================================
// W3 ADVISOR — one smart-model pass over everything the org has ever told us
// ============================================================================
// W3's judgement is deterministic on purpose: the verdict, the price and the
// benefit ranges are pure functions, so a coordinator can audit any line back
// to a ficha sentence. That was the right call and it is not changing.
//
// It was also over-applied. Removing the model from the JUDGING is correct.
// Removing it from the LISTENING was an accident, and an expensive one: by
// Encontro 3 an organisation may have uploaded a Teia Sprint application — a
// project proposal they already wrote, sitting in the documents table with its
// full text — and W3 asks "por que aqui?" as though we had never seen it.
//
// So the split this file draws:
//
//   the model READS, SELECTS and OBSERVES.
//   the functions DECIDE and COMPUTE.
//
// It never writes a field, never sets a verdict, never produces a number. Every
// output is a proposal the organisation confirms, or a note for the
// coordination. If it fails, times out, or answers badly, W3 behaves exactly as
// it does today — the fallback is the current product, not a degraded one.
//
// ── The three layers of context ─────────────────────────────────────────────
//  1 · THEIRS   the context bundle (server/services/contextBundle.ts) — already
//               written for exactly this, "an agent given the folder as
//               context", and until now only ever downloaded by a coordinator.
//               Plus the full text of what they uploaded.
//  2 · OURS     the chosen solution's ficha: what it needs, who approves it,
//               how it fails. The reviewed content, not a summary of it.
//  3 · THE COHORT  what the other organisations in this cohort are doing. The
//               layer that turns an interviewer into a programme: "três outras
//               organizações precisam do mesmo teste de infiltração" is advice
//               no single org could ever reach on its own.
// ============================================================================

import { z } from 'zod';
import { createStructured, structuredProvider, type ContentPart } from './structuredModel';
import { buildContextMarkdown } from './contextBundle';
import { eligibleQuestions, W3_QUESTION_IDS, type QuestionContext } from '@shared/w3-questions';
import { getSolutionFicha } from '@shared/nbs-solution-fichas';
import { getSolution, NBS_FAMILIAS, NBS_SOLUTIONS } from '@shared/nbs-catalog';
import type { CboState } from '@shared/cbo-schema';

/**
 * The reasoning model, not the chat tier.
 *
 * This runs ONCE per W3 session, off the critical path, over a document that
 * two workshops produced. The per-turn cost argument that puts chip answers on
 * the light tier does not apply — and the judgement being asked for (which two
 * questions matter for this organisation, what a funder will push back on) is
 * exactly the kind that gets better with a stronger model.
 */
const ADVISOR_MODEL = process.env.CBO_ADVISOR_MODEL || '';
const ADVISOR_TIMEOUT_MS = Number(process.env.CBO_ADVISOR_TIMEOUT_MS || 25_000);

const DraftSchema = z.object({
  field: z.enum(['justification_why_here', 'baseline_condition']),
  /**
   * A LITERAL passage from one of their own documents. Not a paraphrase, not a
   * summary, not a synthesis of two sentences — the words they wrote.
   *
   * Verified against the stored text before it is ever shown (see
   * `verifyQuote`). A model that cannot find a real passage must return no
   * draft at all, and the beat falls back to its blank prompt. This is what
   * makes "we read what you sent" a checkable claim rather than a promise.
   */
  quote: z.string(),
  /** Which file it came from, so the org sees us citing their own document. */
  sourceFilename: z.string(),
  /** Why this passage answers this question, one sentence, in pt-BR. */
  whyPt: z.string(),
});

const ObservationSchema = z.object({
  /** 'strength' is shown to the org; 'gap' and 'cohort' go to the coordination. */
  kind: z.enum(['strength', 'gap', 'cohort']),
  /** One sentence, pt-BR, in the platform's register — plain, no jargon. */
  textPt: z.string(),
  /** What in the record it is based on. Shown to the coordinator, not the org. */
  basedOn: z.string(),
});

const ShortlistPickSchema = z.object({
  /** A catalogue solution id. Anything not in the catalogue is dropped. */
  solutionId: z.string(),
  /**
   * Why, citing what it actually saw or read — "na foto do fundo dá pra ver o
   * barranco exposto", "vocês escreveram que a água fica dias parada".
   * A reason that could have been written without looking at their material is
   * a reason the deterministic ranker already gives for free.
   */
  reasonPt: z.string(),
  /**
   * True when this sits outside the famílias they chose in Encontro 2.
   *
   * Those picks are never overridden — they made them deliberately, in a
   * session they may not remember in detail. A solution the evidence argues for
   * from outside them appears BELOW their choices, with the tension said out
   * loud, and they decide.
   */
  outsideTheirPicks: z.boolean(),
});

const AdviceSchema = z.object({
  /**
   * Two or three worth testing, in order. Ricardo, 31 Aug: "puede ser que no
   * lleguemos a una opción, pero como tres opciones posibles… a funilar un poco
   * más" — Vila Flores cannot narrow this technically either, so narrowing to
   * one is not the goal. Narrowing from a família to a handful is.
   */
  shortlist: z.array(ShortlistPickSchema),
  drafts: z.array(DraftSchema),
  /** Ids from the eligible bank only. Anything else is dropped. */
  questionIds: z.array(z.string()),
  /** Why each was chosen, same order. Logged, never shown to the org. */
  questionReasons: z.array(z.string()),
  observations: z.array(ObservationSchema),
});

// ⚠️ The caps live HERE, not in the schema. As `.max(n)` on the schema, a model
// that returned one item too many failed validation, the exception discarded
// the entire reply, and W3 fell back to the deterministic flow for that
// organisation's whole session — over an overshoot the guards below would have
// trimmed without anyone noticing. The same rule cost the synergy report its
// narrative in front of a real cohort.
//
// The prompt still asks for these numbers. The difference is that ignoring it
// now costs the extra item rather than the answer.
const CAP = { shortlist: 3, drafts: 2, questions: 3, observations: 4 } as const;

export type W3Advice = z.infer<typeof AdviceSchema>;

export interface AdvisorInput {
  state: CboState;
  orgName: string;
  messages: Array<{ role: string; content: string; messageType?: string }>;
  /** Uploaded documents with their extracted text. */
  docs: Array<{ filename: string; purpose?: string | null; fullText?: string | null; summary?: string | null }>;
  /**
   * The site photos, as data URLs.
   *
   * We asked them to walk their own site and photograph it, and until now those
   * photos informed the W2 família ranking and nothing else. Ricardo asked for
   * exactly this: "del análisis de las fotos que suban, de la inscripción de
   * audio, el agente pueda decir, me parece que para testear podría ser opción
   * A o B."
   */
  photos: Array<{ filename: string; dataUrl: string }>;
  questionCtx: QuestionContext;
  /** One line per other org in the cohort: what they chose and what blocks it. */
  cohort: string[];
}

export const EMPTY_ADVICE: W3Advice = { shortlist: [], drafts: [], questionIds: [], questionReasons: [], observations: [] };

/**
 * A quote is only usable if it is actually in the document.
 *
 * Compared on normalised text — the extractors introduce line breaks and
 * double spaces that no model reproduces exactly, and rejecting a real quote
 * over whitespace would make the guard useless in the direction that matters.
 * Accents and case are kept: those carry meaning and a model that changes them
 * is rewriting, which is the thing being prevented.
 */
export function verifyQuote(quote: string, documentText: string): boolean {
  const norm = (s: string) => s.replace(/\s+/g, ' ').trim();
  const q = norm(quote);
  // Too short to be a meaningful citation, and too easy to match by accident.
  if (q.length < 25) return false;
  return norm(documentText).includes(q);
}

function buildPrompt(input: AdvisorInput): string {
  const { state, orgName, messages, docs, questionCtx, cohort } = input;

  const theirs = buildContextMarkdown({
    orgName,
    state,
    messages: messages as any,
    docs: docs.map(d => ({ filename: d.filename, kind: null, purpose: (d.purpose ?? null) as any, summary: d.summary ?? null })) as any,
    generatedAt: new Date().toISOString(),
  });

  const docText = docs
    .filter(d => d.fullText && d.fullText.trim().length > 40)
    .map(d => `### ${d.filename}${d.purpose ? ` (${d.purpose})` : ''}\n${d.fullText!.slice(0, 12_000)}`)
    .join('\n\n');

  const fichas = questionCtx.solutions
    .map(id => {
      const f = getSolutionFicha(id);
      if (!f) return '';
      return `### ${id}\nComo funciona: ${f.pt.comoFunciona}\nQuem precisa dizer sim: ${f.pt.quemPrecisaDizerSim}\nQuem cuida depois: ${f.pt.quemCuidaDepois}`;
    })
    .filter(Boolean)
    .join('\n\n');

  const bank = eligibleQuestions(questionCtx)
    .map(q => `- ${q.id}: "${q.askPt}"\n  desbloqueia: ${q.whyPt}`)
    .join('\n');

  const site: any = (state as any)?.sections?.intervention_site?.fields ?? {};
  const v = (k: string) => String(site[k]?.value ?? '').trim();

  // ⚠️ Where they DISAGREED with our risk figures. Encontro 2 told them plainly
  // that their word counts for more than our number, and until now nothing
  // downstream of that beat ever read the answer.
  const corrections = (() => {
    try {
      const j = JSON.parse(v('_hazard_check_json') || '{}');
      const e = Object.entries(j);
      return e.length ? e.map(([h, a]) => `${h}: disseram "${a}"`).join(' · ') : '';
    } catch { return ''; }
  })();

  const picked = v('nbs_interest').split(',').map(x => x.trim()).filter(Boolean);
  const pickedLabels = picked
    .map(id => NBS_FAMILIAS.find(f => (f.id as string) === id)?.pt.label ?? id)
    .join(', ');

  const catalogue = NBS_SOLUTIONS
    .map(s => `- ${s.id} (${NBS_FAMILIAS.find(f => f.id === s.familiaId)?.pt.label ?? s.familiaId}): ${s.pt.label} — ${s.pt.whatItIs.slice(0, 140)}`)
    .join('\n');

  return [
    '# O QUE ESTA ORGANIZAÇÃO JÁ NOS CONTOU',
    theirs,
    picked.length ? `\n# O QUE ELES ESCOLHERAM NO ENCONTRO 2 (isto lidera a lista, sempre)\n${pickedLabels}` : '',
    corrections ? `\n# ONDE ELES CORRIGIRAM OS NOSSOS DADOS DE RISCO\n${corrections}\n(a percepção deles vale mais que a nossa média de bairro)` : '',
    v('role_preference') ? `\n# PAPEL QUE A ORGANIZAÇÃO QUER TER\n${v('role_preference')}` : '',
    v('site_knowledge_depth') ? `\n# QUANTO SABEMOS DESTE LUGAR\n${v('site_knowledge_depth')}` : '',
    `\n# CATÁLOGO DE SOLUÇÕES (use apenas estes ids)\n${catalogue}`,
    docText ? '\n# O QUE ELES MESMOS ESCREVERAM (arquivos enviados)\n' + docText : '',
    fichas ? '\n# A SOLUÇÃO QUE ESCOLHERAM (nosso conteúdo revisado)\n' + fichas : '',
    cohort.length ? '\n# AS OUTRAS ORGANIZAÇÕES DESTE GRUPO\n' + cohort.map(c => `- ${c}`).join('\n') : '',
    '\n# PERGUNTAS DISPONÍVEIS (escolha no máximo 3 destes ids, nada fora da lista)',
    bank || '(nenhuma elegível)',
  ].filter(Boolean).join('\n');
}

const SYSTEM = `Você apoia uma equipe que ajuda organizações comunitárias de Porto Alegre a transformar uma ideia em um projeto de solução baseada na natureza.

Quatro tarefas, e nada além delas:

1. LISTA CURTA. Escolha 2 ou 3 soluções do catálogo que valeria a pena testar neste lugar. Não precisa chegar a uma — quem coordena a rede também não consegue definir tecnicamente qual é, e afunilar de "família" para duas ou três já é o ganho.

   Para cada uma, diga POR QUE citando o que você viu ou leu no material DELES: "na foto do fundo dá pra ver o barranco exposto", "vocês escreveram que a água fica dias parada". Um motivo que você poderia ter escrito sem olhar o material deles não serve — isso o cálculo já faz sozinho.

   ⚠️ REGRA DE ALINHAMENTO: o que eles escolheram no Encontro 2 lidera. Eles escolheram com intenção, e você não passa por cima disso. Se a evidência aponta para uma solução de fora dos grupos que eles marcaram, você pode propor — marque "outsideTheirPicks: true" e diga a tensão em voz alta no motivo ("encostas não estava nos grupos que vocês marcaram, mas na foto dá pra ver o barranco"). Quem decide são eles.

2. RASCUNHOS. Duas perguntas do Encontro 3 são de texto livre: "por que aqui?" (justification_why_here) e "como é o lugar hoje?" (baseline_condition). Se algum arquivo que ELES enviaram já responde uma delas, devolva a PASSAGEM LITERAL — copiada exatamente, sem reescrever, sem juntar frases separadas, sem corrigir português. Se nenhum arquivo responde, não devolva rascunho. Um rascunho inventado é pior que nenhum: a pessoa vai confirmar sem ler, e a voz dela some do documento.

3. PERGUNTAS. Escolha no máximo 3 ids da lista fornecida — só ids da lista. Escolha pelo que falta para ESTE projeto, não pelo que é interessante em geral. Se duas perguntam quase a mesma coisa, escolha uma.

4. OBSERVAÇÕES. No máximo 4, uma frase cada, em português simples e direto:
   - "strength": algo que o projeto tem de forte e que eles talvez não saibam que é forte. Isso é mostrado a eles.
   - "gap": algo que um financiador ou a prefeitura vai perguntar e que hoje não tem resposta. Isso vai para a coordenação.
   - "cohort": algo que só se enxerga olhando as outras organizações do grupo (mesma necessidade técnica, mesmo órgão, mesmo bairro). Isso vai para a coordenação.

Regras que não se quebram:
- Nunca invente número, prazo, custo ou benefício. Os números do Encontro 3 são calculados por fórmula e não são sua tarefa.
- Use só ids que existem no catálogo fornecido.
- Nunca escreva como se soubesse algo que a organização não contou.
- Nunca julgue a organização. Uma lacuna é uma lacuna do documento, não uma falha das pessoas.
- Português do Brasil, segunda pessoa do plural informal ("vocês"), sem jargão de projeto.`;

/**
 * Text plus their own photographs.
 *
 * `detail: 'low'` and at most three, matching the W2 ranker: the question here
 * is "what is this place like" rather than "read the sign in the background",
 * and full-detail images across three photos costs more than the answer is
 * worth.
 */
function buildUserContent(input: AdvisorInput): ContentPart[] {
  const parts: ContentPart[] = [{ type: 'input_text', text: buildPrompt(input) }];
  if (input.photos.length) {
    parts.push({
      type: 'input_text',
      text: `\n# FOTOS QUE ELES MESMOS TIRARAM DO LUGAR (${input.photos.map(p => p.filename).join(', ')})\nOlhe o que está nelas: o tipo de chão, se tem sombra, se tem barranco, por onde a água entraria. Cite o que viu.`,
    });
    for (const p of input.photos.slice(0, 3)) {
      parts.push({ type: 'input_image', image_url: p.dataUrl, detail: 'low' });
    }
  }
  return parts;
}

/**
 * Read everything, propose a little. Always resolves — never throws, never
 * blocks a beat.
 */
export async function adviseW3(input: AdvisorInput): Promise<{ advice: W3Advice; reason?: string }> {
  // Any provider will do — Anthropic in the deployment, OpenAI where that is
  // what is configured. See structuredModel.ts for why this used to say
  // OPENAI_API_KEY and why that silently disabled the feature in production.
  if (!structuredProvider()) {
    return { advice: EMPTY_ADVICE, reason: 'no API key' };
  }
  const eligible = eligibleQuestions(input.questionCtx);
  const eligibleIds = new Set(eligible.map(q => q.id));

  try {
    const raced = await Promise.race([
      createStructured(
        {
          input: [
            { role: 'system', content: SYSTEM },
            { role: 'user', content: buildUserContent(input) },
          ],
          config: { ...(ADVISOR_MODEL ? { model: ADVISOR_MODEL } : {}), reasoningEffort: 'medium', maxCompletionTokens: 4096 },
        },
        AdviceSchema,
        'w3_advice',
      ),
      new Promise<null>(resolve => setTimeout(() => resolve(null), ADVISOR_TIMEOUT_MS)),
    ]);
    if (!raced) return { advice: EMPTY_ADVICE, reason: 'timeout' };

    // ── The guards. Everything below here assumes the model got it wrong. ────
    const byName = new Map(input.docs.map(d => [d.filename, d.fullText ?? '']));
    const drafts = raced.drafts.filter(d => {
      const text = byName.get(d.sourceFilename);
      if (!text) return false;
      return verifyQuote(d.quote, text);
    });

    // Only ids from the ELIGIBLE set — not merely from the bank. A model that
    // proposes a slope question for a flat schoolyard is filtered by the rule,
    // not trusted to have read the eligibility itself.
    const seen = new Set<string>();
    const kept: number[] = [];
    raced.questionIds.forEach((id, i) => {
      if (!W3_QUESTION_IDS.has(id) || !eligibleIds.has(id) || seen.has(id)) return;
      seen.add(id);
      kept.push(i);
    });

    // Only real catalogue ids, deduped. A hallucinated solution would render as
    // a card with no photo and no ficha, which is the one failure a coordinator
    // would not spot by reading.
    const seenSol = new Set<string>();
    const shortlist = raced.shortlist.filter(p => {
      if (!getSolution(p.solutionId) || seenSol.has(p.solutionId)) return false;
      seenSol.add(p.solutionId);
      return true;
    });

    const keptCapped = kept.slice(0, CAP.questions);
    return {
      advice: {
        shortlist: shortlist.slice(0, CAP.shortlist),
        drafts: drafts.slice(0, CAP.drafts),
        questionIds: keptCapped.map(i => raced.questionIds[i]),
        questionReasons: keptCapped.map(i => raced.questionReasons[i] ?? ''),
        observations: raced.observations
          .filter(o => o.textPt.trim().length > 12)
          .slice(0, CAP.observations),
      },
      ...(drafts.length < raced.drafts.length
        ? { reason: `${raced.drafts.length - drafts.length} draft(s) dropped — quote not found in the cited document` }
        : {}),
    };
  } catch (err: any) {
    console.error('[w3-advisor] failed, falling back to the deterministic flow:', err?.message || err);
    return { advice: EMPTY_ADVICE, reason: `error: ${err?.message ?? 'unknown'}` };
  }
}

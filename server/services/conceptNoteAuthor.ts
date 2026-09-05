// ============================================================================
// THE AUTHORING PASS — phase 2 of docs/concept-note-authoring.md
// ============================================================================
// Three sections of the concept note get WRITTEN rather than assembled: the
// summary a funder reads first, the argument for this solution on this site,
// and what the project is expected to do. They are the three where a sentence
// someone would actually say beats a sentence a template can build.
//
// Everything else stays computed. The same split the W3 advisor already draws:
//
//   the model WRITES. the functions DECIDE, COMPUTE and VERIFY.
//
// ⚠️ It receives the FACT BASE and nothing else — not the state, not the
// transcript, not the fichas in full. A fact that is not in
// `conceptNoteFacts()` cannot reach the page, because the guard in
// `acceptAuthored()` drops any paragraph carrying a numeral the facts do not
// contain. That is the only reliable defence against the failure that matters
// here: a fluent, plausible, wrong sentence in a document that goes to a funder,
// where nobody reading it can tell an invented figure from a sourced one.
//
// If it fails, times out, is not configured, or answers badly, the document is
// exactly the deterministic one — never a degraded version of it.
// ============================================================================

import { z } from 'zod';
import { createStructured, structuredProvider } from './structuredModel';
import { withBudget } from './passBudget';
import {
  acceptAuthored, allowedSources, AUTHORABLE_SECTIONS,
  type ConceptNote, type AuthoredCandidate,
} from '@shared/concept-note';

const AUTHOR_MODEL = process.env.CBO_AUTHOR_MODEL || '';
// ⚠️ The cap is NOT here any more. It lives with the measurement that justifies
// it, in shared/model-pass-budgets.ts — this file shipped with 30 s against a
// ~46 s call, so the pass built to write the concept note had never once
// written one, and nothing said so.

// ⚠️ Plain strings, never z.enum. This is a ONE-SHOT forced tool call with no
// retry loop, so every schema constraint is a total-loss constraint: one
// paragraph aimed at a section that does not exist would throw away the other
// five. The section name is validated after parsing, where a bad value costs
// one paragraph. (The same trap an `orgNames.min(2)` sprang on the cohort
// narrative — see server/services/synergyReport.ts.)
const AuthoredSchema = z.object({
  paragraphs: z
    .array(
      z.object({
        section: z.string(),
        text: z.string(),
        sources: z.array(z.string()).default([]),
      }),
    )
    .default([]),
});

const SYSTEM_PT = `Você escreve seções de uma NOTA DE CONCEITO de projeto, para ser lida por um financiador, uma secretaria municipal e uma assembleia de bairro.

O QUE VOCÊ RECEBE
Um registro de fatos já apurados sobre um projeto comunitário de solução baseada na natureza em Porto Alegre. É tudo o que existe. Não há mais nada para consultar.

REGRAS, EM ORDEM DE IMPORTÂNCIA
1. NÃO INVENTE NADA. Nenhum número, nome, data, prazo, quantidade ou instituição que não esteja no registro. Um número que você acrescentar não pode ser distinguido de um número apurado por quem ler a página — e a página vai para um financiador.
2. TERCEIRA PESSOA, sempre. O documento fala SOBRE a organização, nunca COM ela. Nunca "vocês", nunca "a gente".
3. Cada parágrafo cita as fontes que o sustentam, copiadas EXATAMENTE da lista de fontes permitidas. Um parágrafo sem fonte reconhecida é descartado.
4. Escreva prosa de documento técnico: afirmativa, específica, sem adjetivo de propaganda e sem tranquilizar quem lê. Nada de "incrível", "transformador", "essencial".
5. Não repita o que outra seção já diz. Não explique como o documento foi montado.
6. NÃO CONCLUA O PORTE DO PROJETO a partir de faixas regulamentares, tetos de edital ou limites de licença. O porte está no registro — a área desenhada ou a contagem de unidades — ou está em aberto, e nesse caso diga que está. Uma faixa que aparece no registro por outro motivo (o decreto que define pequena e média escala, o teto de uma chamada) descreve a REGRA, não este projeto.
7. O mesmo vale para qualquer número: ele está no registro para responder a uma pergunta específica. Usá-lo para responder a outra é inventar, mesmo quando o número está certo.
8. O CAMPO "cohort" SÃO CONTAGENS DO GRUPO, e nele está o argumento do programa: quantas outras organizações precisam do mesmo estudo, passam pelo mesmo instrumento, esbarram na mesma barreira. Use isso no "resumo" quando fizer diferença — um financiador que lê "este projeto não chega sozinho" está lendo a razão de existir um portfólio. Não invente organizações, não as nomeie (o registro não traz nome nenhum, de propósito) e não transforme uma contagem em compromisso ("três outras precisam do mesmo estudo" não é "as quatro vão contratar juntas") e nunca combine duas linhas numa só contagem. Cada número vem da linha em que está, copiado como está — por extenso ou em algarismo, tem de ser um dos que estão lá. ⚠️ Esta regra é nossa, não do documento: não a explique na página, não escreva que as contagens são distintas ou não somáveis. Quem lê quer o número certo, não a regra que o produziu.
9. NÃO ESCREVA "REGISTRO". Nem "no registro", nem "conforme o registro", nem "não consta do registro". Essa é a palavra que mais derruba parágrafo aqui — sete vezes em oito organizações na última medição, e cada parágrafo derrubado é uma seção que volta a ser o texto de template. Troque assim:
   "não há, no registro, número de referência" → "a base de evidências não traz número de referência"
   "conforme descrito no registro"            → "conforme a ficha técnica" / "conforme o relato da organização"
   "o registro não informa a área"            → "a organização não informou a área"
   "o que consta no registro"                 → (apague; diga o fato direto)
10. NÃO NOMEIE A MÁQUINA. Quem lê a página não sabe o que é "o registro", "o veredito", "o processo" ou "a base de dados" — são palavras nossas, de dentro do sistema. Diga o que falta na língua de quem lê: "a organização não informou", "não há medição disponível", "esse dado ainda não existe". (A ficha técnica da solução é exceção: é um documento real que a organização conhece e pode citar pelo nome.)

O QUE VOCÊ ESCREVE MELHOR QUE A ORGANIZAÇÃO
Ela sabe o lugar. Você tem o catálogo técnico, a base de evidências, os dados do bairro, o que uma aprovação realmente exige — e o grupo, que nenhuma organização enxerga de dentro do próprio registro. A seção "porque" é onde isso conta: ligue o MECANISMO da ficha às CONDIÇÕES do terreno — o que está no chão hoje, o risco nomeado, a escala — em vez de repetir a descrição da solução.

SEÇÕES QUE VOCÊ PODE ESCREVER
- "resumo": 2 a 3 parágrafos curtos. O que é o projeto, onde, para quê, quanto custa e o que falta para começar. É o que se lê primeiro e muitas vezes é só o que se lê.
- "porque": 1 parágrafo por solução. Por que ESTA solução NESTE terreno. Se o registro disser que o mecanismo catalogado não responde ao risco que a organização nomeou, diga isso — é informação, não defeito.
- "resultados": 1 a 3 parágrafos. O que se espera que aconteça, com as faixas do registro, e em que escala isso conta. Onde não houver número, diga que não há.`;

const SYSTEM_EN = SYSTEM_PT.replace('Você escreve seções de uma NOTA DE CONCEITO', 'You write sections of a project CONCEPT NOTE') +
  '\n\nWrite in English.';

/** The facts, as the model sees them: JSON, plus the closed list of citations. */
function buildUserContent(note: ConceptNote, lang: 'pt' | 'en'): string {
  const sources = Array.from(allowedSources(note)).sort();
  const assembled = note.sections
    .filter(s => AUTHORABLE_SECTIONS.includes(s.id))
    .map(s => `## ${s.id}\n${s.paragraphs.map(p => p.text).join('\n')}`)
    .join('\n\n');
  return [
    '# REGISTRO DO PROJETO (tudo o que existe)',
    '```json',
    JSON.stringify(note.facts, null, 1),
    '```',
    '',
    '# FONTES PERMITIDAS (copie exatamente)',
    sources.map(s => `- ${s}`).join('\n'),
    '',
    '# O QUE O DOCUMENTO DIZ HOJE NESSAS SEÇÕES',
    'Montado por template. Escreva melhor — mesma informação, sem inventar nada:',
    assembled,
    '',
    `Escreva as seções ${AUTHORABLE_SECTIONS.map(s => `"${s}"`).join(', ')} em ${lang === 'pt' ? 'português do Brasil' : 'inglês'}.`,
  ].join('\n');
}

export interface AuthorOutcome {
  note: ConceptNote;
  /** Why the deterministic version stands, when it does. */
  reason?: string;
  accepted: number;
  rejected: Array<{ text: string; why: string }>;
}

/**
 * Write three sections, or leave the document exactly as it was.
 *
 * Always resolves. Never throws.
 */
export async function authorConceptNote(
  note: ConceptNote,
  lang: 'pt' | 'en' = 'pt',
): Promise<AuthorOutcome> {
  if (!structuredProvider()) return { note, reason: 'no API key', accepted: 0, rejected: [] };

  let raced: { paragraphs?: Array<{ section: string; text: string; sources?: string[] }> } | null = null;
  try {
    raced = await withBudget(
      'conceptNoteAuthor',
      createStructured(
        {
          input: [
            { role: 'system', content: lang === 'pt' ? SYSTEM_PT : SYSTEM_EN },
            { role: 'user', content: buildUserContent(note, lang) },
          ],
          config: {
            ...(AUTHOR_MODEL ? { model: AUTHOR_MODEL } : {}),
            reasoningEffort: 'medium',
            maxCompletionTokens: 4096,
          },
        },
        AuthoredSchema,
        'concept_note_sections',
      ),
    );
  } catch (err) {
    return { note, reason: `failed: ${(err as Error)?.message ?? 'unknown'}`, accepted: 0, rejected: [] };
  }
  if (!raced) return { note, reason: 'timeout', accepted: 0, rejected: [] };

  const candidates: AuthoredCandidate[] = (raced.paragraphs ?? []).map(p => ({
    section: p.section,
    text: p.text,
    sources: p.sources ?? [],
  }));
  const result = acceptAuthored(note, candidates, lang);
  // ⚠️ Logged, always. A rejection is the only signal that the pass is drifting
  // — an invented figure caught here is a defect that reached the last gate.
  if (result.rejected.length) {
    console.log(
      `[concept-note] ${result.accepted} parágrafo(s) aceitos, ${result.rejected.length} recusados: ` +
        result.rejected.map(r => `${r.why}`).join(' | '),
    );
  }
  return {
    note: result.note,
    accepted: result.accepted,
    rejected: result.rejected,
    ...(result.accepted ? {} : { reason: 'nothing survived the guards' }),
  };
}

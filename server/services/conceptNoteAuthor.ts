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
import {
  acceptAuthored, allowedSources, AUTHORABLE_SECTIONS,
  type ConceptNote, type AuthoredCandidate,
} from '@shared/concept-note';

const AUTHOR_MODEL = process.env.CBO_AUTHOR_MODEL || '';
const AUTHOR_TIMEOUT_MS = Number(process.env.CBO_AUTHOR_TIMEOUT_MS || 30_000);

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

O QUE VOCÊ ESCREVE MELHOR QUE A ORGANIZAÇÃO
Ela sabe o lugar. Você tem o catálogo técnico, a base de evidências, os dados do bairro e o que uma aprovação realmente exige. A seção "porque" é onde isso conta: ligue o MECANISMO da ficha às CONDIÇÕES do terreno — o que está no chão hoje, o risco nomeado, a escala — em vez de repetir a descrição da solução.

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
    raced = await Promise.race([
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
      new Promise<null>(resolve => setTimeout(() => resolve(null), AUTHOR_TIMEOUT_MS)),
    ]);
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

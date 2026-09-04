// ============================================================================
// THE DIG — two passes that write questions instead of picking them
// ============================================================================
// Round 1 reads the whole record and writes three questions for THIS project.
// Round 2 reads the answers and follows up on the one or two that opened
// something. That second half is the part a bank of pre-written questions can
// never do, and it is the part that produces the sentence worth having:
//
//   "Quantas casas são?"            → "umas 8, as do fundo"
//   "Dessas 8, alguma tem idoso?"   → "quase todas, tem 3"
//   → the page: "O alagamento atinge 8 domicílios, três deles com pessoas
//     idosas." One line that changes how an edital reads the project.
//
// Both passes ALWAYS resolve. A failure, a timeout, or nothing surviving the
// guards leaves the flow exactly as it was — the bank still stands behind this
// as the deterministic floor.
// ============================================================================

import { z } from 'zod';
import { createStructured, structuredProvider, type ContentPart } from './structuredModel';
import { withBudget } from './passBudget';
import {
  acceptDig, DIG_ROUND_1, DIG_FOLLOW_UPS, type DigQuestion,
} from '@shared/w3-dig';
import { SECTION_ORDER } from '@shared/concept-note';

// ⚠️ Plain strings, never z.enum — the same one-shot total-loss argument as
// every other structured call here. `feeds` is validated after parsing, where a
// bad value costs one question instead of the whole round.
const DigSchema = z.object({
  questions: z
    .array(
      z.object({
        askPt: z.string(),
        askEn: z.string(),
        notePt: z.string(),
        noteEn: z.string(),
        feeds: z.string(),
        sourceKind: z.string(),
        basedOn: z.string(),
        followsUp: z.string().optional(),
      }),
    )
    .default([]),
});

const REGISTER = `DOIS REGISTROS, SEMPRE — e é aqui que quase tudo dá errado.
- "askPt" é FALADA para elas, na roda: segunda pessoa ("vocês"), o lugar delas, as palavras delas. Curta. Uma pergunta só.
- "notePt" é ESCRITA sobre elas, numa nota técnica que vai para um financiador: TERCEIRA pessoa, sem "vocês", sem "a gente". Contém {answer} exatamente uma vez, e a frase tem que fazer sentido com a resposta encaixada ali.

Exemplo do par certo:
  askPt : "Vocês falaram que a água volta pras casas do fundo. Quantas casas são?"
  notePt: "O alagamento atinge {answer} conforme o relato da organização."

Exemplo do par ERRADO (a nota repete a pergunta e fala com quem lê):
  notePt: "Quantas casas são? {answer}"`;

const SECTIONS = `SEÇÕES DA NOTA DE CONCEITO (escolha uma em "feeds"): ${SECTION_ORDER.join(', ')}.
- problema: o risco, quem é atingido, o que acontece hoje
- porque: por que esta solução neste terreno
- resultados: o que se espera que aconteça
- exige: aprovações, quem precisa dizer sim, quem mais usa o lugar
- custo / financiamento: dinheiro
- manutencao: quem cuida depois, e com que recurso
- organizacao: quem é a organização`;

const SYSTEM_1 = `Você prepara uma nota de conceito para uma organização comunitária de Porto Alegre, junto com ela, numa oficina que está acontecendo agora.

Sua tarefa: escrever ${DIG_ROUND_1} perguntas que façam ESTA nota valer mais.

O QUE FAZ UMA PERGUNTA VALER
1. Ela nasce de algo que ELAS já disseram, mostraram ou escreveram. Diga de onde veio em dois campos:
   - "sourceKind": uma palavra só — "quote" (uma frase delas), "photo" (algo que você viu numa foto), "document" (algo no arquivo que enviaram), "field" (um dado do registro) ou "answer" (uma resposta que acabaram de dar).
   - "basedOn": se for "quote", A FRASE DELAS SOZINHA, copiada exata, sem comentário em volta — ela é conferida contra o registro e a pergunta cai se não bater. Nos outros casos, o que você viu ou leu, em poucas palavras.
   Uma pergunta que você poderia ter escrito sem ler o material delas não serve: essa é a pergunta de um formulário, e um formulário elas já preencheram. As melhores costumam ser as de "photo" — ninguém as faz sem ter olhado.
2. A resposta cabe na nota. Diga em "feeds" onde. Se você não consegue dizer em que seção a resposta entra, a pergunta não é para agora.
3. Quem responde sabe a resposta. Elas conhecem o lugar, a rua, as pessoas, o histórico. Não sabem vazão, custo unitário nem legislação — isso é conosco.
4. A resposta é concreta: um número, um nome, uma frequência, um acontecimento. "Como vocês veem o futuro do projeto?" não é uma pergunta, é uma redação.

REGRAS QUE NÃO SE QUEBRAM
- NÃO PERGUNTE O QUE JÁ ESTÁ NO REGISTRO. Se a resposta já está lá, você acabou de dizer a elas que ninguém leu.
- NÃO AFIRME NÚMERO NENHUM na pergunta. Se ninguém disse "8 casas", você não pode perguntar "as 8 casas alagam sempre?" — isso é inventar um fato e pedir confirmação dele.
- Uma pergunta por vez. Nada de "quantas casas e quem mora nelas?".
- Português do Brasil de conversa, sem jargão de projeto.

${REGISTER}

${SECTIONS}`;

const SYSTEM_2 = `Você está numa oficina com uma organização comunitária de Porto Alegre, montando a nota de conceito do projeto delas. Elas acabaram de responder algumas perguntas.

Sua tarefa: escolher no máximo ${DIG_FOLLOW_UPS} respostas que ABRIRAM alguma coisa, e fazer UMA pergunta a mais sobre cada uma. Em "followsUp", ponha o id da pergunta cuja resposta você está seguindo.

O QUE MERECE UM APROFUNDAMENTO
- Uma resposta com um número solto que fica mais forte qualificado: "umas 8 casas" → quem mora nelas.
- Uma resposta que nomeia alguém ou algo que a nota precisaria identificar: "a gente fala com a diretora" → quem é, e desde quando.
- Uma resposta que revela um risco ou uma condição que ninguém tinha registrado.

O QUE NÃO MERECE
- Uma resposta já completa. Não pergunte por perguntar: devolver zero perguntas é uma resposta correta e frequente.
- "Não sei" — insistir é constrangedor e não produz nada.
- Curiosidade sua que não entra na nota.

Em "sourceKind" ponha "answer", e em "basedOn" a resposta que você está seguindo.

${REGISTER}

${SECTIONS}`;

export interface DigInput {
  /** Everything they have said, already assembled — the same bundle the advisor reads. */
  record: string;
  /** Their photographs, when the round can use them. */
  photos?: Array<{ filename: string; dataUrl: string }>;
  /** Asked already this session, so nothing is asked twice. */
  already: DigQuestion[];
}

export interface DigOutcome {
  questions: DigQuestion[];
  dropped: Array<{ ask: string; why: string }>;
  reason?: string;
}

const EMPTY: DigOutcome = { questions: [], dropped: [] };

async function run(
  passId: string,
  system: string,
  user: ContentPart[] | string,
  input: DigInput,
  round: 1 | 2,
  max: number,
): Promise<DigOutcome> {
  if (!structuredProvider()) return { ...EMPTY, reason: 'no API key' };
  let raw: { questions?: Array<Record<string, unknown>> } | null = null;
  try {
    raw = await withBudget(
      passId,
      createStructured(
        {
          input: [
            { role: 'system', content: system },
            { role: 'user', content: user as any },
          ],
          config: {
            ...(process.env.CBO_ADVISOR_MODEL ? { model: process.env.CBO_ADVISOR_MODEL } : {}),
            reasoningEffort: 'medium',
            maxCompletionTokens: 2500,
          },
        },
        DigSchema,
        'dig_questions',
      ),
    );
  } catch (err: any) {
    return { ...EMPTY, reason: `failed: ${err?.message ?? 'unknown'}` };
  }
  if (!raw) return { ...EMPTY, reason: 'timeout' };

  const verdict = acceptDig((raw.questions ?? []) as Array<Partial<DigQuestion>>, {
    round,
    record: input.record,
    already: input.already,
    max,
  });
  // ⚠️ Logged, always. A dropped question is the only signal that the pass is
  // drifting, and the guards were written from failures that were invisible
  // until somebody printed the page.
  if (verdict.dropped.length) {
    console.log(
      `[dig] round ${round}: ${verdict.kept.length} mantida(s), ${verdict.dropped.length} descartada(s) — ` +
        verdict.dropped.map(d => `${d.why}`).join(' | '),
    );
  }
  if (process.env.CBO_DIG_DEBUG === '1') {
    for (const q of raw.questions ?? []) console.log(`   [debug] basedOn="${String((q as any).basedOn ?? '').slice(0, 110)}"`);
  }
  return { questions: verdict.kept, dropped: verdict.dropped };
}

/** Round 1 — written from the record, with their photographs in front of it. */
export async function digRound1(input: DigInput): Promise<DigOutcome> {
  const parts: ContentPart[] = [
    { type: 'input_text', text: `# TUDO O QUE ESTA ORGANIZAÇÃO JÁ CONTOU\n${input.record}` },
  ];
  if (input.photos?.length) {
    parts.push({
      type: 'input_text',
      text:
        `\n# FOTOS QUE ELAS MESMAS TIRARAM DO LUGAR (${input.photos.map(p => p.filename).join(', ')})\n` +
        'Uma pergunta que nasce do que se vê numa foto é a mais difícil de fazer sem ter olhado — e a que mais mostra que alguém olhou.',
    });
    for (const p of input.photos.slice(0, 3)) {
      parts.push({ type: 'input_image', image_url: p.dataUrl, detail: 'low' });
    }
  }
  return run('w3Dig', SYSTEM_1, parts, input, 1, DIG_ROUND_1);
}

/** Round 2 — written from what they just answered. No photographs: it is the answers that matter here, and this round is closer to the room. */
export async function digRound2(input: DigInput): Promise<DigOutcome> {
  const answered = input.already
    .filter(q => (q.answer ?? '').trim())
    .map(q => `- id: ${q.id}\n  perguntamos: "${q.askPt}"\n  responderam: "${q.answer}"`)
    .join('\n');
  if (!answered) return { ...EMPTY, reason: 'nothing answered to follow up on' };
  const user =
    `# O QUE ELAS JÁ CONTARAM\n${input.record}\n\n` +
    `# O QUE ACABARAM DE RESPONDER\n${answered}\n\n` +
    `Escolha no máximo ${DIG_FOLLOW_UPS}. Zero é uma resposta correta.`;
  // ⚠️ The answers ARE the record now. A follow-up that repeats a number they
  // just said — "essas 8 casas" — is repeating them, and checking it against a
  // record that predates the answer would call it an invention.
  return run('w3DigFollowUp', SYSTEM_2, user, { ...input, record: `${input.record}\n${answered}` }, 2, DIG_FOLLOW_UPS);
}

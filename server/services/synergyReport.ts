// ============================================================================
// THE SYNERGY REPORT — the button that replaces a hand-written document
// ============================================================================
// The report this generates already exists. It was written by hand for ten
// organisations on 21 August ("Onde queremos atuar: territórios, recursos e
// sinergias da Rede"), it fed the coordination's planning, and it went stale the
// moment anyone answered another question.
//
// Ricardo, 31 August: "sería genial que pudiera hacer eso, porque ahí toda vez
// que una organización sube la información, no necesitas hacer[lo] todo la vez."
//
// So: the groupings are DERIVED (shared/w3-synergies.ts) and the narrative is
// WRITTEN on top of them. Same split as everywhere else in W3 — a coordinator
// can check why two organisations were put together without taking a model's
// word for it, and re-running it after three more sessions changes the answer
// rather than reprinting the old one.
//
// ── What the hand-written version got right and this must not lose ──────────
//
//  1. "São hipóteses para validar com as organizações no encontro, não decisões
//     prontas." A cluster an organisation did not agree to falls apart in the
//     room, and the validation IS the value of the meeting. Every grouping is
//     labelled as a hypothesis, and the suggested session thread ends on
//     "faz sentido para vocês?".
//  2. The gaps are a section, not a footnote. Three of the ten organisations
//     had no data at all, and the report says so before it says anything else
//     about the network's shape.
//  3. The risk numbers carry their caveat every time, and an organisation that
//     disagreed with ours outranks it.
// ============================================================================

import { z } from 'zod';
import { createStructured, structuredProvider } from './structuredModel';
import { approvalRouteLine } from '@shared/nbs-knowledge';
import { withBudget } from './passBudget';
import { analyseSynergies, type SynergyAnalysis, type SynergyMember } from '@shared/w3-synergies';
import { WORRY_SUBTYPES } from '@shared/site-knowledge';
import { cboDisplayValue } from '@shared/cbo-field-catalog';
import { getSolution, NBS_SOLUTIONS, NBS_FAMILIAS } from '@shared/nbs-catalog';

// ⚠️ NOTHING HERE CONSTRAINS THE MODEL'S SHAPE — that is enforced below, after
// parsing, where a bad element can be DROPPED instead of taking the reply with
// it.
//
// This schema used to say `orgNames.min(2)` and `lines.max(4)`, and in front of
// a real cohort the model returned four good lines where the third named one
// organisation. Validation failed on that one field, the exception discarded
// the whole reply, and the coordinator got "a leitura automática falhou desta
// vez" — losing three usable programme lines and the portfolio thread to a
// single over-eager sentence.
//
// A validation rule that can only pass or fail the entire response is the wrong
// tool for a model's output. Parse loosely; enforce strictly in code.
const LineSchema = z.object({
  /** e.g. "Eixo 4º Distrito" — a handle people can say out loud in the room. */
  namePt: z.string(),
  /** Org names, exactly as given in the input. Anything else is dropped. */
  orgNames: z.array(z.string()),
  /** Two or three sentences: what holds them together, in pt-BR. */
  rationalePt: z.string(),
  /** Why it matters to a funder or to the city. One sentence. */
  whyItMattersPt: z.string(),
});

const NarrativeSchema = z.object({
  /** The shared thread the coordination could propose for the whole portfolio. */
  portfolioThreadPt: z.string(),
  lines: z.array(LineSchema),
  /** Questions worth putting to the room, from what the data leaves open. */
  questionsForTheRoomPt: z.array(z.string()),
  /**
   * ⚠️ What looks poolable and is NOT.
   *
   * This pass could structurally only say positive things: `shapeNarrative`
   * drops any line naming fewer than two known organisations, so the report
   * could say "these four share an instrument" and never "this pooling looks
   * obvious and breaks, because two of them are on private land and take a
   * different route entirely". A coordinator planning a meeting needs the
   * second at least as much as the first — it is the one that stops an hour
   * being spent on a group that cannot be a group.
   */
  tensionsPt: z.array(z.string()).default([]),
  /**
   * What has to happen in the same window to be worth doing together.
   *
   * The approval routes carry real, published timings — the SMP analyses a
   * Termo de Adoção in 30 days — and nothing in this report ever turned that
   * into "these four should file inside the same window, so it is one
   * conversation with the secretariat instead of four".
   */
  sequencingPt: z.array(z.string()).default([]),
});

/** The caps the schema used to enforce, applied where overshooting is survivable. */
const MAX_LINES = 4;
const MAX_QUESTIONS = 5;
const MAX_TENSIONS = 3;
const MAX_SEQUENCING = 3;

export type SynergyNarrative = z.infer<typeof NarrativeSchema>;

export interface SynergyReport {
  analysis: SynergyAnalysis;
  narrative: SynergyNarrative | null;
  /** Why the narrative is absent, when it is. The report still stands without it. */
  narrativeReason?: string;
  generatedAt: string;
}

const SYSTEM = `Você apoia a equipe do Vila Flores, que coordena uma rede de organizações comunitárias de Porto Alegre trabalhando com soluções baseadas na natureza.

Recebe uma análise JÁ CALCULADA: quem está onde, o que preocupa cada uma, que famílias de solução escolheram, que papéis querem, quem já colaborou com quem, e onde há necessidades técnicas ou órgãos em comum.

Sua tarefa é escrever a leitura transversal: propor até 4 LINHAS DE PROGRAMA, o fio condutor do portfólio, e mais duas coisas que ninguém consegue ver de dentro de uma organização só:

TENSÕES (tensionsPt, até 3). Onde um agrupamento PARECE óbvio e não funciona. Duas organizações com o mesmo risco mas em terreno de titularidade diferente seguem instrumentos diferentes; duas com a mesma solução em portes muito diferentes não compram junto. Diga qual é o agrupamento aparente e por que ele quebra, apontando o fato. ⚠️ Isto é tão útil quanto uma linha de programa: evita que a coordenação gaste uma reunião com um grupo que não é grupo. Nenhuma tensão é uma resposta válida.

SEQUÊNCIA (sequencingPt, até 3). O que precisa acontecer na MESMA janela para valer a pena junto. Se a análise traz um prazo de órgão — "a Secretaria analisa em 30 dias" — e várias organizações passam pelo mesmo instrumento, isso é uma conversa com o órgão em vez de várias. Só escreva se a análise trouxer o prazo; não invente prazo nenhum.

O que é uma linha de programa: um conjunto de organizações que faz sentido apoiar junto. Pode ser por território vizinho, pelo mesmo tipo de risco em lugares diferentes, ou por um arranjo em comum (área pública sem documento, por exemplo). NÃO precisa ser a mesma solução — precisa ter uma lógica compartilhada.

Regras que não se quebram:
- Use SOMENTE os nomes de organização que aparecem na análise, escritos exatamente igual.
- Toda afirmação tem que se apoiar num fato da análise. Se você não consegue apontar o fato, não escreva a frase.
- Nunca invente colaboração, capacidade, orçamento ou intenção que não esteja ali.
- Estas são HIPÓTESES para validar no encontro, não decisões. Escreva assim.
- Nunca julgue uma organização por não ter respondido ou por não ter escolhido nada. A falta de dado é uma lacuna do nosso lado.
- Português do Brasil, direto, sem jargão de consultoria.`;

function analysisForModel(a: SynergyAnalysis): string {
  const name = (id: string) => a.members.find(m => m.id === id)?.orgName ?? id;
  const L: string[] = [];

  L.push('# ORGANIZAÇÕES');
  for (const m of a.members) {
    L.push(
      `- ${m.orgName} · ${m.bairro ?? 'bairro não informado'}` +
      `${m.siteName ? ` · local: ${m.siteName}` : ' · sem local marcado'}` +
      `${m.worry ? ` · preocupa: ${worryWords(m.worry)}` : ''}` +
      `${m.familias.length ? ` · famílias: ${m.familias.map(familiaWords).join(', ')}` : ''}` +
      `${m.solutions.length ? ` · solução escolhida: ${m.solutions.map(solutionWords).join(', ')}` : ''}` +
      `${m.roles.length ? ` · papéis: ${m.roles.join(', ')}` : ''}` +
      `${m.tenure ? ` · terreno: ${tenureWords(m.tenure)}` : ''}` +
      `${m.nbsExperience ? ` · experiência SbN: ${m.nbsExperience}` : ''}` +
      `${m.fundingScale ? ` · financiamento: ${fundingScaleWords(m.fundingScale)}${m.biggestBudget ? ` (maior: ${m.biggestBudget})` : ''}` : ''}` +
      `${m.priorCollaboration ? ` · colaboração anterior: ${m.priorCollaboration}${m.priorCollaborationDetail ? ` — ${m.priorCollaborationDetail}` : ''}` : ''}`,
    );
    // Verbatim. The hand-written report quotes these throughout, and they carry
    // more about whether two organisations belong together than any field we
    // canonicalised — "área aterrada, com pouca chuva já fica úmido e alagado"
    // places an org in a cluster that no enum answer would.
    if (m.ownWords.story) L.push(`    "nas palavras deles": ${m.ownWords.story.slice(0, 700)}`);
    if (m.ownWords.whyHere) L.push(`    "por que aqui": ${m.ownWords.whyHere.slice(0, 500)}`);
    if (m.ownWords.baseline) L.push(`    "como está hoje": ${m.ownWords.baseline.slice(0, 400)}`);
    if (m.correctionsPt) L.push(`    ⚠️ corrigiu nossos dados de risco: ${m.correctionsPt} — a percepção dela vale mais que a nossa média`);
    // ⚠️ Pre-digested, never the images. Two organisations photographing the
    // same failing wall is a synergy no field expresses, and these sentences
    // are the only place it exists.
    for (const n of m.photoNotesPt ?? []) L.push(`    📷 nas fotos do lugar: ${n}`);
    // ⚠️ What Encontro 3 concluded. Until now this pass read the fields and
    // their own words and NOTHING the workshop produced — so the two most
    // poolable things a cohort has, the instrument each project goes through
    // and the funding path each one can or cannot reach, never arrived at the
    // pass whose entire job is pooling. See docs/context-first.md.
    if (m.approvalInstruments.length) {
      L.push(`    instrumento de aprovação: ${m.approvalInstruments.join(', ')}`);
    }
    if (m.fundingBlocked.length) {
      L.push(`    ⚠️ financiamento fora de alcance hoje: ${m.fundingBlocked.join(', ')}`);
    }
    if (m.fundingOpen.length) {
      L.push(`    caminhos de financiamento possíveis: ${m.fundingOpen.slice(0, 4).join(', ')}`);
    }
    // The full text, not the 280-character summary. A Teia Sprint proposal is
    // exactly the artefact that shows two organisations proposing the same
    // thing, and this pass was reading a précis of it.
    for (const d of m.docs) {
      const body = (d.fullText ?? d.summary ?? '').replace(/\s+/g, ' ').trim();
      if (!body) { L.push(`    arquivo: ${d.filename}`); continue; }
      L.push(`    arquivo ${d.filename}${d.purpose ? ` (${d.purpose})` : ''}: ${body.slice(0, 1200)}`);
    }
  }

  if (a.groups.length) {
    L.push('\n# AGRUPAMENTOS JÁ CALCULADOS (por território, por mecanismo de risco, por arranjo de terreno)');
    for (const g of a.groups) {
      L.push(`- [${g.axis}] ${g.key}: ${g.memberIds.map(name).join(', ')}`);
      for (const b of g.becausePt) L.push(`    · ${b}`);
      for (const c of g.complementsPt) L.push(`    + ${c}`);
    }
  }
  if (a.pooledStudies.length) {
    L.push('\n# NECESSIDADES TÉCNICAS EM COMUM (onde uma contratação conjunta economiza de verdade)');
    for (const p of a.pooledStudies) L.push(`- ${p.need}: ${p.memberIds.map(name).join(', ')}`);
  }
  // ⚠️ The published timings, so "the same window" can mean something. Without
  // them the sequencing section would be the model guessing at deadlines, which
  // is the one thing it must never do with a date.
  {
    // ⚠️ Every instrument in the cohort, not only the POOLED ones. The first
    // live run wrote nothing here — correctly, because the one pooled
    // instrument was an ART, which has no published municipal timing, while a
    // Termo de Permissão de Uso with its stated window sat in a member's record
    // unread. The guard against inventing a deadline is right; starving it of
    // the real ones is not.
    const instruments = new Set([
      ...a.pooledInstruments.map(p => p.instrument),
      ...a.members.flatMap(m => m.approvalInstruments ?? []),
    ]);
    const timings = Array.from(instruments)
      .map(i => approvalRouteLine(i, 'pt'))
      .filter((x): x is string => !!x);
    if (timings.length) {
      L.push('', '# PRAZOS PUBLICADOS DOS ÓRGÃOS (use para a sequência; não invente nenhum outro)');
      for (const t of timings) L.push(`- ${t}`);
    }
  }
  if (a.pooledInstruments.length) {
    L.push('\n# INSTRUMENTO DE APROVAÇÃO EM COMUM (uma conversa, não sete)');
    for (const p of a.pooledInstruments) L.push(`- ${p.instrument}: ${p.memberIds.map(name).join(', ')}`);
  }
  if (a.sharedFundingBarriers.length) {
    // ⚠️ The programme-level finding no organisation can reach alone — and the
    // answer to it is the aggregation the funding workshop spent an hour on.
    L.push('\n# MESMA BARREIRA DE FINANCIAMENTO (o argumento da agregação, em números)');
    for (const p of a.sharedFundingBarriers) L.push(`- ${p.path}: ${p.memberIds.map(name).join(', ')}`);
  }
  if (a.pooledBodies.length) {
    L.push('\n# ÓRGÃOS EM COMUM (uma conversa em vez de várias)');
    for (const p of a.pooledBodies) L.push(`- ${p.body}: ${p.memberIds.map(name).join(', ')}`);
  }
  if (a.transversal.length) {
    L.push('\n# PAPÉIS TRANSVERSAIS');
    for (const t of a.transversal) L.push(`- ${t.notePt}`);
  }
  if (a.commonPt.length) L.push('\n# DENOMINADORES COMUNS\n' + a.commonPt.map(c => `- ${c}`).join('\n'));
  L.push('\n# LACUNAS\n' + a.gapsPt.map(g => `- ${g}`).join('\n'));
  return L.join('\n');
}

/** A failure in words a coordinator can act on, never the provider's. */
function coordinatorReason(err: any): string {
  const msg = String(err?.message ?? '');
  if (/401|api key|unauthor/i.test(msg)) return 'a leitura automática não está configurada neste ambiente';
  if (/429|rate limit|quota/i.test(msg)) return 'a leitura automática está sobrecarregada agora — vale tentar de novo em alguns minutos';
  if (/timeout|abort|ETIMEDOUT/i.test(msg)) return 'a leitura automática demorou demais e foi interrompida';
  return 'a leitura automática falhou desta vez';
}

/**
 * Everything the schema is deliberately not enforcing, applied where an
 * overshoot costs the extra item instead of the whole answer.
 *
 * Two rules, in this order:
 *  · only organisations that exist in THIS cohort, by exact name — a programme
 *    line naming an org that is not in the room is the one error a coordinator
 *    would not catch by reading;
 *  · then only lines that still join two of them, because a line with one
 *    organisation on it is not a line.
 *
 * Null when nothing survives and there is no portfolio thread either — an empty
 * section under a heading reads worse than an honest absence.
 */
/**
 * ⚠️ Words, never ids. The first live run of this pass — the first ever — wrote
 * "as únicas duas organizações que nomearam calor (heat)" and "diferente da
 * Associação Escola do Partenon (formal-agreement)" into a narrative a
 * coordinator reads. The model did not invent those: it was handed
 * `preocupa: heat` and `terreno: formal-agreement` and repeated them, correctly.
 *
 * The context bundle learned this same lesson in August — "it used to print the
 * raw key and the raw value" — and a pass written after it still sent ids.
 */
/** The stored values that must never be printed. Not a general slug matcher —
 *  these are the exact ids the record holds for the two fields that leaked. */
const MACHINE_IDS = new RegExp(
  '\\b(' +
    [
      // ⚠️ Minus the ids that ARE the word. `biovaletas` is this solution's id
      // and also the ordinary Portuguese plural, so flagging it reports a
      // correct sentence as a leak — and a guard that cries wolf on correct
      // output is one people learn to scroll past.
      ...NBS_SOLUTIONS
        .filter(s => s.id.replace(/-/g, ' ') !== s.pt.label.toLowerCase())
        .map(s => s.id),
      'formal-agreement', 'public-informal', 'public-no-access', 'private-owned',
      'needs_study', 'needs_permission', 'needs_site',
      'small', 'funded', 'medium', 'large',
    ]
      .map(v => v.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
      .join('|') +
    ')\\b',
);

function worryWords(raw: string): string {
  return raw
    .split(',')
    .map(v => v.trim())
    .filter(Boolean)
    .map(id => {
      const sub = WORRY_SUBTYPES.find(w => w.id === id);
      if (sub) return sub.dPt.toLowerCase();
      const family: Record<string, string> = { flood: 'a água', heat: 'o calor', landslide: 'o barranco' };
      return family[id] ?? id;
    })
    .join('; ');
}

function tenureWords(raw: string): string {
  return cboDisplayValue('intervention_site', 'land_tenure', raw, 'pt') || raw;
}

/**
 * ⚠️ EVERY field, not the two that leaked first.
 *
 * The first fix here translated `worry` and `tenure`, because those were the
 * two ids the first live run printed. The very next run wrote
 * "muro-de-arrimo-verde, grade-viva, solo-grampeado-verde" and "financiamento
 * classificado como 'small'" — the same defect in the fields nobody had looked
 * at yet. Whatever is handed to the model in an id is what comes back in the
 * narrative, so nothing is handed to it in an id.
 */
function solutionWords(id: string): string {
  return getSolution(id)?.pt.label ?? id;
}

function familiaWords(id: string): string {
  return NBS_FAMILIAS.find(f => (f.id as string) === id)?.pt.label ?? id;
}

function fundingScaleWords(raw: string): string {
  return cboDisplayValue('org_profile', 'prior_project_scale', raw, 'pt')
    || cboDisplayValue('org_profile', 'funding_history', raw, 'pt')
    || raw;
}

export function shapeNarrative(
  raw: z.input<typeof NarrativeSchema>,
  knownOrgNames: string[],
): SynergyNarrative | null {
  const known = new Set(knownOrgNames);
  const lines = raw.lines
    .map(l => ({ ...l, orgNames: l.orgNames.filter(n => known.has(n)) }))
    .filter(l => l.orgNames.length >= 2)
    .slice(0, MAX_LINES);
  const dropped = raw.lines.length - lines.length;
  if (dropped > 0) {
    console.warn(`[synergy] dropped ${dropped} of ${raw.lines.length} line(s): fewer than two known organisations`);
  }
  if (!lines.length && !raw.portfolioThreadPt.trim()) return null;
  return {
    ...raw,
    lines,
    questionsForTheRoomPt: raw.questionsForTheRoomPt.slice(0, MAX_QUESTIONS),
    // Bounded like everything else here: a list of caveats nobody reads is a
    // list of caveats nobody acts on.
    tensionsPt: (raw.tensionsPt ?? []).slice(0, MAX_TENSIONS),
    sequencingPt: (raw.sequencingPt ?? []).slice(0, MAX_SEQUENCING),
  };
}

// ⚠️ The cap is NOT here any more. It lives with the measurement that justifies
// it, in shared/model-pass-budgets.ts, because this file shipped with 45 s
// against a ~49 s call and the pass had therefore never once run — the third
// time in this repo a cap set for a smaller prompt silently disabled the pass
// behind it. `withBudget` also makes losing the race loud, which is the half
// that was actually missing.

export async function buildSynergyReport(members: SynergyMember[]): Promise<SynergyReport> {
  const analysis = analyseSynergies(members);
  const generatedAt = new Date().toISOString();

  // A report with two organisations answered is not a portfolio reading, and
  // dressing one up as such is how a coordination team ends up planning a
  // meeting around a pattern that is really a coincidence.
  if (analysis.members.length < 3) {
    return {
      analysis,
      narrative: null,
      narrativeReason: 'menos de três organizações com dados — as sinergias ainda não têm o que ler',
      generatedAt,
    };
  }
  if (!structuredProvider()) {
    return { analysis, narrative: null, narrativeReason: 'a leitura automática não está configurada neste ambiente', generatedAt };
  }

  try {
    const raw = await withBudget(
      'synergyReport',
      createStructured(
        {
          input: [
            { role: 'system', content: SYSTEM },
            { role: 'user', content: analysisForModel(analysis) },
          ],
          config: { ...(process.env.CBO_ADVISOR_MODEL ? { model: process.env.CBO_ADVISOR_MODEL } : {}), reasoningEffort: 'medium', maxCompletionTokens: 6000 },
        },
        NarrativeSchema,
        'synergy_narrative',
      ),
    );
    if (!raw) return { analysis, narrative: null, narrativeReason: 'a leitura automática demorou demais e foi interrompida', generatedAt };

    // ⚠️ And a guard behind the fix. An id can reach the prompt by a route nobody
  // is looking at — a new field, a new caller — and the failure is silent: the
  // narrative reads correctly to anyone who does not know that `formal-agreement`
  // is a database value.
  const leaked = MACHINE_IDS.exec(JSON.stringify(raw));
  if (leaked) {
    console.error(`[synergy] machine id in the narrative: "${leaked[0]}" — a raw value reached the prompt`);
  }
  const shaped = shapeNarrative(raw, analysis.members.map(m => m.orgName));
    if (!shaped) {
      return {
        analysis,
        narrative: null,
        narrativeReason: 'a leitura automática não encontrou nenhuma linha que ligue duas organizações desta rede',
        generatedAt,
      };
    }
    return { analysis, narrative: shaped, generatedAt };
  } catch (err: any) {
    // ⚠️ The reason is rendered on a page a coordinator opens, so it says what
    // they can do — never the provider's message. A 401 came through verbatim
    // in testing, complete with the key it rejected and a link to an OpenAI
    // settings page, which is both alarming and useless to the person reading.
    console.error('[synergy] narrative failed; the calculated report still stands:', err?.message || err);
    return { analysis, narrative: null, narrativeReason: coordinatorReason(err), generatedAt };
  }
}

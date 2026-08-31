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
import { createStructuredResponse } from './openaiClient';
import { analyseSynergies, type SynergyAnalysis, type SynergyMember } from '@shared/w3-synergies';

const LineSchema = z.object({
  /** e.g. "Eixo 4º Distrito" — a handle people can say out loud in the room. */
  namePt: z.string(),
  /** Org names, exactly as given in the input. Anything else is dropped. */
  orgNames: z.array(z.string()).min(2),
  /** Two or three sentences: what holds them together, in pt-BR. */
  rationalePt: z.string(),
  /** Why it matters to a funder or to the city. One sentence. */
  whyItMattersPt: z.string(),
});

const NarrativeSchema = z.object({
  /** The shared thread the coordination could propose for the whole portfolio. */
  portfolioThreadPt: z.string(),
  lines: z.array(LineSchema).max(4),
  /** Questions worth putting to the room, from what the data leaves open. */
  questionsForTheRoomPt: z.array(z.string()).max(5),
});

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

Sua tarefa é escrever a leitura transversal: propor até 4 LINHAS DE PROGRAMA e o fio condutor do portfólio.

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
      `${m.worry ? ` · preocupa: ${m.worry}` : ''}` +
      `${m.familias.length ? ` · famílias: ${m.familias.join(', ')}` : ''}` +
      `${m.solutions.length ? ` · solução escolhida: ${m.solutions.join(', ')}` : ''}` +
      `${m.roles.length ? ` · papéis: ${m.roles.join(', ')}` : ''}` +
      `${m.tenure ? ` · terreno: ${m.tenure}` : ''}` +
      `${m.nbsExperience ? ` · experiência SbN: ${m.nbsExperience}` : ''}` +
      `${m.fundingScale ? ` · financiamento: ${m.fundingScale}${m.biggestBudget ? ` (maior: ${m.biggestBudget})` : ''}` : ''}` +
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
    if (m.docs.length) L.push(`    arquivos enviados: ${m.docs.map(d => d.filename).join(', ')}`);
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
  if (!process.env.OPENAI_API_KEY && !process.env.AI_INTEGRATIONS_OPENAI_API_KEY) {
    return { analysis, narrative: null, narrativeReason: 'a leitura automática não está configurada neste ambiente', generatedAt };
  }

  try {
    const raw = await Promise.race([
      createStructuredResponse(
        {
          input: [
            { role: 'system', content: SYSTEM },
            { role: 'user', content: analysisForModel(analysis) },
          ],
          config: { model: process.env.CBO_ADVISOR_MODEL || 'gpt-5.2', reasoningEffort: 'medium', maxCompletionTokens: 6000 },
        },
        NarrativeSchema,
        'synergy_narrative',
      ),
      new Promise<null>(resolve => setTimeout(() => resolve(null), 45_000)),
    ]);
    if (!raw) return { analysis, narrative: null, narrativeReason: 'a leitura automática demorou demais e foi interrompida', generatedAt };

    // Only organisations that exist, and only lines that still have two after
    // the filter. A programme line naming an org that is not in this cohort is
    // the one error a coordinator would not catch by reading.
    const known = new Set(analysis.members.map(m => m.orgName));
    const lines = raw.lines
      .map(l => ({ ...l, orgNames: l.orgNames.filter(n => known.has(n)) }))
      .filter(l => l.orgNames.length >= 2);

    return { analysis, narrative: { ...raw, lines }, generatedAt };
  } catch (err: any) {
    // ⚠️ The reason is rendered on a page a coordinator opens, so it says what
    // they can do — never the provider's message. A 401 came through verbatim
    // in testing, complete with the key it rejected and a link to an OpenAI
    // settings page, which is both alarming and useless to the person reading.
    console.error('[synergy] narrative failed; the calculated report still stands:', err?.message || err);
    return { analysis, narrative: null, narrativeReason: coordinatorReason(err), generatedAt };
  }
}

// ============================================================================
// THE PROJECT PLAN — what the project's own encontro builds (docs/projects.md)
// ============================================================================
// Encontro 3 tested solutions per organisation. The project encontro takes
// those tests and builds ONE thing out of several: a frame ("por que juntas"),
// the scenarios each organisation brings in, what the group shares (a study
// contracted once instead of three times, one conversation with a body
// instead of five), a money line at project level, and a document.
//
// Pure functions. The checkpoint asks and writes; this file derives. Every
// figure comes from the same fichas and the same budget lines the
// organisations' own cards were built from, so a number on the project note
// can never disagree with a number on an organisation's comparison.
//
// Register: the plan card is read in the room, the note is written (third
// person, sources on every section, no design rationale on the page).
// ============================================================================

import type { ProjectBrief, ProjectMemberFacts } from './project-brief';
import { seedTestsFromChosen } from './w3-tests';
import { buildComparison, verdictText } from './w3-comparison';
import { budgetLineFor, type BuildModel } from './w3-sizing';
import { aggregationArgument } from './funding-sources';

type Lang = 'pt' | 'en';

// ── The fields the encontro writes on the project's own state ──────────────
// Private names: these live on the PROJECT state, which is not an
// organisation's record, and the project note (below) is the document that
// carries every one of them. See docs/projects.md → "The project encontro".
export const PROJECT_FIELDS = {
  why: '_project_why_together',
  frame: '_project_frame',
  scenarios: '_project_scenarios_json',
  lead: '_project_lead',
  funding: '_project_funding_mode',
} as const;

export type FundingMode = 'edital-unico' | 'cada-uma' | 'indefinido';

export interface ProjectChoices {
  whyTogether: string | null;
  frame: string | null;
  /** Per organisation: the scenarios that enter. An entry with no ids means "nenhuma desta vez". */
  scenarios: Array<{ memberId: string; solutionIds: string[] }>;
  lead: string | null;
  fundingMode: FundingMode | null;
}

export function parseChoices(fields: Record<string, string>): ProjectChoices {
  let scenarios: ProjectChoices['scenarios'] = [];
  try {
    const raw = JSON.parse(fields[PROJECT_FIELDS.scenarios] || '[]');
    if (Array.isArray(raw)) {
      scenarios = raw
        .filter((e: any) => e && typeof e.memberId === 'string' && Array.isArray(e.solutionIds))
        .map((e: any) => ({ memberId: e.memberId, solutionIds: e.solutionIds.map(String) }));
    }
  } catch { /* an unreadable answer is no answer */ }
  const fm = fields[PROJECT_FIELDS.funding];
  return {
    whyTogether: (fields[PROJECT_FIELDS.why] || '').trim() || null,
    frame: (fields[PROJECT_FIELDS.frame] || '').trim() || null,
    scenarios,
    lead: (fields[PROJECT_FIELDS.lead] || '').trim() || null,
    fundingMode: fm === 'edital-unico' || fm === 'cada-uma' || fm === 'indefinido' ? fm : null,
  };
}

// ── Frames — derived from what the brief found in common ───────────────────
export interface FrameOption {
  key: string;
  label: string;
  /** Which organisations the reading covers. */
  orgNames: string[];
}

/**
 * The frames a project can be built on, derived from the shared reading.
 * One per grouping axis the brief found, worded as the room says it. The
 * checkpoint adds "outra coisa" itself; this never invents a frame the
 * records do not support.
 */
export function frameOptions(brief: ProjectBrief, lang: Lang = 'pt'): FrameOption[] {
  const pt = lang === 'pt';
  const seen = new Set<string>();
  const out: FrameOption[] = [];
  for (const g of brief.shared.groups) {
    const key = `${g.axis}|${g.key}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      key,
      label: pt ? `${cap(g.axis)}: ${g.key}` : `${cap(g.axis)}: ${g.key}`,
      orgNames: g.orgNames,
    });
  }
  if (brief.shared.pooledStudies.length) {
    const p = brief.shared.pooledStudies[0];
    out.push({
      key: `study|${p.need}`,
      label: pt ? `O mesmo estudo: ${p.need}` : `The same study: ${p.need}`,
      orgNames: p.orgNames,
    });
  }
  return out.slice(0, 3);
}

const cap = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s);

// ── The plan ───────────────────────────────────────────────────────────────
export interface PlanScenario {
  solutionId: string;
  label: string;
  familia: string;
  needs: string[];
  verdict: string;
  verdictState: string;
  unblockedBy: string;
  costNote: string | null;
  lowBrl: number | null;
  highBrl: number | null;
  upkeep: string;
  /** The organisation's own reaction in Encontro 3, in report words. */
  reaction: string | null;
}

export interface PlanOrg {
  memberId: string;
  orgName: string;
  bairro: string | null;
  siteName: string | null;
  worry: string | null;
  /** What the organisation tested — the shelf the scenario question is asked over. */
  tested: Array<{ solutionId: string; label: string; liked: boolean }>;
  /** What enters the project. */
  scenarios: PlanScenario[];
  /** Answered "nenhuma desta vez", or never reached Encontro 3. */
  noScenario: boolean;
  answered: boolean;
}

export interface ProjectPlan {
  projectId: string;
  title: string;
  choices: ProjectChoices;
  orgs: PlanOrg[];
  shared: ProjectBrief['shared'];
  /** What pooling saves, said once each. */
  pooled: string[];
  totals: { lowBrl: number | null; highBrl: number | null; priced: number; unpriced: string[] };
  aggregation: string;
  gaps: string[];
  frameLabel: string | null;
}

export function buildProjectPlan(
  brief: ProjectBrief,
  members: ProjectMemberFacts[],
  choices: ProjectChoices,
  lang: Lang = 'pt',
): ProjectPlan {
  const pt = lang === 'pt';
  const chosenFor = new Map(choices.scenarios.map(s => [s.memberId, s.solutionIds]));

  const orgs: PlanOrg[] = members.map(m => {
    const tests = seedTestsFromChosen(m.tests, m.input.solutions ?? []);
    const cmp = buildComparison(m.input, tests, lang, m.technicalNote);
    const liked = new Set(m.input.solutions ?? []);
    const block = brief.blocks.find(b => b.memberId === m.memberId);
    const picked = chosenFor.get(m.memberId);
    const build = ((m.input.w3 as any)?.construction_model || undefined) as BuildModel | undefined;
    const scenarios: PlanScenario[] = cmp.columns
      .filter(c => picked?.includes(c.solutionId))
      .map(c => {
        const t = tests.find(x => x.solutionId === c.solutionId);
        const line = budgetLineFor(c.solutionId, m.input.areaM2, t?.units || undefined, build);
        return {
          solutionId: c.solutionId,
          label: c.label,
          familia: c.familia,
          needs: c.card.needs,
          verdict: verdictText(c.card.verdict.state, lang),
          verdictState: c.card.verdict.state,
          unblockedBy: c.card.verdict.unblockedBy,
          costNote: c.card.cost?.note ?? null,
          lowBrl: line?.lowBrl ?? null,
          highBrl: line?.highBrl ?? null,
          upkeep: c.card.upkeep,
          reaction: c.reaction?.text ?? null,
        };
      });
    return {
      memberId: m.memberId,
      orgName: m.orgName,
      bairro: m.bairro,
      siteName: block?.siteName ?? null,
      worry: block?.worry ?? null,
      tested: cmp.columns.map(c => ({ solutionId: c.solutionId, label: c.label, liked: liked.has(c.solutionId) })),
      scenarios,
      noScenario: picked ? picked.length === 0 : tests.length === 0,
      answered: picked !== undefined,
    };
  });

  // Money at project level: the sum of the bands that exist, and the names of
  // what has no figure — never a total that silently leaves a scenario out.
  let low = 0, high = 0, priced = 0;
  const unpriced: string[] = [];
  for (const o of orgs) for (const s of o.scenarios) {
    if (s.lowBrl != null && s.highBrl != null) { low += s.lowBrl; high += s.highBrl; priced++; }
    else unpriced.push(`${s.label} (${o.orgName})`);
  }
  const totals = { lowBrl: priced ? low : null, highBrl: priced ? high : null, priced, unpriced };

  // What the PROJECT's own scenarios share — the studies and the bodies the
  // entered scenarios name, grouped across organisations. The brief's cohort
  // reading is added after, minus what this already said.
  const pooled: string[] = [];
  const byNeed = new Map<string, Set<string>>();
  const byBody = new Map<string, Set<string>>();
  for (const o of orgs) for (const s of o.scenarios) {
    const key = s.unblockedBy.trim();
    if (!key) continue;
    const bucket = s.verdictState === 'needs_study' ? byNeed : s.verdictState === 'needs_permission' ? byBody : null;
    if (!bucket) continue;
    if (!bucket.has(key)) bucket.set(key, new Set());
    bucket.get(key)!.add(o.orgName);
  }
  const said = new Set<string>();
  for (const [need, who] of Array.from(byNeed.entries())) if (who.size > 1) {
    said.add(need);
    const names = Array.from(who);
    pooled.push(pt
      ? `${need}: um contrato para ${names.length} organizações (${names.join(', ')}) em vez de ${names.length}.`
      : `${need}: one contract for ${names.length} organisations (${names.join(', ')}) instead of ${names.length}.`);
  }
  for (const [body, who] of Array.from(byBody.entries())) if (who.size > 1) {
    said.add(body);
    const names = Array.from(who);
    pooled.push(pt
      ? `${body}: uma conversa em nome de ${names.join(', ')}.`
      : `${body}: one conversation on behalf of ${names.join(', ')}.`);
  }
  for (const p of brief.shared.pooledStudies) {
    if (said.has(p.need)) continue;
    if (p.orgNames.length > 1) pooled.push(pt
      ? `${p.need}: um contrato para ${p.orgNames.length} organizações (${p.orgNames.join(', ')}) em vez de ${p.orgNames.length}.`
      : `${p.need}: one contract for ${p.orgNames.length} organisations (${p.orgNames.join(', ')}) instead of ${p.orgNames.length}.`);
  }
  for (const p of brief.shared.pooledBodies) {
    if (said.has(p.body)) continue;
    if (p.orgNames.length > 1) pooled.push(pt
      ? `${p.body}: uma conversa em nome de ${p.orgNames.join(', ')}.`
      : `${p.body}: one conversation on behalf of ${p.orgNames.join(', ')}.`);
  }
  for (const p of brief.shared.pooledInstruments) {
    if (p.orgNames.length > 1) pooled.push(pt
      ? `${p.instrument}: o mesmo instrumento para ${p.orgNames.join(', ')} — um pedido, não ${p.orgNames.length}.`
      : `${p.instrument}: the same instrument for ${p.orgNames.join(', ')} — one request, not ${p.orgNames.length}.`);
  }

  const gaps: string[] = [];
  // "Sem cenário" only for an organisation that HAD tests to choose from; the
  // untested one gets its own line below, not two.
  const idle = orgs.filter(o => o.answered && o.noScenario && o.tested.length);
  if (idle.length) gaps.push(pt
    ? `${idle.map(o => o.orgName).join(', ')}: sem cenário neste projeto por enquanto.`
    : `${idle.map(o => o.orgName).join(', ')}: no scenario in this project for now.`);
  const untested = orgs.filter(o => !o.tested.length);
  if (untested.length) gaps.push(pt
    ? `${untested.map(o => o.orgName).join(', ')}: ainda não testou soluções no Encontro 3 — entra no projeto sem cenário próprio.`
    : `${untested.map(o => o.orgName).join(', ')}: has not tested solutions in Encontro 3 — joins without a scenario of its own.`);
  if (unpriced.length) gaps.push(pt
    ? `Sem faixa de custo: ${unpriced.join('; ')}.`
    : `No cost band: ${unpriced.join('; ')}.`);
  const needsStudy = orgs.flatMap(o => o.scenarios.filter(s => s.verdictState === 'needs_study').map(s => `${s.label} (${o.orgName})`));
  if (needsStudy.length) gaps.push(pt
    ? `Precisa de estudo antes do desenho: ${needsStudy.join('; ')}.`
    : `Needs a study before design: ${needsStudy.join('; ')}.`);
  for (const g of brief.shared.gaps) gaps.push(g);

  const frameLabel = choices.frame
    ? (frameOptions(brief, lang).find(f => f.key === choices.frame)?.label ?? choices.frame)
    : null;

  return {
    projectId: brief.projectId,
    title: brief.title,
    choices,
    orgs,
    shared: brief.shared,
    pooled,
    totals,
    aggregation: aggregationArgument(lang, totals),
    gaps,
    frameLabel,
  };
}

// ── The note ───────────────────────────────────────────────────────────────
export interface NoteParagraph { text: string; sources: string[]; kind: 'written' | 'quote' | 'bullet' }
export interface NoteSection { id: string; title: string; paragraphs: NoteParagraph[] }
export interface ProjectNote {
  docLabel: string;
  docAudience: string;
  title: string;
  subtitle: string;
  sections: NoteSection[];
  generatedAt: string;
}

const money = (n: number, pt: boolean) => `R$ ${Math.round(n).toLocaleString(pt ? 'pt-BR' : 'en-US', { maximumFractionDigits: 0 })}`;

export function buildProjectNote(plan: ProjectPlan, lang: Lang = 'pt'): ProjectNote {
  const pt = lang === 'pt';
  const S: NoteSection[] = [];
  const P = (text: string, sources: string[], kind: NoteParagraph['kind'] = 'written'): NoteParagraph => ({ text, sources, kind });
  const rec = pt ? 'registro de cada organização nos Encontros 1–3' : "each organisation's record from Encontros 1–3";
  const room = pt ? 'o encontro do projeto' : 'the project encontro';
  const ficha = pt ? 'fichas técnicas' : 'technical fichas';
  const cross = pt ? 'leitura cruzada dos registros' : 'cross-reading of the records';
  const names = plan.orgs.map(o => o.orgName);
  const withScen = plan.orgs.filter(o => o.scenarios.length);

  // As organizações
  S.push({
    id: 'organizacoes', title: pt ? 'As organizações' : 'The organisations',
    paragraphs: [
      P(pt
        ? `O projeto reúne ${names.length === 1 ? 'uma organização' : `${names.length} organizações`}: ${names.join(', ')}.`
        : `The project brings together ${names.length === 1 ? 'one organisation' : `${names.length} organisations`}: ${names.join(', ')}.`, [rec]),
      ...plan.orgs.map(o => P(
        `**${o.orgName}**${o.bairro ? ` (${o.bairro})` : ''}${o.siteName ? ` — ${pt ? 'lugar' : 'place'}: ${o.siteName}` : ''}${o.worry ? ` — ${pt ? 'o que preocupa' : 'what worries them'}: ${o.worry}` : ''}.`,
        [rec], 'bullet')),
    ],
  });

  // O problema em comum / por que juntas
  const frame: NoteParagraph[] = [];
  if (plan.frameLabel) frame.push(P(pt ? `O que junta as organizações: ${plan.frameLabel}.` : `What brings the organisations together: ${plan.frameLabel}.`, [cross, room]));
  if (plan.choices.whyTogether) frame.push(P(`“${plan.choices.whyTogether}”`, [pt ? 'as organizações, no encontro do projeto' : 'the organisations, in the project encontro'], 'quote'));
  for (const g of plan.shared.groups) {
    // A reason that only restates the grouping's own label is not a reason.
    const own = `${g.axis}: ${g.key}`.toLowerCase();
    const because = g.because.filter(b => b.replace(/\.$/, '').toLowerCase() !== own);
    frame.push(P(`${cap(g.axis)} — ${g.key}: ${g.orgNames.join(', ')}.${because.length ? ` ${because.join(' ')}` : ''}`, [cross], 'bullet'));
  }
  if (!frame.length) frame.push(P(pt ? 'O encontro do projeto ainda não registrou por que as organizações trabalham juntas.' : 'The project encontro has not yet recorded why the organisations work together.', [room]));
  S.push({ id: 'porque', title: pt ? 'Por que juntas' : 'Why together', paragraphs: frame });

  // A intervenção
  const interv: NoteParagraph[] = [];
  if (!withScen.length) interv.push(P(pt ? 'Nenhum cenário entrou no projeto ainda.' : 'No scenario has entered the project yet.', [room]));
  for (const o of withScen) for (const s of o.scenarios) {
    interv.push(P(
      `**${o.orgName} — ${s.label}** (${s.familia})${o.siteName ? `, ${pt ? 'em' : 'at'} ${o.siteName}` : ''}. ${s.verdict}: ${s.unblockedBy.replace(/\.$/, '')}.${s.reaction ? ` ${pt ? 'No Encontro 3:' : 'In Encontro 3:'} ${s.reaction.toLowerCase()}.` : ''}`,
      [rec, ficha], 'bullet'));
  }
  S.push({ id: 'intervencao', title: pt ? 'A intervenção — os cenários do projeto' : 'The intervention — the project scenarios', paragraphs: interv });

  // O que exige
  const exige: NoteParagraph[] = [];
  const needSet = new Map<string, Set<string>>();
  for (const o of withScen) for (const s of o.scenarios) for (const n of s.needs) {
    if (!needSet.has(n)) needSet.set(n, new Set());
    needSet.get(n)!.add(o.orgName);
  }
  for (const [n, who] of Array.from(needSet.entries())) exige.push(P(`${n.replace(/\.$/, '')} — ${Array.from(who).join(', ')}.`, [ficha], 'bullet'));
  for (const line of plan.pooled) exige.push(P(line, [cross], 'bullet'));
  if (!exige.length) exige.push(P(pt ? 'Sem exigências registradas ainda — os cenários definem o que o projeto pede.' : 'No requirements recorded yet — the scenarios define what the project asks for.', [room]));
  S.push({ id: 'exige', title: pt ? 'O que o projeto exige — e o que se compartilha' : 'What the project requires — and what is shared', paragraphs: exige });

  // Custo
  const custo: NoteParagraph[] = [];
  if (plan.totals.lowBrl != null && plan.totals.highBrl != null) {
    custo.push(P(pt
      ? `Somando as faixas dos ${plan.totals.priced} cenários com referência de custo: ${money(plan.totals.lowBrl, pt)} a ${money(plan.totals.highBrl, pt)}, à referência das fichas. É uma faixa para pedir cotação, não um orçamento fechado.`
      : `Adding the bands of the ${plan.totals.priced} scenarios with a cost reference: ${money(plan.totals.lowBrl, pt)} to ${money(plan.totals.highBrl, pt)}, at the fichas' reference. A band to request quotes against, not a closed budget.`, [ficha]));
  } else {
    custo.push(P(pt ? 'Nenhum cenário do projeto tem faixa de custo de referência ainda.' : 'No project scenario has a reference cost band yet.', [ficha]));
  }
  for (const o of withScen) for (const s of o.scenarios) if (s.costNote) custo.push(P(`${o.orgName} — ${s.label}: ${s.costNote}`, [ficha], 'bullet'));
  if (plan.totals.unpriced.length) custo.push(P(pt ? `Sem faixa: ${plan.totals.unpriced.join('; ')}.` : `No band: ${plan.totals.unpriced.join('; ')}.`, [ficha]));
  custo.push(P(plan.aggregation, [pt ? 'oficina de financiamento de 26/08' : 'funding workshop of 26 Aug']));
  if (plan.choices.fundingMode) {
    const fm = plan.choices.fundingMode;
    custo.push(P(pt
      ? fm === 'edital-unico' ? 'As organizações pretendem buscar o recurso como um projeto só.'
        : fm === 'cada-uma' ? 'Cada organização busca o próprio recurso, com o projeto em comum como argumento.'
        : 'O caminho do recurso ainda não foi definido.'
      : fm === 'edital-unico' ? 'The organisations intend to seek the funding as a single project.'
        : fm === 'cada-uma' ? 'Each organisation seeks its own funding, with the shared project as the argument.'
        : 'The funding route has not been decided yet.', [room]));
  }
  S.push({ id: 'custo', title: pt ? 'Custo estimado e caminho do recurso' : 'Estimated cost and funding route', paragraphs: custo });

  // Quem cuida
  const cuida: NoteParagraph[] = [];
  if (plan.choices.lead) cuida.push(P(pt ? `Quem puxa o projeto: ${plan.choices.lead}.` : `Who leads the project: ${plan.choices.lead}.`, [room]));
  for (const o of withScen) for (const s of o.scenarios) cuida.push(P(`${o.orgName} — ${s.label}: ${s.upkeep}`, [ficha], 'bullet'));
  if (!cuida.length) cuida.push(P(pt ? 'A responsabilidade por cada parte segue a organização que a trouxe; quem puxa o conjunto ainda não foi definido.' : 'Responsibility for each part follows the organisation that brought it; who leads the whole has not been decided.', [room]));
  S.push({ id: 'cuida', title: pt ? 'Quem cuida' : 'Who looks after it', paragraphs: cuida });

  // Pendências
  S.push({
    id: 'pendencias', title: pt ? 'Pendências' : 'Open items',
    paragraphs: plan.gaps.length ? plan.gaps.map(g => P(g, [cross, room], 'bullet')) : [P(pt ? 'Nenhuma pendência registrada.' : 'No open items recorded.', [room])],
  });

  return {
    docLabel: pt ? 'Resumo do Projeto — várias organizações' : 'Project Summary — several organisations',
    docAudience: pt
      ? 'Para as organizações do projeto e a coordenação — base para preparar uma proposta conjunta'
      : "For the project's organisations and the coordination — the basis for a joint proposal",
    title: plan.title,
    subtitle: names.join(' · '),
    sections: S,
    generatedAt: new Date().toISOString(),
  };
}

/** The plan as markdown, for the model's context after the encontro. */
export function planMarkdown(plan: ProjectPlan, lang: Lang = 'pt'): string {
  const pt = lang === 'pt';
  const L: string[] = [`## ${pt ? 'O projeto — o que o encontro definiu' : 'The project — what the encontro decided'}`];
  if (plan.frameLabel) L.push(`- ${pt ? 'o que junta' : 'the frame'}: ${plan.frameLabel}`);
  if (plan.choices.whyTogether) L.push(`- ${pt ? 'por que juntas (nas palavras delas)' : 'why together (their words)'}: "${plan.choices.whyTogether}"`);
  for (const o of plan.orgs) {
    if (o.scenarios.length) L.push(`- ${o.orgName}: ${o.scenarios.map(s => `${s.label} (${s.verdict.toLowerCase()}${s.costNote ? `; ${s.costNote}` : ''})`).join('; ')}`);
    else if (o.answered) L.push(`- ${o.orgName}: ${pt ? 'sem cenário desta vez' : 'no scenario this time'}`);
  }
  for (const p of plan.pooled) L.push(`- ${pt ? 'compartilhado' : 'shared'}: ${p}`);
  if (plan.totals.lowBrl != null) L.push(`- ${pt ? 'custo somado' : 'summed cost'}: ${money(plan.totals.lowBrl, pt)}–${money(plan.totals.highBrl!, pt)} (${plan.totals.priced} ${pt ? 'cenários com referência' : 'scenarios with a reference'})`);
  if (plan.choices.lead) L.push(`- ${pt ? 'quem puxa' : 'lead'}: ${plan.choices.lead}`);
  if (plan.choices.fundingMode) L.push(`- ${pt ? 'recurso' : 'funding'}: ${plan.choices.fundingMode}`);
  if (plan.gaps.length) L.push(`- ${pt ? 'pendências' : 'open'}: ${plan.gaps.join(' | ')}`);
  return L.join('\n');
}

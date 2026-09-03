// ============================================================================
// W3 ROADMAP — a draft hoja de ruta, not a verdict
// ============================================================================
// What an organisation walks out of Encontro 3 holding. Two pages: what the
// project is and what it should do, then what it costs, who has to say yes,
// who keeps it alive, and what is still open.
//
// ── The framing, which is the whole design ──────────────────────────────────
// This is a DRAFT ROUTE. Something to validate, to start walking, and to
// argue with — never a finding handed down. Three things follow from that,
// and every one of them is load-bearing:
//
//   1 · Every block says where it came from, so a line can be disagreed with
//       specifically rather than in general. "This is wrong" is not actionable;
//       "the ficha says a técnico and we already have one" is.
//   2 · Every block says what would CHANGE it. A route you cannot redirect is
//       a verdict wearing a friendlier word.
//   3 · Nothing is hidden to make it look finished. The open questions are a
//       numbered part of the document, not an appendix — they are the next
//       stretch of the road, which is the most useful thing on it.
//
// Nothing here asks a new question. Every line is assembled from answers
// already given, which is why the last beat of W3 is reading, not filling.
// ============================================================================

import { buildDossier, portfolioState, type Dossier, type VerdictState, type W3Input } from './w3-dossier';
import { budgetLineFor, SOLUTION_COSTS, type BudgetLine, type BuildModel } from './w3-sizing';
import { benefitFor, type BenefitLine } from './w3-benefits';
import { scaleStatement } from './w3-scale';
import { getSolution } from './nbs-catalog';
import { getSolutionFicha } from './nbs-solution-fichas';
import { cboFieldEnumOptions } from './cbo-field-catalog';
import { siteLabel } from './site-name';

export interface RoadmapBlock {
  /** Short heading, in the reader's language. */
  title: string;
  /** The content, already in sentences. */
  lines: string[];
  /** Where it came from — shown small, so a line can be argued with precisely. */
  from?: string;
  /** What would change this block. The affordance that makes it a draft. */
  changedBy?: string;
  /** True when this block is a gap rather than a finding. */
  open?: boolean;
}

export interface RoadmapStep {
  n: number;
  title: string;
  /** Who is proposed to carry it. The organisation can always override. */
  owner: 'org' | 'coordination';
  /** The named person on their side, when we know one. */
  ownerName?: string;
  detail?: string;
  blockedBy?: string;
}

export interface RoadmapObservation {
  kind: 'strength' | 'gap' | 'cohort';
  text: string;
  basedOn: string;
}

export interface Roadmap {
  /** "Rascunho" — never a finished plan, and the header says so. */
  orgName: string;
  siteName: string;
  bairro: string;
  solutions: string[];
  state: VerdictState;
  /** Page one: what this is and what it should do. */
  what: RoadmapBlock[];
  /** Page two: what it takes. */
  how: RoadmapBlock[];
  /** The road ahead — the four dossier lists, flattened and numbered. */
  steps: RoadmapStep[];
  /** Named openings. Kept separate so they read as route, not as failure. */
  open: string[];
  dossier: Dossier;
  budget: BudgetLine[];
  benefits: BenefitLine[];
  /**
   * What the advisor noticed. `strength` is for the organisation — something
   * their project has that they may not know counts. `gap` and `cohort` are
   * for the coordination and are NOT rendered on the org's page: a list of what
   * a funder will push back on belongs in the hands of whoever will do the
   * pushing back, not on the document someone reads to their assembly.
   */
  observations: RoadmapObservation[];
}

const S = {
  pt: {
    draft: 'Rascunho para validar',
    proponent: 'Organização proponente',
    context: 'O bairro',
    contribution: 'Contrapartida da organização',
    moneyIsNot: 'A faixa não representa recurso disponível. É a ordem de grandeza para pedir cotação e para inscrever o projeto num edital.',
    what: 'O que é',
    where: 'Onde',
    size: 'Tamanho',
    problem: 'O problema — descrito pela organização',
    why: 'Por que aqui',
    expect: 'Efeito esperado',
    baseline: 'Como está hoje',
    cost: 'Custo estimado',
    who: 'Quem constrói',
    yes: 'Quem precisa dizer sim',
    care: 'Quem cuida depois',
    money: 'Dinheiro que volta todo ano',
    when: 'Em quanto tempo',
    measure: 'Quem consegue medir',
    unknown: 'ainda não definido',
    openQ: 'em aberto',
  },
  en: {
    draft: 'Draft to validate',
    proponent: 'Proposing organisation',
    context: 'The neighbourhood',
    contribution: "The organisation's contribution",
    moneyIsNot: 'The range does not represent available funds. It is the order of magnitude for requesting a quote and for entering the project into a funding call.',
    what: 'What it is',
    where: 'Where',
    size: 'Size',
    problem: 'The problem — as described by the organisation',
    why: 'Why here',
    expect: 'Expected effect',
    baseline: 'How it is today',
    cost: 'Estimated cost',
    who: 'Who builds it',
    yes: 'Who has to say yes',
    care: 'Who looks after it',
    money: 'Money that comes back every year',
    when: 'Over what time',
    measure: 'Who can measure it',
    unknown: 'not decided yet',
    openQ: 'open',
  },
};

/**
 * ⚠️ The chip is SPOKEN, the document is WRITTEN.
 *
 * A few catalogue options are phrased as the organisation answering out loud —
 * "A gente mesmo", "Ainda não sabemos", "Our own resources" — which is exactly
 * right on a chip they tap in the middle of a conversation, and wrong on a
 * nota técnica that a funder or the prefeitura reads. The chip keeps its
 * wording; the document gets the written form of the same answer.
 *
 * Keyed on the option id, so a change to either wording cannot silently
 * mismatch the other.
 */
export const REPORT_LABEL: Record<string, { pt?: string; en?: string }> = {
  nos: { pt: 'A própria organização', en: 'The organisation itself' },
  indefinido: { pt: 'Ainda não definido', en: 'Not yet defined' },
  'recursos-proprios': { en: "The organisation's own resources" },
  // The tenure answers are written as replies to a spoken question — "Sim,
  // somos donas do terreno", "É da prefeitura, mas a gente usa". On a page that
  // states facts they have to be the fact.
  'private-owned': { pt: 'Próprio da organização', en: 'Owned by the organisation' },
  'formal-agreement': { pt: 'Uso formalizado por acordo escrito', en: 'Use formalised by written agreement' },
  'public-informal': { pt: 'Público, em uso pela organização sem documento', en: 'Public, used by the organisation without a document' },
  'public-no-access': { pt: 'Público, sem acesso garantido', en: 'Public, with no guaranteed access' },
  mixed: { pt: 'Situação ainda indefinida', en: 'Situation still undefined' },
};

/** The written form of a catalogue option, when the chip's wording is spoken. */
export const reportLabel = (id: string | undefined, lang: 'pt' | 'en'): string | undefined =>
  (id ? REPORT_LABEL[id]?.[lang] : undefined);

/** An enum's label in the reader's language, or null when it is unanswered. */
function label(sectionId: string, field: string, id: string | undefined, lang: 'pt' | 'en'): string | null {
  if (!id) return null;
  const written = REPORT_LABEL[id]?.[lang];
  if (written) return written;
  const hit = (cboFieldEnumOptions(sectionId, field) ?? []).find(o => o.id === id);
  return hit ? (lang === 'pt' ? hit.pt : hit.en) : id;
}

const has = (v: string | undefined) => !!v && v.trim() !== '';

/** Tenure where the organisation already has the land in hand, one way or another. */
const PUBLIC_OR_OWN = new Set(['private-owned', 'formal-agreement', 'public-informal', 'mixed', 'public_land']);

/** The noun the count is in, from the first counted solution on the list. */
function unitNoun(solutions: string[], units: number, lang: 'pt' | 'en'): string | null {
  for (const id of solutions) {
    const c = SOLUTION_COSTS[id];
    if (!c?.unitPt) continue;
    return lang === 'pt'
      ? (units === 1 ? c.unitPt : c.unitPluralPt) ?? null
      : (units === 1 ? c.unitEn : c.unitPluralEn) ?? null;
  }
  return null;
}

export function buildRoadmap(
  input: W3Input,
  lang: 'pt' | 'en' = 'pt',
  observations: RoadmapObservation[] = [],
): Roadmap {
  const t = S[lang];
  const pt = lang === 'pt';
  const site = input.site ?? {};
  const w3 = input.w3 ?? {};
  const solutions = input.solutions ?? [];
  const areaM2 = input.areaM2 ?? (Number(site.site_area_m2) || 0);

  const bairroName = (site.bairro ?? '').split(',')[0].trim();

  const dossier = buildDossier(input, lang);
  const state = portfolioState(dossier.verdicts);
  const units = Number(w3.intervention_units) || 0;
  const buildModel = (w3.construction_model || undefined) as BuildModel | undefined;
  const scale = scaleStatement(solutions, areaM2, site.site_worry);
  const budget = solutions.map(id => budgetLineFor(id, areaM2 || undefined, units || undefined, buildModel)).filter(Boolean) as BudgetLine[];
  const benefits = solutions.map(id => benefitFor(id, areaM2 || undefined, units || undefined)).filter(Boolean) as BenefitLine[];

  const what: RoadmapBlock[] = [];
  const how: RoadmapBlock[] = [];

  // ── Page one ──────────────────────────────────────────────────────────────
  const org = input.org ?? {};

  // Who is asking. Captured in its entirety at Encontro 1 and, until now, never
  // shown on the document the organisation actually takes anywhere — which is
  // the paragraph that decides whether a reviewer reads the rest.
  const founded = org.year_founded;
  const team = org.team_size;
  const bits: string[] = [];
  if (has(org.mission_summary)) bits.push(org.mission_summary!);
  const facts: string[] = [];
  if (has(founded)) facts.push(pt ? `atua desde ${founded}` : `active since ${founded}`);
  if (has(team)) facts.push(pt ? `${team} pessoas` : `${team} people`);
  if (org.has_cnpj === 'yes') facts.push(pt ? 'com CNPJ' : 'with a CNPJ');
  if (org.prior_project_scale === 'funded' || org.funding_history === 'yes') {
    facts.push(
      has(org.biggest_project_budget)
        ? (pt ? `já executou projeto financiado (maior: ${org.biggest_project_budget})` : `has delivered a funded project (largest: ${org.biggest_project_budget})`)
        : (pt ? 'já executou projeto financiado' : 'has delivered a funded project'),
    );
  }
  if (facts.length) bits.push(facts.join(' · '));
  if (bits.length) {
    what.push({
      title: t.proponent,
      lines: [
        `**${org.org_name ?? ''}**${has(org.contact_name) ? ` — ${org.contact_name}${has(org.contact_role) ? `, ${org.contact_role}` : ''}` : ''}`,
        ...bits,
      ].filter(l => l.trim() !== '**' && l.trim() !== ''),
      from: pt ? 'Encontro 1' : 'Encontro 1',
    });
  }

  const names = solutions.map(id => getSolution(id)?.[lang].label ?? id);
  what.push({
    title: t.what,
    lines: solutions.length
      ? solutions.map(id => {
          const sol = getSolution(id);
          return sol ? `${sol[lang].label} — ${sol[lang].whatItIs}` : id;
        })
      : [pt ? 'Nenhuma solução escolhida ainda.' : 'No solution chosen yet.'],
    from: pt ? 'escolha da organização no Encontro 3' : "the organisation's choice in Encontro 3",
    changedBy: pt
      ? 'nova escolha no catálogo — as 27 soluções seguem disponíveis'
      : 'a new choice from the catalogue — all 27 solutions remain available',
  });

  what.push({
    title: t.where,
    lines: [
      // ⚠️ Never the raw coordinate string — this is the header of the printed
      // page and the PDF's filename. See shared/site-name.ts.
      has(site.site_name)
        ? `${siteLabel(site.site_name, lang)}${bairroName ? `, ${bairroName}` : ''}`
        : bairroName
          ? `${bairroName} — ${pt ? 'sem um ponto marcado ainda' : 'no point marked yet'}`
          : pt ? 'ainda não definido' : 'not defined yet',
      // A solution counted per unit has no footprint to draw, and saying "falta
      // desenhar a área" to an organisation that answered "5 cisternas" reads
      // as a tool that lost the answer.
      ...(areaM2
        ? [pt ? `Área desenhada: aproximadamente ${areaM2} m².` : `Drawn area: roughly ${areaM2} m².`]
        : units
          ? [pt ? `Escala: ${units} ${unitNoun(solutions, units, 'pt') ?? 'unidade(s)'}.` : `Scale: ${units} ${unitNoun(solutions, units, 'en') ?? 'unit(s)'}.`]
          : [pt ? 'Falta desenhar a área.' : 'The area is still to be drawn.']),
    ],
    from: pt ? 'mapa do Encontro 2 e o contorno do Encontro 3' : 'the Encontro 2 map and the Encontro 3 outline',
    changedBy: pt
      ? 'novo contorno no mapa — altera a área e a faixa de custo'
      : 'a new outline on the map — changes the area and the cost range with it',
    open: !areaM2 && !units,
  });

  // The territory, in the municipality's own numbers. Population and priority
  // come off the map the organisation confirmed in Encontro 2 — public data
  // about a place, never a count of their members.
  const popN = Number(site.bairro_population);
  const povN = Number(site.bairro_poverty_pct);
  const ctxLines: string[] = [];
  if (Number.isFinite(popN) && popN > 0) {
    ctxLines.push(
      pt
        ? `${bairroName} tem cerca de ${popN.toLocaleString('pt-BR')} moradores.`
        : `${bairroName} has around ${popN.toLocaleString('en-US')} residents.`,
    );
  }
  if (Number.isFinite(povN) && povN > 0) {
    // Decimal comma. The figure arrives from toFixed(1) with a dot, and a
    // Portuguese document that writes "23.4%" reads as a translation.
    ctxLines.push(
      pt
        ? `${povN.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}% em situação de pobreza.`
        : `${povN.toFixed(1)}% living in poverty.`,
    );
  }
  const floodPct = Number(site._bairro_flood_pct);
  if (Number.isFinite(floodPct) && floodPct > 0) {
    ctxLines.push(
      pt
        ? `No risco de alagamento, o bairro está entre os ${100 - floodPct}% mais expostos de Porto Alegre.`
        : `On flood risk the neighbourhood is in the most-exposed ${100 - floodPct}% of Porto Alegre.`,
    );
  }
  if (ctxLines.length) {
    what.push({
      title: t.context,
      lines: [
        ...ctxLines,
        // A caveat about a figure belongs BESIDE the figure, not in the review
        // field: it is not something anyone can go and change.
        pt
          ? '⚠️ Média do bairro inteiro, não do lugar da intervenção. Situa o projeto num edital; não descreve o terreno.'
          : '⚠️ Whole-neighbourhood average, not the intervention site. It situates the project in a funding call; it does not describe the land.',
      ],
      from: pt
        ? 'dados oficiais do município, sobre o mapa confirmado no Encontro 2'
        : 'official municipal data, over the map confirmed in Encontro 2',
    });
  }

  const worry = site.site_worry;
  what.push({
    title: t.problem,
    // Quoted, because the heading says the organisation described it and a
    // report that attributes a sentence has to show where the sentence ends.
    lines: [
      has(site.site_story) ? `“${site.site_story!.trim()}”` : pt ? 'Ainda não registrado.' : 'Not recorded yet.',
      ...(has(w3.justification_why_here) ? [`${t.why}: “${w3.justification_why_here!.trim()}”`] : []),
    ],
    // ⚠️ No `changedBy` here, deliberately. The line that stood here said "essa
    // parte é de vocês… é ela que manda, não o nosso mapa" — our own rule about
    // whose account governs, narrated at the reader. Naming the source as the
    // organisation's own words states the same fact without the reassurance.
    // Both encontros when both sentences are there: the account of the place
    // comes from E2, the reason for choosing it from E3, and a source line that
    // names the wrong one is exactly the sloppiness this register is for.
    from: has(w3.justification_why_here)
      ? (pt ? 'palavras da organização, Encontros 2 e 3' : "the organisation's own words, Encontros 2 and 3")
      : (pt ? 'palavras da organização, no Encontro 2' : "the organisation's own words, in Encontro 2"),
    open: !has(site.site_story),
  });

  // The benefit block, which is the one thing W3 supplies rather than collects.
  const expectLines: string[] = [];
  for (const b of benefits) {
    const head = pt ? b.headlinePt : b.headlineEn;
    const claim = pt ? b.claimPt : b.claimEn;
    expectLines.push(head ? `${head} ${claim}` : claim);
    for (const e of (pt ? b.extrasPt : b.extrasEn)) expectLines.push(`· ${e}`);
    const nota = pt ? b.notaPt : b.notaEn;
    if (nota) expectLines.push(`⚠ ${nota}`);
  }
  // ⚠️ The denominator. A volume with no comparison reads as an answer to
  // whatever flood the reader has in mind, and for this cohort that is 2024 —
  // which none of these solutions touches. It is also where the programme's
  // case lives: alone a fraction of a percent, together a number.
  if (scale) expectLines.push('', ...(pt ? scale.linesPt : scale.linesEn));

  const reaction = w3.expected_impact_reaction;
  if (reaction === 'parece-pouco') {
    expectLines.push(
      pt
        ? '⚑ A organização considerou a faixa pouca. Registrado, e com razão: nenhuma dessas soluções resolve sozinha uma enchente do porte de 2024.'
        : '⚑ The organisation judged the range small. Recorded, and rightly: none of these solves a 2024-scale flood on its own.',
    );
  } else if (reaction === 'parece-muito') {
    expectLines.push(
      pt
        ? '⚑ A organização considerou a faixa alta. Fica marcada como número a conferir com um técnico antes de virar promessa.'
        : '⚑ The organisation judged the range high. Flagged as a figure to check with a technician before it becomes a promise.',
    );
  }
  what.push({
    title: t.expect,
    lines: expectLines.length ? expectLines : [pt ? 'Depende da solução escolhida.' : 'Depends on the chosen solution.'],
    from: pt
      ? 'faixas de projeto das fichas e da base de evidências — estimativa, não medição'
      : 'design ranges from the fichas and the evidence base — estimate, not measurement',
    changedBy: pt
      ? 'estudo técnico no local — substitui a faixa por um número medido'
      : 'a technical study on site — replaces the range with a measured figure',
  });

  if (has(w3.baseline_condition)) {
    what.push({
      title: t.baseline,
      lines: [`“${w3.baseline_condition!.trim()}”`],
      from: pt ? 'descrição da organização, antes de qualquer obra' : "the organisation's description, before any work",
      changedBy: pt
        ? 'registro fotográfico datado, antes da obra'
        : 'a dated photographic record, before the works',
    });
  }

  // ── Page two ──────────────────────────────────────────────────────────────
  how.push({
    title: t.cost,
    lines: [
      ...(budget.length
        ? budget.map(b => (pt ? b.notePt : b.noteEn))
        : [pt ? 'Sem solução escolhida, não há faixa de custo.' : 'With no solution chosen there is no cost range.']),
      // ⚠️ A neighbour who reads "R$ 350 mil" on a page about a horta and not
      // the caveat around it now believes the association is receiving three
      // hundred and fifty thousand reais. That specific misunderstanding has
      // ended projects. The disclaimer travels with the figure, in the same
      // weight of type, wherever the page goes.
      // ⚠️ What the works cost does not include. A concept note with a
      // construction figure and no study line is incomplete in the one place a
      // funder checks — and the study is what the coordination pools.
      ...(dossier.studies.length ? ['', ...dossier.studies] : []),
      ...(budget.some(b => b.lowBrl != null) ? [t.moneyIsNot] : []),
    ],
    from: pt ? 'preço publicado na ficha × área desenhada' : "the ficha's published price × the drawn area",
    changedBy: pt ? 'cotação de fornecedor' : 'a supplier quote',
    open: budget.some(b => b.lowBrl == null),
  });

  const construction = label('intervention_type', 'construction_model', w3.construction_model, lang);
  const timeframe = label('impact_monitoring', 'project_timeframe', w3.project_timeframe, lang);
  const monitoring = label('impact_monitoring', 'monitoring_capacity', w3.monitoring_capacity, lang);
  const maintains = label('operations_sustain', 'who_maintains', w3.who_maintains, lang);
  const frequency = label('operations_sustain', 'maintenance_frequency', w3.maintenance_frequency, lang);
  const money = label('operations_sustain', 'sustainability_model', w3.sustainability_model, lang);

  how.push({
    title: t.who,
    lines: [construction ?? t.unknown, ...(timeframe ? [`${t.when}: ${timeframe}`] : [])],
    from: pt ? 'resposta da organização' : "the organisation's answer",
    open: !construction,
  });

  // What they put in. Named, never priced — a figure attached to volunteer
  // labour is a figure somebody can subtract from what they are given, and the
  // point here is that a funder reads commitment rather than a discount.
  const contribution: string[] = [];
  // ⚠️ Only when the organisation itself supplies the labour. Listing "Empresa
  // contratada" under what the organisation BRINGS is simply false, and it is
  // false on the page a funder reads: a hired contractor is a cost, not a
  // counterpart contribution.
  if (construction && /mutirao|mista/.test(w3.construction_model ?? '')) contribution.push(construction);
  if (has(org.team_size)) contribution.push(pt ? `${org.team_size} pessoas na organização` : `${org.team_size} people in the organisation`);
  if (has(org.year_founded)) {
    const yrs = new Date().getFullYear() - Number(org.year_founded);
    if (Number.isFinite(yrs) && yrs > 0) {
      contribution.push(pt ? `${yrs} anos de presença no território` : `${yrs} years present in the território`);
    }
  }
  if (PUBLIC_OR_OWN.has(site.land_tenure ?? '')) {
    contribution.push(pt ? 'terreno já em uso pela organização' : 'land already in use by the organisation');
  }
  if (contribution.length) {
    how.push({
      title: t.contribution,
      lines: [
        ...contribution,
        pt
          ? 'Não incluída na faixa de custo acima.'
          : 'Not included in the cost range above.',
      ],
      from: pt ? 'Encontros 1 e 3' : 'Encontros 1 and 3',
    });
  }

  const approvals: string[] = [];
  for (const id of solutions) {
    const f = getSolutionFicha(id);
    if (f) approvals.push(pt ? f.pt.quemPrecisaDizerSim : f.en.quemPrecisaDizerSim);
  }
  how.push({
    title: t.yes,
    // Split into bullets. The ficha's paragraph is five lines of conditional
    // clauses about SMAMUS, DMAE, particular versus público — the most
    // important text on the page and the least readable, and in a room people
    // stop at the second comma.
    lines: approvals.length
      ? approvals.flatMap(a =>
          a.split(/(?<=\.)\s+/).map(sentence => sentence.trim()).filter(x => x.length > 3),
        )
      : [pt ? 'Depende da solução.' : 'Depends on the solution.'],
    from: pt ? 'ficha de cada solução' : "each solution's ficha",
  });

  how.push({
    title: t.care,
    lines: [
      maintains ?? t.unknown,
      ...(frequency ? [`${pt ? 'Frequência' : 'How often'}: ${frequency}`] : []),
      `${t.money}: ${money ?? t.unknown}`,
      ...(monitoring ? [`${t.measure}: ${monitoring}`] : []),
    ],
    from: pt ? 'respostas da organização' : "the organisation's answers",
    // ⚠️ Compared on the stored id, never on the rendered label. REPORT_LABEL
    // rewrites "Ainda não sabemos" into "Ainda não definido" for the document,
    // and a comparison against the spoken wording silently stopped flagging the
    // block the moment that map was added.
    open: !maintains || !money || w3.sustainability_model === 'indefinido',
  });

  // A strength the organisation may not know is one. Placed last on page one,
  // after the evidence rather than before it — a compliment that arrives before
  // the substance reads as flattery.
  const strengths = observations.filter(o => o.kind === 'strength');
  if (strengths.length) {
    what.push({
      title: pt ? 'Pontos fortes já identificados' : 'Strengths already identified',
      lines: strengths.map(o => o.text),
      // The provenance IS the caveat here: this is a reading, not a statement
      // the organisation made. Saying so once, as a source, beats an apology.
      from: pt
        ? 'leitura da coordenação sobre os três encontros — não é declaração da organização'
        : 'a reading by the coordination across the three encontros — not a statement by the organisation',
    });
  }

  // ── The road ahead ────────────────────────────────────────────────────────
  // The dossier's four lists, flattened into one numbered sequence — because a
  // route is walked in order, and four parallel columns are a filing system.
  const order = { investigate: 0, contact: 1, gather: 2, document: 3 } as const;
  // A person, not an institution. "Vocês" does not photograph a puddle, and a
  // route with no names is a route nobody walks — their contact was captured at
  // Encontro 1 and had never reached the page.
  const ownerName = has(org.contact_name)
    ? `${org.contact_name}${has(org.contact_role) ? ` (${org.contact_role})` : ''}`
    : null;
  const steps: RoadmapStep[] = [...dossier.items]
    .sort((a, b) => order[a.list] - order[b.list])
    .map((i, idx) => ({
      n: idx + 1,
      title: i.text,
      owner: i.owner,
      ...(i.owner === 'org' && ownerName ? { ownerName } : {}),
      detail: i.source,
      ...(i.blockedBy ? { blockedBy: i.blockedBy } : {}),
    }));

  return {
    orgName: input.org?.org_name ?? '',
    siteName: siteLabel(site.site_name, lang) ?? '',
    bairro: bairroName,
    solutions: names,
    state,
    what,
    how,
    steps,
    // Sentence case: these are bullets in a Pendências list, and half of them
    // begin with a lower-case fragment while the other half begin with a
    // solution name.
    open: dossier.gaps.map(g => (g ? g.charAt(0).toUpperCase() + g.slice(1) : g)),
    dossier,
    budget,
    benefits,
    observations,
  };
}

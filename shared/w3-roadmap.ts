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
import { budgetLineFor, type BudgetLine } from './w3-sizing';
import { benefitFor, type BenefitLine } from './w3-benefits';
import { getSolution } from './nbs-catalog';
import { getSolutionFicha } from './nbs-solution-fichas';
import { cboFieldEnumOptions } from './cbo-field-catalog';

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
    proponent: 'Quem está propondo',
    context: 'O bairro',
    contribution: 'O que a organização entra',
    moneyIsNot: 'Essa faixa não é dinheiro que alguém já tem. É a ordem de grandeza pra pedir cotação e pra escrever num edital.',
    what: 'O que é',
    where: 'Onde',
    size: 'Tamanho',
    problem: 'O problema, nas palavras de vocês',
    why: 'Por que aqui',
    expect: 'O que a gente espera que aconteça',
    baseline: 'Como está hoje',
    cost: 'Quanto custa',
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
    proponent: 'Who is proposing this',
    context: 'The neighbourhood',
    contribution: 'What the organisation brings',
    moneyIsNot: 'This range is not money anyone already has. It is the order of magnitude for requesting a quote and for writing into a funding call.',
    what: 'What it is',
    where: 'Where',
    size: 'Size',
    problem: 'The problem, in your words',
    why: 'Why here',
    expect: 'What we expect it to do',
    baseline: 'How it is today',
    cost: 'What it costs',
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

/** An enum's label in the reader's language, or null when it is unanswered. */
function label(sectionId: string, field: string, id: string | undefined, lang: 'pt' | 'en'): string | null {
  if (!id) return null;
  const hit = (cboFieldEnumOptions(sectionId, field) ?? []).find(o => o.id === id);
  return hit ? (lang === 'pt' ? hit.pt : hit.en) : id;
}

const has = (v: string | undefined) => !!v && v.trim() !== '';

/** Tenure where the organisation already has the land in hand, one way or another. */
const PUBLIC_OR_OWN = new Set(['private-owned', 'formal-agreement', 'public-informal', 'mixed', 'public_land']);

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
  const budget = solutions.map(id => budgetLineFor(id, areaM2 || undefined)).filter(Boolean) as BudgetLine[];
  const benefits = solutions.map(id => benefitFor(id, areaM2 || undefined)).filter(Boolean) as BenefitLine[];

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
      changedBy: pt
        ? 'Se algo aqui mudou desde o primeiro encontro, é só dizer — a gente atualiza.'
        : 'If anything here changed since the first encontro, just say so and we update it.',
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
    from: pt ? 'escolha de vocês no Encontro 3' : 'your choice in Encontro 3',
    changedBy: pt
      ? 'Dá pra trocar a qualquer momento — as 27 continuam abertas, e nada aqui fecha essa porta.'
      : 'Changeable at any point — all 27 stay open, and nothing here closes that door.',
  });

  what.push({
    title: t.where,
    lines: [
      has(site.site_name)
        ? `${site.site_name}${bairroName ? `, ${bairroName}` : ''}`
        : bairroName
          ? `${bairroName} — ${pt ? 'sem um ponto marcado ainda' : 'no point marked yet'}`
          : pt ? 'ainda não definido' : 'not defined yet',
      ...(areaM2
        ? [pt ? `Área desenhada: aproximadamente ${areaM2} m².` : `Drawn area: roughly ${areaM2} m².`]
        : [pt ? 'Falta desenhar a área.' : 'The area is still to be drawn.']),
    ],
    from: pt ? 'mapa do Encontro 2 e o contorno do Encontro 3' : 'the Encontro 2 map and the Encontro 3 outline',
    changedBy: pt
      ? 'O contorno é a dedo, arredondado de propósito. Redesenhar muda a área e a faixa de preço junto.'
      : 'The outline is finger-drawn and deliberately rounded. Redrawing changes the area and the price range with it.',
    open: !areaM2,
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
      lines: ctxLines,
      from: pt
        ? 'dados oficiais do município, no mapa que vocês confirmaram no Encontro 2'
        : 'official municipal data, on the map you confirmed in Encontro 2',
      changedBy: pt
        ? '⚠️ Isso é a média do bairro inteiro, não do lugar de vocês. Serve pra situar o projeto num edital — não pra descrever o terreno.'
        : '⚠️ This is the whole-neighbourhood average, not your place. It situates the project in a funding call; it does not describe the site.',
    });
  }

  const worry = site.site_worry;
  what.push({
    title: t.problem,
    lines: [
      has(site.site_story) ? site.site_story! : pt ? 'Ainda não registrado.' : 'Not recorded yet.',
      ...(has(w3.justification_why_here) ? [`${t.why}: ${w3.justification_why_here}`] : []),
    ],
    from: pt ? `o que vocês contaram${has(worry) ? '' : ''}` : 'what you told us',
    changedBy: pt
      ? 'Essa parte é de vocês. Se a descrição não está certa, é ela que manda — não o nosso mapa.'
      : 'This part is yours. If the description is not right, it is what counts — not our map.',
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
  const reaction = w3.expected_impact_reaction;
  if (reaction === 'parece-pouco') {
    expectLines.push(
      pt
        ? '⚑ Vocês disseram que parece pouco — isso ficou registrado, e com razão: nenhuma dessas soluções resolve uma enchente do porte de 2024 sozinha.'
        : '⚑ You said it sounds like little — recorded, and rightly: none of these solves a 2024-scale flood on its own.',
    );
  } else if (reaction === 'parece-muito') {
    expectLines.push(
      pt
        ? '⚑ Vocês acharam alto — fica marcado como número a conferir com um técnico antes de virar promessa.'
        : '⚑ You thought it high — flagged as a figure to check with a technician before it becomes a promise.',
    );
  }
  what.push({
    title: t.expect,
    lines: expectLines.length ? expectLines : [pt ? 'Depende da solução escolhida.' : 'Depends on the chosen solution.'],
    from: pt
      ? 'faixas de projeto das fichas e da base de evidências — estimativa, não medição'
      : 'design ranges from the fichas and the evidence base — estimate, not measurement',
    changedBy: pt
      ? 'Um estudo técnico troca essa faixa por um número do lugar de vocês. Até lá ela serve pra pedir, não pra prometer.'
      : 'A technical study replaces this range with a figure for your own site. Until then it is for asking with, not promising.',
  });

  if (has(w3.baseline_condition)) {
    what.push({
      title: t.baseline,
      lines: [w3.baseline_condition!],
      from: pt ? 'descrição de vocês, antes de qualquer obra' : 'your description, before any work',
      changedBy: pt
        ? 'Uma foto com data vale mais do que essa frase — é o que prova depois que alguma coisa mudou.'
        : 'A dated photo is worth more than this sentence — it is what later proves anything changed.',
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
      ...(budget.some(b => b.lowBrl != null) ? [t.moneyIsNot] : []),
    ],
    from: pt ? 'preço publicado na ficha × área desenhada' : "the ficha's published price × the drawn area",
    changedBy: pt
      ? 'Uma cotação real de fornecedor. Essa faixa existe pra vocês conseguirem pedir uma.'
      : 'A real supplier quote. This range exists so you can go and ask for one.',
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
    from: pt ? 'resposta de vocês' : 'your answer',
    open: !construction,
  });

  // What they put in. Named, never priced — a figure attached to volunteer
  // labour is a figure somebody can subtract from what they are given, and the
  // point here is that a funder reads commitment rather than a discount.
  const contribution: string[] = [];
  if (construction) contribution.push(construction);
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
      lines: contribution,
      from: pt ? 'Encontros 1 e 3' : 'Encontros 1 and 3',
      changedBy: pt
        ? 'Isso é contrapartida — vale dizer em qualquer edital, e não está no preço acima.'
        : 'This is counterpart contribution — worth stating in any funding call, and it is not in the price above.',
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
    changedBy: pt
      ? 'A coordenação pode abrir essas portas junto — várias organizações batem na mesma.'
      : 'The coordination can open these doors alongside you — several organisations knock on the same ones.',
  });

  how.push({
    title: t.care,
    lines: [
      maintains ?? t.unknown,
      ...(frequency ? [`${pt ? 'Frequência' : 'How often'}: ${frequency}`] : []),
      `${t.money}: ${money ?? t.unknown}`,
      ...(monitoring ? [`${t.measure}: ${monitoring}`] : []),
    ],
    from: pt ? 'respostas de vocês' : 'your answers',
    changedBy: pt
      ? 'Se o dinheiro do ano que vem ficou em aberto, isso não é falha — é a conversa que a coordenação leva pra prefeitura.'
      : 'If next year\'s money is open, that is not a failing — it is the conversation the coordination takes to the city.',
    open: !maintains || !money || money === (pt ? 'Ainda não sabemos' : 'Not decided yet'),
  });

  // A strength the organisation may not know is one. Placed last on page one,
  // after the evidence rather than before it — a compliment that arrives before
  // the substance reads as flattery.
  const strengths = observations.filter(o => o.kind === 'strength');
  if (strengths.length) {
    what.push({
      title: pt ? 'O que esse projeto já tem de forte' : 'What this project already has going for it',
      lines: strengths.map(o => o.text),
      from: pt
        ? 'leitura do que vocês contaram e mandaram, nos três encontros'
        : 'a read of what you told and sent us, across the three encontros',
      changedBy: pt
        ? 'Se alguma dessas frases não é verdade, ela sai — foi lida por nós, não dita por vocês.'
        : 'If any of these is not true it comes out — we read it, you did not say it.',
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
    siteName: site.site_name ?? '',
    bairro: bairroName,
    solutions: names,
    state,
    what,
    how,
    steps,
    open: dossier.gaps,
    dossier,
    budget,
    benefits,
    observations,
  };
}

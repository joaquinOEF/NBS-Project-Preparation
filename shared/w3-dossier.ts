// ============================================================================
// W3 DOSSIER — the four lists and the verdict, derived rather than authored
// ============================================================================
// Encontro 3 turns a chosen site into a scoped project. Everything it hands
// back is computed here, from answers the organisation already gave and from
// facts the repo already holds — the 55 solution fichas name who must approve
// each solution, what it needs before it can be designed, how it is maintained
// and how it fails.
//
// Nothing in this file calls a model. That is the point: a coordinator can
// audit "why is this project marked as needing a study" all the way back to a
// line in a ficha, and the same input always produces the same dossier. It also
// means the whole of W3's judgement is unit-testable against real W2 records,
// which is how the four scenarios in the 10 September review were produced.
//
// ── The verdict is a property of a SOLUTION ON A SITE ────────────────────────
// The 27 August meeting agreed a two-way split: known-feasible vs
// requires-expert-study. Running four real W2 records through it broke that in
// two places.
//
// Only one of the four was blocked by a technical unknown. One had never chosen
// a place; one was engineering-trivial and blocked entirely by the fact that
// nobody had ever written down that the organisation may use the land; and one
// was two projects wearing a single name — a community garden that could take
// money now, beside a stormwater intervention that cannot be sized without a
// study. A single verdict per organisation has to round that to one or the
// other, and both roundings are wrong.
//
// So: four states, computed per solution.
// ============================================================================

import { getSolutionFicha } from './nbs-solution-fichas';
import { SOLUTION_MECHANISMS } from './nbs-catalog';
import { budgetLineFor, type BudgetLine } from './w3-sizing';
import type { WorryId } from './site-knowledge';

// ── Capacity ────────────────────────────────────────────────────────────────

/**
 * How much project an organisation can carry out of W3.
 *
 * This is NOT a ranking of organisations, and it never gates what they are
 * offered — every solution stays reachable for everyone ("nada fica
 * descartado"). It decides two narrower things: who the dossier proposes as the
 * owner of each item, and what W3 can honestly claim to have produced.
 *
 * An `exploratory` organisation leaves with a site visit to arrange, not a
 * project with a hole in it. Saying so is more use to them, and to the
 * portfolio, than a thin dossier that looks like a scoped project.
 */
export type CapacityGrade = 'exploratory' | 'emerging' | 'established';

export interface CapacityRead {
  grade: CapacityGrade;
  /** Plain reasons, for the coordinator drawer and the org's own document. */
  because: string[];
  /** What W3 cannot produce for them, named rather than left blank. */
  cannotYet: string[];
}

export interface W3Input {
  /** intervention_site fields, machine ids as stored. */
  site: Record<string, string | undefined>;
  /** org_profile fields. */
  org?: Record<string, string | undefined>;
  /** Solutions chosen in W3 (catalog ids). Empty before stage 2. */
  solutions?: string[];
  /** Footprint drawn in stage 3, if any. */
  areaM2?: number;
  /** Stage 3–5 answers, once given. */
  w3?: Record<string, string | undefined>;
}

const has = (v: string | undefined | null): v is string =>
  typeof v === 'string' && v.trim() !== '' && v.trim().toLowerCase() !== 'null';

/** A site is only a site once we can put a footprint on it. */
export function hasSite(site: Record<string, string | undefined>): boolean {
  return has(site.site_lat ?? site._site_lat) && has(site.site_lng ?? site._site_lng);
}

export function gradeCapacity(input: W3Input): CapacityRead {
  const { site, org = {} } = input;
  const because: string[] = [];
  const cannotYet: string[] = [];

  const sited = hasSite(site);
  const depth = site.site_knowledge_depth ?? 'thin';
  const richDepth = depth === 'strong' || depth === 'rich';
  const hasStory = has(site.site_story);
  const tenureKnown = has(site.land_tenure);
  const funded = org.prior_project_scale === 'funded';
  const named = has(org.contact_name) || has(site.community_anchoring_lead);

  if (!sited) {
    because.push('no place marked yet');
    cannotYet.push('a footprint, so no area, no cost band and no approval route');
    return { grade: 'exploratory', because, cannotYet };
  }

  if (richDepth) because.push(`site described in their own words (${depth})`);
  if (hasStory) because.push('an account of the place, not just a pin');
  if (funded) because.push('has run a financed project before');
  if (named) because.push('a named person who carries it');

  if (!tenureKnown) cannotYet.push('the approval route — land tenure is unanswered');
  if (!hasStory) cannotYet.push('a mechanism read, so the baseline evidence stays generic');

  // Established needs both the site knowledge AND someone who has done this
  // before or is clearly accountable — one alone is not enough to hand over a
  // dossier and expect it worked through unaided.
  const grade: CapacityGrade = richDepth && (funded || named) ? 'established' : 'emerging';
  return { grade, because, cannotYet };
}

// ── Verdict ─────────────────────────────────────────────────────────────────

export type VerdictState = 'ready' | 'needs_study' | 'needs_permission' | 'needs_site';

export interface Verdict {
  solutionId: string | null;
  state: VerdictState;
  /** One sentence, for the org. */
  why: string;
  /** The single thing that would move it on. */
  unblockedBy: string;
  /** Where the judgement came from, so a coordinator can check it. */
  source: string;
}

/**
 * Phrases in a ficha's `quemPrecisaDizerSim` that mean "this cannot be designed
 * from community knowledge alone".
 *
 * Matched against the ficha prose rather than a separate flag because the
 * fichas already say it, in the words Robson reviewed — a parallel boolean
 * would be a second source of truth that drifts. The rain garden entry, for
 * example, states that the layer design and the soil infiltration test need a
 * técnico, "porque um jardim de chuva mal calculado não drena".
 */
const STUDY_MARKERS: { re: RegExp; pt: string; en: string }[] = [
  { re: /teste de infiltraç/i, pt: 'um teste de infiltração do solo', en: 'a soil infiltration test' },
  { re: /estudo geot[eé]cnic/i, pt: 'um estudo geotécnico', en: 'a geotechnical study' },
  { re: /estudo hidrol[oó]gic/i, pt: 'um estudo hidrológico', en: 'a hydrological study' },
  { re: /precisa de um t[eé]cnic|precisa de t[eé]cnic/i, pt: 'um técnico para o desenho', en: 'a technician for the design' },
  { re: /projeto de engenharia|laudo/i, pt: 'um laudo técnico', en: 'a technical report' },
];

// Catalog ids are in shared/cbo-field-catalog.ts · E2_TENURE. The extra
// spellings are legacy: sessions that predate the catalog stored `public_land`,
// and those rows are still in the database — including the test-kit records
// these rules are pinned against. Dropping them silently would make an
// organisation on public land look like one with no tenure answer at all.
/** Tenure where the right to build is not yet written down anywhere. */
const INFORMAL_TENURE = new Set(['public-informal', 'public-no-access', 'informal', 'none', 'no-access']);
/** Tenure where the approval is municipal rather than a landlord's. */
const PUBLIC_TENURE = new Set([
  'public-informal', 'public-no-access',
  'public_land', 'public-land', 'public', // legacy
]);

function studyMarkerIn(prose: string): { pt: string; en: string } | null {
  for (const m of STUDY_MARKERS) if (m.re.test(prose)) return { pt: m.pt, en: m.en };
  return null;
}

export function computeVerdict(
  solutionId: string | null,
  input: W3Input,
  lang: 'pt' | 'en' = 'pt',
): Verdict {
  const pt = lang === 'pt';
  const { site } = input;

  if (!hasSite(site)) {
    return {
      solutionId,
      state: 'needs_site',
      why: pt
        ? 'Ainda não dá para dimensionar nem orçar: falta marcar o lugar.'
        : 'Nothing can be sized or costed yet — no place has been marked.',
      unblockedBy: pt ? 'marcar um lugar, mesmo que aproximado' : 'marking a place, even roughly',
      source: 'intervention_site · no coordinates',
    };
  }

  const ficha = solutionId ? getSolutionFicha(solutionId) : undefined;
  const prose = ficha ? `${ficha.pt.quemPrecisaDizerSim} ${ficha.pt.comoFunciona}` : '';
  const marker = prose ? studyMarkerIn(prose) : null;

  // A technical unknown outranks a paperwork one: a permission for something
  // that cannot yet be designed would be asking for the wrong thing.
  if (marker) {
    return {
      solutionId,
      state: 'needs_study',
      why: pt
        ? `Dá para construir, mas o desenho não se resolve só com o que a comunidade sabe — precisa de ${marker.pt}.`
        : `It can be built, but the design cannot be settled from community knowledge alone — it needs ${marker.en}.`,
      unblockedBy: pt ? marker.pt : marker.en,
      source: `ficha ${solutionId} · quemPrecisaDizerSim`,
    };
  }

  const tenure = site.land_tenure ?? '';
  if (INFORMAL_TENURE.has(tenure)) {
    return {
      solutionId,
      state: 'needs_permission',
      why: pt
        ? 'Tecnicamente dá para fazer. O que falta é alguém registrar por escrito que vocês podem usar o terreno.'
        : 'Technically this can be done. What is missing is a written record that you may use the land.',
      unblockedBy: pt ? 'uma autorização por escrito' : 'a written permission',
      source: `intervention_site · land_tenure = ${tenure}`,
    };
  }

  return {
    solutionId,
    state: 'ready',
    why: pt
      ? 'Nada trava daqui: o desenho cabe no que vocês já sabem e o terreno está resolvido.'
      : 'Nothing blocks this: the design fits what you already know and the land is settled.',
    unblockedBy: pt ? 'nada — pode ser orçado' : 'nothing — it can be quoted',
    source: ficha ? `ficha ${solutionId}` : 'intervention_site',
  };
}

// ── The four lists ──────────────────────────────────────────────────────────

export type DossierList = 'investigate' | 'contact' | 'gather' | 'document';

export interface DossierItem {
  list: DossierList;
  text: string;
  /** Traceable origin — a ficha line, a stored field, a hazard rule. */
  source: string;
  /** Proposed owner. The organisation can always override it. */
  owner: 'org' | 'coordination';
  /** Set when this item cannot start until another is answered. */
  blockedBy?: string;
}

export interface Dossier {
  capacity: CapacityRead;
  verdicts: Verdict[];
  items: DossierItem[];
  /** One line per chosen solution, traceable to its ficha's published price. */
  budget: BudgetLine[];
  /** Items W3 could not generate, and the answer that would unlock each. */
  gaps: string[];
}

/** The physical question each mechanism asks, for the baseline evidence. */
const MECHANISM_EVIDENCE: Partial<Record<WorryId | string, { pt: string; en: string }>> = {
  alagamento: {
    pt: 'Fotografar onde a água junta e anotar quantos dias ela demora a ir embora',
    en: 'Photograph where the water pools and record how many days it takes to drain',
  },
  inundacao: {
    pt: 'Registrar até onde a água chegou — uma marca de nível, com data',
    en: 'Record how high the water reached — a high-water mark, dated',
  },
  enxurrada: {
    pt: 'Registrar por onde a água entra e com que força ela desce',
    en: 'Record where the water enters and how fast it comes down',
  },
  heat: {
    pt: 'Fotografar o espaço ao meio-dia, a sombra que existe e o piso',
    en: 'Photograph the space at midday, whatever shade exists, and the surface',
  },
  landslide: {
    pt: 'Fotografar a face do barranco, o que está acima e o que está abaixo',
    en: 'Photograph the face of the slope, what is above it and what is below',
  },
};

export function buildDossier(input: W3Input, lang: 'pt' | 'en' = 'pt'): Dossier {
  const pt = lang === 'pt';
  const { site, w3 = {} } = input;
  const solutions = input.solutions ?? [];
  const capacity = gradeCapacity(input);
  const items: DossierItem[] = [];
  const gaps: string[] = [];
  const add = (i: DossierItem) => items.push(i);

  const verdicts: Verdict[] = solutions.length
    ? solutions.map(s => computeVerdict(s, input, lang))
    : [computeVerdict(null, input, lang)];

  // ── No site: the dossier is short on purpose, and says why ────────────────
  if (!hasSite(site)) {
    add({
      list: 'gather',
      text: pt
        ? 'Marcar um lugar no mapa, mesmo que aproximado — tudo o mais depende disso'
        : 'Mark a place on the map, even roughly — everything else depends on it',
      source: 'intervention_site · no coordinates',
      owner: 'org',
    });
    const worry = site.site_worry;
    if (has(worry)) {
      add({
        list: 'investigate',
        text: pt
          ? `Confirmar no lugar se o problema é mesmo ${worry} — a palavra de vocês decide a solução, não o nosso mapa`
          : `Confirm on site whether the problem really is ${worry} — your word decides the solution, not our map`,
        source: `intervention_site · site_worry = ${worry}`,
        owner: 'coordination',
      });
    }
    gaps.push(
      pt
        ? 'Sem lugar marcado não há área, custo, aprovação nem manutenção a calcular'
        : 'With no place marked there is no area, cost, approval or maintenance to compute',
    );
    return { capacity, verdicts, items, budget: [], gaps };
  }

  // ── Per solution, from its ficha ──────────────────────────────────────────
  for (const id of solutions) {
    const ficha = getSolutionFicha(id);
    if (!ficha) continue;
    const approve = ficha.pt.quemPrecisaDizerSim;
    const upkeep = ficha.pt.quemCuidaDepois;

    const marker = studyMarkerIn(`${approve} ${ficha.pt.comoFunciona}`);
    if (marker) {
      add({
        list: 'investigate',
        text: pt ? `Providenciar ${marker.pt}` : `Arrange ${marker.en}`,
        source: `ficha ${id} · quemPrecisaDizerSim`,
        owner: 'org',
      });
    }

    // Approving bodies, read out of the ficha's own prose.
    for (const [re, body] of [
      [/SMAMUS/i, 'SMAMUS'],
      [/DMAE/i, 'DMAE'],
      [/prefeitura/i, pt ? 'a prefeitura' : 'the city'],
    ] as [RegExp, string][]) {
      if (re.test(approve) && !items.some(i => i.text.includes(body))) {
        const conditional = /se .{0,40}(rede|drenagem)/i.test(approve) && /DMAE/i.test(body);
        add({
          list: 'contact',
          text: pt ? `Falar com ${body}` : `Approach ${body}`,
          source: `ficha ${id} · quemPrecisaDizerSim`,
          owner: 'coordination',
          ...(conditional
            ? {
                blockedBy: pt
                  ? 'confirmar antes se a solução se liga à rede pública de drenagem'
                  : 'first confirming whether it connects to the public drainage network',
              }
            : {}),
        });
      }
    }

    if (/entope|colmata|troca(r)? as camadas|filtrant/i.test(upkeep)) {
      add({
        list: 'investigate',
        text: pt
          ? 'Definir quem paga a limpeza ou troca das camadas filtrantes quando elas entopem'
          : 'Settle who pays to clean or replace the filter layers when they clog',
        source: `ficha ${id} · quemCuidaDepois`,
        owner: 'org',
      });
    }

    add({
      list: 'document',
      text: pt
        ? `Acordo de manutenção — quem cuida de ${id.replace(/-/g, ' ')} depois do mutirão`
        : `Maintenance agreement — who looks after ${id.replace(/-/g, ' ')} after the mutirão`,
      source: `ficha ${id} · quemCuidaDepois × land_tenure`,
      owner: PUBLIC_TENURE.has(site.land_tenure ?? '') ? 'coordination' : 'org',
    });
  }

  if (!solutions.length) {
    gaps.push(
      pt
        ? 'Nenhuma solução escolhida ainda — as aprovações e os estudos saem da ficha da solução'
        : 'No solution chosen yet — approvals and studies come from the solution ficha',
    );
  }

  // ── Land, and who has to say yes to it ────────────────────────────────────
  const tenure = site.land_tenure ?? '';
  if (INFORMAL_TENURE.has(tenure)) {
    add({
      list: 'contact',
      text: pt
        ? 'Encontrar quem pode transformar "sempre usamos" em uma autorização escrita'
        : 'Find who can turn "we have always used it" into a written permission',
      source: `intervention_site · land_tenure = ${tenure}`,
      owner: 'coordination',
    });
  }
  // The ficha routes by land type; it does not know an institution sits on it.
  if (PUBLIC_TENURE.has(tenure) && /escola|emei|emef|creche|posto|ubs/i.test(site.site_name ?? '')) {
    add({
      list: 'contact',
      text: pt
        ? `Falar com a direção de ${site.site_name} e a secretaria responsável — é terreno público com uma instituição em cima`
        : `Approach the ${site.site_name} management and its secretariat — public land with an institution on it`,
      source: 'intervention_site · site_name × land_tenure',
      owner: 'org',
    });
  }

  // ── What to measure, decided by the mechanism ─────────────────────────────
  const worry = site.site_worry ?? '';
  const evidence = MECHANISM_EVIDENCE[worry];
  if (evidence) {
    add({ list: 'gather', text: pt ? evidence.pt : evidence.en, source: 'site-knowledge · WORRY_SUBTYPES', owner: 'org' });
  } else if (has(worry)) {
    // A legacy family id ('flood') names the family but not the mechanism, and
    // the mechanism is what decides the evidence AND the solution. Resolve it
    // rather than guessing — Partenon's story says enxurrada while the stored
    // worry says flood.
    gaps.push(
      pt
        ? `A preocupação está registrada como "${worry}", que é a família e não o mecanismo — perguntar se é alagamento, inundação ou enxurrada antes de escolher a evidência`
        : `The worry is stored as "${worry}", the family rather than the mechanism — ask whether it is ponding, river flooding or flash flooding before choosing the evidence`,
    );
  }

  add({
    list: 'document',
    text: pt
      ? 'Registro de linha de base — uma página, com data e foto, antes de qualquer obra'
      : 'Baseline record — one page, dated and photographed, before any work',
    source: 'W3 stage 4 · baseline_condition',
    owner: 'org',
  });

  // ── Site preparation, from what the place is today ────────────────────────
  if (site.current_use === 'paved') {
    add({
      list: 'investigate',
      text: pt
        ? 'Descobrir o que existe sob o piso antes de despavimentar, e de quem é o que passa por baixo'
        : 'Find out what lies under the paving before de-paving it, and who owns what runs beneath',
      source: 'intervention_site · current_use = paved',
      owner: 'org',
    });
  }

  // ── Money ─────────────────────────────────────────────────────────────────
  // A number, from the ficha's own published price, over the footprint they
  // drew. Not a budget — a range to take to a supplier, which is the thing an
  // organisation cannot produce on its own and the thing every funder asks for
  // first.
  const areaM2 = input.areaM2 ?? (Number(site.site_area_m2) || undefined);
  const budget: BudgetLine[] = [];
  for (const id of solutions) {
    const line = budgetLineFor(id, areaM2);
    if (!line) continue;
    budget.push(line);
    add({
      list: 'document',
      text: pt ? line.notePt : line.noteEn,
      source: `ficha ${id} · quantoCusta${line.areaM2 ? ` × ${line.areaM2} m²` : ''}`,
      owner: 'org',
    });
    // Naming the missing half is the point: "no cost band" is not actionable,
    // "we have a price per m² and no area" is.
    if (line.basis === 'm2' && !line.areaM2) {
      gaps.push(
        pt
          ? `${id.replace(/-/g, ' ')} tem preço por m² na ficha, mas ninguém desenhou a área — sem isso não sai um total`
          : `${id.replace(/-/g, ' ')} has a per-m² price in its ficha, but no footprint was drawn — without one there is no total`,
      );
    }
    if (line.basis === 'none') {
      gaps.push(
        pt
          ? `A ficha de ${id.replace(/-/g, ' ')} não fecha preço — esta é uma cotação a pedir, não um campo a preencher`
          : `The ${id.replace(/-/g, ' ')} ficha closes no price — this is a quote to request, not a field to fill`,
      );
    }
  }
  if (!areaM2 && solutions.length === 0) {
    gaps.push(pt ? 'Sem área desenhada não há faixa de custo' : 'Without a drawn footprint there is no cost band');
  }

  // An honest "not yet" is the most useful answer in the session: it is the gap
  // the portfolio carries to the municipality. Never treat it as incomplete.
  // Both ids are from E3_SUSTAINABILITY / E3_MAINTAINS in the field catalog. An
  // earlier version of this line also tested `opex_estimate_year1`, a field
  // that exists nowhere — so half the condition could never fire.
  if (w3.sustainability_model === 'indefinido' || w3.who_maintains === 'indefinido') {
    add({
      list: 'contact',
      text: pt
        ? 'Dinheiro recorrente ficou em aberto — isso é uma conversa que a coordenação precisa abrir, não um campo vazio'
        : 'Recurring money is open — that is a conversation for the coordination team to open, not an empty field',
      source: 'W3 stage 5 · sustainability_model',
      owner: 'coordination',
    });
  }

  // Exploratory and emerging organisations should not be handed a list that
  // assumes they can chase a municipal secretariat alone.
  if (capacity.grade === 'emerging') {
    for (const i of items) if (i.list === 'contact' && i.owner === 'org') i.owner = 'coordination';
  }

  for (const c of capacity.cannotYet) gaps.push(c);
  return { capacity, verdicts, items, budget, gaps };
}

/** The list a portfolio sorts on: the worst verdict across a project's solutions. */
export function portfolioState(verdicts: Verdict[]): VerdictState {
  const order: VerdictState[] = ['needs_site', 'needs_study', 'needs_permission', 'ready'];
  for (const s of order) if (verdicts.some(v => v.state === s)) return s;
  return 'ready';
}

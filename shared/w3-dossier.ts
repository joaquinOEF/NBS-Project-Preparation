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
import { SOLUTION_MECHANISMS, getSolution, NBS_SOLUTIONS } from './nbs-catalog';
import { budgetLineFor, type BudgetLine, type BuildModel } from './w3-sizing';
import { studyCostLine, STUDY_COSTS } from './w3-studies';
import { WORRY_SUBTYPES, type WorryId } from './site-knowledge';

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

export function gradeCapacity(input: W3Input, lang: 'pt' | 'en' = 'pt'): CapacityRead {
  const ptLang = lang === 'pt';
  const { site, org = {} } = input;
  const because: string[] = [];
  const cannotYet: string[] = [];

  const sited = hasSite(site);
  const depth = site.site_knowledge_depth ?? 'thin';
  const richDepth = depth === 'strong' || depth === 'rich';
  const hasStory = has(site.site_story);
  const tenureKnown = has(site.land_tenure);
  const funded = org.prior_project_scale === 'funded' || org.funding_history === 'yes';
  // ⚠️ NOT contact_name. Every organisation has one — E1 captures it from
  // everybody — so including it made `named` true almost always, and the grade
  // collapsed into "does this record have a strong depth read", which
  // site_knowledge_depth already says on its own. A name on a form is evidence
  // that a form was filled in. What this is trying to read is whether there is
  // a person who carries THIS project, which is a different question and has
  // its own field.
  const named = has(site.community_anchoring_lead);

  if (!sited) {
    because.push(ptLang ? 'ainda sem lugar marcado' : 'no place marked yet');
    cannotYet.push(
      ptLang
        ? 'o contorno do lugar — sem ele não há área, nem faixa de preço, nem caminho de aprovação'
        : 'a footprint, so no area, no cost band and no approval route',
    );
    return { grade: 'exploratory', because, cannotYet };
  }

  if (richDepth) because.push(ptLang ? `lugar descrito nas palavras da organização (${depth})` : `site described in their own words (${depth})`);
  if (hasStory) because.push(ptLang ? 'um relato do lugar, não só um ponto no mapa' : 'an account of the place, not just a pin');
  if (funded) because.push(ptLang ? 'já executou um projeto financiado' : 'has run a financed project before');
  if (named) because.push(ptLang ? 'uma pessoa com nome que carrega este projeto' : 'a named person who carries this project');
  if (!funded && !named) {
    cannotYet.push(
      ptLang
        ? 'quem carrega este projeto — não há histórico de projeto financiado nem uma pessoa registrada como responsável'
        : 'a clear owner — no funding history, and nobody is recorded as carrying this project',
    );
  }

  if (!tenureKnown) cannotYet.push(ptLang ? 'o caminho de aprovação — a situação do terreno ficou sem resposta' : 'the approval route — land tenure is unanswered');
  if (!hasStory) cannotYet.push(ptLang ? 'uma leitura do mecanismo — sem ela a linha de base fica genérica' : 'a mechanism read, so the baseline evidence stays generic');

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
  { re: /(estudo|avaliaç[aã]o) geot[eé]cnic/i, pt: 'uma avaliação geotécnica', en: 'a geotechnical assessment' },
  { re: /estudo hidrol[oó]gic/i, pt: 'um estudo hidrológico', en: 'a hydrological study' },
  { re: /estudo hidr[aá]ulic/i, pt: 'um estudo hidráulico', en: 'a hydraulic study' },
  // ART (Anotação de Responsabilidade Técnica) / RRT is the Brazilian
  // instrument that makes an engineer or architect legally answerable for a
  // structure. Where a ficha names it, the design is not a community decision
  // — and five fichas name it in prose my first regex set walked straight past.
  { re: /\bART\b|\bRRT\b|\bCREA\b/, pt: 'um responsável técnico com ART', en: 'a licensed technical lead (ART)' },
  { re: /respons[aá]vel t[eé]cnico|projeto (assinado por|de) engenheiro|engenheiro\/arquiteto/i, pt: 'um responsável técnico', en: 'a licensed technical lead' },
  // "precisa de um técnico" is only one of the ways a ficha says this. Biovaletas
  // says "o cálculo de vazão e a inclinação das barreiras (para não erodir)
  // pedem um técnico" — same requirement, different verb, and the first version
  // of this list walked past it and printed "dá pra construir com o que vocês já
  // sabem" on the card.
  { re: /(precisa|pede|pedem|exige|exigem|requer)\s+(de\s+)?(um\s+)?t[eé]cnic/i, pt: 'um técnico para o desenho', en: 'a technician for the design' },
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

/**
 * The sentence a marker matched, so a CONDITIONAL requirement can be reported
 * as one.
 *
 * The green-roof ficha is the case that forces this: "É a sua própria laje —
 * não precisa de licença pro método bidim. Se for encher de terra, sim: peso a
 * mais pode rachar a estrutura, e aí precisa de ART ou RRT de um engenheiro."
 * Reporting that flatly would tell an organisation planning the R$ 5/m² bidim
 * roof — the one Teto Verde Favela built twenty of with no outside money — that
 * it needs a registered engineer. Saying it depends is both true and the
 * difference between a project they can start and one they cannot.
 */
/** The words an organisation used for a worry, never the id we store it under. */
function worryLabel(id: string, pt: boolean): string {
  const first = id.split(',')[0].trim();
  const sub = WORRY_SUBTYPES.find(w => w.id === first);
  if (sub) return (pt ? sub.dPt : sub.dEn).toLowerCase();
  // Legacy family ids ('flood') predate the mechanism split and are still in
  // the database. They name a family, so say so in words rather than in code.
  const family: Record<string, { pt: string; en: string }> = {
    flood: { pt: 'a água', en: 'water' },
    heat: { pt: 'o calor', en: 'heat' },
    landslide: { pt: 'o barranco', en: 'the slope' },
  };
  return family[first] ? (pt ? family[first].pt : family[first].en) : first;
}

function studyMarkerIn(prose: string): { pt: string; en: string } | null {
  for (const m of STUDY_MARKERS) {
    const hit = m.re.exec(prose);
    if (!hit) continue;
    const sentence = prose.slice(prose.lastIndexOf('.', hit.index) + 1, prose.indexOf('.', hit.index) + 1 || undefined);
    const conditional = /\bse (for|a |o |vai|for[ae]m)|\bcaso\b|depend/i.test(sentence);
    return conditional
      ? { pt: `${m.pt} — a ficha diz que depende de como for feito`, en: `${m.en} — the ficha says it depends how it is built` }
      : { pt: m.pt, en: m.en };
  }
  return null;
}

/**
 * What this solution needs before it can be designed, or null when community
 * knowledge is enough.
 *
 * Exported because the W3 shortlist shows the same fact one beat EARLIER, on
 * the card — and a card that says "dá pra fazer em mutirão" followed by a
 * verdict that says "precisa de um técnico" would be the platform contradicting
 * itself inside one session. One read, two surfaces.
 */
export function studyRequirement(solutionId: string): { pt: string; en: string } | null {
  const ficha = getSolutionFicha(solutionId);
  if (!ficha) return null;
  const named = studyMarkerIn(`${ficha.pt.quemPrecisaDizerSim} ${ficha.pt.comoFunciona}`);
  if (named) return named;

  // ⚠️ The prose is where the SPECIFIC requirement is named; `delivery` is
  // where the catalogue already classified how it can be built at all, and it
  // is the reviewed structured field. Reading only the prose was a real defect
  // in the first version of this file: muro-de-arrimo-verde, solo-grampeado
  // and contenções em geocélulas are all `licenca` — their fichas say "nível
  // licença, sem exceção", with an ART registered at CREA — and every one of
  // them came back as needing nothing, so the verdict would have told an
  // organisation that a retaining wall on a mapped risk slope was buildable
  // once someone signed a permission slip. Of everything this system can get
  // wrong, that is the one that hurts somebody.
  //
  // So `licenca` is a floor, not an inference: it cannot make a solution look
  // easier than the catalogue already says it is.
  const sol = getSolution(solutionId);
  if (sol?.delivery === 'licenca') {
    return { pt: 'um responsável técnico com ART', en: 'a licensed technical lead (ART)' };
  }
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

  const marker = solutionId ? studyRequirement(solutionId) : null;

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
    source: solutionId ? `ficha ${solutionId} · delivery + quemPrecisaDizerSim` : 'intervention_site',
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
  /**
   * What the works cost does NOT include — the study, who does it, what it
   * costs where that is citable, and the source. Named in the verdict and on
   * the shortlist card long before it reached the budget.
   */
  studies: string[];
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
  /**
   * ⚠️ The catalogue label, never `id.replace(/-/g, ' ')`.
   *
   * Taking the dashes out of a slug looks like a name for `muro-de-arrimo-verde`
   * and stops looking like one the moment the slug is unaccented:
   * `captacao-agua-da-chuva` printed as "captacao agua da chuva" in a document
   * an organisation takes to an assembly. It read as a name in the four
   * scenarios anyone happened to write, which is exactly why it survived.
   */
  const solLabel = (id: string) =>
    (pt ? getSolution(id)?.pt.label : getSolution(id)?.en.label) ?? id.replace(/-/g, ' ');
  const { site, w3 = {} } = input;
  const solutions = input.solutions ?? [];
  const capacity = gradeCapacity(input, lang);
  const items: DossierItem[] = [];
  const gaps: string[] = [];
  /**
   * ⚠️ Deduplicated on the sentence itself.
   *
   * The item loop runs once per solution, and several of its lines do not name
   * one — an organisation that took a rain garden AND a bioswale got "Definir
   * quem paga a limpeza ou troca das camadas filtrantes quando elas entopem"
   * printed twice, word for word, as steps 2 and 4 of its route. Two identical
   * instructions read as a mistake in the document, which is the one thing this
   * page cannot afford. Where the line DOES name its solution (the maintenance
   * agreement) the two texts differ and both survive, which is correct.
   *
   * The sources merge rather than the second being dropped: "why does this say
   * that" has to stay answerable for both fichas.
   */
  const add = (i: DossierItem) => {
    const twin = items.find(x => x.list === i.list && x.text === i.text);
    if (!twin) { items.push(i); return; }
    if (!twin.source.includes(i.source)) twin.source = `${twin.source} · ${i.source}`;
  };

  /** Who builds it — the item copy needs it as much as the budget does. */
  const buildModelForItems = (w3.construction_model || '') as string;

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
      // ⚠️ Never the raw id. This line reached the organisation reading
      // "se o problema é mesmo landslide" — an English machine id, in the middle
      // of a Portuguese sentence, describing their own hillside back to them.
      const label = worryLabel(worry, pt);
      add({
        list: 'investigate',
        text: pt
          ? `Confirmar no lugar qual é o mecanismo dominante — o mapa indica ${label}, e a leitura de quem mora ali é a que prevalece`
          : `Confirm on site which mechanism dominates — the map indicates ${label}, and the reading of whoever lives there prevails`,
        source: `intervention_site · site_worry = ${worry}`,
        owner: 'coordination',
      });
    }
    // They chose something. Even with no place, the ficha already knows what
    // that choice will demand — and telling them now is the difference between
    // "come back when you have a site" and a workshop they got something out
    // of. The first version returned a dossier that never mentioned the
    // solution they had just spent the session choosing.
    for (const id of solutions) {
      const marker = studyRequirement(id);
      if (!marker) continue;
      add({
        list: 'investigate',
        text: pt
          ? `Quando houver um lugar: ${solLabel(id)} vai precisar de ${marker.pt}`
          : `Once there is a place: ${solLabel(id)} will need ${marker.en}`,
        source: `ficha ${id} · quemPrecisaDizerSim`,
        owner: 'coordination',
        blockedBy: pt ? 'marcar o lugar' : 'marking the place',
      });
    }
    gaps.push(
      pt
        ? 'Sem lugar marcado não há área, custo, aprovação nem manutenção a calcular'
        : 'With no place marked there is no area, cost, approval or maintenance to compute',
    );
    return { capacity, verdicts, items, budget: [], studies: [], gaps };
  }

  // ── Per solution, from its ficha ──────────────────────────────────────────
  for (const id of solutions) {
    const ficha = getSolutionFicha(id);
    if (!ficha) continue;
    const approve = ficha.pt.quemPrecisaDizerSim;
    const upkeep = ficha.pt.quemCuidaDepois;

    const marker = studyRequirement(id);
    if (marker) {
      add({
        list: 'investigate',
        text: pt ? `Providenciar ${marker.pt}` : `Arrange ${marker.en}`,
        source: `ficha ${id} · quemPrecisaDizerSim`,
        // The COORDINATION's, at every capacity grade. This is the whole
        // argument for having a `needs_study` pile on the coordinator's board:
        // one organisation hiring one geotechnical engineer is expensive and
        // slow; a cohort commissioning several at once is a procurement, and it
        // is the single biggest thing the programme can do that no individual
        // organisation can. Assigning it to the org (as the first version did
        // for `established` orgs) put the board and the dossier in direct
        // disagreement about who moves next.
        owner: 'coordination',
      });
    }

    // Approving bodies, read out of the ficha's own prose.
    //
    // ⚠️ "a prefeitura" is a FALLBACK, not a third body. Every ficha that names
    // SMAMUS or DMAE also uses the word prefeitura in the same breath — the
    // rain-garden entry reads "a aprovação é da prefeitura (SMAMUS…)" — so
    // matching all three produced three contact rows for one approval route,
    // one of which named nobody. A coordinator reading that has to work out
    // which of the three is a real door.
    const named = /SMAMUS|DMAE/i.test(approve);
    for (const [re, body] of [
      [/SMAMUS/i, 'SMAMUS'],
      [/DMAE/i, 'DMAE'],
      ...(named ? [] : [[/prefeitura/i, pt ? 'a prefeitura' : 'the city'] as [RegExp, string]]),
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

    // ⚠️ "depois do mutirão" was printed to everybody, including the
    // organisation that answered "empresa contratada" three beats earlier and
    // takes this page to an assembly. Same defect the who-maintains question
    // had — fixed there in the manifest, still hardcoded here, because the two
    // live in different files and nobody walked the printed page afterwards.
    const afterWho =
      buildModelForItems === 'contratada'
        ? { pt: 'depois que a empresa entregar', en: 'once the contractor hands it over' }
        : buildModelForItems === 'parceria'
          ? { pt: 'depois que o parceiro entregar', en: 'once the partner hands it over' }
          : buildModelForItems === 'mutirao' || buildModelForItems === 'mista'
            ? { pt: 'depois do mutirão', en: 'after the mutirão' }
            : { pt: 'depois que a obra terminar', en: 'once the work is finished' };
    add({
      list: 'document',
      text: pt
        ? `Acordo de manutenção — quem cuida de ${solLabel(id)} ${afterWho.pt}`
        : `Maintenance agreement — who looks after ${solLabel(id)} ${afterWho.en}`,
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
  // Only for solutions that actually break the ground. A horta in raised beds
  // on a concrete schoolyard does not de-pave anything, and telling that
  // organisation to find out what runs under the slab is one more item on a
  // list that is only useful while every line on it is real.
  const BREAKS_GROUND = /jardins-de-chuva|biovaletas|canteiro-pluvial|bacia-de-retencao|wetland|pavimentos-permeaveis|terracos|escada-hidraulica|reflorestamento|parque/;
  if (site.current_use === 'paved' && solutions.some(id => BREAKS_GROUND.test(id))) {
    add({
      list: 'investigate',
      text: pt
        ? 'Descobrir o que existe sob o piso antes de despavimentar, e de quem é o que passa por baixo'
        : 'Find out what lies under the paving before de-paving it, and who owns what runs beneath',
      source: 'intervention_site · current_use = paved × solução que mexe no solo',
      owner: 'org',
    });
  }

  // ── Money ─────────────────────────────────────────────────────────────────
  // A number, from the ficha's own published price, over the footprint they
  // drew. Not a budget — a range to take to a supplier, which is the thing an
  // organisation cannot produce on its own and the thing every funder asks for
  // first.
  const areaM2 = input.areaM2 ?? (Number(site.site_area_m2) || undefined);
  // How many of them, for a solution counted rather than measured. Same role
  // the footprint plays for a per-m² price: without it there is no total.
  const units = Number(input.w3?.intervention_units) || undefined;
  // Who builds it changes the band — and W3 asks it one beat after showing it.
  const buildModel = (input.w3?.construction_model || undefined) as BuildModel | undefined;
  const budget: BudgetLine[] = [];
  const studies: string[] = [];
  for (const id of solutions) {
    const line = budgetLineFor(id, areaM2, units, buildModel);
    if (!line) continue;
    // The budget rides in `budget[]` only. Adding the identical sentence as a
    // `document` item printed every price twice on the card — once under
    // "Quanto custa" and again under "Documentar", word for word.
    budget.push(line);
    // ⚠️ What the works cost does not include. The study is named in the verdict
    // and on the card and was missing from the only place a funder looks for it.
    const req = studyRequirement(id);
    const studyLine = req ? studyCostLine(req.pt, pt ? 'pt' : 'en') : null;
    if (studyLine && !studies.includes(studyLine)) studies.push(studyLine);
    // Naming the missing half is the point: "no cost band" is not actionable,
    // "we have a price per m² and no area" is.
    if (line.basis === 'm2' && !line.areaM2) {
      gaps.push(
        pt
          ? `${solLabel(id)} tem preço por m² na ficha, mas ninguém desenhou a área — sem isso não sai um total`
          : `${solLabel(id)} has a per-m² price in its ficha, but no footprint was drawn — without one there is no total`,
      );
    }
    // The same sentence for a solution counted per unit: the ficha has a price
    // per cistern and nobody said how many cisterns.
    if ((line.basis === 'unit' || line.basis === 'project') && !line.units) {
      gaps.push(
        pt
          ? `${solLabel(id)} se conta por unidade, e ainda não sabemos quantas — sem isso não sai um total`
          : `${solLabel(id)} is counted per unit, and how many is still unknown — without it there is no total`,
      );
    }
    // ⚠️ They said they will build it, and the ficha prices a contractor. Naming
    // that is the actionable form: the band on the page is not their band, and
    // finding the real one is a thing the coordination can help with — the same
    // shape as pooling a study.
    if (line.builtBySelfWithoutFigure) {
      gaps.push(
        pt
          ? `${solLabel(id)} vai ser feito em mutirão, e a faixa da ficha é de execução contratada — falta levantar o custo em execução própria`
          : `${solLabel(id)} will be built by mutirão, and the ficha's range is for contracted work — what it costs built by you is still to be found`,
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
  // An honest "ainda não sabemos" belongs in the NAMED gaps, not only in the
  // coordination's item list. The roadmap reads its open questions as the next
  // stretch of the route, and recurring money is the one the portfolio actually
  // carries to the municipality — leaving it out made a fully-answered
  // organisation's route look like it had nothing left to resolve.
  if (w3.sustainability_model === 'indefinido') {
    gaps.push(
      pt
        ? 'De onde vem o dinheiro da manutenção ficou em aberto — item que a coordenação leva à prefeitura'
        : 'Where upkeep money comes from is open — that is the conversation the coordination takes to the city, not a field for you to fill',
    );
  }
  if (w3.monitoring_capacity === 'ninguem-ainda') {
    gaps.push(
      pt
        ? 'Ninguém consegue medir ainda — isso é um pedido de parceiro de monitoramento, e vale registrar como tal'
        : 'Nobody can measure it yet — that is a request for a monitoring partner, worth recording as one',
    );
  }
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
  return { capacity, verdicts, items, budget, studies, gaps };
}

/** The list a portfolio sorts on: the worst verdict across a project's solutions. */
export function portfolioState(verdicts: Verdict[]): VerdictState {
  const order: VerdictState[] = ['needs_site', 'needs_study', 'needs_permission', 'ready'];
  for (const s of order) if (verdicts.some(v => v.state === s)) return s;
  return 'ready';
}

// ── The study-line invariant ────────────────────────────────────────────────
// Every requirement `studyRequirement` produces must have a study line, and
// every study line must answer a requirement that exists. A renamed string on
// either side would silently drop the study from every budget that needs it —
// the exact failure w3-studies was written to end.
//
// Lives here rather than in w3-studies because that file would have to import
// this one to check itself, and this one already imports it: the cycle left
// STUDY_MARKERS uninitialised at load.
{
  const produced = new Set(
    NBS_SOLUTIONS.map(s => studyRequirement(s.id)?.pt).filter((v): v is string => !!v),
  );
  for (const key of Object.keys(STUDY_COSTS)) {
    if (!produced.has(key)) {
      throw new Error(`w3-studies: "${key}" is not a requirement any solution produces — renamed?`);
    }
  }
  for (const need of Array.from(produced)) {
    if (!STUDY_COSTS[need]) {
      throw new Error(`w3-studies: solutions require "${need}" and no study line answers it`);
    }
  }
}

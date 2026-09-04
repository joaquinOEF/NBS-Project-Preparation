// ============================================================================
// THE CONCEPT NOTE — the fact base, and the document assembled from it
// ============================================================================
// "the pdf and final proto concept note, it's mostly verbatim what the user
// shared. i would expect we use a smart agent to use all the context of what
// they shared, plus our knowledge base to prepare a concept note that is BETTER
// than what they can prepare. that's the whole goal, not just capturing
// information." — JVP, 2026-09-02
//
// He is right. What an organisation downloads today is its own answers,
// arranged: its site description is its paragraph, its justification is its
// paragraph, its baseline is the same paragraph again. An organisation that
// could already write those gets back the paragraphs it wrote.
//
// This file is phase 1 of docs/concept-note-authoring.md, and phase 1 is
// deliberately NOT the model. It is the two things the model will need and
// cannot be trusted to derive:
//
//   conceptNoteFacts()  — everything the note may assert, typed, computed, each
//                         item carrying the source it came from. In phase 2 the
//                         authoring pass receives THIS and never the raw state,
//                         so it cannot invent a number it was not handed.
//
//   buildConceptNote()  — the ten sections, assembled from those facts with no
//                         model in the path. It is already better than today's
//                         document on structure alone, and it is the floor the
//                         authored version can never fall below.
//
// Two rules hold across both, and both are paid for by defects in this repo:
//   · every paragraph carries at least one source, and one that cannot name a
//     source does not ship (docs/document-register.md);
//   · the register is a nota técnica in the third person — the organisation's
//     own sentences appear as quotation and nothing else addresses the reader.
// ============================================================================

import { getSolution, SOLUTION_MECHANISMS } from './nbs-catalog';
import { getSolutionFicha } from './nbs-solution-fichas';
import {
  buildDossier, computeVerdict, portfolioState, studyRequirement, hasSite, worryLabel,
  type W3Input, type VerdictState,
} from './w3-dossier';
import { approvalRequirement, type ApprovalBody } from './nbs-approvals';
import { approvalRouteLine } from './nbs-knowledge';
import { DECISIVE_DETAIL, CONCRETE_INSTANCE } from './w3-detail-questions';
import { FIELD_DESTINY } from './field-destiny';
import {
  fundingMatches, FUNDING_CAVEAT, AGGREGATION_ARGUMENT, FUNDER_KIND_LABEL,
  PHILANTHROPIC_VS_COMMERCIAL,
} from './funding-sources';
import { budgetLineFor, SOLUTION_COSTS, type BuildModel } from './w3-sizing';
import { benefitFor } from './w3-benefits';
import { studyCostLine } from './w3-studies';
import { scaleStatement, type ScaleStatement } from './w3-scale';
import { buildRoadmap, reportLabel, type RoadmapStep } from './w3-roadmap';
import { cboFieldEnumOptions } from './cbo-field-catalog';
import { siteLabel } from './site-name';

type Lang = 'pt' | 'en';

const has = (v: unknown): v is string => typeof v === 'string' && v.trim() !== '';
/**
 * ⚠️ The written form first. A chip is spoken — "A gente mesmo", "É da
 * prefeitura, mas a gente usa" — and a nota técnica that prints the chip is a
 * document talking in the first person about a organisation it is describing in
 * the third. Same table the roadmap uses, so the two cannot drift.
 */
const enumLabel = (section: string, field: string, id: string | undefined, lang: Lang) => {
  if (!id) return undefined;
  const written = reportLabel(id, lang);
  if (written) return written;
  const hit = (cboFieldEnumOptions(section, field) ?? []).find(o => o.id === id);
  return hit ? (lang === 'pt' ? hit.pt : hit.en) : undefined;
};

// ── The fact base ───────────────────────────────────────────────────────────

export interface SolutionFacts {
  id: string;
  label: string;
  whatItIs: string;
  /** The ficha's own account of the mechanism — how it actually works. */
  howItWorks: string;
  /** What the ficha says about keeping it alive, survival rates included. */
  upkeep: string;
  /** A technical study the design cannot be settled without. */
  study?: { needs: string; costLine?: string };
  /** Who has to say yes, for THIS organisation's land. */
  approval?: {
    bodies: Array<{ name: string; what: string }>;
    instrument?: string;
    /** The sentence saying it may not start without permission. */
    prohibition?: string;
    /** The sentence carrying a season, a month or a duration. */
    timing?: string;
    /**
     * How the permission is actually asked for — channel, department, stated
     * processing time. From the knowledge slice, not from the ficha.
     *
     * ⚠️ It belongs in the FACT BASE, not only in the assembled paragraph:
     * everything the note may assert has to be here, or the authoring pass gets
     * a paragraph rejected for citing "30 dias" — a true, sourced figure the
     * guard would treat as invented because it never saw it.
     */
    route?: string;
  };
  cost?: {
    lowBrl?: number;
    highBrl?: number;
    basis: string;
    note: string;
    /** Present when the published band assumes a builder they are not using. */
    buildModelCaveat?: string;
  };
  benefit?: { claim: string; headline?: string; source: string; siteSpecific: boolean };
}

export interface ConceptNoteFacts {
  lang: Lang;
  org: {
    name: string;
    contact?: string;
    contactRole?: string;
    teamSize?: string;
    yearsPresent?: number;
    fundedBefore: boolean;
    largestBudget?: string;
    /**
     * ⚠️ Everything below was captured in Encontro 1 and reached nothing.
     *
     * The E1↔E3 audit found the inverse of the W2↔W3 one: Encontro 3 asks
     * almost nothing Encontro 1 already answered — which is right — and the
     * document that argues FOR the organisation then ignored eleven of the
     * eighteen facts that workshop spent an hour collecting. Legal status is
     * the first thing a funder checks for eligibility, and it was nowhere on
     * the page. See docs/e1-e3-overlap-audit.md.
     */
    mission?: string;
    activities?: string;
    legalStatus?: string;
    groupsServed?: string;
    nbsExperience?: string;
    volunteerBase?: string;
  };
  place: {
    bairro?: string;
    siteName?: string;
    hasPin: boolean;
    areaM2?: number;
    units?: number;
    currentUse?: string;
    tenure?: string;
  };
  territory: {
    population?: number;
    povertyPct?: number;
    /** Within-city percentile, 0–100, for each hazard. */
    floodPct?: number;
    heatPct?: number;
    landslidePct?: number;
  };
  problem: {
    worry?: string;
    worryLabel?: string;
    /** Their own words, verbatim. Quoted, never paraphrased. */
    story?: string;
    whyHere?: string;
    baseline?: string;
  };
  solutions: SolutionFacts[];
  /** What this project's volume covers, event by event — null unless it applies. */
  scale: ScaleStatement | null;
  delivery: {
    buildModel?: string;
    timeframe?: string;
    maintainer?: string;
    frequency?: string;
    recurringMoney?: string;
    monitoring?: string;
  };
  /**
   * ⚠️ What a reading pass SAW, each carrying what it was based on.
   *
   * This is how the photographs and the uploaded documents reach a pass that
   * must stay auditable. The organisation walked its own site and photographed
   * the ground; the advisor reads those images and the full text of what they
   * uploaded, and emits one-sentence observations with their provenance. Those
   * are facts with a source, so they enter the fact base like any other and
   * pass the same guards — while the writing pass still sees only facts.
   *
   * Handing the images to the writer instead would widen the reach and lose the
   * guarantee: the number guard cannot catch an invented noun, and "o pátio tem
   * um ralo entupido" read off an ambiguous photograph is not a figure.
   * See docs/context-first.md.
   */
  observations: Array<{ text: string; basedOn: string; kind: string }>;

  /**
   * ⚠️ EVERY collected field that declares it belongs on the page, gathered
   * generically — never by hand.
   *
   * This exists because the hand-written contract below is a good rule for what
   * the note MAY assert and a terrible one for what it MUST NOT forget: a field
   * starts invisible and stays invisible until somebody remembers it. Nobody
   * remembered eight times, and eight answers an organisation gave out loud
   * reached no document at all. See shared/field-destiny.ts.
   */
  collected: Array<{ field: string; labelPt: string; labelEn: string; value: string; feeds: ConceptSectionId }>;

  /**
   * What this organisation shares with the rest of the cohort, in counts.
   *
   * ⚠️ The programme's whole argument, and the one fact a single organisation
   * cannot reach from inside its own record: "três outras organizações do
   * grupo precisam do mesmo estudo" is what turns eighteen small requests into
   * one portfolio a funder can act on. It reaches the page as counts through
   * the allowlist in server/services/cohortContext.ts — a peer is never named
   * on another organisation's document.
   */
  cohort: string[];

  /** What the organisation itself puts in. Named, never priced. */
  contribution: string[];
  verdict: VerdictState;
  gaps: string[];
  steps: RoadmapStep[];
  totals: { lowBrl?: number; highBrl?: number };
}

/**
 * Every field that declared it belongs on the page, with the value it holds.
 *
 * ⚠️ Reads the REGISTRY, never a list here. Adding a question anywhere in the
 * product and declaring `feeds` is the whole of the work required to get its
 * answer into the document — which is the property that was missing when eight
 * answers went nowhere.
 */
function collectedFields(all: Record<string, string | undefined>, lang: Lang): ConceptNoteFacts['collected'] {
  const out: ConceptNoteFacts['collected'] = [];
  for (const [field, d] of Object.entries(FIELD_DESTINY)) {
    if (!('feeds' in d)) continue;
    const value = String(all[field] ?? '').trim();
    // ⚠️ "Não sei" is a real and useful answer in the room — it tells the
    // coordination where to look next — and a lie on a funder's page, where it
    // reads as though somebody had told us something. It stays in the record
    // and stays off the document.
    if (!value || value.toLowerCase() === 'null' || (d.skipIf && d.skipIf.test(value))) continue;
    out.push({ field, labelPt: d.labelPt, labelEn: d.labelEn, value, feeds: d.feeds });
  }
  return out;
}

/**
 * Everything the concept note may assert, and nothing else.
 *
 * ⚠️ This is the contract with the authoring pass. Whatever a model is later
 * asked to write, it receives this object — not the state, not the transcript,
 * not the fichas in full. A fact that is not here cannot appear on the page,
 * which is the only reliable defence against a fluent wrong sentence in a
 * document that goes to a funder.
 */
export function conceptNoteFacts(input: W3Input, lang: Lang = 'pt'): ConceptNoteFacts {
  const pt = lang === 'pt';
  const site = input.site ?? {};
  const org = input.org ?? {};
  const w3 = input.w3 ?? {};
  const ids = input.solutions ?? [];
  const areaM2 = input.areaM2 || Number(site.site_area_m2) || undefined;
  const units = Number(w3.intervention_units) || undefined;
  const buildModel = (w3.construction_model || undefined) as BuildModel | undefined;
  const dossier = buildDossier(input, lang);

  const solutions: SolutionFacts[] = ids.map((id): SolutionFacts => {
    const sol = getSolution(id);
    const ficha = getSolutionFicha(id);
    const need = studyRequirement(id);
    const appr = approvalRequirement(id, site.land_tenure);
    const line = budgetLineFor(id, areaM2, units, buildModel);
    const ben = benefitFor(id, areaM2, units);
    const cost = SOLUTION_COSTS[id];
    // ⚠️ The band on the page belongs to a contractor for most solutions. When
    // the organisation is building it themselves, saying so beside the figure
    // is the difference between a range they can use and one that misleads.
    const selfBuild = /mutirao|mista/.test(buildModel ?? '') && !cost?.buildModel?.mutiraoLow;
    return {
      id,
      label: sol ? (pt ? sol.pt.label : sol.en.label) : id,
      whatItIs: sol ? (pt ? sol.pt.whatItIs : sol.en.whatItIs) : '',
      howItWorks: ficha ? (pt ? ficha.pt.comoFunciona : ficha.en.comoFunciona) : '',
      upkeep: ficha ? (pt ? ficha.pt.quemCuidaDepois : ficha.en.quemCuidaDepois) : '',
      ...(need
        ? {
            study: {
              needs: pt ? need.pt : need.en,
              ...(studyCostLine(need.pt, lang) ? { costLine: studyCostLine(need.pt, lang)! } : {}),
            },
          }
        : {}),
      ...(appr
        ? {
            approval: {
              bodies: appr.bodies.map((b: ApprovalBody) => ({ name: b.name, what: pt ? b.whatPt : b.whatEn })),
              ...(appr.instrumentPt ? { instrument: pt ? appr.instrumentPt : appr.instrumentEn } : {}),
              ...(appr.prohibitionPt ? { prohibition: pt ? appr.prohibitionPt : appr.prohibitionEn } : {}),
              ...(appr.timingPt ? { timing: pt ? appr.timingPt : appr.timingEn } : {}),
              ...(approvalRouteLine(appr.instrumentPt, lang) ? { route: approvalRouteLine(appr.instrumentPt, lang)! } : {}),
            },
          }
        : {}),
      ...(line
        ? {
            cost: {
              ...(line.lowBrl != null ? { lowBrl: line.lowBrl, ...(line.highBrl != null ? { highBrl: line.highBrl } : {}) } : {}),
              basis: line.basis,
              note: pt ? line.notePt : line.noteEn,
              ...(selfBuild
                ? {
                    buildModelCaveat: pt
                      ? 'A faixa publicada na ficha é de execução contratada; em execução própria o custo cai, e a ficha não fecha quanto.'
                      : "The published range assumes contracted work; built by the organisation it falls, and the ficha does not say by how much.",
                  }
                : {}),
            },
          }
        : {}),
      ...(ben
        ? {
            benefit: {
              claim: pt ? ben.claimPt : ben.claimEn,
              ...(ben.headlinePt ? { headline: pt ? ben.headlinePt! : ben.headlineEn! } : {}),
              source: pt ? ben.sourcePt : ben.sourceEn,
              siteSpecific: ben.siteSpecific,
            },
          }
        : {}),
    };
  });

  const num = (v: unknown) => {
    const n = Number(v);
    return Number.isFinite(n) && n > 0 ? n : undefined;
  };
  const yearsPresent = num(org.year_founded) ? new Date().getFullYear() - Number(org.year_founded) : undefined;

  // Legal status, as a funder reads it: the form and whether there is a CNPJ.
  const legalForm = has(org.legal_form)
    ? enumLabel('org_profile', 'legal_form', org.legal_form, lang) ?? org.legal_form
    : null;
  // The chip is an answer — "Sim, temos CNPJ" — and the document states a fact.
  // Printing "CNPJ: Sim, temos CNPJ" is the chip-versus-document confusion
  // REPORT_LABEL exists to end, in a new place.
  const cnpjRaw = has(org.has_cnpj)
    ? enumLabel('org_profile', 'has_cnpj', org.has_cnpj, lang) ?? org.has_cnpj
    : null;
  const cnpj = cnpjRaw
    ? /^(sim|yes)/i.test(cnpjRaw.trim())
      ? (pt ? 'com CNPJ' : 'with a CNPJ')
      : /certeza|not sure/i.test(cnpjRaw)
        ? (pt ? 'CNPJ a confirmar' : 'CNPJ to be confirmed')
        : (pt ? 'sem CNPJ' : 'without a CNPJ')
    : null;
  const legalStatus = [legalForm, cnpj].filter(Boolean).join(' · ') || null;
  const nbsExp = has(org.nbs_experience)
    ? [enumLabel('org_profile', 'nbs_experience', org.nbs_experience, lang) ?? org.nbs_experience,
       has(org.nbs_experience_detail) ? org.nbs_experience_detail.trim() : null]
        .filter(Boolean).join(' — ')
    : null;

  const contribution: string[] = [];
  if (/mutirao|mista/.test(buildModel ?? '')) {
    const label = enumLabel('intervention_type', 'construction_model', buildModel, lang);
    if (label) contribution.push(label);
  }
  if (has(org.team_size)) contribution.push(pt ? `${org.team_size} pessoas na organização` : `${org.team_size} people in the organisation`);
  // ⚠️ An all-volunteer team IS the counterpart contribution, and a funder reads
  // it as one — but only where the organisation is actually building.
  if (has(org.paid_vs_volunteer) && /volunt/i.test(org.paid_vs_volunteer) && /mutirao|mista/.test(buildModel ?? '')) {
    contribution.push(enumLabel('org_profile', 'paid_vs_volunteer', org.paid_vs_volunteer, lang) ?? org.paid_vs_volunteer);
  }
  if (yearsPresent) contribution.push(pt ? `${yearsPresent} anos de presença no território` : `${yearsPresent} years present in the território`);
  if (['private-owned', 'formal-agreement', 'public-informal', 'mixed', 'public_land'].includes(site.land_tenure ?? '')) {
    contribution.push(pt ? 'terreno já em uso pela organização' : 'land already in use by the organisation');
  }

  // The advisor's reading of the photographs and the documents, if it ran.
  // Absent in a deployment with no key, which is why nothing here depends on it.
  const observations: ConceptNoteFacts['observations'] = (() => {
    try {
      const advice = JSON.parse(String(w3._advice_json ?? '') || '{}');
      return (advice.observations ?? [])
        .filter((o: any) => typeof o?.textPt === 'string' && o.textPt.trim().length > 12)
        .map((o: any) => ({ text: String(o.textPt).trim(), basedOn: String(o.basedOn ?? '').trim(), kind: String(o.kind ?? '') }))
        .filter((o: any) => o.basedOn);
    } catch {
      return [];
    }
  })();

  const priced = solutions.map(s => s.cost).filter(c => c?.lowBrl != null);
  const roadmap = buildRoadmap(input, lang);

  return {
    lang,
    org: {
      name: org.org_name ?? '',
      ...(has(org.contact_name) ? { contact: org.contact_name } : {}),
      ...(has(org.contact_role) ? { contactRole: org.contact_role } : {}),
      ...(has(org.team_size) ? { teamSize: org.team_size } : {}),
      ...(yearsPresent ? { yearsPresent } : {}),
      fundedBefore: org.prior_project_scale === 'funded' || org.funding_history === 'yes',
      ...(has(org.biggest_project_budget) ? { largestBudget: org.biggest_project_budget } : {}),
      // Their own sentence about what the organisation is for — quoted, never
      // paraphrased, like every other passage they wrote.
      ...(has(org.mission_summary) ? { mission: org.mission_summary.trim() } : {}),
      ...(has(org.main_activities) ? { activities: org.main_activities } : {}),
      // ⚠️ Eligibility. Most editais open with "tem CNPJ?", and a concept note
      // that does not answer it makes a funder go and ask.
      ...(legalStatus ? { legalStatus } : {}),
      ...(has(org.groups_served) ? { groupsServed: org.groups_served } : {}),
      ...(nbsExp ? { nbsExperience: nbsExp } : {}),
      ...(has(org.paid_vs_volunteer) ? { volunteerBase: enumLabel('org_profile', 'paid_vs_volunteer', org.paid_vs_volunteer, lang) ?? org.paid_vs_volunteer } : {}),
    },
    place: {
      ...(has(site.bairro) ? { bairro: site.bairro.split(',')[0].trim() } : {}),
      // ⚠️ Never the raw coordinate string. It is the document's title, its
      // browser-tab name, and the first line a funder reads.
      ...(siteLabel(site.site_name, lang) ? { siteName: siteLabel(site.site_name, lang)! } : {}),
      hasPin: hasSite(site),
      ...(areaM2 ? { areaM2 } : {}),
      ...(units ? { units } : {}),
      ...(enumLabel('intervention_site', 'current_use', site.current_use, lang)
        ? { currentUse: enumLabel('intervention_site', 'current_use', site.current_use, lang) }
        : {}),
      ...(enumLabel('intervention_site', 'land_tenure', site.land_tenure, lang)
        ? { tenure: enumLabel('intervention_site', 'land_tenure', site.land_tenure, lang) }
        : {}),
    },
    territory: {
      ...(num(site.bairro_population) ? { population: num(site.bairro_population) } : {}),
      ...(num(site.bairro_poverty_pct) ? { povertyPct: num(site.bairro_poverty_pct) } : {}),
      ...(num(site._bairro_flood_pct) ? { floodPct: num(site._bairro_flood_pct) } : {}),
      ...(num(site._bairro_heat_pct) ? { heatPct: num(site._bairro_heat_pct) } : {}),
      ...(num(site._bairro_landslide_pct) ? { landslidePct: num(site._bairro_landslide_pct) } : {}),
    },
    problem: {
      ...(has(site.site_worry) ? { worry: site.site_worry, worryLabel: worryLabel(site.site_worry, pt) } : {}),
      ...(has(site.site_story) ? { story: site.site_story.trim() } : {}),
      ...(has(w3.justification_why_here) ? { whyHere: w3.justification_why_here.trim() } : {}),
      ...(has(w3.baseline_condition) ? { baseline: w3.baseline_condition.trim() } : {}),
    },
    solutions,
    scale: scaleStatement(ids, areaM2 ?? 0, site.site_worry),
    delivery: {
      ...(enumLabel('intervention_type', 'construction_model', w3.construction_model, lang)
        ? { buildModel: enumLabel('intervention_type', 'construction_model', w3.construction_model, lang) }
        : {}),
      ...(enumLabel('impact_monitoring', 'project_timeframe', w3.project_timeframe, lang)
        ? { timeframe: enumLabel('impact_monitoring', 'project_timeframe', w3.project_timeframe, lang) }
        : {}),
      ...(enumLabel('operations_sustain', 'who_maintains', w3.who_maintains, lang)
        ? { maintainer: enumLabel('operations_sustain', 'who_maintains', w3.who_maintains, lang) }
        : {}),
      ...(enumLabel('operations_sustain', 'maintenance_frequency', w3.maintenance_frequency, lang)
        ? { frequency: enumLabel('operations_sustain', 'maintenance_frequency', w3.maintenance_frequency, lang) }
        : {}),
      ...(enumLabel('operations_sustain', 'sustainability_model', w3.sustainability_model, lang)
        ? { recurringMoney: enumLabel('operations_sustain', 'sustainability_model', w3.sustainability_model, lang) }
        : {}),
      ...(enumLabel('impact_monitoring', 'monitoring_capacity', w3.monitoring_capacity, lang)
        ? { monitoring: enumLabel('impact_monitoring', 'monitoring_capacity', w3.monitoring_capacity, lang) }
        : {}),
    },
    observations,
    // ⚠️ Gathered from the DESTINY REGISTRY, not from a list in this file. A
    // field declared `feeds` reaches the page without anybody editing
    // concept-note.ts — which is the only version of this that cannot rot.
    collected: collectedFields({ ...(input.site ?? {}), ...(input.org ?? {}), ...(input.w3 ?? {}) }, lang),
    // ⚠️ Passed through untouched, never assembled here. The lines arrive
    // already de-identified from cohortContext.ts; building any of them from a
    // peer's record at this layer would put a name on someone else's document.
    cohort: (input.cohort ?? []).map(l => String(l).trim()).filter(Boolean),
    contribution,
    verdict: portfolioState(dossier.verdicts),
    gaps: dossier.gaps,
    steps: roadmap.steps,
    totals: {
      ...(priced.length
        ? {
            lowBrl: priced.reduce((n, c) => n + (c!.lowBrl ?? 0), 0),
            highBrl: priced.reduce((n, c) => n + (c!.highBrl ?? 0), 0),
          }
        : {}),
    },
  };
}

// ── The document ────────────────────────────────────────────────────────────

/** Every section, in the order the document uses. */
export const SECTION_ORDER = [
  'resumo', 'organizacao', 'problema', 'intervencao', 'porque',
  'resultados', 'exige', 'custo', 'financiamento', 'manutencao', 'pendencias',
] as const;

export type ConceptSectionId =
  | 'resumo' | 'organizacao' | 'problema' | 'intervencao' | 'porque'
  | 'resultados' | 'exige' | 'custo' | 'financiamento' | 'manutencao' | 'pendencias';

export interface Paragraph {
  text: string;
  /** `quote` is verbatim from the organisation and is rendered as quotation. */
  kind: 'written' | 'quote' | 'figure' | 'bullet';
  /** Never empty. A paragraph that cannot name where it came from does not ship. */
  sources: string[];
  /** False while a section is assembled; true once an authoring pass wrote it. */
  authored?: boolean;
}

export interface ConceptSection {
  id: ConceptSectionId;
  n: number;
  title: string;
  paragraphs: Paragraph[];
  /** Something this section needs is still missing. */
  open?: boolean;
}

export interface ConceptNote {
  title: string;
  subtitle: string;
  state: VerdictState;
  sections: ConceptSection[];
  facts: ConceptNoteFacts;
}

const T = {
  pt: {
    resumo: 'Resumo', organizacao: 'A organização e o território', problema: 'O problema',
    intervencao: 'A intervenção proposta', porque: 'Por que esta solução aqui',
    resultados: 'Resultados esperados', exige: 'O que o projeto exige',
    custo: 'Custo estimado e contrapartida', financiamento: 'Caminhos de financiamento',
    manutencao: 'Manutenção e recursos recorrentes',
    pendencias: 'Pendências e próximos passos',
    draft: 'RASCUNHO — para validar e ajustar',
  },
  en: {
    resumo: 'Summary', organizacao: 'The organisation and the territory', problema: 'The problem',
    intervencao: 'The proposed intervention', porque: 'Why this solution here',
    resultados: 'Expected results', exige: 'What the project requires',
    custo: 'Estimated cost and counterpart contribution', financiamento: 'Funding paths',
    manutencao: 'Upkeep and recurring resources',
    pendencias: 'Open items and next steps',
    draft: 'DRAFT — to validate and adjust',
  },
} as const;

const STATE_SENTENCE: Record<VerdictState, { pt: string; en: string }> = {
  ready: {
    pt: 'Nada bloqueia o início: o que falta é uma cotação de fornecedor e a assinatura de quem precisa dizer sim.',
    en: 'Nothing blocks the start: what remains is a supplier quote and a signature from whoever has to say yes.',
  },
  needs_study: {
    pt: 'O projeto depende de um estudo técnico antes de qualquer obra — não é uma pendência da organização, é um profissional a contratar.',
    en: 'The project depends on a technical study before any works — not something the organisation can settle, but a professional to bring in.',
  },
  needs_permission: {
    pt: 'O projeto está tecnicamente de pé e depende de autorização formal antes de começar.',
    en: 'The project stands up technically and depends on formal authorisation before it can start.',
  },
  needs_site: {
    pt: 'O projeto ainda não tem lugar marcado, e sem isso não há área, custo nem caminho de aprovação.',
    en: 'The project has no place marked yet, and without one there is no area, no cost and no approval route.',
  },
};

/**
 * "em resposta a a água" is what stripping the article produces, and "em
 * resposta a água" is what leaving it off produces. Portuguese contracts the
 * preposition with the article, and a document that gets this wrong twice on
 * its first page reads as machine output whatever else it says.
 */
const toThe = (label: string, lang: Lang): string => {
  if (lang !== 'pt') return label;
  if (/^a /i.test(label)) return `à ${label.slice(2)}`;
  if (/^o /i.test(label)) return `ao ${label.slice(2)}`;
  if (/^as /i.test(label)) return `às ${label.slice(3)}`;
  if (/^os /i.test(label)) return `aos ${label.slice(3)}`;
  return `a ${label}`;
};

const brl = (v: number, lang: Lang) =>
  `R$ ${Math.round(v).toLocaleString(lang === 'pt' ? 'pt-BR' : 'en-US')}`;

/**
 * The ten sections, assembled from the fact base with no model in the path.
 *
 * ⚠️ Deterministic on purpose. This is the floor the authored version can never
 * fall below — a deployment with no key, a model that times out, a call that
 * fails, all produce this, and this is already a structured project document
 * rather than a list of answers. Phase 2 replaces the prose of sections 1, 5
 * and 6; everything else stays computed.
 */
export function buildConceptNote(input: W3Input, lang: Lang = 'pt'): ConceptNote {
  const f = conceptNoteFacts(input, lang);
  const pt = lang === 'pt';
  const t = T[lang];
  const sections: ConceptSection[] = [];
  const P = (text: string, sources: string[], kind: Paragraph['kind'] = 'written'): Paragraph =>
    ({ text, kind, sources, authored: false });
  /**
   * ⚠️ Their own answers, placed by the registry rather than by hand.
   *
   * Quoted, and attributed to the workshop that collected them: the deterministic
   * FLOOR. The authoring pass may weave the same fact into an argument, and if it
   * does the section's paragraphs are replaced wholesale — but if it times out,
   * fails, or nothing survives the guards, the answer is still on the page. That
   * is the difference between this and where these eight answers used to go,
   * which was nowhere.
   */
  const collectedFor = (id: ConceptSectionId): Paragraph[] =>
    f.collected
      .filter(c => c.feeds === id)
      .map(c => P(`**${pt ? c.labelPt : c.labelEn}:** “${c.value}”`, [
        pt ? 'a organização, nos encontros' : 'the organisation, during the workshops',
      ], 'quote'));

  const placed = new Set<ConceptSectionId>();
  const push = (id: ConceptSectionId, paragraphs: Array<Paragraph | null>, open?: boolean) => {
    placed.add(id);
    const kept = [
      ...paragraphs.filter((p): p is Paragraph => !!p && p.text.trim() !== '' && p.sources.length > 0),
      ...collectedFor(id),
    ];
    if (kept.length) sections.push({ id, n: sections.length + 1, title: t[id], paragraphs: kept, ...(open ? { open } : {}) });
  };

  const names = f.solutions.map(s => s.label);
  const where = [f.place.siteName, f.place.bairro].filter(Boolean).join(', ');
  // "3 unidade(s)" is what a form says. The ficha knows the noun — hortas,
  // cisternas, árvores — and a document that has it should use it.
  const unitNoun = (n: number): string => {
    for (const s of f.solutions) {
      const c = SOLUTION_COSTS[s.id];
      if (!c?.unitPt) continue;
      const word = pt
        ? (n === 1 ? c.unitPt : c.unitPluralPt)
        : (n === 1 ? c.unitEn : c.unitPluralEn);
      if (word) return word;
    }
    return pt ? (n === 1 ? 'unidade' : 'unidades') : (n === 1 ? 'unit' : 'units');
  };
  const size = f.place.areaM2
    ? pt ? `${f.place.areaM2.toLocaleString('pt-BR')} m²` : `${f.place.areaM2.toLocaleString('en-US')} m²`
    : f.place.units
      ? `${f.place.units} ${unitNoun(f.place.units)}`
      : null;

  // ── 1 · Resumo ────────────────────────────────────────────────────────────
  // ⚠️ Written last, read first. Phase 2 replaces this paragraph — it is the
  // one place where a sentence a person would actually say beats a sentence a
  // template can assemble.
  push('resumo', [
    names.length
      ? P(
          pt
            ? `A ${f.org.name} propõe ${names.join(' e ')}${where ? ` em ${where}` : ''}${size ? `, sobre ${size}` : ''}${f.problem.worryLabel ? `, em resposta ${toThe(f.problem.worryLabel, lang)}` : ''}.`
            : `${f.org.name} proposes ${names.join(' and ')}${where ? ` at ${where}` : ''}${size ? `, over ${size}` : ''}${f.problem.worryLabel ? `, in response to ${f.problem.worryLabel}` : ''}.`,
          [pt ? 'Encontros 2 e 3' : 'Encontros 2 and 3'],
        )
      : null,
    P(pt ? STATE_SENTENCE[f.verdict].pt : STATE_SENTENCE[f.verdict].en, [
      pt ? 'veredito derivado das fichas e do registro' : 'verdict derived from the fichas and the record',
    ]),
    f.totals.lowBrl != null
      ? P(
          pt
            ? `Custo estimado da obra: ${brl(f.totals.lowBrl, lang)}–${brl(f.totals.highBrl ?? f.totals.lowBrl, lang)}${f.delivery.timeframe ? `, em ${f.delivery.timeframe}` : ''}. A faixa não representa recurso disponível: é a ordem de grandeza para pedir cotação e para inscrever o projeto num edital.`
            : `Estimated works cost: ${brl(f.totals.lowBrl, lang)}–${brl(f.totals.highBrl ?? f.totals.lowBrl, lang)}${f.delivery.timeframe ? `, over ${f.delivery.timeframe}` : ''}. The range does not represent available funds: it is the order of magnitude for requesting a quote and for entering a funding call.`,
          [pt ? 'preço publicado nas fichas × área desenhada' : "published ficha prices × the drawn area"],
          'figure',
        )
      : null,
  ]);

  // ── 2 · A organização e o território ──────────────────────────────────────
  const orgBits: string[] = [];
  if (f.org.contact) orgBits.push(pt ? `contato: ${f.org.contact}${f.org.contactRole ? `, ${f.org.contactRole}` : ''}` : `contact: ${f.org.contact}${f.org.contactRole ? `, ${f.org.contactRole}` : ''}`);
  if (f.org.yearsPresent) orgBits.push(pt ? `${f.org.yearsPresent} anos de presença no território` : `${f.org.yearsPresent} years present in the território`);
  if (f.org.teamSize) orgBits.push(pt ? `${f.org.teamSize} pessoas` : `${f.org.teamSize} people`);
  if (f.org.fundedBefore) {
    orgBits.push(
      pt
        ? `já executou projeto financiado${f.org.largestBudget ? ` (maior: ${f.org.largestBudget})` : ''}`
        : `has delivered a funded project${f.org.largestBudget ? ` (largest: ${f.org.largestBudget})` : ''}`,
    );
  }
  const terr: string[] = [];
  if (f.territory.population) {
    terr.push(pt
      ? `${f.place.bairro} tem cerca de ${f.territory.population.toLocaleString('pt-BR')} moradores`
      : `${f.place.bairro} has around ${f.territory.population.toLocaleString('en-US')} residents`);
  }
  if (f.territory.povertyPct) {
    terr.push(pt
      ? `${f.territory.povertyPct.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}% em situação de pobreza`
      : `${f.territory.povertyPct.toFixed(1)}% living in poverty`);
  }
  const hazards = ([['floodPct', pt ? 'alagamento' : 'flooding'], ['heatPct', pt ? 'calor' : 'heat'], ['landslidePct', pt ? 'deslizamento' : 'landslide']] as const)
    .map(([k, label]) => {
      const v = f.territory[k];
      return v && v >= 50 ? (pt ? `${label} (${v}º percentil)` : `${label} (${v}th percentile)`) : null;
    })
    .filter(Boolean) as string[];
  // ⚠️ Legal status leads, because it is the first thing a funder checks and it
  // decides eligibility before anything else on the page matters.
  const identity = [f.org.legalStatus, ...orgBits].filter(Boolean);
  push('organizacao', [
    identity.length ? P(`**${f.org.name}** — ${identity.join(' · ')}.`, ['Encontro 1']) : P(`**${f.org.name}**`, ['Encontro 1']),
    // Their own sentence about what the organisation is for.
    f.org.mission ? P(f.org.mission, [pt ? 'missão, nas palavras da organização (Encontro 1)' : "mission, in the organisation's own words (Encontro 1)"], 'quote') : null,
    f.org.activities || f.org.groupsServed
      ? P(
          [
            f.org.activities ? (pt ? `Atua em: ${f.org.activities}` : `Works on: ${f.org.activities}`) : null,
            f.org.groupsServed ? (pt ? `Atende: ${f.org.groupsServed}` : `Serves: ${f.org.groupsServed}`) : null,
          ].filter(Boolean).join('. ') + '.',
          ['Encontro 1'],
        )
      : null,
    f.org.nbsExperience
      ? P(
          pt ? `Experiência anterior com soluções baseadas na natureza: ${f.org.nbsExperience}.` : `Prior experience with nature-based solutions: ${f.org.nbsExperience}.`,
          ['Encontro 1'],
        )
      : null,
    terr.length
      ? P(`${terr.join('; ')}.`, [pt ? 'dados oficiais do município' : 'official municipal data'], 'figure')
      : null,
    hazards.length
      ? P(
          pt
            ? `Na comparação com os demais bairros de Porto Alegre, o território está entre os mais expostos a ${hazards.join(', ')}. A média é do bairro inteiro e situa o projeto; não descreve o terreno.`
            : `Compared with the rest of Porto Alegre, the território is among the most exposed to ${hazards.join(', ')}. The average is for the whole neighbourhood and situates the project; it does not describe the site.`,
          [pt ? 'percentis de risco do município' : 'municipal risk percentiles'],
          'figure',
        )
      : null,
  ]);

  // ── 3 · O problema ────────────────────────────────────────────────────────
  push('problema', [
    f.problem.story ? P(f.problem.story, [pt ? 'palavras da organização, Encontro 2' : "the organisation's own words, Encontro 2"], 'quote') : null,
    f.problem.whyHere ? P(f.problem.whyHere, [pt ? 'palavras da organização, Encontro 3' : "the organisation's own words, Encontro 3"], 'quote') : null,
    f.problem.baseline && f.problem.baseline !== f.problem.story
      ? P(f.problem.baseline, [pt ? 'linha de base registrada antes da obra' : 'baseline recorded before any works'], 'quote')
      : null,
    // ⚠️ Our reading, said to be ours. The organisation photographed the ground
    // and sent what it had already written; this is what a pass saw in that
    // material, and it is attributed rather than blended into their account.
    // Never presented as a statement they made — see docs/document-register.md.
    ...f.observations.map(o =>
      P(
        pt ? `${o.text} _(leitura nossa — ${o.basedOn})_` : `${o.text} _(our reading — ${o.basedOn})_`,
        [pt ? `leitura do material enviado · ${o.basedOn}` : `a reading of what was sent · ${o.basedOn}`],
      ),
    ),
  ], !f.problem.story);

  // ── 4 · A intervenção proposta ────────────────────────────────────────────
  push('intervencao', [
    ...f.solutions.map(s =>
      P(`**${s.label}** — ${s.whatItIs}`, [`ficha ${s.id}`]),
    ),
    size || f.delivery.buildModel
      ? P(
          [
            size ? (pt ? `Dimensão: ${size}` : `Size: ${size}`) : null,
            f.delivery.buildModel ? (pt ? `Execução: ${f.delivery.buildModel}` : `Delivery: ${f.delivery.buildModel}`) : null,
            f.delivery.timeframe ? (pt ? `Prazo: ${f.delivery.timeframe}` : `Timeframe: ${f.delivery.timeframe}`) : null,
            f.place.tenure
              ? pt
                ? `Terreno: ${f.place.tenure.replace(/^(sim|n[ãa]o),?\s*/i, '')}`
                : `Land: ${f.place.tenure.replace(/^(yes|no),?\s*/i, '')}`
              : null,
          ].filter(Boolean).join(' · ') + '.',
          [pt ? 'respostas da organização e contorno do Encontro 3' : "the organisation's answers and the Encontro 3 outline"],
        )
      : null,
  ], !size);

  // ── 5 · Por que esta solução aqui ─────────────────────────────────────────
  // ⚠️ The argued section, and the one phase 2 exists for: the ficha's
  // mechanism set against THIS site's conditions. Assembled here; written there.
  // ⚠️ The claim "this answers YOUR problem" is only made for a solution whose
  // catalogued mechanism actually addresses the worry they named. The first
  // version asserted it for every solution on the list, so a row of shade trees
  // was described as the answer to water that pools — a fluent wrong sentence,
  // produced by a TEMPLATE rather than a model, in the section a funder reads
  // most closely. Where the mechanism does not match, the site is still named
  // and the claim is not.
  const answersTheWorry = (id: string) => {
    const named = (f.problem.worry ?? '').split(',').map(v => v.trim()).filter(Boolean);
    return (SOLUTION_MECHANISMS[id] ?? []).some(m => named.includes(m));
  };
  const siteClause = pt
    ? `No terreno da organização${f.place.currentUse ? ` — ${f.place.currentUse.toLowerCase()}` : ''}${size ? `, ${size}` : ''}`
    : `On the organisation's site${f.place.currentUse ? ` — ${f.place.currentUse.toLowerCase()}` : ''}${size ? `, ${size}` : ''}`;
  // ⚠️ The decisive detail, printed as the exchange it was. "Mais barro, a água
  // empoça" means nothing without the question it answers, and this is the
  // sentence that turns a description of a solution into an argument about THIS
  // site. See shared/w3-detail-questions.ts.
  const detailAsked = String(input.w3?.detail_question_id ?? '').trim();
  const detailAnswer = String(input.w3?.detail_answer ?? '').trim();
  const detailQ = detailAsked
    ? Object.values({ ...DECISIVE_DETAIL, ...CONCRETE_INSTANCE }).find(q => q.id === detailAsked)
    : null;

  push('porque', [...f.solutions.map(s =>
    s.howItWorks
      ? P(
          `**${s.label}.** ${s.howItWorks}${
            answersTheWorry(s.id) && f.problem.worryLabel
              ? pt
                ? ` ${siteClause} — é esse o mecanismo que responde ${toThe(f.problem.worryLabel, lang)}.`
                : ` ${siteClause} — that is the mechanism answering ${f.problem.worryLabel}.`
              : pt
                ? ` ${siteClause} — a ficha não classifica esta solução como resposta ao risco que a organização nomeou; ela entra pelo efeito descrito acima.`
                : ` ${siteClause} — the catalogue does not classify this solution as an answer to the risk the organisation named; it is here for the effect described above.`
          }`,
          [`ficha ${s.id} · comoFunciona`, pt ? 'mecanismos catalogados × registro do lugar' : 'catalogued mechanisms × the site record'],
        )
      : null,
  ),
    // ⚠️ The document's framing, never the chat's question. The chat asks "o chão
    // aí, quando VOCÊS cavam"; the page states what the organisation described.
    detailQ && detailAnswer
      ? P(
          (pt ? detailQ.notePt : detailQ.noteEn).replace('{answer}', detailAnswer),
          [pt ? 'pergunta do Encontro 3 e resposta da organização' : 'an Encontro 3 question and the organisation’s answer'],
        )
      : null,
  ]);

  // ── 6 · Resultados esperados ──────────────────────────────────────────────
  push('resultados', [
    ...f.solutions.map(s =>
      s.benefit
        ? P(
            // ⚠️ A claim with no figure has to SAY it has no figure. Printed
            // beside a solution that does carry one, an unqualified sentence
            // reads as a measured result rather than a description.
            `**${s.label}.** ${s.benefit.headline ? `${s.benefit.headline} ` : ''}${s.benefit.claim}` +
              (s.benefit.headline
                ? ''
                : pt
                  ? ' A base de evidências não traz um número de referência para esta solução — fica registrado como medição a buscar.'
                  : ' The evidence base carries no reference figure for this solution — recorded as a measurement to seek.'),
            [s.benefit.source],
            s.benefit.headline ? 'figure' : 'written',
          )
        : P(
            pt
              ? `**${s.label}.** A base de evidências não traz um número de referência para esta solução — fica registrado como medição a buscar.`
              : `**${s.label}.** The evidence base carries no reference figure for this solution — recorded as a measurement to seek.`,
            [pt ? 'base de evidências — lacuna nomeada' : 'evidence base — named gap'],
          ),
    ),
    // One statement, one source line. Eight paragraphs each repeating the same
    // provenance is noise around the only figure that puts the project in
    // proportion.
    f.scale
      ? P((pt ? f.scale.linesPt : f.scale.linesEn).join('\n\n'), [
          pt ? 'volumes de referência da Bacia do Sarandi' : 'reference volumes for the Bacia do Sarandi',
        ], 'figure')
      : null,
  ], f.solutions.some(s => !s.benefit));

  // ── 7 · O que o projeto exige ─────────────────────────────────────────────
  // ⚠️ The section that earns the whole document. No organisation writes "a
  // planting request filed after August only comes through in May of the
  // following year" into its own application — and it is the line that decides
  // the calendar. See shared/nbs-approvals.ts.
  const exige: Array<Paragraph | null> = [];
  for (const s of f.solutions) {
    if (s.study) {
      exige.push(P(
        pt
          ? `**${s.label} — estudo técnico.** O desenho não se resolve com o conhecimento da comunidade: precisa de ${s.study.needs}.${s.study.costLine ? ` ${s.study.costLine}` : ''}`
          : `**${s.label} — technical study.** The design cannot be settled from community knowledge: it needs ${s.study.needs}.${s.study.costLine ? ` ${s.study.costLine}` : ''}`,
        [`ficha ${s.id} · quemPrecisaDizerSim`],
      ));
    }
    if (s.approval) {
      const doors = s.approval.bodies.map(b => `**${b.name}** (${b.what})`).join('; ');
      exige.push(P(
        pt
          ? `**${s.label} — autorização.** ${doors}.${s.approval.instrument ? ` O instrumento é o ${s.approval.instrument}.` : ''}`
          : `**${s.label} — authorisation.** ${doors}.${s.approval.instrument ? ` The instrument is ${s.approval.instrument}.` : ''}`,
        [`ficha ${s.id} · quemPrecisaDizerSim`],
      ));
      // ⚠️ How the permission is actually asked for — the channel, the
      // department that really handles it, the stated processing time. Not in
      // any ficha, and the difference between an organisation knocking on the
      // right door and the wrong one. See nbs-knowledge.ts.
      if (s.approval.route) {
        exige.push(P(
          pt ? `**Como se pede.** ${s.approval.route}` : `**How it is requested.** ${s.approval.route}`,
          [pt ? 'base de conhecimento — rota de aprovação publicada' : 'knowledge base — published approval route'],
        ));
      }
      if (s.approval.prohibition) exige.push(P(s.approval.prohibition, [`ficha ${s.id}`]));
      if (s.approval.timing) {
        exige.push(P(
          pt ? `⚠️ Calendário: ${s.approval.timing}` : `⚠️ Calendar: ${s.approval.timing}`,
          [`ficha ${s.id}`],
        ));
      }
    }
    if (!s.study && !s.approval) {
      exige.push(P(
        pt
          ? `**${s.label}.** A ficha não registra exigência de estudo nem de autorização externa para este arranjo de terreno.`
          : `**${s.label}.** The ficha records neither a study nor an external authorisation for this land arrangement.`,
        [`ficha ${s.id} · quemPrecisaDizerSim`],
      ));
    }
  }
  push('exige', exige);

  // ── 8 · Custo estimado e contrapartida ────────────────────────────────────
  push('custo', [
    ...f.solutions.map(s => (s.cost ? P(`**${s.label}.** ${s.cost.note}`, [pt ? 'preço publicado na ficha' : "the ficha's published price"], 'figure') : null)),
    // The budget note already carries this warning for most solutions; adding
    // ours unconditionally printed it twice, word for word, under the figure.
    ...f.solutions.map(s =>
      s.cost?.buildModelCaveat && !/execu[çc][ãa]o contratada|contracted work/i.test(s.cost.note)
        ? P(`⚠️ ${s.cost.buildModelCaveat}`, [`ficha ${s.id} · quantoCusta`])
        : null,
    ),
    f.totals.lowBrl != null
      ? P(
          pt
            ? `Total estimado da obra: ${brl(f.totals.lowBrl, lang)}–${brl(f.totals.highBrl ?? f.totals.lowBrl, lang)}. A faixa não representa recurso disponível.`
            : `Estimated works total: ${brl(f.totals.lowBrl, lang)}–${brl(f.totals.highBrl ?? f.totals.lowBrl, lang)}. The range does not represent available funds.`,
          [pt ? 'soma das faixas publicadas' : 'sum of the published ranges'],
          'figure',
        )
      : null,
    f.contribution.length
      ? P(
          pt
            ? `Contrapartida da organização: ${f.contribution.join('; ')}. Não incluída na faixa acima, e declarável em qualquer edital.`
            : `The organisation's counterpart contribution: ${f.contribution.join('; ')}. Not included in the range above, and declarable in any funding call.`,
          [pt ? 'Encontros 1 e 3' : 'Encontros 1 and 3'],
        )
      : null,
  ], f.totals.lowBrl == null);

  // ── 9 · Caminhos de financiamento ─────────────────────────────────────────
  // ⚠️ The workshop of 26 August told eighteen organisations, once, in a room,
  // what the funding landscape actually looks like. The record already holds
  // what decides eligibility for most of it — a CNPJ, a previous funded
  // project, the size of this one. Matching one against the other is the
  // consulting the deck asks for and no organisation can do alone, because it
  // requires knowing what the deck knows. See shared/funding-sources.ts.
  const matches = fundingMatches(
    {
      ...(input.org?.has_cnpj != null ? { hasCnpj: /^(sim|yes)/i.test(String(input.org.has_cnpj)) } : {}),
      hasTrackRecord: f.org.fundedBefore,
      ...(f.totals.lowBrl != null ? { costLowBrl: f.totals.lowBrl, costHighBrl: f.totals.highBrl } : {}),
    },
    lang,
  );
  const open = matches.filter(m => !m.blocked);
  const blocked = matches.filter(m => m.blocked);
  const fundingSource = [
    pt
      ? 'oficina de financiamento COUGAR · PxG ↔ OEF ↔ BwB, 26 de agosto de 2026'
      : 'COUGAR funding workshop · PxG ↔ OEF ↔ BwB, 26 August 2026',
  ];
  // ⚠️ Its own citation, and deliberately not the funding workshop's. A reader
  // who wants to check the count is asking about the cohort, not about the
  // deck — and naming the source as counts states, on the page, that no
  // organisation was identified to produce it.
  const cohortSource = [
    pt
      ? 'grupo COUGAR — contagens do próprio grupo, sem identificação das organizações'
      : 'COUGAR group — counts across the group itself, no organisation identified',
  ];
  push('financiamento', [
    // Which KIND of money this asks for, in the deck's own words — the first
    // thing a funder reading a concept note needs settled about it.
    P(pt ? PHILANTHROPIC_VS_COMMERCIAL.pt : PHILANTHROPIC_VS_COMMERCIAL.en, fundingSource),
    P(pt ? AGGREGATION_ARGUMENT.pt : AGGREGATION_ARGUMENT.en, fundingSource),
    // ⚠️ And here the argument stops being general. The paragraph above is the
    // deck's case for aggregating a portfolio; these lines are the evidence
    // that THIS project is part of one — the same study three organisations
    // need, the same approval instrument, the same barrier. It is the one thing
    // an organisation cannot write about itself, and the reason the programme
    // exists rather than eighteen separate applications.
    f.cohort.length
      ? P(
          pt ? 'Este projeto não chega sozinho. No mesmo grupo:' : 'This project does not arrive alone. Within the same group:',
          cohortSource,
        )
      : null,
    // ⚠️ Bullets, not one paragraph. Six counts run together read as a wall and
    // the third one is lost; a funder scanning the page is counting, and each
    // line is a separate count of a separate thing.
    ...f.cohort.map(line => P(line, cohortSource, 'bullet')),
    ...open.map(m =>
      P(
        `**${m.path.name}** (${pt ? FUNDER_KIND_LABEL[m.path.kind].pt : FUNDER_KIND_LABEL[m.path.kind].en}${m.path.reembolsavel ? '' : pt ? ', não reembolsável' : ', non-reimbursable'}). ` +
          `${pt ? m.path.notePt : m.path.noteEn}` +
          ((pt ? m.path.sizePt : m.path.sizeEn) ? ` ${pt ? 'Porte' : 'Size'}: ${pt ? m.path.sizePt : m.path.sizeEn}.` : '') +
          (m.fit ? ` ${m.fit}` : ''),
        fundingSource,
      ),
    ),
    // ⚠️ Named, not hidden. An organisation that cannot yet meet a criterion is
    // better off knowing which one and why — "histórico comprovado" is a thing
    // this project itself starts to build.
    blocked.length
      ? P(
          (pt
            ? 'Fora de alcance por enquanto, e por um motivo que o próprio projeto começa a resolver: '
            : 'Out of reach for now, for a reason this project itself starts to solve: ') +
            blocked.map(m => `**${m.path.name}** — ${m.fit}`).join(' '),
          fundingSource,
        )
      : null,
    P(pt ? FUNDING_CAVEAT.pt : FUNDING_CAVEAT.en, fundingSource),
  ]);

  // ── 10 · Manutenção e recursos recorrentes ────────────────────────────────
  const upkeep: string[] = [];
  if (f.delivery.maintainer) upkeep.push(pt ? `Quem cuida: ${f.delivery.maintainer}` : `Who looks after it: ${f.delivery.maintainer}`);
  if (f.delivery.frequency) upkeep.push(pt ? `Frequência: ${f.delivery.frequency}` : `How often: ${f.delivery.frequency}`);
  if (f.delivery.recurringMoney) upkeep.push(pt ? `Recurso recorrente: ${f.delivery.recurringMoney}` : `Recurring resource: ${f.delivery.recurringMoney}`);
  if (f.delivery.monitoring) upkeep.push(pt ? `Medição: ${f.delivery.monitoring}` : `Measurement: ${f.delivery.monitoring}`);
  push('manutencao', [
    upkeep.length ? P(upkeep.join(' · ') + '.', [pt ? 'respostas da organização' : "the organisation's answers"]) : null,
    // ⚠️ The ficha's own account of what upkeep actually costs in practice —
    // survival rates, what the city does not do, what a mower destroys. It is
    // the least optimistic and most useful paragraph available, and it has
    // never appeared in anything the organisation takes away.
    ...f.solutions.map(s => (s.upkeep ? P(`**${s.label}.** ${s.upkeep}`, [`ficha ${s.id} · quemCuidaDepois`]) : null)),
  ], !f.delivery.recurringMoney || /indefinido/i.test(input.w3?.sustainability_model ?? ''));

  // ── 10 · Pendências e próximos passos ─────────────────────────────────────
  push('pendencias', [
    ...f.gaps.map(g => P(g.charAt(0).toUpperCase() + g.slice(1), [pt ? 'lacuna nomeada no fechamento' : 'gap named at the close'], 'bullet')),
    ...f.steps.map(s =>
      P(`${s.n}. ${s.title} — ${s.owner === 'org' ? (s.ownerName ?? (pt ? 'a organização' : 'the organisation')) : (pt ? 'coordenação' : 'coordination')}${s.blockedBy ? ` · ${s.blockedBy}` : ''}`,
        [pt ? 'rota derivada do registro' : 'route derived from the record'], 'bullet'),
    ),
  ], f.gaps.length > 0);

  // ⚠️ The hole the `push` hook alone would leave. A section is only pushed when
  // it has something to say; a section that had nothing of its own would take
  // its collected answers down with it — which is exactly the class of silent
  // loss this whole mechanism exists to end. So anything that fed a section
  // nobody built gets its own section, in the registry's order.
  for (const id of SECTION_ORDER) {
    if (placed.has(id)) continue;
    const orphaned = collectedFor(id);
    if (orphaned.length) sections.push({ id, n: sections.length + 1, title: t[id], paragraphs: orphaned });
  }

  return {
    title: names.join(' + ') || (pt ? 'Projeto sem solução escolhida' : 'Project with no solution chosen'),
    subtitle: [where, f.org.name].filter(Boolean).join(' — '),
    state: f.verdict,
    sections,
    facts: f,
  };
}

// ── The authoring contract ──────────────────────────────────────────────────
// Phase 2 lets a model WRITE three sections. Everything below is the part that
// does not trust it: what it may write, what it may cite, and what happens to a
// paragraph that fails either test. It is pure, so it is testable without a
// model — which is the only way to know the guards bite.

/** The sections worth writing rather than assembling. */
export const AUTHORABLE_SECTIONS: ConceptSectionId[] = ['resumo', 'porque', 'resultados'];

/** A paragraph proposed by the authoring pass, before any of it is believed. */
export interface AuthoredCandidate {
  section: string;
  text: string;
  sources: string[];
}

export interface AuthoringResult {
  note: ConceptNote;
  accepted: number;
  /** Every rejection, with the reason — this is what gets logged and read. */
  rejected: Array<{ text: string; why: string }>;
}

/** Digits as the fact base holds them: no thousands separators, decimal point. */
const normNum = (s: string) => s.replace(/\.(?=\d{3}\b)/g, '').replace(',', '.').replace(/\.$/, '');

/**
 * Numbers written as words, because a guard that only reads digits is half a
 * guard.
 *
 * ⚠️ Found live: the writing pass, handed cohort counts of 7 and 6, wrote
 * "outras oito organizações do mesmo grupo esbarram nas mesmas barreiras" — in
 * a cohort of eight, where seven others is the ceiling. Every digit-based check
 * passed it, because "oito" has no digits, and the sentence is a claim about
 * OTHER organisations in a document that goes to a funder.
 */
const NUMBER_WORDS: Record<string, string> = {
  um: '1', uma: '1', dois: '2', duas: '2', 'três': '3', tres: '3', quatro: '4', cinco: '5',
  seis: '6', sete: '7', oito: '8', nove: '9', dez: '10', onze: '11', doze: '12', treze: '13',
  quatorze: '14', catorze: '14', quinze: '15', dezesseis: '16', dezessete: '17', dezoito: '18',
  dezenove: '19', vinte: '20',
  one: '1', two: '2', three: '3', four: '4', five: '5', six: '6', seven: '7', eight: '8',
  nine: '9', ten: '10', eleven: '11', twelve: '12', thirteen: '13', fourteen: '14',
  fifteen: '15', sixteen: '16', seventeen: '17', eighteen: '18', nineteen: '19', twenty: '20',
};

/**
 * How many organisations a sentence claims, whether it says 3 or "três".
 *
 * Only counts of ORGANISATIONS. This is not a general word-number guard — "as
 * duas soluções combinadas" is a true and useful sentence, and a blanket rule
 * would throw it away for a cardinality nobody needs to source. What cannot be
 * loose is a count of other people: it is the programme's whole argument, and
 * an inflated one is a false statement about organisations that never saw the
 * page it appears on.
 */
export function claimedOrgCounts(text: string): string[] {
  const out: string[] = [];
  const re = /(\d+|[a-zà-ú]+)\s+(?:outr[ao]s?\s+|other\s+)?(organiza[çc][õo]es|organiza[çc][ãa]o|organisations?|organizations?)\b/gi;
  for (const m of Array.from(text.matchAll(re))) {
    const raw = m[1].toLowerCase();
    const n = /^\d+$/.test(raw) ? raw : NUMBER_WORDS[raw.normalize('NFC')];
    if (n) out.push(n);
  }
  return out;
}

/**
 * Every figure the facts actually contain, in normalised form.
 *
 * ⚠️ The guard that matters most. A model writing a funder document will reach
 * for a number to make a sentence land — "atende cerca de 400 crianças" — and
 * nobody reading the page can tell an invented figure from a sourced one. So a
 * numeral that does not appear in the fact base disqualifies the paragraph that
 * carries it, rather than being corrected or trusted.
 */
export function factNumbers(facts: ConceptNoteFacts): Set<string> {
  const out = new Set<string>();
  const walk = (v: unknown) => {
    if (v == null) return;
    if (typeof v === 'number') { out.add(normNum(String(v))); return; }
    if (typeof v === 'string') {
      for (const m of v.match(/\d[\d.,]*/g) ?? []) out.add(normNum(m));
      return;
    }
    if (Array.isArray(v)) { v.forEach(walk); return; }
    if (typeof v === 'object') { Object.values(v as Record<string, unknown>).forEach(walk); }
  };
  walk(facts);
  return out;
}

/** The only citations the pass may use: the sources the assembly already found. */
export function allowedSources(note: ConceptNote): Set<string> {
  return new Set(note.sections.flatMap(s => s.paragraphs.flatMap(p => p.sources)));
}

/**
 * Take what survives, keep what does not.
 *
 * Rules, in order — and every one drops a PARAGRAPH, never the reply. A schema
 * constraint on a one-shot call is a total-loss constraint: it is how an
 * `orgNames.min(2)` once discarded an entire cohort narrative.
 *
 * A section for which nothing survives keeps its assembled paragraphs, so the
 * document never gets shorter for having tried.
 */
export function acceptAuthored(
  note: ConceptNote,
  candidates: AuthoredCandidate[],
  lang: Lang = 'pt',
): AuthoringResult {
  const numbers = factNumbers(note.facts);
  const sources = allowedSources(note);
  // The only counts of other organisations that exist: the ones the cohort
  // lines state. Empty when this organisation has nothing in common with the
  // group — and then any such claim is invented, which is right.
  const orgCounts = new Set((note.facts.cohort ?? []).flatMap(l => claimedOrgCounts(l)));
  const rejected: AuthoringResult['rejected'] = [];
  const kept = new Map<ConceptSectionId, Paragraph[]>();

  for (const c of candidates ?? []) {
    const text = String(c?.text ?? '').trim();
    const id = String(c?.section ?? '').trim() as ConceptSectionId;
    const drop = (why: string) => rejected.push({ text: text.slice(0, 80), why });

    if (!AUTHORABLE_SECTIONS.includes(id)) { drop(`seção fora do contrato: "${c?.section}"`); continue; }
    if (text.length < 20) { drop('parágrafo vazio ou curto demais'); continue; }
    if (text.length > 1600) { drop('parágrafo longo demais para um bloco'); continue; }
    // The register is not negotiable — docs/document-register.md.
    if (/\bvoc[eê]s\b|\bvcs\b|\ba gente\b|\byour\b|\byou\b/i.test(text)) { drop('segunda pessoa'); continue; }
    // ⚠️ Our machinery, named to someone who has never seen it. "Não consta do
    // registro" and "o veredito do processo" are words from inside the system;
    // a funder reading the page does not know what registro or veredito mean,
    // and the same fact has a plain form — "a organização não informou", "não há
    // medição disponível". Same rule as the ↻ lines, in a new place.
    const machine = /\bveredito\b|\bbase de dados\b|(^|\s)(o|do|no)\s+registro(?!\s+(fotogr[áa]fico|de\b))/i.exec(text);
    if (machine) { drop(`nomeia a máquina: "${machine[0].trim()}"`); continue; }
    // A number nobody handed it.
    const invented = (text.match(/\d[\d.,]*/g) ?? []).map(normNum).filter(n => n.length > 0 && !numbers.has(n));
    if (invented.length) { drop(`número que não está no registro: ${invented.join(', ')}`); continue; }
    // ⚠️ A count of OTHER organisations, checked against the cohort layer and
    // nothing else. "8" appearing somewhere in the fact base does not license
    // "outras oito organizações" — the number has to be one of the counts the
    // cohort lines actually state, or there is no such group.
    const claimed = claimedOrgCounts(text).filter(n => !orgCounts.has(n));
    if (claimed.length) { drop(`contagem de organizações que ninguém apurou: ${claimed.join(', ')}`); continue; }
    const cited = (c.sources ?? []).map(String).filter(s => sources.has(s));
    if (!cited.length) { drop('sem fonte reconhecida'); continue; }

    kept.set(id, [...(kept.get(id) ?? []), { text, kind: 'written', sources: cited, authored: true }]);
  }

  const sections = note.sections.map(s =>
    kept.has(s.id) ? { ...s, paragraphs: kept.get(s.id)! } : s,
  );
  return {
    note: { ...note, sections },
    accepted: Array.from(kept.values()).reduce((n, ps) => n + ps.length, 0),
    rejected,
  };
}

/**
 * Re-apply prose written at the close of the session to a note rebuilt now.
 *
 * ⚠️ Run through the same guards, not trusted because it passed once. The note
 * is rebuilt from live state on every request, so an organisation that
 * corrected its area after the session gets a new cost band — and an authored
 * sentence quoting the old one is a sentence that is now wrong. Re-validating
 * against the CURRENT facts drops exactly those and keeps the rest, so paper
 * and screen cannot disagree in prose either.
 */
export function applyStoredAuthoring(note: ConceptNote, stored: string | undefined, lang: Lang = 'pt'): AuthoringResult {
  if (!stored?.trim()) return { note, accepted: 0, rejected: [] };
  try {
    const parsed = JSON.parse(stored) as Array<{ section: string; paragraphs: Array<{ text: string; sources: string[] }> }>;
    const candidates: AuthoredCandidate[] = (parsed ?? []).flatMap(s =>
      (s?.paragraphs ?? []).map(p => ({ section: s.section, text: p.text, sources: p.sources ?? [] })),
    );
    return acceptAuthored(note, candidates, lang);
  } catch {
    return { note, accepted: 0, rejected: [{ text: '', why: 'stored authoring did not parse' }] };
  }
}

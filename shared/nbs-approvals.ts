// ============================================================================
// WHAT THE PROJECT REQUIRES — the approvals, read out of the fichas
// ============================================================================
// `studyRequirement()` already reads one thing out of a ficha's prose: the
// technical study. This reads the other, and it is the half that decides a
// calendar rather than a budget.
//
// ⚠️ It exists because a real run closed with the verdict "Nada trava esse
// projeto daqui" printed three lines under its own ficha saying, of the same
// solution, "a rua é pública — plantar sem autorização da SMAMUS é proibido"
// and that a request filed after August only comes through in MAY OF THE
// FOLLOWING YEAR. `computeVerdict` derived `needs_permission` from land tenure
// alone; tenure answers *may we use this land*, and the ficha answers *may we
// do this thing here*. For a street planting those are different questions with
// different doors, and only one of them was being asked. (backlog #42)
//
// It is also the backbone of the concept note's most valuable section. No
// organisation writes "a request filed after August comes through in May" into
// its own funding application — it is the single most decision-changing line
// available to us, and until now it appeared nowhere outside the ficha card.
//
// Everything here is EXTRACTED, never authored: every field is a span of a
// ficha sentence, and the load-time invariant at the bottom fails the build if
// a ficha is rewritten in a way this stops recognising.
// ============================================================================

import { NBS_SOLUTIONS, getSolution } from './nbs-catalog';
import { getSolutionFicha } from './nbs-solution-fichas';

/** An institution that has to say yes, and what it is — an org may not know. */
export interface ApprovalBody {
  id: string;
  name: string;
  /** One line on what this body actually does. */
  whatPt: string;
  whatEn: string;
}

const BODIES: Array<ApprovalBody & { re: RegExp }> = [
  {
    id: 'smamus', name: 'SMAMUS', re: /SMAMUS/i,
    whatPt: 'a secretaria municipal de meio ambiente e urbanismo de Porto Alegre — responde por praças, áreas verdes e arborização',
    whatEn: "Porto Alegre's municipal environment and urbanism secretariat — responsible for squares, green areas and street trees",
  },
  {
    id: 'dmae', name: 'DMAE', re: /DMAE/i,
    whatPt: 'o departamento municipal de água e esgotos — responde por drenagem, saneamento e corpos d’água',
    whatEn: 'the municipal water and sewage department — responsible for drainage, sanitation and water bodies',
  },
  {
    id: 'eptc', name: 'EPTC', re: /EPTC/i,
    whatPt: 'a empresa pública de transporte e circulação — responde por qualquer obra que mexa em via ou calçada',
    whatEn: 'the public transport and circulation company — responsible for anything that touches a road or pavement',
  },
  {
    id: 'defesa-civil', name: 'Defesa Civil', re: /Defesa Civil/i,
    whatPt: 'libera intervenções em encosta mapeada como área de risco, antes de qualquer obra',
    whatEn: 'clears work on a slope mapped as a risk area, before any construction begins',
  },
  {
    id: 'sema-rs', name: 'SEMA-RS', re: /SEMA-RS/i,
    whatPt: 'a secretaria estadual do meio ambiente — entra quando o licenciamento sobe do município para o estado',
    whatEn: 'the state environment secretariat — takes over when licensing rises from the city to the state',
  },
  {
    id: 'vigilancia-sanitaria', name: 'Vigilância Sanitária', re: /Vigil[âa]ncia Sanit[áa]ria/i,
    whatPt: 'responde por alvará e vistoria de qualquer atividade que envolva alimento ou água de uso coletivo',
    whatEn: 'responsible for the permit and inspection of anything involving food or shared water',
  },
  {
    id: 'crea', name: 'CREA/CAU', re: /CREA|\bART\b|\bRRT\b/,
    whatPt: 'o conselho onde o responsável técnico registra a ART/RRT que responde pelo projeto',
    whatEn: 'the council where the technical lead registers the ART/RRT that carries responsibility for the design',
  },
  {
    id: 'mantenedora-escolar', name: 'SMED / Seduc-RS', re: /SMED|Seduc-RS/i,
    whatPt: 'a mantenedora da escola — municipal (SMED) ou estadual (Seduc-RS)',
    whatEn: 'the school authority — municipal (SMED) or state (Seduc-RS)',
  },
];

/** A named legal instrument, which is what an organisation actually asks for. */
const INSTRUMENTS: Array<{ re: RegExp; pt: string; en: string }> = [
  { re: /Termo de Ado[çc][ãa]o/i, pt: 'Termo de Adoção', en: 'Termo de Adoção (adoption agreement)' },
  { re: /Adote uma Pra[çc]a/i, pt: 'programa Adote uma Praça', en: 'the Adote uma Praça programme' },
  { re: /Termo de Permiss[ãa]o de Uso/i, pt: 'Termo de Permissão de Uso', en: 'Termo de Permissão de Uso (use permit)' },
  { re: /Alvar[áa] de Sa[úu]de/i, pt: 'Alvará de Saúde', en: 'Alvará de Saúde (health permit)' },
  { re: /licenciamento ambiental/i, pt: 'licenciamento ambiental', en: 'environmental licensing' },
  { re: /Portal de Licenciamento/i, pt: 'Portal de Licenciamento da prefeitura', en: "the city's licensing portal" },
  { re: /\bART\b/, pt: 'ART registrada no CREA', en: 'an ART registered with CREA' },
  { re: /\bCAF\b|Cadastro Nacional da Agricultura Familiar/i, pt: 'CAF (Cadastro Nacional da Agricultura Familiar)', en: 'CAF (national family-farming register)' },
];

const sentences = (prose: string): string[] =>
  prose.split(/(?<=[.!?])\s+/).map(s => s.trim()).filter(s => s.length > 3);

/** Sentences that say this may not start without permission. */
const PROHIBITION =
  /proibid|sem exce[çc][ãa]o|n[ãa]o pode|n[ãa]o d[áa] para fazer s[óo]|obrigat[óo]ri|precisa liberar antes|antes de qualquer interven[çc][ãa]o|antes de come[çc]ar|antes de mexer/i;
/** Sentences carrying a season, a month or a duration — the calendar facts. */
const TIMING =
  /\b(janeiro|fevereiro|mar[çc]o|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro)\b|\b\d+\s*(meses|m[êe]s|anos?)\b|ano seguinte|[ée]poca certa/i;

// ── Sentence classification ─────────────────────────────────────────────────
// ⚠️ A ficha's approval prose is not one rule, it is a BRANCH: "Em terreno
// particular, decide o dono do lote… Em praça ou parque público, a aprovação é
// da prefeitura". Reading the paragraph as a whole gets both cases wrong at
// once — it tells the organisation building in its own yard that it needs
// SMAMUS, and it tells the one planting on a public square that the owner
// decides. So each sentence is classified for WHO it applies to and WHAT force
// it carries, and the answer is assembled for the tenure at hand.

/** Which land this sentence is about. */
type Scope = 'public' | 'private' | 'any';
/** What the sentence does about permission. */
type Force = 'required' | 'recommended' | 'exempt' | 'none';

const PUBLIC_LAND =
  /pra[çc]a|parque|[áa]rea verde p[úu]blica|terreno p[úu]blico|espa[çc]o p[úu]blico|[áa]rea p[úu]blica|rua [ée] p[úu]blica|sistema vi[áa]rio|cal[çc]ada|em via|na via|talude p[úu]blico|escola p[úu]blica|lago [ée] p[úu]blico|corpo d[’']?[áa]gua/i;
const PRIVATE_LAND =
  /terreno particular|terreno privado|quintal|estacionamento particular|sua pr[óo]pria laje|dono do lote|dono decide|terreno cedido|terreno privado ou cedido/i;
const EXEMPT =
  /n[ãa]o (exige|precisa de) licen|dispensad[ao] de licen[çc]a|n[ãa]o precisa de licen/i;
const REQUIRED =
  /precisa de|precisa liberar|exige|obrigat[óo]ri|passa por|passa pel|aprova|autoriza[çr]|depende de aprova[çc][ãa]o|proibid|assina um|entra o programa|entra tamb[ée]m licenciamento|segue o mesmo|pe[çc]a a licen[çc]a|tem que autorizar|precisa de autoriza[çc][ãa]o|quem autoriza/i;
const RECOMMENDED = /recomendado|avisar|confirme|vale confirmar|conversar com/i;

interface Clause {
  pt: string;
  en?: string;
  scope: Scope;
  force: Force;
  bodies: ApprovalBody[];
  instrumentsPt: string[];
  instrumentsEn: string[];
}

function classify(pt: string, en: string | undefined): Clause {
  const isPublic = PUBLIC_LAND.test(pt);
  const isPrivate = PRIVATE_LAND.test(pt);
  const scope: Scope = isPublic && !isPrivate ? 'public' : isPrivate && !isPublic ? 'private' : 'any';
  const force: Force = EXEMPT.test(pt)
    ? 'exempt'
    : REQUIRED.test(pt)
      ? 'required'
      : RECOMMENDED.test(pt)
        ? 'recommended'
        : 'none';
  return {
    pt,
    ...(en ? { en } : {}),
    scope,
    force,
    bodies: BODIES.filter(b => b.re.test(pt)).map(({ re, ...b }) => b),
    instrumentsPt: INSTRUMENTS.filter(i => i.re.test(pt)).map(i => i.pt),
    instrumentsEn: INSTRUMENTS.filter(i => i.re.test(pt)).map(i => i.en),
  };
}

export interface ApprovalFacts {
  solutionId: string;
  clauses: Clause[];
  /** Every institution the ficha names, in the order its prose names them. */
  bodies: ApprovalBody[];
  instrumentsPt: string[];
  instrumentsEn: string[];
  /** The sentence saying it may not start without permission. */
  prohibitionPt?: string;
  prohibitionEn?: string;
  /** The sentence carrying a season, a month or a duration. */
  timingPt?: string;
  timingEn?: string;
  source: string;
}

const CACHE = new Map<string, ApprovalFacts | null>();

/** Everything the ficha says about who has to say yes, as structured facts. */
export function approvalFacts(solutionId: string): ApprovalFacts | null {
  if (CACHE.has(solutionId)) return CACHE.get(solutionId)!;
  const ficha = getSolutionFicha(solutionId);
  if (!ficha) {
    CACHE.set(solutionId, null);
    return null;
  }
  const ptS = sentences(ficha.pt.quemPrecisaDizerSim);
  const enS = sentences(ficha.en.quemPrecisaDizerSim);
  // The English twin only when the two languages split into the same number of
  // sentences; a mismatched pair is dropped rather than paired wrongly.
  const clauses = ptS.map((p, i) => classify(p, ptS.length === enS.length ? enS[i] : undefined));

  const uniq = <T extends { id?: string }>(xs: T[], key: (x: T) => string) => {
    const seen = new Set<string>();
    return xs.filter(x => (seen.has(key(x)) ? false : (seen.add(key(x)), true)));
  };
  const prohibition = clauses.find(c => PROHIBITION.test(c.pt));
  const timing = clauses.find(c => TIMING.test(c.pt));

  const facts: ApprovalFacts = {
    solutionId,
    clauses,
    bodies: uniq(clauses.flatMap(c => c.bodies), b => b.id),
    instrumentsPt: Array.from(new Set(clauses.flatMap(c => c.instrumentsPt))),
    instrumentsEn: Array.from(new Set(clauses.flatMap(c => c.instrumentsEn))),
    ...(prohibition ? { prohibitionPt: prohibition.pt, prohibitionEn: prohibition.en } : {}),
    ...(timing ? { timingPt: timing.pt, timingEn: timing.en } : {}),
    source: `ficha ${solutionId} · quemPrecisaDizerSim`,
  };
  CACHE.set(solutionId, facts);
  return facts;
}

/**
 * Tenure where the organisation itself decides about the land.
 *
 * ⚠️ `formal-agreement` is NOT here. A written agreement to use a school yard
 * says the organisation may be on the land; it does not stand in for the
 * Termo de Adoção that SMAMUS signs for a planting on it. Treating the two as
 * the same is what closed a real run on "nada trava esse projeto".
 */
const OWN_LAND = new Set(['private-owned']);

export interface ApprovalRequirement {
  /** The doors, named. */
  bodies: ApprovalBody[];
  instrumentPt?: string;
  instrumentEn?: string;
  prohibitionPt?: string;
  prohibitionEn?: string;
  timingPt?: string;
  timingEn?: string;
  /** Clauses that advise rather than require — printed, never blocking. */
  recommendedPt: string[];
  source: string;
}

/**
 * Does this project need someone outside the organisation to say yes?
 *
 * Assembled from the clauses that apply to THIS organisation's land. Returns
 * null when nothing external is required — their own lot, or a ficha that says
 * outright no licence is needed.
 */
export function approvalRequirement(
  solutionId: string,
  tenure: string | undefined,
): ApprovalRequirement | null {
  const f = approvalFacts(solutionId);
  if (!f) return null;
  const own = OWN_LAND.has(tenure ?? '');
  const applies = (c: Clause) => c.scope === 'any' || (own ? c.scope === 'private' : c.scope === 'public');
  const mine = f.clauses.filter(applies);

  // An exemption that applies to this land, with no requirement beside it.
  const required = mine.filter(c => c.force === 'required' && c.bodies.length);
  if (!required.length) return null;

  const seen = new Set<string>();
  const bodies = required.flatMap(c => c.bodies).filter(b => (seen.has(b.id) ? false : (seen.add(b.id), true)));
  const instrumentPt = required.flatMap(c => c.instrumentsPt)[0];
  const instrumentEn = required.flatMap(c => c.instrumentsEn)[0];
  // Prohibition and timing only when they belong to a clause that applies here.
  const prohibition = mine.find(c => PROHIBITION.test(c.pt));
  const timing = mine.find(c => TIMING.test(c.pt));
  return {
    bodies,
    ...(instrumentPt ? { instrumentPt, instrumentEn } : {}),
    ...(prohibition ? { prohibitionPt: prohibition.pt, prohibitionEn: prohibition.en } : {}),
    ...(timing ? { timingPt: timing.pt, timingEn: timing.en } : {}),
    recommendedPt: mine.filter(c => c.force === 'recommended').map(c => c.pt),
    source: f.source,
  };
}

// ── The invariant ───────────────────────────────────────────────────────────
// Every solution's ficha has to yield SOMETHING here: a body that must approve,
// or an explicit statement that no licence is needed. A ficha that yields
// neither has either been rewritten past these markers or never said who
// approves it — and both are silent failures that end with an organisation
// being told nothing blocks a project that cannot legally start.
{
  const mute: string[] = [];
  for (const s of NBS_SOLUTIONS) {
    const f = approvalFacts(s.id);
    if (!f) continue;
    if (!f.bodies.length && !f.clauses.some(c => c.force === 'exempt')) mute.push(s.id);
  }
  if (mute.length) {
    throw new Error(
      `nbs-approvals: ${mute.length} ficha(s) name neither an approving body nor an exemption — ${mute.join(', ')}. ` +
        'Either the prose was rewritten past the markers in this file, or the ficha does not say who has to say yes.',
    );
  }
}

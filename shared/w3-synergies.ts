// ============================================================================
// COHORT SYNERGIES — the grouping pass, derived before it is narrated
// ============================================================================
// Ricardo, 31 August: "sería genial que pudiera hacer eso, porque ahí toda vez
// que una organización sube la información, no necesitas hacer[lo] todo la vez"
// — the synergy report exists, it was written by hand for ten organisations on
// 21 August, and it goes stale the moment anyone answers another question.
//
// This is the part of it that can be computed. The narrative is written by a
// model on top (server/services/synergyReport.ts); the groupings themselves are
// derived here so a coordinator can check why two organisations were put
// together, and so the same cohort always groups the same way.
//
// ── Three axes, because the hand-written report used three ──────────────────
// Reading it back is what settled the taxonomy. Its Agrupamento A is
// geographic; B is NOT — it is "água em alta velocidade", a hazard MECHANISM
// shared across two bairros that are nowhere near each other; and C is a land
// ARRANGEMENT (public land held informally), which is a governance theme with
// no geography at all.
//
// Grouping only by territory would have produced one of those three.
//
// ── And the rule the report states about itself ─────────────────────────────
// "São hipóteses para validar com as organizações no encontro, não decisões
// prontas." Every grouping this file emits carries that status, because a
// cluster an organisation did not agree to is a cluster that falls apart in
// the room — and because the validation IS the value of the meeting.
// ============================================================================

import { NBS_FAMILIAS } from './nbs-catalog';
import { digParagraphs, parseDig } from './w3-dig';
import { familyOfWorry } from './site-knowledge';
import { studyRequirement, studiesDone } from './w3-dossier';
import { getSolutionFicha } from './nbs-solution-fichas';
import type { CboState } from './cbo-schema';
import { approvalRequirement } from './nbs-approvals';
import { parseTests, REACTION, type TestReaction } from './w3-tests';
import { fundingMatches } from './funding-sources';
import { HARDEST, CRITERIA, parseCriteria, type HardestId } from './w3-criteria';
import { notesFromInput, toCardNote, DOCUMENT_NOTES_FIELD } from './w3-document-notes';

/**
 * One solution an organisation TESTED in Encontro 3, with what it said about it.
 * Since 2026-09-21 a test carries two answers only the organisation can give —
 * who would do it, what would be hardest — and its own size. Those are exactly
 * what a cohort pools: four organisations naming "a autorização" as what stops
 * them is one conversation with the city, three needing "um parceiro técnico"
 * is one partner to find.
 */
export interface TestedFact {
  id: string;
  reaction: TestReaction | null;
  who?: string | null;
  hardest?: string | null;
  hardestNote?: string | null;
  areaM2?: number | null;
  units?: number | null;
}

export interface SynergyMember {
  id: string;
  orgName: string;
  bairro: string | null;
  /** Marked place, if any. */
  siteName: string | null;
  hasSite: boolean;
  tenure: string | null;
  currentUse: string | null;
  /** The mechanism they named, their word. */
  worry: string | null;
  /** Famílias marked in W2. */
  familias: string[];
  /** Solutions chosen in W3, if they got that far. */
  solutions: string[];
  /**
   * Everything they TESTED in Encontro 3, liked or not. A solution set aside
   * with "não é pra gente" is a fact about the organisation that the chosen
   * list cannot carry — and two organisations setting aside the same thing for
   * the same reason is a finding. Optional: fixtures predate it.
   */
  tested?: TestedFact[];
  /** The coordination's technical reading of this organisation, when entered. */
  technicalNote?: string | null;
  /** "O que pesa mais pra escolher?" — criterion ids (shared/w3-criteria.ts). */
  choiceCriteria?: string[];
  /**
   * What their own files and their own words say about the PLACE and the
   * solutions — already verified and in the written register (the document
   * reader and the conversation notes). A work window, a counterpart sum, a
   * technical report advising against a solution: the facts two organisations
   * have in common are here, not in the fields.
   */
  fileNotesPt?: string[];
  /** Studies the organisation CONFIRMED it already holds — a reference for the others. */
  studiesDone?: string[];
  /** Roles they said they want to play. */
  roles: string[];
  priorCollaboration: string | null;
  priorCollaborationDetail: string | null;
  nbsExperience: string | null;
  /** 'funded' / count / largest budget — capacity to hold money. */
  fundingScale: string | null;
  biggestBudget: string | null;
  maturityScore: number;
  /** W3 verdict, when the workshop has run. */
  verdict: string | null;
  /** What its chosen solutions need before design — the pooling opportunity. */
  studyNeeds: string[];
  /** Approving bodies named by its fichas. */
  bodies: string[];
  /**
   * ⚠️ What the CONCEPT NOTE established — the artefact the workshop produces
   * and this pass could not see.
   *
   * The pass whose entire job is finding what a cohort has in common was
   * reading fields and their own words, and nothing that Encontro 3 concluded.
   * These three are the poolable half of that document: the named legal
   * instrument (seven organisations needing the same Termo de Adoção is one
   * conversation with the Secretaria de Parcerias, not seven), and the funding
   * paths each is eligible for or blocked from (five blocked by the same
   * "histórico comprovado" is a programme-level finding no organisation can
   * reach alone). See docs/context-first.md.
   */
  approvalInstruments: string[];
  fundingOpen: string[];
  fundingBlocked: string[];
  docCount: number;
  /** Nothing recorded at all — counted, never grouped. */
  started: boolean;
  /**
   * Their own words, verbatim.
   *
   * The hand-written report quotes them throughout — "Lugar muito próximo do
   * rio, a uns 300 metros. É uma área aterrada — com pouca chuva já fica úmido
   * e alagado" — and those sentences carry more about whether two organisations
   * belong together than any field we canonicalised. A synergy pass that reads
   * only the enum answers is reading the thinnest version of the record.
   */
  /**
   * ⚠️ `dug` and `detail` reach this pass as of 2026-09-07. They are the half of
   * "their own words" it most needs and never had — see the note on
   * SynergyFacts. `areaM2` likewise: a cohort's total footprint is a fact about
   * the cohort, and it was on every record already.
   */
  ownWords: {
    story: string | null;
    whyHere: string | null;
    baseline: string | null;
    dug?: string[];
    detail?: string | null;
  };
  areaM2?: number | null;
  /**
   * What they uploaded. ⚠️ `fullText` where we have it, not only the summary:
   * this pass was reading a 280-character précis of a Teia Sprint proposal —
   * the one artefact that shows two organisations proposing the same thing.
   */
  docs: Array<{ filename: string; purpose: string | null; summary: string | null; fullText?: string | null }>;
  /** Where the organisation corrected our risk numbers. Outranks the map. */
  correctionsPt: string | null;
  /**
   * ⚠️ What a reading pass SAW in their photographs, pre-digested.
   *
   * The last declared gap on this pass, and closed the way this repo closes
   * every image gap: not by handing eight organisations' photographs to one
   * call, but by taking the one-sentence observations the W3 advisor already
   * wrote from them, each carrying what it was based on. Two organisations
   * photographing the same failing wall is a synergy no field expresses — and
   * an observation with a source can be checked, while a raw image in a
   * cross-organisation prompt cannot. See docs/context-first.md.
   */
  photoNotesPt: string[];
}

export type GroupAxis = 'territory' | 'mechanism' | 'arrangement';

export interface SynergyGroup {
  axis: GroupAxis;
  /** A short handle, e.g. "Floresta · Centro Histórico" or "encosta e enxurrada". */
  key: string;
  memberIds: string[];
  /** The facts that put these together. Shown, so the grouping is checkable. */
  becausePt: string[];
  /** Where they complement rather than repeat each other. */
  complementsPt: string[];
}

export interface TransversalRole {
  kind: 'technical-anchor' | 'can-hold-funds' | 'not-started' | 'no-site-yet';
  memberIds: string[];
  notePt: string;
}

export interface SynergyAnalysis {
  members: SynergyMember[];
  groups: SynergyGroup[];
  transversal: TransversalRole[];
  /** What repeats across the whole cohort — the umbrella themes. */
  commonPt: string[];
  /** Shared study needs, which is where pooling actually saves money. */
  pooledStudies: Array<{ need: string; memberIds: string[] }>;
  /**
   * ⚠️ The two most poolable facts a cohort has, and neither existed here until
   * the context audit found the concept notes never reached this pass.
   *
   * Seven organisations needing the same Termo de Adoção is one conversation
   * with the Secretaria de Parcerias rather than seven. Five blocked by the same
   * "histórico comprovado" is a programme-level finding no organisation can
   * reach alone — and the answer to it is the aggregation the funding workshop
   * spent an hour on. See docs/context-first.md.
   */
  pooledInstruments: Array<{ instrument: string; memberIds: string[] }>;
  sharedFundingBarriers: Array<{ path: string; memberIds: string[] }>;
  /** Shared approving bodies — one conversation instead of five. */
  pooledBodies: Array<{ body: string; memberIds: string[] }>;
  /**
   * What organisations said would be HARDEST, shared. Four naming "a
   * autorização" is an articulation with the city; three naming "cuidar
   * depois" is a maintenance programme. From "o que mais pega?" (Encontro 3).
   */
  sharedObstacles?: Array<{ obstacle: string; memberIds: string[]; solutions: string[] }>;
  /**
   * Who said they would need somebody — a technical partner, a contractor, or
   * nobody yet — for a solution they KEPT. One partner found for several.
   */
  partnerNeeds?: Array<{ need: string; memberIds: string[]; solutions: string[] }>;
  /** Studies an organisation already holds — a reference, and sometimes a shared one. */
  studiesHeld?: Array<{ study: string; memberIds: string[] }>;
  /** Stated plainly, because a partial reading presented as complete is a lie. */
  gapsPt: string[];
}

const FAMILIA_LABEL = new Map(NBS_FAMILIAS.map(f => [f.id as string, f.pt.label]));
const norm = (s: string | null | undefined) => (s ?? '').trim().toLowerCase();

/**
 * The hazard mechanism, grouped the way the solutions actually differ.
 *
 * Flat-area ponding and river flooding both call for infiltration and storage;
 * water arriving fast down a slope calls for something else entirely. The
 * hand-written report split exactly here, and its reason is the right one:
 * "água em alta velocidade… que pede soluções distintas das de alagamento em
 * área plana."
 */
function mechanismBand(worry: string | null): { key: string; labelPt: string } | null {
  const w = norm(worry).split(',')[0];
  if (!w) return null;
  if (/enxurrada|landslide|barranco|desliza/.test(w)) {
    return { key: 'encosta', labelPt: 'encosta e enxurrada — água em alta velocidade' };
  }
  if (/alagamento|inundacao|inundação|flood/.test(w) || familyOfWorry(w) === 'flood') {
    return { key: 'agua-parada', labelPt: 'alagamento e inundação em área plana' };
  }
  if (/heat|calor/.test(w) || familyOfWorry(w) === 'heat') {
    return { key: 'calor', labelPt: 'calor e falta de sombra' };
  }
  return null;
}

/** Land arrangement, which is a governance theme rather than a place. */
function arrangementBand(tenure: string | null): { key: string; labelPt: string } | null {
  const t = norm(tenure);
  if (!t) return null;
  if (/public-informal|public_land|public-no-access/.test(t)) {
    return { key: 'publico-informal', labelPt: 'área pública usada sem documento' };
  }
  if (/private-owned|formal-agreement/.test(t)) {
    return { key: 'terreno-proprio', labelPt: 'terreno próprio ou com acordo formal' };
  }
  return null;
}

const listNames = (ids: string[], members: SynergyMember[]) =>
  ids.map(id => members.find(m => m.id === id)?.orgName ?? id).join(', ');

export function analyseSynergies(all: SynergyMember[]): SynergyAnalysis {
  // Organisations with nothing recorded are counted in the gaps and never
  // grouped — a cluster built on an empty record is an invention.
  const members = all.filter(m => m.started);
  const groups: SynergyGroup[] = [];

  const byKey = <T>(get: (m: SynergyMember) => { key: string; labelPt: string } | null) => {
    const map = new Map<string, { labelPt: string; ids: string[] }>();
    for (const m of members) {
      const k = get(m);
      if (!k) continue;
      const entry = map.get(k.key) ?? { labelPt: k.labelPt, ids: [] };
      entry.ids.push(m.id);
      map.set(k.key, entry);
    }
    return map;
  };

  // ── Territory ─────────────────────────────────────────────────────────────
  const byBairro = byKey(m => (m.bairro ? { key: norm(m.bairro), labelPt: m.bairro.split(',')[0].trim() } : null));
  for (const [, g] of Array.from(byBairro)) {
    if (g.ids.length < 2) continue;
    const inGroup = members.filter(m => g.ids.includes(m.id));
    const because = [`Mesmo território: ${g.labelPt}.`];
    const collaborated = inGroup.filter(m => norm(m.priorCollaboration) === 'sim');
    if (collaborated.length) {
      because.push(
        `Já houve colaboração declarada na Rede — ${listNames(collaborated.map(c => c.id), members)}.`,
      );
    }
    const owned = inGroup.filter(m => /private-owned|formal-agreement/.test(norm(m.tenure)));
    if (owned.length >= 2) because.push(`${owned.length} organizações com terreno próprio: controle total do local.`);

    // Complementarity is the interesting half — two orgs wanting the same thing
    // is a duplication, two covering different halves is a cluster.
    const fam = new Map<string, string[]>();
    for (const m of inGroup) for (const f of m.familias) fam.set(f, [...(fam.get(f) ?? []), m.id]);
    const shared = Array.from(fam).filter(([, ids]) => ids.length > 1).map(([f]) => FAMILIA_LABEL.get(f) ?? f);
    const distinct = Array.from(fam).filter(([, ids]) => ids.length === 1).map(([f]) => FAMILIA_LABEL.get(f) ?? f);
    const complements: string[] = [];
    if (shared.length) complements.push(`Interesse em comum: ${shared.join(', ')}.`);
    if (distinct.length >= 2) complements.push(`Famílias complementares, que juntas cobrem mais do ciclo: ${distinct.join(', ')}.`);
    const roles = new Set(inGroup.flatMap(m => m.roles));
    if (roles.size >= 2) complements.push(`Papéis declarados que se encaixam: ${Array.from(roles).join(' · ')}.`);

    groups.push({ axis: 'territory', key: g.labelPt, memberIds: g.ids, becausePt: because, complementsPt: complements });
  }

  // ── Mechanism ─────────────────────────────────────────────────────────────
  for (const [, g] of Array.from(byKey(m => mechanismBand(m.worry)))) {
    if (g.ids.length < 2) continue;
    // Only interesting when it crosses territories — inside one bairro the
    // territorial grouping already says it.
    const bairros = new Set(members.filter(m => g.ids.includes(m.id)).map(m => norm(m.bairro)));
    if (bairros.size < 2) continue;
    groups.push({
      axis: 'mechanism',
      key: g.labelPt,
      memberIds: g.ids,
      becausePt: [
        `O mesmo tipo de risco em territórios diferentes: ${g.labelPt}.`,
        'Pede soluções parecidas entre si e distintas das dos outros agrupamentos.',
      ],
      complementsPt: [],
    });
  }

  // ── Arrangement ───────────────────────────────────────────────────────────
  for (const [key, g] of Array.from(byKey(m => arrangementBand(m.tenure)))) {
    if (g.ids.length < 2 || key !== 'publico-informal') continue;
    groups.push({
      axis: 'arrangement',
      key: g.labelPt,
      memberIds: g.ids,
      becausePt: [
        'Todas atuam em área pública sem documento que garanta o uso.',
        'A formalização desse acesso é uma pauta de articulação comum com o poder público, e não depende de proximidade geográfica.',
      ],
      complementsPt: [],
    });
  }

  // ── Transversal roles ─────────────────────────────────────────────────────
  const transversal: TransversalRole[] = [];
  const anchors = members.filter(m => norm(m.nbsExperience) === 'yes' && m.maturityScore >= 6);
  if (anchors.length) {
    transversal.push({
      kind: 'technical-anchor',
      memberIds: anchors.map(m => m.id),
      notePt: `Experiência prévia com SbN e capacidade de execução consolidada — podem apoiar tecnicamente os outros agrupamentos, mesmo sem local definido: ${listNames(anchors.map(m => m.id), members)}.`,
    });
  }
  const holders = members.filter(m => /funded|yes/.test(norm(m.fundingScale)));
  if (holders.length) {
    transversal.push({
      kind: 'can-hold-funds',
      memberIds: holders.map(m => m.id),
      notePt: `Já executaram projeto financiado — candidatas naturais a receber e prestar contas em projeto conjunto, aliviando as organizações menores: ${listNames(holders.map(m => m.id), members)}.`,
    });
  }
  const noSite = members.filter(m => !m.hasSite);
  if (noSite.length) {
    transversal.push({
      kind: 'no-site-yet',
      memberIds: noSite.map(m => m.id),
      notePt: `Ainda sem lugar marcado no mapa — marcar com elas pode ser um resultado concreto do próprio encontro: ${listNames(noSite.map(m => m.id), members)}.`,
    });
  }
  const notStarted = all.filter(m => !m.started);
  if (notStarted.length) {
    transversal.push({
      kind: 'not-started',
      memberIds: notStarted.map(m => m.id),
      notePt: `Sem nenhuma resposta registrada na plataforma: ${listNames(notStarted.map(m => m.id), all)}. Vale um esforço dirigido de reengajamento antes ou durante o encontro.`,
    });
  }

  // ── Pooling: where the programme saves money an org cannot save alone ──────
  const poolBy = (get: (m: SynergyMember) => string[]) => {
    // ⚠️ One org, counted once per key. An organisation carrying two solutions
    // that need the same thing — biovaletas + canteiro pluvial both want "um
    // técnico para o desenho", and the flow actively offers that second
    // solution — used to pool with ITSELF: `memberIds: ['a','a']`, printed as
    // "Org A, Org A", and counted in the banner's one number that means money.
    const map = new Map<string, Set<string>>();
    for (const m of members) for (const v of get(m)) map.set(v, (map.get(v) ?? new Set()).add(m.id));
    return Array.from(map)
      .map(([k, ids]) => [k, Array.from(ids)] as [string, string[]])
      .filter(([, ids]) => ids.length > 1)
      .sort((a, b) => b[1].length - a[1].length);
  };
  const pooledStudies = poolBy(m => m.studyNeeds).map(([need, memberIds]) => ({ need, memberIds }));
  const pooledBodies = poolBy(m => m.bodies).map(([body, memberIds]) => ({ body, memberIds }));
  const pooledInstruments = poolBy(m => m.approvalInstruments ?? []).map(([instrument, memberIds]) => ({ instrument, memberIds }));
  const sharedFundingBarriers = poolBy(m => m.fundingBlocked ?? []).map(([path, memberIds]) => ({ path, memberIds }));

  // ── What they SAID would be hardest, and who they would need ────────────
  // Only for solutions they tested; the obstacle names are theirs, from the
  // chips of "o que mais pega?" ('outro' carries their own words and is not
  // pooled by label; 'nada' is not an obstacle).
  const obstacleMap = new Map<string, { ids: Set<string>; sols: Set<string> }>();
  const partnerMap = new Map<string, { ids: Set<string>; sols: Set<string> }>();
  for (const m of members) {
    for (const t of m.tested ?? []) {
      if (t.hardest && t.hardest !== 'nada' && t.hardest !== 'outro' && HARDEST[t.hardest as HardestId]) {
        const k = HARDEST[t.hardest as HardestId].reportPt;
        const e = obstacleMap.get(k) ?? { ids: new Set(), sols: new Set() };
        e.ids.add(m.id); e.sols.add(t.id); obstacleMap.set(k, e);
      }
      if (t.reaction === 'faz-sentido' && t.who && ['nos-com-parceiro', 'contratar', 'ninguem'].includes(t.who)) {
        const k = t.who === 'nos-com-parceiro' ? 'um parceiro técnico' : t.who === 'contratar' ? 'execução contratada' : 'alguém que faça — hoje ninguém';
        const e = partnerMap.get(k) ?? { ids: new Set(), sols: new Set() };
        e.ids.add(m.id); e.sols.add(t.id); partnerMap.set(k, e);
      }
    }
  }
  const asPooled = (map: Map<string, { ids: Set<string>; sols: Set<string> }>, min: number) => Array.from(map)
    .filter(([, e]) => e.ids.size >= min)
    .sort((a, b) => b[1].ids.size - a[1].ids.size)
    .map(([k, e]) => ({ k, memberIds: Array.from(e.ids), solutions: Array.from(e.sols) }));
  const sharedObstacles = asPooled(obstacleMap, 2).map(x => ({ obstacle: x.k, memberIds: x.memberIds, solutions: x.solutions }));
  // A single organisation needing a partner is already a line for the coordination.
  const partnerNeeds = asPooled(partnerMap, 1).map(x => ({ need: x.k, memberIds: x.memberIds, solutions: x.solutions }));
  const heldMap = new Map<string, Set<string>>();
  for (const m of members) for (const st of m.studiesDone ?? []) heldMap.set(st, (heldMap.get(st) ?? new Set()).add(m.id));
  const studiesHeld = Array.from(heldMap).map(([study, ids]) => ({ study, memberIds: Array.from(ids) }));

  // ── Common denominators ───────────────────────────────────────────────────
  const commonPt: string[] = [];
  const famCount = new Map<string, number>();
  for (const m of members) for (const f of m.familias) famCount.set(f, (famCount.get(f) ?? 0) + 1);
  const topFam = Array.from(famCount).sort((a, b) => b[1] - a[1])[0];
  if (topFam && topFam[1] > 1) {
    commonPt.push(`${FAMILIA_LABEL.get(topFam[0]) ?? topFam[0]} aparece em ${topFam[1] === 1 ? '1 organização' : `${topFam[1]} organizações`} — é o tema guarda-chuva mais natural para um primeiro projeto coletivo.`);
  }
  const bands = new Map<string, number>();
  for (const m of members) {
    const b = mechanismBand(m.worry);
    if (b) bands.set(b.labelPt, (bands.get(b.labelPt) ?? 0) + 1);
  }
  const topBand = Array.from(bands).sort((a, b) => b[1] - a[1])[0];
  if (topBand) commonPt.push(`A preocupação dominante é ${topBand[0]}, em ${topBand[1] === 1 ? '1 organização' : `${topBand[1]} organizações`}.`);
  // What weighs most when choosing — their answer, not our reading of them.
  const critCount = new Map<string, number>();
  for (const m of members) for (const c of m.choiceCriteria ?? []) critCount.set(c, (critCount.get(c) ?? 0) + 1);
  const answeredCriteria = members.filter(m => (m.choiceCriteria ?? []).length).length;
  const topCrit = Array.from(critCount).sort((a, b) => b[1] - a[1])[0];
  if (topCrit && answeredCriteria >= 2) {
    const label = CRITERIA.find(c => c.id === topCrit[0])?.chipPt.toLowerCase() ?? topCrit[0];
    commonPt.push(`Na hora de escolher, "${label}" é o que mais pesa: ${topCrit[1]} de ${answeredCriteria} organizações que responderam.`);
  }

  // ── Gaps, stated plainly ──────────────────────────────────────────────────
  const gapsPt: string[] = [];
  // Portuguese agrees. "1 organizações" is the tell that nobody read the output.
  const orgs = (n: number) => (n === 1 ? '1 organização' : `${n} organizações`);
  if (notStarted.length) {
    gapsPt.push(
      `${orgs(notStarted.length)} sem nenhum dado — as sinergias aqui são parciais por definição.`,
    );
  }
  if (noSite.length) gapsPt.push(`${orgs(noSite.length)} sem local marcado no mapa.`);
  const noDocs = members.filter(m => m.docCount === 0);
  if (noDocs.length) {
    gapsPt.push(
      `${orgs(noDocs.length)} sem nenhum arquivo ou foto enviada: ${listNames(noDocs.map(m => m.id), members)}.`,
    );
  }
  gapsPt.push('Os índices de risco são médias de bairro, calculadas em células que cobrem quarteirões. Onde a organização discordou, a percepção dela vale mais.');

  return { members, groups, transversal, commonPt, pooledStudies, pooledBodies, pooledInstruments, sharedFundingBarriers, sharedObstacles, partnerNeeds, studiesHeld, gapsPt };
}

// ============================================================================
// STATE → FACTS — the one reading of a saved record the analysis runs on
// ============================================================================
// This lived inside server/routes/cohortRoutes.ts, which meant the mapping
// between what an organisation answered and what the portfolio analysis sees
// could only be exercised by standing up a database and an HTTP server. It is
// pure, it is the place field names go stale, and a silent rename here empties
// the report rather than breaking it — so it belongs where a simulation and a
// unit test can both read it.
// ============================================================================

/**
 * The raw facts the portfolio analysis groups on — deliberately separate from
 * the roster signals, which are shaped for a card rather than for reasoning.
 */
export type SynergyFacts = {
  /**
   * ⚠️ `dug` and `detail` were missing until 2026-09-07, and they are the half
   * of "their own words" that this pass most needs.
   *
   * This type was written before the dig existed (shared/w3-dig.ts), so an
   * organisation could answer three questions written specifically for it —
   * how long the water stood, who unblocks the drains, what the land agreement
   * actually covers — and every one of those answers reached the Resumo do
   * Projeto and NOTHING in the cohort report. They are exactly the sentences
   * that put two organisations in the same room: "a escola está sem zelador,
   * quem desentope somos nós" is a shared condition; "alagamento" is a label.
   */
  ownWords: {
    story: string | null;
    whyHere: string | null;
    baseline: string | null;
    /** The answered dig, already in the document's third person. */
    dug: string[];
    /** The one detail this solution's ficha says decides whether it works here. */
    detail: string | null;
  };
  correctionsPt: string | null;
  /** Pre-digested photograph observations — see the doc on SynergyMember. */
  photoNotesPt: string[];
  /** What Encontro 3 concluded, and this pass could not previously see. */
  approvalInstruments: string[];
  fundingOpen: string[];
  fundingBlocked: string[];
  siteName: string | null;
  hasSite: boolean;
  tenure: string | null;
  currentUse: string | null;
  familias: string[];
  solutions: string[];
  roles: string[];
  priorCollaborationDetail: string | null;
  nbsExperience: string | null;
  fundingScale: string | null;
  biggestBudget: string | null;
  studyNeeds: string[];
  bodies: string[];
  /**
   * The footprint, so the pass can add up what a cohort is proposing. Three
   * organisations depaving 900 m² each is a different proposition from three
   * proposing "a rain garden", and the number was on the record the whole time.
   */
  areaM2: number | null;
  tested?: TestedFact[];
  technicalNote?: string | null;
  choiceCriteria: string[];
  fileNotesPt: string[];
  studiesDone: string[];
};

export function synergyFactsFrom(sections: CboState['sections']): SynergyFacts {
  const f = (id: string, k: string) =>
    String(((sections as any)?.[id]?.fields ?? {})[k]?.value ?? '').trim();
  const list = (v: string) => v.split(',').map(x => x.trim()).filter(Boolean);
  const solutions = list(f('intervention_type', 'chosen_solutions'));

  // The pooling opportunities: what each chosen solution needs before it can be
  // designed, and who has to approve it. Both come from the fichas, so five
  // organisations needing the same study is a fact rather than an impression.
  const studyNeeds: string[] = [];
  const bodies: string[] = [];
  for (const id of solutions) {
    // What this organisation STILL needs — a study it confirmed it already has
    // is not something to pool across the cohort.
    const req = studyRequirement(id, { studies_done: f('intervention_site', 'studies_done') });
    if (req && !studyNeeds.includes(req.pt)) studyNeeds.push(req.pt);
    const ficha = getSolutionFicha(id);
    if (!ficha) continue;
    for (const [re, body] of [[/SMAMUS/i, 'SMAMUS'], [/DMAE/i, 'DMAE'], [/EPTC/i, 'EPTC'], [/Defesa Civil/i, 'Defesa Civil']] as [RegExp, string][]) {
      if (re.test(ficha.pt.quemPrecisaDizerSim) && !bodies.includes(body)) bodies.push(body);
    }
  }

  // The named instrument each solution goes through, for THIS organisation's
  // land — the thing a cohort can queue together.
  const tenure = f('intervention_site', 'land_tenure');
  const approvalInstruments: string[] = [];
  for (const id of solutions) {
    const inst = approvalRequirement(id, tenure)?.instrumentPt;
    if (inst && !approvalInstruments.includes(inst)) approvalInstruments.push(inst);
  }

  // Which funding paths this record opens or closes. The eligibility criteria
  // are the deck's; what decides them is already in the record.
  const org = (k: string) => f('org_profile', k);
  const matches = fundingMatches({
    ...(org('has_cnpj') ? { hasCnpj: /^(sim|yes)/i.test(org('has_cnpj')) } : {}),
    hasTrackRecord: org('prior_project_scale') === 'funded' || org('funding_history') === 'yes',
  }, 'pt');
  const fundingOpen = matches.filter(m => !m.blocked).map(m => m.path.name);
  const fundingBlocked = matches.filter(m => m.blocked).map(m => m.path.name);

  // What they said, not what we filed it under.
  const hazardChecks = (() => {
    try {
      const j = JSON.parse(f('intervention_site', '_hazard_check_json') || '{}');
      const disagreed = Object.entries(j)
        .filter(([, v]) => /pior|worse|melhor|better/i.test(String(v)))
        .map(([k, v]) => `${k}: ${v}`);
      return disagreed.length ? disagreed.join('; ') : null;
    } catch { return null; }
  })();

  return {
    ownWords: {
      story: f('intervention_site', 'site_story') || null,
      whyHere: f('intervention_type', 'justification_why_here') || null,
      baseline: f('impact_monitoring', 'baseline_condition') || null,
      // Already written for a page — third person, the answer inside a sentence
      // that says what it answers. The same rendering the Resumo prints, so the
      // two documents cannot disagree about what an organisation said.
      dug: digParagraphs(parseDig(f('intervention_type', 'dig_json')), 'pt').map(d => d.text),
      detail: f('intervention_type', 'detail_answer') || null,
    },
    correctionsPt: hazardChecks,
    // ⚠️ From the advisor's own observations, not from the images. Only the ones
    // it says came from a photograph: an observation that names its source can
    // be checked, and one that reached the page without a source is the defect
    // the provenance was added to prevent.
    photoNotesPt: (() => {
      try {
        const advice = JSON.parse(f('intervention_type', '_advice_json') || '{}');
        return (advice?.observations ?? [])
          .filter((o: any) => /foto|photo|imagem|image/i.test(String(o?.basedOn ?? '')))
          .map((o: any) => String(o?.textPt ?? '').trim())
          .filter(Boolean)
          .slice(0, 3);
      } catch {
        return [];
      }
    })(),
    approvalInstruments,
    fundingOpen,
    fundingBlocked,
    siteName: f('intervention_site', 'site_name') || null,
    hasSite: !!f('intervention_site', '_site_lat') || !!f('intervention_site', 'site_lat'),
    tenure: f('intervention_site', 'land_tenure') || null,
    currentUse: f('intervention_site', 'current_use') || null,
    familias: list(f('intervention_site', 'nbs_interest')),
    solutions,
    roles: list(f('intervention_site', 'role_preference')),
    priorCollaborationDetail: f('intervention_site', 'prior_collaboration_detail') || null,
    nbsExperience: f('org_profile', 'nbs_experience') || null,
    fundingScale: f('org_profile', 'prior_project_scale') || f('org_profile', 'funding_history') || null,
    biggestBudget: f('org_profile', 'biggest_project_budget') || null,
    studyNeeds,
    bodies,
    areaM2: Number(f('intervention_site', 'site_area_m2')) || null,
    tested: parseTests(f('intervention_type', 'solution_tests_json')).map(t => ({
      id: t.solutionId,
      reaction: t.reaction,
      who: t.who ?? null,
      hardest: t.hardest ?? null,
      hardestNote: t.hardestNote ?? null,
      areaM2: t.areaM2 ?? null,
      units: t.units ?? null,
    })),
    technicalNote: f('intervention_type', 'technical_note') || null,
    choiceCriteria: parseCriteria(f('intervention_type', '_choice_criteria')),
    // Verified, third person, with the file named — the same notes the card and
    // the comparison print. Their contras first (they decide), then the place.
    fileNotesPt: (() => {
      const notes = notesFromInput({
        site: { site_notes: f('intervention_site', 'site_notes') },
        w3: { [DOCUMENT_NOTES_FIELD]: f('intervention_type', DOCUMENT_NOTES_FIELD), project_notes: f('intervention_type', 'project_notes') },
      });
      const rank = (st: string) => (st === 'contra' ? 0 : st === 'a-favor' ? 1 : st === 'dito' ? 2 : 3);
      return notes
        .slice()
        .sort((a, b) => rank(a.stance) - rank(b.stance))
        .slice(0, 8)
        .map(n => { const c = toCardNote(n, 'pt'); return `${c.stanceLabel}${n.solutionId !== '*' ? ` (${n.solutionId})` : ''}: ${c.text} — ${c.source}`; });
    })(),
    studiesDone: studiesDone({ studies_done: f('intervention_site', 'studies_done') })
      .map(id => ({ infiltration: 'teste de infiltração', geotechnical: 'avaliação geotécnica', hydrological: 'estudo hidrológico', hydraulic: 'estudo hidráulico', report: 'laudo técnico' } as Record<string, string>)[id] ?? id),
  };
}

/**
 * The facts added to a member after 2026-09-21, in ONE place. Both
 * hand-assembled member lists (the cohort report's route and the project
 * context) spread this — and it was exactly that duplication that left
 * `tested` and `technicalNote` out of the cohort report for weeks: declared on
 * the type, printed by the prompt when present, never copied by the route.
 */
export function synergyExtrasFrom(facts: SynergyFacts | null | undefined): Pick<SynergyMember, 'tested' | 'technicalNote' | 'choiceCriteria' | 'fileNotesPt' | 'studiesDone'> {
  return {
    tested: facts?.tested ?? [],
    technicalNote: facts?.technicalNote ?? null,
    choiceCriteria: facts?.choiceCriteria ?? [],
    fileNotesPt: facts?.fileNotesPt ?? [],
    studiesDone: facts?.studiesDone ?? [],
  };
}

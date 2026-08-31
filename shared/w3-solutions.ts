// ============================================================================
// W3 SHORTLIST — from a família to the actual thing they will build
// ============================================================================
// W2 ends with famílias: "vale estudar Águas Pluviais e Verde Urbano." W3 has
// to end with a solution, because a solution is what has a price, an approving
// body, a maintenance regime and a failure mode — a família has none of those.
//
// Ordering, never filtering. The W2 recommendation ships all five famílias
// under a line that promises "nada fica descartado", and the same promise has
// to survive one workshop later: an organisation that wants a rain garden on a
// slope gets to choose it, and gets told plainly what that will cost them in
// studies. A shortlist that quietly removed it would be making the decision
// while claiming to offer one.
//
// Three signals, in this order:
//   1. the famílias they marked interest in, in W2 (nbs_interest)
//   2. the mechanism they named — alagamento is not inundação is not enxurrada,
//      and the catalog already maps every solution to the mechanisms it answers
//   3. what the place physically is (a paved yard, a slope, a roof)
// ============================================================================

import {
  NBS_SOLUTIONS,
  SOLUTION_MECHANISMS,
  mechanismNote,
  type NbsSolution,
} from './nbs-catalog';
import { studyRequirement } from './w3-dossier';

export interface ShortlistInput {
  /** intervention_site fields, as stored. */
  site: Record<string, string | undefined>;
}

export interface ShortlistEntry {
  solution: NbsSolution;
  /** Why it is where it is — shown on the card, in their own vocabulary. */
  reasonPt: string;
  reasonEn: string;
  /** True when the site's own physical state argues against it. Still offered. */
  caveatPt?: string;
  caveatEn?: string;
}

const splitList = (v: string | undefined) =>
  (v ?? '').split(',').map(s => s.trim()).filter(Boolean);

/**
 * Physical fit, from what the org said the place is today.
 *
 * These are the ones where the site record already contradicts the solution,
 * and where saying so early saves a workshop. A caveat never removes an
 * option — it is a sentence on the card, so the choice stays theirs and the
 * reason is visible.
 */
function siteFit(s: NbsSolution, site: Record<string, string | undefined>): Pick<ShortlistEntry, 'caveatPt' | 'caveatEn'> {
  const use = site.current_use ?? '';
  const name = site.site_name ?? '';

  if (s.id === 'teto-verde' && !/laje|telhad|roof|escola|emei|emef|posto|ubs|sede/i.test(name)) {
    return {
      caveatPt: 'Precisa de uma laje que aguente o peso — vale confirmar que existe uma no lugar.',
      caveatEn: 'Needs a roof slab that can take the weight — worth confirming there is one here.',
    };
  }
  if (s.familiaId === 'encostas-e-solo' && use && !/slope|encosta|barranc/i.test(use) && !/encosta|morro|barranc/i.test(name)) {
    return {
      caveatPt: 'É solução de encosta — se o terreno for plano, provavelmente não é essa.',
      caveatEn: 'This is a slope solution — on flat ground it is probably not the one.',
    };
  }
  if (s.id === 'pavimentos-permeaveis' && use && use !== 'paved') {
    return {
      caveatPt: 'Faz mais sentido onde já existe piso impermeável para trocar.',
      caveatEn: 'Makes most sense where there is already impermeable paving to replace.',
    };
  }
  if (s.id === 'restauracao-areas-umidas' && !/banhad|arroio|margem|wetland|lagoa|c[oó]rrego/i.test(`${name} ${site.site_story ?? ''}`)) {
    return {
      caveatPt: 'Vale para banhado ou margem de curso d\'água — o registro do lugar não menciona nenhum.',
      caveatEn: "Applies to a wetland or a watercourse margin — the site record mentions neither.",
    };
  }
  return {};
}

/**
 * The whole catalogue, ordered for this site.
 *
 * Returns all 27 by design. The caller shows the top few and keeps "ver todas"
 * one tap away — which is the same shape W2's família recommendation uses, and
 * for the same reason.
 */
export function shortlistForSite(input: ShortlistInput, lang: 'pt' | 'en' = 'pt'): ShortlistEntry[] {
  const { site } = input;
  const interest = new Set(splitList(site.nbs_interest));
  const worries = splitList(site.site_worry);

  const scored = NBS_SOLUTIONS.map(s => {
    const answersMechanism = (SOLUTION_MECHANISMS[s.id] ?? []).some(m => worries.includes(m));
    const inInterest = interest.has(s.familiaId);
    const fit = siteFit(s, site);
    // Interest outranks mechanism: the org told us what it wants to work on,
    // and our reading of a chip is a weaker signal than that. A caveat costs a
    // solution its place near the top without ever removing it.
    const score =
      (inInterest ? 4 : 0) + (answersMechanism ? 2 : 0) - (fit.caveatPt ? 1 : 0);

    // The first half says why it is on the list; the second says what choosing
    // it will actually cost them.
    //
    // Without the second half every solution answering the same mechanism gets
    // an identical line — four cards reading "responde ao que vocês contaram —
    // pra água que junta", which is four ways of saying nothing and leaves the
    // choice to whichever photo looks nicest. The distinguishing fact at this
    // point in W3 is who can build it: a rain garden needs a soil infiltration
    // test before anyone can draw it, a permeable pavement does not. That is
    // the SAME read the closing verdict uses, so the card and the verdict can
    // never contradict each other inside one session.
    const note = mechanismNote(s.id, worries, lang);
    const why = {
      pt: answersMechanism && note
        ? `Responde ao que vocês contaram — ${note}`
        : inInterest
          ? 'Está no grupo que vocês marcaram no Encontro 2'
          : 'Do catálogo completo — nada fica descartado',
      en: answersMechanism && note
        ? `Answers what you described — ${note}`
        : inInterest
          ? 'It is in the grupo you marked in Encontro 2'
          : 'From the full catalogue — nothing is ruled out',
    };
    const study = studyRequirement(s.id);
    const cost = { pt: `custo ${s.costBand}`, en: `${s.costBand === 'baixo' ? 'low' : s.costBand === 'medio' ? 'medium' : 'high'} cost` };
    const effort = study
      ? { pt: `precisa de ${study.pt}`, en: `needs ${study.en}` }
      : { pt: 'dá pra construir com o que vocês já sabem', en: 'buildable with what you already know' };
    const reasonPt = `${why.pt} · ${effort.pt}, ${cost.pt}.`;
    const reasonEn = `${why.en} · ${effort.en}, ${cost.en}.`;

    return { solution: s, score, reasonPt, reasonEn, ...fit };
  });

  // Stable within a score, so the catalogue's own order survives — the deck's
  // ordering is editorial and worth keeping where nothing else decides.
  return scored
    .map((e, i) => ({ e, i }))
    .sort((a, b) => b.e.score - a.e.score || a.i - b.i)
    .map(({ e }) => ({
      solution: e.solution,
      reasonPt: e.reasonPt,
      reasonEn: e.reasonEn,
      ...(e.caveatPt ? { caveatPt: e.caveatPt, caveatEn: e.caveatEn } : {}),
    }));
}

/** The handful a chat composer can show without becoming a catalogue. */
export function topShortlist(input: ShortlistInput, lang: 'pt' | 'en' = 'pt', n = 4): ShortlistEntry[] {
  return shortlistForSite(input, lang).slice(0, n);
}


// ── Merging the agent's reading with their own choice ────────────────────────

export interface AgentPick {
  solutionId: string;
  reasonPt: string;
  /** Outside the famílias they marked in Encontro 2. */
  outsideTheirPicks: boolean;
}

/**
 * The shortlist an organisation actually sees.
 *
 * ⚠️ THE ALIGNMENT RULE. What they chose in Encontro 2 leads, always. They
 * chose with intention, in a session whose details they may not remember, and a
 * platform that quietly reorders that choice because a photo suggested
 * otherwise has taken the decision while appearing to offer one.
 *
 * So the agent's reading does two things and never a third:
 *   · it REORDERS within their own picks, and replaces the generic reason with
 *     one citing their photo or their words;
 *   · it may APPEND a solution from outside those picks, below everything they
 *     chose, with the tension said out loud;
 *   · it never promotes an outside solution above one they marked.
 *
 * With no agent picks this returns exactly what it returned before — the
 * deterministic order — which is what makes the model optional rather than
 * load-bearing.
 */
export function mergeShortlist(
  base: ShortlistEntry[],
  picks: AgentPick[],
  lang: 'pt' | 'en' = 'pt',
): ShortlistEntry[] {
  if (!picks.length) return base;
  const byId = new Map(base.map(e => [e.solution.id, e]));
  const inside = picks.filter(p => !p.outsideTheirPicks);
  const outside = picks.filter(p => p.outsideTheirPicks);

  /** Their reason, in place of ours — but only ours carried the caveat. */
  const withReason = (e: ShortlistEntry, p: AgentPick): ShortlistEntry => ({
    ...e,
    reasonPt: lang === 'pt' ? p.reasonPt : e.reasonEn,
    reasonEn: lang === 'en' ? p.reasonPt : e.reasonEn,
  });

  const lifted: ShortlistEntry[] = [];
  for (const p of inside) {
    const e = byId.get(p.solutionId);
    if (!e) continue;
    lifted.push(withReason(e, p));
    byId.delete(p.solutionId);
  }

  const appended: ShortlistEntry[] = [];
  for (const p of outside) {
    const e = byId.get(p.solutionId);
    if (!e) continue;
    appended.push({
      ...withReason(e, p),
      // Not a caveat about the site — a caveat about US. It says plainly that
      // this is our reading arriving from outside their choice.
      caveatPt: 'Isso está fora dos grupos que vocês marcaram no Encontro 2 — é leitura nossa, e quem decide são vocês.',
      caveatEn: 'This sits outside the grupos you marked in Encontro 2 — it is our reading, and the decision is yours.',
    });
    byId.delete(p.solutionId);
  }

  const rest = base.filter(e => byId.has(e.solution.id));
  return [...lifted, ...rest, ...appended];
}

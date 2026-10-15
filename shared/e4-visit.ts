// ============================================================================
// THE TECHNICAL VISIT — which solution the organisation takes into Encontro 4
// ============================================================================
// Encontro 3 ends with 2–4 solutions tested, often several of them "faz
// sentido". Which ONE becomes the project is decided outside the platform: Vila
// Flores and Robson visit each place (21–25 Oct 2026) and recommend the
// solution that fits the territory (decided with Ana, 13 Oct). This file is
// where that recommendation lands, so Encontro 4 can open on it — "Depois da
// visita, a escolha foi X. É essa?" — instead of asking an organisation to
// re-decide something a technician already looked at.
//
// ── What it is not ──────────────────────────────────────────────────────────
//   · Not a gate. An organisation whose visit was never recorded still picks
//     its own solution in Encontro 4; the card then says "sem visita". Anyone
//     on the coordinator side can record or change the choice at any time —
//     nothing waits on one person (JVP, 14 Oct).
//   · Not limited to what they tested. Robson may recommend a solution the
//     organisation never tried; the list puts their tests first and the rest
//     of the catalogue after.
//
// Stored as `intervention_type._visit_json`: machine state (the leading "_"),
// written only by the coordinator route, read by the drawer, the roster, the
// Perfil and Encontro 4. The technical reading stays in `technical_note`,
// which the comparison and the synergy pass already print.
// ============================================================================

import { NBS_SOLUTIONS, getSolution } from './nbs-catalog';
import { SOLUTION_COSTS } from './w3-sizing';
import { parseTests, type SolutionTest } from './w3-tests';

type Lang = 'pt' | 'en';

export interface VisitChoice {
  solutionId: string;
  /** The size the visit settled on — m² for area-priced solutions. */
  areaM2?: number;
  /** …or a count, for solutions priced per tree / cistern / barraginha. */
  units?: number;
  /** The day of the visit, YYYY-MM-DD, when given. */
  date?: string;
  /** When it was recorded, ISO. */
  recordedAt: string;
}

export function parseVisit(raw: string | null | undefined): VisitChoice | null {
  if (!raw) return null;
  try {
    const v = JSON.parse(raw);
    if (!v || typeof v.solutionId !== 'string' || !getSolution(v.solutionId)) return null;
    const out: VisitChoice = { solutionId: v.solutionId, recordedAt: String(v.recordedAt ?? '') };
    if (Number(v.areaM2) > 0) out.areaM2 = Number(v.areaM2);
    if (Number(v.units) > 0) out.units = Math.round(Number(v.units));
    if (typeof v.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v.date)) out.date = v.date;
    return out;
  } catch {
    return null;
  }
}

/**
 * Validate what the coordinator sent and turn it into the stored choice.
 * Returns an error string the route answers with, never throws.
 */
export function visitFromInput(
  body: { solutionId?: unknown; areaM2?: unknown; units?: unknown; date?: unknown },
  now = new Date(),
): VisitChoice | { error: string } {
  const solutionId = String(body.solutionId ?? '').trim();
  if (!getSolution(solutionId)) return { error: 'unknown solution' };
  const out: VisitChoice = { solutionId, recordedAt: now.toISOString() };
  const basis = SOLUTION_COSTS[solutionId]?.basis;
  const area = Number(String(body.areaM2 ?? '').replace(',', '.'));
  const units = Number(String(body.units ?? '').replace(',', '.'));
  // The size goes where the solution is priced: a count for a per-unit
  // solution, m² otherwise. Storing both would let two surfaces disagree.
  if (basis === 'unit') {
    if (units > 0) out.units = Math.round(units);
  } else if (area > 0) {
    out.areaM2 = Math.round(area);
  }
  const date = String(body.date ?? '').trim();
  if (date) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return { error: 'date must be YYYY-MM-DD' };
    out.date = date;
  }
  return out;
}

/** Whether a solution is sized by a count rather than an area. */
export const sizedByUnits = (solutionId: string) => SOLUTION_COSTS[solutionId]?.basis === 'unit';

export interface VisitOption {
  solutionId: string;
  label: string;
  /** Their reaction in Encontro 3, when they tested it. */
  reaction?: SolutionTest['reaction'];
}

/**
 * What the coordinator can pick from: what the organisation tested — the ones
 * that made sense first — then every other solution in catalogue order.
 */
export function visitOptions(testsJson: string | null | undefined, lang: Lang = 'pt'): { tested: VisitOption[]; others: VisitOption[] } {
  const rank = { 'faz-sentido': 0, 'ainda-nao-sabemos': 1, 'nao-e-pra-gente': 2 } as Record<string, number>;
  const tests = parseTests(testsJson ?? '');
  const label = (id: string) => {
    const s = getSolution(id);
    return s ? (lang === 'pt' ? s.pt.label : s.en.label) : id;
  };
  const tested = tests
    .filter(t => getSolution(t.solutionId))
    .map(t => ({ solutionId: t.solutionId, label: label(t.solutionId), reaction: t.reaction }))
    .sort((a, b) => (rank[a.reaction ?? ''] ?? 3) - (rank[b.reaction ?? ''] ?? 3));
  const seen = new Set(tested.map(t => t.solutionId));
  const others = NBS_SOLUTIONS.filter(s => !seen.has(s.id)).map(s => ({ solutionId: s.id, label: label(s.id) }));
  return { tested, others };
}

/** "Jardins de chuva · 120 m² · visita em 23/10" — one line for a card or a page. */
export function visitSummary(v: VisitChoice, lang: Lang = 'pt'): string {
  const s = getSolution(v.solutionId);
  const parts = [s ? (lang === 'pt' ? s.pt.label : s.en.label) : v.solutionId];
  const loc = lang === 'pt' ? 'pt-BR' : 'en-US';
  if (v.areaM2) parts.push(`${v.areaM2.toLocaleString(loc)} m²`);
  if (v.units) {
    const c = SOLUTION_COSTS[v.solutionId];
    const unit = v.units === 1 ? (lang === 'pt' ? c?.unitPt : c?.unitEn) : (lang === 'pt' ? c?.unitPluralPt : c?.unitPluralEn);
    parts.push(`${v.units.toLocaleString(loc)}${unit ? ` ${unit}` : ''}`);
  }
  if (v.date) {
    const [y, m, d] = v.date.split('-');
    parts.push(lang === 'pt' ? `visita em ${d}/${m}/${y}` : `visited ${d}/${m}/${y}`);
  }
  return parts.join(' · ');
}

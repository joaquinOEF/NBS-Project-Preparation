// ============================================================================
// IN WHAT SCALE DOES THIS COUNT — the sentence that makes the number survive
// ============================================================================
// Encontro 3 tells an organisation its rain garden holds ~240 thousand litres
// and stops there. The organisation in Sarandi is thinking about 2024. Nothing
// on the page connects the two, so the number reads as an answer to a flood it
// cannot touch — and the first technical reader who does the division is the
// one who tells them, in front of a funder.
//
// The arithmetic is theirs, not ours: their own retained volume over the volume
// each event actually generates. What we supply is the denominators, and those
// come from `NBS_EVENT_SCALE` — the manual Conceito Arte sent unprompted,
// computed for the Bacia do Sarandi and explicitly illustrative.
//
// ⚠️ WHICH IS WHY EVERY LINE NAMES THE BASIN. Using a Sarandi denominator for a
// project in Azenha without saying so would be inventing precision, which is
// the exact failure this file exists to prevent. It is an order of magnitude,
// it says it is an order of magnitude, and it is still the most useful sentence
// on the page: the difference between 11% and 0.03% is a different project.
// ============================================================================

import { NBS_EVENT_SCALE, NBS_SCALE_HONESTY, estimateRetentionM3 } from './nbs-performance';
import { familyOfWorry } from './site-knowledge';

export interface ScaleStatement {
  /** Their project's retained volume, m³ per event — the numerator. */
  volumeM3: number;
  rows: Array<{
    labelPt: string;
    labelEn: string;
    /** Share of THIS event this project's volume covers. */
    pct: number;
    meaningful: boolean;
    verdictPt: string;
    verdictEn: string;
  }>;
  /** The event where this project genuinely counts — what to lead with. */
  bestPt: string;
  bestEn: string;
  linesPt: string[];
  linesEn: string[];
}

/**
 * One significant figure below 1%, one decimal below 10, whole numbers above —
 * and never "0,00%", which reads as zero and is not what the arithmetic says.
 */
const up = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);

function pctLabel(pct: number, lang: 'pt' | 'en'): string {
  if (pct > 0 && pct < 0.01) return lang === 'pt' ? 'menos de 0,01%' : 'under 0.01%';
  const n = pct < 1 ? pct.toFixed(2) : pct < 10 ? pct.toFixed(1) : String(Math.round(pct));
  return lang === 'pt' ? `${n.replace('.', ',')}%` : `${n}%`;
}

/**
 * Null when there is nothing honest to say: no water figure for these
 * solutions, no area to scale it over, or a worry that is not about water —
 * a heat project does not get a flood comparison bolted onto it.
 */
export function scaleStatement(
  solutionIds: string[],
  areaM2: number,
  worry: string | null | undefined,
): ScaleStatement | null {
  if (!areaM2 || areaM2 <= 0) return null;
  const family = familyOfWorry(String(worry ?? '').split(',')[0].trim());
  if (family !== 'flood') return null;

  // Their volume, from the same retention figures the benefit line uses — so
  // the percentage and the litres can never tell different stories.
  const volumes = solutionIds
    .map(id => estimateRetentionM3(id, areaM2))
    .filter((v): v is { min: number; max: number } => !!v);
  if (!volumes.length) return null;
  const volumeM3 = volumes.reduce((sum, v) => sum + (v.min + v.max) / 2, 0);
  if (volumeM3 <= 0) return null;

  const rows = NBS_EVENT_SCALE.map(e => ({
    labelPt: e.label.pt,
    labelEn: e.label.en,
    pct: (volumeM3 / e.volumeM3) * 100,
    /** What the WHOLE network reaches on the same event — the manual's figure. */
    portfolioPct: e.absorbedPct,
    meaningful: e.meaningful,
    verdictPt: e.verdict.pt,
    verdictEn: e.verdict.en,
  }));

  // Lead with where it counts, not with where it does not. The organisation is
  // not being told its project is small; it is being told which problem it is
  // actually for.
  const best = [...rows].filter(r => r.meaningful).sort((a, b) => b.pct - a.pct)[0] ?? rows[rows.length - 1];
  const worst = rows.reduce((a, b) => (a.pct < b.pct ? a : b));

  // ⚠️ Two columns, and the second one is the argument. A single project is a
  // fraction of a percent of any of these events — printing that alone reads as
  // "your project does not matter", which is both discouraging and wrong. The
  // manual's own figures are for the NETWORK's combined volume, and the honest
  // sentence is the comparison: alone it is this, together it is that. That is
  // not consolation, it is the reason the programme is a programme.
  const linesPt = [
    '**Em que escala isso conta.**',
    ...rows.map(r =>
      `- ${r.labelPt}: este projeto sozinho, ${pctLabel(r.pct, 'pt')} · a rede inteira junta, cerca de ${pctLabel(r.portfolioPct, 'pt')} — ${r.verdictPt}`),
    `\nÉ em **${best.labelPt.toLowerCase()}** que isto pesa. E pesa junto: sozinho o projeto é uma fração de por cento de qualquer um desses eventos — é somado ao das outras organizações da rede que vira número.`,
    `\nJá ${worst.labelPt.toLowerCase()} é outra escala. ${up(NBS_SCALE_HONESTY.doesNotSolve.pt.slice(0, 2).join(' e '))} não se resolvem com soluções baseadas na natureza — dizer isso num edital é o que separa um projeto sério de um otimista.`,
    '_Ordem de grandeza: os volumes de referência são da Bacia do Sarandi, do material técnico que uma organização da rede enviou. Servem pra comparar escalas, não pra dimensionar a obra._',
  ];
  const linesEn = [
    '**What scale this counts at.**',
    ...rows.map(r =>
      `- ${r.labelEn}: this project alone, ${pctLabel(r.pct, 'en')} · the whole network together, about ${pctLabel(r.portfolioPct, 'en')} — ${r.verdictEn}`),
    `\nIt is at **${best.labelEn.toLowerCase()}** that this weighs. And it weighs together: alone the project is a fraction of a percent of any of these events — it becomes a number when added to the others in the network.`,
    `\n${worst.labelEn} is another scale. ${up(NBS_SCALE_HONESTY.doesNotSolve.en.slice(0, 2).join(' and '))} are not solved by nature-based solutions — saying so in a funding application is what separates a serious project from an optimistic one.`,
    '_Order of magnitude: the reference volumes are for the Bacia do Sarandi, from technical material one of the network organisations sent. They compare scales; they do not size the works._',
  ];

  return { volumeM3, rows, bestPt: best.labelPt, bestEn: best.labelEn, linesPt, linesEn };
}

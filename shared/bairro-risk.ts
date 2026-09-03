// ============================================================================
// A STORED BAIRRO RECORD, CHECKED AGAINST THE TRUTH
// ============================================================================
// ⚠️ Why this exists. An organisation's Encontro 2 map selection on
// 2026-08-03T18:35 recorded `flood: 0%, heat: 43%, landslide: 1%` for Partenon.
// Its own Encontro 3 selection of the SAME bairro, a month later, recorded
// `88 / 83 / 85`. Commit 33ae4b19 — "every org was told its flood risk was
// baixo" — landed at 20:05 that day, ninety minutes after the first. The
// pre-fix formatter read `meanFlood`, a structurally compressed absolute
// product; the fix reads the within-city rank.
//
// The writer has been correct since. The stored values are frozen wrong for
// every organisation whose Encontro 2 ran before that moment, and nothing
// errors: `_bairro_*_pct` drives rankFamiliasForSite, the site card, the
// hazard read-back ("nosso mapa diz que o risco de enchente é baixo") and the
// roadmap's exposure sentence. That organisation reads flood 0 for a bairro in
// the city's top 12%, so águas-pluviais is quietly ranked below everything else
// for exactly the org that needs it most.
//
// A wrong number that never throws is only ever found by comparing it with the
// right one. That is all this file does. (backlog #35)
// ============================================================================

import { BAIRRO_RISK, type BairroRisk } from './bairro-risk-table';

/** Accents, case and the stray suffix a free-text bairro field collects. */
const norm = (s: string) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

const BY_NAME = new Map(BAIRRO_RISK.map(b => [norm(b.name), b]));

/**
 * The published record for a bairro name as a CBO record stores it.
 *
 * ⚠️ Only the FIRST name. `bairro` is a comma-joined list for an organisation
 * that selected more than one, and the `_pct` fields have always described the
 * primary — pinning them to the site's own bairro is a separate job the site
 * step already does.
 */
export function bairroRisk(name: string | undefined | null): BairroRisk | null {
  const first = String(name ?? '').split(',')[0].trim();
  if (!first) return null;
  return BY_NAME.get(norm(first)) ?? null;
}

export interface RiskDrift {
  bairro: string;
  field: '_bairro_flood_pct' | '_bairro_heat_pct' | '_bairro_landslide_pct';
  stored: number | null;
  correct: number;
}

/**
 * Every stored hazard percentile that disagrees with the published rank.
 *
 * A tolerance of one point absorbs rounding; anything wider is a different
 * statistic, which is exactly the failure this looks for. Returns an empty
 * array when the bairro is unknown — a name we cannot resolve is not evidence
 * of drift, and guessing would be the same class of error.
 */
export function riskDrift(fields: Record<string, string | undefined>): RiskDrift[] {
  const truth = bairroRisk(fields.bairro);
  if (!truth) return [];
  const pairs = [
    ['_bairro_flood_pct', truth.flood],
    ['_bairro_heat_pct', truth.heat],
    ['_bairro_landslide_pct', truth.landslide],
  ] as const;
  const out: RiskDrift[] = [];
  for (const [field, correct] of pairs) {
    const raw = fields[field];
    const stored = raw == null || raw.trim() === '' ? null : Number(raw);
    if (stored != null && Number.isFinite(stored) && Math.abs(stored - correct) <= 1) continue;
    // ⚠️ `stored` stays null when the field was absent. Coercing it — Number(null)
    // is 0 — reports a MISSING percentile as a stored zero, which is exactly the
    // absent-versus-zero confusion this file exists to end, reintroduced one
    // line above the fix for it.
    out.push({
      bairro: truth.name,
      field,
      stored: stored != null && Number.isFinite(stored) ? stored : null,
      correct,
    });
  }
  return out;
}

/** The corrected fields for a record, ready to write. Empty when nothing drifts. */
export function correctedRiskFields(fields: Record<string, string | undefined>): Record<string, string> {
  const drift = riskDrift(fields);
  if (!drift.length) return {};
  const truth = bairroRisk(fields.bairro)!;
  const out: Record<string, string> = {};
  for (const d of drift) out[d.field] = String(d.correct);
  // `_bairros_json` is the same numbers in another shape, and the E2 checkpoint
  // rebuilds a map payload from it — leaving it stale would put the wrong
  // figures back the next time an address is resolved.
  try {
    const zones = JSON.parse(String(fields._bairros_json ?? '[]')) as Array<Record<string, unknown>>;
    if (Array.isArray(zones) && zones.length) {
      const fixed = zones.map(z =>
        norm(String(z.name ?? '')) === norm(truth.name)
          ? { ...z, flood: truth.flood, heat: truth.heat, landslide: truth.landslide }
          : z,
      );
      out._bairros_json = JSON.stringify(fixed);
    }
  } catch {
    /* a record whose JSON does not parse is left alone rather than replaced */
  }
  return out;
}

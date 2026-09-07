// ============================================================================
// THE SIZE, SAID OUT LOUD
// ============================================================================
// The footprint beat offered two roads: trace it on the map, or record that
// nobody knows. An organisation on a laptop, or one that knows its yard is
// "uns trinta por vinte", had to pick the second — and "ainda não sei o
// tamanho" is what the record then said about a place they could have measured
// with a tape. (JVP, 2026-09-07: "still not seeing the option here to write or
// record".)
//
// ⚠️ THE PARSER REFUSES MORE THAN IT ACCEPTS, ON PURPOSE. This number is
// multiplied by a price per square metre and printed in a funder document, so
// the only sentences it accepts are the ones that unambiguously state an AREA:
//
//   "30 por 20 metros" · "20x30" · "600 m²" · "600 metros quadrados" · "meio
//   hectare"
//
// A bare length must not become an area: "uns 20 metros de rua" is 20 metres of
// something, and reading it as 20 m² would be a fabricated measurement wearing
// the org's own words. Everything it cannot read falls through to the
// comparison chips (shared/w3-gap-questions.ts), which is the honest road.
// ============================================================================

export interface SpokenArea {
  m2: number;
  /** How they said it — recorded as provenance, never as a measurement. */
  basis: 'dimensions' | 'area' | 'hectares';
}

/** "2.900" / "2,5" / "2900" → 2900 / 2.5 / 2900, in either locale's habits. */
function num(raw: string): number {
  const s = raw.trim();
  // A comma with 1–2 trailing digits is a decimal comma (pt); dots elsewhere in
  // the same token are thousands separators.
  const normalized = /,\d{1,3}$/.test(s)
    ? s.replace(/\./g, '').replace(',', '.')
    : s.replace(/,/g, '');
  const n = Number(normalized.replace(/\.(?=\d{3}\b)/g, ''));
  return Number.isFinite(n) ? n : NaN;
}

const N = String.raw`\d{1,3}(?:[.,]\d{1,3})*(?:[.,]\d+)?`;

/** Plausible for a community intervention: a broom cupboard to twenty hectares. */
const MIN_M2 = 2;
const MAX_M2 = 200_000;

export function parseSpokenArea(text: string): SpokenArea | null {
  const t = String(text ?? '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
  if (!t) return null;

  // ── "30 por 20 metros" / "30x20" / "30 by 20 metres" ──────────────────────
  const dims = new RegExp(`(${N})\\s*(?:m|metros?|meters?|metres?)?\\s*(?:por|x|×|by)\\s*(${N})\\s*(?:m|metros?|meters?|metres?)?\\b`).exec(t);
  if (dims) {
    const a = num(dims[1]);
    const b = num(dims[2]);
    if (a > 0 && b > 0) {
      const m2 = a * b;
      if (m2 >= MIN_M2 && m2 <= MAX_M2) return { m2, basis: 'dimensions' };
    }
  }

  // ── "meio hectare" / "2 hectares" / "1,5 ha" ──────────────────────────────
  if (/\b(meio|metade de um)\s+hectare\b|\bhalf a hectare\b/.test(t)) {
    return { m2: 5_000, basis: 'hectares' };
  }
  const ha = new RegExp(`(${N})\\s*(?:hectares?|ha)\\b`).exec(t);
  if (ha) {
    const m2 = num(ha[1]) * 10_000;
    if (m2 >= MIN_M2 && m2 <= MAX_M2) return { m2, basis: 'hectares' };
  }

  // ── "600 m²" / "600 metros quadrados" / "600 square metres" ───────────────
  // ⚠️ `\\b` cannot follow "m²": the superscript is not a word character, so the
  // boundary never matches at end of input and "uns 2.900 m²" parsed as
  // nothing. A negative lookahead is the right guard for a unit that can end
  // in punctuation.
  const area = new RegExp(`(${N})\\s*(?:m²|m2|metros? quadrados?|square (?:meters?|metres?)|sq ?m)(?![a-z0-9])`).exec(t);
  if (area) {
    const m2 = num(area[1]);
    if (m2 >= MIN_M2 && m2 <= MAX_M2) return { m2, basis: 'area' };
  }

  // Anything else — including a bare length — is not an area. Say so by saying
  // nothing: the comparison chips ask again, properly.
  return null;
}

/** What the record will say the number came from. Never "medido". */
export const SPOKEN_AREA_SOURCE = {
  dimensions: { pt: 'dito pela organização, em metros', en: 'stated by the organisation, in metres' },
  area: { pt: 'dito pela organização', en: 'stated by the organisation' },
  hectares: { pt: 'dito pela organização, em hectares', en: 'stated by the organisation, in hectares' },
} as const;

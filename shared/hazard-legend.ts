// ============================================================================
// HAZARD LEGEND — reading a hazard ramp back out of its own legend spec
// ============================================================================
// The E2 "Como ler este mapa" sheet explains what the colors on the hazard
// raster mean. It MUST derive that explanation from the same LegendSpec the
// gradient bar is drawn from (client/public/sample-data/layer-legends.json),
// never from hand-written color words — the three POA hazard ramps disagree
// with each other about which end is dangerous, and prose drifts the moment
// the tiles are regenerated:
//
//   poa_flood_hazard      0.104 #3c2c6c (dark purple) → 0.62  #4dc16b (GREEN)
//   poa_heat_hazard       0.239 #addc70 (green)       → 0.719 #fdbd72 (orange)
//   poa_landslide_hazard  0.007 #289f53 (green)       → 0.393 #d7ee99 (pale green)
//
// So green is the SAFE end on heat and landslide and the DANGEROUS end on
// flood, and the tour shows them back to back. `rampWarningKey` detects that
// from the stops instead of asserting it, so the warning disappears on its own
// if the tiles are ever re-baked onto a shared ramp.
//
// shared/ (not client/) so scripts and tests can import it without a DOM.

import type { LegendSpec } from './legend-types';

/** The five bands the sheet shows, in ascending risk. Keys index `riskBands.*`. */
export const RISK_BAND_KEYS = [
  'very_low',
  'low',
  'moderate',
  'high',
  'very_high',
] as const;

export type RiskBandKey = (typeof RISK_BAND_KEYS)[number];

export interface LegendBand {
  key: RiskBandKey;
  /** Hex color sampled at the band's midpoint. */
  color: string;
  /** Data value at the band's midpoint, in the spec's `unit`. */
  value: number;
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
  ];
}

function rgbToHex([r, g, b]: [number, number, number]): string {
  const p = (n: number) => Math.round(n).toString(16).padStart(2, '0');
  return `#${p(r)}${p(g)}${p(b)}`;
}

/**
 * Sample a gradient spec at `t` in [0,1] across its own value range.
 * Linear in RGB — the same interpolation the CSS gradient bar performs, so a
 * swatch always matches the pixel under it.
 */
export function sampleRamp(spec: LegendSpec, t: number): string {
  const stops = spec.stops;
  if (!stops.length) return '#888888';
  if (stops.length === 1) return stops[0].color;

  const min = spec.min ?? stops[0].value;
  const max = spec.max ?? stops[stops.length - 1].value;
  const v = min + clamp01(t) * (max - min);

  for (let i = 0; i < stops.length - 1; i++) {
    const lo = stops[i];
    const hi = stops[i + 1];
    if (v <= hi.value || i === stops.length - 2) {
      const f = clamp01((v - lo.value) / (hi.value - lo.value || 1));
      const a = hexToRgb(lo.color);
      const b = hexToRgb(hi.color);
      return rgbToHex([
        a[0] + (b[0] - a[0]) * f,
        a[1] + (b[1] - a[1]) * f,
        a[2] + (b[2] - a[2]) * f,
      ]);
    }
  }
  return stops[stops.length - 1].color;
}

/** Value at the midpoint of band `i` (0-4), in the spec's own unit. */
function bandValue(spec: LegendSpec, i: number): number {
  const stops = spec.stops;
  const min = spec.min ?? stops[0].value;
  const max = spec.max ?? stops[stops.length - 1].value;
  return min + ((i + 0.5) / RISK_BAND_KEYS.length) * (max - min);
}

/**
 * Five swatches, one per risk band, sampled at each band's midpoint.
 * Continuous ramps have no classes of their own — the bands are the five
 * `riskBands.*` labels already used by the zone tooltip, so a CBO reads one
 * vocabulary across the whole tool.
 */
export function legendBands(spec: LegendSpec | undefined): LegendBand[] {
  if (!spec || spec.kind !== 'gradient' || !spec.stops?.length) return [];
  return RISK_BAND_KEYS.map((key, i) => ({
    key,
    color: sampleRamp(spec, (i + 0.5) / RISK_BAND_KEYS.length),
    value: bandValue(spec, i),
  }));
}

/**
 * Is this color read as "green" by someone using traffic-light intuition?
 * Hue 70-165 with enough saturation to be a hue at all. Deliberately wide:
 * #d7ee99 (pale yellow-green, landslide's high end, hue 76) counts, because on
 * a map it still reads as "fine, nothing here".
 */
export function isGreenish(hex: string): boolean {
  const [r, g, b] = hexToRgb(hex).map(c => c / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  if (d < 0.08) return false; // grey

  const l = (max + min) / 2;
  const s = d / (1 - Math.abs(2 * l - 1));
  if (s < 0.15) return false; // washed out

  let h: number;
  if (max === r) h = ((g - b) / d) % 6;
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  h *= 60;
  if (h < 0) h += 360;

  return h >= 70 && h <= 165;
}

export type RampWarning = 'inverted' | 'lowContrast';

/**
 * What's misleading about this ramp, judged from its own endpoints.
 *
 * - `inverted`    — the dangerous end is green and the safe end isn't (flood).
 * - `lowContrast` — both ends are green, so the whole city reads as safe and
 *                   the real variation is invisible (landslide).
 *
 * Returns null for a ramp that behaves the way people expect (heat).
 */
export function rampWarning(spec: LegendSpec | undefined): RampWarning | null {
  if (!spec || spec.kind !== 'gradient' || spec.stops.length < 2) return null;
  const lo = isGreenish(spec.stops[0].color);
  const hi = isGreenish(spec.stops[spec.stops.length - 1].color);
  if (hi && !lo) return 'inverted';
  if (hi && lo) return 'lowContrast';
  return null;
}

/**
 * A compact, factual description of the ramp for the agent to reason from when
 * the user escalates a map question into the chat. Handing over the actual
 * hex/value pairs is what stops it repeating the inverted color sentence that
 * lived in data-provenance.ts.
 */
export function describeRamp(spec: LegendSpec | undefined): string {
  if (!spec || !spec.stops?.length) return 'sem escala de cores disponível';
  const lo = spec.stops[0];
  const hi = spec.stops[spec.stops.length - 1];
  const unit = spec.unit ? `, ${spec.unit}` : '';
  const sampled =
    spec.source === 'sampled' ? ', faixa p2–p98 observada em Porto Alegre' : '';
  return (
    `${spec.layerId}: menor risco ${lo.color} (${lo.value}) → ` +
    `maior risco ${hi.color} (${hi.value})${unit}${sampled}`
  );
}

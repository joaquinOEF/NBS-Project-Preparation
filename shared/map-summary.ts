// ============================================================================
// WHAT THE ORGANISATION READS BACK AFTER A MAP SESSION
// ============================================================================
// The map produces two texts, and they are not the same text:
//
//   • the PAYLOAD (formatMapResult, in cbo-profile.tsx) — coordinates, raster
//     values, percentiles — which the model reads and nobody sees;
//   • this SUMMARY, which is the green bubble in the chat and the only record
//     the room has of what it just did on the map.
//
// Two rules follow from that, and both were broken in the field (JVP, screenshot
// 2026-09-07, on the E3 footprint step):
//
//  1. ⚠️ A USER BUBBLE IS NOT RENDERED AS MARKDOWN. cbo-profile renders the
//     user's own messages as plain text — deliberately, so a person who types
//     an underscore sees an underscore. This string goes into that bubble, so
//     `_(comparado…)_` reached the room with the underscores in it. Nothing
//     composed here may carry markdown; `e2e/map-summary.spec.ts` fails if it
//     does.
//
//  2. ⚠️ THE SUMMARY IS ABOUT THE SESSION THAT JUST RAN. The E3 footprint step
//     asks one question — how big is it — and answered it with the Encontro 2
//     hazard read-out: three risk bands, the population of the bairro, a
//     priority star, and a site line reading "Área desenhada (0 pontos)". The
//     one number the org had just produced, 2 900 m², was the one thing missing.
//     A footprint session now reports the footprint.
// ============================================================================

import type { MapSelectionResult } from './concept-note-schema';
import { hazardPercentile, riskBand, dominantPercentile } from './risk-display';
import { polygonAreaM2, roundAreaM2 } from './w3-sizing';

const BAND_WORDS: Record<'pt' | 'en', Record<string, string>> = {
  pt: { very_low: 'muito baixo', low: 'baixo', moderate: 'moderado', high: 'alto', very_high: 'muito alto' },
  en: { very_low: 'very low', low: 'low', moderate: 'moderate', high: 'high', very_high: 'very high' },
};
const BAND_WORDS_F: Record<'pt' | 'en', Record<string, string>> = {
  pt: { very_low: 'muito baixa', low: 'baixa', moderate: 'moderada', high: 'alta', very_high: 'muito alta' },
  en: BAND_WORDS.en,
};

/** Band word for a 0–100 WITHIN-CITY percentile (never for a raw mean). */
const bandWord = (pct: number, lang: 'pt' | 'en', fem = false) =>
  (fem ? BAND_WORDS_F : BAND_WORDS)[lang][riskBand(pct).key];

/** Every polygon the user traced in this session, in m². 0 = they traced none. */
export function drawnAreaM2(result: MapSelectionResult): number {
  return roundAreaM2(
    result.selectedAssets
      .filter(a => a.type !== 'zone' && (a.geometry as any)?.type === 'Polygon')
      .reduce((acc, a) => acc + polygonAreaM2(a.geometry as any), 0),
  );
}

/**
 * The bubble the room reads. Plain text, no markdown — see rule 1 above.
 *
 * ⚠️ CBO-RISK-SCALE (JVP, 2026-08-03: Site Explorer said Floresta was flood
 * "Muito Alto · 97", the CBO chat told the same org "inundação baixo").
 *
 * Both numbers were real. They are different statistics, and the CBO flow was
 * using the wrong one. `meanFlood` is the absolute (H×E×V)^⅓ product, which
 * shared/risk-display.ts documents as "structurally compressed (rarely > ~0.2)"
 * — and the words below were being applied to it with 0.33/0.66 thresholds.
 *
 * Measured over the 94 POA bairros: ZERO have meanFlood ≥ 0.33 (max 0.242) and
 * ZERO have meanLandslide ≥ 0.33. So the old code could not return anything but
 * "baixo" for flood and landslide, in every neighbourhood in the city, forever
 * — including the single worst flood bairro in Porto Alegre.
 *
 * That is not just a label: this string is parsed back into _bairro_*_pct,
 * which drives the site card, the hazard-check read-back ("nosso mapa diz que o
 * risco de enchente é baixo") and rankFamiliasForSite — so águas-pluviais and
 * encostas-e-solo were systematically down-ranked for every org in the cohort.
 *
 * Fixed by using the WITHIN-CITY PERCENTILE (floodRank/heatRank/landslideRank)
 * via shared/risk-display.ts — the same module and the same basis the
 * coordinator's Site Explorer already uses. One source of truth, as intended.
 */
export function buildMapSummary(result: MapSelectionResult, langRaw: string): string {
  const lang: 'pt' | 'en' = langRaw === 'pt' ? 'pt' : 'en';
  const L = lang === 'pt';
  const zones = result.selectedAssets.filter(a => a.type === 'zone');
  const sites = result.selectedAssets.filter(a => a.type !== 'zone');

  // ── A footprint session: they traced an area, so the area is the answer ────
  const area = drawnAreaM2(result);
  if (area > 0) {
    const m2 = area.toLocaleString(L ? 'pt-BR' : 'en-US');
    const out = [
      L ? `📐 Desenhei a área no mapa: cerca de ${m2} m²` : `📐 I traced the area on the map: about ${m2} m²`,
    ];
    const where = zones[0]?.name;
    if (where) out.push(`📍 ${where}, Porto Alegre`);
    return out.join('\n');
  }

  // ── Anything else: where they are, and what the city data says about it ───
  const out: string[] = [L ? 'Selecionei no mapa:' : 'Selected on the map:'];
  for (const z of zones) {
    const p: any = z.properties || {};
    out.push(`${L ? 'Bairro' : 'Neighborhood'} ${z.name}`);
    out.push(`🔵 ${L ? 'inundação' : 'flood'} ${bandWord(hazardPercentile(p, 'flood'), lang)} · 🔴 ${L ? 'calor' : 'heat'} ${bandWord(hazardPercentile(p, 'heat'), lang)} · 🟤 ${L ? 'deslizamento' : 'landslide'} ${bandWord(hazardPercentile(p, 'landslide'), lang)}`);
    // The percentile is relative to the rest of the city — say so, or "alto"
    // reads as an absolute claim about danger. Plain parentheses: this bubble
    // is not markdown (rule 1), and the italics reached the room as underscores.
    out.push(L ? '(comparado com os outros bairros de Porto Alegre)' : '(compared with the other neighbourhoods in Porto Alegre)');
    const pop = p.populationTotal || p.populationSum;
    const bits: string[] = [];
    if (pop) bits.push(`👥 ~${Number(pop).toLocaleString(L ? 'pt-BR' : 'en-US')} ${L ? 'moradores' : 'residents'}`);
    // Priority reads off the dominant hazard's display percentile — the same
    // basis as the coordinator's priority badge (risk-display.dominantPercentile),
    // not the compressed absolute priorityScore.
    if (p.priorityScore != null) bits.push(`⭐ ${L ? 'prioridade' : 'priority'} ${bandWord(dominantPercentile(p), lang, L)}`);
    if (bits.length) out.push(bits.join(' · '));
  }
  if (sites.length) {
    const names = sites.slice(0, 3).map(s => s.name).join(', ');
    const noun = L ? (sites.length === 1 ? 'local' : 'locais') : (sites.length === 1 ? 'site' : 'sites');
    out.push(`📍 ${sites.length} ${noun}: ${names}${sites.length > 3 ? ` +${sites.length - 3}` : ''}`);
  } else if (result.siteDeferred) {
    out.push(L ? '📍 Sem local específico ainda — vamos trabalhar com o bairro todo por enquanto.' : '📍 No specific site yet — working with the whole neighborhood for now.');
  }
  return out.join('\n');
}

/**
 * Markdown that would reach the room as punctuation. Used by the guard test and
 * by anything else that composes a user-visible bubble.
 */
export const MARKDOWN_IN_PLAIN_TEXT = /(\*\*|__|(?:^|\s)[_*][^\s_*][^_*]*[_*](?:$|[\s.,;:!?]))/m;

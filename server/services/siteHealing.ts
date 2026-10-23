// ============================================================================
// THE BAIRRO FIGURES A DOCUMENT READS — taken from where the pin is
// ============================================================================
// Audit of the 13 production records, 23 Oct 2026 (docs/census-2022.md):
//   · Encontro 2 stores `_bairro_*_pct` from the FIRST bairro of a list
//     ("Centro Histórico, Floresta") and the site step never re-pinned them,
//     so Cooperativa 20 de Novembro and Desabafa print another bairro's hazards;
//   · SDV's pin is in Lomba do Pinheiro, its figures are Agronomia's;
//   · 19 bairros have no figures in the older census table, so a missing
//     poverty rate was stored as "0.0" (Periferia Feminista, Vila São José).
//
// The record is NOT rewritten — what they answered stays as it is. Every
// document reads the site through `healSite`, which puts the right figures in
// for the bairro the pin is actually in (the census tract's official name):
// hazards from the published table, population from the 2022 Census, poverty
// only where the table has one (never a missing value as 0).
// ============================================================================

import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { bairroRisk, riskDrift } from '@shared/bairro-risk';
import { sitePoint } from './siteContext';
import { censusBairroAt, censusBairroPopulation } from './censusContext';

type Rec = Record<string, string | undefined>;
const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

let poverty: Map<string, number | null> | null = null;
function povertyOf(bairro: string): number | null | undefined {
  if (!poverty) {
    poverty = new Map();
    const f = path.join(process.cwd(), 'client', 'public', 'sample-data', 'porto-alegre-ibge-indicators.json');
    if (existsSync(f)) {
      for (const x of JSON.parse(readFileSync(f, 'utf8')).features ?? []) {
        const r = x.properties?.poverty_rate;
        poverty.set(norm(String(x.properties?.neighbourhood_name ?? '')), typeof r === 'number' ? r : null);
      }
    }
  }
  return poverty.get(norm(bairro));
}

/** The bairro the figures should describe: the pin's, else the first one they named. */
export function figuresBairro(site: Rec): string | null {
  const pin = sitePoint(site);
  const atPin = pin ? censusBairroAt(pin.lat, pin.lng) : null;
  return atPin ?? (String(site.bairro ?? '').split(',')[0].trim() || null);
}

/**
 * The site as a document should read it. Pure on the input; never written back.
 * Changes figures only where they are wrong or missing — a correct stored value
 * (an older census population, say) is left as it is:
 *   · the pin is in another bairro than the one they named first, or they named a list;
 *   · a hazard disagrees with the published table (riskDrift);
 *   · population is missing, "?" or 0;
 *   · poverty is "0.0" for a bairro the table has no figure for (unknown, not zero).
 */
export function healSite<T extends Rec>(site: T): T {
  if (!site) return site;
  const name = figuresBairro(site);
  const truth = name ? bairroRisk(name) : null;
  if (!truth) return site;
  const first = String(site.bairro ?? '').split(',')[0].trim();
  const moved = !!first && (norm(first) !== norm(name!) || String(site.bairro ?? '').includes(','));
  const out: Rec = { ...site };
  const drift = riskDrift({ ...site, bairro: name! }).length > 0;
  if (moved || drift) {
    out._bairro_flood_pct = String(truth.flood);
    out._bairro_heat_pct = String(truth.heat);
    out._bairro_landslide_pct = String(truth.landslide);
  }
  const popMissing = !(Number(site.bairro_population) > 0);
  if (moved || popMissing) {
    const pop = censusBairroPopulation(name!);
    if (pop) out.bairro_population = String(pop);
  }
  const pov = povertyOf(name!);
  if (moved) {
    if (typeof pov === 'number') out.bairro_poverty_pct = (pov * 100).toFixed(1);
    else delete out.bairro_poverty_pct;
  } else if (pov === null && Number(site.bairro_poverty_pct) === 0) {
    delete out.bairro_poverty_pct; // unknown is unknown, never 0.0
  }
  return out as T;
}

/** The same, on a whole session state (for the Perfil, which reads the state). */
export function healStateSite<S extends { sections: any }>(state: S | null): S | null {
  const fields = state?.sections?.intervention_site?.fields;
  if (!state || !fields) return state;
  const flat: Rec = Object.fromEntries(Object.entries(fields).map(([k, f]: [string, any]) => [k, f?.value == null ? undefined : String(f.value)]));
  const healed = healSite(flat);
  const nextFields: Record<string, any> = {};
  for (const [k, v] of Object.entries(healed)) {
    if (v === undefined) continue;
    nextFields[k] = fields[k] && String(fields[k].value) === v ? fields[k] : { ...(fields[k] ?? { confidence: 'high', source: 'census' }), value: v };
  }
  return { ...state, sections: { ...state.sections, intervention_site: { ...state.sections.intervention_site, fields: nextFields } } };
}

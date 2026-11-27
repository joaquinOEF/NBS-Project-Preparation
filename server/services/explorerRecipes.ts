// ============================================================================
// SITE EXPLORER CHAT — the recipes behind the chips and the agent's map tools
// ============================================================================
// One implementation, two callers (shared/explorer-chat.ts has the contract):
//
//   - POST /api/agent/explorer-recipe — a chip. No model anywhere on the path;
//     the answer is the data, the `mapCommands` the page applies, and a
//     TEMPLATE narration written from that data alone.
//   - the legacy agent's tools (agentService.ts: show_map, focus_place,
//     rank_places, propose_site) — a typed question. The model gets the same
//     structured result and is told to narrate it, never to add a number.
//
// Deterministic and local: committed hazard files, the committed census, the
// committed OSM snapshot. Hazard is official data only (SGB flood + landslide,
// the climate plan's heat); a ranking is the official class and then the people
// living nearby (rankPlaces.ts) — there is no score in this file.
// ============================================================================

import { EXPLORER_KEY_MAPS, isExplorerKeyMapId, explorerKeyMap, type ExplorerKeyMapId } from '@shared/explorer-key-maps';
import { becauseFor, highReadings, noHighHazardLine } from '@shared/solution-because';
import { interventionsForHazard, type ExplorerPlaceKind } from '@shared/explorer-site';
import {
  PRESET_FOR, KIND_WORDS, HAZARD_WORDS, rankSubtitle, formatCount,
  type Bilingual, type RankBy, type ExplorerRecipeRequest, type ExplorerRecipeResult, type ExplorerMapResult,
  type ExplorerFocusResult, type ExplorerRankResult, type ExplorerProposalResult, type ExplorerRankRow,
} from '@shared/explorer-chat';
import { rankPlaces, PLACE_KINDS, RANK_HAZARDS, TOP_LEVEL } from './rankPlaces';
import { siteReadingAt, legacyInterventions, zoneByName, zoneAt, allZoneProps, type LegacyIntervention } from './explorerSite';

export class ExplorerRecipeInputError extends Error {}
export type Lang = 'pt' | 'en';
export const asLang = (v: unknown): Lang => (typeof v === 'string' && v.toLowerCase().startsWith('pt') ? 'pt' : 'en');

const pct = (share: number) => `${Math.round(share * 100)}%`;
const listOf = (xs: string[], and: string) => (xs.length <= 1 ? xs.join('') : `${xs.slice(0, -1).join(', ')} ${and} ${xs[xs.length - 1]}`);

// ── A key map ───────────────────────────────────────────────────────────────
/**
 * One more sentence under the map's caption, from the OFFICIAL shares each
 * neighbourhood carries (share of its area in SGB's classes / in the climate
 * plan's two top heat classes — scripts/generate-neighborhood-zones.ts). Plain
 * arithmetic on those shares; no flag, no cut-off of ours, no index.
 */
function mapFact(preset: ExplorerKeyMapId): Bilingual | null {
  const zs = allZoneProps();
  if (!zs.length) return null;
  const top = (field: string, n: number) => zs
    .filter(z => typeof z[field] === 'number' && z[field] > 0)
    .sort((a, b) => b[field] - a[field] || String(a.neighbourhoodName).localeCompare(String(b.neighbourhoodName)))
    .slice(0, n);
  if (preset === 'heat') {
    const half = zs.filter(z => (z.heatHighShare ?? 0) > 0.5).length;
    const whole = zs.filter(z => (z.heatHighShare ?? 0) >= 0.995).map(z => z.neighbourhoodName as string).sort((a, b) => a.localeCompare(b));
    const named = whole.slice(0, 4);
    const rest = whole.length - named.length;
    return {
      en: `In ${half} of the city's ${zs.length} neighbourhoods, more than half the area is in the plan's two highest heat classes.`
        + (whole.length ? ` ${rest > 0 ? `${named.join(', ')} and ${rest} more` : listOf(named, 'and')} ${whole.length === 1 ? 'is' : 'are'} entirely inside them.` : ''),
      pt: `Em ${half} dos ${zs.length} bairros da cidade, mais da metade da área está nas duas classes mais altas de calor do plano.`
        + (whole.length ? ` ${rest > 0 ? `${named.join(', ')} e mais ${rest}` : listOf(named, 'e')} ${whole.length === 1 ? 'está inteiro' : 'estão inteiros'} dentro delas.` : ''),
    };
  }
  if (preset === 'flood' || preset === 'landslide') {
    const field = preset === 'flood' ? 'sgbFloodAltaShare' : 'sgbLandslideAltaShare';
    const t = top(field, 3);
    if (!t.length) return null;
    const names = t.map(z => `${z.neighbourhoodName} (${pct(z[field])})`);
    return preset === 'flood'
      ? { en: `Largest share of their area in SGB's high class: ${listOf(names, 'and')}.`, pt: `Maior parcela da área na classe alta do SGB: ${listOf(names, 'e')}.` }
      : { en: `Largest share of their area in SGB's high landslide class: ${listOf(names, 'and')}.`, pt: `Maior parcela da área na classe alta de deslizamento do SGB: ${listOf(names, 'e')}.` };
  }
  if (preset === 'hotspots') return {
    en: 'Purple: floods and heats up. Red: slides and heats up. Teal: floods and slides. Nothing coloured means no two maps meet there.',
    pt: 'Roxo: inunda e esquenta. Vermelho: desliza e esquenta. Verde-azulado: inunda e desliza. Sem cor, não há dois mapas que se encontrem ali.',
  };
  return null;
}

/** Where the whole city fits (the explorer's own opening view). */
const CITY_VIEW = { lat: -30.1, lng: -51.16, zoom: 11 };

export function recipeMap(preset: unknown, view?: unknown): ExplorerMapResult {
  if (!isExplorerKeyMapId(preset)) throw new ExplorerRecipeInputError(`Unknown map: ${String(preset)}. One of: ${EXPLORER_KEY_MAPS.map(m => m.id).join(', ')}`);
  const m = explorerKeyMap(preset);
  const fact = mapFact(preset);
  return {
    type: 'map', preset,
    title: m.label,
    narration: { en: m.caption.en + (fact ? ` ${fact.en}` : ''), pt: m.caption.pt + (fact ? ` ${fact.pt}` : '') },
    sources: [m.source],
    mapCommands: [{ type: 'clear_pins' }, { type: 'show_map', preset }, ...(view === 'city' ? [{ type: 'fly_to' as const, ...CITY_VIEW }] : [])],
  };
}

// ── A place ─────────────────────────────────────────────────────────────────
/**
 * What the official maps say of a neighbourhood as a whole: the share of its
 * area in SGB's classes and in the climate plan's two top heat classes. Shares
 * only — the flags and the priority order built on them are ours, and stay out.
 */
function zoneShares(p: any): Bilingual | null {
  if (!p || typeof p.sgbLandslideShare !== 'number') return null;
  return {
    en: `Share of its area — SGB landslide susceptibility, medium or high: ${pct(p.sgbLandslideShare)} (high: ${pct(p.sgbLandslideAltaShare ?? 0)}) · SGB flood susceptibility, high: ${pct(p.sgbFloodAltaShare ?? 0)} · climate plan heat, two top classes: ${pct(p.heatHighShare ?? 0)}.`,
    pt: `Parcela da área — suscetibilidade a deslizamento do SGB, média ou alta: ${pct(p.sgbLandslideShare)} (alta: ${pct(p.sgbLandslideAltaShare ?? 0)}) · suscetibilidade a inundação do SGB, alta: ${pct(p.sgbFloodAltaShare ?? 0)} · calor do plano climático, duas classes mais altas: ${pct(p.heatHighShare ?? 0)}.`,
  };
}
const SHARES_SOURCE: Bilingual = {
  en: 'SGB/CPRM susceptibility maps, 2015 · climate plan (PLAC/ARVC), 2050 — as a share of the neighbourhood\'s area',
  pt: 'Cartas de suscetibilidade SGB/CPRM, 2015 · plano climático (PLAC/ARVC), 2050 — como parcela da área do bairro',
};

export function recipeFocus(req: { name?: unknown; lat?: unknown; lng?: unknown; zoom?: unknown }): ExplorerFocusResult {
  const zoom = typeof req.zoom === 'number' && Number.isFinite(req.zoom) ? Math.max(10, Math.min(18, req.zoom)) : undefined;
  const name = typeof req.name === 'string' ? req.name.trim() : '';
  const hasPoint = typeof req.lat === 'number' && typeof req.lng === 'number' && Number.isFinite(req.lat) && Number.isFinite(req.lng);
  if (!name && !hasPoint) throw new ExplorerRecipeInputError('focus needs a neighbourhood name, or lat and lng');
  // With both, the name says which neighbourhood to tell about and the point where to look.
  const z = name ? zoneByName(name) : zoneAt(req.lat as number, req.lng as number);
  if (name && !z && !hasPoint) return {
    type: 'focus', found: false,
    title: { en: name, pt: name },
    narration: { en: `No neighbourhood on the map is called "${name}".`, pt: `Nenhum bairro do mapa se chama "${name}".` },
    sources: [], mapCommands: [],
  };
  const where = z?.name ?? (hasPoint ? `${(req.lat as number).toFixed(4)}, ${(req.lng as number).toFixed(4)}` : name);
  const shares = zoneShares(z?.props);
  return {
    type: 'focus', found: true,
    title: { en: where, pt: where },
    narration: shares
      ? { en: `${where}. ${shares.en}`, pt: `${where}. ${shares.pt}` }
      : { en: `The map is now on ${where}.`, pt: `O mapa está agora em ${where}.` },
    sources: shares ? [SHARES_SOURCE] : [],
    mapCommands: [hasPoint
      ? { type: 'fly_to', lat: req.lat as number, lng: req.lng as number, ...(zoom ? { zoom } : {}) }
      : { type: 'focus_place', name: z!.name }],
  };
}

/**
 * The click-to-add card, opened from the chat at a point: the readings and
 * what fits are shown ON THE MAP by that card (GET /api/geospatial/hazard-at),
 * so the chat only says where to look.
 */
export async function recipeDrop(req: { lat?: unknown; lng?: unknown }): Promise<ExplorerFocusResult> {
  if (typeof req.lat !== 'number' || typeof req.lng !== 'number' || !Number.isFinite(req.lat) || !Number.isFinite(req.lng)) {
    throw new ExplorerRecipeInputError('drop needs lat and lng');
  }
  const site = await siteReadingAt(req.lat, req.lng);
  if (!site.inCity) return {
    type: 'focus', found: false, title: { en: 'New site', pt: 'Novo local' },
    narration: { en: 'That point is outside Porto Alegre.', pt: 'Esse ponto fica fora de Porto Alegre.' }, sources: [], mapCommands: [],
  };
  const where = site.bairro ?? site.zone?.name ?? '';
  const lead = site.solutions.high[0];
  return {
    type: 'focus', found: true,
    title: { en: site.suggestedName.en, pt: site.suggestedName.pt },
    narration: {
      en: `A pin is on the map${where ? ` in ${where}` : ''}. ${lead ? lead.line.en : site.solutions.none?.en ?? ''} The card beside the pin has the official readings and what fits; drag the pin to try another spot, and press Add to save.`,
      pt: `Há um pino no mapa${where ? ` em ${where}` : ''}. ${lead ? lead.line.pt : site.solutions.none?.pt ?? ''} O cartão ao lado do pino traz as leituras oficiais e o que cabe; arraste o pino para testar outro ponto e aperte Adicionar para salvar.`,
    },
    sources: [{ en: 'Flood and landslide: SGB/CPRM · heat: climate plan (PLAC/ARVC), 2050', pt: 'Inundação e deslizamento: SGB/CPRM · calor: plano climático (PLAC/ARVC), 2050' }],
    mapCommands: [{ type: 'fly_to', lat: req.lat, lng: req.lng, zoom: 16 }, { type: 'drop_site', lat: req.lat, lng: req.lng }],
  };
}

// ── A ranking ───────────────────────────────────────────────────────────────
const HAZARD_SOURCE: Record<RankBy, Bilingual> = {
  heat: { en: 'Heat: Porto Alegre climate plan (PLAC/ARVC), 2050 scenario', pt: 'Calor: Plano de Ação Climática de Porto Alegre (PLAC/ARVC), cenário 2050' },
  flood: { en: 'Flood: SGB/CPRM susceptibility map; outside it, the area the Guaíba reached in May 2024 (SMAMUS)', pt: 'Inundação: carta de suscetibilidade SGB/CPRM; fora dela, a área que o Guaíba alcançou em maio de 2024 (SMAMUS)' },
  landslide: { en: 'Landslide: SGB/CPRM susceptibility map', pt: 'Deslizamento: carta de suscetibilidade SGB/CPRM' },
};

export async function recipeRank(req: { kind?: unknown; by?: unknown; top?: unknown; bairro?: unknown }, lang: Lang): Promise<ExplorerRankResult> {
  if (typeof req.kind !== 'string' || !Object.prototype.hasOwnProperty.call(PLACE_KINDS, req.kind)) {
    throw new ExplorerRecipeInputError(`Unknown kind: ${String(req.kind)}. One of: ${Object.keys(PLACE_KINDS).join(', ')}`);
  }
  if (!RANK_HAZARDS.includes(req.by as RankBy)) throw new ExplorerRecipeInputError(`Unknown hazard: ${String(req.by)}. One of: ${RANK_HAZARDS.join(', ')}`);
  const kind = req.kind as ExplorerPlaceKind, by = req.by as RankBy;
  const top = typeof req.top === 'number' && Number.isFinite(req.top) ? req.top : undefined;
  const bairro = typeof req.bairro === 'string' && req.bairro.trim() ? req.bairro.trim() : undefined;
  const r = await rankPlaces({ kind, by, top, bairro });

  const rows: ExplorerRankRow[] = r.places.map(p => ({
    rank: p.rank, name: p.name ?? '—', bairro: p.bairro, lat: p.lat, lng: p.lng, areaHa: p.areaHa,
    residentsNearby: p.residentsNearby, radiusM: p.radiusM,
    level: p.hazard.level, label: p.hazard.label, source: p.hazard.source,
    ...(p.belowTopClass ? { belowTopClass: true as const } : {}),
  }));
  const many = KIND_WORDS[kind].many;
  const n = rows.length;
  // The rule already says so when fewer than asked for are in the top classes.
  const enough = r.filledFromNextClass === 0 && r.qualified >= n;
  const cls = r.qualifyingLevel >= TOP_LEVEL ? { en: 'in that class', pt: 'nessa classe' } : { en: 'in those classes', pt: 'nessas classes' };
  const count: Bilingual = !n
    ? { en: ` None was found${bairro ? ` in ${bairro}` : ''}.`, pt: ` Nenhum lugar encontrado${bairro ? ` em ${bairro}` : ''}.` }
    : enough
      ? {
        en: ` ${formatCount(r.qualified, 'en')} of ${formatCount(r.considered, 'en')} ${many.en} are ${cls.en}; these are the ${n} with the most people living nearby.`,
        pt: ` ${formatCount(r.qualified, 'pt')} de ${formatCount(r.considered, 'pt')} ${many.pt} estão ${cls.pt}; estes são os ${n} com mais gente morando perto.`,
      }
      : { en: '', pt: '' };
  return {
    type: 'rank', kind, by, rows, considered: r.considered, qualified: r.qualified,
    title: {
      en: `${n} ${many.en} · ${HAZARD_WORDS[by].en}${bairro ? ` · ${bairro}` : ''}`,
      pt: `${n} ${many.pt} · ${HAZARD_WORDS[by].pt}${bairro ? ` · ${bairro}` : ''}`,
    },
    narration: { en: r.rule.en + count.en, pt: r.rule.pt + count.pt },
    sources: [
      HAZARD_SOURCE[by],
      { en: `People nearby: IBGE 2022 Census, an estimate within ${r.radiusM} m — not a count`, pt: `Moradores perto: IBGE, Censo 2022, estimativa a até ${r.radiusM} m — não é contagem` },
      { en: 'Places: OpenStreetMap contributors', pt: 'Lugares: colaboradores do OpenStreetMap' },
    ],
    mapCommands: [
      { type: 'show_map', preset: PRESET_FOR[by] },
      { type: 'pin_places', fit: true, places: rows.map(row => ({ rank: row.rank, name: row.name, lat: row.lat, lng: row.lng, subtitle: rankSubtitle(row, by)[lang] })) },
    ],
  };
}

// ── A proposal ──────────────────────────────────────────────────────────────
const foldName = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
/** A legacy intervention by id or by name (either language's spelling of the English name). */
export function legacyInterventionBy(idOrName: unknown): LegacyIntervention | null {
  if (typeof idOrName !== 'string' || !idOrName.trim()) return null;
  const w = foldName(idOrName);
  const all = legacyInterventions();
  return all.find(i => i.id === idOrName.trim()) ?? all.find(i => foldName(i.name) === w) ?? all.find(i => foldName(i.name).startsWith(w) || w.startsWith(foldName(i.name))) ?? null;
}

const KINDS: ExplorerPlaceKind[] = ['parks', 'schools', 'hospitals', 'wetlands'];

export async function recipePropose(
  req: { placeName?: unknown; lat?: unknown; lng?: unknown; areaHa?: unknown; solution?: unknown; placeKind?: unknown; prefer?: unknown },
): Promise<ExplorerProposalResult> {
  if (typeof req.lat !== 'number' || typeof req.lng !== 'number' || !Number.isFinite(req.lat) || !Number.isFinite(req.lng)) {
    throw new ExplorerRecipeInputError('propose needs lat and lng');
  }
  const { lat, lng } = req;
  const site = await siteReadingAt(lat, lng);
  const placeKind = KINDS.includes(req.placeKind as ExplorerPlaceKind) ? (req.placeKind as ExplorerPlaceKind) : site.nearest?.kind ?? null;
  const siteName = (typeof req.placeName === 'string' && req.placeName.trim()) || site.suggestedName.en;
  const areaHa = typeof req.areaHa === 'number' && Number.isFinite(req.areaHa) && req.areaHa > 0 ? Math.min(500, Number(req.areaHa.toFixed(2))) : 1;
  const where = site.bairro ? `${siteName}, ${site.bairro}` : siteName;
  // The place's own outline when the point is inside one (a ranked square, a
  // school yard): the map frames it and draws it. A bare point is just flown to.
  const fly = { type: 'show_place' as const, lat, lng, geometry: site.nearest?.distanceM === 0 ? site.nearest.geometry ?? null : null };

  if (!site.inCity) {
    const line = noHighHazardLine([]);
    return {
      type: 'proposal',
      proposal: { siteName, lat, lng, bairro: null, zone: null, placeKind, readings: [], intervention: null, fits: false, because: line, areaHa, alternatives: [] },
      title: { en: siteName, pt: siteName },
      narration: { en: 'That point is outside Porto Alegre, so there is nothing official to read there.', pt: 'Esse ponto fica fora de Porto Alegre, então não há dado oficial para ler ali.' },
      sources: [], mapCommands: [],
    };
  }

  const high = highReadings(site.readings);
  // The hazard the ranking was made by comes first when it is high here too.
  const prefer = RANK_HAZARDS.includes(req.prefer as RankBy) ? (req.prefer as RankBy) : null;
  const lead = (prefer && high.find(h => h.hazard === prefer)) || high[0] || null;
  const all = legacyInterventions();
  const asked = legacyInterventionBy(req.solution);
  const forLead = lead ? interventionsForHazard(all, lead.hazard, placeKind) : [];
  const chosen = asked ?? forLead[0] ?? null;
  const lite = (i: LegacyIntervention) => ({ id: i.id, name: i.name, category: i.category });
  const because = chosen ? becauseFor(site.readings, { category: chosen.category, id: chosen.id }) : null;
  const line: Bilingual = because?.line ?? site.solutions.none ?? noHighHazardLine(site.readings);
  const fits = !!because?.fits;

  const readingsEn = site.readings.map(r => `${HAZARD_WORDS[r.hazard].en} ${r.en}`).join(' · ');
  const readingsPt = site.readings.map(r => `${HAZARD_WORDS[r.hazard].pt} ${r.pt}`).join(' · ');
  return {
    type: 'proposal',
    proposal: {
      siteName, lat, lng, bairro: site.bairro, zone: site.zone, placeKind,
      readings: site.readings,
      intervention: chosen && site.zone ? lite(chosen) : null,
      fits, because: line, areaHa,
      alternatives: forLead.filter(i => i.id !== chosen?.id).slice(0, 4).map(lite),
    },
    title: { en: where, pt: where },
    narration: {
      en: `${where}. Official readings at the point: ${readingsEn}. ${line.en}` + (chosen && site.zone ? ' Nothing is saved until you press Add.' : ''),
      pt: `${where}. Leituras oficiais no ponto: ${readingsPt}. ${line.pt}` + (chosen && site.zone ? ' Nada é salvo até você apertar Adicionar.' : ''),
    },
    sources: [
      { en: 'Flood and landslide: SGB/CPRM · heat: climate plan (PLAC/ARVC), 2050', pt: 'Inundação e deslizamento: SGB/CPRM · calor: plano climático (PLAC/ARVC), 2050' },
    ],
    mapCommands: [fly],
  };
}

/** Run one recipe. Throws ExplorerRecipeInputError on a request it cannot read. */
export async function runExplorerRecipe(req: ExplorerRecipeRequest | Record<string, unknown>, lang: Lang): Promise<ExplorerRecipeResult> {
  const r = (req ?? {}) as Record<string, unknown>;
  switch (r.recipe) {
    case 'map': return recipeMap(r.preset, r.view);
    case 'focus': return recipeFocus(r);
    case 'rank': return recipeRank(r, lang);
    case 'propose': return recipePropose(r);
    case 'drop': return recipeDrop(r);
    default: throw new ExplorerRecipeInputError(`Unknown recipe: ${String(r.recipe)}. One of: map, focus, rank, propose, drop`);
  }
}

/**
 * Read once, at boot, what the chips will ask for. A ranking's first run reads
 * the hazard at every place of the kind (2 s for 447 schools by flood, the
 * May-2024 fallback being the slow part); every run after is a memo lookup. A
 * chip pressed in front of a room should be the second run, not the first.
 */
export async function warmExplorerRecipes(): Promise<void> {
  const started = Date.now();
  for (const kind of ['parks', 'schools', 'hospitals'] as const) {
    for (const by of ['heat', 'flood'] as const) {
      try { await rankPlaces({ kind, by }); } catch (err) { console.warn(`[explorer-recipe] warm ${kind}/${by} failed:`, (err as Error).message); }
      // Let requests through between two rankings.
      await new Promise(resolve => setTimeout(resolve, 50));
    }
  }
  console.log(`[explorer-recipe] rankings warm in ${Date.now() - started}ms`);
}

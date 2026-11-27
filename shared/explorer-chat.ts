// ============================================================================
// SITE EXPLORER CHAT — recipes, their results, and the chips that run them
// ============================================================================
// The principle (decided 27 Nov 2026): a chip runs a TOOL directly and the map
// and the numbers appear in about a second. The model only narrates, and a
// written template stands in its place whenever the model is slow or absent.
// Typed questions still go to the model, which is given the same tools.
//
// So everything a chip needs is here as data and pure functions: the request a
// chip sends (`ExplorerRecipeRequest`), the structured answer it gets back
// (`ExplorerRecipeResult` — with the `mapCommands` the page applies and a
// template narration built only from the returned data), and the chips
// themselves, in English and Portuguese.
//
// Hazard is OFFICIAL data only: flood and landslide from SGB, heat from the
// climate plan. A ranking is "the official class, then the people living
// nearby" (server/services/rankPlaces.ts) — never a combined score.
// ============================================================================

import type { ExplorerKeyMapId } from './explorer-key-maps';
import type { ExplorerPlaceKind } from './explorer-site';
import type { HazardReading } from './solution-because';

export interface Bilingual { pt: string; en: string }
export type RankBy = 'heat' | 'flood' | 'landslide';

/** The same commands the page listens for (client/src/legacy/lib/explorerMapCommands.ts). */
export type ExplorerMapCommandWire =
  | { type: 'show_map'; preset: ExplorerKeyMapId | null }
  | { type: 'fly_to'; lat: number; lng: number; zoom?: number }
  | { type: 'focus_place'; name: string }
  | { type: 'pin_places'; places: Array<{ rank: number; name: string; lat: number; lng: number; subtitle?: string }>; fit?: boolean }
  /** Frame one place (zoom 15–17) and draw its outline; `geometry: null` clears the outline. */
  | { type: 'show_place'; lat: number; lng: number; geometry?: any | null }
  /** Put the "add a site here" pin at a point and open its card. */
  | { type: 'drop_site'; lat: number; lng: number }
  | { type: 'clear_pins' };

export type ExplorerRecipeRequest =
  /** `view: 'city'` also frames the whole city — for a question about all of it. */
  | { recipe: 'map'; preset: ExplorerKeyMapId; view?: 'city' }
  | { recipe: 'rank'; kind: ExplorerPlaceKind; by: RankBy; top?: number; bairro?: string }
  /** A neighbourhood by name, a point, or both (the name says what to tell, the point where to look). */
  | { recipe: 'focus'; name?: string; lat?: number; lng?: number; zoom?: number }
  /** Open the click-to-add card at a point: the readings and what fits are on the map, not in the chat. */
  | { recipe: 'drop'; lat: number; lng: number }
  /** `prefer`: the hazard the place was ranked by — proposed for first when it is high there. */
  | { recipe: 'propose'; placeName?: string; lat: number; lng: number; areaHa?: number; solution?: string; placeKind?: ExplorerPlaceKind; prefer?: RankBy };

interface ResultBase {
  title: Bilingual;
  /** The template: complete on its own, built only from the data in this result. */
  narration: Bilingual;
  /** Who published what is shown, short. */
  sources: Bilingual[];
  mapCommands: ExplorerMapCommandWire[];
}

export interface ExplorerMapResult extends ResultBase { type: 'map'; preset: ExplorerKeyMapId }
export interface ExplorerFocusResult extends ResultBase { type: 'focus'; found: boolean }

export interface ExplorerRankRow {
  rank: number;
  name: string;
  bairro: string | null;
  lat: number;
  lng: number;
  areaHa: number;
  /** An ESTIMATE from the 2022 Census, not a count (rankPlaces.ts). */
  residentsNearby: number;
  radiusM: number;
  /** 0..4, the official class; `label` is the source's own word. */
  level: number;
  label: Bilingual;
  source: string;
  /** Below the top classes: added because fewer than asked for qualified. */
  belowTopClass?: true;
}
export interface ExplorerRankResult extends ResultBase {
  type: 'rank';
  kind: ExplorerPlaceKind;
  by: RankBy;
  rows: ExplorerRankRow[];
  considered: number;
  qualified: number;
}

export interface ExplorerProposal {
  siteName: string;
  lat: number;
  lng: number;
  bairro: string | null;
  zone: { zoneId: string; name: string } | null;
  placeKind: ExplorerPlaceKind | null;
  /** `hazardAtPin` at the point, untouched. */
  readings: HazardReading[];
  /** The legacy intervention proposed (interventions.json). Null when nothing official is high here. */
  intervention: { id: string; name: string; category: string } | null;
  /** True when the intervention answers a hazard that is HIGH at this point. */
  fits: boolean;
  /** Why it fits — or, when nothing is high, the sentence that is never an all-clear. */
  because: Bilingual;
  areaHa: number;
  /** Other legacy interventions that answer the same high hazard, for "something else". */
  alternatives: Array<{ id: string; name: string; category: string }>;
}
export interface ExplorerProposalResult extends ResultBase { type: 'proposal'; proposal: ExplorerProposal }

export type ExplorerRecipeResult = ExplorerMapResult | ExplorerFocusResult | ExplorerRankResult | ExplorerProposalResult;

/** Which key map shows the hazard a ranking was made by. */
export const PRESET_FOR: Record<RankBy, ExplorerKeyMapId> = { heat: 'heat', flood: 'flood', landslide: 'landslide' };

// ── Chips ───────────────────────────────────────────────────────────────────

export interface ExplorerChip {
  id: string;
  label: Bilingual;
  request: ExplorerRecipeRequest;
}

const chip = (id: string, en: string, pt: string, request: ExplorerRecipeRequest): ExplorerChip => ({ id, label: { en, pt }, request });

export const EXPLORER_CHIPS = {
  heat_worst: chip('heat_worst', 'Where is heat worst?', 'Onde o calor é pior?', { recipe: 'map', preset: 'heat', view: 'city' }),
  parks_heat: chip('parks_heat', '5 parks where cooling matters most', '5 praças onde refrescar mais importa', { recipe: 'rank', kind: 'parks', by: 'heat', top: 5 }),
  schools_flood: chip('schools_flood', '5 schools in the flood area', '5 escolas na área de inundação', { recipe: 'rank', kind: 'schools', by: 'flood', top: 5 }),
  hotspots: chip('hotspots', 'Where do hazards overlap?', 'Onde as ameaças se sobrepõem?', { recipe: 'map', preset: 'hotspots', view: 'city' }),
  flood_map: chip('flood_map', 'Where does it flood?', 'Onde inunda?', { recipe: 'map', preset: 'flood', view: 'city' }),
  landslide_map: chip('landslide_map', 'Where can the slopes slide?', 'Onde as encostas podem deslizar?', { recipe: 'map', preset: 'landslide', view: 'city' }),
  schools_heat: chip('schools_heat', '5 schools where cooling matters most', '5 escolas onde refrescar mais importa', { recipe: 'rank', kind: 'schools', by: 'heat', top: 5 }),
  parks_flood: chip('parks_flood', '5 parks in the flood area', '5 praças na área de inundação', { recipe: 'rank', kind: 'parks', by: 'flood', top: 5 }),
  hospitals_heat: chip('hospitals_heat', '5 health units where heat is worst', '5 unidades de saúde onde o calor é pior', { recipe: 'rank', kind: 'hospitals', by: 'heat', top: 5 }),
  people: chip('people', 'Who lives there?', 'Quem mora ali?', { recipe: 'map', preset: 'people', view: 'city' }),
} satisfies Record<string, ExplorerChip>;
export type ExplorerChipId = keyof typeof EXPLORER_CHIPS;

/** The empty state: one question per key idea of the demo. */
export const STARTER_CHIPS: ExplorerChipId[] = ['heat_worst', 'parks_heat', 'schools_flood', 'hotspots'];

const SAME_QUESTION: Record<RankBy, Bilingual> = {
  flood: { en: 'Same question for flooding?', pt: 'A mesma pergunta para inundação?' },
  heat: { en: 'Same question for heat?', pt: 'A mesma pergunta para calor?' },
  landslide: { en: 'Same question for landslides?', pt: 'A mesma pergunta para deslizamento?' },
};

/** "Same question for flooding?" — the ranking just shown, by the other hazard. */
export function sameQuestionChip(kind: ExplorerPlaceKind, by: RankBy): ExplorerChip {
  const other: RankBy = by === 'flood' ? 'heat' : 'flood';
  return { id: `same_${kind}_${other}`, label: SAME_QUESTION[other], request: { recipe: 'rank', kind, by: other, top: 5 } };
}

/**
 * What to offer after an answer — contextual, at most three. `after` is the
 * result just shown, or the ranking a site was just added from.
 */
export function followUpChips(after: ExplorerRecipeResult | { type: 'added'; kind?: ExplorerPlaceKind | null; by?: RankBy | null }): ExplorerChip[] {
  const C = EXPLORER_CHIPS;
  if (after.type === 'added') {
    return after.kind && after.by ? [sameQuestionChip(after.kind, after.by), C.hotspots] : [C.parks_heat, C.schools_flood, C.hotspots];
  }
  if (after.type === 'rank') {
    const other: ExplorerChip = after.kind === 'parks' ? (after.by === 'heat' ? C.schools_heat : C.schools_flood) : (after.by === 'heat' ? C.parks_heat : C.parks_flood);
    return after.by === 'landslide' ? [C.landslide_map, C.parks_heat] : [sameQuestionChip(after.kind, after.by), other];
  }
  if (after.type === 'map') {
    if (after.preset === 'heat') return [C.parks_heat, C.schools_heat, C.hotspots];
    if (after.preset === 'flood') return [C.schools_flood, C.parks_flood, C.hotspots];
    if (after.preset === 'landslide') return [C.hotspots, C.flood_map];
    if (after.preset === 'hotspots') return [C.parks_heat, C.schools_flood, C.people];
    return [C.heat_worst, C.flood_map, C.hotspots];
  }
  return [C.parks_heat, C.schools_flood];
}

// ── Words shared by the template and the cards ──────────────────────────────

export const KIND_WORDS: Record<ExplorerPlaceKind, { one: Bilingual; many: Bilingual }> = {
  parks: { one: { en: 'park', pt: 'praça' }, many: { en: 'parks and squares', pt: 'parques e praças' } },
  schools: { one: { en: 'school', pt: 'escola' }, many: { en: 'schools', pt: 'escolas' } },
  hospitals: { one: { en: 'health unit', pt: 'unidade de saúde' }, many: { en: 'hospitals and health units', pt: 'hospitais e unidades de saúde' } },
  wetlands: { one: { en: 'wetland', pt: 'área úmida' }, many: { en: 'wetlands', pt: 'áreas úmidas' } },
};
export const HAZARD_WORDS: Record<RankBy, Bilingual> = {
  heat: { en: 'heat', pt: 'calor' },
  flood: { en: 'flooding', pt: 'inundação' },
  landslide: { en: 'landslide', pt: 'deslizamento' },
};

export const formatCount = (n: number, lang: 'pt' | 'en') => Math.round(n).toLocaleString(lang === 'pt' ? 'pt-BR' : 'en-US');

/** "5,473 residents within 300 m · heat very high" — a pin's second line and a row's detail. */
export function rankSubtitle(row: Pick<ExplorerRankRow, 'residentsNearby' | 'radiusM' | 'label'>, by: RankBy): Bilingual {
  return {
    en: `${formatCount(row.residentsNearby, 'en')} residents within ${row.radiusM} m · ${HAZARD_WORDS[by].en} ${row.label.en}`,
    pt: `${formatCount(row.residentsNearby, 'pt')} moradores a até ${row.radiusM} m · ${HAZARD_WORDS[by].pt} ${row.label.pt}`,
  };
}

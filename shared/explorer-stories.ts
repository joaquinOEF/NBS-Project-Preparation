// ============================================================================
// SITE EXPLORER — THREE SEEDED STORIES
// ============================================================================
// One link per story: /sample/site-explorer/sample-ada-1?story=heat|flood|landslide
// opens the explorer with the chat open, the story's map on, and the story's
// first chip waiting. A story is DATA: the recipe that opens it and the chips
// that follow, in order — the same recipes any chip runs (explorer-chat.ts), so
// nothing in a story is scripted text about the data. What is said comes back
// from the recipe, computed from the official files at that moment.
//
//   heat       heat map → "5 parks where cooling matters most" → pins → tap
//              pin 1 → proposal with its because line → add
//   flood      SGB flood + the May 2024 line → "5 schools in the flood area"
//              → tap one → a retention yard, because → add
//   landslide  SGB landslide + surveyed sectors → a hill neighbourhood with its
//              official share → a pin on the slope (the click-to-add card):
//              slope revegetation, because → add
//
// Landslide has no ranking step on purpose: no park or square sits in SGB's
// high landslide class, so "the 5 parks…" would be a list of places that do not
// qualify. The honest recipe there is the surveyed slope itself.
// ============================================================================

import { EXPLORER_CHIPS, type Bilingual, type ExplorerChip, type ExplorerRecipeRequest } from './explorer-chat';

export type ExplorerStoryId = 'heat' | 'flood' | 'landslide';

export interface ExplorerStory {
  id: ExplorerStoryId;
  title: Bilingual;
  /** One line under the title, in the list of stories. */
  blurb: Bilingual;
  /** Runs when the story opens: the map goes on and the chat says what it shows. */
  opening: ExplorerRecipeRequest;
  /** Offered one after the other; after the last, the usual follow-ups. */
  steps: ExplorerChip[];
}

/** A slope in Glória inside SGB's high landslide class, 100 m from a surveyed risk sector. */
const GLORIA_SLOPE = { lat: -30.08, lng: -51.19 };

export const EXPLORER_STORIES: ExplorerStory[] = [
  {
    id: 'heat',
    title: { en: 'Heat: from the map to a shaded square', pt: 'Calor: do mapa a uma praça com sombra' },
    blurb: { en: 'Heat map → 5 parks → tap one → why → add', pt: 'Mapa de calor → 5 praças → toque numa → por quê → adicionar' },
    opening: { recipe: 'map', preset: 'heat', view: 'city' },
    steps: [EXPLORER_CHIPS.parks_heat],
  },
  {
    id: 'flood',
    title: { en: 'Flood: the schools the water reaches', pt: 'Inundação: as escolas que a água alcança' },
    blurb: { en: 'Flood map and May 2024 → 5 schools → tap one → why → add', pt: 'Mapa de inundação e maio de 2024 → 5 escolas → toque numa → por quê → adicionar' },
    opening: { recipe: 'map', preset: 'flood', view: 'city' },
    steps: [EXPLORER_CHIPS.schools_flood],
  },
  {
    id: 'landslide',
    title: { en: 'Landslide: a slope in Glória', pt: 'Deslizamento: uma encosta na Glória' },
    blurb: { en: 'Slopes and surveyed sectors → Glória → a pin on the slope → why → add', pt: 'Encostas e setores levantados → Glória → um pino na encosta → por quê → adicionar' },
    opening: { recipe: 'map', preset: 'landslide', view: 'city' },
    steps: [
      { id: 'story_gloria', label: { en: 'Zoom to Glória', pt: 'Ir para a Glória' }, request: { recipe: 'focus', name: 'Glória', ...GLORIA_SLOPE, zoom: 15 } },
      { id: 'story_gloria_slope', label: { en: 'Propose a site on this slope', pt: 'Propor um local nesta encosta' }, request: { recipe: 'drop', ...GLORIA_SLOPE } },
    ],
  },
];

export const EXPLORER_STORY_IDS = EXPLORER_STORIES.map(s => s.id);
export function explorerStory(id: unknown): ExplorerStory | null {
  return EXPLORER_STORIES.find(s => s.id === id) ?? null;
}
/** The link that opens a story. `base` is the explorer's own path. */
export function explorerStoryHref(base: string, id: ExplorerStoryId): string {
  return `${base}?story=${id}`;
}

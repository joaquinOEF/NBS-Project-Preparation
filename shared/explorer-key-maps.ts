// ============================================================================
// SITE EXPLORER — KEY MAPS
// ============================================================================
// The six curated maps offered as chips above the Site Explorer map. One tap
// applies a preset: a set of layers (with an optional opacity each) and the
// legends worth showing for it. The full catalogue (~130 layers) stays one click
// away in the "All layers" drawer.
//
// Data only, no React: the explorer reads it for the chip row, and the chat will
// read the same list to say which map it is showing and why.
//
// Hazard here is OFFICIAL data only — flood and landslide from the SGB/CPRM
// susceptibility map, heat from the climate plan (PLAC/ARVC). None of these
// presets uses our own H×E×V index.
//
// The strings are mirrored in client/src/locales/{en,pt}.json under
// `siteExplorer.keyMaps.<id>`; the explorer renders through t() with these as
// the fallback. Change both.
// ============================================================================

export type ExplorerKeyMapId = 'flood' | 'landslide' | 'heat' | 'hotspots' | 'people' | 'green';

export interface Bilingual { en: string; pt: string }

export interface ExplorerKeyMapLayer {
  /** Layer id as the Site Explorer knows it (LAYER_CONFIGS). */
  id: string;
  /** Layer opacity for rasters, 0–1. Omitted = the explorer's default. */
  opacity?: number;
}

export interface ExplorerKeyMap {
  id: ExplorerKeyMapId;
  label: Bilingual;
  /** One line: what the map shows. */
  caption: Bilingual;
  /** Who published the data, and when. */
  source: Bilingual;
  /** Drawn bottom → top: the last one is on top. */
  layers: ExplorerKeyMapLayer[];
  /** Legends to show for this map, in order. Omitted = one per layer. */
  legendLayers?: string[];
  /** Swatch on the chip. */
  color: string;
}

export const EXPLORER_KEY_MAPS: ExplorerKeyMap[] = [
  {
    id: 'flood',
    label: { en: 'Flood', pt: 'Inundação' },
    caption: {
      en: 'Where the ground favours flooding, and the area the water reached in May 2024.',
      pt: 'Onde o terreno favorece a inundação, e a área que a água alcançou em maio de 2024.',
    },
    source: {
      en: 'SGB/CPRM susceptibility map, 2015 · observed flood, Planet SkySat, May 2024',
      pt: 'Carta de suscetibilidade SGB/CPRM, 2015 · cheia observada, Planet SkySat, maio de 2024',
    },
    layers: [{ id: 'sgb_flood_susc' }, { id: 'flood_2024_extent' }],
    color: '#08519c',
  },
  {
    id: 'landslide',
    label: { en: 'Landslide', pt: 'Deslizamento' },
    caption: {
      en: 'Where the slopes favour landslides, and the risk sectors surveyed on the ground.',
      pt: 'Onde as encostas favorecem deslizamentos, e os setores de risco levantados em campo.',
    },
    source: {
      en: 'SGB/CPRM susceptibility map, 2015 · SGB risk sectors, 2022',
      pt: 'Carta de suscetibilidade SGB/CPRM, 2015 · setorização de risco SGB, 2022',
    },
    layers: [{ id: 'sgb_landslide_susc' }, { id: 'sgb_setores_risco' }],
    color: '#bd0026',
  },
  {
    id: 'heat',
    label: { en: 'Heat', pt: 'Calor' },
    caption: {
      en: 'Heat-wave hazard projected for 2050: the darker, the hotter.',
      pt: 'Ameaça de ondas de calor projetada para 2050: quanto mais escuro, mais quente.',
    },
    source: {
      en: 'Porto Alegre climate plan (PLAC/ARVC), 2050 scenario',
      pt: 'Plano de Ação Climática de Porto Alegre (PLAC/ARVC), cenário 2050',
    },
    layers: [{ id: 'arvc_heat_hazard', opacity: 0.8 }],
    color: '#f03b20',
  },
  {
    id: 'hotspots',
    label: { en: 'Hot spots', pt: 'Pontos críticos' },
    caption: {
      en: 'Where two official hazard maps say "high" at once. Not a score.',
      pt: 'Onde dois mapas oficiais de ameaça dizem "alta" ao mesmo tempo. Não é uma nota.',
    },
    source: {
      en: 'Flood and landslide: SGB/CPRM, 2015 · heat: climate plan (PLAC/ARVC), 2050',
      pt: 'Inundação e deslizamento: SGB/CPRM, 2015 · calor: plano climático (PLAC/ARVC), 2050',
    },
    // The three source maps stay underneath, faded, so the strong colours read
    // as "here two of these meet".
    layers: [
      { id: 'arvc_heat_hazard', opacity: 0.15 },
      { id: 'sgb_flood_susc', opacity: 0.35 },
      { id: 'sgb_landslide_susc', opacity: 0.35 },
      { id: 'hazard_overlap', opacity: 1 },
    ],
    legendLayers: ['hazard_overlap'],
    color: '#6a1b9a',
  },
  {
    id: 'people',
    label: { en: 'Who lives there', pt: 'Quem mora ali' },
    caption: {
      en: 'Share of households in poverty in each neighbourhood, and the informal settlements.',
      pt: 'Parcela de domicílios em situação de pobreza em cada bairro, e os assentamentos informais.',
    },
    source: {
      en: 'IBGE Census, neighbourhood indicators and informal settlements',
      pt: 'IBGE, Censo: indicadores por bairro e aglomerados subnormais',
    },
    layers: [{ id: 'ibge_census' }, { id: 'ibge_settlements' }],
    color: '#756bb1',
  },
  {
    id: 'green',
    label: { en: 'Green cover', pt: 'Cobertura verde' },
    caption: {
      en: 'How green the ground is, seen from satellite: the darker the green, the denser the vegetation.',
      pt: 'O quanto o chão é verde, visto por satélite: quanto mais escuro o verde, mais densa a vegetação.',
    },
    source: {
      en: 'NASA MODIS vegetation index (NDVI), 250 m',
      pt: 'Índice de vegetação NASA MODIS (NDVI), 250 m',
    },
    layers: [{ id: 'oef_modis_ndvi', opacity: 0.8 }],
    color: '#31a354',
  },
];

export const EXPLORER_KEY_MAP_IDS: ExplorerKeyMapId[] = EXPLORER_KEY_MAPS.map(m => m.id);

export function isExplorerKeyMapId(v: unknown): v is ExplorerKeyMapId {
  return typeof v === 'string' && (EXPLORER_KEY_MAP_IDS as string[]).includes(v);
}

export function explorerKeyMap(id: ExplorerKeyMapId): ExplorerKeyMap {
  return EXPLORER_KEY_MAPS.find(m => m.id === id)!;
}

// ── "Who lives there": the census layer as ONE named indicator ───────────────
// Share of households counted as poor (`poverty_rate` = poor_households ÷
// household_total in porto-alegre-ibge-indicators.json), by neighbourhood.
// Chosen over population density because density in that file is unusable as a
// ramp: slivers of 0.01 km² report over a million people per km².
export const CENSUS_POVERTY_FIELD = 'poverty_rate';

/** Upper bounds are exclusive; the last class is open-ended. */
export const CENSUS_POVERTY_CLASSES: Array<{ max: number; color: string; label: string }> = [
  { max: 0.05, color: '#f2f0f7', label: '< 5%' },
  { max: 0.10, color: '#cbc9e2', label: '5–10%' },
  { max: 0.15, color: '#9e9ac8', label: '10–15%' },
  { max: 0.25, color: '#756bb1', label: '15–25%' },
  { max: Infinity, color: '#54278f', label: '> 25%' },
];

/** Neighbourhoods the file has no household data for. */
export const CENSUS_NO_DATA_COLOR = '#a1a1aa';

export function censusPovertyColor(rate: number | null | undefined): string {
  if (typeof rate !== 'number' || !Number.isFinite(rate)) return CENSUS_NO_DATA_COLOR;
  return CENSUS_POVERTY_CLASSES.find(c => rate < c.max)!.color;
}

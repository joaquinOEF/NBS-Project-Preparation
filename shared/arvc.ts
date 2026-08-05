// ============================================================================
// ARVC — Análise de Riscos e Vulnerabilidade Climáticas (PLAC Porto Alegre)
// ============================================================================
// Six climate-risk surfaces the municipality published as part of its Climate
// Action Plan: flood, landslide, heat, drought, arbovirus vectors, storms — all
// for the 2050 horizon, all built by WayCarbon/ICLEI on the IPCC formula
// R = ∛(Ameaça × Exposição × Vulnerabilidade).
//
// ⚠️ THESE ARE RECONSTRUCTIONS, NOT THE OFFICIAL DATASET.
//
// The ARVC results were published only as map figures inside a PDF; the
// underlying rasters live in WayCarbon's proprietary MOVE platform and were not
// released. Each figure was georeferenced from its own printed SIRGAS 2000 /
// UTM 22S graticule and its printed colours matched back to the 10-step legend.
// Accuracy against the source figure: 98% of pixels land within one named risk
// class, mean error ~6% of the range.
//
// What that means in practice:
//   ✓ fine for prioritisation, screening, and comparing against our own layers
//   ✗ NOT citable to a funder as "the ARVC says X" — we read it off a picture
// Every surface that renders these MUST carry that distinction. See
// `ARVC_DERIVED_NOTE`.
//
// Regenerate with:  python3 scripts/extract-arvc-figures.py
//                   python3 scripts/combine-arvc-grid.py
// ============================================================================

export type ArvcHazardId =
  | 'flood_risk_2050'
  | 'landslide_risk_2050'
  | 'heat_risk_2050'
  | 'drought_risk_2050'
  | 'arbovirus_risk_2050'
  | 'storm_risk_2050';

export interface ArvcHazardDef {
  id: ArvcHazardId;
  /** English label for the layer list. */
  name: string;
  /** The title printed on the source figure, for provenance display. */
  sourceTitle: string;
  /** Page of the ARVC report the figure sits on. */
  page: number;
}

export const ARVC_HAZARDS: ArvcHazardDef[] = [
  { id: 'heat_risk_2050',      name: 'Heat Wave Risk 2050 (ARVC)',   sourceTitle: 'Risco - Ondas de Calor - 2050',            page: 100 },
  { id: 'flood_risk_2050',     name: 'River Flood Risk 2050 (ARVC)', sourceTitle: 'Risco - Inundação Fluvial - 2050',          page: 85 },
  { id: 'landslide_risk_2050', name: 'Landslide Risk 2050 (ARVC)',   sourceTitle: 'Risco - Deslizamento - 2050',               page: 93 },
  { id: 'storm_risk_2050',     name: 'Storm Risk 2050 (ARVC)',       sourceTitle: 'Risco - Tempestades - 2050',                page: 117 },
  { id: 'drought_risk_2050',   name: 'Drought Risk 2050 (ARVC)',     sourceTitle: 'Risco - Secas Meteorológicas - 2050',       page: 106 },
  { id: 'arbovirus_risk_2050', name: 'Arbovirus Risk 2050 (ARVC)',   sourceTitle: 'Risco - Vetores de Arboviroses - 2050',     page: 111 },
];

/** The five classes printed on the ARVC legend, ascending. */
export const ARVC_CLASSES = ['Muito Baixa', 'Baixa', 'Média', 'Alta', 'Muito Alta'] as const;

/**
 * The 10-step ColorBrewer Reds ramp the ARVC figures are drawn with. Reused
 * verbatim so our rendering is visually comparable to the published PDF — an
 * organization holding the printed plan should see the same colours.
 */
export const ARVC_RAMP = [
  '#fdf5ef', '#fde2d5', '#fbc2aa', '#fc9e7f', '#fb7b5a',
  '#f4553e', '#e32e28', '#c21618', '#9d0d13', '#66000d',
];

/** value in [0,1] → ramp colour. */
export function arvcColor(value: number): string {
  const i = Math.max(0, Math.min(ARVC_RAMP.length - 1, Math.round(value * 9)));
  return ARVC_RAMP[i];
}

/** value in [0,1] → the printed class name. Two ramp steps per named class. */
export function arvcClass(value: number): string {
  const step = Math.max(0, Math.min(9, Math.round(value * 9)));
  return ARVC_CLASSES[Math.min(step >> 1, 4)];
}

/** Shown wherever an ARVC layer is active. Deliberately blunt. */
export const ARVC_DERIVED_NOTE = {
  en: 'Reconstructed from the published PDF map — not the official dataset. Use for screening, not for citation.',
  pt: 'Reconstruído do mapa publicado em PDF — não é o dado oficial. Use para triagem, não para citação.',
};

/** Cells absent from a hazard were masked at source. Absence ≠ safety. */
export const ARVC_COVERAGE_NOTE = {
  en: 'The ARVC masks water, parks and áreas verdes out of its own index. A blank cell was excluded at source — it is not "low risk".',
  pt: 'A ARVC exclui água, parques e áreas verdes do próprio índice. Uma célula vazia foi excluída na origem — não significa "risco baixo".',
};

// ── Payload shape served by /api/official-risk/arvc-poa ──────────────────────
// One shared grid + one {cellId: value} map per hazard. Six self-contained
// GeoJSONs would have been ~5.3 MB of near-identical geometry over a server
// with no gzip middleware; this is ~890 KB for all six.

export interface ArvcPayload {
  grid: { crs: string; cell_m: number; origin_e: number; origin_n: number; nx: number };
  provenance: Record<string, unknown>;
  hazards: Record<ArvcHazardId, Record<string, number>>;
  cells: {
    type: 'FeatureCollection';
    features: Array<{
      type: 'Feature';
      id: number;
      properties: { id: number };
      geometry: { type: 'Polygon'; coordinates: number[][][] };
    }>;
  };
}

/**
 * Cells carrying a value for one hazard, as a ready-to-render FeatureCollection.
 * Cells the hazard masked out are dropped rather than rendered as zero.
 */
export function arvcFeatureCollection(payload: ArvcPayload, hazard: ArvcHazardId) {
  const vals = payload.hazards[hazard] ?? {};
  const features = payload.cells.features
    .filter(f => vals[String(f.properties.id)] !== undefined)
    .map(f => {
      const value = vals[String(f.properties.id)];
      return {
        ...f,
        properties: { id: f.properties.id, value, class: arvcClass(value) },
      };
    });
  return { type: 'FeatureCollection' as const, features };
}

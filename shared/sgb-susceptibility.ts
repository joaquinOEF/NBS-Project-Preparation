// ============================================================================
// SGB SUSCEPTIBILITY — the flood and landslide map layers (since 24 Nov 2026)
// ============================================================================
// One definition of the two layers' classes and colours, read by the tile
// route (server/routes/sgbSuscTileRoutes.ts), the legend
// (client/public/sample-data/layer-legends.json → 'classes' specs) and the
// orchestrator's ramp. The same colours as the printed maps
// (scripts/publication-maps/render.py), so print and screen agree.
// Why SGB: docs/sgb-suscetibilidade.md.
// ============================================================================

export type SgbSuscLayerId = 'sgb_flood_susc' | 'sgb_landslide_susc';

export interface SgbSuscStyle {
  /** Drawn in this order (higher classes last). */
  classes: Array<{ classe: 'Baixa' | 'Média' | 'Alta'; color: string }>;
  alpha: number;
}

export const SGB_SUSC_TILE_STYLE: Record<SgbSuscLayerId, SgbSuscStyle> = {
  sgb_flood_susc: {
    classes: [
      { classe: 'Baixa', color: '#c6dbef' },
      { classe: 'Média', color: '#6baed6' },
      { classe: 'Alta', color: '#08519c' },
    ],
    alpha: 255,
  },
  // Baixa is the rest of the municipality (84.6%) and is left transparent.
  sgb_landslide_susc: {
    classes: [
      { classe: 'Média', color: '#fd8d3c' },
      { classe: 'Alta', color: '#bd0026' },
    ],
    alpha: 255,
  },
};

/** The legend swatches, ascending — including landslide's uncoloured Baixa. */
export function sgbLegendColors(id: SgbSuscLayerId): string[] {
  const c = SGB_SUSC_TILE_STYLE[id].classes.map(x => x.color);
  return id === 'sgb_landslide_susc' ? ['#f3f3f1', ...c] : c;
}

export const SGB_SUSC_URL = (id: SgbSuscLayerId) => `/api/geospatial/sgb-susc/${id}/{z}/{x}/{y}.png`;

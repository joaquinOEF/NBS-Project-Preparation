// ============================================================================
// LAYER LEGENDS — color-scale metadata for the evidence-layer legends
// ============================================================================
// Generated offline by scripts/generate-legends.ts into
// client/public/sample-data/layer-legends.json (keyed by layer id), then shown
// inline under each active layer in the site-explorer drawer.
//
// Sources (hybrid, see docs/risk-catalog-migration-playbook.md):
//   - 'file'     parsed GDAL color-relief from geospatial-data (exact breakpoints + unit)
//   - 'classes'  categorical {value→name,color} from the catalog
//   - 'sampled'  recovered from the baked tiles (value-tile decode × visual-tile RGB)
//   - 'code'     the local risk colorFns in generate-risk-tiles.ts

export interface LegendStop {
  value: number;   // data value at this stop (in `unit`)
  color: string;   // hex
  label?: string;  // for categorical: the class name
}

export interface LegendSpec {
  layerId: string;
  kind: 'gradient' | 'classes';
  unit?: string;           // e.g. 'm', 'mm', 'index 0–1', '°C·days'
  stops: LegendStop[];     // gradient: ascending by value; classes: one per class
  min?: number;            // actual data min (gradient)
  max?: number;            // actual data max (gradient)
  source: 'file' | 'classes' | 'sampled' | 'code';
  note?: string;           // e.g. "colors recovered from tiles" / relative caveat
}

export type LegendIndex = Record<string, LegendSpec>;

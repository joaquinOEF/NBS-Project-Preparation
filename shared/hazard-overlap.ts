// ============================================================================
// HOT SPOTS — where official hazards overlap (since 27 Nov 2026)
// ============================================================================
// Replaces "Risk Hotspots (all)", which was our own H×E×V index baked into
// tiles. This one is not a score: it only marks the places where two or more
// OFFICIAL hazard maps say "high" at once.
//
//   floods    = SGB/CPRM flood susceptibility, class Alta
//   slides    = SGB/CPRM landslide susceptibility, class Média or Alta
//   overheats = the climate plan's (PLAC/ARVC) 2050 heat hazard in its two top
//               classes — ARVC_HIGH_LEVEL in server/services/arvcPointHazard.ts,
//               the same "alta / muito alta" the tour and the site card use
//
// One definition of the classes and colours, read by the tile route
// (server/routes/hazardOverlapTileRoutes.ts) and mirrored by hand in the legend
// (client/public/sample-data/layer-legends.json → hazard_overlap).
// ============================================================================

export const HAZARD_OVERLAP_LAYER_ID = 'hazard_overlap';

export const HAZARD_OVERLAP_URL = '/api/geospatial/hazard-overlap/{z}/{x}/{y}.png';

/** What the SGB layers contribute. */
export const HAZARD_OVERLAP_SGB_CLASSES = {
  flood: ['Alta'],
  landslide: ['Média', 'Alta'],
} as const;

/** 0 = nothing drawn (no overlap). */
export type HazardOverlapClass = 0 | 1 | 2 | 3;

export const HAZARD_OVERLAP_CLASSES: Array<{ value: Exclude<HazardOverlapClass, 0>; key: string; color: string }> = [
  { value: 1, key: 'flood_heat', color: '#6a1b9a' },
  { value: 2, key: 'landslide_heat', color: '#bd0026' },
  // Flood + landslide (with or without heat) is a sliver of the city: one colour.
  { value: 3, key: 'flood_landslide', color: '#00695c' },
];

/** The class of a place from its three yes/no readings. */
export function hazardOverlapClass(flood: boolean, landslide: boolean, hot: boolean): HazardOverlapClass {
  if (flood && landslide) return 3;
  if (flood && hot) return 1;
  if (landslide && hot) return 2;
  return 0;
}

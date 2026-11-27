// ============================================================================
// SITE EXPLORER — a site at a point: which legacy intervention to offer, and
// the shape the server answers with when asked "what is here?"
// ============================================================================
// Used by the click-to-add card on the map and by the chat's proposal card, so
// the two can never disagree about what fits a place.
//
// Nothing here judges a hazard: the readings are `hazardAtPin`'s (official —
// SGB for flood and landslide, the climate plan for heat) and what answers a
// high hazard is shared/solution-because.ts. This file only ORDERS the legacy
// explorer interventions (client/public/sample-data/interventions.json) that
// answer it, so that one of them can be offered first.
// ============================================================================

import type { HazardReading, SolutionsForReadings, LegacyCategory, Bilingual } from './solution-because';
import { LEGACY_CATEGORY_HAZARDS } from './solution-because';
import type { HazardKey } from './site-knowledge';

/** The kind of place a point sits on, when known (rank-places kinds). */
export type ExplorerPlaceKind = 'parks' | 'schools' | 'hospitals' | 'wetlands';

/**
 * The legacy intervention offered FIRST for a hazard, by the kind of place.
 * `default` is for a bare point on the map. The ids are interventions.json's:
 * a square gets shade, a school yard a retention yard, a slope is replanted.
 */
export const FIRST_INTERVENTION: Record<HazardKey, Partial<Record<ExplorerPlaceKind, string>> & { default: string }> = {
  heat: { default: 'shade_plaza', parks: 'shade_plaza', schools: 'cooling_campus', hospitals: 'cooling_campus' },
  flood: { default: 'floodable_park', parks: 'floodable_park', schools: 'retention_yard', hospitals: 'sponge_square', wetlands: 'constructed_wetland' },
  landslide: { default: 'reforestation' },
};

export interface LegacyInterventionLite { id: string; category: string; name: string }

/**
 * The legacy interventions that answer `hazard`, the one to offer first on top:
 * FIRST_INTERVENTION, then the rest of the single-hazard category in file order,
 * then the multi-benefit ones.
 */
export function interventionsForHazard<T extends LegacyInterventionLite>(all: T[], hazard: HazardKey, kind?: ExplorerPlaceKind | null): T[] {
  const first = (kind && FIRST_INTERVENTION[hazard][kind]) || FIRST_INTERVENTION[hazard].default;
  const answers = (i: T) => (LEGACY_CATEGORY_HAZARDS[i.category as LegacyCategory] ?? []).includes(hazard);
  const weight = (i: T) => (i.id === first ? 0 : i.category === 'multi_benefit' ? 2 : 1);
  return all.filter(answers).map((i, n) => ({ i, n })).sort((a, b) => weight(a.i) - weight(b.i) || a.n - b.n).map(x => x.i);
}

/** What `GET /api/geospatial/hazard-at` answers. */
export interface ExplorerSiteReading {
  lat: number;
  lng: number;
  /** False outside Porto Alegre: no readings, nothing to add. */
  inCity: boolean;
  /** Census 2022 bairro of the point. */
  bairro: string | null;
  /** The explorer's zone (neighbourhood) the point falls in — where a site is saved. */
  zone: { zoneId: string; name: string } | null;
  /** `hazardAtPin`, untouched: flood, heat, landslide — level, the source's own word, the source. */
  readings: HazardReading[];
  /** `solutionsForReadings(readings)`: one entry per HIGH hazard with its because line, or `none`. */
  solutions: SolutionsForReadings;
  /** Per high hazard, the legacy intervention ids that answer it, the one to offer first on top. */
  options: Array<{ hazard: HazardKey; interventionIds: string[] }>;
  /** A named park, school or health unit at the point or within ~60 m (OSM snapshot). */
  nearest: { name: string; kind: ExplorerPlaceKind; distanceM: number; /** Its outline (simplified), when OSM draws it as an area. */ geometry?: any } | null;
  /** A name to prefill: the nearest named place, else "Site in <bairro>". */
  suggestedName: Bilingual;
}

// ── The pending patch that proposes a site ──────────────────────────────────
/**
 * `interventionSite.<zoneId>.<siteId>` — one path per SITE, so two proposals in
 * the same neighbourhood are two patches about two things. Older patches carry
 * `interventionSite.<zoneId>` only; both parse.
 */
export const INTERVENTION_SITE_PREFIX = 'interventionSite.';
export function interventionSitePath(zoneId: string, siteId: string): string {
  return `${INTERVENTION_SITE_PREFIX}${zoneId}.${siteId}`;
}
export function parseInterventionSitePath(fieldPath: string | null | undefined): { zoneId: string; siteId: string | null } | null {
  if (typeof fieldPath !== 'string' || !fieldPath.startsWith(INTERVENTION_SITE_PREFIX)) return null;
  const [zoneId, ...rest] = fieldPath.slice(INTERVENTION_SITE_PREFIX.length).split('.');
  return zoneId ? { zoneId, siteId: rest.length ? rest.join('.') : null } : null;
}

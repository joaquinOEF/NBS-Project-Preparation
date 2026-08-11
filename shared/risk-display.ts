// ============================================================================
// RISK DISPLAY — comparable cross-hazard presentation
// ============================================================================
// A catalog risk = (Hazard × Exposure × Vulnerability)^(1/3) on [0,1] is
// structurally compressed (rarely > ~0.2), so its raw % reads as trivially low
// next to a single-factor hazard score. No major framework (FEMA NRI, INFORM,
// WRI Aqueduct, First Street) displays that raw product. Following FEMA / the
// Climate Vulnerability Index, we display each hazard as a WITHIN-HAZARD
// PERCENTILE (0–100) across the city's zones — scale-free, so flood and heat are
// directly comparable — rendered as a 5-band rating + the score + an absolute
// anchor, labelled "relative to <city>". Ranking uses the same percentile basis.
//
// The 0–1 ranks are precomputed per zone (generate-neighborhood-zones.ts:
// floodRank / heatRank / landslideRank). Since 2026-08 they rank the bairro's
// p90 cell risk rather than its mean, and they drive the hazard classification
// as well as these display bands. This module is the single source of
// truth for turning them into bands/scores. See docs/risk-catalog-migration-playbook.md.

export type HazardKey = 'flood' | 'heat' | 'landslide';

// Zone-typology hue, keyed by a zone's `typologyLabel` (the dominant hazard or
// hazard-combo). Shared by the site-explorer map + the coordinator risk map so
// the "zone priority" coloring can't drift between them. Pair the hue (which
// risk) with `zoneRiskOpacity` (how intense) for the full encoding.
export const TYPOLOGY_COLORS: Record<string, string> = {
  FLOOD: '#3b82f6',
  HEAT: '#ef4444',
  LANDSLIDE: '#a16207',
  FLOOD_HEAT: '#8b5cf6',
  FLOOD_LANDSLIDE: '#0891b2',
  HEAT_LANDSLIDE: '#db2777',
  LOW: '#10b981',
};

/** Zone fill opacity from a 0..1 normalized risk: faint (low) → solid (high). */
export function zoneRiskOpacity(normalizedRisk: number): number {
  return 0.08 + Math.max(0, Math.min(1, normalizedRisk)) * 0.57;
}

export interface RiskBand {
  key: 'very_low' | 'low' | 'moderate' | 'high' | 'very_high';
  label: string;   // English fallback; UI should translate via `riskBands.${key}`
  color: string;   // IPCC-style ramp: white → yellow → orange → red → purple
  min: number;     // inclusive lower bound on the 0–100 score (quintiles)
}

// Quintile cut points (0-20-40-60-80-100). Identical for every hazard, so a
// "High" flood band is comparable to a "High" heat band by construction.
export const RISK_BANDS: RiskBand[] = [
  { key: 'very_low',  label: 'Very Low',  color: '#e5e7eb', min: 0 },
  { key: 'low',       label: 'Low',       color: '#fde047', min: 20 },
  { key: 'moderate',  label: 'Moderate',  color: '#fb923c', min: 40 },
  { key: 'high',      label: 'High',      color: '#ef4444', min: 60 },
  { key: 'very_high', label: 'Very High', color: '#a855f7', min: 80 },
];

/** Band for a 0–100 percentile score. */
export function riskBand(score0to100: number): RiskBand {
  let band = RISK_BANDS[0];
  for (const b of RISK_BANDS) if (score0to100 >= b.min) band = b;
  return band;
}

/** 0–1 rank → 0–100 percentile score. */
export function pct100(rank?: number | null): number {
  return Math.round(Math.max(0, Math.min(1, rank ?? 0)) * 100);
}

/** Within-hazard percentile (0–100) for one hazard on a zone. */
export function hazardPercentile(zone: any, hazard: HazardKey): number {
  const rank = hazard === 'flood' ? zone?.floodRank
    : hazard === 'heat' ? zone?.heatRank
    : zone?.landslideRank;
  return pct100(rank);
}

/**
 * The zone's dominant hazard — the PRIMARY from the absolute-risk classification
 * (`generate-neighborhood-zones.ts`), NOT a max over ranks. Returns null for LOW.
 */
export function dominantHazard(zone: any): HazardKey | null {
  switch (zone?.primaryHazard) {
    case 'FLOOD': return 'flood';
    case 'HEAT': return 'heat';
    case 'LANDSLIDE': return 'landslide';
    default: return null;
  }
}

/**
 * Dominant-hazard percentile (0–100) for the priority-list badge — the display
 * percentile of the absolute-chosen primary hazard. (For ordering, sort on the
 * zone's absolute `priorityScore`, which both views use, so they can't drift.)
 */
export function dominantPercentile(zone: any): number {
  const h = dominantHazard(zone);
  return h ? hazardPercentile(zone, h) : 0;
}

/** Landslide-prone terrain (SUSCEPTIBILITY, from the catalog landslide hazard) —
 *  distinct from landslide RISK. Surfaced as a flag/badge, not a primary color. */
export function isLandslideProne(zone: any): boolean {
  return !!zone?.landslideSusceptible;
}

/**
 * Absolute anchor string for a hazard (keeps the relative percentile honest about
 * real severity — the FEMA "Expected Annual Loss in $" / First Street "depth" trick).
 * e.g. "12% risk · 14% of area in flood zone".
 */
export function riskAnchor(zone: any, hazard: HazardKey): string {
  // Anchor on the SAME statistic the percentile band is computed from — the p90,
  // not the mean. Printing a mean beside a p90-derived band made the two disagree
  // for every bairro: "moderate" next to a number from a different distribution.
  // Falls back to the mean for older zone files that predate the p90 fields.
  const value = hazard === 'flood' ? zone?.p90Flood ?? zone?.meanFloodRisk ?? zone?.meanFlood
    : hazard === 'heat' ? zone?.p90Heat ?? zone?.meanHeat
    : zone?.p90Landslide ?? zone?.meanLandslide;
  const parts: string[] = [];
  if (value != null) parts.push(`${Math.round(value * 100)}% risk`);
  if (hazard === 'flood' && zone?.floodExtentPct != null) {
    parts.push(`${Math.round(zone.floodExtentPct * 100)}% of area in flood zone`);
  }
  return parts.join(' · ');
}

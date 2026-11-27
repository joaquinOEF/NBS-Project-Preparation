// ============================================================================
// AN INTERVENTION SITE PROPOSED BY THE CHAT — built once, applied one way
// ============================================================================
// The chat proposes a site as a pending patch (`add_intervention_site`); a
// person approves it; the site joins the zone's portfolio in the site_explorer
// block — `selectedZones[].interventionPortfolio`, the only place the Site
// Explorer page reads sites from.
//
// Two things were wrong before 27 Nov 2026:
//   - the patch path was `interventionSite.<zoneId>`, so a second proposal in
//     the same neighbourhood stood for "the zone's site" a second time;
//   - approving ONE patch (the chat's own button, /patches/:id/apply) wrote the
//     value at that path in the block — `blockState.interventionSite[zoneId]`,
//     one object per zone, which the page never reads — while only "Save All"
//     (/apply) appended to the portfolio. A second site replaced the first, and
//     neither survived a reload.
// Now the path carries the site (`interventionSite.<zoneId>.<siteId>`, see
// shared/explorer-site.ts) and both routes call `applyInterventionSite`.
// ============================================================================

import { legacyInterventions, zoneByName } from './explorerSite';

export interface InterventionSiteArgs {
  zoneId: string;
  siteName: string;
  /** Display name of the intervention (interventions.json `name`, or free text from the model). */
  interventionType: string;
  /** interventions.json id, when known. */
  interventionId?: string;
  category: string;
  lat: number;
  lng: number;
  areaHa?: number;
  osmId?: string;
}

const slug = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 40);

/**
 * The portfolio entry for a proposed site — the shape `selectedInterventionSchema`
 * (shared/block-schemas.ts) accepts. Cost and impacts come from the explorer's
 * own table (interventions.json) when the intervention is one of its twenty,
 * priced the way the page prices a site added by hand; otherwise `fallback`.
 */
export function buildInterventionSite(
  args: InterventionSiteArgs,
  fallback: { costPerHa: { min: number; max: number }; impacts: { flood: string; heat: string; landslide: string } },
) {
  const all = legacyInterventions();
  const legacy = all.find(i => i.id === args.interventionId) ?? all.find(i => i.name.toLowerCase() === String(args.interventionType || '').toLowerCase());
  const areaHa = Number.isFinite(args.areaHa) && (args.areaHa as number) > 0 ? (args.areaHa as number) : 1;
  const areaM2 = areaHa * 10_000;
  let multiplier = areaHa;
  if (legacy?.costRange.unit === 'USD/m²') multiplier = areaM2;
  else if (legacy?.costRange.unit === 'USD/m') multiplier = Math.sqrt(areaM2) * 4;
  const cost = legacy ? legacy.costRange : fallback.costPerHa;
  // The same place proposed twice is one site; two places are two.
  const assetId = args.osmId ? `nominatim_${args.osmId}` : `site_${slug(args.siteName) || 'site'}_${args.lat.toFixed(4)}_${args.lng.toFixed(4)}`.replace(/[.-]/g, '');
  return {
    interventionId: legacy?.id ?? args.interventionType.toLowerCase().replace(/\s+/g, '_'),
    interventionName: legacy?.name ?? args.interventionType,
    category: legacy?.category ?? args.category,
    assetId,
    assetName: args.siteName,
    centroid: [args.lat, args.lng] as [number, number],
    estimatedArea: areaHa,
    areaUnit: 'ha',
    estimatedCost: { min: Math.round(cost.min * multiplier), max: Math.round(cost.max * multiplier), unit: 'USD' },
    impacts: { ...(legacy?.impacts ?? fallback.impacts) },
    source: args.osmId ? 'nominatim' : 'manual',
    addedAt: new Date().toISOString(),
  };
}

/**
 * Add (or, for the same `assetId`, replace) one site in a zone's portfolio.
 * Sites accumulate: nothing else in the zone is touched.
 */
export async function applyInterventionSite(
  projectId: string,
  zoneId: string,
  intervention: any,
  opts: { actor?: string; completion?: (data: any) => number } = {},
): Promise<void> {
  // Loaded here, not at the top: `buildInterventionSite` above is pure and is
  // imported where there is no database (e2e/explorer-recipes.spec.ts).
  const { storage } = await import('../storage');
  const block = await storage.getInfoBlock(projectId, 'site_explorer');
  const data = JSON.parse(JSON.stringify(block?.blockStateJson || {}));
  if (!Array.isArray(data.selectedZones)) data.selectedZones = [];
  let zone = data.selectedZones.find((z: any) => z && typeof z === 'object' && z.zoneId === zoneId);
  if (!zone) {
    const known = zoneByName(zoneId);
    zone = {
      zoneId,
      zoneName: known?.name ?? (zoneId.startsWith('zone_') ? `Zone ${zoneId.replace('zone_', '')}` : zoneId),
      // What the page writes for a zone it saves (hazardType is required by the block schema).
      hazardType: known?.props?.typologyLabel || 'LOW',
      interventionPortfolio: [],
    };
    data.selectedZones.push(zone);
  }
  if (!Array.isArray(zone.interventionPortfolio)) zone.interventionPortfolio = [];
  const at = zone.interventionPortfolio.findIndex((i: any) => i.assetId && i.assetId === intervention.assetId);
  if (at >= 0) zone.interventionPortfolio[at] = intervention;
  else zone.interventionPortfolio.push(intervention);

  await storage.upsertInfoBlock(projectId, 'site_explorer', {
    blockStateJson: data,
    status: block?.status || 'DRAFT',
    updatedBy: opts.actor ?? 'user',
    ...(opts.completion ? { completionPercent: opts.completion(data) } : {}),
  });
}

// ============================================================================
// THE CITY'S CLIMATE CONTEXT FOR ONE SITE — the triggers
// ============================================================================
// Reads knowledge/porto-alegre/census-2022/exposure.json (scripts/
// city-exposure-stats.py) once, and for a site record works out what
// shared/city-climate-context.ts needs: is the pin below the May 2024 Guaíba
// level (SMAMUS contour ≤ 5,35 m), is it inside an SGB risk sector, and the
// typical income around it. Pure lookup, synchronous, no model.
// ============================================================================

import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { siteFacts, sitePoint } from './siteContext';
import { officialHazardFactsAt } from './officialHazardFacts';
import { cityClimateLines, type CityExposure, type SiteClimateTriggers } from '@shared/city-climate-context';
import type { CensusAround } from '@shared/census';

/** The May 2024 peak at the Cais Mauá gauge, in cm (the SMAMUS contours' unit). */
const PEAK_2024_CM = 535;

let cache: CityExposure | null | undefined;
export function cityExposure(): CityExposure | null {
  if (cache !== undefined) return cache;
  const file = path.join(process.cwd(), 'knowledge', 'porto-alegre', 'census-2022', 'exposure.json');
  try { cache = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : null; }
  catch (err) { console.warn('[city-climate] exposure.json unreadable:', (err as Error).message); cache = null; }
  return cache ?? null;
}

export function siteClimateTriggers(site: Record<string, string | undefined>, census: CensusAround | null | undefined): SiteClimateTriggers | null {
  const pt = sitePoint(site);
  if (!pt) return null;
  let below2024 = false, inSgbSector = false;
  try {
    below2024 = siteFacts(pt.lat, pt.lng).some(f => f.layerId === 'cotas-inundacao' && Number(f.props?.contourmax) <= PEAK_2024_CM);
    inSgbSector = officialHazardFactsAt(pt.lat, pt.lng).some(f => f.kind === 'sgb-setor');
  } catch (err) { console.warn('[city-climate] lookup failed:', (err as Error).message); }
  return { below2024, inSgbSector, incomeAround: census?.incomeMedian ?? null };
}

/** The pre-note's city-context lines for a site ([] when none bears on it). */
export function cityContextFor(site: Record<string, string | undefined>, census: CensusAround | null | undefined, lang: 'pt' | 'en'): Array<{ text: string; source: string }> {
  const t = siteClimateTriggers(site, census);
  return t ? cityClimateLines(cityExposure(), t, lang) : [];
}

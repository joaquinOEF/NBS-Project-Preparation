import { db } from '../db';
import { osmAssetCache } from '@shared/core-schema';
import { eq, and, gt, lt } from 'drizzle-orm';
import { overpassQuery, OverpassError } from './overpassClient';
import {
  type CandidateAsset,
  type OsmAsset,
  OSM_ASSET_LIMIT,
  readAssetIndex,
  readAssetType,
  bboxWithinCoverage,
  candidateFromOverpass,
  selectAssetsForZone,
} from './osmAssetSnapshot';

// ============================================================================
// Candidate sites for the Site Explorer's "add a site" list.
//
// The ladder is: committed city-wide snapshot → (only for a type the snapshot
// does not hold) Postgres cache → Overpass through overpassClient.
//
// The snapshot is the intended source (see osmAssetSnapshot.ts). A request
// served from it touches neither the network nor the database. A fall-through
// to Overpass is a signal that someone needs to run
// `npm run osm:refresh -- assets`.
//
// Whatever the source, the zone outline, the named-first / largest-first order
// and the cap are applied HERE, so the client receives at most
// OSM_ASSET_LIMIT sites and `totalFound` says how many the zone really holds.
// ============================================================================

const CACHE_DURATION_DAYS = 7;

interface FetchOsmAssetsRequest {
  zoneId: string;
  category: string;
  bbox: [number, number, number, number];
  osmTypes: string[];
  zoneGeometry?: any;
}

interface FetchOsmAssetsResponse {
  assets: OsmAsset[];
  fromCache: boolean;
  /** Sites in the zone before the cap. */
  totalFound: number;
  /** 'snapshot' when no live call was needed. */
  source?: 'snapshot' | 'snapshot+live' | 'live';
  /** Types that could be served neither from the snapshot nor live. */
  unavailableTypes?: string[];
  error?: string;
  errorCode?: 'RATE_LIMIT' | 'TIMEOUT' | 'SIZE_EXCEEDED' | 'NETWORK_ERROR' | 'UNKNOWN';
}

// The cache now holds only the live remainder (candidates of the types the
// snapshot lacks, before the zone cut), so the types are part of the key and
// rows written by the old all-types query are never read back.
function generateCacheKey(zoneId: string, category: string, bbox: [number, number, number, number], liveTypes: string[]): string {
  const bboxStr = bbox.map(n => n.toFixed(4)).join(',');
  return `${zoneId}:${category}:${bboxStr}:live:${[...liveTypes].sort().join('|')}`;
}

async function getCachedAssets(cacheKey: string): Promise<CandidateAsset[] | null> {
  try {
    const cached = await db
      .select()
      .from(osmAssetCache)
      .where(
        and(
          eq(osmAssetCache.cacheKey, cacheKey),
          gt(osmAssetCache.expiresAt, new Date())
        )
      )
      .limit(1);
    
    if (cached.length > 0) {
      console.log(`✅ OSM cache hit for ${cacheKey}`);
      return cached[0].assets as CandidateAsset[];
    }
    return null;
  } catch (error) {
    console.error('Cache lookup error:', error);
    return null;
  }
}

async function setCachedAssets(
  cacheKey: string, 
  zoneId: string, 
  category: string, 
  bbox: [number, number, number, number], 
  assets: CandidateAsset[]
): Promise<void> {
  try {
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + CACHE_DURATION_DAYS);
    
    await db
      .insert(osmAssetCache)
      .values({
        cacheKey,
        zoneId,
        category,
        bbox,
        assets,
        assetCount: String(assets.length),
        expiresAt,
      })
      .onConflictDoUpdate({
        target: osmAssetCache.cacheKey,
        set: {
          assets,
          assetCount: String(assets.length),
          expiresAt,
        },
      });
    
    console.log(`💾 Cached ${assets.length} OSM assets for ${cacheKey}`);
  } catch (error) {
    console.error('Cache write error:', error);
  }
}

const LIVE_ERROR_MESSAGES: Record<NonNullable<FetchOsmAssetsResponse['errorCode']>, string> = {
  RATE_LIMIT: 'Rate limit exceeded. The mapping service is temporarily unavailable. Please wait a moment and try again.',
  TIMEOUT: 'Request timed out. This zone may be too large. Try selecting a smaller area.',
  SIZE_EXCEEDED: 'This zone is too large to process. Try selecting a smaller area or a different category.',
  NETWORK_ERROR: 'Network error while fetching assets. Please check your connection and try again.',
  UNKNOWN: 'Failed to fetch assets from OpenStreetMap',
};

/** Last resort: the types the snapshot lacks, for this zone's bbox only. */
async function fetchLiveCandidates(
  liveTypes: string[],
  allTypes: string[],
  bbox: [number, number, number, number]
): Promise<CandidateAsset[]> {
  const b = bbox.join(',');
  const filters = liveTypes.map(type => {
    const [key, value] = type.split('=');
    return `node["${key}"="${value}"](${b});way["${key}"="${value}"](${b});`;
  }).join('');
  const query = `[out:json][timeout:30][maxsize:52428800];(${filters});out tags geom;`;
  const data = await overpassQuery(query, { label: `assets ${liveTypes.join(',')}` });

  const candidateTypes = new Set(allTypes);
  const out: CandidateAsset[] = [];
  for (const el of data?.elements || []) {
    const ownType = liveTypes.find(t => {
      const [k, v] = t.split('=');
      return el.tags?.[k] === v;
    });
    if (!ownType) continue;
    const candidate = candidateFromOverpass(el, ownType, candidateTypes);
    if (candidate) out.push(candidate);
  }
  return out;
}

export async function fetchOsmAssets(request: FetchOsmAssetsRequest): Promise<FetchOsmAssetsResponse> {
  const { zoneId, category, bbox, osmTypes, zoneGeometry } = request;
  const started = Date.now();

  // 1. Committed snapshot — one lazily loaded, memoised file per type.
  const index = await readAssetIndex();
  const covered = !!index && bboxWithinCoverage(bbox, index);
  const candidates: CandidateAsset[] = [];
  const liveTypes: string[] = [];
  for (const type of osmTypes) {
    const fromSnapshot = covered ? await readAssetType(type) : null;
    if (fromSnapshot) {
      for (const c of fromSnapshot) candidates.push(c);
    } else {
      liveTypes.push(type);
    }
  }

  // 2. Whatever the snapshot does not hold: Postgres cache, then Overpass.
  let fromCache = false;
  let liveError: OverpassError | null = null;
  if (liveTypes.length) {
    console.warn(`[osm-assets] ${zoneId}/${category}: not in the snapshot, going live for ${liveTypes.join(', ')}`);
    const cacheKey = generateCacheKey(zoneId, category, bbox, liveTypes);
    const cached = await getCachedAssets(cacheKey);
    if (cached) {
      fromCache = true;
      for (const c of cached) candidates.push(c);
    } else {
      try {
        const live = await fetchLiveCandidates(liveTypes, osmTypes, bbox);
        for (const c of live) candidates.push(c);
        await setCachedAssets(cacheKey, zoneId, category, bbox, live);
      } catch (err: any) {
        liveError = err instanceof OverpassError
          ? err
          : new OverpassError(String(err?.message || err), 'UNKNOWN', '');
        console.error(`[osm-assets] live fallback failed: ${liveError.message}`);
      }
    }
  }

  // Nothing to show at all — the only case that is an error for the user.
  if (liveError && liveTypes.length === osmTypes.length) {
    return {
      assets: [],
      fromCache: false,
      totalFound: 0,
      error: LIVE_ERROR_MESSAGES[liveError.code],
      errorCode: liveError.code,
    };
  }

  // 3. Zone outline → named first, largest first → cap.
  const selection = selectAssetsForZone(candidates, osmTypes, bbox, zoneGeometry, OSM_ASSET_LIMIT);
  const source = liveTypes.length === 0 ? 'snapshot' : liveTypes.length === osmTypes.length ? 'live' : 'snapshot+live';
  console.log(
    `[osm-assets] ${zoneId}/${category}: ${selection.totalFound} in zone ` +
      `(${selection.inBbox} in bbox, ${selection.outsideZone} outside the outline), ` +
      `returning ${selection.assets.length} — ${source}, ${Date.now() - started}ms`
  );

  return {
    assets: selection.assets,
    fromCache,
    totalFound: selection.totalFound,
    source,
    ...(liveError ? { unavailableTypes: liveTypes } : {}),
  };
}

export async function clearExpiredCache(): Promise<number> {
  try {
    await db
      .delete(osmAssetCache)
      .where(lt(osmAssetCache.expiresAt, new Date()));
    return 0;
  } catch (error) {
    console.error('Failed to clear expired cache:', error);
    return 0;
  }
}

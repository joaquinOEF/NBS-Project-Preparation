import { db } from '../db';
import { osmAssetCache } from '@shared/core-schema';
import { eq, and, gt, lt } from 'drizzle-orm';
import * as turf from '@turf/turf';

const OVERPASS_API_URL = 'https://overpass-api.de/api/interpreter';
const CACHE_DURATION_DAYS = 7;

interface OsmAsset {
  id: string;
  osmId: number;
  osmType: string;
  name: string;
  tags: Record<string, string>;
  geometry: any;
  centroid: [number, number] | null;
  area: number;
  length: number;
  assetType: string;
}

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
  totalFound: number;
  error?: string;
  errorCode?: 'RATE_LIMIT' | 'TIMEOUT' | 'SIZE_EXCEEDED' | 'NETWORK_ERROR' | 'UNKNOWN';
}

function generateCacheKey(zoneId: string, category: string, bbox: [number, number, number, number]): string {
  const bboxStr = bbox.map(n => n.toFixed(4)).join(',');
  return `${zoneId}:${category}:${bboxStr}`;
}

async function getCachedAssets(cacheKey: string): Promise<OsmAsset[] | null> {
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
      return cached[0].assets as OsmAsset[];
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
  assets: OsmAsset[]
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

function calculateLineLength(coords: number[][]): number {
  let length = 0;
  for (let i = 0; i < coords.length - 1; i++) {
    const [lng1, lat1] = coords[i];
    const [lng2, lat2] = coords[i + 1];
    const dLat = (lat2 - lat1) * 111319;
    const dLng = (lng2 - lng1) * 111319 * Math.cos((lat1 + lat2) / 2 * Math.PI / 180);
    length += Math.sqrt(dLat * dLat + dLng * dLng);
  }
  return length;
}

export async function fetchOsmAssets(request: FetchOsmAssetsRequest): Promise<FetchOsmAssetsResponse> {
  const { zoneId, category, bbox, osmTypes, zoneGeometry } = request;
  const cacheKey = generateCacheKey(zoneId, category, bbox);
  
  const cachedAssets = await getCachedAssets(cacheKey);
  if (cachedAssets) {
    return {
      assets: cachedAssets,
      fromCache: true,
      totalFound: cachedAssets.length,
    };
  }
  
  console.log(`🌍 Fetching OSM assets for zone ${zoneId}, category ${category}`);
  console.log(`   Bbox: [${bbox.join(', ')}]`);
  console.log(`   OSM types: ${osmTypes.join(', ')}`);
  
  const osmFilters = osmTypes.map(type => {
    const [key, value] = type.split('=');
    return `node["${key}"="${value}"](${bbox.join(',')});way["${key}"="${value}"](${bbox.join(',')});relation["${key}"="${value}"](${bbox.join(',')});`;
  }).join('');
  
  const query = `[out:json][timeout:60][maxsize:52428800];(${osmFilters});out body geom;`;
  
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 90000);
    
    const response = await fetch(OVERPASS_API_URL, {
      method: 'POST',
      body: query,
      signal: controller.signal,
    });
    
    clearTimeout(timeoutId);
    
    if (response.status === 429) {
      console.error('OSM rate limit exceeded');
      return {
        assets: [],
        fromCache: false,
        totalFound: 0,
        error: 'Rate limit exceeded. The mapping service is temporarily unavailable. Please wait a moment and try again.',
        errorCode: 'RATE_LIMIT',
      };
    }
    
    if (response.status === 504 || response.status === 408) {
      console.error('OSM timeout');
      return {
        assets: [],
        fromCache: false,
        totalFound: 0,
        error: 'Request timed out. This zone may be too large. Try selecting a smaller area.',
        errorCode: 'TIMEOUT',
      };
    }
    
    if (!response.ok) {
      const errorText = await response.text().catch(() => 'Unknown error');
      console.error(`OSM API error: ${response.status}`, errorText);
      
      if (errorText.includes('runtime error') && errorText.includes('out of memory')) {
        return {
          assets: [],
          fromCache: false,
          totalFound: 0,
          error: 'This zone is too large to process. Try selecting a smaller area or a different category.',
          errorCode: 'SIZE_EXCEEDED',
        };
      }
      
      return {
        assets: [],
        fromCache: false,
        totalFound: 0,
        error: `Failed to fetch assets from OpenStreetMap (${response.status})`,
        errorCode: 'UNKNOWN',
      };
    }
    
    const data = await response.json();
    console.log(`   Received ${data.elements?.length || 0} raw elements`);
    
    const assets: OsmAsset[] = data.elements.map((el: any) => {
      let geometry = null;
      let centroid: [number, number] | null = null;
      let area = 0;
      let length = 0;
      
      if (el.type === 'node') {
        geometry = { type: 'Point', coordinates: [el.lon, el.lat] };
        centroid = [el.lat, el.lon];
      } else if (el.type === 'way' && el.geometry) {
        const coords = el.geometry.map((p: any) => [p.lon, p.lat]);
        if (coords[0][0] === coords[coords.length-1][0] && coords[0][1] === coords[coords.length-1][1]) {
          geometry = { type: 'Polygon', coordinates: [coords] };
          const latSum = coords.reduce((s: number, c: number[]) => s + c[1], 0);
          const lngSum = coords.reduce((s: number, c: number[]) => s + c[0], 0);
          centroid = [latSum / coords.length, lngSum / coords.length];
          area = Math.abs(coords.reduce((a: number, c: number[], i: number) => {
            const next = coords[(i + 1) % coords.length];
            return a + (c[0] * next[1] - next[0] * c[1]);
          }, 0) / 2) * 111319 * 111319;
        } else {
          try {
            const lineFeature = turf.lineString(coords);
            const clipped = turf.bboxClip(lineFeature, [bbox[1], bbox[0], bbox[3], bbox[2]]);
            
            if (clipped.geometry.type === 'LineString' && clipped.geometry.coordinates.length >= 2) {
              geometry = clipped.geometry;
              const clippedCoords = clipped.geometry.coordinates;
              centroid = (clippedCoords[Math.floor(clippedCoords.length / 2)] as number[]).slice().reverse() as [number, number];
              length = calculateLineLength(clippedCoords as number[][]);
            } else if (clipped.geometry.type === 'MultiLineString' && clipped.geometry.coordinates.length > 0) {
              geometry = clipped.geometry;
              const allCoords = clipped.geometry.coordinates.flat();
              centroid = (allCoords[Math.floor(allCoords.length / 2)] as number[]).slice().reverse() as [number, number];
              length = clipped.geometry.coordinates.reduce((total: number, seg: any) => 
                total + calculateLineLength(seg), 0);
            }
          } catch (clipError) {
            geometry = { type: 'LineString', coordinates: coords };
            centroid = [coords[0][1], coords[0][0]];
            length = calculateLineLength(coords);
          }
        }
      }
      
      const osmType = Object.entries(el.tags || {}).find(([k, v]) => 
        osmTypes.includes(`${k}=${v}`)
      );
      
      return {
        id: `${el.type}/${el.id}`,
        osmId: el.id,
        osmType: el.type,
        name: el.tags?.name || el.tags?.['name:en'] || `${osmType ? osmType[1] : 'Asset'} #${el.id}`,
        tags: el.tags || {},
        geometry,
        centroid,
        area,
        length,
        assetType: osmType ? `${osmType[0]}=${osmType[1]}` : 'unknown',
      };
    }).filter((a: OsmAsset) => a.geometry !== null);
    
    console.log(`   Processed ${assets.length} valid assets`);
    
    await setCachedAssets(cacheKey, zoneId, category, bbox, assets);
    
    return {
      assets,
      fromCache: false,
      totalFound: assets.length,
    };
    
  } catch (error: any) {
    if (error.name === 'AbortError') {
      console.error('OSM request aborted (timeout)');
      return {
        assets: [],
        fromCache: false,
        totalFound: 0,
        error: 'Request timed out. This zone may be too large. Try selecting a smaller area.',
        errorCode: 'TIMEOUT',
      };
    }
    
    console.error('OSM fetch error:', error);
    return {
      assets: [],
      fromCache: false,
      totalFound: 0,
      error: 'Network error while fetching assets. Please check your connection and try again.',
      errorCode: 'NETWORK_ERROR',
    };
  }
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

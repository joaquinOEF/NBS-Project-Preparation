// ============================================================================
// OVERPASS CLIENT — the single way this codebase talks to the Overpass API.
//
// Every Overpass call must go through `overpassQuery()`. Direct `fetch()` to a
// mirror is a bug: the public mirrors return 406 Not Acceptable without a
// descriptive User-Agent, rate-limit aggressively, have no SLA, and regularly
// answer 200 with an HTML/JSON error body rather than a non-2xx status.
//
// `overpassQuery` handles all of that: mirror rotation, User-Agent, timeout,
// backoff, and error classification.
// ============================================================================

export type OverpassErrorCode =
  | 'RATE_LIMIT'
  | 'TIMEOUT'
  | 'SIZE_EXCEEDED'
  | 'NETWORK_ERROR'
  | 'UNKNOWN';

export class OverpassError extends Error {
  code: OverpassErrorCode;
  lastMirror: string;

  constructor(message: string, code: OverpassErrorCode, lastMirror: string) {
    super(message);
    this.name = 'OverpassError';
    this.code = code;
    this.lastMirror = lastMirror;
  }
}

// Tried in order. If one returns a non-200 (rate limit, overload, timeout) or a
// body we can't parse, we fall through to the next.
export const OVERPASS_MIRRORS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass.openstreetmap.fr/api/interpreter',
];

// Overpass mirrors (Apache) return 406 without a descriptive User-Agent.
const USER_AGENT = 'NBSProjectBuilder/1.0 (nbs-project@openearth.org)';

const DEFAULT_TIMEOUT_MS = 35_000;
const BACKOFF_MS = 500;

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/** A query whose cost exceeds the server's memory will fail on every mirror. */
function isQueryFault(code: OverpassErrorCode): boolean {
  return code === 'SIZE_EXCEEDED';
}

function classifyStatus(status: number, body: string): OverpassErrorCode {
  if (status === 429) return 'RATE_LIMIT';
  if (status === 504 || status === 408) return 'TIMEOUT';
  if (/out of memory/i.test(body)) return 'SIZE_EXCEEDED';
  return 'UNKNOWN';
}

export interface OverpassQueryOptions {
  /** Abort a single mirror attempt after this long. Default 35s. */
  timeoutMs?: number;
  /** Short label used in log lines, e.g. the layer id. */
  label?: string;
}

/**
 * Run an Overpass QL query, rotating through mirrors until one answers.
 *
 * @throws {OverpassError} when every mirror fails, or immediately when the
 *   query itself is at fault (out of memory) and retrying cannot help.
 */
export async function overpassQuery(
  query: string,
  opts: OverpassQueryOptions = {}
): Promise<any> {
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const label = opts.label ?? 'query';

  let lastCode: OverpassErrorCode = 'UNKNOWN';
  let lastMirror = OVERPASS_MIRRORS[0];
  let lastReason = 'no mirrors attempted';

  for (let i = 0; i < OVERPASS_MIRRORS.length; i++) {
    const mirror = OVERPASS_MIRRORS[i];
    lastMirror = mirror;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(mirror, {
        method: 'POST',
        body: `data=${encodeURIComponent(query)}`,
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'User-Agent': USER_AGENT,
          Accept: 'application/json',
        },
        signal: controller.signal,
      });

      if (!response.ok) {
        const body = await response.text().catch(() => '');
        lastCode = classifyStatus(response.status, body);
        lastReason = `HTTP ${response.status}`;
        console.warn(
          `[overpass] ${label} via ${mirror} → ${lastReason} (${lastCode})`
        );
        if (isQueryFault(lastCode)) break;
        if (i < OVERPASS_MIRRORS.length - 1) await sleep(BACKOFF_MS);
        continue;
      }

      // A mirror under stress answers 200 with an HTML error page, or JSON
      // carrying a `remark` instead of elements. Both must count as failures.
      const raw = await response.text();
      let data: any;
      try {
        data = JSON.parse(raw);
      } catch {
        lastCode = /out of memory/i.test(raw) ? 'SIZE_EXCEEDED' : 'UNKNOWN';
        lastReason = 'non-JSON body (mirror error page)';
        console.warn(`[overpass] ${label} via ${mirror} → ${lastReason}`);
        if (isQueryFault(lastCode)) break;
        if (i < OVERPASS_MIRRORS.length - 1) await sleep(BACKOFF_MS);
        continue;
      }

      if (typeof data?.remark === 'string' && /error/i.test(data.remark)) {
        lastCode = /out of memory/i.test(data.remark)
          ? 'SIZE_EXCEEDED'
          : 'UNKNOWN';
        lastReason = `remark: ${data.remark.slice(0, 120)}`;
        console.warn(`[overpass] ${label} via ${mirror} → ${lastReason}`);
        if (isQueryFault(lastCode)) break;
        if (i < OVERPASS_MIRRORS.length - 1) await sleep(BACKOFF_MS);
        continue;
      }

      return data;
    } catch (err: any) {
      const aborted = err?.name === 'AbortError';
      lastCode = aborted ? 'TIMEOUT' : 'NETWORK_ERROR';
      lastReason = aborted
        ? `timeout after ${timeoutMs}ms`
        : err?.message || 'fetch failed';
      console.warn(`[overpass] ${label} via ${mirror} → ${lastReason}`);
      if (i < OVERPASS_MIRRORS.length - 1) await sleep(BACKOFF_MS);
    } finally {
      clearTimeout(timer);
    }
  }

  throw new OverpassError(
    `Overpass ${label} failed on all mirrors. Last: ${lastMirror} — ${lastReason}`,
    lastCode,
    lastMirror
  );
}

/** Convert an Overpass `out body geom` response into a GeoJSON FeatureCollection. */
export function overpassToGeoJSON(overpassData: any): any {
  const features: any[] = [];

  for (const el of overpassData?.elements || []) {
    let geometry: any = null;
    const properties: Record<string, any> = {
      osm_id: el.id,
      osm_type: el.type,
      ...el.tags,
    };

    if (el.type === 'node' && el.lat != null && el.lon != null) {
      geometry = { type: 'Point', coordinates: [el.lon, el.lat] };
    } else if (el.type === 'way' && el.geometry) {
      const coords = el.geometry.map((p: any) => [p.lon, p.lat]);
      // Close polygon if first == last
      if (
        coords.length >= 4 &&
        coords[0][0] === coords[coords.length - 1][0] &&
        coords[0][1] === coords[coords.length - 1][1]
      ) {
        geometry = { type: 'Polygon', coordinates: [coords] };
      } else if (coords.length >= 2) {
        geometry = { type: 'LineString', coordinates: coords };
      }
    } else if (el.type === 'relation' && el.members) {
      // Simplify: extract outer ways as polygons
      const outerCoords: number[][][] = [];
      for (const member of el.members) {
        if (member.role === 'outer' && member.geometry) {
          const ring = member.geometry.map((p: any) => [p.lon, p.lat]);
          if (ring.length >= 4) outerCoords.push(ring);
        }
      }
      if (outerCoords.length === 1) {
        geometry = { type: 'Polygon', coordinates: outerCoords };
      } else if (outerCoords.length > 1) {
        geometry = {
          type: 'MultiPolygon',
          coordinates: outerCoords.map(r => [r]),
        };
      }
    }

    if (geometry) {
      features.push({ type: 'Feature', geometry, properties });
    }
  }

  return { type: 'FeatureCollection', features };
}

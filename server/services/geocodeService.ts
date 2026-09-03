// ============================================================================
// REVERSE GEOCODING — a coordinate becomes an address
// ============================================================================
// When a CBO drops a pin instead of picking a named OSM place, the site is
// stored as "Ponto marcado (-30.0577, -51.1936)" (MapMicroapp's customPointName
// fallback). That string then IS the place: the site card asks "is this right?"
// about it, and it flows into the transcript, the concept note, the coordinator
// roster and the família why-lines. Nobody can confirm, correct or repeat a
// latitude to their team.
//
// Nominatim's /reverse turns it into a street address. Deliberately narrow:
//
//  - Fails SOFT. A geocode is a nicety; losing the site because OSM was slow is
//    not acceptable. Every failure path returns null and the caller keeps the
//    coordinate name.
//  - Identifying User-Agent, per Nominatim's usage policy. The same omission is
//    what returned 406 from Overpass in this codebase — an anonymous request to
//    an OSM endpoint gets refused, not throttled, and it looks like a bug.
//  - Cached to 5 decimal places (~1 m). One pin per org per workshop makes the
//    cache mostly about retries and reloads, not volume.
//  - 1 request/second, which is Nominatim's published limit. At cohort volume
//    the queue never actually holds anything.

import { isFakeGeocodeEnabled } from './runtimeEnv';
import { isCoordinateSiteName } from '@shared/site-name';

const NOMINATIM_URL = 'https://nominatim.openstreetmap.org';

// Nominatim refuses anonymous traffic. Kept in one place so it can't drift from
// the contact address OSM expects to be able to reach.
const USER_AGENT =
  'OEF-NBS-Project-Preparation/1.0 (Open Earth Foundation; contact@openearth.org)';

const cache = new Map<string, string | null>();
const key = (lat: number, lng: number) => `${lat.toFixed(5)},${lng.toFixed(5)}`;

// Serialize + space out requests: Nominatim's limit is per-IP, so concurrent
// callers have to share one lane.
let lastCallAt = 0;
let chain: Promise<unknown> = Promise.resolve();
const MIN_GAP_MS = 1100;

function schedule<T>(fn: () => Promise<T>): Promise<T> {
  const run = chain.then(async () => {
    const wait = Math.max(0, lastCallAt + MIN_GAP_MS - Date.now());
    if (wait > 0) await new Promise(r => setTimeout(r, wait));
    lastCallAt = Date.now();
    return fn();
  });
  // Keep the chain alive even when a link rejects.
  chain = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

/**
 * Build a short, speakable address from a Nominatim address object.
 *
 * NOT the raw `display_name` — that is a comma-salad ending in "Região
 * Geográfica Imediata de Porto Alegre, Rio Grande do Sul, Região Sul, 90000-000,
 * Brasil", which is worse to confirm than the coordinate was. Street + number is
 * what someone can check against the place they have in mind.
 */
function shortAddress(a: Record<string, string> | undefined): string | null {
  if (!a) return null;
  const street = a.road || a.pedestrian || a.footway || a.residential;
  const place =
    a.amenity || a.leisure || a.building || a.shop || a.park || a.school;
  const number = a.house_number;

  if (street) return number ? `${street}, ${number}` : street;
  // No street (common for a pin dropped inside a park or a vila): fall back to
  // the named feature, then to the smallest administrative unit we got.
  return place || a.suburb || a.neighbourhood || a.quarter || null;
}

/**
 * Reverse-geocode a point to a short street address. Returns null on any
 * failure, on a timeout, or when the result carries nothing worth showing —
 * callers must treat null as "keep whatever name you had".
 */
export async function reverseGeocode(
  lat: number,
  lng: number,
): Promise<string | null> {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  const k = key(lat, lng);
  if (cache.has(k)) return cache.get(k) ?? null;

  try {
    const result = await schedule(async () => {
      const url = new URL(`${NOMINATIM_URL}/reverse`);
      url.searchParams.set('lat', String(lat));
      url.searchParams.set('lon', String(lng));
      url.searchParams.set('format', 'jsonv2');
      url.searchParams.set('zoom', '18'); // building / street level
      url.searchParams.set('addressdetails', '1');
      url.searchParams.set('accept-language', 'pt-BR');

      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 4000);
      try {
        const res = await fetch(url, {
          headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
          signal: ctrl.signal,
        });
        if (!res.ok) return null;
        const body = (await res.json()) as { address?: Record<string, string> };
        return shortAddress(body?.address);
      } finally {
        clearTimeout(timer);
      }
    });
    cache.set(k, result);
    return result;
  } catch {
    // Negative-cache too: a pin over water or outside OSM coverage would
    // otherwise re-request on every reload of the same session.
    cache.set(k, null);
    return null;
  }
}

/**
 * True when a site name is a coordinate placeholder rather than a real name.
 *
 * Gating on this is what keeps the geocoder from ever overwriting a name the
 * user chose or that OSM already supplied ("Praça da Encol", "EMEF Vila Nova").
 * Matches both MapMicroapp fallbacks, pt and en.
 */
// ============================================================================
// FORWARD GEOCODING — an address becomes a coordinate
// ============================================================================
// W2 (Aug 2026): the map failed for two of the three orgs that reached it. Ksa
// Rosa reported "não abre o mapa" three times across nine minutes; COOP20
// marked and rejected four pins within ~20m over thirteen minutes. Both gave up
// and typed the address instead, and both were understood immediately — but
// only as TEXT. The site checkpoint fires on map output, so a typed address
// produced no coordinates at all: Ksa Rosa completed E2 with a site_address and
// no _site_lat/_site_lng, while Misturaí, whose map worked, has both.
//
// The same Nominatim lane serves /search. Constraints match /reverse: one
// identifying User-Agent, one request per second, cached, and fails SOFT —
// losing the geocode must never cost us the address the org just gave us.
//
// Bounded to Porto Alegre. "Voluntários da Pátria 1039" is a real street in
// several Brazilian cities, and an unbounded search happily returns the wrong
// one — silently, with confident coordinates.
const POA_VIEWBOX = '-51.32,-29.93,-51.01,-30.27'; // W,N,E,S
const fwdCache = new Map<string, { lat: number; lng: number; label: string } | null>();

export async function forwardGeocode(
  query: string,
  cityHint = 'Porto Alegre, Rio Grande do Sul, Brasil',
): Promise<{ lat: number; lng: number; label: string } | null> {
  const q = query.trim();
  if (q.length < 4) return null;
  // e2e seam: a fixed POA coordinate, so the address path is testable without
  // reaching Nominatim. Refuses in a deployment (see runtimeEnv).
  if (isFakeGeocodeEnabled()) {
    return { lat: -30.0267, lng: -51.2173, label: q };
  }
  const cacheKey = q.toLowerCase();
  if (fwdCache.has(cacheKey)) return fwdCache.get(cacheKey)!;

  try {
    const result = await schedule(async () => {
      const url =
        `${NOMINATIM_URL}/search?format=jsonv2&limit=1&addressdetails=1` +
        `&countrycodes=br&bounded=1&viewbox=${POA_VIEWBOX}` +
        `&q=${encodeURIComponent(`${q}, ${cityHint}`)}`;
      const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT } });
      if (!res.ok) return null;
      const rows = (await res.json()) as Array<{ lat: string; lon: string; address?: Record<string, string> }>;
      const hit = rows?.[0];
      if (!hit) return null;
      const lat = Number(hit.lat);
      const lng = Number(hit.lon);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
      // Prefer the tidy street+number form the reverse path already produces,
      // so a site named this way reads the same however it was resolved.
      return { lat, lng, label: shortAddress(hit.address) ?? q };
    });
    fwdCache.set(cacheKey, result);
    return result;
  } catch (e: any) {
    console.error(`[geocode] forward lookup failed for "${q}":`, e?.message || e);
    fwdCache.set(cacheKey, null);
    return null;
  }
}

/**
 * ⚠️ One implementation, in shared/site-name.ts. This predicate decides whether
 * to spend a geocode; the same question decides how the name is PRINTED when
 * the geocode fails, and two copies of it would drift on the day someone adds a
 * third placeholder shape.
 */
export const isPlaceholderSiteName = isCoordinateSiteName;

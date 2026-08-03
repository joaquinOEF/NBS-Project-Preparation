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
export function isPlaceholderSiteName(name: string | undefined | null): boolean {
  if (!name) return false;
  return /^(ponto marcado|área desenhada|area desenhada|marked point|drawn area)\b/i.test(
    name.trim(),
  );
}

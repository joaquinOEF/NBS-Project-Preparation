import fs from 'fs/promises';
import path from 'path';

// ============================================================================
// OSM REFERENCE LAYERS — parks, schools, hospitals, wetlands.
//
// These are slow-changing features that every map surface (the CBO map's
// MapMicroapp, the Site Explorer) loads on open. Fetching them from Overpass at
// request time was the single biggest source of map-open latency: Replit
// autoscale gives each container its own ephemeral disk, so a per-container
// cache is cold on every deploy and every scale-up.
//
// So the snapshots are committed to the repo under knowledge/osm/<city>/ and
// ship with the deploy, the same way client/public/sample-data/ already carries
// the boundary, rivers, forest and landcover GeoJSON. Regenerate them with
// `npm run osm:refresh`. Overpass remains only as a fallback for a layer whose
// snapshot is missing.
// ============================================================================

export const CITY_SLUG = 'porto-alegre';

/** Porto Alegre bounding box: approx -30.27,-51.32 to -29.93,-51.01 (S,W,N,E). */
export const POA_BBOX = '-30.27,-51.32,-29.93,-51.01';

export interface OsmReferenceQuery {
  id: string;
  label: string;
  /** Overpass QL, bbox baked in. */
  query: string;
}

export const OSM_REFERENCE_QUERIES: OsmReferenceQuery[] = [
  {
    id: 'parks',
    label: 'Parks & Green Space',
    query: `[out:json][timeout:30][bbox:${POA_BBOX}];(way["leisure"="park"];relation["leisure"="park"];way["leisure"="garden"];way["landuse"="recreation_ground"];);out body geom;`,
  },
  {
    id: 'schools',
    label: 'Schools & Education',
    query: `[out:json][timeout:30][bbox:${POA_BBOX}];(node["amenity"="school"];way["amenity"="school"];node["amenity"="university"];way["amenity"="university"];);out body geom;`,
  },
  {
    id: 'hospitals',
    label: 'Hospitals & Health',
    query: `[out:json][timeout:30][bbox:${POA_BBOX}];(node["amenity"="hospital"];way["amenity"="hospital"];node["amenity"="clinic"];way["amenity"="clinic"];);out body geom;`,
  },
  {
    id: 'wetlands',
    label: 'Wetlands',
    query: `[out:json][timeout:30][bbox:${POA_BBOX}];(way["natural"="wetland"];relation["natural"="wetland"];);out body geom;`,
  },
];

export function snapshotDir(city: string = CITY_SLUG): string {
  return path.join(process.cwd(), 'knowledge', 'osm', city);
}

export function snapshotPath(
  layerId: string,
  city: string = CITY_SLUG
): string {
  return path.join(snapshotDir(city), `${layerId}.json`);
}

/**
 * Foreign members we attach to the FeatureCollection. GeoJSON permits these and
 * Leaflet ignores them, so the snapshot stays directly renderable.
 *
 * NOT named `bbox`: RFC 7946 §5 reserves that member on a FeatureCollection and
 * requires an array of numbers. We were writing the Overpass bbox *string* there,
 * so any consumer that trusted `fc.bbox` (turf.bboxPolygon, mapbox tooling) would
 * have choked on it. `sourceBbox` is ours to define.
 */
export interface SnapshotMeta {
  generatedAt: string;
  source: string;
  sourceBbox: string;
}

const snapshotMemo = new Map<string, any>();

/** Read a committed snapshot. Returns null when the layer has none. */
export async function readSnapshot(
  layerId: string,
  city: string = CITY_SLUG
): Promise<any | null> {
  const memoKey = `${city}/${layerId}`;
  const memo = snapshotMemo.get(memoKey);
  if (memo) return memo;

  try {
    const raw = await fs.readFile(snapshotPath(layerId, city), 'utf-8');
    const data = JSON.parse(raw);
    snapshotMemo.set(memoKey, data);
    return data;
  } catch {
    return null;
  }
}

export async function writeSnapshot(
  layerId: string,
  geojson: any,
  meta: SnapshotMeta,
  city: string = CITY_SLUG
): Promise<number> {
  await fs.mkdir(snapshotDir(city), { recursive: true });
  const payload = { ...geojson, ...meta };
  const serialized = JSON.stringify(payload);
  await fs.writeFile(snapshotPath(layerId, city), serialized);
  snapshotMemo.delete(`${city}/${layerId}`);
  return serialized.length;
}

/**
 * Log which reference layers have a committed snapshot, so a missing one shows
 * up at boot rather than as a slow map three weeks later.
 */
export async function logSnapshotStatus(
  city: string = CITY_SLUG
): Promise<void> {
  const missing: string[] = [];
  const present: string[] = [];

  for (const q of OSM_REFERENCE_QUERIES) {
    const snap = await readSnapshot(q.id, city);
    if (!snap) {
      missing.push(q.id);
      continue;
    }
    const generatedAt = snap.generatedAt ? new Date(snap.generatedAt) : null;
    const ageDays = generatedAt
      ? Math.round((Date.now() - generatedAt.getTime()) / 86_400_000)
      : null;
    present.push(
      `${q.id} (${snap.features?.length ?? 0} features${ageDays != null ? `, ${ageDays}d old` : ''})`
    );
  }

  if (present.length)
    console.log(`[osm] snapshots loaded: ${present.join(', ')}`);
  if (missing.length) {
    console.warn(
      `[osm] NO SNAPSHOT for: ${missing.join(', ')} — these will hit Overpass on ` +
        `every cold container. Run \`npm run osm:refresh\` and commit the result.`
    );
  }
}

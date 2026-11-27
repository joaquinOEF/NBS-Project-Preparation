/**
 * Regenerate the committed OSM reference-layer snapshots.
 *
 *   npm run osm:refresh              # all reference layers
 *   npm run osm:refresh -- parks     # one or more reference layers
 *   npm run osm:refresh -- assets    # the city-wide candidate-site snapshot
 *   npm run osm:refresh -- assets highway=service leisure=park   # some types
 *   npm run osm:refresh -- assets --resume   # reuse raw answers under 24 h old
 *
 * Writes knowledge/osm/<city>/<layer>.json, which is committed to the repo and
 * ships with the deploy. Review the diff before committing — a mirror having a
 * bad day can return a truncated result that still parses as valid GeoJSON.
 *
 * `assets` writes knowledge/osm/<city>/assets/<key>__<value>.json + index.json
 * (see server/services/osmAssetSnapshot.ts for the format). It asks Overpass for
 * ONE key=value at a time, city-wide, with a pause between requests — about 40
 * requests, so expect 15–40 minutes. A type no mirror will deliver is recorded
 * under `missing` in the index and served by the live fallback until the next
 * successful refresh.
 */
import fs from 'fs/promises';
import path from 'path';
import {
  overpassQuery,
  overpassToGeoJSON,
  OVERPASS_MIRRORS,
} from '../server/services/overpassClient';
import {
  OSM_REFERENCE_QUERIES,
  POA_BBOX,
  CITY_SLUG,
  writeSnapshot,
  readSnapshot,
  snapshotPath,
} from '../server/services/osmReferenceLayers';
import {
  type AssetIndex,
  type AssetTypeFile,
  type CompactAsset,
  assetSnapshotDir,
  assetIndexPath,
  assetTypeFileName,
  compactFromOverpass,
  candidateFromCompact,
  candidateInZone,
  prepareZone,
} from '../server/services/osmAssetSnapshot';

// Be a good citizen: the public mirrors are free and shared.
const PAUSE_BETWEEN_LAYERS_MS = 3_000;

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ----------------------------------------------------------------------------
// Candidate-site snapshot (`assets`)
// ----------------------------------------------------------------------------

const PAUSE_BETWEEN_TYPES_MS = 10_000;
/** Each round already tries all three mirrors; wait this long before the next. */
const ROUND_BACKOFF_MS = [30_000, 60_000, 120_000];
const RAW_CACHE_DIR = path.join(process.cwd(), 'scripts', 'output', 'osm-assets-raw');
const RAW_CACHE_MAX_AGE_MS = 24 * 60 * 60 * 1000;
const SAMPLE_DATA = path.join(process.cwd(), 'client', 'public', 'sample-data');

/** Every `key=value` an intervention can be placed on — the app's own list. */
async function candidateAssetTypes(): Promise<string[]> {
  const raw = await fs.readFile(path.join(SAMPLE_DATA, 'interventions.json'), 'utf-8');
  const types = new Set<string>();
  for (const i of JSON.parse(raw).interventions) {
    for (const t of i.osmAssetTypes || []) types.add(t);
  }
  return Array.from(types).sort();
}

let mirrorOrder = [...OVERPASS_MIRRORS];

async function fetchRawType(type: string, resume: boolean): Promise<{ data: any; rawBytes: number; cached: boolean }> {
  const rawPath = path.join(RAW_CACHE_DIR, assetTypeFileName(type));
  if (resume) {
    try {
      const stat = await fs.stat(rawPath);
      if (Date.now() - stat.mtimeMs < RAW_CACHE_MAX_AGE_MS) {
        const raw = await fs.readFile(rawPath, 'utf-8');
        return { data: JSON.parse(raw), rawBytes: raw.length, cached: true };
      }
    } catch {
      // no usable raw answer — fetch
    }
  }

  const [key, value] = type.split('=');
  // Relations are left out: the app has never drawn them (see compactFromOverpass).
  const query = `[out:json][timeout:170][bbox:${POA_BBOX}];(node["${key}"="${value}"];way["${key}"="${value}"];);out tags geom;`;

  let lastError: any;
  for (let round = 0; round <= ROUND_BACKOFF_MS.length; round++) {
    // One mirror per call so we know which one answered, and start the next
    // type with it: a mirror that is down costs minutes per request otherwise.
    for (const mirror of [...mirrorOrder]) {
      try {
        const data = await overpassQuery(query, { label: type, timeoutMs: 180_000, mirrors: [mirror] });
        if (!Array.isArray(data?.elements)) throw new Error('answer has no elements array');
        mirrorOrder = [mirror, ...mirrorOrder.filter(m => m !== mirror)];
        const raw = JSON.stringify(data);
        await fs.mkdir(RAW_CACHE_DIR, { recursive: true });
        await fs.writeFile(rawPath, raw);
        return { data, rawBytes: raw.length, cached: false };
      } catch (err: any) {
        lastError = err;
        await sleep(2_000);
      }
    }
    if (round < ROUND_BACKOFF_MS.length) {
      process.stdout.write(`retry in ${ROUND_BACKOFF_MS[round] / 1000}s… `);
      await sleep(ROUND_BACKOFF_MS[round]);
    }
  }
  throw lastError;
}

async function refreshAssets(requestedTypes: string[], resume: boolean): Promise<void> {
  const allTypes = await candidateAssetTypes();
  const candidateSet = new Set(allTypes);
  const types = requestedTypes.length ? allTypes.filter(t => requestedTypes.includes(t)) : allTypes;
  if (!types.length) {
    console.error(`No matching asset types. Known: ${allTypes.join(', ')}`);
    process.exit(1);
  }

  // The snapshot keeps what touches a neighbourhood: the Overpass bbox also
  // takes in slices of Canoas, Alvorada, Viamão and the far shore of the Guaíba.
  const zonesRaw = await fs.readFile(path.join(SAMPLE_DATA, 'porto-alegre-neighborhood-zones.json'), 'utf-8');
  const zones = (JSON.parse(zonesRaw).geoJson.features as any[])
    .map(f => prepareZone(f.geometry))
    .filter((z): z is NonNullable<typeof z> => !!z);

  await fs.mkdir(assetSnapshotDir(), { recursive: true });
  let index: AssetIndex;
  try {
    index = JSON.parse(await fs.readFile(assetIndexPath(), 'utf-8'));
  } catch {
    index = { generatedAt: '', source: '', sourceBbox: POA_BBOX, totalCount: 0, totalBytes: 0, types: {}, missing: {} };
  }

  console.log(`Refreshing ${types.length} candidate-site type(s) for ${CITY_SLUG} — one request per type, ${PAUSE_BETWEEN_TYPES_MS / 1000}s apart\n`);
  const failures: string[] = [];

  for (let i = 0; i < types.length; i++) {
    const type = types[i];
    process.stdout.write(`  ${type.padEnd(28)} `);
    let fetched = false;
    try {
      const { data, rawBytes, cached } = await fetchRawType(type, resume);
      fetched = !cached;
      const assets: CompactAsset[] = [];
      let outsideCity = 0;
      for (const el of data.elements) {
        const compact = compactFromOverpass(el, type, candidateSet);
        if (!compact) continue;
        const candidate = candidateFromCompact(compact, type);
        if (!zones.some(z => candidateInZone(candidate, z))) {
          outsideCity++;
          continue;
        }
        assets.push(compact);
      }

      const previous = index.types[type]?.count ?? null;
      if (assets.length === 0 && previous) {
        console.log(`0 features where there were ${previous} — refusing to overwrite`);
        failures.push(type);
      } else {
        const generatedAt = new Date().toISOString();
        const file: AssetTypeFile = { type, generatedAt, count: assets.length, assets };
        const serialized = JSON.stringify(file);
        const fileName = assetTypeFileName(type);
        await fs.writeFile(path.join(assetSnapshotDir(), fileName), serialized);
        index.types[type] = { count: assets.length, bytes: serialized.length, rawBytes, file: fileName, generatedAt };
        delete index.missing[type];
        const delta = previous == null ? 'new' : `${assets.length - previous >= 0 ? '+' : ''}${assets.length - previous} vs previous`;
        console.log(
          `${String(assets.length).padStart(6)} kept (${outsideCity} outside the city), ` +
            `${(rawBytes / 1024).toFixed(0)} KB raw → ${(serialized.length / 1024).toFixed(0)} KB (${delta})${cached ? ' [raw reused]' : ''}`
        );
      }
    } catch (err: any) {
      const reason = String(err?.message || err).slice(0, 200);
      console.log(`FAILED — ${reason}`);
      failures.push(type);
      // Only a type with no earlier snapshot becomes "missing"; an older file
      // is still better than the live path.
      if (!index.types[type]) index.missing[type] = { reason, attemptedAt: new Date().toISOString() };
      fetched = true;
    }

    // Written after every type, so an interrupted run loses nothing.
    const entries = Object.values(index.types);
    index.generatedAt = new Date().toISOString();
    index.source = 'OpenStreetMap via Overpass API (ODbL)';
    index.sourceBbox = POA_BBOX;
    index.totalCount = entries.reduce((n, e) => n + e.count, 0);
    index.totalBytes = entries.reduce((n, e) => n + e.bytes, 0);
    index.types = Object.fromEntries(Object.entries(index.types).sort(([a], [b]) => a.localeCompare(b)));
    await fs.writeFile(assetIndexPath(), JSON.stringify(index, null, 1));

    if (fetched && i < types.length - 1) await sleep(PAUSE_BETWEEN_TYPES_MS);
  }

  const rawTotal = Object.values(index.types).reduce((n, e) => n + (e.rawBytes || 0), 0);
  console.log(
    `\n${index.totalCount} candidate sites in ${Object.keys(index.types).length} types: ` +
      `${(rawTotal / 1_048_576).toFixed(1)} MB raw → ${(index.totalBytes / 1_048_576).toFixed(2)} MB committed`
  );
  const missing = Object.keys(index.missing);
  if (missing.length) console.warn(`MISSING from the snapshot (served live until refreshed): ${missing.join(', ')}`);
  if (failures.length) {
    console.error(`\nFailed: ${failures.join(', ')}. Earlier files for those types, if any, were left untouched.`);
    process.exit(1);
  }
  console.log(`Review the diff, then commit ${path.relative(process.cwd(), assetSnapshotDir())}/.`);
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  if (args[0] === 'assets') {
    await refreshAssets(args.slice(1).filter(a => !a.startsWith('-')), args.includes('--resume'));
    return;
  }

  const requested = process.argv.slice(2).filter(a => !a.startsWith('-'));
  const layers = requested.length
    ? OSM_REFERENCE_QUERIES.filter(q => requested.includes(q.id))
    : OSM_REFERENCE_QUERIES;

  if (!layers.length) {
    console.error(
      `No matching layers. Known: ${OSM_REFERENCE_QUERIES.map(q => q.id).join(', ')}`
    );
    process.exit(1);
  }

  console.log(`Refreshing ${layers.length} OSM snapshot(s) for ${CITY_SLUG}\n`);
  const failures: string[] = [];

  for (let i = 0; i < layers.length; i++) {
    const layer = layers[i];
    const previous = await readSnapshot(layer.id);
    const previousCount = previous?.features?.length ?? null;

    process.stdout.write(`  ${layer.id.padEnd(10)} fetching… `);
    try {
      // Generous timeout: this is an offline script, not a request path.
      const data = await overpassQuery(layer.query, {
        label: layer.id,
        timeoutMs: 180_000,
      });
      const geojson = overpassToGeoJSON(data);
      const count = geojson.features.length;

      if (count === 0) {
        console.log(
          '0 features — refusing to overwrite with an empty snapshot'
        );
        failures.push(layer.id);
        continue;
      }

      const bytes = await writeSnapshot(layer.id, geojson, {
        generatedAt: new Date().toISOString(),
        source: 'OpenStreetMap via Overpass API (ODbL)',
        sourceBbox: POA_BBOX,
      });

      const delta =
        previousCount == null
          ? 'new'
          : `${count - previousCount >= 0 ? '+' : ''}${count - previousCount} vs previous`;
      console.log(
        `${count} features, ${(bytes / 1024).toFixed(0)} KB (${delta})`
      );
    } catch (err: any) {
      console.log(`FAILED — ${err?.message || err}`);
      failures.push(layer.id);
    }

    if (i < layers.length - 1) await sleep(PAUSE_BETWEEN_LAYERS_MS);
  }

  console.log(`\nSnapshots written to ${snapshotPath('<layer>')}`);

  if (failures.length) {
    console.error(
      `\nFailed: ${failures.join(', ')}. Existing snapshots left untouched.`
    );
    process.exit(1);
  }

  console.log('Review the diff, then commit knowledge/osm/.');
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});

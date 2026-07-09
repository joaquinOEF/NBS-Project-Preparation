/**
 * Regenerate the committed OSM reference-layer snapshots.
 *
 *   npm run osm:refresh              # all layers
 *   npm run osm:refresh -- parks     # one or more layers
 *
 * Writes knowledge/osm/<city>/<layer>.json, which is committed to the repo and
 * ships with the deploy. Review the diff before committing — a mirror having a
 * bad day can return a truncated result that still parses as valid GeoJSON.
 */
import {
  overpassQuery,
  overpassToGeoJSON,
} from '../server/services/overpassClient';
import {
  OSM_REFERENCE_QUERIES,
  POA_BBOX,
  CITY_SLUG,
  writeSnapshot,
  readSnapshot,
  snapshotPath,
} from '../server/services/osmReferenceLayers';

// Be a good citizen: the public mirrors are free and shared.
const PAUSE_BETWEEN_LAYERS_MS = 3_000;

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function main(): Promise<void> {
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
        bbox: POA_BBOX,
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

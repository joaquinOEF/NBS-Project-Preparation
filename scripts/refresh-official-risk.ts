/**
 * Refresh the committed SGB official-risk snapshots.
 *
 *   npm run official-risk:refresh
 *
 * Mirrors scripts/refresh-osm-snapshots.ts: fetch from the live source, write
 * under knowledge/official-risk/<city>/, and commit the result so every Replit
 * container ships with it instead of paying for a 60s ArcGIS query on cold start.
 *
 * SGB updates the Setorização base a few times a year (the current POA extract
 * is 142 sectors surveyed in 2022 plus 3 added by the 2024 mapeamento
 * complementar). Re-run this after any municipal update — notably if the PMRR
 * subsectors ever land in the federal service.
 */
import fs from 'fs/promises';
import path from 'path';
import {
  OFFICIAL_RISK_SOURCES,
  fetchLive,
  snapshotDir,
  snapshotPath,
} from '../server/services/officialRiskLayers';

async function main() {
  await fs.mkdir(snapshotDir(), { recursive: true });

  let failures = 0;
  for (const source of OFFICIAL_RISK_SOURCES) {
    // Derived layers have no live endpoint — their snapshot is produced by
    // scripts/extract-arvc-figures.py, not by this refresher.
    if (!source.url) {
      console.log(`[official-risk] ${source.id} … skipped (derived, no live source)`);
      continue;
    }
    process.stdout.write(`[official-risk] ${source.id} … `);
    try {
      const geojson = await fetchLive(source);
      const out = snapshotPath(source.id);
      await fs.writeFile(out, JSON.stringify(geojson));
      const bytes = (await fs.stat(out)).size;
      console.log(
        `${geojson.features.length} features, ${(bytes / 1024).toFixed(0)} KB → ${path.relative(process.cwd(), out)}`
      );
    } catch (err) {
      failures++;
      console.log(`FAILED — ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  if (failures) {
    console.error(`\n${failures} source(s) failed. Existing snapshots left untouched.`);
    process.exit(1);
  }
  console.log('\nDone. Commit the snapshot(s) so they ship with the deploy.');
}

main();

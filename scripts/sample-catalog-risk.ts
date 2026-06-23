/**
 * Catalog risk ingestion — "catalog leads, app shows".
 *
 * Samples the VALIDATED catalog composites poa_<hazard>_{hazard,exposure,vulnerability,risk}
 * (geospatial-data, S3, 24-bit value tiles, scale 10000) at each 250 m grid-cell centroid
 * and writes them into the grid metrics. Replaces the app's locally-computed risk scores.
 *
 *   metrics.<hazard>_hazard / _exposure / _vulnerability / _risk
 *   metrics.<hazard>_score = <hazard>_risk   (back-compat for readers keyed on _score)
 *
 * This is INGESTION, not computation — the H×E×V math lives in the catalog. To migrate a new
 * hazard, add it to HAZARDS below (once poa_<hazard>_* is published) and re-run.
 *
 * Usage: npx tsx scripts/sample-catalog-risk.ts
 *
 * See docs/risk-catalog-migration-playbook.md §3A / §4.
 */

import fs from 'fs';
import path from 'path';
import { PNG } from 'pngjs';
import { latLngToTilePixel } from './tile-sampler';

const S3_BASE = 'https://geo-test-api.s3.us-east-1.amazonaws.com';
const Z = 13; // grid was sampled at z=13; catalog poa_* tiles published at z=13
const SCALE = 10000; // 24-bit RGB, value = (R + 256*G + 65536*B) / 10000

// ── Hazards to ingest. Add heat/landslide here once their catalog datasets publish. ──
const COMPONENTS = ['hazard', 'exposure', 'vulnerability', 'risk'] as const;
type Component = (typeof COMPONENTS)[number];

interface Hazard {
  key: string; // metric prefix, e.g. 'flood' → flood_hazard, flood_risk
  base: string; // S3 path under <S3_BASE> up to the component folder
}

const ALL_HAZARDS: Hazard[] = [
  {
    key: 'flood',
    base: 'oef_calculation/release/v1/porto_alegre/climate_hazards/floods',
  },
  {
    key: 'heat',
    base: 'oef_calculation/release/v1/porto_alegre/climate_hazards/heat',
  },
  {
    // NOTE: catalog path is `landslides` (PLURAL, like `floods`), not `landslide`.
    key: 'landslide',
    base: 'oef_calculation/release/v1/porto_alegre/climate_hazards/landslides',
  },
];

// Optional single-hazard run: `HAZARD_ONLY=heat npx tsx scripts/sample-catalog-risk.ts`.
// Useful when re-sampling ONE hazard without re-fetching the others — e.g. some
// component tiles (exposure/vulnerability) are 403 from certain networks, so a
// full re-run from there would overwrite already-good values with null. Scoping
// to the hazard you can fully fetch protects the rest.
const HAZARD_ONLY = process.env.HAZARD_ONLY;
const HAZARDS: Hazard[] = HAZARD_ONLY
  ? ALL_HAZARDS.filter(h => h.key === HAZARD_ONLY)
  : ALL_HAZARDS;

const tileUrl = (h: Hazard, c: Component, z: number, x: number, y: number) =>
  `${S3_BASE}/${h.base}/${c}/tiles_values/${z}/${x}/${y}.png`;

// ── Decoded-tile cache (avoids re-decoding the same 256×256 PNG per cell) ──────
const pngCache = new Map<string, { data: Uint8Array } | null>();

async function getTile(url: string): Promise<{ data: Uint8Array } | null> {
  if (pngCache.has(url)) return pngCache.get(url)!;
  let decoded: { data: Uint8Array } | null = null;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
    if (res.ok) {
      const buf = Buffer.from(await res.arrayBuffer());
      const png = PNG.sync.read(buf);
      decoded = { data: png.data };
    }
  } catch {
    decoded = null;
  }
  pngCache.set(url, decoded);
  return decoded;
}

async function sample(h: Hazard, c: Component, lat: number, lng: number): Promise<number | null> {
  const { tileX, tileY, px, py } = latLngToTilePixel(lat, lng, Z);
  const tile = await getTile(tileUrl(h, c, Z, tileX, tileY));
  if (!tile) return null;
  const i = (py * 256 + px) * 4;
  const r = tile.data[i], g = tile.data[i + 1], b = tile.data[i + 2], a = tile.data[i + 3];
  if (a < 10) return null; // nodata
  const v = (r + 256 * g + 65536 * b) / SCALE;
  return isFinite(v) ? Math.round(v * 1000) / 1000 : null;
}

async function main() {
  const gridPath = path.join(process.cwd(), 'client', 'public', 'sample-data', 'porto-alegre-grid-250m.json');
  const grid = JSON.parse(fs.readFileSync(gridPath, 'utf-8'));
  const features = grid.geoJson.features as Array<{ properties: { centroid: [number, number]; metrics: Record<string, number | null> } }>;
  console.log(`Loaded ${features.length} cells from ${path.relative(process.cwd(), gridPath)}`);

  for (const h of HAZARDS) {
    console.log(`\nIngesting catalog risk for "${h.key}" (z=${Z})...`);
    const counts: Record<Component, number> = { hazard: 0, exposure: 0, vulnerability: 0, risk: 0 };
    let processed = 0;

    // Process in chunks so the 4 component samples per cell run concurrently
    const CHUNK = 200;
    for (let start = 0; start < features.length; start += CHUNK) {
      const chunk = features.slice(start, start + CHUNK);
      await Promise.all(chunk.map(async (f) => {
        const [lng, lat] = f.properties.centroid;
        const m = f.properties.metrics;
        for (const c of COMPONENTS) {
          const v = await sample(h, c, lat, lng);
          m[`${h.key}_${c}`] = v;
          if (v !== null) counts[c]++;
        }
        // Back-compat score = composite risk, with null→0: the catalog maps no fluvial
        // hazard on high ground (HAND ~16m), so absence = ~0 flood risk, not missing data.
        // (The map's risk card renders S3 tiles directly, so it still shows only the real
        // ~14% footprint; this coalesced score feeds zones/hotspots/spatial-queries/agent.)
        m[`${h.key}_score`] = m[`${h.key}_risk`] ?? 0;
      }));
      processed += chunk.length;
      if (processed % 2000 < CHUNK) process.stdout.write(`  ${processed}/${features.length}\r`);
    }

    const pct = (n: number) => `${((n / features.length) * 100).toFixed(0)}%`;
    console.log(`  done — coverage: hazard ${pct(counts.hazard)}, exposure ${pct(counts.exposure)}, ` +
      `vulnerability ${pct(counts.vulnerability)}, risk ${pct(counts.risk)}`);

    // Distribution sanity check on the composite risk
    const risks = features.map(f => f.properties.metrics[`${h.key}_risk`]).filter((v): v is number => v != null).sort((a, b) => a - b);
    if (risks.length) {
      const q = (p: number) => risks[Math.floor(p * risks.length)];
      console.log(`  ${h.key}_risk distribution: min ${risks[0]}  p25 ${q(.25)}  p50 ${q(.5)}  p75 ${q(.75)}  p95 ${q(.95)}  max ${risks[risks.length - 1]}`);
    }
  }

  // Record provenance
  grid.dataSources = {
    ...grid.dataSources,
    risk: `Catalog poa_<hazard>_risk H×E×V composites (sampled at z=${Z}) — ${HAZARDS.map(h => h.key).join(', ')}`,
  };

  fs.writeFileSync(gridPath, JSON.stringify(grid));
  console.log(`\n✓ Wrote ${path.relative(process.cwd(), gridPath)}`);
  console.log('  Next: re-run generate-neighborhood-zones.ts and generate-risk-tiles.ts');
}

main().catch((e) => { console.error(e); process.exit(1); });

/**
 * THE PUBLICATION MAPS — render from the live pins and upload.
 *
 * The three print maps (flood, heat, landslide; official data only) are drawn
 * by matplotlib (scripts/publication-maps/render.py), which the Node-only
 * deployment cannot run. So they are drawn here, from the pins the platform
 * holds right now, and uploaded with those pins; the coordinator's
 * "Dados da publicação (ZIP)" then says when a pin has moved since.
 *
 *   COUGAR_URL=https://… COUGAR_COORD_EMAIL=… COUGAR_COORD_PASSWORD=… \
 *     npx tsx scripts/publication-maps.ts <coordinatorSlug> [--dry-run] [--out <dir>]
 *
 * Needs python3 with numpy, matplotlib, shapely and pillow (PYTHON=… to pick
 * one). Fonts (Inter 4.0) and the OSM water relations are fetched once into
 * ~/.cache/cougar-publication-maps.
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import JSZip from 'jszip';

const args = process.argv.slice(2);
const slug = args.find(a => !a.startsWith('--'));
const dryRun = args.includes('--dry-run');
const outIdx = args.indexOf('--out');
const outDir = outIdx >= 0 ? args[outIdx + 1] : null;
const BASE = (process.env.COUGAR_URL ?? 'http://localhost:5050').replace(/\/$/, '');
if (!slug) { console.error('usage: npx tsx scripts/publication-maps.ts <coordinatorSlug> [--dry-run] [--out <dir>]'); process.exit(1); }

const ROOT = process.cwd();
const CACHE = path.join(os.homedir(), '.cache', 'cougar-publication-maps');
const WORK = path.join(CACHE, `work-${Date.now()}`);
mkdirSync(path.join(WORK, 'fonts'), { recursive: true });
mkdirSync(path.join(WORK, 'osm'), { recursive: true });

async function login(): Promise<string> {
  const email = process.env.COUGAR_COORD_EMAIL, password = process.env.COUGAR_COORD_PASSWORD;
  if (!email || !password) throw new Error('COUGAR_COORD_EMAIL and COUGAR_COORD_PASSWORD are required');
  const r = await fetch(`${BASE}/api/coordinator/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, password }) });
  if (!r.ok) throw new Error(`login failed: ${r.status}`);
  const cookie = (r.headers.getSetCookie?.() ?? [r.headers.get('set-cookie') ?? '']).map(c => c.split(';')[0]).filter(Boolean).join('; ');
  if (!cookie) throw new Error('login returned no session cookie');
  return cookie;
}

async function ensureFonts() {
  const want = ['Inter-Regular', 'Inter-Medium', 'Inter-SemiBold'];
  const cached = path.join(CACHE, 'fonts');
  mkdirSync(cached, { recursive: true });
  if (!want.every(f => existsSync(path.join(cached, `${f}.ttf`)))) {
    console.log('fetching Inter 4.0…');
    const r = await fetch('https://github.com/rsms/inter/releases/download/v4.0/Inter-4.0.zip');
    if (!r.ok) throw new Error(`Inter download failed: ${r.status}`);
    const z = await JSZip.loadAsync(Buffer.from(await r.arrayBuffer()));
    for (const f of want) {
      const e = z.file(`extras/ttf/${f}.ttf`);
      if (!e) throw new Error(`${f}.ttf missing from the Inter release`);
      writeFileSync(path.join(cached, `${f}.ttf`), await e.async('nodebuffer'));
    }
  }
  for (const f of want) writeFileSync(path.join(WORK, 'fonts', `${f}.ttf`), readFileSync(path.join(cached, `${f}.ttf`)));
}

async function ensureWater() {
  const cached = path.join(CACHE, 'water_rel.json');
  if (!existsSync(cached)) {
    console.log('fetching OSM water relations…');
    const b = JSON.parse(readFileSync(path.join(ROOT, 'client/public/sample-data/porto-alegre-boundary.json'), 'utf8')).bbox as number[];
    const bbox = `${b[1] - 0.05},${b[0] - 0.05},${b[3] + 0.05},${b[2] + 0.05}`;
    const q = `[out:json][timeout:180];relation["natural"="water"](${bbox});out geom;`;
    // Overpass answers 406 without a descriptive User-Agent.
    const r = await fetch('https://overpass-api.de/api/interpreter', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded', 'user-agent': 'cougar-publication-maps/1.0', accept: 'application/json' }, body: `data=${encodeURIComponent(q)}` });
    if (!r.ok) throw new Error(`Overpass failed: ${r.status}`);
    writeFileSync(cached, Buffer.from(await r.arrayBuffer()));
  }
  writeFileSync(path.join(WORK, 'osm', 'water_rel.json'), readFileSync(cached));
}

(async () => {
  const cookie = await login();
  const pr = await fetch(`${BASE}/api/cohort/${slug}/publication/pins`, { headers: { cookie } });
  if (!pr.ok) throw new Error(`pins: ${pr.status}`);
  const { pins } = await pr.json() as { pins: Array<{ memberId: string; org: string; bairro: string; lat: number | null; lng: number | null; approx: boolean }> };
  console.log(`${pins.length} organisations`);
  writeFileSync(path.join(WORK, 'org_points.json'), JSON.stringify(pins.map(p => ({ org: p.org, slug: p.memberId, bairro: p.bairro, lat: p.lat, lng: p.lng, approx: p.approx })), null, 1));
  await ensureFonts();
  await ensureWater();

  const py = process.env.PYTHON ?? 'python3';
  console.log('rendering…');
  execFileSync(py, [path.join(ROOT, 'scripts/publication-maps/render.py'), WORK, path.join(ROOT, 'client/public/sample-data'), path.join(ROOT, 'client/public/arvc-official')], { stdio: 'inherit' });

  const mapsDir = path.join(WORK, 'maps');
  const numbers = JSON.parse(readFileSync(path.join(mapsDir, 'numbers.json'), 'utf8')) as Array<{ org: string; n: number }>;
  const nOf = new Map(numbers.map(x => [x.org, x.n]));
  const renderedAt = new Date().toISOString();
  const zip = new JSZip();
  for (const f of readdirSync(mapsDir)) if (/\.(png|pdf)$/.test(f)) zip.file(f, readFileSync(path.join(mapsDir, f)));
  zip.file('manifest.json', JSON.stringify({ renderedAt, pins: pins.map(p => ({ ...p, n: nOf.get(p.org) })) }, null, 1));
  const body = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
  if (outDir) { mkdirSync(outDir, { recursive: true }); for (const f of readdirSync(mapsDir)) writeFileSync(path.join(outDir, f), readFileSync(path.join(mapsDir, f))); console.log(`maps copied to ${outDir}`); }
  if (dryRun) { console.log(`dry run: ${(body.length / 1e6).toFixed(1)} MB not uploaded (work dir ${WORK})`); return; }
  const up = await fetch(`${BASE}/api/cohort/${slug}/publication/maps`, { method: 'POST', headers: { cookie, 'content-type': 'application/zip' }, body });
  const res = await up.json().catch(() => ({}));
  if (!up.ok) throw new Error(`upload failed: ${up.status} ${JSON.stringify(res)}`);
  console.log(`uploaded: ${res.files} files, drawn ${renderedAt}`);
})().catch(err => { console.error(err.message ?? err); process.exit(1); });

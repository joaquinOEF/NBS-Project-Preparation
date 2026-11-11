/**
 * Build Porto Alegre's address index from IBGE's CNEFE (Censo 2022).
 *
 *   npm run cnefe:build                 # downloads Porto Alegre's file from IBGE
 *   npm run cnefe:build -- path/to.csv  # or reads an already-unzipped CSV
 *
 * Source: IBGE, Cadastro Nacional de Endereços para Fins Estatísticos, Censo
 * Demográfico 2022 — the per-municipality CSV (4314902 = Porto Alegre):
 *   https://ftp.ibge.gov.br/Cadastro_Nacional_de_Enderecos_para_Fins_Estatisticos/Censo_Demografico_2022/Arquivos_CNEFE/CSV/Municipio/43_RS/4314902_PORTO_ALEGRE.zip
 * Only that municipality is downloaded. Read at runtime by
 * server/services/cnefeAddress.ts (the first geocoder for street + number).
 *
 * Writes knowledge/porto-alegre/cnefe-2022/:
 *   addresses.json.gz  one row per street: type, title, name, and per address
 *                      number + bairro + lat/lng (1e-5°, delta-coded). Apartments
 *                      at one number collapse to one point (their mean).
 *   manifest.json      source, counts, checks, the date
 *
 * Kept: NV_GEO_COORD 1–3 (the address's own coordinate) and 4 (its block
 * face, only where a number has nothing better). Dropped: 5–6 (locality /
 * tract centroids — a pin there would be a guess), and "SN" (no number).
 *
 * ⚠️ Fails, writing nothing, unless the row count is in the range IBGE
 * published for the city and Ksa Rosa's door (Rua Voluntários da Pátria 1039,
 * Floresta — the address that motivated this) is present.
 */
import { spawn } from 'node:child_process';
import { createReadStream, mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { createInterface } from 'node:readline';
import { Readable } from 'node:stream';
import path from 'node:path';
import os from 'node:os';
import type { CnefeFile } from '../server/services/cnefeAddress';
import { CNEFE_SOURCE } from '../server/services/cnefeAddress';

const URL_ZIP =
  'https://ftp.ibge.gov.br/Cadastro_Nacional_de_Enderecos_para_Fins_Estatisticos/Censo_Demografico_2022/Arquivos_CNEFE/CSV/Municipio/43_RS/4314902_PORTO_ALEGRE.zip';
const CD_MUN = '4314902';
const OUT = path.join(process.cwd(), 'knowledge', 'porto-alegre', 'cnefe-2022');

async function lines(): Promise<AsyncIterable<string>> {
  const local = process.argv[2];
  if (local) return createInterface({ input: createReadStream(local, 'latin1'), crlfDelay: Infinity });
  const zip = path.join(os.tmpdir(), `cnefe-${CD_MUN}.zip`);
  if (!existsSync(zip)) {
    console.log(`Downloading ${URL_ZIP}`);
    const r = await fetch(URL_ZIP, { signal: AbortSignal.timeout(600_000) });
    if (!r.ok || !r.body) throw new Error(`IBGE download failed: HTTP ${r.status}`);
    writeFileSync(zip, Buffer.from(await r.arrayBuffer()));
  }
  // `unzip -p` streams the single CSV inside without writing it to disk.
  const child = spawn('unzip', ['-p', zip], { stdio: ['ignore', 'pipe', 'inherit'] });
  child.stdout.setEncoding('latin1');
  return createInterface({ input: child.stdout as Readable, crlfDelay: Infinity });
}

type Acc = { la: number; lo: number; c: number; lvl: number };

async function main() {
  // street key (type|title|name) → "bairro|number" → accumulated point
  const streets = new Map<string, Map<string, Acc>>();
  let header: string[] | null = null;
  let rows = 0, kept = 0, noNumber = 0, coarse = 0, otherMun = 0;

  for await (const line of await lines()) {
    if (!header) { header = line.split(';'); continue; }
    if (!line) continue;
    rows++;
    const f = line.split(';');
    const col = (name: string) => f[header!.indexOf(name)] ?? '';
    if (col('COD_MUNICIPIO') !== CD_MUN) { otherMun++; continue; }
    const num = Number(col('NUM_ENDERECO'));
    if (!Number.isFinite(num) || num <= 0) { noNumber++; continue; }
    const lvl = Number(col('NV_GEO_COORD'));
    if (!(lvl >= 1 && lvl <= 4)) { coarse++; continue; }
    const la = Number(col('LATITUDE')), lo = Number(col('LONGITUDE'));
    if (!Number.isFinite(la) || !Number.isFinite(lo)) { coarse++; continue; }
    const sk = [col('NOM_TIPO_SEGLOGR'), col('NOM_TITULO_SEGLOGR'), col('NOM_SEGLOGR')].map(s => s.trim()).join('|');
    const ak = `${col('DSC_LOCALIDADE').trim()}|${num}`;
    let m = streets.get(sk);
    if (!m) streets.set(sk, (m = new Map()));
    const a = m.get(ak);
    // A block-face point (4) only counts where the number has no own point.
    const rank = lvl === 4 ? 4 : 1;
    if (!a || rank < a.lvl) m.set(ak, { la, lo, c: 1, lvl: rank });
    else if (rank === a.lvl) { a.la += la; a.lo += lo; a.c++; }
    kept++;
  }

  const bairros: string[] = [];
  const bIdx = new Map<string, number>();
  const out: CnefeFile['streets'] = [];
  let addresses = 0;
  for (const [sk, m] of [...streets].sort(([a], [b]) => a.localeCompare(b))) {
    const [type, title, name] = sk.split('|').map(s => s.toLowerCase());
    const entries = [...m].map(([ak, a]) => {
      const [b, n] = ak.split('|');
      if (!bIdx.has(b)) { bIdx.set(b, bairros.length); bairros.push(b); }
      return { b: bIdx.get(b)!, n: Number(n), la: Math.round((a.la / a.c) * 1e5), lo: Math.round((a.lo / a.c) * 1e5) };
    }).sort((x, y) => x.b - y.b || x.n - y.n);
    let pa = 0, po = 0;
    const row: CnefeFile['streets'][number] = [type, title, name, [], [], [], []];
    for (const e of entries) {
      row[3].push(e.n); row[4].push(e.b); row[5].push(e.la - pa); row[6].push(e.lo - po);
      pa = e.la; po = e.lo;
    }
    addresses += entries.length;
    out.push(row);
  }

  // ── checks ──
  const fails: string[] = [];
  if (rows < 700_000 || rows > 850_000) fails.push(`row count ${rows} outside the expected ~762k for Porto Alegre`);
  if (otherMun) fails.push(`${otherMun} rows from another municipality`);
  const vp = streets.get('RUA|VOLUNTARIOS|DA PATRIA')?.get('FLORESTA|1039');
  if (!vp) fails.push('Rua Voluntários da Pátria 1039 (Floresta) is missing');
  else if (Math.abs(vp.la / vp.c + 30.0244) > 0.002) fails.push(`Voluntários da Pátria 1039 at ${vp.la / vp.c}, expected ~-30.0244`);
  if (fails.length) {
    console.error('✗ Not written:\n  ' + fails.join('\n  '));
    process.exit(1);
  }

  mkdirSync(OUT, { recursive: true });
  const file: CnefeFile = { source: CNEFE_SOURCE, municipality: CD_MUN, bairros: bairros.map(b => b.toLowerCase()), streets: out };
  const gz = gzipSync(JSON.stringify(file), { level: 9 });
  writeFileSync(path.join(OUT, 'addresses.json.gz'), gz);
  writeFileSync(path.join(OUT, 'manifest.json'), JSON.stringify({
    source: CNEFE_SOURCE,
    original: 'IBGE — Cadastro Nacional de Endereços para Fins Estatísticos, Censo Demográfico 2022',
    url: URL_ZIP,
    municipality: { code: CD_MUN, name: 'Porto Alegre' },
    builtAt: new Date().toISOString().slice(0, 10),
    rows, rowsKept: kept, droppedNoNumber: noNumber, droppedCoarseCoordinate: coarse,
    streets: out.length, addresses, bairros: bairros.length,
    precision: 'lat/lng rounded to 1e-5 degrees (~1 m); apartments at one number averaged',
    bytes: gz.length,
  }, null, 2) + '\n');
  console.log(`✓ ${rows} rows → ${out.length} streets, ${addresses} numbered addresses, ${bairros.length} bairros · ${(gz.length / 1e6).toFixed(2)} MB gz`);
}

main().catch(e => { console.error(e); process.exit(1); });

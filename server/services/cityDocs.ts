// ============================================================================
// SEARCHING THE CITY'S DOCUMENTS
// ============================================================================
// The plans, studies and project documents imported from the coordination's
// Drive folder (knowledge/porto-alegre/city/docs, scripts/import-city-folder.ts)
// are ~17 thousand page-tagged passages: the PLAC and its products, the 2025
// Plano Diretor, Regenera Dilúvio's EIA, the World Bank Centro+4D documents,
// the SGB risk mapping, the PMSB. Far too much for a prompt — the 3,000-page
// Plano Diretor report alone is three million tokens — so passes SEARCH it.
//
// BM25 over each passage plus its context line (`ctx`, one or two sentences
// written at import saying which document, action and place the passage is
// about — "contextual retrieval"). Without the line, a page that says "a
// medida prevê 15 reservatórios" is invisible to a search for the Dilúvio.
// Lexical on purpose: a modest, curated, Portuguese corpus, no second model
// provider, and every hit explainable by the words it matched.
// ============================================================================

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import path from 'node:path';

export interface CityPassage {
  /** "<docId>@p<page>#<n>" — stable across a re-import of the same text. */
  id: string;
  docId: string;
  title: string;
  owner: string;
  kind: 'plano' | 'projeto' | 'iniciativa';
  page: number;
  ctx?: string;
  text: string;
  source: string;
}

export interface CityHit extends CityPassage { score: number }

interface Index {
  passages: CityPassage[];
  /**
   * term → passage index and term frequency, interleaved [i, tf, i, tf, …].
   * Flat typed arrays, not [i, tf] pairs: a million two-element arrays were
   * ~170 MB of heap and, on the deployment's small machine, minutes of
   * garbage collection at boot (prod crash, 22 Oct 2026).
   */
  postings: Map<string, Uint32Array>;
  lengths: Float32Array;
  avgLen: number;
  version: string;
}

let index: Index | null = null;
const root = () => path.join(process.cwd(), 'knowledge', 'porto-alegre', 'city');

const STOP = new Set(('a o e de da do das dos em no na nos nas um uma uns umas para por com sem que se ao aos à às ou como mais ' +
  'é são foi ser ter tem pelo pela pelos pelas seu sua seus suas este esta estes estas esse essa isso isto entre sobre até também ' +
  'the of and to in for on with by is are').split(' '));

/** Lowercased, accent-folded, light plural stripping — "Arroios" finds "arroio". */
export function tokens(text: string): string[] {
  return text.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .split(/[^a-z0-9]+/)
    .filter(t => t.length > 1 && !STOP.has(t))
    .map(t => (t.length > 4 && t.endsWith('s') && !t.endsWith('ss') ? t.slice(0, -1) : t));
}

/**
 * Builds the index, pausing (`yield`) between files and every few hundred
 * passages. `load()` runs it straight through for a caller that needs it now;
 * the boot warm-up runs it a slice per event-loop turn, so the server keeps
 * answering requests and database pings while it builds.
 */
function* build(): Generator<void, Index> {
  const passages: CityPassage[] = [];
  const dir = path.join(root(), 'docs');
  const manifestPath = path.join(root(), 'manifest.json');
  const version = existsSync(manifestPath) ? String(JSON.parse(readFileSync(manifestPath, 'utf8')).version ?? '') : '';
  if (existsSync(dir)) {
    for (const f of readdirSync(dir).filter(x => x.endsWith('.json.gz')).sort()) {
      // A broken file costs its own passages, never the search.
      let doc: any;
      try { doc = JSON.parse(gunzipSync(readFileSync(path.join(dir, f))).toString('utf8')); }
      catch (err) { console.warn(`[city-docs] ${f} unreadable: ${(err as Error).message}`); continue; }
      const perPage = new Map<number, number>();
      for (const c of doc.chunks ?? []) {
        const n = (perPage.get(c.page) ?? 0) + 1;
        perPage.set(c.page, n);
        passages.push({ id: `${doc.id}@p${c.page}#${n}`, docId: doc.id, title: doc.title, owner: doc.owner, kind: doc.kind, page: c.page, ...(c.ctx ? { ctx: c.ctx } : {}), text: c.text, source: doc.source });
      }
      yield;
    }
  }
  const building = new Map<string, number[]>();
  const lengths = new Float32Array(passages.length);
  for (let i = 0; i < passages.length; i++) {
    if (i % 400 === 399) yield;
    const p = passages[i];
    const toks = tokens(`${p.title} ${p.ctx ?? ''} ${p.text}`);
    lengths[i] = toks.length;
    const tf = new Map<string, number>();
    for (const t of toks) tf.set(t, (tf.get(t) ?? 0) + 1);
    for (const [t, n] of Array.from(tf.entries())) {
      let list = building.get(t);
      if (!list) building.set(t, (list = []));
      list.push(i, n);
    }
  }
  const postings = new Map<string, Uint32Array>();
  let done = 0;
  for (const [t, list] of Array.from(building.entries())) {
    postings.set(t, Uint32Array.from(list));
    if (++done % 20000 === 0) yield;
  }
  const avgLen = passages.length ? lengths.reduce((a, b) => a + b, 0) / passages.length : 0;
  return { passages, postings, lengths, avgLen, version };
}

function load(): Index {
  if (index) return index;
  const it = build();
  let r = it.next();
  while (!r.done) r = it.next();
  return (index = r.value);
}

/**
 * The boot warm-up: the same build, one slice per event-loop turn. Building
 * in one go blocked the deployment's loop for over two minutes; Postgres
 * dropped the idle connections meanwhile and the server crashed (22 Oct 2026).
 */
export async function warmCityDocs(): Promise<number> {
  if (!index) {
    const it = build();
    let r = it.next();
    while (!r.done) {
      await new Promise<void>(res => setImmediate(res));
      if (index) break; // a request needed it first and built it whole
      r = it.next();
    }
    if (!index && r.done) index = r.value;
  }
  return index!.passages.length;
}

/** Test seam: forget the index (a re-import in the same process). */
export function resetCityDocs(): void { index = null; }

/**
 * The imported corpus's version, from the manifest alone — the board computes
 * it on every load and must not pay for building the index to learn it.
 */
export function cityDocsVersion(): string {
  if (index) return index.version;
  try { return String(JSON.parse(readFileSync(path.join(root(), 'manifest.json'), 'utf8')).version ?? ''); } catch { return ''; }
}
export function cityPassageCount(): number { return load().passages.length; }
export function cityPassage(id: string): CityPassage | undefined { return load().passages.find(p => p.id === id); }

/**
 * The best `k` passages for a query, at most `perDoc` from any one document so
 * a 3,000-page report cannot fill the list by repeating itself.
 */
export function searchCityDocs(query: string, opts: { k?: number; perDoc?: number } = {}): CityHit[] {
  const { k = 8, perDoc = 3 } = opts;
  const ix = load();
  const N = ix.passages.length;
  if (!N) return [];
  const k1 = 1.2, b = 0.75;
  const scores = new Map<number, number>();
  for (const t of Array.from(new Set(tokens(query)))) {
    const list = ix.postings.get(t);
    if (!list) continue;
    const df = list.length / 2;
    const idf = Math.log(1 + (N - df + 0.5) / (df + 0.5));
    for (let j = 0; j < list.length; j += 2) {
      const i = list[j], tf = list[j + 1];
      const s = idf * (tf * (k1 + 1)) / (tf + k1 * (1 - b + b * ix.lengths[i] / ix.avgLen));
      scores.set(i, (scores.get(i) ?? 0) + s);
    }
  }
  const ranked = Array.from(scores.entries()).sort((a, b2) => b2[1] - a[1]);
  const out: CityHit[] = [];
  const per = new Map<string, number>();
  for (const [i, score] of ranked) {
    const p = ix.passages[i];
    const n = per.get(p.docId) ?? 0;
    if (n >= perDoc) continue;
    per.set(p.docId, n + 1);
    out.push({ ...p, score: Math.round(score * 100) / 100 });
    if (out.length >= k) break;
  }
  return out;
}

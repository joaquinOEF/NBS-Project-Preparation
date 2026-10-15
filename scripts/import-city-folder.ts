/**
 * Import the coordination's Drive folder into the city context base.
 *
 *   npm run city:import                    # pull the Drive folder (needs the `gws` CLI, logged in)
 *   npm run city:import -- --from <dir>    # or read files already on disk
 *
 * The folder "COUGAR – planos e iniciativas POA" is where Ana, Vila Flores and
 * Robson drop what the city and its partners publish: plans as PDF, map layers
 * as GeoJSON, the "Iniciativas SbN em POA" sheet. Nothing reads Drive at run
 * time — this script turns the folder into files under
 * knowledge/porto-alegre/city/ and the sheet into plans/iniciativas.csv, and
 * the result is committed, so every run of every pass reads the same thing and
 * a PR shows what changed.
 *
 *   docs/<id>.json.gz    a plan's text in page-tagged chunks (pdftotext)
 *   layers/<id>.geojson.gz  a site layer from shared/city-layers.ts, simplified,
 *                           with only the properties the registry keeps
 *   plac-acoes.json      the PLAC's 30 actions and the initiatives the city
 *                        tracks under them (from SMAMUS's GIS tables)
 *   manifest.json        every file in the folder: what became of it and why
 *
 * Each chunk carries `ctx`: one or two sentences, written once here by a small
 * model, saying which document, part and place the passage is about. A page
 * that says "a medida prevê 15 reservatórios" is otherwise unfindable by
 * anyone searching for the Arroio Dilúvio (Anthropic, "Contextual Retrieval",
 * 2024). Cached by chunk text in .cache/, so a re-import only pays for new
 * pages. `--no-context` skips it.
 *
 * ⚠️ Every file in the folder appears in the manifest, processed or not, with
 * the reason (docs/context-first.md: declining is fine, forgetting is not).
 * Re-running with nothing new in the folder changes nothing.
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import path from 'node:path';
import * as turf from '@turf/turf';
import { CITY_LAYERS, layerFor } from '../shared/city-layers';
import { parseCsv } from '../server/services/planCorpus';

const FOLDER_ID = '17dLzOAf55PnbIy_EI8p3UqFIVk3rJpod';
const OUT = path.join(process.cwd(), 'knowledge', 'porto-alegre', 'city');
const CSV_OUT = path.join(process.cwd(), 'knowledge', 'porto-alegre', 'plans', 'iniciativas.csv');
const CACHE = path.join(process.cwd(), '.cache', 'city-folder');

/** A chunk is what a pass retrieves and quotes from: a page, or part of a long one. */
const CHUNK_MAX = 1800;
/** A page with less text than this is a scan, a map or a cover. */
const PAGE_MIN = 80;

interface FolderFile { id: string; name: string; path: string; mimeType: string; modifiedTime: string; local?: string }

interface DocEntry { id: string; title: string; owner: string; kind: 'plano' | 'projeto' | 'iniciativa'; folder: string; source: string; pages: number; textPages: number; chunks: number }
interface LayerEntry { id: string; title: string; owner: string; topic: string; mode: string; files: string[]; features: number; source: string }
interface SkipEntry { file: string; reason: string }

// ── Drive ──────────────────────────────────────────────────────────────────
function gws(args: string[]): any {
  const out = execFileSync('gws', args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  try { return out.trim() ? JSON.parse(out) : {}; } catch { return {}; }
}

function listFolder(id: string, prefix = ''): FolderFile[] {
  const res = gws(['drive', 'files', 'list', '--params', JSON.stringify({
    q: `'${id}' in parents and trashed=false`, pageSize: 1000,
    fields: 'files(id,name,mimeType,modifiedTime)', supportsAllDrives: true, includeItemsFromAllDrives: true,
  })]);
  const files: FolderFile[] = [];
  for (const f of res.files ?? []) {
    const p = prefix ? `${prefix}/${f.name}` : f.name;
    if (f.mimeType === 'application/vnd.google-apps.folder') files.push(...listFolder(f.id, p));
    else files.push({ ...f, path: p });
  }
  return files;
}

/** Download into the cache, keyed by id + modifiedTime, so a re-run only fetches what changed. */
function fetchFile(f: FolderFile): string {
  const ext = f.mimeType === 'application/vnd.google-apps.spreadsheet' ? '.csv' : path.extname(f.name);
  const local = path.join(CACHE, `${f.id}-${f.modifiedTime.replace(/\D/g, '')}${ext}`);
  if (existsSync(local)) return local;
  mkdirSync(CACHE, { recursive: true });
  // Written beside, then renamed: an interrupted download must not become a cached file.
  const part = `${local}.part`;
  if (f.mimeType === 'application/vnd.google-apps.spreadsheet') {
    gws(['drive', 'files', 'export', '--params', JSON.stringify({ fileId: f.id, mimeType: 'text/csv' }), '--output', part]);
  } else {
    gws(['drive', 'files', 'get', '--params', JSON.stringify({ fileId: f.id, alt: 'media', supportsAllDrives: true }), '--output', part]);
  }
  renameSync(part, local);
  return local;
}

function listLocal(dir: string, prefix = ''): FolderFile[] {
  const files: FolderFile[] = [];
  for (const name of readdirSync(dir).sort()) {
    const full = path.join(dir, name);
    const p = prefix ? `${prefix}/${name}` : name;
    if (statSync(full).isDirectory()) files.push(...listLocal(full, p));
    else files.push({ id: '', name, path: p, mimeType: '', modifiedTime: statSync(full).mtime.toISOString(), local: full });
  }
  return files;
}

// ── Documents ──────────────────────────────────────────────────────────────
/** Who owns a document, read off the folder it sits in. */
function docMeta(f: FolderFile): { owner: string; kind: DocEntry['kind'] } {
  const p = f.path;
  if (/PLAC|Plano de Ação Climática/i.test(p) && !/PLAC-RS/i.test(f.name)) return { owner: 'SMAMUS', kind: 'plano' };
  if (/Plano Diretor/i.test(p)) return { owner: /MPRS/i.test(f.name) ? 'Ministério Público do RS' : 'SMAMUS', kind: 'plano' };
  if (/Regenera Dilúvio/i.test(p)) return { owner: 'SMAMUS (Regenera Dilúvio)', kind: 'projeto' };
  if (/Banco Mundial/i.test(p)) return { owner: 'Prefeitura + Banco Mundial', kind: 'projeto' };
  if (/SGB/i.test(p)) return { owner: 'Serviço Geológico do Brasil / Defesa Civil', kind: 'plano' };
  if (/Saneamento|PMSB/i.test(p)) return { owner: 'Prefeitura (DMAE)', kind: 'plano' };
  if (/Resiliência e reconstrução/i.test(p)) return { owner: 'Prefeitura', kind: 'plano' };
  if (/Estado do RS/i.test(p)) return { owner: 'Governo do Estado do RS', kind: 'plano' };
  if (/Arborização/i.test(p)) return { owner: 'SMAMUS', kind: 'plano' };
  if (/Rede SCbN/i.test(f.name)) return { owner: 'Rede SCbN POA', kind: 'iniciativa' };
  if (/Sociedade civil/i.test(p)) return { owner: 'Sociedade civil', kind: 'iniciativa' };
  return { owner: 'a confirmar', kind: 'plano' };
}

const slug = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\.[a-z0-9]+$/, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 80);
const titleOf = (name: string) => name.replace(/\.[a-z0-9]+$/i, '').replace(/_/g, ' ').replace(/\s+/g, ' ').trim();

function chunkPages(pages: string[]): Array<{ page: number; text: string }> {
  const chunks: Array<{ page: number; text: string }> = [];
  pages.forEach((raw, i) => {
    // Lone surrogates (broken glyphs in some PDFs) make the request body invalid JSON.
    const text = raw.replace(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g, '').replace(/-\n(?=[a-zà-ÿ])/g, '').replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
    if (text.length < PAGE_MIN) return;
    if (text.length <= CHUNK_MAX) { chunks.push({ page: i + 1, text }); return; }
    let buf = '';
    for (const para of text.split(/\n\n+/)) {
      if (buf && buf.length + para.length > CHUNK_MAX) { chunks.push({ page: i + 1, text: buf }); buf = ''; }
      buf = buf ? `${buf}\n\n${para}` : para;
      while (buf.length > CHUNK_MAX * 1.5) { chunks.push({ page: i + 1, text: buf.slice(0, CHUNK_MAX) }); buf = buf.slice(CHUNK_MAX); }
    }
    if (buf) chunks.push({ page: i + 1, text: buf });
  });
  return chunks;
}

const usedIds = new Set<string>();

function importPdf(f: FolderFile, local: string): DocEntry | SkipEntry {
  let text: string;
  try { text = execFileSync('pdftotext', ['-q', '-enc', 'UTF-8', local, '-'], { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 }); }
  catch (err) { return { file: f.path, reason: `pdftotext falhou: ${(err as Error).message.slice(0, 120)}` }; }
  // Lone surrogates (broken glyphs in some PDFs) make a request body invalid JSON — the
  // neighbouring pages and the outline travel too, so the whole text is cleaned.
  text = text.replace(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g, '');
  const pages = text.split('\f');
  if (pages.at(-1)?.trim() === '') pages.pop();
  const chunks = chunkPages(pages);
  if (!chunks.length) return { file: f.path, reason: `nenhuma página com texto (${pages.length} páginas — PDF escaneado ou só imagens)` };
  const { owner, kind } = docMeta(f);
  let id = slug(f.name);
  for (let n = 2; usedIds.has(id); n++) id = `${slug(f.name)}-${n}`;
  usedIds.add(id);
  const entry: DocEntry = {
    id, title: titleOf(f.name), owner, kind, folder: path.dirname(f.path),
    source: f.id ? `https://drive.google.com/file/d/${f.id}` : f.path,
    pages: pages.length, textPages: new Set(chunks.map(c => c.page)).size, chunks: chunks.length,
  };
  pending.push({ entry, chunks, outline: pages.slice(0, 6).join('\n').replace(/\s+/g, ' ').slice(0, 5000), pages });
  return entry;
}

// ── Context lines (contextual retrieval) ───────────────────────────────────
type Chunk = { page: number; text: string; ctx?: string };
const pending: Array<{ entry: DocEntry; chunks: Chunk[]; outline: string; pages: string[] }> = [];
const CONTEXT_MODEL = process.env.CITY_CONTEXT_MODEL || 'claude-haiku-5-5';
const CONTEXT_CACHE = path.join(CACHE, '..', 'city-context.json');
const CONTEXT_PARALLEL = 8;

/** A slice can cut an emoji or a rare glyph in half; the lone half breaks the JSON body. */
const whole = (t: string) => t.replace(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g, '');

async function contextLine(doc: { entry: DocEntry; outline: string; pages: string[] }, c: Chunk): Promise<string> {
  const around = whole([c.page - 1, c.page + 1].map(n => doc.pages[n - 1] ?? '').join('\n').replace(/\s+/g, ' ').slice(0, 3000));
  const body = {
    model: CONTEXT_MODEL, max_tokens: 160,
    // A one-line label: thinking spends the token budget and adds nothing.
    thinking: { type: 'disabled' },
    // The document's opening pages are the same for every chunk of it: cached.
    system: [{ type: 'text', cache_control: { type: 'ephemeral' }, text:
      `Documento: "${doc.entry.title}" (${doc.entry.owner}). Início do documento:\n${whole(doc.outline)}` }],
    messages: [{ role: 'user', content:
      `Páginas vizinhas (contexto): ${around}\n\nTrecho (página ${c.page}):\n${whole(c.text)}\n\n` +
      'Em até 40 palavras, em português, situe este trecho para quem busca: de que parte, ação, programa, eixo ou capítulo do documento ele é, e que bairros, arroios, bacias ou lugares de Porto Alegre cita (se não cita nenhum, não diga nada sobre lugar). Só o que está no documento. Comece direto pelo conteúdo ("Ação 6 do eixo POA Baixo Carbono…"), sem "Este trecho".' }],
  };
  for (let attempt = 0; attempt < 4; attempt++) {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': process.env.ANTHROPIC_API_KEY!, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify(body),
    });
    if (res.ok) {
      const j: any = await res.json();
      const text = (j.content ?? []).filter((b: any) => b.type === 'text').map((b: any) => b.text).join(' ').replace(/\s+/g, ' ').trim();
      // A model that says it got no passage wrote a complaint, not a label.
      if (!text || /^(não (há|consigo|foi)|nenhum trecho)/i.test(text)) throw new Error(`rótulo vazio: ${text.slice(0, 80)}`);
      return text;
    }
    if (res.status !== 429 && res.status < 500) throw new Error(`${res.status} ${await res.text()}`);
    await new Promise(r => setTimeout(r, 2000 * (attempt + 1)));
  }
  throw new Error('context line: provider kept failing');
}

async function contextualize(): Promise<{ written: number; cached: number; failed: number }> {
  const cache: Record<string, string> = existsSync(CONTEXT_CACHE) ? JSON.parse(readFileSync(CONTEXT_CACHE, 'utf8')) : {};
  const key = (d: DocEntry, c: Chunk) => createHash('sha1').update(`${d.title}\n${c.page}\n${c.text}`).digest('hex');
  const todo: Array<() => Promise<void>> = [];
  let written = 0, cached = 0, failed = 0;
  for (const doc of pending) {
    for (const c of doc.chunks) {
      const k = key(doc.entry, c);
      if (cache[k]) { c.ctx = cache[k]; cached++; continue; }
      todo.push(async () => {
        try { c.ctx = await contextLine(doc, c); cache[k] = c.ctx; written++; }
        catch (err) { failed++; if (failed <= 3) console.warn(`[city] contexto falhou: ${(err as Error).message.slice(0, 160)}`); }
      });
    }
  }
  console.log(`[city] contexto: ${cached} do cache, ${todo.length} a escrever (${CONTEXT_MODEL})`);
  let next = 0, done = 0;
  await Promise.all(Array.from({ length: CONTEXT_PARALLEL }, async () => {
    while (next < todo.length) {
      await todo[next++]();
      if (++done % 250 === 0) { console.log(`[city] contexto ${done}/${todo.length}`); writeFileSync(CONTEXT_CACHE, JSON.stringify(cache)); }
    }
  }));
  writeFileSync(CONTEXT_CACHE, JSON.stringify(cache));
  return { written, cached, failed };
}

// ── PLAC actions (GIS tables, no geometry) ─────────────────────────────────
function placTables(files: Array<{ f: FolderFile; local: string }>): { actions: number; initiatives: number } | null {
  const read = (re: RegExp) => { const x = files.find(y => re.test(y.f.name)); return x ? JSON.parse(readFileSync(x.local, 'utf8')).features.map((ft: any) => ft.properties) : null; };
  const acoes = read(/Adapta_o_Clim_tica_A_es/i), inic = read(/Adapta_o_Clim_tica_Iniciativas/i);
  if (!acoes) return null;
  const rel = (v: unknown) => /^relacionada/i.test(String(v ?? ''));
  const hazards = (p: any) => [['inundacoes', 'inundação'], ['tempestades', 'tempestade'], ['deslizamento_erosao', 'deslizamento'], ['desliz_erosao', 'deslizamento'], ['ondas_calor', 'calor'], ['secas', 'seca'], ['vet_arbov', 'arboviroses'], ['vetores_arbov', 'arboviroses']]
    .filter(([k]) => rel(p[k])).map(([, l]) => l).filter((v, i, a) => a.indexOf(v) === i);
  const d = (t: unknown) => (t ? new Date(Number(t)).toISOString().slice(0, 10) : null);
  const out = {
    source: 'SMAMUS — servidor SIG, HUB/base_reconstrucao (Adaptação Climática: Ações e Iniciativas)',
    actions: acoes.map((p: any) => ({
      id: p.id_acoes, text: String(p.projeto_servico ?? '').trim(), hazards: hazards(p),
      initiatives: (inic ?? []).filter((q: any) => q.id_acoes === p.id_acoes).map((q: any) => ({
        name: String(q.iniciativas ?? '').trim(), contract: String(q.obj_contratacao ?? '').replace(/\s+/g, ' ').trim(),
        stage: q.status_etapas ?? null, value: q.val_contrato ?? null, start: d(q.dt_inicio), end: d(q.dt_conclusao),
      })),
    })).sort((a: any, b: any) => Number(a.id.slice(1)) - Number(b.id.slice(1))),
  };
  writeFileSync(path.join(OUT, 'plac-acoes.json'), JSON.stringify(out, null, 2) + '\n');
  return { actions: out.actions.length, initiatives: (inic ?? []).length };
}

// ── Layers ─────────────────────────────────────────────────────────────────
function round(coords: any): any {
  return typeof coords[0] === 'number' ? [Math.round(coords[0] * 1e6) / 1e6, Math.round(coords[1] * 1e6) / 1e6] : coords.map(round);
}

function importLayers(files: Array<{ f: FolderFile; local: string }>): LayerEntry[] {
  const entries: LayerEntry[] = [];
  for (const layer of CITY_LAYERS) {
    const mine = files.filter(x => layerFor(x.f.name)?.id === layer.id).sort((a, b) => a.f.path.localeCompare(b.f.path));
    if (!mine.length) continue;
    const features: any[] = [];
    for (const { local } of mine) {
      const gj = JSON.parse(readFileSync(local, 'utf8'));
      for (const ft of gj.features ?? []) {
        if (!ft.geometry) continue;
        const props: Record<string, unknown> = {};
        for (const k of layer.keep) if (ft.properties?.[k] != null && String(ft.properties[k]).trim() !== '') props[k] = ft.properties[k];
        let geometry = ft.geometry;
        if (layer.simplify && geometry.type !== 'Point') {
          try { geometry = turf.simplify({ type: 'Feature', properties: {}, geometry }, { tolerance: layer.simplify, highQuality: false }).geometry; } catch { /* keep the original */ }
        }
        features.push({ type: 'Feature', properties: props, geometry: { type: geometry.type, coordinates: round(geometry.coordinates) } });
      }
    }
    writeFileSync(path.join(OUT, 'layers', `${layer.id}.geojson.gz`), gzipSync(JSON.stringify({ type: 'FeatureCollection', features }), { level: 9 }));
    entries.push({
      id: layer.id, title: layer.title, owner: layer.owner, topic: layer.topic, mode: layer.mode,
      files: mine.map(x => x.f.path), features: features.length,
      source: mine[0].f.id ? `https://drive.google.com/file/d/${mine[0].f.id}` : mine[0].f.path,
    });
  }
  return entries;
}

// ── Main ───────────────────────────────────────────────────────────────────
async function main() {
  const fromIdx = process.argv.indexOf('--from');
  const files = (fromIdx > 0 ? listLocal(path.resolve(process.argv[fromIdx + 1])) : listFolder(FOLDER_ID))
    .sort((a, b) => a.path.localeCompare(b.path));
  console.log(`[city] ${files.length} arquivos na pasta`);

  rmSync(path.join(OUT, 'docs'), { recursive: true, force: true });
  rmSync(path.join(OUT, 'layers'), { recursive: true, force: true });
  mkdirSync(path.join(OUT, 'docs'), { recursive: true });
  mkdirSync(path.join(OUT, 'layers'), { recursive: true });

  const docs: DocEntry[] = [];
  const skipped: SkipEntry[] = [];
  const layerFiles: Array<{ f: FolderFile; local: string }> = [];
  const tableFiles: Array<{ f: FolderFile; local: string }> = [];
  const seenDocs = new Map<string, string>();
  let sheet = false;

  for (const f of files) {
    const lower = f.name.toLowerCase();
    if (f.mimeType === 'application/vnd.google-apps.document') { skipped.push({ file: f.path, reason: 'documento da coordenação (LEIA-ME / FONTES), não é fonte' }); continue; }
    if (f.mimeType === 'application/vnd.google-apps.spreadsheet' || /iniciativas.*\.csv$/i.test(f.name)) {
      const local = f.local ?? fetchFile(f);
      // ⚠️ The repository is public. The "contato" column stays in the Google
      // Sheet, where the coordination uses it; it is emptied here, before
      // anything is written that a commit could carry. (planCorpus.ts never
      // sends it to a model either.)
      const [header, ...rows] = parseCsv(readFileSync(local, 'utf8'));
      const norm = (h: string) => h.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
      const iContato = (header ?? []).findIndex(h => /^contato|^contact|e-?mail|telefone|whats/.test(norm(h)));
      const cell = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
      const out = [header ?? [], ...rows.map(r => r.map((v, j) => (j === iContato ? '' : v)))]
        .map(r => r.map(v => cell(v ?? '')).join(',')).join('\n') + '\n';
      writeFileSync(CSV_OUT, out);
      sheet = true;
      console.log(`[city] planilha → ${path.relative(process.cwd(), CSV_OUT)}`);
      continue;
    }
    if (lower.endsWith('.pdf')) {
      // The same PDF can sit in two folders (the PLAC report was both uploaded and copied).
      const key = `${f.name.replace(/^.*–\s*/, '')}`;
      const local = f.local ?? fetchFile(f);
      const hash = createHash('sha1').update(readFileSync(local)).digest('hex');
      if (seenDocs.has(hash)) { skipped.push({ file: f.path, reason: `cópia de ${seenDocs.get(hash)}` }); continue; }
      seenDocs.set(hash, f.path);
      const r = importPdf(f, local);
      if ('reason' in r) skipped.push(r); else { docs.push(r); console.log(`[city] ${r.chunks} trechos · ${r.textPages}/${r.pages} págs · ${key}`); }
      continue;
    }
    if (/\.(geo)?json$/i.test(f.name)) {
      if (/Adapta_o_Clim_tica_(A_es|Iniciativas)/i.test(f.name)) { tableFiles.push({ f, local: f.local ?? fetchFile(f) }); continue; }
      if (layerFor(f.name)) { layerFiles.push({ f, local: f.local ?? fetchFile(f) }); continue; }
      skipped.push({ file: f.path, reason: 'camada sem pergunta por lugar (fica no Drive; ver shared/city-layers.ts)' });
      continue;
    }
    const reason =
      /ARVC.*\.zip$/i.test(f.name) ? 'rasters ARVC já integrados ao mapa (knowledge/official-risk)'
      : /\.zip$/i.test(f.name) ? 'shapefile compactado: as mesmas camadas vieram do servidor da SMAMUS em GeoJSON'
      : /\.gpkg$/i.test(f.name) ? 'GeoPackage (banco IPH-UFRGS): leitura ainda não implementada'
      : /\.kmz$/i.test(f.name) ? 'mapa da Rede: as organizações já estão na plataforma'
      : /\.xlsx$/i.test(f.name) ? 'tabela estadual/municipal sem pergunta por lugar'
      : `formato não lido (${path.extname(f.name) || 'sem extensão'})`;
    skipped.push({ file: f.path, reason });
  }

  const ctx = process.argv.includes('--no-context') || !process.env.ANTHROPIC_API_KEY
    ? null : await contextualize();
  if (!ctx) console.log('[city] contexto pulado (--no-context ou sem ANTHROPIC_API_KEY)');
  // The model sometimes adds "Não cita bairros…" despite being told not to —
  // a sentence that would make every page match a search for "bairro".
  const clean = (t: string) => t.split(/(?<=[.!?])\s+/).filter(x => !/^(não|nao) (cita|menciona)|sem (citar|mencionar|outros)|^não há (bairro|menção)/i.test(x.trim())).join(' ').trim();
  for (const { chunks } of pending) for (const c of chunks) if (c.ctx) c.ctx = clean(c.ctx) || undefined;
  for (const { entry, chunks } of pending) {
    writeFileSync(path.join(OUT, 'docs', `${entry.id}.json.gz`), gzipSync(JSON.stringify({ ...entry, chunks }), { level: 9 }));
  }
  const plac = placTables(tableFiles);
  if (plac) console.log(`[city] PLAC: ${plac.actions} ações, ${plac.initiatives} iniciativas → plac-acoes.json`);

  const layers = importLayers(layerFiles);
  for (const l of layers) console.log(`[city] camada ${l.id}: ${l.features} feições`);

  const version = createHash('sha1')
    .update(JSON.stringify({ docs: docs.map(d => [d.id, d.chunks]), layers: layers.map(l => [l.id, l.features]) }))
    .digest('hex').slice(0, 12);
  const manifest = {
    folder: `https://drive.google.com/drive/folders/${FOLDER_ID}`,
    version,
    note: 'Gerado por scripts/import-city-folder.ts. Não editar à mão: rodar `npm run city:import` de novo.',
    docs: docs.sort((a, b) => a.id.localeCompare(b.id)),
    layers,
    sheet: sheet ? 'knowledge/porto-alegre/plans/iniciativas.csv' : null,
    placActions: plac ? 'knowledge/porto-alegre/city/plac-acoes.json' : null,
    contextModel: ctx ? CONTEXT_MODEL : null,
    contextMissing: ctx?.failed ?? null,
    skipped: skipped.sort((a, b) => a.file.localeCompare(b.file)),
  };
  writeFileSync(path.join(OUT, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
  console.log(`\n[city] ${docs.length} documentos · ${layers.length} camadas · ${skipped.length} não lidos (motivo no manifest) · versão ${version}`);
}

main().catch(err => { console.error(err); process.exit(1); });

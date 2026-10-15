// The documents the plan cross-reading reads: every .md in
// knowledge/porto-alegre/plans/ (with title/owner/kind/source front matter),
// every row of iniciativas.csv there, and the city desk research already in
// knowledge/porto-alegre/ (existing plans, local precedents). See the README
// in that folder for how to add more.

import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { cityDocsVersion } from './cityDocs';

export interface PlanDoc {
  id: string;
  title: string;
  owner?: string;
  kind: 'plano' | 'projeto' | 'iniciativa' | 'empresa';
  source?: string;
  text: string;
}

const ROOT = () => path.join(process.cwd(), 'knowledge', 'porto-alegre');
const DESK = ['existing-plans.md', 'local-precedents.md'];
const KINDS = new Set(['plano', 'projeto', 'iniciativa', 'empresa']);

function frontMatter(raw: string): { meta: Record<string, string>; body: string } {
  const m = /^---\n([\s\S]*?)\n---\n?/.exec(raw);
  if (!m) return { meta: {}, body: raw };
  const meta: Record<string, string> = {};
  for (const line of m[1].split('\n')) {
    const kv = /^(\w+):\s*"?(.*?)"?\s*(#.*)?$/.exec(line.trim());
    if (kv) meta[kv[1]] = kv[2];
  }
  return { meta, body: raw.slice(m[0].length) };
}

/**
 * RFC-4180-ish: quoted fields, separators and line breaks inside quotes. The
 * separator is read off the header — a Brazilian Excel exports with ";".
 */
export function parseCsv(text: string): string[][] {
  const head = text.split('\n')[0] ?? '';
  const sep = (head.match(/;/g)?.length ?? 0) > (head.match(/,/g)?.length ?? 0) ? ';' : ',';
  const rows: string[][] = [];
  let row: string[] = [], cell = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (c === '"') q = false;
      else cell += c;
    } else if (c === '"') q = true;
    else if (c === sep) { row.push(cell); cell = ''; }
    else if (c === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; }
    else if (c !== '\r') cell += c;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows.filter(r => r.some(x => x.trim()));
}

const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();

export function loadPlanCorpus(root = ROOT()): PlanDoc[] {
  const docs: PlanDoc[] = [];
  for (const f of DESK) {
    const p = path.join(root, f);
    if (!existsSync(p)) continue;
    const { body } = frontMatter(readFileSync(p, 'utf8'));
    const title = /^#\s+(.+)$/m.exec(body)?.[1]?.trim() ?? f;
    docs.push({ id: `desk:${f}`, title, kind: f.startsWith('existing') ? 'plano' : 'projeto', source: `knowledge/porto-alegre/${f} (pesquisa de mesa)`, text: body });
  }
  // The PLAC's 30 actions and the initiatives the city tracks under each, with
  // stage and contract — imported from SMAMUS's GIS tables (city:import). Short
  // and structured, so it travels whole: the action numbers are what a link
  // to the climate plan should name.
  const plac = path.join(root, 'city', 'plac-acoes.json');
  if (existsSync(plac)) {
    const t = JSON.parse(readFileSync(plac, 'utf8'));
    const brl = (v: unknown) => (Number(v) > 0 ? `R$ ${Math.round(Number(v)).toLocaleString('pt-BR')}` : '');
    const text = (t.actions ?? []).map((a: any) => [
      `${a.id} — ${a.text}${a.hazards?.length ? ` (riscos: ${a.hazards.join(', ')})` : ''}`,
      ...(a.initiatives ?? []).map((i: any) => `  · ${i.name}: ${i.contract}${i.stage ? ` [etapa: ${i.stage}]` : ''}${brl(i.value) ? ` [contrato ${brl(i.value)}]` : ''}${i.start ? ` [${i.start} a ${i.end ?? '?'}]` : ''}`),
    ].join('\n')).join('\n');
    docs.push({ id: 'city:plac-acoes', title: 'PLAC — as 30 ações e as iniciativas que a Prefeitura acompanha', owner: 'SMAMUS', kind: 'plano', source: t.source, text });
  }
  const dir = path.join(root, 'plans');
  if (!existsSync(dir)) return docs;
  for (const f of readdirSync(dir).sort()) {
    const p = path.join(dir, f);
    if (f.toLowerCase() === 'readme.md') continue;
    if (f.endsWith('.md')) {
      const { meta, body } = frontMatter(readFileSync(p, 'utf8'));
      docs.push({
        id: `plan:${f}`,
        title: meta.title || /^#\s+(.+)$/m.exec(body)?.[1]?.trim() || f,
        ...(meta.owner ? { owner: meta.owner } : {}),
        kind: (KINDS.has(meta.kind) ? meta.kind : 'plano') as PlanDoc['kind'],
        ...(meta.source ? { source: meta.source } : {}),
        text: body,
      });
    } else if (f.endsWith('.csv')) {
      const [header, ...rows] = parseCsv(readFileSync(p, 'utf8'));
      if (!header) continue;
      const col = (name: string) => header.findIndex(h => norm(h).startsWith(norm(name)));
      const iName = col('nome'), iTipo = col('tipo'), iContato = col('contato');
      rows.forEach((r, i) => {
        // Contacts never leave this file: they are for the coordination, not a model.
        const text = header.map((h, j) => (j === iContato || !r[j]?.trim() ? '' : `${h.trim()}: ${r[j].trim()}`)).filter(Boolean).join('\n');
        const tipo = norm(r[iTipo] ?? '');
        docs.push({
          id: `csv:${f}:${i + 1}`,
          title: (r[iName] ?? '').trim() || `${f} linha ${i + 2}`,
          kind: tipo.includes('empresa') ? 'empresa' : tipo.includes('plano') ? 'plano' : tipo.includes('projeto') ? 'projeto' : 'iniciativa',
          source: `${f}, linha ${i + 2}`,
          text,
        });
      });
    }
  }
  return docs;
}

/** Changes whenever any document changes — the readings keyed on it are redone. */
export function corpusVersion(docs: PlanDoc[]): string {
  const h = createHash('sha1');
  for (const d of docs) h.update(d.id).update('\0').update(d.text).update('\0');
  // The searchable city documents count too: a new import redoes the readings.
  h.update(`city:${cityDocsVersion()}`);
  return h.digest('hex').slice(0, 12);
}

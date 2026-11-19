// The coordination's own files, kept per network — the second input of the
// synergy report (docs/synergy-outside-documents.md).
//
// Storage reuses what an organisation's upload already has: a `documents` row
// with the full extracted text, the original in object storage. The row is
// filed under a scope no organisation can have (`rede:<cohortId>`), marked
// `purpose: 'rede'`, `source: 'coordinator'`. What the platform read out of a
// spreadsheet — the proposal, then the confirmed table — lives in
// `cohort.settings.networkFiles[docId]`, so this needs no table of its own and
// no `db:push`.

import type { Grid } from '@shared/network-solutions';

/** The documents scope of a network's own files. Never a real organisation id. */
export const networkScope = (cohortId: string) => `rede:${cohortId}`;

const MAX_ROWS = 500, MAX_COLS = 30;

function cellText(v: any): string {
  if (v == null) return '';
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === 'object') {
    if (Array.isArray(v.richText)) return v.richText.map((t: any) => t.text).join('');
    if ('text' in v) return cellText(v.text);
    if ('result' in v) return cellText(v.result);
    return '';
  }
  return String(v);
}

/** One CSV/TSV line, quotes honoured. */
function splitDelimited(text: string, sep: string): string[][] {
  const rows: string[][] = []; let row: string[] = []; let cur = ''; let q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += c; continue; }
    if (c === '"') q = true;
    else if (c === sep) { row.push(cur); cur = ''; }
    else if (c === '\n') { row.push(cur); rows.push(row); row = []; cur = ''; }
    else if (c !== '\r') cur += c;
  }
  if (cur || row.length) { row.push(cur); rows.push(row); }
  return rows;
}

/**
 * The file as grids of cells, when it has any — a spreadsheet's tabs, or a
 * CSV. Anything else returns [] and is context for the narrative only: a table
 * inside a PDF or a photograph is never counted from.
 */
export async function gridsOf(buf: Buffer, filename: string, mime: string | undefined): Promise<Grid[]> {
  const ext = (filename.split('.').pop() ?? '').toLowerCase();
  if (ext === 'xlsx' || (mime ?? '').includes('spreadsheetml')) {
    // The namespace under ESM, the module itself under CJS — both carry Workbook somewhere.
    const mod: any = await import('exceljs');
    const ExcelJS = mod.Workbook ? mod : mod.default;
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buf);
    const grids: Grid[] = [];
    wb.eachSheet((sheet: any) => {
      const rows: string[][] = [];
      const cols = Math.min(sheet.columnCount || MAX_COLS, MAX_COLS);
      sheet.eachRow({ includeEmpty: false }, (row: any) => {
        if (rows.length >= MAX_ROWS) return;
        const cells: string[] = [];
        for (let c = 1; c <= cols; c++) cells.push(cellText(row.getCell(c).value));
        rows.push(cells);
      });
      grids.push({ name: String(sheet.name ?? ''), rows });
    });
    return grids;
  }
  if (ext === 'csv' || ext === 'tsv') {
    const text = buf.toString('utf8').replace(/^﻿/, '');
    const sep = ext === 'tsv' ? '\t' : ((text.split('\n')[0] ?? '').split(';').length > (text.split('\n')[0] ?? '').split(',').length ? ';' : ',');
    return [{ name: filename, rows: splitDelimited(text, sep).slice(0, MAX_ROWS).map(r => r.slice(0, MAX_COLS)) }];
  }
  return [];
}

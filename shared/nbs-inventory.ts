// ============================================================================
// ABSORBING THE 27-SOLUTION CHECKLIST WHEN AN ORG SENDS IT
// ============================================================================
//
// W2, SDV Reciclando. Asked the free-text NbS-experience question, Paula pasted
// roughly four thousand characters. It was not an answer — it was a different
// instrument entirely:
//
//   Nome da Solução Baseada na Natureza | Tem no território? |
//   Se tem, onde foi realizada? | Em que ano? | Se não, tem planos de ter?
//   …
//   Hortas urbanas   Sim   Na SDV Reciclando, através da Horta Sustentável
//                          Comunitária.   2025   Pretendemos ampliar.
//
// A 27-row grid, filled in, running through our own catalog — the richest
// structured data anyone in the cohort produced. It reached us as one blob in
// one free-text field, and nothing could read it.
//
// This is NOT a new workshop step and asks the org for nothing. If they send
// it — pasted, or inside a document — we recognise it and keep it as rows, so
// it can inform the conversation instead of sitting in a paragraph.
//
// Deliberately conservative: a handful of solution names in ordinary chat is
// not an inventory, so a minimum number of ANSWERED rows is required before
// any of this triggers.

import { NBS_SOLUTIONS } from './nbs-catalog';

export type NbsPresence = 'yes' | 'no' | 'partial';

export interface NbsInventoryRow {
  solutionId: string;
  /** The catalog's pt label, so a stored row is readable without a lookup. */
  label: string;
  present: NbsPresence;
  /** Where it was done, if they said. */
  where?: string;
  /** Year, if they said. */
  year?: string;
  /** What they plan, if they said. */
  plans?: string;
}

/** Below this, it is a conversation that mentions solutions, not an inventory. */
export const MIN_ROWS_FOR_INVENTORY = 3;

function normalize(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

// Longest label first, so "parques lineares" cannot be swallowed by "parques".
const LABELS: Array<{ id: string; label: string; norm: string }> = NBS_SOLUTIONS
  .map(s => ({ id: s.id, label: s.pt.label, norm: normalize(s.pt.label) }))
  .sort((a, b) => b.norm.length - a.norm.length);

// The checklist's wording is close to ours but not identical — it carries the
// longer card-deck names. Mapped explicitly rather than by fuzzy matching,
// because a wrong solution is worse than an unmatched one.
const ALIASES: Record<string, string> = {
  'sistema alimentar local, circular e agroecologico': 'sistema-alimentar-local',
  'sistema alimentar local circular e agroecologico': 'sistema-alimentar-local',
  'restauracao de areas umidas, margens de rios e areas costeiras': 'restauracao-areas-umidas',
  'restauracao de areas umidas margens de rios e areas costeiras': 'restauracao-areas-umidas',
  'cozinha comunitaria com biodigestor': 'cozinha-comunitaria-biodigestor',
  'captacao de agua da chuva': 'captacao-agua-da-chuva',
  'jardim de chuva': 'jardins-de-chuva',
  'horta urbana': 'hortas-urbanas',
  'biovaleta': 'biovaletas',
};

// Name → id, from the catalog labels plus the checklist's longer card-deck
// wordings. Whole-cell lookup: the solution name is its own column in the grid,
// so there is no need to guess where it ends — which is what made a prefix
// match fragile ("biovaleta" swallowing "biovaletas" and leaving a stray "s"
// where the presence answer should be).
const BY_NAME = new Map<string, { id: string; label: string }>();
for (const s of NBS_SOLUTIONS) BY_NAME.set(normalize(s.pt.label), { id: s.id, label: s.pt.label });
for (const s of NBS_SOLUTIONS) BY_NAME.set(normalize(s.en.label), { id: s.id, label: s.pt.label });
for (const [alias, id] of Object.entries(ALIASES)) {
  const sol = NBS_SOLUTIONS.find(s => s.id === id);
  if (sol) BY_NAME.set(normalize(alias), { id, label: sol.pt.label });
}

function readPresence(cell: string): NbsPresence | null {
  const n = normalize(cell);
  if (!n) return null;
  if (n.startsWith('parcial')) return 'partial';
  if (n.startsWith('sim')) return 'yes';
  if (n.startsWith('nao')) return 'no';
  return null;
}

/** An em-dash or a lone hyphen is the checklist's "not applicable". */
function cell(raw: string | undefined): string | undefined {
  const v = (raw ?? '').trim();
  if (!v || v === '—' || v === '-' || v === '–') return undefined;
  return v;
}

/**
 * Pull inventory rows out of whatever the org sent.
 *
 * Returns [] for ordinary prose. A row needs a recognised solution AND a
 * presence answer — the blank template, which is just a list of names, is not
 * data and must not be stored as though it were.
 */
export function parseNbsInventory(text: string): NbsInventoryRow[] {
  if (!text || text.length < 60) return [];
  const rows = new Map<string, NbsInventoryRow>();

  for (const rawLine of text.split(/[\r\n]+/)) {
    const line = rawLine.trim();
    if (!line) continue;

    // Cells are tab-separated in a pasted table, or pipe/wide-space separated
    // when the paste flattens.
    const cells = line.split(/\t+|\s*\|\s*|\s{2,}/).map(c => c.trim()).filter(Boolean);
    if (cells.length < 2) continue;

    const hit = BY_NAME.get(normalize(cells[0]));
    if (!hit) continue;

    const present = readPresence(cells[1]);
    if (!present) continue;

    // Later mentions do not overwrite an earlier answered row.
    if (rows.has(hit.id)) continue;
    rows.set(hit.id, {
      solutionId: hit.id,
      label: hit.label,
      present,
      where: cell(cells[2]),
      year: cell(cells[3]),
      plans: cell(cells.slice(4).join(' ')),
    });
  }

  const out = Array.from(rows.values());
  return out.length >= MIN_ROWS_FOR_INVENTORY ? out : [];
}

/** One line per row, for the agent and the org context pack. */
export function summarizeNbsInventory(rows: NbsInventoryRow[], lang: 'pt' | 'en' = 'pt'): string {
  const word = { yes: lang === 'pt' ? 'tem' : 'has', no: lang === 'pt' ? 'não tem' : 'does not have', partial: lang === 'pt' ? 'parcial' : 'partial' };
  return rows
    .map(r => {
      const bits = [r.label, word[r.present]];
      if (r.where) bits.push(r.where);
      if (r.year) bits.push(r.year);
      if (r.plans) bits.push(`— ${r.plans}`);
      return `- ${bits.join(' · ')}`;
    })
    .join('\n');
}

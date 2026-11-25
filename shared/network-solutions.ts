// ============================================================================
// THE COORDINATION'S OWN TABLE — "who has what, who wants what"
// ============================================================================
// The synergy report read one source: what each organisation did on the
// platform. The coordination keeps a second one by hand — a spreadsheet of the
// solutions each organisation already has and wants, updated at the in-person
// meetings, which holds things nobody has tested here yet. The coordination,
// 18 Nov 2026: "this spreadsheet serves as the most up-to-date resource we
// have. Is it possible to upload [it] and have it perform a cross-analysis
// based on the solution families?"
//
// Three steps, and the split is the same one the rest of the report uses:
//
//   1. PROPOSE  — `proposeSolutionsTable` reads the sheets and suggests how the
//                 typed names match the platform's organisations and its 27
//                 solutions. Pure string work, no model.
//   2. CONFIRM  — a coordinator reviews the doubtful matches and signs off.
//                 Nothing is counted before that (the model proposes, they
//                 confirm, a function decides).
//   3. COUNT    — `crossAnalysis` computes every table and sentence of the
//                 report's new sections from the confirmed table and the
//                 platform's own record. No model here either: the narrative
//                 pass is handed the result, it does not produce it.
//
// ⚠️ The hazard-reduction ratings (Forte / Média / Fraca) come FROM THE FILE and
// are credited to it. They are not the platform's catalogue and must not be
// copied into it without a technical review — see docs/synergy-outside-documents.md.
// ============================================================================

import { NBS_SOLUTIONS, NBS_FAMILIAS, getSolution } from './nbs-catalog';

export type Hazard3 = 'flood' | 'heat' | 'landslide';
export const HAZARDS3: Array<{ key: Hazard3; pt: string }> = [
  { key: 'flood', pt: 'Alagamento' },
  { key: 'heat', pt: 'Calor' },
  { key: 'landslide', pt: 'Deslizamento' },
];

/** 0 none · 1 fraca · 2 média · 3 forte. */
export type Strength = 0 | 1 | 2 | 3;
export const STRENGTH_PT: Record<Strength, string> = { 0: 'nenhuma', 1: 'fraca', 2: 'média', 3: 'forte' };

/**
 * How a typed name was matched.
 *  · exact    — same words as the catalogue's label
 *  · spelling — same solution once plural / accents / filler words are ignored
 *  · synonym  — a known other name ("cisterna")
 *  · similar  — one name contains the other: DOUBTFUL, shown for review
 *  · outside  — not among the platform's solutions; kept as its own item
 *  · manual   — set by the coordinator on the review screen
 */
export type MatchHow = 'exact' | 'spelling' | 'synonym' | 'similar' | 'outside' | 'manual';

export interface NameMatch {
  /** Normalised key — what `orgs[].has/wants` and `ratings[].key` point at. */
  key: string;
  /** The first spelling found in the file. */
  typed: string;
  solutionId: string | null;
  /** For an item outside the catalogue: the family the coordinator placed it in (null = outside the families). */
  familiaId: string | null;
  /** Left out of every count (a header caught as an item, a note). */
  ignore?: boolean;
  how: MatchHow;
}

export interface SolutionsTable {
  orgs: Array<{ sheetName: string; memberId: string | null; has: string[]; wants: string[] }>;
  names: NameMatch[];
  /** The file's own rating of each solution, when it carries one. */
  ratings: Array<{ key: string; flood: Strength | null; heat: Strength | null; landslide: Strength | null }>;
  confirmedAt?: string | null;
  confirmedBy?: string | null;
}

export interface Grid { name: string; rows: string[][] }

// ── names ────────────────────────────────────────────────────────────────────

const FILLER = new Set(['de', 'da', 'do', 'das', 'dos', 'a', 'o', 'e', 'em', 'com', 'para']);
const ORG_GENERIC = new Set(['associacao', 'instituicao', 'instituto', 'centro', 'cooperativa', 'organizacao', 'coletivo', 'ong', 'bairro', ...Array.from(FILLER)]);

const plain = (s: string) =>
  s.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[⁠​]/g, '').replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();

/** One Portuguese plural, undone — enough for "canteiros pluviais" = "canteiro pluvial". */
function singular(w: string): string {
  if (w.length <= 3) return w;
  if (w.endsWith('oes')) return w.slice(0, -3) + 'ao';
  if (w.endsWith('ais')) return w.slice(0, -2) + 'l';
  if (w.endsWith('eis')) return w.slice(0, -2) + 'l';
  if (w.endsWith('ns')) return w.slice(0, -2) + 'm';
  if (w.endsWith('s')) return w.slice(0, -1);
  return w;
}

const tokens = (s: string, drop: Set<string> = FILLER) => plain(s).split(' ').filter(w => w && !drop.has(w)).map(singular);

/** The key a typed name is filed under: same solution, same key, whatever the spelling. */
export function nameKey(typed: string): string {
  return tokens(typed).join(' ');
}

/** Other names people use for a catalogue solution. Keys are `nameKey`s. */
const SYNONYMS: Record<string, string> = {
  cisterna: 'captacao-agua-da-chuva',
  composteira: 'compostagem',
  'horta comunitaria': 'hortas-urbanas',
  'telhado verde': 'teto-verde',
  // Rob, 19 Nov 2026: rainwater collection is the captação the catalogue has.
  'coleta agua chuva': 'captacao-agua-da-chuva',
  'tratamento agua chuva': 'captacao-agua-da-chuva',
};

/**
 * Support techniques the Rede's sheet names that are NOT catalogue solutions,
 * with the family each sits in (Rob, 19 Nov 2026: "São técnicas de apoio").
 * They stay items of their own — never folded into a catalogue solution by the
 * "one contains the other" rule: a community kitchen is not the "cozinha
 * comunitária com biodigestor", and a biodigester alone (GHG, like compost) is
 * not the kitchen. A family the file itself gives still wins, and the
 * coordinator can change it on the review screen. Keys are `nameKey`s.
 */
export const SUPPORT_OUTSIDE_FAMILY: Record<string, string> = {
  'cozinha comunitaria': 'agricultura-urbana',
  biodigestor: 'agricultura-urbana',
  biodigestore: 'agricultura-urbana',
  // drainage, and the health risk when a flood reaches open sewage
  'fossa ecologica': 'aguas-pluviais',
};

const CATALOGUE = NBS_SOLUTIONS.map(s => ({ id: s.id, key: nameKey(s.pt.label), set: new Set(tokens(s.pt.label)) }));

const subset = (a: Set<string>, b: Set<string>): boolean => Array.from(a).every(x => b.has(x));

/** Propose a catalogue solution for a typed name. Never guesses between two. */
export function matchSolutionName(typed: string): { solutionId: string | null; how: MatchHow } {
  const key = nameKey(typed);
  if (!key) return { solutionId: null, how: 'outside' };
  const same = CATALOGUE.find(c => c.key === key);
  if (same) {
    const label = getSolution(same.id)!.pt.label;
    return { solutionId: same.id, how: plain(label) === plain(typed) ? 'exact' : 'spelling' };
  }
  if (SYNONYMS[key]) return { solutionId: SYNONYMS[key], how: 'synonym' };
  if (SUPPORT_OUTSIDE_FAMILY[key]) return { solutionId: null, how: 'outside' };
  const set = new Set(key.split(' '));
  // Same words in another order ("captação água chuva").
  const reordered = CATALOGUE.filter(c => c.set.size === set.size && subset(set, c.set));
  if (reordered.length === 1) return { solutionId: reordered[0].id, how: 'spelling' };
  // One contains the other. A single word is never enough: "biodigestor" is
  // not "cozinha comunitária com biodigestor".
  const near = CATALOGUE.filter(c => (set.size >= 2 && subset(set, c.set)) || (c.set.size >= 2 && subset(c.set, set)));
  if (near.length === 1) return { solutionId: near[0].id, how: 'similar' };
  return { solutionId: null, how: 'outside' };
}

/** Propose a member for an organisation name as typed. Null when none, or when two fit equally. */
export function matchOrgName(typed: string, members: Array<{ id: string; orgName: string }>): string | null {
  // The same name, whatever the case and accents, is that organisation — and
  // the only way to match a name made of nothing but generic words
  // ("Organização A", "Coletivo O").
  const whole = plain(typed);
  if (!whole) return null;
  const same = members.filter(m => plain(m.orgName) === whole);
  if (same.length) return same.length === 1 ? same[0].id : null;
  const t = new Set(tokens(typed, ORG_GENERIC));
  if (!t.size) return null;
  let best: { id: string; score: number } | null = null; let tie = false;
  for (const m of members) {
    const mt = new Set(tokens(m.orgName, ORG_GENERIC));
    if (!mt.size) continue;
    const hit = Array.from(mt).filter(x => t.has(x)).length;
    const score = hit / mt.size;
    if (score < 0.6) continue;
    if (!best || score > best.score) { best = { id: m.id, score }; tie = false; }
    else if (score === best.score) tie = true;
  }
  return best && !tie ? best.id : null;
}

// ── reading the sheets ───────────────────────────────────────────────────────

const HAS_HEAD = /\b(ja tem|tem|possui|ja possui|existente|has|already)\b/;
const WANTS_HEAD = /\b(quer|deseja|implementar|pretende|want|wants|wish)\b/;
const ORG_HEAD = /\borganiza|\bentidade|\bcoletivo|\borg\b/;
const SOLUTION_HEAD = /\bsbn\b|tecnica|solucao|solution/;
const HAZARD_HEAD: Array<[Hazard3, RegExp]> = [
  ['flood', /alagamento|inundac|enchente|flood/],
  ['heat', /calor|heat/],
  ['landslide', /desliz|landslide|encosta/],
];

function strengthOf(cell: string): Strength | null | undefined {
  const c = plain(cell);
  if (c === 'forte' || c === 'alta' || c === 'strong') return 3;
  if (c === 'media' || c === 'medio' || c === 'medium') return 2;
  if (c === 'fraca' || c === 'baixa' || c === 'weak') return 1;
  if (cell.trim() === '—' || cell.trim() === '-' || c === 'nenhuma' || c === 'nao') return 0;
  if (!c) return null;
  return undefined; // not a rating at all
}

/** A cell that lists several things: one per line, or separated by ; , • */
export function splitItems(cell: string): string[] {
  return cell.split(/\r?\n|;|•|,(?![^(]*\))/).map(x => x.replace(/[⁠​]/g, '').replace(/^[\s\-–•*]+|[\s:.]+$/g, '')).filter(x => plain(x) && !NOTHING.has(plain(x)));
}

/** How a cell says "nothing here" — never an item an organisation has or wants. */
const NOTHING = new Set(['nenhuma', 'nenhum', 'nada', 'nao', 'nao tem', 'nao possui', 'n a', 'na', 'sem', 'none', 'x']);

/**
 * Read the coordination's sheets into a proposal.
 * Returns null when no sheet looks like "organisation × what it has / wants" —
 * the file is then plain context for the narrative and nothing is counted.
 */
export function proposeSolutionsTable(grids: Grid[], members: Array<{ id: string; orgName: string }>): SolutionsTable | null {
  const names = new Map<string, NameMatch>();
  const note = (typed: string): string | null => {
    const key = nameKey(typed);
    if (!key) return null;
    if (!names.has(key)) {
      const m = matchSolutionName(typed);
      names.set(key, { key, typed: typed.trim(), solutionId: m.solutionId, familiaId: m.solutionId ? getSolution(m.solutionId)!.familiaId : SUPPORT_OUTSIDE_FAMILY[key] ?? null, how: m.how });
    }
    return key;
  };

  let orgs: SolutionsTable['orgs'] | null = null;
  const ratings: SolutionsTable['ratings'] = [];
  const famByKey = new Map<string, string>();

  for (const g of grids) {
    const rows = g.rows.filter(r => r.some(c => plain(c ?? '')));
    if (rows.length < 2) continue;
    const head = rows.slice(0, 3).map(r => r.map(c => plain(c ?? '')));
    const colOf = (re: RegExp) => { for (const h of head) { const i = h.findIndex(c => re.test(c)); if (i >= 0) return i; } return -1; };

    // (a) a ratings sheet: a solutions column and at least one hazard column.
    const hz = HAZARD_HEAD.map(([k, re]) => [k, colOf(re)] as const).filter(([, i]) => i >= 0);
    if (hz.length) {
      let nameCol = colOf(SOLUTION_HEAD);
      if (nameCol < 0) {
        // The column where most cells are catalogue solutions.
        let bestN = 0;
        for (let c = 0; c < Math.max(...rows.map(r => r.length)); c++) {
          const n = rows.filter(r => matchSolutionName(r[c] ?? '').solutionId).length;
          if (n > bestN) { bestN = n; nameCol = c; }
        }
      }
      if (nameCol >= 0) {
        const groupCol = colOf(/\bgrupo|familia|family/);
        // A row rates a solution when at least one hazard cell is a rating. A
        // cell that is something else ("Média/Forte") is left unrated rather
        // than costing the row its other two.
        const rated = rows.map(r => ({ r, vals: hz.map(([k, i]) => [k, strengthOf(r[i] ?? '')] as const) }))
          .filter(({ r, vals }) => plain(r[nameCol] ?? '') && vals.some(([, v]) => typeof v === 'number'));
        // ⚠️ Only a sheet that actually rates is a ratings sheet. A hazard word
        // in the first rows of the ORGANISATIONS sheet (a "Risco" column, a
        // title "Soluções para alagamento e calor") used to send it down this
        // branch, find nothing, and skip it — the file silently became context.
        if (rated.length >= 2) {
          for (const { r, vals } of rated) {
            const key = note(r[nameCol]); if (!key) continue;
            const at = (k: Hazard3) => { const v = vals.find(([kk]) => kk === k)?.[1]; return (typeof v === 'number' ? v : null) as Strength | null; };
            ratings.push({ key, flood: at('flood'), heat: at('heat'), landslide: at('landslide') });
            if (groupCol >= 0 && plain(r[groupCol] ?? '')) famByKey.set(key, r[groupCol]);
          }
          continue;
        }
      }
    }

    // (b) the organisations sheet.
    if (orgs) continue;
    const width = Math.max(...rows.map(r => r.length));
    let hasCol = colOf(HAS_HEAD), wantsCol = colOf(WANTS_HEAD);
    if (hasCol === wantsCol) hasCol = -1; // "o que … já tem e quer": one column, read as wants
    // The organisations column: the one whose cells ARE organisations. A header
    // word is only a tiebreak — "O que a organização já tem" contains one too,
    // and so does every row of a network whose members are called "Coletivo …".
    let orgCol = -1; let bestN = 0;
    for (let c = 0; c < width; c++) {
      if (c === hasCol || c === wantsCol) continue;
      const n = rows.filter(r => matchOrgName(r[c] ?? '', members)).length;
      if (n > bestN) { bestN = n; orgCol = c; }
    }
    if (bestN < 2) {
      orgCol = -1;
      for (const h of head) { const i = h.findIndex((c, ci) => ci !== hasCol && ci !== wantsCol && ORG_HEAD.test(c)); if (i >= 0) { orgCol = i; break; } }
    }
    if (orgCol < 0) continue;
    if (hasCol < 0 && wantsCol < 0) {
      const others = Array.from({ length: width }, (_, i) => i).filter(i => i !== orgCol && rows.some(r => plain(r[i] ?? '')));
      if (others.length !== 1) continue;
      wantsCol = others[0];
    }
    // The header is the LAST of the first rows that reads like one and is not
    // itself an organisation: a title above it goes too, and a first data row
    // ("Coletivo Beira-Rio | …") is never taken for a header.
    const headerLike = (h: string[], raw: string[]) =>
      !matchOrgName(raw[orgCol] ?? '', members)
      && (HAS_HEAD.test(h[hasCol] ?? '') || WANTS_HEAD.test(h[wantsCol] ?? '') || (ORG_HEAD.test(h[orgCol] ?? '') && (h[orgCol] ?? '').split(' ').length <= 3));
    let headerRow = -1;
    head.forEach((h, i) => { if (headerLike(h, rows[i])) headerRow = i; });
    // A header in words this does not know ("Nome | Soluções"): the first row
    // names no organisation and lists no solution of the catalogue, in a sheet
    // whose other rows do name organisations.
    if (headerRow < 0 && bestN >= 2 && !matchOrgName(rows[0][orgCol] ?? '', members)
      && [hasCol, wantsCol].filter(i => i >= 0).flatMap(i => splitItems(rows[0][i] ?? '')).every(x => !matchSolutionName(x).solutionId)) headerRow = 0;
    const body = rows.slice(headerRow + 1);
    // One organisation over several rows (a solution per row, a merged name
    // cell) is still one organisation: its rows are read together.
    const byName = new Map<string, SolutionsTable['orgs'][number]>();
    for (const r of body) {
      const sheetName = (r[orgCol] ?? '').trim();
      if (!plain(sheetName)) continue;
      const list = (i: number) => i < 0 ? [] : splitItems(r[i] ?? '').map(note).filter((k): k is string => !!k);
      const row = byName.get(plain(sheetName)) ?? { sheetName, memberId: matchOrgName(sheetName, members), has: [], wants: [] };
      row.has = Array.from(new Set([...row.has, ...list(hasCol)]));
      row.wants = Array.from(new Set([...row.wants, ...list(wantsCol)]));
      byName.set(plain(sheetName), row);
    }
    const found = Array.from(byName.values());
    if (found.length >= 2) orgs = found;
  }

  if (!orgs) return null;
  // An item outside the catalogue takes the family the file itself gave it, when that names one of ours.
  for (const n of Array.from(names.values())) {
    if (n.solutionId || !famByKey.has(n.key)) continue;
    const want = nameKey(famByKey.get(n.key)!);
    if (!want) continue;
    const fam = NBS_FAMILIAS.find(f => { const k = nameKey(f.pt.label); return k === want || k.includes(want) || want.includes(k); });
    if (fam) n.familiaId = fam.id;
  }
  // Two members claimed by two rows each is a doubt for the reviewer, not a guess for us.
  const claimed = new Map<string, number>();
  for (const o of orgs) if (o.memberId) claimed.set(o.memberId, (claimed.get(o.memberId) ?? 0) + 1);
  for (const o of orgs) if (o.memberId && (claimed.get(o.memberId) ?? 0) > 1) o.memberId = null;
  return { orgs, names: Array.from(names.values()), ratings, confirmedAt: null, confirmedBy: null };
}

/** How many matches a person should look at before confirming. */
export function doubtsIn(t: SolutionsTable): number {
  const used = new Set(t.orgs.flatMap(o => [...o.has, ...o.wants]));
  return t.names.filter(n => used.has(n.key) && !n.ignore && (n.how === 'similar' || n.how === 'outside')).length
    + t.orgs.filter(o => !o.memberId && (o.has.length || o.wants.length)).length;
}

/**
 * Apply what the coordinator set on the review screen. Only the mapping can
 * change — which organisation a row is, which solution a name is. What the
 * file says each organisation has and wants is the file's and stays as read.
 */
export function applyReview(
  t: SolutionsTable,
  review: { orgs?: Array<{ sheetName: string; memberId: string | null }>; names?: Array<{ key: string; solutionId?: string | null; familiaId?: string | null; ignore?: boolean }> },
  validMemberIds: Set<string>,
): SolutionsTable {
  const famIds = new Set<string>(NBS_FAMILIAS.map(f => f.id));
  const orgPick = new Map((review.orgs ?? []).map(o => [o.sheetName, o.memberId]));
  const namePick = new Map((review.names ?? []).map(n => [n.key, n]));
  const taken = new Set<string>();
  const orgs = t.orgs.map(o => {
    let memberId = orgPick.has(o.sheetName) ? orgPick.get(o.sheetName)! : o.memberId;
    if (memberId && (!validMemberIds.has(memberId) || taken.has(memberId))) memberId = null;
    if (memberId) taken.add(memberId);
    return { ...o, memberId };
  });
  const names = t.names.map(n => {
    const p = namePick.get(n.key);
    if (!p) return n;
    const solutionId = p.solutionId === undefined ? n.solutionId : (p.solutionId && getSolution(p.solutionId) ? p.solutionId : null);
    const changed = solutionId !== n.solutionId;
    const familiaId = solutionId ? getSolution(solutionId)!.familiaId : (p.familiaId === undefined ? (changed ? null : n.familiaId) : (p.familiaId && famIds.has(p.familiaId) ? p.familiaId : null));
    return { ...n, solutionId, familiaId, ignore: !!p.ignore, how: changed ? (solutionId ? 'manual' as const : 'outside' as const) : n.how };
  });
  return { ...t, orgs, names };
}

// ── the cross ────────────────────────────────────────────────────────────────

/** What the platform holds for one organisation — handed in, so this file stays pure. */
export interface PlatformSide {
  memberId: string;
  orgName: string;
  bairro: string | null;
  kept: string[];
  considering: string[];
  discarded: string[];
  /** The technical visit's recommended solution id. */
  visit: string | null;
  /** Official class at the site, 0..4 (≥ 3 = high): flood + landslide SGB susceptibility, heat PLAC/ARVC 2050 (server/services/sgbPointHazard.ts). */
  hazard: Partial<Record<Hazard3, { level: number; pt: string }>>;
  /** The Guaíba flood mark (cota, m) the city's maps place the site inside. */
  guaibaCotaM: number | null;
  /** Has any answer on the platform. */
  started: boolean;
}

/** Level reached by the Guaíba in May 2024 — a site with no official flood reading inside a mark at or below it is treated as exposed. */
export const GUAIBA_2024_M = 5.35;

export interface CrossItem {
  /** The catalogue solution id, or `x:<key>` for an item outside it. */
  id: string;
  name: string;
  familiaId: string | null;
  outside: boolean;
  rating: Record<Hazard3, Strength | null> | null;
  /** The platform classes it as simple to build (catalogue `complexidade`). */
  simple: boolean;
}

export type RiskState = 'na' | 'ok' | 'part' | 'gap';

export interface OutsideCross {
  fileName: string;
  fileDate: string | null;
  hasRatings: boolean;
  items: CrossItem[];
  orgs: Array<{ memberId: string; name: string; bairro: string | null; has: string[]; wants: string[]; onPlatform: string[] }>;
  /** Members with no usable row in the file, and what the platform has for them. */
  absent: Array<{ name: string; bairro: string | null; notePt: string }>;
  /** Rows of the file the review left without an organisation. */
  unmatchedRows: string[];
  families: Array<{ id: string | null; labelPt: string; have: number; want: number }>;
  bySolution: Array<{ id: string; hasBy: string[]; wantBy: string[] }>;
  versus: Array<{ memberId: string; both: string[]; fileOnly: string[]; platformOnly: string[]; lookPt: string[] }>;
  risk: Array<{ memberId: string; cells: Array<{ hazard: Hazard3; sitePt: string | null; level: number | null; notePt: string | null; best: Strength; by: string[]; state: RiskState }> }>;
  /** Computed sentences: what is wanted against what reduces risk. */
  readingPt: string[];
  suggestion: { introPt: string; perOrgPt: string[] } | null;
  /** How each typed name was read — printed so the reader can check the counting. */
  matching: Array<{ typed: string; readAs: string; how: MatchHow; familyPt: string | null }>;
}

const famLabel = (id: string | null) => (id && NBS_FAMILIAS.find(f => f.id === id)?.pt.label) || 'Fora das famílias';
const list = (xs: string[]) => xs.length <= 1 ? (xs[0] ?? '') : `${xs.slice(0, -1).join(', ')} e ${xs[xs.length - 1]}`;
/** "… das escolhas parece(m) responder": the subject with its verb, so the sentence agrees. */
const shareOfChoices = (a: number, b: number) => a === b ? 'todas as escolhas parecem' : a / b >= 0.8 ? 'quase todas as escolhas parecem' : 'a maior parte das escolhas parece';

/**
 * Everything the report's new sections show, counted from the confirmed table
 * and the platform's record. Deterministic: the same inputs print the same page.
 */
export function crossAnalysis(table: SolutionsTable, platform: PlatformSide[], file: { name: string; date?: string | null }): OutsideCross {
  const nm = new Map(table.names.map(n => [n.key, n]));
  const idOf = (key: string): string | null => { const n = nm.get(key); return !n || n.ignore ? null : (n.solutionId ?? `x:${n.key}`); };

  // Items, keyed by id — two spellings of one solution are one item.
  const ratingByKey = new Map(table.ratings.map(r => [r.key, r]));
  const items = new Map<string, CrossItem>();
  for (const n of table.names) {
    const id = idOf(n.key); if (!id) continue;
    const sol = n.solutionId ? getSolution(n.solutionId) : null;
    const r = ratingByKey.get(n.key);
    const prev = items.get(id);
    const rating = r ? { flood: r.flood, heat: r.heat, landslide: r.landslide } : (prev?.rating ?? null);
    items.set(id, prev ? { ...prev, rating } : {
      id, name: sol ? sol.pt.label : n.typed, familiaId: sol ? sol.familiaId : n.familiaId, outside: !sol, rating,
      simple: sol?.complexidade === 'simples',
    });
  }
  const item = (id: string) => items.get(id)!;
  const hasRatings = table.ratings.length > 0;
  const R = (id: string, h: Hazard3): Strength => (item(id).rating?.[h] ?? 0) as Strength;

  const byId = new Map(platform.map(p => [p.memberId, p]));
  const ids = (keys: string[]) => Array.from(new Set(keys.map(idOf).filter((x): x is string => !!x)));
  const orgs: OutsideCross['orgs'] = [];
  const unmatchedRows: string[] = [];
  const seen = new Set<string>();
  for (const o of table.orgs) {
    const has = ids(o.has), wants = ids(o.wants);
    if (!has.length && !wants.length) continue;
    const p = o.memberId ? byId.get(o.memberId) : undefined;
    if (!p) { unmatchedRows.push(o.sheetName); continue; }
    seen.add(p.memberId);
    const on = new Set([...p.kept, ...p.considering, ...(p.visit ? [p.visit] : [])]);
    orgs.push({ memberId: p.memberId, name: p.orgName, bairro: p.bairro, has, wants, onPlatform: [...has, ...wants].filter((x, i, a) => a.indexOf(x) === i && on.has(x)) });
  }
  const absent = platform.filter(p => !seen.has(p.memberId)).map(p => ({
    name: p.orgName, bairro: p.bairro,
    notePt: p.started
      ? (p.kept.length || p.considering.length || p.visit
        ? 'Sem dados no arquivo da coordenação. Na plataforma há soluções testadas ou recomendadas, que aparecem nas demais seções do relatório.'
        : 'Sem dados no arquivo da coordenação. Na plataforma há apenas respostas iniciais, sem soluções testadas nem visita técnica.')
      : 'Sem dados no arquivo da coordenação e sem respostas na plataforma.',
  }));

  const used = Array.from(items.values()).filter(i => orgs.some(o => o.has.includes(i.id) || o.wants.includes(i.id)));
  const wantN = (id: string) => orgs.filter(o => o.wants.includes(id)).length;
  const haveN = (id: string) => orgs.filter(o => o.has.includes(id)).length;
  used.sort((a, b) => wantN(b.id) - wantN(a.id) || haveN(b.id) - haveN(a.id) || a.name.localeCompare(b.name));

  const famOrder: Array<string | null> = [...NBS_FAMILIAS.map(f => f.id as string), null];
  const families = famOrder.filter(f => used.some(i => i.familiaId === f)).map(f => ({
    id: f, labelPt: famLabel(f),
    have: orgs.filter(o => o.has.some(x => item(x).familiaId === f)).length,
    want: orgs.filter(o => o.wants.some(x => item(x).familiaId === f)).length,
  }));

  const bySolution = used.map(i => ({ id: i.id, hasBy: orgs.filter(o => o.has.includes(i.id)).map(o => o.memberId), wantBy: orgs.filter(o => o.wants.includes(i.id)).map(o => o.memberId) }));

  const nameOf = (id: string) => items.get(id)?.name ?? getSolution(id)?.pt.label ?? id;
  const versus = orgs.map(o => {
    const p = byId.get(o.memberId)!;
    const F = new Set([...o.has, ...o.wants]);
    const P = new Set([...p.kept, ...p.considering, ...(p.visit ? [p.visit] : [])]);
    const lookPt: string[] = [];
    for (const d of p.discarded) if (o.wants.includes(d)) {
      lookPt.push(`${nameOf(d)}: o arquivo da coordenação indica que a organização quer; no teste do Encontro 3 a resposta foi “não é pra gente”${p.visit === d ? '; a visita técnica recomendou a solução' : ''}.`);
    }
    for (const x of Array.from(P)) if (!F.has(x)) lookPt.push(`${nameOf(x)}: ${p.kept.includes(x) ? 'mantida (“faz sentido”)' : p.considering.includes(x) ? 'ainda em avaliação' : 'recomendada pela visita técnica'} na plataforma; não consta no arquivo.`);
    if (p.visit) lookPt.push(`A visita técnica recomendou ${nameOf(p.visit)} (${o.wants.includes(p.visit) ? 'consta' : 'não consta'} na lista do que a organização quer).`);
    return { memberId: o.memberId, both: Array.from(F).filter(x => P.has(x)), fileOnly: Array.from(F).filter(x => !P.has(x)), platformOnly: Array.from(P).filter(x => !F.has(x)), lookPt };
  });

  const risk: OutsideCross['risk'] = hasRatings ? orgs.map(o => {
    const p = byId.get(o.memberId)!;
    return {
      memberId: o.memberId,
      cells: HAZARDS3.map(({ key }) => {
        const hz = p.hazard[key];
        const best = Math.max(0, ...o.wants.map(x => R(x, key))) as Strength;
        const by = best > 0 ? o.wants.filter(x => R(x, key) === best) : [];
        const cota = key === 'flood' ? p.guaibaCotaM : null;
        // A flood reading always exists inside the city now (SGB; 0 = not mapped), so
        // the May 2024 Guaíba mark counts on its own, not only as a fallback.
        const high = (hz ? hz.level >= 3 : false) || (cota != null && cota <= GUAIBA_2024_M);
        return {
          hazard: key, sitePt: hz?.pt ?? null, level: hz?.level ?? null,
          notePt: cota != null ? `dentro da mancha da cota de ${cota.toFixed(2).replace('.', ',')} m do Guaíba` : null,
          best, by, state: (!high ? 'na' : best === 3 ? 'ok' : best === 2 ? 'part' : 'gap') as RiskState,
        };
      }),
    };
  }) : [];

  // ── the reading: what is wanted against what reduces risk ──────────────────
  const readingPt: string[] = [];
  let suggestion: OutsideCross['suggestion'] = null;
  const wishes = orgs.flatMap(o => o.wants.map(x => ({ o, x })));
  if (hasRatings && wishes.length) {
    const top = (x: string) => Math.max(...HAZARDS3.map(h => R(x, h.key))) as Strength;
    const n = (s: Strength[]) => wishes.filter(w => s.includes(top(w.x))).length;
    readingPt.push(`Dos ${wishes.length} desejos listados, ${n([3])} são de soluções com redução forte de ao menos um risco, ${n([2])} com redução média e ${n([0, 1])} com redução fraca, nula ou sem avaliação.`);
    const most = used.filter(i => wantN(i.id) > 0).slice(0, 3);
    if (most.length) readingPt.push(`As mais pedidas são ${list(most.map(i => `${i.name.toLowerCase()} (${wantN(i.id)} ${wantN(i.id) === 1 ? 'organização' : 'organizações'}; redução ${STRENGTH_PT[top(i.id)]}, no máximo)`))}.`);

    const exposed = risk.map(r => ({ r, cells: r.cells.filter(c => c.state !== 'na') })).filter(x => x.cells.length);
    if (exposed.length) {
      const orgName = (id: string) => byId.get(id)!.orgName;
      const full = exposed.filter(x => x.cells.every(c => c.state === 'ok'));
      const gaps = exposed.filter(x => x.cells.some(c => c.state === 'gap'));
      readingPt.push(`${exposed.length} das ${orgs.length} organizações estão em lugares com ao menos uma ameaça alta ou muito alta. Em ${full.length} delas a lista traz uma solução de redução forte para cada uma dessas ameaças${gaps.length ? `; em ${gaps.length} (${list(gaps.map(x => orgName(x.r.memberId)))}), ao menos uma ameaça alta fica sem nenhuma solução acima de “fraca”` : ''}.`);
      let answers = 0, total = 0;
      for (const x of exposed) {
        const o = orgs.find(o => o.memberId === x.r.memberId)!;
        for (const w of o.wants) { total++; if (Math.max(...x.cells.map(c => R(w, c.hazard))) >= 2) answers++; }
      }
      if (total) readingPt.push(`Olhando só para as ameaças altas de cada lugar, ${answers} dos ${total} desejos dessas organizações (${Math.round(100 * answers / total)}%) são de soluções com redução média ou forte para o risco do próprio lugar${answers / total < 0.5 ? `: ${shareOfChoices(total - answers, total)} responder a outras necessidades mais do que ao risco climático` : ''}.`);

      // Simple to build AND rated to do something: what a training session could show.
      const rated = (h: Hazard3) => Array.from(items.values()).filter(i => !i.outside && i.simple && R(i.id, h) >= 2).sort((a, b) => R(b.id, h) - R(a.id, h));
      const all = Array.from(new Set(HAZARDS3.flatMap(h => rated(h.key)))).sort((a, b) => wantN(b.id) - wantN(a.id));
      const perOrgPt: string[] = [];
      for (const x of exposed) {
        const o = orgs.find(o => o.memberId === x.r.memberId)!; const p = byId.get(o.memberId)!;
        for (const c of x.cells) {
          if (c.state === 'ok') continue;
          const miss = rated(c.hazard).filter(i => !o.wants.includes(i.id) && !o.has.includes(i.id) && !p.discarded.includes(i.id) && R(i.id, c.hazard) > c.best);
          const hz = HAZARDS3.find(h => h.key === c.hazard)!.pt.toLowerCase();
          perOrgPt.push(miss.length
            ? `${p.orgName}, ${hz}: ${list(miss.map(i => i.name.toLowerCase()))} ${miss.length === 1 ? 'é uma solução simples' : 'são soluções simples'} com redução maior do que as da lista atual.`
            : `${p.orgName}, ${hz}: nenhuma solução classificada como simples reduz esse risco acima do que a lista já traz; o caminho passa por apoio técnico.`);
        }
      }
      if (all.length && perOrgPt.length) suggestion = {
        introPt: `A plataforma classifica como simples (ao alcance de uma organização comunitária com pouco apoio técnico) ${all.length} ${all.length === 1 ? 'solução que o arquivo avalia' : 'soluções que o arquivo avalia'} com redução média ou forte de algum risco: ${list(all.map(i => `${i.name.toLowerCase()} (${wantN(i.id)} ${wantN(i.id) === 1 ? 'quer' : 'querem'})`))}. Sem substituir o que as organizações escolheram, talvez valha reservar um momento das próximas formações para mostrar essas soluções ao lado das já desejadas, de modo que cada organização reconheça quais estão ao seu alcance e também reduzem o risco do seu lugar.`,
        perOrgPt,
      };
    }
  }

  const usedKeys = new Set(table.orgs.flatMap(o => [...o.has, ...o.wants]));
  const matching = table.names.filter(n => usedKeys.has(n.key) && !n.ignore && n.how !== 'exact').map(n => ({
    typed: n.typed, readAs: n.solutionId ? getSolution(n.solutionId)!.pt.label : n.typed, how: n.how, familyPt: n.solutionId ? null : famLabel(n.familiaId),
  }));

  return {
    fileName: file.name, fileDate: file.date ?? null, hasRatings, items: used, orgs, absent, unmatchedRows,
    families, bySolution, versus, risk, readingPt, suggestion, matching,
  };
}

// ── checking what the narrative says about the table ─────────────────────────

/**
 * ⚠️ THE NARRATIVE MIXES UP WHO WANTS WHAT. Live, over six organisations, one
 * sentence in nine that cited the coordination's table gave an organisation a
 * solution that was another's ("a Organização D quer … solo grampeado verde" —
 * it was E's). The tables on the page are counted and right; a wrong sentence
 * beside them is what gets read aloud in the meeting.
 *
 * So a sentence is checked the only way a sentence can be without a second
 * model: every solution of the table it names, in the stretch of text after an
 * organisation's name and before the next one, must be linked to THAT
 * organisation — in the file (has or wants) or on the platform. A solution
 * named before any organisation, or an organisation followed by none, proves
 * nothing and passes. Returns the first unsupported pair, or null.
 */
export function unsupportedClaim(
  sentence: string,
  orgs: Array<{ name: string; linked: string[] }>,
  items: Array<{ id: string; name: string }>,
): { org: string; item: string } | null {
  // Organisation names as written, longest first, each occurrence once.
  const marks: Array<{ at: number; end: number; org: (typeof orgs)[number] }> = [];
  const lower = sentence.toLowerCase();
  for (const org of [...orgs].sort((a, b) => b.name.length - a.name.length)) {
    const needle = org.name.toLowerCase();
    if (!needle) continue;
    for (let at = lower.indexOf(needle); at >= 0; at = lower.indexOf(needle, at + 1)) {
      const end = at + needle.length;
      if (/[a-z0-9\u00c0-\u024f]/i.test(lower[end] ?? '') || marks.some(m => at < m.end && end > m.at)) continue;
      marks.push({ at, end, org });
    }
  }
  marks.sort((a, b) => a.at - b.at);
  // Longest name first, and a name once read is taken out of the text: "cozinha
  // comunitária com biodigestor" is that one solution, not also "cozinha
  // comunitária" and "biodigestor", which may be other organisations' items.
  const keyed = items.map(i => ({ ...i, key: nameKey(i.name) })).filter(i => i.key).sort((a, b) => b.key.length - a.key.length);
  // "A, B e C já têm hortas e compostagem" says it of all three: organisations
  // joined by nothing but a comma or an "e" share the statement that follows
  // the last of them. (Seen live: the third had both, the first only one.)
  const joined = (from: number, to: number) => /^[\s,;]*(?:e|ou)?[\s,]*(?:a|o|as|os|à|ao|às|aos)?\s*$/i.test(sentence.slice(from, to));
  for (let i = 0; i < marks.length; i++) {
    const group = [marks[i]];
    while (i + 1 < marks.length && joined(marks[i].end, marks[i + 1].at)) group.push(marks[++i]);
    let stretch = ` ${tokens(sentence.slice(marks[i].end, marks[i + 1]?.at ?? sentence.length)).join(' ')} `;
    for (const it of keyed) {
      if (!stretch.includes(` ${it.key} `)) continue;
      const without = group.find(m => !m.org.linked.includes(it.id));
      if (without) return { org: without.org.name, item: it.name };
      stretch = stretch.split(` ${it.key} `).join(' · ');
    }
  }
  return null;
}

/** What each organisation is linked to, for `unsupportedClaim`: the file's has and wants, and whatever the platform holds. */
export function linksFor(c: OutsideCross, platformSolutions: (memberId: string) => string[]): Array<{ name: string; linked: string[] }> {
  return c.orgs.map(o => {
    const v = c.versus.find(x => x.memberId === o.memberId);
    return { name: o.name, linked: Array.from(new Set([...o.has, ...o.wants, ...o.onPlatform, ...(v?.platformOnly ?? []), ...platformSolutions(o.memberId)])) };
  });
}

/** What the coordination's confirmed table says about ONE organisation. */
export interface CoordinationNote { fileName: string; fileDate: string | null; has: string[]; wants: string[] }

/**
 * The coordination's note on one organisation, read off its confirmed table.
 *
 * DERIVED every time it is shown, never copied into the organisation's record:
 * the organisation did not say this on the platform, a newer version of the
 * file must replace it without anything to keep in sync, and removing the file
 * must remove the note. Null when the table has nothing for this organisation.
 */
export function coordinationNoteFor(table: SolutionsTable, memberId: string, file: { name: string; date?: string | null }): CoordinationNote | null {
  if (!table.confirmedAt) return null;
  const row = table.orgs.find(o => o.memberId === memberId);
  if (!row) return null;
  const byKey = new Map(table.names.map(n => [n.key, n]));
  const labels = (keys: string[]) => Array.from(new Set(keys.map(k => byKey.get(k)).filter((n): n is NameMatch => !!n && !n.ignore)
    .map(n => (n.solutionId ? getSolution(n.solutionId)?.pt.label : null) ?? n.typed)));
  const has = labels(row.has), wants = labels(row.wants);
  return has.length || wants.length ? { fileName: file.name, fileDate: file.date ?? null, has, wants } : null;
}

/** The cross as the lines the narrative pass reads — facts already counted, each carrying its source. */
export function crossForModel(c: OutsideCross, nameOfMember: (id: string) => string): string[] {
  const item = new Map(c.items.map(i => [i.id, i]));
  const n = (id: string) => item.get(id)?.name ?? id;
  const L: string[] = [];
  L.push(`# ARQUIVO DA COORDENAÇÃO — ${c.fileName}`);
  L.push('Planilha mantida pela coordenação da rede: o que cada organização JÁ TEM e o que QUER implementar. Inclui o que foi dito nos encontros presenciais e ainda não foi testado na plataforma. Ao usar, diga "segundo a planilha da coordenação".');
  for (const o of c.orgs) L.push(`- ${o.name}: já tem ${o.has.map(n).join(', ') || '—'}; quer ${o.wants.map(n).join(', ') || '—'}`);
  L.push('## Por solução (quem já tem pode mostrar a quem quer)');
  for (const s of c.bySolution) L.push(`- ${n(s.id)}: têm ${s.hasBy.map(nameOfMember).join(', ') || 'ninguém'}; querem ${s.wantBy.map(nameOfMember).join(', ') || 'ninguém'}`);
  const look = c.versus.flatMap(v => v.lookPt.filter(l => !l.startsWith('A visita técnica')).map(l => `- ${nameOfMember(v.memberId)} — ${l}`));
  if (look.length) { L.push('## Onde a planilha e a plataforma divergem'); L.push(...look); }
  if (c.readingPt.length) { L.push('## Desejos frente ao risco do lugar (avaliações de redução da própria planilha, ainda não revisadas)'); L.push(...c.readingPt.map(x => `- ${x}`)); }
  return L;
}

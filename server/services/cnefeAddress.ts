// ============================================================================
// CNEFE — a street + house number becomes the census point at that door
// ============================================================================
// 11 Nov 2026, measured on prod: Nominatim has no house numbers for Porto
// Alegre. "Rua Voluntários da Pátria, 1039, Floresta, Porto Alegre" landed at
// -30.0219,-51.2154 and "Voluntários da Pátria 1039" at -30.0063,-51.2086 —
// ~1.7 km apart, both `precise:false`, neither at Ksa Rosa's door.
//
// IBGE's Cadastro Nacional de Endereços para Fins Estatísticos (Censo 2022)
// has every address the census visited, with the number and a coordinate
// (NV_GEO_COORD 1–3 = the address itself, 4 = its block face). Porto Alegre's
// rows are compacted by scripts/build-cnefe-index.ts into
// knowledge/porto-alegre/cnefe-2022/addresses.json.gz, and this module answers
// from that file alone: no network, so it is the FIRST source for an address
// with a number and is unit-testable as is (e2e/cnefe-address.spec.ts).
//
// Honest by construction:
//  - `precise: true` only for a number hit — the exact number, or the nearest
//    number on the same street within ±NEAREST_SPAN (match: 'nearest', and
//    `matchedNumber` says which door the point is at).
//  - No number, an unknown street, nothing within ±NEAREST_SPAN, or the same
//    number in two places with nothing to tell them apart → null, and the
//    caller falls back to the street-level geocoder.
//  - A bairro the census places elsewhere does not discard the number:
//    `bairroMismatch` says so, and the bairro IBGE records is returned.

import { existsSync, readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import path from 'node:path';

export const CNEFE_SOURCE = 'IBGE, CNEFE 2022';
/** How far (in house numbers) the nearest-number fallback may look. */
export const NEAREST_SPAN = 20;
/** Two hits further apart than this are two places, not one. */
const SAME_PLACE_M = 300;

// ---------------------------------------------------------------------------
// Normalisation — shared by the build script and the lookup, so the file and
// the query are always reduced the same way.
// ---------------------------------------------------------------------------

/** Lowercase, no accents, letters/digits/spaces only. */
export function plainText(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[º°ª]/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

const STOP = new Set(['de', 'da', 'do', 'das', 'dos', 'e', 'd']);

/** Street-type words (and their abbreviations) → CNEFE's NOM_TIPO_SEGLOGR. */
const TYPES: Record<string, string> = {
  r: 'rua', rua: 'rua',
  av: 'avenida', avda: 'avenida', ave: 'avenida', avenida: 'avenida',
  tv: 'travessa', trav: 'travessa', travessa: 'travessa',
  estr: 'estrada', est: 'estrada', estrada: 'estrada',
  al: 'alameda', alameda: 'alameda',
  pc: 'praca', pca: 'praca', praca: 'praca',
  bc: 'beco', beco: 'beco',
  ac: 'acesso', acesso: 'acesso',
  lgo: 'largo', lg: 'largo', largo: 'largo',
  psg: 'passagem', pass: 'passagem', passagem: 'passagem',
  rod: 'rodovia', rodovia: 'rodovia',
  viela: 'viela', via: 'via',
};

/** Title abbreviations → CNEFE's spelled-out NOM_TITULO_SEGLOGR words. */
const ABBREV: Record<string, string> = {
  dr: 'doutor', dra: 'doutora', cel: 'coronel', gen: 'general', prof: 'professor',
  profa: 'professora', eng: 'engenheiro', pe: 'padre', sto: 'santo', sta: 'santa',
  s: 'sao', des: 'desembargador', mal: 'marechal', ten: 'tenente', cap: 'capitao',
  pres: 'presidente', ver: 'vereador', dep: 'deputado', sen: 'senador',
  gov: 'governador', min: 'ministro', brig: 'brigadeiro', alm: 'almirante',
  maj: 'major', cmte: 'comandante', com: 'comendador', cons: 'conselheiro',
  vig: 'vigario', mons: 'monsenhor', sgt: 'sargento', vol: 'voluntarios',
  visc: 'visconde', bar: 'barao', dq: 'duque', mq: 'marques', fr: 'frei',
  irm: 'irmao', nsa: 'nossa', sra: 'senhora', sr: 'senhor',
};

/** A street name (no type) reduced to its matching key. */
export function streetKey(s: string): string {
  return plainText(s)
    .split(' ')
    .filter(Boolean)
    .map(t => ABBREV[t] ?? t)
    .filter(t => !STOP.has(t))
    .join(' ');
}

export const bairroKey = (s: string) => plainText(s).replace(/^bairro /, '');

// ---------------------------------------------------------------------------
// Parsing what people type
// ---------------------------------------------------------------------------

export interface ParsedAddress {
  /** The street as typed, without the number (kept for the label). */
  streetText: string;
  /** CNEFE street type when one was typed ('rua', 'avenida'…). */
  type: string | null;
  /** streetKey of the name, type removed. */
  key: string;
  number: number;
  /** Everything after the number: bairro / complement candidates. */
  rest: string[];
}

const NOISE = new Set(['porto alegre', 'poa', 'rs', 'rio grande sul', 'brasil', 'brazil', 'br']);
const NUM_AT_END = /^(.*?\S)\s*,?\s*(?:n[º°o]?\.?|num\.?|numero|número)?\s*(\d{1,5})(?:\s*-?\s*[a-z])?\s*$/i;
const NUM_AT_START = /^(?:n[º°o]?\.?|num\.?|numero|número)?\s*(\d{1,5})(?:\s*-?\s*[a-z](?![a-z]))?\s*(.*)$/i;

/**
 * "Rua Voluntários da Pátria, 1039, Floresta" · "Voluntários da Pátria 1039"
 * · "R. X nº 1039 - Floresta" · "Av. Ipiranga, 6681 - Partenon, Porto Alegre
 * - RS, 90619-900" → street, number and what came after. Null without a
 * house number ("s/n", or a street alone).
 */
export function parseAddress(raw: string): ParsedAddress | null {
  const s = raw
    .replace(/\b\d{5}-?\d{3}\b/g, ' ') // CEP
    .replace(/\bs\s*\/\s*n[º°o]?\b/gi, ' ') // "s/n"
    .replace(/\s+/g, ' ')
    .trim();
  const parts = s.split(/\s*[,;]\s*|\s+[-–—]\s+/).map(p => p.trim()).filter(Boolean);
  if (!parts.length) return null;

  let streetText: string | null = null;
  let number: number | null = null;
  let rest: string[] = [];

  const first = parts[0];
  const m = first.match(NUM_AT_END);
  if (m && /[a-z]/i.test(m[1])) {
    streetText = m[1];
    number = Number(m[2]);
    rest = parts.slice(1);
  } else if (parts.length > 1) {
    const m2 = parts[1].match(NUM_AT_START);
    if (m2) {
      streetText = first;
      number = Number(m2[1]);
      rest = [m2[2], ...parts.slice(2)];
    }
  }
  if (!streetText || !number) return null;

  streetText = streetText.replace(/[\s,.;-]+$/, '');
  const tokens = plainText(streetText).split(' ').filter(Boolean);
  let type: string | null = null;
  if (tokens.length > 1 && TYPES[tokens[0]]) {
    type = TYPES[tokens[0]];
    tokens.shift();
  }
  const key = streetKey(tokens.join(' '));
  if (!key) return null;
  return {
    streetText,
    type,
    key,
    number,
    rest: rest.map(r => r.trim()).filter(r => r && !NOISE.has(plainText(r))),
  };
}

// ---------------------------------------------------------------------------
// The index
// ---------------------------------------------------------------------------

/**
 * On disk (scripts/build-cnefe-index.ts): one row per street, its entries as
 * parallel arrays — numbers, bairro index, and lat/lng in 1e-5 degrees
 * delta-encoded within the street (gzip does the rest).
 */
export interface CnefeFile {
  source: string;
  municipality: string;
  bairros: string[];
  /** [type, title, name, numbers[], bairroIdx[], dLat[], dLng[]] */
  streets: Array<[string, string, string, number[], number[], number[], number[]]>;
}

interface Street {
  type: string;
  bairros: string[]; // index → display name
  nums: number[];
  bairro: number[];
  lat: number[];
  lng: number[];
}

export interface CnefeIndex {
  bairros: string[];
  bairroByKey: Map<string, number>;
  /** streetKey(title + name) → streets */
  byFull: Map<string, Street[]>;
  /** streetKey(name) when there is a title — for a query that drops it */
  byName: Map<string, Street[]>;
}

export function buildIndex(file: CnefeFile): CnefeIndex {
  const byFull = new Map<string, Street[]>();
  const byName = new Map<string, Street[]>();
  const push = (m: Map<string, Street[]>, k: string, st: Street) => {
    if (!k) return;
    const arr = m.get(k);
    if (arr) arr.push(st);
    else m.set(k, [st]);
  };
  for (const [type, title, name, nums, bairro, dLat, dLng] of file.streets) {
    const lat: number[] = new Array(nums.length);
    const lng: number[] = new Array(nums.length);
    let a = 0, b = 0;
    for (let i = 0; i < nums.length; i++) {
      a += dLat[i];
      b += dLng[i];
      lat[i] = a / 1e5;
      lng[i] = b / 1e5;
    }
    const st: Street = { type, bairros: file.bairros, nums, bairro, lat, lng };
    push(byFull, streetKey(`${title} ${name}`), st);
    if (title) push(byName, streetKey(name), st);
  }
  const bairroByKey = new Map(file.bairros.map((b, i) => [bairroKey(b), i] as const));
  return { bairros: file.bairros, bairroByKey, byFull, byName };
}

const DEFAULT_PATH = () => path.join(process.cwd(), 'knowledge', 'porto-alegre', 'cnefe-2022', 'addresses.json.gz');
let loaded: CnefeIndex | null | undefined;

/** The committed Porto Alegre index, read once. Null if the file is missing. */
export function loadCnefeIndex(file = DEFAULT_PATH()): CnefeIndex | null {
  if (loaded !== undefined && file === DEFAULT_PATH()) return loaded;
  let idx: CnefeIndex | null = null;
  try {
    if (existsSync(file)) idx = buildIndex(JSON.parse(gunzipSync(readFileSync(file)).toString('utf8')));
  } catch (e: any) {
    console.error('[cnefe] could not read the address index:', e?.message || e);
    idx = null;
  }
  if (file === DEFAULT_PATH()) loaded = idx;
  return idx;
}

// ---------------------------------------------------------------------------
// The lookup
// ---------------------------------------------------------------------------

export interface CnefeHit {
  lat: number;
  lng: number;
  /** What they typed, tidied: "Rua Voluntários da Pátria, 1039". */
  label: string;
  precise: true;
  source: typeof CNEFE_SOURCE;
  /** 'exact' = that number; 'nearest' = the closest number on the street. */
  match: 'exact' | 'nearest';
  /** The number the point is at (≠ the one asked when match is 'nearest'). */
  matchedNumber: number;
  /** The bairro IBGE records for that door. */
  bairro: string;
  /** They named a bairro and IBGE places the door in another. */
  bairroMismatch?: true;
}

export type CnefeMiss = { hit: null; reason: 'no-number' | 'unknown-street' | 'no-number-near' | 'ambiguous' | 'no-index' };

interface Cand { st: Street; i: number; diff: number; score: number }

function metres(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const k = 111_320;
  const dx = (aLng - bLng) * k * Math.cos(((aLat + bLat) / 2) * (Math.PI / 180));
  const dy = (aLat - bLat) * k;
  return Math.hypot(dx, dy);
}

/** Every entry on these streets within ±span of n, best first (closest number, then same side of the street). */
function candidates(streets: Street[], n: number, span: number, bairro: number | null): Cand[] {
  const out: Cand[] = [];
  for (const st of streets) {
    for (let i = 0; i < st.nums.length; i++) {
      const diff = Math.abs(st.nums[i] - n);
      if (diff > span) continue;
      if (bairro != null && st.bairro[i] !== bairro) continue;
      out.push({ st, i, diff, score: diff + (diff && (st.nums[i] - n) % 2 !== 0 ? 0.5 : 0) });
    }
  }
  return out.sort((a, b) => a.score - b.score);
}

/**
 * The best candidate, or 'ambiguous' when another candidate is a different
 * place. Twenty house numbers are a block or two, so a candidate hundreds of
 * metres away is another street with the same name (Porto Alegre has several
 * "Rua das Flores"; IBGE also records a second Voluntários da Pátria run in
 * Farrapos). An exact number found in only one place still wins; a NEAREST
 * number is only trusted when every nearby number is in that one place.
 */
function pick(cands: Cand[]): Cand | 'ambiguous' | null {
  if (!cands.length) return null;
  const best = cands[0];
  const rival = cands.find(c => metres(c.st.lat[c.i], c.st.lng[c.i], best.st.lat[best.i], best.st.lng[best.i]) > SAME_PLACE_M);
  return rival ? 'ambiguous' : best;
}

export function lookupCnefe(query: string, index: CnefeIndex | null = loadCnefeIndex()): CnefeHit | CnefeMiss {
  if (!index) return { hit: null, reason: 'no-index' };
  const p = parseAddress(query);
  if (!p) return { hit: null, reason: 'no-number' };

  let streets = index.byFull.get(p.key) ?? index.byName.get(p.key) ?? [];
  if (!streets.length) return { hit: null, reason: 'unknown-street' };
  if (p.type) {
    const sameType = streets.filter(s => s.type === p.type);
    if (sameType.length) streets = sameType;
  }

  // The bairro they named, if it is one IBGE knows.
  let bairro: number | null = null;
  for (const r of p.rest) {
    const b = index.bairroByKey.get(bairroKey(r));
    if (b != null) { bairro = b; break; }
  }

  // Their bairro first (exact, then nearest), then anywhere on the street.
  const tries: Array<[number, number | null]> = bairro != null
    ? [[0, bairro], [NEAREST_SPAN, bairro], [0, null], [NEAREST_SPAN, null]]
    : [[0, null], [NEAREST_SPAN, null]];
  let chosen: Cand | null = null;
  for (const [span, b] of tries) {
    const got = pick(candidates(streets, p.number, span, b));
    if (got === 'ambiguous') return { hit: null, reason: 'ambiguous' };
    if (got) { chosen = got; break; }
  }
  if (!chosen) return { hit: null, reason: 'no-number-near' };

  const { st, i } = chosen;
  const doorBairro = st.bairros[st.bairro[i]];
  return {
    lat: st.lat[i],
    lng: st.lng[i],
    label: `${p.streetText}, ${p.number}`,
    precise: true,
    source: CNEFE_SOURCE,
    match: st.nums[i] === p.number ? 'exact' : 'nearest',
    matchedNumber: st.nums[i],
    bairro: doorBairro,
    ...(bairro != null && st.bairro[i] !== bairro ? { bairroMismatch: true as const } : {}),
  };
}

export const isCnefeHit = (r: CnefeHit | CnefeMiss): r is CnefeHit => (r as CnefeMiss).hit !== null;

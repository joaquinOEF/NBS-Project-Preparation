// ============================================================================
// THE REDE'S PUBLICATION DATA — one ZIP, built live from the platform
// ============================================================================
// "Dados da publicação (ZIP)" beside "Todos os perfis (PDF)" (refine
// rede-publication-download-2026-11-16). Pins move on prod between deploys —
// three times on 16 Nov alone — so everything that CAN be computed here is
// computed at the click, from the records as they stand:
//   · organizacoes.csv — name, bairro, the project site's address and pin;
//   · dados_por_organizacao_300m.csv — the 2022 Census, SGB sectors, Guaíba
//     level and flooding points around each pin, plus the org's bairro row;
//   · contexto_porto_alegre/ — the city's disaster record and who lives in the
//     risk areas (exposure.json, scripts/city-exposure-stats.py);
//   · solucoes_SbN/ — the 27 solutions (catalog + fichas), printable page,
//     texts, photographs and before/after sketches;
//   · mapas/ — the ONE part that cannot be drawn here (matplotlib, offline):
//     the last upload (scripts/publication-maps.ts), with the pins it was drawn
//     from, and a warning in the LEIA-ME when a pin moved since.
//
// Coordinator-only. Vila Flores and every test copy (`excludeFromPortfolio`)
// stay out. Race appears only at city and bairro level, never per organisation.
// ============================================================================

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import JSZip from 'jszip';
import * as turf from '@turf/turf';
import { censusAround, censusBairroAt } from './censusContext';
import { cityMapFor } from './siteContext';
import { hazardAtPin } from './sgbPointHazard';
import { cityExposure } from './cityClimateContext';
import { recordPin } from '@shared/site-of-record';
import { worryLabel } from '@shared/w3-dossier';
import { NBS_FAMILIAS, NBS_SOLUTIONS, COMPLEXIDADE_LABEL, TIPO_LABEL } from '@shared/nbs-catalog';
import { getSolutionFicha } from '@shared/nbs-solution-fichas';
import { buildPublicationWorkbook } from './publicationXlsx';

export interface PublicationOrg {
  memberId: string;
  orgName: string;
  /** The cohort member's neighbourhood (the roster's). */
  neighborhood: string | null;
  /** intervention_site fields, values only. */
  site: Record<string, unknown>;
  /** The member's E2 site, when the record has no pin of its own. */
  memberSite?: { coordinates?: [number, number] } | null;
}

export interface PublicationPin { memberId: string; org: string; bairro: string; lat: number | null; lng: number | null; approx: boolean; /** Its number on the maps (set by the renderer). */ n?: number }

/** What the last map upload was drawn from (cohort.settings.publicationMaps). */
export interface MapsManifest { renderedAt: string; pins: PublicationPin[]; blobKey: string }

/** ~11 m — under this a pin has not moved (shared/site-of-record.ts). */
const SAME_PLACE_DEG = 0.0001;

const str = (v: unknown) => (v == null ? '' : String(v).trim());

/** The pin each organisation is drawn at: its record's, else its E2 site, else none (the map uses the bairro's centroid). */
export function publicationPins(orgs: PublicationOrg[]): PublicationPin[] {
  return orgs.map(o => {
    const pin = recordPin(o.site as any);
    const c = !pin && Array.isArray(o.memberSite?.coordinates) ? o.memberSite!.coordinates! : null;
    const lat = pin?.lat ?? c?.[0] ?? null, lng = pin?.lng ?? c?.[1] ?? null;
    return { memberId: o.memberId, org: o.orgName, bairro: str(o.site.bairro) || str(o.neighborhood), lat, lng, approx: lat == null };
  });
}

/** The pins that changed since the maps were drawn — moved, added, gone — as "Desabafa (ponto mudou)". */
export function staleMapReasons(manifest: MapsManifest | null | undefined, live: PublicationPin[]): string[] {
  if (!manifest) return ['nenhum mapa foi enviado ainda'];
  const was = new Map(manifest.pins.map(p => [p.memberId, p]));
  const out: string[] = [];
  for (const p of live) {
    const w = was.get(p.memberId);
    if (!w) { out.push(`${p.org} (entrou depois dos mapas)`); continue; }
    const moved = (p.lat == null) !== (w.lat == null)
      || (p.lat != null && w.lat != null && (Math.abs(p.lat - w.lat) > SAME_PLACE_DEG || Math.abs(p.lng! - w.lng!) > SAME_PLACE_DEG));
    if (moved) out.push(`${p.org} (ponto mudou)`);
  }
  const now = new Set(live.map(p => p.memberId));
  for (const w of manifest.pins) if (!now.has(w.memberId)) out.push(`${w.org} (saiu da rede)`);
  return out;
}

// ── CSV ────────────────────────────────────────────────────────────────────
function csv(rows: Array<Record<string, unknown>>, keys: string[]): string {
  const cell = (v: unknown) => { const s = v == null ? '' : String(v); return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  // BOM: Excel opens UTF-8 accents right.
  return '﻿' + [keys.join(','), ...rows.map(r => keys.map(k => cell(r[k])).join(','))].join('\n') + '\n';
}
const pct = (x: number | null | undefined) => (x == null ? '' : Math.round(100 * x));
const br = (n: number) => n.toLocaleString('pt-BR');

// ── SGB sectors within 300 m ───────────────────────────────────────────────
let sgb: Array<{ f: any; bbox: number[] }> | null = null;
function sgbSectors() {
  if (sgb) return sgb;
  const file = path.join(process.cwd(), 'knowledge', 'official-risk', 'porto-alegre', 'sgb-setorizacao.json');
  try {
    sgb = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')).features.filter((f: any) => f?.geometry && /Polygon/.test(f.geometry.type)).map((f: any) => ({ f, bbox: turf.bbox(f) })) : [];
  } catch { sgb = []; }
  return sgb!;
}
function sgbWithin(lat: number, lng: number, radiusM = 300) {
  const pt = turf.point([lng, lat]);
  const pad = radiusM / 111_000 * 1.5;
  const hits: Array<{ d: number; tipo: string; local: string }> = [];
  for (const { f, bbox } of sgbSectors()) {
    if (lng < bbox[0] - pad || lng > bbox[2] + pad || lat < bbox[1] - pad || lat > bbox[3] + pad) continue;
    let d = 0;
    if (!turf.booleanPointInPolygon(pt, f)) {
      const lines = turf.polygonToLine(f) as any;
      const parts = lines.type === 'FeatureCollection' ? lines.features : [lines];
      d = Math.min(...parts.map((l: any) => turf.pointToLineDistance(pt, l, { units: 'meters' })));
    }
    if (d <= radiusM) hits.push({ d: Math.round(d), tipo: str(f.properties?.tipolo_g1), local: str(f.properties?.local) });
  }
  return hits.sort((a, b) => a.d - b.d);
}

// ── the tables ─────────────────────────────────────────────────────────────
export const ORG_KEYS = ['numero_no_mapa', 'organizacao', 'bairro', 'endereco_do_projeto', 'nome_do_lugar', 'latitude', 'longitude', 'localizacao'];
export const KEYS_300M = ['organizacao', 'bairro', 'localizacao', 'moradores_300m', 'domicilios_300m', 'pct_domicilios_sem_esgoto_adequado',
  'pct_domicilios_em_rua_sem_arvores', 'renda_tipica_300m', 'dado_parcial_ibge', 'setores_risco_sgb_300m', 'sgb_tipos', 'sgb_mais_proximo',
  'mancha_de_inundacao_guaiba', 'ponto_de_alagamento_registrado', 'preocupacao_da_organizacao',
  'bairro_censo', 'bairro_moradores', 'bairro_moradores_abaixo_da_cheia_2024', 'bairro_pct_abaixo_da_cheia_2024',
  'bairro_moradores_em_setor_de_risco_sgb', 'bairro_renda_tipica'];
/**
 * The same three indicators at 1 km, plus the official hazard at the pin (Julia,
 * Rede SCbN, 25 Nov 2026: the organisations asked for their territory, not the
 * block). 1 km dilutes the street — Sementes da Vida Nova's homes without
 * adequate sewage read 94% at 300 m and 30% at 1 km — so both tables ship.
 */
export const KEYS_1KM = ['organizacao', 'bairro', 'localizacao', 'moradores_1km', 'domicilios_1km', 'pct_domicilios_sem_esgoto_adequado_1km',
  'pct_domicilios_em_rua_sem_arvores_1km', 'renda_tipica_1km', 'dado_parcial_ibge_1km', 'setores_risco_sgb_1km', 'sgb_tipos_1km', 'sgb_mais_proximo_1km',
  'inundacao_no_lugar_sgb', 'calor_no_lugar_plac', 'deslizamento_no_lugar_sgb', 'mancha_de_inundacao_guaiba'];

const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

/** Numbered as on the maps: the renderer's numbers when the maps hold every org, else north → south. */
function numbered(pins: PublicationPin[], manifest?: MapsManifest | null): Map<string, number> {
  const drawn = new Map((manifest?.pins ?? []).filter(p => p.n).map(p => [p.memberId, p.n!]));
  if (pins.length && pins.every(p => drawn.has(p.memberId))) return new Map(pins.map(p => [p.memberId, drawn.get(p.memberId)!]));
  return new Map([...pins].sort((a, b) => (b.lat ?? -99) - (a.lat ?? -99)).map((p, i) => [p.memberId, i + 1]));
}

export function orgTables(orgs: PublicationOrg[], manifest?: MapsManifest | null) {
  const pins = publicationPins(orgs);
  const num = numbered(pins, manifest);
  const bairros = new Map((cityExposure()?.bairros ?? []).map(b => [norm(b.bairro), b]));
  const orgRows: Array<Record<string, unknown>> = [];
  const rows300: Array<Record<string, unknown>> = [];
  const rows1km: Array<Record<string, unknown>> = [];
  for (const o of [...orgs].sort((a, b) => (num.get(a.memberId) ?? 99) - (num.get(b.memberId) ?? 99))) {
    const p = pins.find(x => x.memberId === o.memberId)!;
    const bairro = p.bairro;
    const where = p.lat == null ? 'falta marcar o lugar' : 'lugar do projeto (marcado)';
    orgRows.push({ numero_no_mapa: num.get(o.memberId), organizacao: o.orgName, bairro, endereco_do_projeto: str(o.site.site_address), nome_do_lugar: str(o.site.site_name),
      latitude: p.lat ?? '', longitude: p.lng ?? '', localizacao: where });
    const r: Record<string, unknown> = { organizacao: o.orgName, bairro, localizacao: where, preocupacao_da_organizacao: str(o.site.site_worry) ? worryLabel(str(o.site.site_worry), true) : '' };
    const k: Record<string, unknown> = { organizacao: o.orgName, bairro, localizacao: where };
    if (p.lat != null && p.lng != null) {
      const c = censusAround(p.lat, p.lng);
      if (c) Object.assign(r, { moradores_300m: c.people, domicilios_300m: c.homes, pct_domicilios_sem_esgoto_adequado: pct(c.noSewerShare),
        pct_domicilios_em_rua_sem_arvores: pct(c.noTreesShare), renda_tipica_300m: c.incomeMedian == null ? '' : Math.round(c.incomeMedian), dado_parcial_ibge: c.partial ? 'sim' : '' });
      const hits = sgbWithin(p.lat, p.lng);
      Object.assign(r, { setores_risco_sgb_300m: hits.length, sgb_tipos: Array.from(new Set(hits.map(h => h.tipo).filter(Boolean))).sort().join(', '),
        sgb_mais_proximo: hits[0] ? `${hits[0].local} (${hits[0].tipo}, ${hits[0].d === 0 ? 'no lugar' : `${hits[0].d} m`})` : '' });
      const map = cityMapFor({ _site_lat: String(p.lat), _site_lng: String(p.lng) });
      const cota = map.find(l => /cota de/.test(l.text));
      r.mancha_de_inundacao_guaiba = cota ? cota.text.split(' (')[0].replace('Fica dentro da mancha da ', '').replace(/\.$/, '') : 'fora das manchas mapeadas';
      r.ponto_de_alagamento_registrado = map.some(l => /Ponto de alagamento/i.test(l.text)) ? 'sim' : '';
      const c1 = censusAround(p.lat, p.lng, { radiusM: 1000 });
      if (c1) Object.assign(k, { moradores_1km: c1.people, domicilios_1km: c1.homes, pct_domicilios_sem_esgoto_adequado_1km: pct(c1.noSewerShare),
        pct_domicilios_em_rua_sem_arvores_1km: pct(c1.noTreesShare), renda_tipica_1km: c1.incomeMedian == null ? '' : Math.round(c1.incomeMedian), dado_parcial_ibge_1km: c1.partial ? 'sim' : '' });
      const hits1 = sgbWithin(p.lat, p.lng, 1000);
      const hz = Object.fromEntries(hazardAtPin(p.lat, p.lng).map(h => [h.hazard, h]));
      Object.assign(k, { setores_risco_sgb_1km: hits1.length, sgb_tipos_1km: Array.from(new Set(hits1.map(h => h.tipo).filter(Boolean))).sort().join(', '),
        sgb_mais_proximo_1km: hits1[0] ? `${hits1[0].local} (${hits1[0].tipo}, ${hits1[0].d === 0 ? 'no lugar' : `${hits1[0].d} m`})` : '',
        inundacao_no_lugar_sgb: hz.flood?.pt ?? '', calor_no_lugar_plac: hz.heat?.pt ?? '', deslizamento_no_lugar_sgb: hz.landslide?.pt ?? '',
        mancha_de_inundacao_guaiba: r.mancha_de_inundacao_guaiba });
      // Their bairro's row, so the reader finds it without opening the other table.
      const cb = censusBairroAt(p.lat, p.lng);
      const b = cb ? bairros.get(norm(cb)) : undefined;
      if (b) Object.assign(r, { bairro_censo: b.bairro, bairro_moradores: b.people, bairro_moradores_abaixo_da_cheia_2024: b.cota2024,
        bairro_pct_abaixo_da_cheia_2024: b.people ? Math.round(100 * b.cota2024 / b.people) : '', bairro_moradores_em_setor_de_risco_sgb: b.sgb, bairro_renda_tipica: b.incomeMedian ?? '' });
    }
    rows300.push(r);
    rows1km.push(k);
  }
  return { pins, orgRows, rows300, rows1km, orgsCsv: csv(orgRows, ORG_KEYS), csv300: csv(rows300, KEYS_300M), csv1km: csv(rows1km, KEYS_1KM) };
}

// ── the city's context ─────────────────────────────────────────────────────
/** S2ID / Atlas Digital de Desastres, Porto Alegre 1991–2025, consulted 11 Nov 2026 (the Rede's PDF). */
const S2ID = { records: 18, hydro: 13, meteo: 3, clim: 2, deaths: 5, injured: 416, displaced: 33_930, affected: 38_500, damageMi: 177, publicMi: 57, privateMi: 62, displaced2024: 20_100, displaced2015: 8_400, consulted: '11/11/2026' };

export const BAIRRO_KEYS = ['bairro', 'moradores_censo_2022', 'moradores_abaixo_da_cheia_2024', 'pct_abaixo_da_cheia_2024', 'moradores_em_setor_de_risco_sgb', 'moradores_ameaca_inundacao_arroios_alta_2050', 'pct_pretos_e_pardos', 'renda_tipica_responsavel_RS'];
/** One row per bairro — the city table (CSV in the ZIP, a tab in the workbook). */
export function bairroRows(): Array<Record<string, unknown>> {
  return (cityExposure()?.bairros ?? []).map(b => ({ bairro: b.bairro, moradores_censo_2022: b.people, moradores_abaixo_da_cheia_2024: b.cota2024,
    pct_abaixo_da_cheia_2024: b.people ? Math.round(100 * b.cota2024 / b.people) : '', moradores_em_setor_de_risco_sgb: b.sgb,
    moradores_ameaca_inundacao_arroios_alta_2050: b.arroios2050 ?? '', pct_pretos_e_pardos: pct(b.blackOrBrownShare), renda_tipica_responsavel_RS: b.incomeMedian ?? '' }));
}

export function cityContextFiles(generatedAt: string): Record<string, string> {
  const x = cityExposure();
  if (!x || !x.bairros) return {};
  const L = x.layers, q = x.incomeQuintiles;
  const k = (n: number) => `${br(Math.round(n / 1000))} mil`;
  const p = (s: number) => `${(100 * s).toFixed(s < 0.01 ? 2 : s < 0.1 ? 1 : 0).replace('.', ',')}%`;
  const ratio = q[4].sgbShare > 0 ? Math.round(q[0].sgbShare / q[4].sgbShare / 10) * 10 : null;
  const top = x.bairros.slice(0, 10).map(b => `${b.bairro.replace(/-/g, ' ')} (${k(b.cota2024)}${b.people && b.cota2024 / b.people > 0.95 ? ', o bairro inteiro' : ''})`).join(', ');
  const text = `PORTO ALEGRE — DESASTRES JÁ VIVIDOS, RISCO FUTURO E INJUSTIÇA CLIMÁTICA
Gerado pela plataforma em ${generatedAt} · cálculo de ${x.computedAt ?? '—'} (scripts/city-exposure-stats.py)

1. HISTÓRICO OFICIAL DE DESASTRES (S2ID / Atlas Digital de Desastres, MIDR, 1991–2025)
- ${S2ID.records} registros de desastre em Porto Alegre: ${S2ID.hydro} hidrológicos (inundações, enxurradas), ${S2ID.meteo} meteorológicos (chuvas intensas, vendavais, granizo) e ${S2ID.clim} climatológicos (estiagem).
- ${S2ID.deaths} óbitos (todos em 2024), ${S2ID.injured} feridos ou enfermos, ${k(S2ID.displaced)} desalojados e desabrigados, ${k(S2ID.affected)} diretamente afetados.
- Danos materiais de R$ ${S2ID.damageMi} mi; prejuízo público de R$ ${S2ID.publicMi} mi; prejuízo privado de R$ ${S2ID.privateMi} mi.
- 2024 concentra ${k(S2ID.displaced2024)} desalojados e desabrigados; 2015 vem em segundo, com ${k(S2ID.displaced2015)}.
⚠️ O S2ID só tem o que a prefeitura registrou nos formulários federais e, para 2024, fica muito abaixo do tamanho real da cheia (item 2). Citar como "registros oficiais" e usar o item 2 para a escala. Consultado em ${S2ID.consulted}.

2. ONDE A CHEIA DE 2024 CHEGOU (Censo 2022 × cota de 5,35 m da SMAMUS)
- Cerca de ${k(L.cota2024.people)} pessoas, ${p(L.cota2024.shareOfCity)} da cidade, moram abaixo do nível que o Guaíba atingiu em maio de 2024. A imagem de satélite de 6/5/2024 (Planet) mostra cerca de ${k(L.planet?.people ?? 0)} moradores em área efetivamente alagada naquele dia.
- Bairros com mais moradores abaixo desse nível: ${top}. Tabela completa: bairros_exposicao_e_perfil.csv.

3. RISCO FUTURO E DE TODO DIA
- Cerca de ${k(L.arroios2050?.people ?? 0)} pessoas moram onde a ameaça de inundação dos arroios em 2050 é alta ou muito alta (PLAC/ARVC).
- Cerca de ${k(L.sgb.people)} pessoas moram dentro de setores de risco mapeados pelo Serviço Geológico do Brasil (deslizamento, inundação, enxurrada, queda de blocos, erosão), com casas ameaçadas. O SGB mapeou só assentamentos precários: estar fora de um setor não quer dizer estar seguro.
- A ameaça de calor alta cobre quase toda a cidade, então ela não serve para comparar grupos.

4. ISSO MOSTRA INJUSTIÇA CLIMÁTICA? SIM, NO RISCO DE TODO DIA. A CHEIA DE 2024 FOI MAIS AMPLA.
Na cidade, ${p(x.city.blackOrBrownShare)} dos moradores são pretos ou pardos, e a renda típica do responsável pelo domicílio é de R$ ${br(x.city.incomeMedian ?? 0)}.
- Setores de risco do SGB: ${p(L.sgb.blackOrBrownShare)} de pretos e pardos e renda típica de R$ ${br(L.sgb.incomeMedian ?? 0)}. Entre os 20% de moradores mais pobres, ${p(q[0].sgbShare)} vivem num setor de risco; entre os 20% mais ricos, ${p(q[4].sgbShare)}${ratio ? ` (cerca de ${ratio} vezes mais)` : ''}.
- Ameaça alta de inundação dos arroios em 2050: ${p(L.arroios2050?.blackOrBrownShare ?? 0)} de pretos e pardos e renda típica de R$ ${br(L.arroios2050?.incomeMedian ?? 0)}.
- A cheia de 2024 atingiu as faixas de renda de forma parecida (${q.map(r => p(r.cota2024Share)).join(' · ')}, dos mais pobres aos mais ricos), e a proporção de pretos e pardos abaixo do nível (${p(L.cota2024.blackOrBrownShare)}) não é maior que a da cidade. A injustiça de 2024 não aparece em quem foi alagado; aparece em quem consegue se recuperar, e isso estes dados não medem.
Indicador sugerido: proporção de pretos e pardos e renda típica dentro das áreas de risco (setores do SGB, ameaça de inundação dos arroios), comparadas à cidade inteira. O PLAC/ARVC tem também um índice de exposição da população negra.

Fontes: IBGE, Censo 2022 por setor censitário (via GeoReDUS/CEM-USP); SMAMUS, cotas de inundação do Guaíba; Planet SkySat 6/5/2024 (zenodo.org/records/14662897); PLAC/ARVC 2023; SGB/CPRM, setorização de risco; MIDR, Atlas Digital de Desastres (S2ID).
Método: a população de cada setor censitário conta na proporção da área do setor dentro da área de risco. Renda típica = mediana, entre os moradores, da renda média do responsável pelo domicílio em cada setor.
`;
  const bairroCsv = csv(bairroRows(), BAIRRO_KEYS);
  return { 'contexto_porto_alegre/contexto_desastres_e_injustica_climatica.txt': text, 'contexto_porto_alegre/bairros_exposicao_e_perfil.csv': bairroCsv };
}

// ── the 27 solutions ───────────────────────────────────────────────────────
const esc = (s: unknown) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const slug = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');

/** The public assets folder: the repo's in dev, the build's in production. */
function assetsDir(): string | null {
  for (const d of [path.join(process.cwd(), 'client', 'public'), path.join(process.cwd(), 'dist', 'public')]) if (existsSync(path.join(d, 'assets'))) return d;
  return null;
}
const assetFile = (webPath: string | undefined | null) => {
  const d = assetsDir();
  if (!d || !webPath) return null;
  const f = path.join(d, webPath.replace(/^\//, ''));
  return existsSync(f) ? f : null;
};

export const SOLUTION_KEYS = ['numero', 'solucao', 'familia', 'complexidade', 'tipo', 'o_que_e', 'como_funciona', 'quanto_custa', 'quem_precisa_dizer_sim', 'quem_cuida_depois', 'fontes', 'foto'];
function solutionRow(s: any, n: number, f: any, ficha: any, foto: string): Record<string, unknown> {
  const fp = ficha?.pt ?? {};
  const cx = COMPLEXIDADE_LABEL[s.complexidade as keyof typeof COMPLEXIDADE_LABEL]?.pt, tp = TIPO_LABEL[s.tipo as keyof typeof TIPO_LABEL]?.pt;
  const srcs = (ficha?.sources ?? []).map((x: any) => (typeof x === 'string' ? x : x?.label ?? x?.title ?? x?.name ?? '')).filter(Boolean);
  return { numero: n, solucao: s.pt.label, familia: f?.pt.label ?? '', complexidade: cx?.label ?? '', tipo: tp?.label ?? '',
    o_que_e: s.pt.whatItIs ?? '', como_funciona: fp.comoFunciona ?? '', quanto_custa: fp.quantoCusta ?? '', quem_precisa_dizer_sim: fp.quemPrecisaDizerSim ?? '',
    quem_cuida_depois: fp.quemCuidaDepois ?? '', fontes: srcs.join(' · '), foto };
}
/** The solutions as rows, without reading any file — the workbook's tab. */
export function solutionRows(): Array<Record<string, unknown>> {
  const fam = new Map(NBS_FAMILIAS.map((f: any) => [f.id, f]));
  return NBS_SOLUTIONS.map((s: any, i: number) => solutionRow(s, i + 1, fam.get(s.familiaId), getSolutionFicha(s.id), ''));
}

export function solutionFiles(): Record<string, string | Buffer> {
  const files: Record<string, string | Buffer> = {};
  const fam = new Map(NBS_FAMILIAS.map((f: any, i: number) => [f.id, { ...f, n: i + 1 }]));
  const sols = NBS_SOLUTIONS.map((s: any, i: number) => ({ s, n: i + 1, f: fam.get(s.familiaId) as any, ficha: getSolutionFicha(s.id) as any }));
  const pad = (n: number) => String(n).padStart(2, '0');
  const photoName = (n: number, label: string) => `fotos_das_solucoes/${pad(n)}_${slug(label)}.jpg`;
  const sketch: Record<string, string> = {};
  for (const f of (NBS_FAMILIAS as unknown as any[])) {
    const n = (fam.get(f.id) as any).n;
    for (const [suffix, web] of [['a', f.croquiBefore], ['b', f.croqui]] as const) {
      const file = assetFile(web);
      if (!file) continue;
      const name = `croquis_antes_depois/${n}${suffix}_${slug(f.pt.label)}_${suffix === 'a' ? 'ANTES' : 'DEPOIS'}.jpg`;
      files[`solucoes_SbN/${name}`] = readFileSync(file);
      sketch[`${f.id}:${suffix}`] = name;
    }
  }
  const textRows: Array<Record<string, unknown>> = [];
  const body: string[] = [];
  body.push(`<section class=cover><h1>${NBS_SOLUTIONS.length} Soluções Baseadas na Natureza</h1><p class=sub>Rede SCbN POA · fichas da plataforma COUGAR</p><ol class=idx>${sols.map(({ s, n, f }) => `<li value=${n}><span style="color:${esc(f?.color)}">●</span> ${esc(s.pt.label)} <i>— ${esc(f?.pt.label)}</i></li>`).join('')}</ol><p class=note>"estimado" = valor ou órgão inferido por nós, não citado diretamente pela fonte. Para salvar em PDF: Arquivo → Imprimir → Salvar como PDF.</p></section>`);
  for (const f of (NBS_FAMILIAS as unknown as any[])) {
    const a = sketch[`${f.id}:a`], b = sketch[`${f.id}:b`];
    if (!a && !b) continue;
    const cap = f.croquiCaptions?.pt ?? {};
    const capBefore = cap.before ?? cap.antes ?? '', capAfter = cap.after ?? cap.depois ?? '';
    body.push(`<section class=fam><p class=eyebrow style="color:${esc(f.color)}">Família</p><h2>${esc(f.pt.label)}</h2><div class=pair>${a ? `<figure><span class=tag>ANTES</span><img src="${a}"><figcaption>${esc(capBefore)}</figcaption></figure>` : ''}${b ? `<figure><span class=tag>DEPOIS</span><img src="${b}"><figcaption>${esc(capAfter)}</figcaption></figure>` : ''}</div><p class=note>Ilustração esquemática — representa um tipo de intervenção, não um lugar real.</p></section>`);
  }
  for (const { s, n, f, ficha } of sols) {
    const photo = assetFile(`/assets/nbs/solutions/${s.id}.jpg`);
    const pname = photoName(n, s.pt.label);
    if (photo) files[`solucoes_SbN/${pname}`] = readFileSync(photo);
    const fp = ficha?.pt ?? {};
    const cx = COMPLEXIDADE_LABEL[s.complexidade as keyof typeof COMPLEXIDADE_LABEL]?.pt, tp = TIPO_LABEL[s.tipo as keyof typeof TIPO_LABEL]?.pt;
    const est = (on: boolean) => (on ? ' <span class=est>estimado</span>' : '');
    const h = (t: string, v: unknown, e = false) => (v ? `<h4>${t}${est(e)}</h4><p>${esc(v)}</p>` : '');
    const srcs = (ficha?.sources ?? []).map((x: any) => (typeof x === 'string' ? x : x?.label ?? x?.title ?? x?.name ?? '')).filter(Boolean);
    body.push(`<section class=sol>${photo ? `<div class=photo><img src="${pname}"></div><div class=cap><span>${s.exampleCity ? `📍 ${esc(s.exampleCity)}` : ''}</span><span>Foto: cartas da Rede SCbN de POA</span></div>` : ''}<p class=eyebrow style="color:${esc(f?.color)}">${n} · ${esc(f?.pt.label)}</p><h3>${esc(s.pt.label)}</h3><p class=cx><b>Complexidade: ${esc(cx?.label)}</b> — ${esc(cx?.detail)} · <b>${esc(tp?.label)}</b> — ${esc(tp?.detail)}</p>${h('O que é?', s.pt.whatItIs)}${h('Como funciona', fp.comoFunciona)}${h('Quanto custa', fp.quantoCusta, !!ficha?.custoEstimado)}${h('Quem precisa dizer sim', fp.quemPrecisaDizerSim, !!ficha?.autorizacaoEstimada)}${h('Quem cuida depois', fp.quemCuidaDepois)}${srcs.length ? `<p class=src>Fontes: ${esc(srcs.join(' · '))}</p>` : ''}</section>`);
    textRows.push(solutionRow(s, n, f, ficha, photo ? pname : ''));
  }
  const css = '@page{size:A4;margin:14mm 15mm}body{font-family:Inter,-apple-system,Helvetica,Arial,sans-serif;color:#1c1c1c;font-size:10.2pt;line-height:1.45;margin:0 auto;max-width:180mm}section{page-break-after:always;padding:6mm 0}h1{font-size:26pt;margin:20mm 0 2mm}h2{font-size:20pt;margin:0 0 6mm}h3{font-size:16pt;margin:0 0 1mm}.sub{color:#666;font-size:12pt;margin:0 0 10mm}.idx{columns:2;font-size:9.5pt;line-height:1.7;padding-left:6mm}.idx i{color:#888;font-style:normal;font-size:8pt}.note{color:#777;font-size:8.5pt;margin-top:8mm}.eyebrow{font-size:8.5pt;font-weight:700;text-transform:uppercase;letter-spacing:.06em;margin:4mm 0 1mm}.pair{display:flex;gap:5mm}.pair figure{margin:0;flex:1;position:relative;background:#f8f4ea;border:1px solid #e2d9c4;border-radius:3mm;padding:3mm}.pair img{width:100%;display:block;border-radius:1.5mm}.pair figcaption{font-size:9pt;color:#555;margin-top:2mm}.tag{position:absolute;top:5mm;left:5mm;background:#fff;border-radius:2mm;padding:.5mm 2mm;font-size:7.5pt;font-weight:700;color:#555}.photo{height:62mm;overflow:hidden;border-radius:2mm 2mm 0 0;background:#eee}.photo img{width:100%;height:100%;object-fit:cover}.cap{display:flex;justify-content:space-between;font-size:7.5pt;color:#888;background:#f3f3f3;padding:1mm 2mm;border-radius:0 0 2mm 2mm}.cx{color:#555;font-size:9pt;margin:2mm 0 3mm}h4{font-size:8pt;text-transform:uppercase;letter-spacing:.05em;color:#777;margin:3.5mm 0 .8mm}h4+p{margin:0}.est{background:#fdecc8;color:#8a5a00;font-size:6.5pt;border-radius:1mm;padding:.2mm 1.2mm;text-transform:lowercase;letter-spacing:0}.src{color:#888;font-size:7.5pt;margin-top:5mm;border-top:1px solid #eee;padding-top:2mm}';
  files['solucoes_SbN/27_solucoes_SbN.html'] = `<!doctype html><html lang=pt><meta charset=utf-8><title>${NBS_SOLUTIONS.length} Soluções Baseadas na Natureza</title><style>${css}</style>${body.join('\n')}</html>`;
  files['solucoes_SbN/27_solucoes_textos.csv'] = csv(textRows, SOLUTION_KEYS);
  return files;
}

// ── the maps ───────────────────────────────────────────────────────────────
// Landslide and flood are SGB/CPRM susceptibility since 24 Nov 2026 (Julia, Rede
// SCbN: the ARVC landslide layer painted most of the city "alta"); heat stays
// PLAC/ARVC, today and 2050. See docs/sgb-suscetibilidade.md.
export const MAPS_LINE = 'Suscetibilidade a deslizamentos e a inundação (Serviço Geológico do Brasil, SGB/CPRM) e ameaça de ondas de calor (PLAC/ARVC, no período atual 1995–2014 e em 2050, na mesma escala) — dados oficiais; PNG e PDF com legenda, e PNG sem legenda para a diagramação. Cada mapa vem em duas versões: com as organizações numeradas e, na pasta sem_organizacoes/, o mesmo mapa sem elas.';

/** Just the maps, from the last upload — the "Mapas (ZIP)" button. Null when none was uploaded. */
export async function buildMapsZip(maps: { manifest: MapsManifest; zip: Buffer }, live: PublicationPin[]): Promise<Buffer> {
  const out = new JSZip();
  const inner = await JSZip.loadAsync(maps.zip);
  for (const [name, f] of Object.entries(inner.files)) if (!f.dir && !/(^|\/)(manifest|numbers)\.json$/.test(name)) out.file(name.replace(/^mapas\//, ''), await f.async('nodebuffer'));
  const drawn = new Date(maps.manifest.renderedAt).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'short' });
  const stale = staleMapReasons(maps.manifest, live);
  out.file('LEIA-ME.txt', `MAPAS DE SUSCETIBILIDADE E AMEAÇA — Rede SCbN POA
${MAPS_LINE}
Desenhados em ${drawn}.${stale.length ? ` ⚠️ DESATUALIZADOS: ${stale.join('; ')}. Peça para gerar de novo antes de publicar.` : ' Com os pontos atuais de todas as organizações.'}

- inundacao: suscetibilidade a inundação pelos arroios e pelo Guaíba numa camada só (SGB/CPRM, carta de 2015) + a linha do nível do Guaíba na cheia de maio de 2024 (5,35 m, SMAMUS). Alagamento por chuva (drenagem) não está mapeado.
- deslizamentos: suscetibilidade a deslizamentos (SGB/CPRM, carta de 2015; média e alta em cor, o resto é baixa) + setores de risco vistoriados em campo pelo SGB (2022).
- ilhas_de_calor: ameaça de ondas de calor (PLAC/ARVC). As cores mostram a ameaça relativa dentro do município; atual e 2050 usam a mesma escala, então a diferença de cor entre os dois é a mudança projetada.
Suscetibilidade = o quanto o terreno favorece o processo; não tem cenário climático.
`);
  return out.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
}

// ── the ZIP ────────────────────────────────────────────────────────────────
export async function buildPublicationZip(orgs: PublicationOrg[], opts: { cohortName: string | null; maps: { manifest: MapsManifest; zip: Buffer } | null; now?: Date }): Promise<Buffer> {
  const now = opts.now ?? new Date();
  const stamp = now.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'short' });
  const zip = new JSZip();
  const tables = orgTables(orgs, opts.maps?.manifest);
  const { pins, orgsCsv, csv300, csv1km } = tables;
  zip.file('organizacoes.csv', orgsCsv);
  zip.file('dados_por_organizacao_300m.csv', csv300);
  zip.file('dados_por_organizacao_1km.csv', csv1km);
  zip.file('dados_da_publicacao.xlsx', await buildPublicationWorkbook(tables, { cohortName: opts.cohortName, stamp }));
  for (const [name, body] of Object.entries(cityContextFiles(stamp))) zip.file(name, body);
  for (const [name, body] of Object.entries(solutionFiles())) zip.file(name, body);
  let mapsLine = 'mapas/ — ainda não há mapas enviados para esta rede.';
  if (opts.maps) {
    const inner = await JSZip.loadAsync(opts.maps.zip);
    for (const [name, f] of Object.entries(inner.files)) if (!f.dir && !/(^|\/)(manifest|numbers)\.json$/.test(name)) zip.file(`mapas/${name.replace(/^mapas\//, '')}`, await f.async('nodebuffer'));
    const stale = staleMapReasons(opts.maps.manifest, pins);
    const drawn = new Date(opts.maps.manifest.renderedAt).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'short' });
    mapsLine = stale.length
      ? `mapas/ — ${MAPS_LINE} Desenhados em ${drawn}. ⚠️ DESATUALIZADOS: ${stale.join('; ')}. Peça para gerar de novo antes de publicar.`
      : `mapas/ — ${MAPS_LINE} Desenhados em ${drawn}, com os pontos atuais de todas as organizações.`;
  }
  zip.file('LEIA-ME.txt', `DADOS DA PUBLICAÇÃO — ${opts.cohortName ?? 'Rede SCbN POA'}
Gerado pela plataforma em ${stamp}, a partir dos pontos e respostas atuais de cada organização.

- organizacoes.csv — as ${orgs.length} organizações, numeradas como nos mapas (norte → sul): bairro, endereço e coordenadas do lugar do projeto.
- dados_da_publicacao.xlsx — as mesmas tabelas numa planilha do Excel, com cabeçalhos por extenso e uma aba explicando cada coluna.
- dados_por_organizacao_300m.csv — em volta de cada lugar (raio de 300 m): moradores e domicílios (Censo 2022), esgoto, ruas sem árvores, renda típica do responsável pelo domicílio (mediana, entre os setores censitários a até ~300 m, da renda média de cada setor — por isso duas organizações do mesmo bairro têm valores diferentes), setores de risco do SGB, cota do Guaíba, ponto de alagamento, a preocupação da organização; e, nas colunas "bairro_…", os números do bairro onde fica o lugar.
- dados_por_organizacao_1km.csv — os mesmos indicadores (esgoto, ruas sem árvores, renda típica) a até 1 km, os setores de risco do SGB a até 1 km e as ameaças no lugar: inundação e deslizamento pela suscetibilidade do SGB, calor pelo PLAC/ARVC. Com 1 km o retrato é do território, mas a rua do projeto se dilui; compare com a tabela de 300 m.
- contexto_porto_alegre/ — desastres já vividos (S2ID), onde a cheia de 2024 chegou, quem mora nas áreas de risco (injustiça climática), e a tabela por bairro.
- solucoes_SbN/ — as ${NBS_SOLUTIONS.length} soluções: página para imprimir (abra o .html no navegador → Imprimir → Salvar como PDF), textos em CSV, fotos e croquis antes/depois.
- ${mapsLine}

Os números de raça aparecem só por cidade e por bairro, nunca por organização.
`);
  return zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
}

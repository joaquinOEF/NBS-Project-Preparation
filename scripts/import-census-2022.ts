/**
 * Import Porto Alegre's 2022 Census (per tract) and the services around it.
 *
 *   npm run census:import
 *
 * Source: GeoReDUS (redus.org.br), whose open PostgREST API serves IBGE's
 * Censo 2022 aggregates per setor censitário as organised by CEM/USP, plus
 * CNES health units, INEP public schools, and INCRA/FUNAI territories. Decided
 * 23 Oct 2026 (docs/census-2022.md): a SNAPSHOT, never a runtime call — the
 * host is labelled `dev-`, has no published terms, and the census will not
 * change until 2032. Every figure is cited to its ORIGINAL source.
 *
 * Writes knowledge/porto-alegre/census-2022/:
 *   tracts.geojson.gz    2,744 tract polygons {s: cd_setor, b: bairro}
 *   stats.json.gz        per tract: people, ages, pretos+pardos, households,
 *                        income, street trees, sewage (null = IBGE withheld)
 *   services.geojson.gz  UBS / hospitals / emergency units (CNES) and public
 *                        schools (INEP) — names and kind only, no contacts
 *   territories.geojson.gz  quilombos (INCRA) and indigenous lands (FUNAI)
 *                        that touch the city
 *   manifest.json        sources, counts, the checks below, the date
 *
 * ⚠️ The checks are the point (they caught two misreadings while this was
 * built: a population column that summed to 558,762, and a sewage column that
 * counts homes WITHOUT adequate sewage). The import fails, writing nothing,
 * unless people sum to IBGE's published total for the city and every tract
 * has its stats.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import path from 'node:path';

const API = 'https://dev-geoapi-metadata.orioro.design';
const CD_MUN = '4314902';
/** IBGE, Censo 2022, população residente — Porto Alegre. */
const IBGE_POPULATION = 1_332_845;
const BBOX = { w: -51.33, s: -30.27, e: -51.0, n: -29.93 };
const OUT = path.join(process.cwd(), 'knowledge', 'porto-alegre', 'census-2022');

async function get(table: string, query: string, geo = false): Promise<any> {
  const url = `${API}/${table}?${query}`;
  for (let attempt = 1; attempt <= 3; attempt++) {
    const r = await fetch(url, { headers: { Accept: geo ? 'application/geo+json' : 'application/json' }, signal: AbortSignal.timeout(180_000) });
    if (r.ok) return r.json();
    console.warn(`  ${table}: HTTP ${r.status} (attempt ${attempt})`);
  }
  throw new Error(`${table}: failed after 3 attempts`);
}

const round = (g: any): any => (typeof g[0] === 'number' ? [Math.round(g[0] * 1e5) / 1e5, Math.round(g[1] * 1e5) / 1e5] : g.map(round));
const geometry = (g: any) => ({ type: g.type, coordinates: round(g.coordinates) });
const n = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);

function touchesBbox(g: any): boolean {
  let w = Infinity, s = Infinity, e = -Infinity, nn = -Infinity;
  const walk = (c: any) => { if (typeof c[0] === 'number') { w = Math.min(w, c[0]); e = Math.max(e, c[0]); s = Math.min(s, c[1]); nn = Math.max(nn, c[1]); } else c.forEach(walk); };
  walk(g.coordinates);
  return e > BBOX.w && w < BBOX.e && nn > BBOX.s && s < BBOX.n;
}

async function main() {
  const m = `cd_mun=eq.${CD_MUN}`;
  console.log('Tracts…');
  const tracts = await get('ibge_malha_br_setor_censitario_2022', `${m}&select=cd_setor,nm_bairro,geom`, true);
  console.log('Population, income, households, surroundings…');
  const pop: any[] = await get('cem_censo_2022_populacao', `${m}&select=cd_setor,cn22_pop01_res_tot_0,cn22_pop03_0a4_tot_0,cn22_pop03_5a9_tot_0,cn22_pop03_10a14_tot_0,cn22_pop03_m60_tot_1,cn22_pop01_res_cor_neg_1`);
  const income: any[] = await get('cem_censo_2022_renda', `${m}&select=cd_setor,cn22_pop05_rsp_tot_0`);
  const services: any[] = await get('cem_censo_2022_servicos', `${m}&select=cd_setor,cn22_dom02_dppo_tot_0,cn22_ser02_sesg_tot_dom_1`);
  const around: any[] = await get('cem_censo_2022_variaveis_abr_25', `${m}&select=cd_setor,dom_sem_arb_pct`);
  console.log('Health units, schools, territories…');
  const health = await get('cem_malha_estabelecimentos_saude_2026', `id_municipio_gestor_2026=eq.${CD_MUN}&select=str_tipo_estabelecimento,str_nome_fantasia,geom`, true);
  const schools = await get('cem_malha_escolas_publicas_2025', `id_municipio=eq.${CD_MUN}&tp_dependencia=neq.Privada&select=no_escola,tp_dependencia,in25_edu02_mat_tot_0,geom`, true);
  const quilombos = await get('incra_malha_quilombos_2024', 'select=name,fase,nr_familia,geom', true);
  // Fresh-food shops (Overture): patchy in the periphery and sometimes
  // miscategorised, so only confidence ≥ 0.7, and only ever shown as NAMED
  // places nearby — never a count, never a "food desert" claim.
  const food = [
    ...(await get('overture_br_places_hortifrutis', `municipio_id=eq.${CD_MUN}&confidence=gte.0.7&select=names,category,geom`, true)).features,
    ...(await get('overture_br_places_supermercados', `municipio_id=eq.${CD_MUN}&confidence=gte.0.7&select=names,category,geom`, true)).features,
  ];
  const indigenous = await get('funai_malha_terras_indigenas_2024', 'select=name,fase_ti,etnia_nome,geom', true);

  const by = <T extends { cd_setor: string }>(rows: T[]) => new Map(rows.map(r => [r.cd_setor, r]));
  const P = by(pop), R = by(income), S = by(services), A = by(around);
  const stats: Record<string, Record<string, number | null>> = {};
  for (const f of tracts.features) {
    const id = f.properties.cd_setor;
    const p = P.get(id), r = R.get(id), s = S.get(id), a = A.get(id);
    stats[id] = {
      p: n(p?.cn22_pop01_res_tot_0),
      // Children 0–14 = three IBGE bands; any band withheld → the sum is withheld.
      c: [p?.cn22_pop03_0a4_tot_0, p?.cn22_pop03_5a9_tot_0, p?.cn22_pop03_10a14_tot_0].every(v => n(v) !== null)
        ? n(p.cn22_pop03_0a4_tot_0)! + n(p.cn22_pop03_5a9_tot_0)! + n(p.cn22_pop03_10a14_tot_0)! : null,
      e: n(p?.cn22_pop03_m60_tot_1),
      // Pretos + pardos ("negra" in CEM's naming). Coordination views only.
      pp: n(p?.cn22_pop01_res_cor_neg_1),
      d: n(s?.cn22_dom02_dppo_tot_0),
      // Average income of the household head (R$) — the tract's own figure.
      r: n(r?.cn22_pop05_rsp_tot_0),
      // Share of homes on a street face with no trees (IBGE "entorno").
      t: n(a?.dom_sem_arb_pct),
      // Homes WITHOUT adequate sewage = all permanent homes − those on the
      // network or a septic tank (CEM computes it; `sesg` = sem esgoto).
      w: n(s?.cn22_ser02_sesg_tot_dom_1),
    };
  }

  // ── Checks: nothing is written unless all pass ────────────────────────────
  const total = Object.values(stats).reduce((acc, x) => acc + (x.p ?? 0), 0);
  const missingStats = Object.entries(stats).filter(([, x]) => x.p === null).length;
  const checks = [
    { check: `people sum to IBGE's total for Porto Alegre (${IBGE_POPULATION})`, ok: total === IBGE_POPULATION, got: total },
    { check: 'every tract has a population figure', ok: missingStats === 0, got: missingStats },
    { check: 'tract count is 2,744 (IBGE malha 2022)', ok: tracts.features.length === 2744, got: tracts.features.length },
    { check: 'homes without sewage never exceed homes', ok: Object.values(stats).every(x => x.w === null || x.d === null || x.w <= x.d), got: null },
    { check: 'street-tree shares are between 0 and 1', ok: Object.values(stats).every(x => x.t === null || (x.t >= 0 && x.t <= 1)), got: null },
  ];
  for (const c of checks) console.log(`${c.ok ? '✓' : '✗'} ${c.check}${c.got !== null ? ` — got ${c.got}` : ''}`);
  if (checks.some(c => !c.ok)) { console.error('Checks failed — nothing written.'); process.exit(1); }

  const fc = (features: any[]) => ({ type: 'FeatureCollection', features });
  const keepKinds = new Set(['UNIDADE BASICA DE SAUDE', 'HOSPITAL', 'PRONTO ATENDIMENTO']);
  const svc = [
    ...health.features.filter((f: any) => f.geometry && keepKinds.has(f.properties.str_tipo_estabelecimento)).map((f: any) => ({
      type: 'Feature', geometry: geometry(f.geometry),
      properties: { kind: f.properties.str_tipo_estabelecimento === 'UNIDADE BASICA DE SAUDE' ? 'ubs' : f.properties.str_tipo_estabelecimento === 'HOSPITAL' ? 'hospital' : 'pronto-atendimento', name: f.properties.str_nome_fantasia, source: 'CNES 2026' },
    })),
    ...food.filter((f: any) => f.geometry && f.properties?.names?.primary).map((f: any) => ({
      type: 'Feature', geometry: geometry(f.geometry),
      properties: { kind: 'alimento', name: f.properties.names.primary, source: 'Overture Maps 2025 (estabelecimentos)' },
    })),
    ...schools.features.filter((f: any) => f.geometry).map((f: any) => ({
      type: 'Feature', geometry: geometry(f.geometry),
      properties: { kind: 'escola', name: f.properties.no_escola, network: f.properties.tp_dependencia, students: n(f.properties.in25_edu02_mat_tot_0), source: 'INEP, Censo Escolar 2025' },
    })),
  ];
  const terr = [
    ...quilombos.features.filter((f: any) => f.geometry && touchesBbox(f.geometry)).map((f: any) => ({
      type: 'Feature', geometry: geometry(f.geometry), properties: { kind: 'quilombo', name: f.properties.name, phase: f.properties.fase, families: f.properties.nr_familia, source: 'INCRA 2024' },
    })),
    ...indigenous.features.filter((f: any) => f.geometry && touchesBbox(f.geometry)).map((f: any) => ({
      type: 'Feature', geometry: geometry(f.geometry), properties: { kind: 'terra-indigena', name: f.properties.name, phase: f.properties.fase_ti, people: f.properties.etnia_nome, source: 'FUNAI 2024' },
    })),
  ];

  mkdirSync(OUT, { recursive: true });
  const gz = (file: string, data: unknown) => writeFileSync(path.join(OUT, file), gzipSync(JSON.stringify(data)));
  gz('tracts.geojson.gz', fc(tracts.features.map((f: any) => ({ type: 'Feature', geometry: geometry(f.geometry), properties: { s: f.properties.cd_setor, b: f.properties.nm_bairro } }))));
  gz('stats.json.gz', stats);
  gz('services.geojson.gz', fc(svc));
  gz('territories.geojson.gz', fc(terr));
  writeFileSync(path.join(OUT, 'manifest.json'), JSON.stringify({
    importedAt: new Date().toISOString().slice(0, 10),
    via: `GeoReDUS open API (${API}) — CEM/USP's organisation of public data`,
    sources: {
      census: 'IBGE, Censo Demográfico 2022 — agregados por setor censitário (população, domicílios, renda, entorno)',
      health: 'CNES (Ministério da Saúde), 2026',
      schools: 'INEP, Censo Escolar 2025 — public schools only',
      food: 'Overture Maps places (hortifrútis, mercados) — confidence ≥ 0.7, names only',
      territories: 'INCRA (quilombos, 2024) and FUNAI (terras indígenas, 2024)',
    },
    counts: { tracts: tracts.features.length, people: total, services: svc.length, territories: terr.length },
    withheld: Object.fromEntries(['c', 'e', 'pp', 'r', 't', 'w'].map(k => [k, Object.values(stats).filter(x => x[k] === null).length])),
    checks,
  }, null, 2) + '\n');
  console.log(`Wrote ${OUT}: ${tracts.features.length} tracts, ${svc.length} services, ${terr.length} territories.`);
}

main().catch(err => { console.error(err); process.exit(1); });

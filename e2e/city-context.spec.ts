import { test, expect } from '@playwright/test';
import { readFileSync, readdirSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import path from 'node:path';
import * as turf from '@turf/turf';
import { siteFacts, sitePoint, cityMapFor } from '../server/services/siteContext';
import { searchCityDocs, cityPassageCount, tokens } from '../server/services/cityDocs';
import { loadPlanCorpus, parseCsv } from '../server/services/planCorpus';
import { seedQueries, verifyLinks } from '../server/services/planLinks';
import { CITY_LAYERS } from '../shared/city-layers';
import { buildPrenote, prenoteInputFromSections } from '../shared/e4-prenote';
import { buildConceptNote } from '../shared/concept-note';
import { createEmptyCboState } from '../shared/cbo-schema';
import { reasonFor, distance, DEFAULT_PREFS, type PortfolioOrg } from '../shared/preportfolio';
import { siteGroupsFor } from '../server/services/siteContext';

// THE CITY CONTEXT BASE (scripts/import-city-folder.ts → knowledge/porto-alegre/city).
// What the city's maps say at a site reaches the pre-note and the concept note
// as sourced lines; the long documents are searched, not truncated; and every
// file in the coordination's folder is accounted for.

const CITY = path.join(process.cwd(), 'knowledge', 'porto-alegre', 'city');
const layer = (id: string) => JSON.parse(gunzipSync(readFileSync(path.join(CITY, 'layers', `${id}.geojson.gz`))).toString('utf8'));
const inside = (f: any): [number, number] => {
  const p = turf.pointOnFeature(f).geometry.coordinates;
  return [p[1], p[0]];
};

test.describe('the city context base — what was imported', () => {
  test('every file in the folder is in the manifest: read, or declined with a reason', () => {
    const m = JSON.parse(readFileSync(path.join(CITY, 'manifest.json'), 'utf8'));
    expect(m.docs.length).toBeGreaterThan(40);
    expect(m.layers.length).toBe(readdirSync(path.join(CITY, 'layers')).length);
    for (const s of m.skipped) expect(s.reason.length, s.file).toBeGreaterThan(15);
    // Every registered layer that came in is on disk, and no layer is on disk that the registry does not know.
    for (const l of m.layers) expect(CITY_LAYERS.some(r => r.id === l.id), l.id).toBe(true);
  });

  test('⚠️ the repository is public: the initiatives sheet arrives without contacts', () => {
    const csv = readFileSync(path.join(process.cwd(), 'knowledge', 'porto-alegre', 'plans', 'iniciativas.csv'), 'utf8');
    const [header, ...rows] = parseCsv(csv);
    const i = header.findIndex(h => /^contato/i.test(h.trim()));
    expect(i).toBeGreaterThanOrEqual(0);
    for (const r of rows) expect(r[i] ?? '', r[0]).toBe('');
    expect(csv).not.toMatch(/[\w.+-]+@[\w-]+\.[\w.]+|\(\d{2}\)\s?\d{4,5}-?\d{4}/);
  });

  test('no passage is a model apology instead of a label', () => {
    for (const f of readdirSync(path.join(CITY, 'docs')).slice(0, 25)) {
      const d = JSON.parse(gunzipSync(readFileSync(path.join(CITY, 'docs', f))).toString('utf8'));
      for (const c of d.chunks) if (c.ctx) expect(c.ctx, `${d.id} p.${c.page}`).not.toMatch(/^(não (há|consigo)|nenhum trecho)/i);
    }
  });
});

test.describe('what the city maps say at one site', () => {
  test('a point inside a polder says which polder, with the layer as its source', () => {
    const f = layer('polder').features.find((x: any) => x.properties.nome);
    const [lat, lng] = inside(f);
    const facts = siteFacts(lat, lng);
    const line = facts.find(x => x.layerId === 'polder');
    expect(line?.text).toContain(f.properties.nome);
    expect(line?.source).toMatch(/Pôlderes do Sistema de Proteção contra Cheias/);
  });

  test('flood levels: only the LOWEST level whose footprint holds the site', () => {
    const levels = layer('cotas-inundacao').features.sort((a: any, b: any) => a.properties.contourmax - b.properties.contourmax);
    const low = levels[0];
    const [lat, lng] = inside(low);
    const lines = siteFacts(lat, lng).filter(x => x.layerId === 'cotas-inundacao');
    expect(lines).toHaveLength(1);
    const m = Number(/cota de ([\d,]+) m/.exec(lines[0].text)?.[1].replace(',', '.'));
    expect(m).toBeLessThanOrEqual(low.properties.contourmax / 100 + 1e-9);
  });

  test('"near" layers name the distance, and never more than three per layer', () => {
    const f = layer('centro-4d').features[0];
    const [lat, lng] = inside(f);
    const near = siteFacts(lat, lng).filter(x => x.layerId === 'centro-4d');
    expect(near.length).toBeGreaterThan(0);
    expect(near.length).toBeLessThanOrEqual(3);
    expect(near[0].text).toMatch(/\((no próprio lugar|a cerca de \d+ m)\)\.$/);
  });

  test('no site, a site outside Porto Alegre, or junk coordinates: no lines', () => {
    expect(sitePoint({})).toBeNull();
    expect(sitePoint({ site_lat: '-23.55', site_lng: '-46.63' })).toBeNull();
    expect(sitePoint({ site_lat: 'abc', site_lng: '-51.2' })).toBeNull();
    expect(cityMapFor({ site_lat: '0', site_lng: '0' })).toEqual([]);
    expect(sitePoint({ _site_lat: '-30.02', _site_lng: '-51.20' })).toEqual({ lat: -30.02, lng: -51.2 });
  });

  test('every line is written register: third person, no "vocês"', () => {
    const f = layer('polder').features[0];
    const [lat, lng] = inside(f);
    for (const x of siteFacts(lat, lng)) expect(x.text, x.layerId).not.toMatch(/\bvocês\b|\ba gente\b/i);
  });
});

const sections = (extra: Record<string, string> = {}) => {
  const s = createEmptyCboState('porto-alegre');
  const set = (sec: string, k: string, v: string) => { (s.sections as any)[sec].fields[k] = { value: v, confidence: 'high', source: 'user', userEdited: false }; };
  set('org_profile', 'org_name', 'Coletivo Teste');
  set('intervention_site', 'bairro', 'Floresta');
  set('intervention_site', 'site_worry', 'alagamento');
  set('intervention_type', 'solution_tests_json', JSON.stringify([{ solutionId: 'jardins-de-chuva', reaction: 'faz-sentido', areaM2: 100, testedAt: 'x' }]));
  for (const [k, v] of Object.entries(extra)) set('intervention_site', k, v);
  return s.sections;
};

test.describe('the map lines reach the documents', () => {
  const cityMap = [
    { text: 'Está no Pôlder EBAP 09 do Sistema de Proteção contra Cheias.', source: 'DMAE / SMAMUS — Pôlderes do Sistema de Proteção contra Cheias' },
    { text: 'Bacia do Arroio Dilúvio, sub-bacia D-25.', source: 'SMAMUS — Sub-bacias hidrográficas' },
  ];

  test('the pre-note gets its own section right after the problem, each line with its layer', () => {
    const p = buildPrenote({ ...prenoteInputFromSections(sections()), cityMap });
    const ids = p.sections.map(s => s.id);
    expect(ids.indexOf('territorio')).toBe(ids.indexOf('problema') + 1);
    const t = p.sections.find(s => s.id === 'territorio')!;
    expect(t.title).toBe('O lugar nos mapas da cidade');
    expect(t.lines.map(l => l.source)).toEqual(cityMap.map(x => x.source));
    // Said once: the concept note prints them under the organisation too, and the pre-note does not repeat them there.
    const org = p.sections.find(s => s.id === 'organizacao');
    expect((org?.lines ?? []).some(l => /Pôlder EBAP 09|segundo os mapas/.test(l.text))).toBe(false);
  });

  test('without a marked site there is no section, and nothing else moves', () => {
    const p = buildPrenote(prenoteInputFromSections(sections()));
    expect(p.sections.some(s => s.id === 'territorio')).toBe(false);
  });

  test('the concept note prints them under the organisation, as bullets with their own sources', () => {
    const n = buildConceptNote({ site: { bairro: 'Floresta' }, org: { org_name: 'X' }, solutions: ['jardins-de-chuva'], cityMap }, 'pt');
    const org = n.sections.find(s => s.id === 'organizacao')!;
    const bullets = org.paragraphs.filter(p => p.kind === 'bullet');
    expect(bullets.map(b => b.sources[0])).toEqual(cityMap.map(x => x.source));
  });
});

test.describe('searching the city documents', () => {
  test('the corpus is loaded, and a search names document and page', () => {
    expect(cityPassageCount()).toBeGreaterThan(5000);
    const hits = searchCityDocs('parque linear Arroio Dilúvio', { k: 5 });
    expect(hits.length).toBeGreaterThan(0);
    expect(hits.some(h => /dil[uú]vio/i.test(`${h.title} ${h.ctx ?? ''} ${h.text}`))).toBe(true);
    for (const h of hits) expect(h.page).toBeGreaterThan(0);
  });

  test('one long report cannot fill the results', () => {
    const hits = searchCityDocs('zona de ocupação plano diretor', { k: 8, perDoc: 2 });
    const per = new Map<string, number>();
    for (const h of hits) per.set(h.docId, (per.get(h.docId) ?? 0) + 1);
    for (const n of Array.from(per.values())) expect(n).toBeLessThanOrEqual(2);
  });

  test('accents and plurals do not hide a passage', () => {
    expect(tokens('Arroios Dilúvio')).toEqual(tokens('arroio diluvio'));
  });

  test('the plan corpus carries the PLAC action table whole', () => {
    const plac = loadPlanCorpus().find(d => d.id === 'city:plac-acoes');
    expect(plac?.text).toMatch(/^A1 — /m);
    expect(plac?.text).toMatch(/A30 — /);
  });

  test('a link may cite a searched passage by its id, and the passage is checked', () => {
    const [h] = searchCityDocs('arborização ondas de calor', { k: 1 });
    const doc = { id: h.id, title: `${h.title}, p. ${h.page}`, owner: h.owner, kind: 'plano' as const, text: h.text };
    const quote = h.text.replace(/\s+/g, ' ').slice(0, 120);
    const { kept, dropped } = verifyLinks([
      { docId: h.id, relation: 'alinha', connection: 'O projeto planta árvores onde o plano pede sombra.', passage: quote },
      { docId: h.id, relation: 'alinha', connection: 'Idem.', passage: 'uma frase que não está em lugar nenhum do documento' },
    ], [doc]);
    expect(kept).toHaveLength(1);
    expect(kept[0].title).toContain(`p. ${h.page}`);
    expect(dropped.join(' ')).toMatch(/trecho não está/);
  });

  test('the first searches come from the pre-note itself', () => {
    const p = buildPrenote({ ...prenoteInputFromSections(sections()), cityMap: [{ text: 'Bacia do Arroio Dilúvio, sub-bacia D-25.', source: 'SMAMUS — Sub-bacias' }] });
    const q = seedQueries(p);
    expect(q.length).toBe(3);
    expect(q.join(' ')).toMatch(/Floresta/);
    expect(q.join(' ')).toMatch(/Dilúvio/);
  });
});

test.describe('the board groups by the city\'s water geography', () => {
  const org = (id: string, bairro: string, places: PortfolioOrg['places']): PortfolioOrg => ({
    memberId: id, orgName: id, bairro, families: ['flood'], solutionId: 'jardins-de-chuva', solutionLabel: 'Jardins de chuva', familiaId: 'aguas-pluviais',
    budget: null, horizon: 'curto' as any, horizonWhy: [], gaps: 0, visited: true, places,
  });

  test('two bairros, one polder: as close as the same bairro, and the reason says so', () => {
    const a = org('A', 'Floresta', { polder: 'Polder EBAP 02', bacia: 'Arroio Almirante Tamandaré' });
    const b = org('B', 'São Geraldo', { polder: 'Polder EBAP 02', bacia: 'Arroio Almirante Tamandaré' });
    const c = org('C', 'Restinga', { bacia: 'Arroio do Salso' });
    expect(distance(a, b, DEFAULT_PREFS)).toBeLessThan(distance(a, c, DEFAULT_PREFS));
    expect(reasonFor([a, b])).toMatch(/mesmo pôlder \(Polder EBAP 02\)/i);
    expect(reasonFor([a, c])).not.toMatch(/pôlder|bacia/);
  });

  test('a real site gets its polder and basin from the maps', () => {
    const f = layer('polder').features.find((x: any) => x.properties.nome);
    const [lat, lng] = inside(f);
    const g = siteGroupsFor({ site_lat: String(lat), site_lng: String(lng) });
    expect(g.polder).toBe(f.properties.nome);
  });
});

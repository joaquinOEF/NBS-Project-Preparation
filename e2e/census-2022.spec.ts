import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import path from 'node:path';
import { censusAround, censusAroundMany, censusForSite } from '../server/services/censusContext';
import { censusLines, combinedCensusLine, beneficiariesHint, relevanceFor, type CensusAround } from '../shared/census';
import { buildPrenote, prenoteInputFromSections } from '../shared/e4-prenote';
import { buildConceptNote } from '../shared/concept-note';
import { createEmptyCboState } from '../shared/cbo-schema';

// THE 2022 CENSUS AROUND A SITE (23 Oct 2026, docs/census-2022.md).
// Imported once from GeoReDUS (scripts/import-census-2022.ts), cited to IBGE.
// Used after the encontros to ENRICH documents — never written into what an
// organisation answered. Points here are public places, never a member's site:
// the repository is public.

const DIR = path.join(process.cwd(), 'knowledge', 'porto-alegre', 'census-2022');
const read = (f: string) => JSON.parse(gunzipSync(readFileSync(path.join(DIR, f))).toString('utf8'));
/** Praça da Matriz (centre) and the Restinga terminal (periphery) — public places. */
const MATRIZ = { lat: -30.0333, lng: -51.2300 };
const RESTINGA = { lat: -30.1500, lng: -51.1400 };

test.describe('the snapshot', () => {
  test('passed its checks: people sum to IBGE\'s total for Porto Alegre, every tract has stats', () => {
    const m = JSON.parse(readFileSync(path.join(DIR, 'manifest.json'), 'utf8'));
    expect(m.checks.every((c: any) => c.ok)).toBe(true);
    const stats = read('stats.json.gz');
    expect(Object.keys(stats).length).toBe(2744);
    expect(Object.values(stats).reduce((a: number, s: any) => a + s.p, 0)).toBe(1_332_845);
    // Homes without sewage are a subset of homes (the column was once read the wrong way round).
    for (const s of Object.values(stats) as any[]) if (s.w !== null && s.d !== null) expect(s.w).toBeLessThanOrEqual(s.d);
  });

  test('⚠️ the repository is public: services and territories carry no contacts', () => {
    for (const f of ['services.geojson.gz', 'territories.geojson.gz']) {
      const text = gunzipSync(readFileSync(path.join(DIR, f))).toString('utf8');
      expect(text).not.toMatch(/[\w.+-]+@[\w-]+\.[\w.]+|\(\d{2}\)\s?\d{4,5}-?\d{4}|"(phone|email|telefone)"/i);
    }
  });
});

test.describe('around a point', () => {
  test('the tracts that touch ~300 m, summed; withheld figures make it partial, never zero', () => {
    const c = censusAround(MATRIZ.lat, MATRIZ.lng)!;
    expect(c.tracts.length).toBeGreaterThan(3);
    expect(c.people).toBeGreaterThan(1000);
    expect(c.noTreesShare).not.toBeNull();
    expect(c.noTreesShare!).toBeGreaterThanOrEqual(0);
    expect(c.noTreesShare!).toBeLessThanOrEqual(1);
    expect(c.nearby.length).toBeGreaterThan(0);
    expect(c.nearby.every(n => n.distanceM <= 1000)).toBe(true);
  });

  test('a point outside the city has no census; a record without a pin has none either', () => {
    expect(censusAround(-23.55, -46.63)).toBeNull();
    expect(censusForSite({ bairro: 'Floresta' })).toBeNull();
  });

  test('a combined project counts each tract once', () => {
    const a = censusAround(MATRIZ.lat, MATRIZ.lng)!;
    const near = censusAroundMany([MATRIZ, { lat: MATRIZ.lat + 0.001, lng: MATRIZ.lng }])!;
    expect(near.people).toBeLessThan(a.people * 2);
    const far = censusAroundMany([MATRIZ, RESTINGA])!;
    expect(far.tracts.length).toBe(new Set(far.tracts).size);
    expect(far.people).toBe(a.people + censusAround(RESTINGA.lat, RESTINGA.lng)!.people);
  });
});

test.describe('what a document says', () => {
  const c: CensusAround = {
    tracts: ['x'], people: 10293, children: 2542, elderly: 1114, blackOrBrown: 5287, homes: 3485,
    incomeMedian: 1624.84, noTreesShare: 0.684, noSewerShare: 0.398, partial: false,
    nearby: [{ kind: 'ubs', name: 'UNIDADE DE SAUDE EXEMPLO', distanceM: 243, source: 'CNES 2026' }],
  };

  test('people always; trees only for a heat solution; sewage only for a water one (D2)', () => {
    const heat = censusLines(c, { lang: 'pt', relevance: relevanceFor('corredores-verdes') }).map(l => l.text).join('\n');
    expect(heat).toContain('Cerca de 10.300 pessoas moram a até ~300 m');
    expect(heat).toContain('68% das casas do entorno estão em ruas sem árvores');
    expect(heat).not.toContain('esgoto');
    const water = censusLines(c, { lang: 'pt', relevance: relevanceFor('jardins-de-chuva') }).map(l => l.text).join('\n');
    expect(water).toContain('40% das casas do entorno não têm esgoto adequado');
    expect(water).not.toContain('árvores');
    const slope = censusLines(c, { lang: 'pt', relevance: relevanceFor('grade-viva') }).map(l => l.text).join('\n');
    expect(slope).not.toMatch(/árvores|esgoto/);
  });

  test('⚠️ race only where the coordination reads it (D3)', () => {
    expect(censusLines(c, { lang: 'pt', relevance: null }).map(l => l.text).join(' ')).not.toMatch(/pretas|pardas/);
    expect(censusLines(c, { lang: 'pt', relevance: null, withRace: true }).map(l => l.text).join(' ')).toContain('51% são pretas ou pardas');
  });

  test('what is nearby is context, named and measured — never a partner (R2)', () => {
    const line = censusLines(c, { lang: 'pt', relevance: null }).find(l => l.text.startsWith('No entorno'))!;
    expect(line.text).toBe('No entorno: Unidade de Saúde Exemplo (240 m).');
    expect(line.source).toBe('CNES 2026');
  });

  test('the combined line and the Encontro 4 hint', () => {
    expect(combinedCensusLine(c, 2, { lang: 'pt', withRace: true, heat: true })!.text).toBe('~10.300 pessoas a até ~300 m dos 2 lugares · 51% pretas ou pardas · renda típica do responsável R$ 1.625 · 68% das casas em ruas sem árvores');
    expect(beneficiariesHint(c, 'pt')).toBe('Pelo Censo 2022, cerca de 10.300 pessoas moram a até uns 300 m daqui, 2.500 delas com até 14 anos.');
    expect(beneficiariesHint({ ...c, people: 20 }, 'pt')).toBeNull();
  });
});

test.describe('the documents gain the lines — and nothing the organisation said changes', () => {
  const sections = () => {
    const s = createEmptyCboState('porto-alegre');
    const set = (sec: string, k: string, v: string) => { (s.sections as any)[sec].fields[k] = { value: v, confidence: 'high', source: 'user', userEdited: false }; };
    set('org_profile', 'org_name', 'Coletivo Teste');
    set('intervention_site', 'bairro', 'Centro Histórico');
    set('intervention_site', 'site_lat', String(MATRIZ.lat));
    set('intervention_site', 'site_lng', String(MATRIZ.lng));
    set('intervention_site', 'beneficiaries_note', 'umas 40 famílias da vila');
    set('intervention_type', 'solution_tests_json', JSON.stringify([{ solutionId: 'corredores-verdes', reaction: 'faz-sentido', areaM2: 200, testedAt: 'x' }]));
    return s.sections;
  };

  test('the proposta inicial: census lines in Território, their own words untouched, no race', () => {
    const base = prenoteInputFromSections(sections());
    const before = buildPrenote(base);
    const after = buildPrenote({ ...base, census: censusForSite(base.site) });
    const t = after.sections.find(s => s.id === 'territorio')!;
    expect(t.title).toBe('O lugar nos mapas e quem mora perto');
    expect(t.lines.some(l => /pessoas moram a até ~300 m/.test(l.text) && /IBGE, Censo 2022/.test(l.source ?? ''))).toBe(true);
    expect(t.lines.some(l => /ruas sem árvores/.test(l.text))).toBe(true);
    expect(JSON.stringify(after)).not.toMatch(/pretas|pardas/);
    // Everything else is exactly as before.
    for (const s of before.sections.filter(x => x.id !== 'territorio')) expect(after.sections.find(x => x.id === s.id)).toEqual(s);
    expect(JSON.stringify(after)).toContain('umas 40 famílias da vila');
  });

  test('the concept note says who lives nearby under the territory, sourced, without race', () => {
    const base = prenoteInputFromSections(sections());
    const n = buildConceptNote({ site: base.site, org: { org_name: 'X' }, solutions: ['corredores-verdes'], census: censusForSite(base.site) }, 'pt');
    const text = JSON.stringify(n);
    expect(text).toContain('Quem mora perto, segundo o Censo 2022');
    expect(text).toMatch(/pessoas moram a até ~300 m/);
    expect(text).not.toMatch(/pretas|pardas/);
  });
});

test.describe('the combined project (coordination views)', () => {
  test('the board card counts overlapping places once, and says race only here', async () => {
    const { projectCard } = await import('../shared/preportfolio');
    const { tractStatsAround } = await import('../server/services/censusContext');
    const a = tractStatsAround(MATRIZ.lat, MATRIZ.lng)!;
    const b = tractStatsAround(MATRIZ.lat + 0.001, MATRIZ.lng)!;
    const org = (id: string, tracts: any) => ({ memberId: id, orgName: id, bairro: 'Centro', families: ['heat'], solutionId: 'corredores-verdes', solutionLabel: 'Corredores verdes', familiaId: 'verde-urbano', budget: null, horizon: 'agora', horizonWhy: [], gaps: 0, visited: false, sizeMeasured: false, censusTracts: tracts }) as any;
    const card = projectCard(['A', 'B'], [org('A', a), org('B', b)], 'pt');
    const union = new Set([...Object.keys(a), ...Object.keys(b)]);
    expect(card.census!.tracts.length).toBe(union.size);
    expect(card.censusLine!.text).toMatch(/pessoas a até ~300 m dos 2 lugares · \d+% pretas ou pardas/);
    expect(card.censusLine!.text).toMatch(/ruas sem árvores/);
    // No tracts known → no line, nothing invented.
    expect(projectCard(['A'], [org('A', undefined)], 'pt').censusLine).toBeNull();
  });
});

test.describe('Encontro 4, live', () => {
  test('before "quem é atingido", the census is offered as a starting point — and only while it is unanswered', async ({ page }) => {
    test.setTimeout(120_000);
    const { TestApi } = await import('./helpers/testApi');
    const api = new TestApi(page.request);
    test.skip(!(await api.ping()).fakeModel, 'needs the fake model');
    const { cboId } = await api.newSession();
    await api.seedState(cboId, { phase: 4, language: 'pt', sections: [
      { sectionId: 'org_profile', field: 'org_name', value: 'Coletivo Teste' },
      { sectionId: 'intervention_site', field: 'bairro', value: 'Restinga' },
      { sectionId: 'intervention_site', field: 'site_worry', value: 'alagamento' },
      { sectionId: 'intervention_site', field: '_site_lat', value: String(RESTINGA.lat) },
      { sectionId: 'intervention_site', field: '_site_lng', value: String(RESTINGA.lng) },
      { sectionId: 'intervention_type', field: '_e3_closed', value: 'yes' },
      { sectionId: 'intervention_type', field: 'chosen_solutions', value: 'jardins-de-chuva' },
      { sectionId: 'intervention_type', field: '_visit_json', value: JSON.stringify({ solutionId: 'jardins-de-chuva', areaM2: 120, date: '2026-10-20', recordedAt: 'x' }) },
    ] });
    let msg = 'Vamos começar o Encontro 4.', kind = 'text', q = '';
    for (let i = 0; i < 6 && !/quem sofre mais/.test(q); i++) {
      const r = await page.request.post(`/api/cbo/${cboId}/chat`, { data: { message: msg, lang: 'pt', turnKind: kind } });
      const ev = (await r.text()).split('\n\n').filter(b => b.startsWith('data:')).map(b => { try { return JSON.parse(b.slice(5)); } catch { return null; } }).filter(Boolean);
      q = String(ev.filter((e: any) => e.type === 'ask_user').pop()?.question ?? '');
      msg = i === 0 ? 'É essa ✓' : 'Isso ✓'; kind = 'chip';
    }
    expect(q).toMatch(/^Pelo Censo 2022, cerca de [\d.]+ pessoas moram a até uns 300 m daqui/);
    expect(q).toMatch(/Quando esse problema acontece, quem sofre mais\?/);
  });
});

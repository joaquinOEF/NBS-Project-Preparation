import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { TestApi } from './helpers/testApi';
import { healSite, figuresBairro } from '../server/services/siteHealing';
import { censusAround, censusAroundMany, censusBairroAt, censusBairroPopulation } from '../server/services/censusContext';
import { bairroRisk } from '../shared/bairro-risk';
import { sizeOf } from '../shared/w3-tests';
import { buildPrenote, prenoteInputFromSections } from '../shared/e4-prenote';
import { createEmptyCboState } from '../shared/cbo-schema';

// DEFECTS THE AUDIT OF THE 13 PRODUCTION RECORDS FOUND (23 Oct 2026) — and
// the realism of every number the census adds. Points are public places.

const FLORESTA = { lat: -30.0240, lng: -51.2167 };      // Rua Voluntários da Pátria (street)
const RESTINGA = { lat: -30.1500, lng: -51.1400 };      // Restinga terminal

test.describe('the bairro figures a document reads come from where the pin is', () => {
  test('a list of bairros no longer hands the first one\'s hazards to the site', () => {
    const atPin = censusBairroAt(FLORESTA.lat, FLORESTA.lng)!;
    expect(atPin).toBe('Floresta');
    const site = { bairro: 'Centro Histórico, Floresta', _site_lat: String(FLORESTA.lat), _site_lng: String(FLORESTA.lng), _bairro_heat_pct: '59', _bairro_flood_pct: '88', _bairro_landslide_pct: '79' };
    const healed = healSite(site);
    const truth = bairroRisk('Floresta')!;
    expect([healed._bairro_flood_pct, healed._bairro_heat_pct, healed._bairro_landslide_pct]).toEqual([String(truth.flood), String(truth.heat), String(truth.landslide)]);
    // What they said stays what they said.
    expect(healed.bairro).toBe('Centro Histórico, Floresta');
    expect(site._bairro_heat_pct).toBe('59');
  });

  test('a missing poverty rate is unknown, never 0.0; population comes from the 2022 Census', () => {
    // Vila São José is one of the 19 bairros the older table leaves empty.
    const site = { bairro: 'Vila São José', bairro_poverty_pct: '0.0', bairro_population: '?' };
    const healed = healSite(site);
    expect(healed.bairro_poverty_pct).toBeUndefined();
    expect(Number(healed.bairro_population)).toBe(censusBairroPopulation('Vila São José'));
    expect(Number(healed.bairro_population)).toBeGreaterThan(20_000);
  });

  test('without a pin, the first bairro they named, as before', () => {
    expect(figuresBairro({ bairro: 'Restinga, Lami' })).toBe('Restinga');
  });
});

test.describe('the size they gave, wherever a write put it', () => {
  test('site_area_m2 under intervention_type still sizes the solution and prices it', () => {
    expect(sizeOf('jardins-de-chuva', { site: {}, w3: { site_area_m2: '246' } })).toEqual({ areaM2: 246, units: undefined });
    const s = createEmptyCboState('porto-alegre');
    const set = (sec: string, k: string, v: string) => { (s.sections as any)[sec].fields[k] = { value: v, confidence: 'high', source: 'user', userEdited: false }; };
    set('org_profile', 'org_name', 'Coletivo Teste');
    set('intervention_type', 'chosen_solutions', 'jardins-de-chuva');
    set('intervention_type', 'site_area_m2', '246');
    set('intervention_type', 'solution_tests_json', JSON.stringify([{ solutionId: 'jardins-de-chuva', reaction: 'faz-sentido', testedAt: 'x' }]));
    const p = buildPrenote(prenoteInputFromSections(s.sections));
    expect(p.solution?.areaM2).toBe(246);
    expect(p.total).toBeTruthy();
  });
});

test.describe('files: removed at their request, and the ones that never arrived', () => {
  test('the coordination removes one file of THIS organisation, and sees what did not arrive', async ({ page }) => {
    test.setTimeout(90_000);
    const api = new TestApi(page.request);
    const tag = randomUUID().slice(0, 6);
    const cohort = (await api.createCohort(`Arquivos ${tag}`)).cohort;
    await api.createCoordinator({ email: `files-${tag}@e2e.test`, password: 'pw-123456', cohortId: cohort.id });
    const a = (await api.inviteMember(cohort.id, { orgName: 'Org A', withSession: true })).member;
    const b = (await api.inviteMember(cohort.id, { orgName: 'Org B', withSession: true })).member;
    const up = await page.request.post(`/api/upload/cbo/${a.cboStateId}`, { multipart: { file: { name: 'sonhar.txt', mimeType: 'text/plain', buffer: Buffer.from('um texto qualquer para guardar') } } });
    expect(up.ok()).toBe(true);
    const base = `/api/cohort/${cohort.coordinatorSlug}/member`;
    const docs = (await (await page.request.get(`${base}/${a.id}/documents`)).json()).documents;
    const doc = docs.find((d: any) => /sonhar/.test(d.filename));
    expect(doc).toBeTruthy();
    // Not through another organisation's door.
    expect((await page.request.delete(`${base}/${b.id}/documents/${doc.id}`)).status()).toBe(404);
    expect((await page.request.delete(`${base}/${a.id}/documents/${doc.id}`)).ok()).toBe(true);
    expect((await (await page.request.get(`${base}/${a.id}/documents`)).json()).documents.some((d: any) => d.id === doc.id)).toBe(false);
    // A turn that names an upload which never became a document is listed as missing.
    await page.request.post(`/api/cbo/${b.cboStateId}/chat`, { data: { message: 'Uploaded "Estatuto.pdf" but could not parse.', lang: 'pt', turnKind: 'text' } }).then(r => r.text());
    const listed = await (await page.request.get(`${base}/${b.id}/documents`)).json();
    expect(listed.missing).toContain('Estatuto.pdf');
  });
});

test.describe('⚠️ every census number is realistic — checked across the city, two ways', () => {
  const DIR = path.join(process.cwd(), 'knowledge', 'porto-alegre', 'census-2022');
  const tracts = JSON.parse(gunzipSync(readFileSync(path.join(DIR, 'tracts.geojson.gz'))).toString('utf8')).features;
  const stats = JSON.parse(gunzipSync(readFileSync(path.join(DIR, 'stats.json.gz'))).toString('utf8'));
  // Deterministic points: one inside each of 300 tracts spread over the city.
  const points = tracts.filter((_: any, i: number) => i % 9 === 0).slice(0, 300).map((f: any) => {
    const ring = f.geometry.type === 'Polygon' ? f.geometry.coordinates[0] : f.geometry.coordinates[0][0];
    const [x, y] = ring.reduce((a: number[], c: number[]) => [a[0] + c[0] / ring.length, a[1] + c[1] / ring.length], [0, 0]);
    return { lat: y, lng: x };
  });

  test('bounds: groups never exceed people, shares in 0–1, incomes in a plausible range', () => {
    let checked = 0;
    for (const p of points) {
      const c = censusAround(p.lat, p.lng);
      if (!c) continue;
      checked++;
      expect(c.people).toBeGreaterThanOrEqual(0);
      for (const g of [c.children, c.elderly, c.blackOrBrown]) if (g !== null) expect(g).toBeLessThanOrEqual(c.people);
      if (c.children !== null && c.elderly !== null) expect(c.children + c.elderly).toBeLessThanOrEqual(c.people);
      for (const s of [c.noTreesShare, c.noSewerShare]) if (s !== null) { expect(s).toBeGreaterThanOrEqual(0); expect(s).toBeLessThanOrEqual(1); }
      if (c.incomeMedian !== null) { expect(c.incomeMedian).toBeGreaterThan(300); expect(c.incomeMedian).toBeLessThan(60_000); }
      // A 300 m circle is 0.28 km²; Porto Alegre's densest tracts are ~40k/km².
      expect(c.people).toBeLessThan(0.283 * 45_000);
    }
    expect(checked).toBeGreaterThan(250);
  });

  test('two independent area-weighted counts agree: the module vs a fresh grid over the tract shapes', () => {
    // Area-weighted: sample a grid inside the 300 m circle; each sample takes
    // its tract's density. Independent of how many tracts merely touch it.
    const byId = new Map(tracts.map((f: any) => [f.properties.s, f]));
    const inside = (lng: number, lat: number, ring: number[][]) => {
      let c = false;
      for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        const [x1, y1] = ring[i], [x2, y2] = ring[j];
        if ((y1 > lat) !== (y2 > lat) && lng < ((x2 - x1) * (lat - y1)) / (y2 - y1) + x1) c = !c;
      }
      return c;
    };
    const ringsOf = (g: any) => (g.type === 'Polygon' ? g.coordinates : g.coordinates.flat());
    const areaKm2 = (g: any) => {
      let a = 0;
      for (const ring of ringsOf(g).slice(0, 1)) for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) a += (ring[j][0] + ring[i][0]) * (ring[j][1] - ring[i][1]);
      return Math.abs(a / 2) * 111.32 * 110.54 * Math.cos(30.05 * Math.PI / 180);
    };
    const ratios: number[] = [];
    for (const p of points.slice(0, 80)) {
      const c = censusAround(p.lat, p.lng);
      if (!c || c.people < 200) continue;
      let weighted = 0;
      const step = 30, r = 300, cellKm2 = (step * step) / 1e6;
      for (let dx = -r; dx <= r; dx += step) for (let dy = -r; dy <= r; dy += step) {
        if (dx * dx + dy * dy > r * r) continue;
        const lat = p.lat + dy / 110_540, lng = p.lng + dx / (111_320 * Math.cos(p.lat * Math.PI / 180));
        for (const id of c.tracts) {
          const f: any = byId.get(id);
          if (ringsOf(f.geometry).some((ring: number[][]) => inside(lng, lat, ring))) { weighted += ((stats[id]?.p ?? 0) / Math.max(areaKm2(f.geometry), 1e-4)) * cellKm2; break; }
        }
      }
      if (weighted > 50) ratios.push(c.people / weighted);
    }
    ratios.sort((a, b) => a - b);
    const median = ratios[Math.floor(ratios.length / 2)];
    // Counting whole tracts that merely touch the circle read ~2× high (median 2.04
    // over 80 points, 23 Oct). The module now weights each tract by its area inside
    // the circle; an independent 30 m grid must give the same count. Also checked by
    // hand against CNEFE address hexagons at five sites: ratio 0.80–1.42, median ~1.05.
    expect(ratios.length).toBeGreaterThan(30);
    expect(median).toBeGreaterThan(0.9);
    expect(median).toBeLessThan(1.1);
    expect(ratios[Math.floor(ratios.length * 0.9)]).toBeLessThan(1.3);
    test.info().annotations.push({ type: 'touching ÷ area-weighted', description: `median ${median.toFixed(2)} over ${ratios.length} points (p10 ${ratios[Math.floor(ratios.length * 0.1)].toFixed(2)}, p90 ${ratios[Math.floor(ratios.length * 0.9)].toFixed(2)})` });
    console.log(`[census realism] touching ÷ area-weighted: median ${median.toFixed(2)}, p10 ${ratios[Math.floor(ratios.length * 0.1)].toFixed(2)}, p90 ${ratios[Math.floor(ratios.length * 0.9)].toFixed(2)} (n=${ratios.length})`);
  });

  test('combined never exceeds the sum, and overlapping places count once', () => {
    for (let i = 0; i + 1 < 40; i += 2) {
      const [a, b] = [points[i], points[i + 1]];
      const ca = censusAround(a.lat, a.lng), cb = censusAround(b.lat, b.lng), both = censusAroundMany([a, b]);
      if (!ca || !cb || !both) continue;
      expect(both.people).toBeLessThanOrEqual(ca.people + cb.people + 1); // each is rounded on its own
      expect(both.people).toBeGreaterThanOrEqual(Math.max(ca.people, cb.people) - 1);
    }
    expect(censusAroundMany([RESTINGA, RESTINGA])!.people).toBe(censusAround(RESTINGA.lat, RESTINGA.lng)!.people);
  });
});

test.describe('a correct stored figure is left as it is', () => {
  test('same bairro, figures agreeing with the table: nothing changes', () => {
    const truth = bairroRisk('Sarandi')!;
    const site = { bairro: 'Sarandi', bairro_population: '59707', bairro_poverty_pct: '12.3', _bairro_flood_pct: String(truth.flood), _bairro_heat_pct: String(truth.heat), _bairro_landslide_pct: String(truth.landslide) };
    expect(healSite(site)).toEqual(site);
  });
});

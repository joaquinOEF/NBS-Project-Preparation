import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { rankPlaces, applyRule, mergeSamePlaces, RankPlacesInputError, HIGH_LEVEL, TOP_LEVEL, PLACE_KINDS, SAME_PLACE_M } from '../server/services/rankPlaces';
import { arvcHazardAround, arvcHazardAtPin } from '../server/services/arvcPointHazard';
import { hazardAtPin, sgbHazardAtPin } from '../server/services/sgbPointHazard';
import { censusAround } from '../server/services/censusContext';

// RANK PLACES (server/services/rankPlaces.ts, 27 Nov 2026).
// No combined score: the official hazard class keeps a place in, the people
// living around it order the list. Committed files only — no network, no model.

const item = (osmId: string, level: number, residents: number, raw = level, areaHa = 1) => ({ osmId, level, raw, areaHa, residents });

test.describe('the rule, on its own', () => {
  test('fewer than `top` at "muito alta": level ≥ 3 qualifies, ordered by residents — never by the hazard value', () => {
    const xs = [item('a', 4, 100), item('b', 3, 900), item('c', 2, 5000), item('d', 3, 400), item('e', 1, 9000)];
    const r = applyRule(xs, 3, x => x.residents);
    expect(r.picked.map(p => p.item.osmId)).toEqual(['b', 'd', 'a']);
    expect(r).toMatchObject({ qualified: 3, filled: 0, qualifyingLevel: HIGH_LEVEL });
    expect(r.picked.every(p => !p.belowTopClass)).toBe(true);
  });

  test('at least `top` at "muito alta": only they qualify — an "alta" place with more neighbours does NOT appear', () => {
    const xs = [item('a', 4, 100), item('b', 3, 9000), item('c', 4, 300), item('d', 4, 200), item('e', 3, 8000), item('f', 2, 99999)];
    const r = applyRule(xs, 3, x => x.residents);
    expect(r.picked.map(p => p.item.osmId)).toEqual(['c', 'd', 'a']);
    expect(r).toMatchObject({ qualified: 3, filled: 0, qualifyingLevel: TOP_LEVEL });
    // One short of `top` at level 4 → back to level ≥ 3, and the busy "alta" places lead.
    const r2 = applyRule(xs, 4, x => x.residents);
    expect(r2.qualifyingLevel).toBe(HIGH_LEVEL);
    expect(r2.picked.map(p => p.item.osmId)).toEqual(['b', 'e', 'c', 'd']);
    expect(r2.qualified).toBe(5);
  });

  test('ties: the hazard\'s raw value, then area, then id', () => {
    const xs = [item('z', 3, 500, 0.6, 1), item('y', 3, 500, 0.7, 1), item('x', 3, 500, 0.7, 2), item('w', 3, 500, 0.7, 2)];
    expect(applyRule(xs, 4, x => x.residents).picked.map(p => p.item.osmId)).toEqual(['w', 'x', 'y', 'z']);
  });

  test('fewer than `top` qualify: the next class down fills, after them, flagged — and only that class', () => {
    const xs = [item('a', 3, 10), item('b', 2, 900), item('c', 2, 800), item('d', 1, 99999)];
    const r = applyRule(xs, 5, x => x.residents);
    expect(r.picked.map(p => [p.item.osmId, p.belowTopClass])).toEqual([['a', false], ['b', true], ['c', true]]);
    expect(r).toMatchObject({ qualified: 1, filled: 2, qualifyingLevel: HIGH_LEVEL });
  });

  test('residents are only counted for the classes that can appear', () => {
    const asked: string[] = [];
    applyRule([item('a', 4, 1), item('b', 3, 2), item('c', 2, 3), item('d', 0, 4)], 2, x => { asked.push(x.osmId); return x.residents; });
    expect(asked.sort()).toEqual(['a', 'b']);
  });
});

test.describe('one park drawn as several OSM ways', () => {
  const box = (lng: number, lat: number) => [lng, lat, lng + 0.0005, lat + 0.0005];
  const p = (osmId: string, name: string | null, lng: number, areaHa: number) => ({ osmId, name, bbox: box(lng, -30.03), areaHa, parts: 1 });

  test('same name within ~150 m → one place: the largest piece, areas summed', () => {
    // 0.001° of longitude ≈ 96 m here; the boxes are 0.0005° wide.
    const out = mergeSamePlaces([p('way/1', 'Praça da Paz', -51.2000, 0.4), p('way/2', 'praca da paz', -51.2010, 0.9), p('way/3', 'Praça da Paz', -51.1000, 0.3), p('way/4', null, -51.2000, 2), p('way/5', null, -51.2001, 2)]);
    expect(out.map(x => x.osmId)).toEqual(['way/2', 'way/3', 'way/4', 'way/5']);
    expect(out[0]).toMatchObject({ parts: 2, name: 'praca da paz' });
    expect(out[0].areaHa).toBeCloseTo(1.3, 6);
    expect(SAME_PLACE_M).toBe(150);
  });

  test('the real list never names the same place twice close by', async () => {
    const r = await rankPlaces({ kind: 'parks', by: 'heat', top: 25 });
    for (const a of r.places) for (const b of r.places) {
      if (a === b || a.name !== b.name) continue;
      expect(Math.hypot((a.lng - b.lng) * 96_000, (a.lat - b.lat) * 110_540)).toBeGreaterThan(SAME_PLACE_M);
    }
  });
});

test.describe('the readings are the official ones', () => {
  test('heat around a place uses the pin\'s own classes; the number never leaves the server', async () => {
    const around = arvcHazardAround('heat', -30.0331, -51.2300, 300)!;
    expect(around.level).toBeGreaterThanOrEqual(0);
    expect(around.level).toBeLessThanOrEqual(4);
    expect(['muito baixa', 'baixa', 'média', 'alta', 'muito alta'][around.level]).toBe(around.pt);
    // A radius under one pixel is the pixel under the point.
    const pin = arvcHazardAtPin(-30.0331, -51.2300).find(h => h.hazard === 'heat')!;
    expect(arvcHazardAround('heat', -30.0331, -51.2300, 1)).toMatchObject({ level: pin.level, pt: pin.pt });
    expect(arvcHazardAround('heat', -23.55, -46.63, 300)).toBeNull();
    const r = await rankPlaces({ kind: 'parks', by: 'heat' });
    expect(JSON.stringify(r.places.map(p => p.hazard))).not.toMatch(/0\.\d{2,}/);
    expect(Object.keys(r.places[0].hazard).sort()).toEqual(['key', 'label', 'level', 'source']);
  });

  test('flood and landslide are what a pin on the place is told', async () => {
    for (const by of ['flood', 'landslide'] as const) {
      const r = await rankPlaces({ kind: 'parks', by, top: 10 });
      for (const p of r.places) {
        const pin = hazardAtPin(p.lat, p.lng).find(h => h.hazard === by)!;
        expect(p.hazard).toEqual({ key: by, level: pin.level, label: { pt: pin.pt, en: pin.en }, source: pin.source });
      }
    }
    expect(sgbHazardAtPin('flood', -23.55, -46.63)).toBeNull();
  });

  test('residents are the census estimate within the radius, and say so', async () => {
    const r = await rankPlaces({ kind: 'parks', by: 'heat', radiusM: 500 });
    expect(r.radiusM).toBe(500);
    for (const p of r.places) expect(p.residentsNearby).toBe(censusAround(p.lat, p.lng, { radiusM: 500 })!.people);
    expect(r.sources.join(' ')).toMatch(/Censo Demográfico 2022.*500 m.*ESTIMATIVA, não contagem/);
  });
});

test.describe('the real city', () => {
  test('parks by heat: enough parks are "muito alta", so only those — most people first', async () => {
    const r = await rankPlaces({ kind: 'parks', by: 'heat' });
    expect(r.places).toHaveLength(5);
    expect(r.places.map(p => p.rank)).toEqual([1, 2, 3, 4, 5]);
    expect(r.qualifyingLevel).toBe(TOP_LEVEL);
    expect(r.places.every(p => p.hazard.level === TOP_LEVEL && p.hazard.label.pt === 'muito alta' && p.hazard.source === 'PLAC' && !p.belowTopClass)).toBe(true);
    expect(r.rule.pt).toMatch(/é muito alta \(média a até 300 m\)/);
    expect(r.rule.en).toMatch(/is very high \(mean within 300 m\)/);
    expect(r.rule.pt).not.toMatch(/alta ou muito alta/);
    const n = r.places.map(p => p.residentsNearby);
    expect(n).toEqual([...n].sort((a, b) => b - a));
    expect(r.places.every(p => p.name && p.areaHa >= 0.5 && p.bairro && p.geometry?.coordinates)).toBe(true);
    expect(r.qualified).toBeLessThanOrEqual(r.considered);
    expect(r.filledFromNextClass).toBe(0);
    expect(r.rule.pt).toMatch(/moram a até 300 m/);
    expect(r.rule.en).toMatch(/live within 300 m/);
    expect(r.rule.pt).not.toMatch(/Só \d/);
  });

  test('parks by landslide: no park sits on SGB "alta" — the list says so and fills from "média", flagged', async () => {
    const r = await rankPlaces({ kind: 'parks', by: 'landslide' });
    expect(r.qualified).toBeLessThan(5);
    expect(r.filledFromNextClass).toBe(5 - r.qualified);
    expect(r.places.filter(p => p.belowTopClass).map(p => p.hazard.level)).toEqual(Array(r.filledFromNextClass).fill(2));
    expect(r.places.filter(p => !p.belowTopClass).every(p => p.hazard.level >= 3)).toBe(true);
    expect(r.qualifyingLevel).toBe(HIGH_LEVEL);
    // SGB's scale stops at Alta — the rule must not promise a "very high".
    expect(r.rule.pt).toMatch(/é alta, /);
    expect(r.rule.en).toMatch(/is high, /);
    expect(r.rule.pt + r.rule.en).not.toMatch(/muito alta|very high/);
    expect(r.rule.pt).toMatch(/Só \d+ de \d+ est(á|ão) nessas classes; .* classe logo abaixo/);
    expect(r.rule.en).toMatch(/Only \d+ of \d+ (is|are) in those classes; .* next class down/);
  });

  test('`bairro` keeps one neighbourhood, accents and case aside', async () => {
    const all = await rankPlaces({ kind: 'schools', by: 'flood', top: 25 });
    const name = all.places[0].bairro!;
    const r = await rankPlaces({ kind: 'schools', by: 'flood', top: 25, bairro: name.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase() });
    expect(r.places.length).toBeGreaterThan(0);
    expect(r.places.every(p => p.bairro === name)).toBe(true);
    expect(r.considered).toBeLessThan(all.considered);
    expect((await rankPlaces({ kind: 'parks', by: 'heat', bairro: 'Bairro Que Não Existe' }))).toMatchObject({ considered: 0, qualified: 0, places: [] });
  });

  test('a garden is not a park: leisure=garden and a museum\'s yard stay out of `parks`', async () => {
    const r = await rankPlaces({ kind: 'parks', by: 'flood', top: 25, minAreaHa: 0, namedOnly: false });
    expect(r.places.map(p => p.name)).not.toContain('Museu Joaquim José Felizardo');
    const snap = JSON.parse(readFileSync(path.join(process.cwd(), 'knowledge/osm/porto-alegre/parks.json'), 'utf8'));
    const gardens = new Set(snap.features.filter((f: any) => f.properties?.leisure === 'garden' || f.properties?.tourism === 'museum').map((f: any) => `${f.properties.osm_type}/${f.properties.osm_id}`));
    expect(gardens.size).toBeGreaterThan(0);
    for (const by of ['heat', 'flood'] as const)
      for (const p of (await rankPlaces({ kind: 'parks', by, top: 25, minAreaHa: 0, namedOnly: false })).places) expect(gardens.has(p.osmId), p.osmId).toBe(false);
    expect(r.sources.join(' ')).toMatch(/sem leisure=garden/);
  });

  test('nothing outside Porto Alegre: the OSM box takes in Canoas and Viamão', async () => {
    const r = await rankPlaces({ kind: 'schools', by: 'heat', top: 25, namedOnly: false });
    expect(r.places.every(p => p.bairro)).toBe(true);
  });

  test('`top` is capped at 25; unnamed places only when asked', async () => {
    expect((await rankPlaces({ kind: 'parks', by: 'heat', top: 999 })).places).toHaveLength(25);
    const named = await rankPlaces({ kind: 'wetlands', by: 'flood' });
    const any = await rankPlaces({ kind: 'wetlands', by: 'flood', namedOnly: false });
    expect(named.places.every(p => p.name)).toBe(true);
    expect(any.considered).toBeGreaterThan(named.considered);
  });

  test('deterministic: the same question twice is the same answer, byte for byte', async () => {
    for (const q of [{ kind: 'parks', by: 'heat' }, { kind: 'schools', by: 'flood' }, { kind: 'hospitals', by: 'landslide' }] as const) {
      expect(JSON.stringify(await rankPlaces({ ...q }))).toBe(JSON.stringify(await rankPlaces({ ...q })));
    }
  });

  test('every registered kind answers', async () => {
    for (const kind of Object.keys(PLACE_KINDS)) expect((await rankPlaces({ kind, by: 'heat', namedOnly: false })).considered).toBeGreaterThan(0);
  });
});

test.describe('bad input', () => {
  test('an unknown kind or hazard is refused, naming the valid ones', async () => {
    await expect(rankPlaces({ kind: 'castles', by: 'heat' })).rejects.toThrow(RankPlacesInputError);
    await expect(rankPlaces({ kind: 'constructor', by: 'heat' })).rejects.toThrow(/parks, schools, hospitals, wetlands/);
    await expect(rankPlaces({ kind: 'parks', by: 'wind' as any })).rejects.toThrow(/heat, flood, landslide/);
    await expect(rankPlaces({ kind: 'parks', by: 'heat', top: 'five' as any })).rejects.toThrow(RankPlacesInputError);
  });

  test('POST /api/geospatial/rank-places: 400 for an unknown kind, the ranking otherwise', async ({ request }) => {
    const bad = await request.post('/api/geospatial/rank-places', { data: { kind: 'castles', by: 'heat' } });
    expect(bad.status()).toBe(400);
    expect((await bad.json()).error).toMatch(/Unknown kind: castles/);
    const ok = await request.post('/api/geospatial/rank-places', { data: { kind: 'parks', by: 'heat' } });
    expect(ok.status()).toBe(200);
    expect(await ok.json()).toEqual(JSON.parse(JSON.stringify(await rankPlaces({ kind: 'parks', by: 'heat' }))));
  });
});

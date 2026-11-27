import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import {
  becauseFor, solutionsForReadings, noHighHazardLine, readingPhrase, highReadings,
  LEGACY_CATEGORY_HAZARDS, HIGH_LEVEL, type HazardReading,
} from '../shared/solution-because';
import { NBS_SOLUTIONS, NBS_FAMILIAS, getSolution } from '../shared/nbs-catalog';
import { SOLUTION_STRENGTHS, addresses } from '../shared/solution-strengths';
import { hazardAtPin } from '../server/services/sgbPointHazard';

// THE "BECAUSE" LINE (shared/solution-because.ts, 27 Nov 2026): why a solution
// fits a place, from the official reading at the point and what the catalogue
// already declares (Robson's classification) — no new tag, no new vocabulary.

const HEAT4: HazardReading = { hazard: 'heat', level: 4, pt: 'muito alta', en: 'very high', source: 'PLAC' };
const HEAT2: HazardReading = { hazard: 'heat', level: 2, pt: 'média', en: 'medium', source: 'PLAC' };
const FLOOD3: HazardReading = { hazard: 'flood', level: 3, pt: 'alta', en: 'high', source: 'SGB' };
const FLOOD3_2024: HazardReading = { hazard: 'flood', level: 3, pt: 'alta', en: 'high', source: 'SMAMUS' };
const FLOOD1: HazardReading = { hazard: 'flood', level: 1, pt: 'baixa', en: 'low', source: 'SGB' };
const SLIDE3: HazardReading = { hazard: 'landslide', level: 3, pt: 'alta', en: 'high', source: 'SGB' };
const SLIDE1: HazardReading = { hazard: 'landslide', level: 1, pt: 'baixa', en: 'low', source: 'SGB' };
const CALM = [FLOOD1, HEAT2, SLIDE1];

test.describe('one solution, one place', () => {
  test('heat: very high in the climate plan → a shade solution fits, and says who says so', () => {
    const b = becauseFor([FLOOD1, HEAT4, SLIDE1], 'escola-verde')!;
    expect(b).toMatchObject({ fits: true, hazard: 'heat', level: 4, source: 'PLAC' });
    expect(b.line.pt).toBe('Calor aqui: ameaça muito alta (plano climático, 2050) → Escola verde age direto nisso.');
    expect(b.line.en).toBe(`Heat here: very high hazard (climate plan, 2050) → ${getSolution('escola-verde')!.en.label} acts directly on it.`);
  });

  test('flood: SGB susceptibility, and the May 2024 mark when that is the source', () => {
    const sgb = becauseFor([FLOOD3, HEAT2, SLIDE1], 'jardins-de-chuva')!;
    expect(sgb).toMatchObject({ fits: true, hazard: 'flood', level: 3, source: 'SGB' });
    expect(sgb.line.pt).toBe('Inundação aqui: suscetibilidade alta (SGB) → Jardins de chuva age direto nisso.');
    const may = becauseFor([FLOOD3_2024], 'canteiro-pluvial')!;
    expect(may.source).toBe('SMAMUS');
    expect(may.line.pt).toMatch(/^Inundação aqui: alta \(cheia de maio de 2024, SMAMUS\) → .* ajuda, dependendo do tamanho e do lugar\.$/);
    expect(may.line.en).toMatch(/^Flooding here: high \(May 2024 flood, SMAMUS\) → .* helps, depending on size and place\.$/);
  });

  test('landslide: a slope solution on SGB "alta"', () => {
    const b = becauseFor([FLOOD1, HEAT2, SLIDE3], 'muro-de-arrimo-verde')!;
    expect(b).toMatchObject({ fits: true, hazard: 'landslide', level: 3, source: 'SGB' });
    expect(b.line.pt).toMatch(/^Deslizamento aqui: suscetibilidade alta \(SGB\) → /);
    expect(b.line.en).toMatch(/^Landslide here: high susceptibility \(SGB\) → /);
  });

  test('several high hazards: the highest level wins; equal levels go to what the solution is stronger on', () => {
    // parques-e-florestas-urbanas: flood forte, heat forte → heat 4 beats flood 3.
    expect(becauseFor([FLOOD3, HEAT4], 'parques-e-florestas-urbanas')!.hazard).toBe('heat');
    // teto-verde: flood média, heat forte — both at 3 → heat.
    expect(becauseFor([FLOOD3, { ...HEAT4, level: 3, pt: 'alta', en: 'high' }], 'teto-verde')!.hazard).toBe('heat');
  });

  test('a hazard is high, but not the one the solution answers → it does not fit, and no all-clear', () => {
    const b = becauseFor([FLOOD3, HEAT2, SLIDE1], 'escola-verde')!;
    expect(b.fits).toBe(false);
    expect(b.hazard).toBeUndefined();
    expect(b.line.pt).toMatch(/^Escola verde responde a calor\. Neste ponto os dados oficiais não marcam isso como alto — eles não cobrem tudo/);
    expect(b.line.en).toMatch(/answers heat\. At this point the official data does not mark that as high — it does not cover everything/);
    expect(`${b.line.pt} ${b.line.en}`).not.toMatch(/seguro|sem risco|safe|no risk/i);
  });

  test('a solution with no declared hazard gets no line at all', () => {
    // Robson: fraca / nenhum on all three.
    for (const id of ['cozinha-comunitaria-biodigestor', 'hortas-urbanas', 'compostagem', 'ilhas-filtrantes-flutuantes']) {
      expect(becauseFor([FLOOD3, HEAT4, SLIDE3], id), id).toBeNull();
    }
    expect(becauseFor([HEAT4], 'not-in-the-catalogue')).toBeNull();
    expect(becauseFor([HEAT4], { category: 'something_else' })).toBeNull();
    expect(becauseFor([HEAT4], { category: 'constructor' })).toBeNull();
  });

  test('every catalogue solution: a line exactly when Robson rated it Forte or Média on something', () => {
    for (const s of NBS_SOLUTIONS) {
      const row = SOLUTION_STRENGTHS[s.id];
      const declares = !!row && (['flood', 'heat', 'landslide'] as const).some(h => addresses(row[h]));
      const b = becauseFor([FLOOD3, HEAT4, SLIDE3], s.id);
      expect(!!b, s.id).toBe(declares);
      if (b) {
        expect(b.fits, s.id).toBe(true);
        expect(addresses(row[b.hazard!]), `${s.id} on ${b.hazard}`).toBe(true);
        expect(b.line.pt.length, s.id).toBeGreaterThan(20);
        expect(b.line.en.length, s.id).toBeGreaterThan(20);
        expect(b.line.pt).not.toBe(b.line.en);
      }
    }
  });
});

test.describe('the legacy explorer interventions', () => {
  const file = JSON.parse(readFileSync(path.join(process.cwd(), 'client/public/sample-data/interventions.json'), 'utf8'));

  test('every category in the file is mapped — and only those', () => {
    expect(Object.keys(LEGACY_CATEGORY_HAZARDS).sort()).toEqual(Object.keys(file.categories).sort());
  });

  test('the category decides: flood_storage → flood, urban_cooling → heat, slope_stability → landslide, multi_benefit → any', () => {
    const want: Record<string, string> = { flood_storage: 'flood', urban_cooling: 'heat', slope_stability: 'landslide' };
    for (const i of file.interventions as Array<{ id: string; category: string }>) {
      const all = becauseFor([FLOOD3, HEAT4, SLIDE3], i)!;
      expect(all.fits, i.id).toBe(true);
      expect(all.line.pt && all.line.en, i.id).toBeTruthy();
      if (i.category === 'multi_benefit') {
        expect(all.hazard).toBe('heat'); // the highest level
        expect(becauseFor([FLOOD1, HEAT2, SLIDE3], i)!.hazard).toBe('landslide');
      } else {
        expect(all.hazard, i.id).toBe(want[i.category]);
        const only = (['flood', 'heat', 'landslide'] as const).filter(h => h !== want[i.category]);
        const elsewhere = [FLOOD3, HEAT4, SLIDE3].filter(r => only.includes(r.hazard));
        expect(becauseFor(elsewhere, i)!.fits, i.id).toBe(false);
      }
    }
    expect(becauseFor([HEAT4], { category: 'urban_cooling', id: 'tree_corridor' })!.line.pt)
      .toBe('Calor aqui: ameaça muito alta (plano climático, 2050) → esta é uma das soluções de sombra e resfriamento.');
  });
});

test.describe('what addresses this site', () => {
  test('the high hazards, strongest first, each with its line, famílias and legacy categories', () => {
    const r = solutionsForReadings([FLOOD3, HEAT4, SLIDE1]);
    expect(r.none).toBeUndefined();
    expect(r.high.map(h => [h.hazard, h.level, h.source])).toEqual([['heat', 4, 'PLAC'], ['flood', 3, 'SGB']]);
    expect(r.high[0].line).toEqual({
      pt: 'Calor aqui: ameaça muito alta (plano climático, 2050) → soluções de sombra e resfriamento.',
      en: 'Heat here: very high hazard (climate plan, 2050) → shade and cooling solutions.',
    });
    expect(r.high[1].line.pt).toBe('Inundação aqui: suscetibilidade alta (SGB) → soluções que seguram e infiltram a água.');
    expect(r.high[0].familias[0].id).toBe('verde-urbano');
    expect(r.high[1].familias[0].id).toBe('aguas-pluviais');
    expect(r.high[0].legacyCategories).toEqual(['urban_cooling', 'multi_benefit']);
    expect(r.high[1].legacyCategories).toEqual(['flood_storage', 'multi_benefit']);
    expect(solutionsForReadings([SLIDE3]).high[0].familias[0].id).toBe('encostas-e-solo');
  });

  test('a família is listed only through solutions Robson rated Forte or Média — Forte first', () => {
    for (const reading of [FLOOD3, HEAT4, SLIDE3]) {
      const [h] = solutionsForReadings([reading]).high;
      expect(h.familias.length).toBeGreaterThan(0);
      for (const f of h.familias) {
        expect(NBS_FAMILIAS.some(x => x.id === f.id)).toBe(true);
        expect(f.label.pt && f.label.en).toBeTruthy();
        const strengths = f.solutionIds.map(id => SOLUTION_STRENGTHS[id][h.hazard]);
        expect(strengths.every(addresses), `${f.id} on ${h.hazard}`).toBe(true);
        expect(strengths).toEqual([...strengths].sort((a, b) => (a === 'forte' ? 0 : 1) - (b === 'forte' ? 0 : 1)));
        for (const id of f.solutionIds) expect(getSolution(id)!.familiaId).toBe(f.id);
      }
      // Urban agriculture is Fraca/nenhum throughout: it is never offered as the answer to a hazard.
      expect(h.familias.map(f => f.id)).not.toContain('agricultura-urbana');
    }
  });

  test('no hazard is high → one safe sentence, never an all-clear', () => {
    const r = solutionsForReadings(CALM);
    expect(r.high).toEqual([]);
    expect(r.none!.pt).toMatch(/^Nenhuma ameaça alta mapeada neste ponto/);
    expect(r.none!.pt).toMatch(/não quer dizer que o lugar é seguro/);
    expect(r.none!.en).toMatch(/^No high hazard is mapped at this point/);
    expect(r.none!.en).toMatch(/does not mean the place is safe/);
    expect(r.none).toEqual(noHighHazardLine(CALM));
  });

  test('no reading at all (outside the city) says there is no data — not that nothing is high', () => {
    for (const none of [[], null, undefined]) {
      const r = solutionsForReadings(none as any);
      expect(r.high).toEqual([]);
      expect(r.none!.pt).toMatch(/^Não temos dado oficial/);
      expect(r.none!.en).toMatch(/^We hold no official hazard data/);
    }
    expect(becauseFor(null, 'escola-verde')!.fits).toBe(false);
  });
});

test.describe('one vocabulary: the reading\'s own words', () => {
  test('the level words in a line are the ones hazardAtPin gave, at real points', () => {
    // Public places: Mercado Público (reached in May 2024), Praça da Matriz, Morro da Cruz, Restinga terminal.
    const points = [[-30.0272, -51.2280], [-30.0331, -51.2300], [-30.0731, -51.1560], [-30.1500, -51.1400], [-29.9866, -51.1338]];
    let highSeen = 0;
    for (const [lat, lng] of points) {
      // Assignable without a cast: the shared type IS the shape hazardAtPin returns.
      const readings: HazardReading[] = hazardAtPin(lat, lng);
      expect(readings.length).toBeGreaterThan(0);
      for (const r of readings) {
        const p = readingPhrase(r);
        expect(p.pt).toContain(r.pt);
        expect(p.en).toContain(r.en);
        expect(p.pt).toContain(r.source === 'PLAC' ? 'plano climático' : r.source);
      }
      const s = solutionsForReadings(readings);
      expect(s.high.map(h => h.hazard)).toEqual(highReadings(readings).map(r => r.hazard));
      expect(s.high.every(h => h.level >= HIGH_LEVEL)).toBe(true);
      expect(!!s.none).toBe(s.high.length === 0);
      highSeen += s.high.length;
      for (const h of s.high) {
        const r = readings.find(x => x.hazard === h.hazard)!;
        expect(h.line.pt).toContain(` ${r.pt} (`);
        expect(h.line.en).toContain(r.en);
      }
    }
    expect(highSeen).toBeGreaterThan(0);
  });

  test('deterministic, and the input is not touched', () => {
    const input = [SLIDE3, HEAT4, FLOOD3];
    const copy = JSON.stringify(input);
    expect(JSON.stringify(solutionsForReadings(input))).toBe(JSON.stringify(solutionsForReadings(input)));
    expect(JSON.stringify(input)).toBe(copy);
  });
});

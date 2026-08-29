import { test, expect } from '@playwright/test';
import {
  SOLUTION_COSTS,
  budgetLineFor,
  polygonAreaM2,
  ringAreaM2,
  roundAreaM2,
} from '../shared/w3-sizing';
import { NBS_SOLUTION_FICHAS } from '../shared/nbs-solution-fichas';

// W3 SIZING — the footprint, and the number that comes off it.
//
// These pin the three things that went wrong when this was a regex over the
// ficha prose, because all three failed in the same direction: they produced a
// confident number that was wrong, rather than no number.
//
//   • bacia-de-retenção is "R$ 700/m² de estrutura + R$ 300/m² de paisagismo".
//     Taking the first figure understated a 300 m² basin by R$ 90.000.
//   • escola-verde says the MMA cartilha does NOT close a number, then quotes
//     R$ 250–500 per TREE. That got published as a per-m² rate.
//   • "R$ 20.000" was truncated at the thousands separator to R$ 20.
//
// A budget line on a page an organisation shows a secretariat has to be
// traceable. A wrong one is worse than a blank.

test.describe('W3 sizing — area', () => {
  test('a drawn ring measures what it covers', () => {
    // ~100 m × ~100 m in Porto Alegre. One degree of latitude is ~111 km, so
    // 0.0009° ≈ 100 m; longitude is that times cos(30°) ≈ 0.866.
    const ring: Array<[number, number]> = [
      [-51.2000, -30.0500],
      [-51.19896, -30.0500],
      [-51.19896, -30.0509],
      [-51.2000, -30.0509],
    ];
    const m2 = ringAreaM2(ring);
    expect(m2).toBeGreaterThan(9000);
    expect(m2).toBeLessThan(11000);
  });

  test('a hole is subtracted, not added', () => {
    const outer: Array<[number, number]> = [
      [-51.2000, -30.0500], [-51.1980, -30.0500], [-51.1980, -30.0520], [-51.2000, -30.0520],
    ];
    const inner: Array<[number, number]> = [
      [-51.1995, -30.0505], [-51.1990, -30.0505], [-51.1990, -30.0510], [-51.1995, -30.0510],
    ];
    const solid = polygonAreaM2({ type: 'Polygon', coordinates: [outer] });
    const holed = polygonAreaM2({ type: 'Polygon', coordinates: [outer, inner] });
    expect(holed).toBeLessThan(solid);
    expect(holed).toBeGreaterThan(0);
  });

  test('a non-polygon measures zero rather than throwing', () => {
    expect(polygonAreaM2({ type: 'Point', coordinates: [-51.2, -30.05] })).toBe(0);
    expect(ringAreaM2([[-51.2, -30.05], [-51.1, -30.05]])).toBe(0);
  });

  test('the rounding admits what a finger-drawn polygon is worth', () => {
    // 487 m² reads as a survey. It is four taps on a phone.
    expect(roundAreaM2(487)).toBe(500);
    expect(roundAreaM2(42)).toBe(40);
    expect(roundAreaM2(3170)).toBe(3200);
    expect(roundAreaM2(0)).toBe(0);
  });
});

test.describe('W3 sizing — cost', () => {
  test('every one of the 27 fichas is priced or explicitly unpriced', () => {
    // The module throws at load if this is untrue, so reaching this line is
    // most of the assertion. Restated here so the failure names itself.
    for (const id of Object.keys(NBS_SOLUTION_FICHAS)) {
      expect(SOLUTION_COSTS[id], `${id} has no cost entry`).toBeTruthy();
    }
    expect(Object.keys(SOLUTION_COSTS).length).toBe(Object.keys(NBS_SOLUTION_FICHAS).length);
  });

  test('a basin costs both of its lines, and shows the addition', () => {
    const line = budgetLineFor('bacia-de-retencao', 300)!;
    // 300 m² × (700 structure + 300 landscaping)
    expect(line.lowBrl).toBe(300_000);
    expect(line.notePt).toMatch(/R\$ 700\/m².*R\$ 300\/m²/);
  });

  test('a per-tree price is never published as a per-m² rate', () => {
    const trees = budgetLineFor('corredores-verdes', 400)!;
    expect(trees.basis).toBe('unit');
    expect(trees.lowBrl).toBeNull();
    expect(trees.notePt).toMatch(/por unidade|árvore/);
    // escola-verde is the one that actually broke: its sentence opens by
    // refusing to close a number and then quotes the per-tree figure.
    const school = budgetLineFor('escola-verde', 400)!;
    expect(school.basis).toBe('project');
    expect(school.lowBrl).toBeNull();
  });

  test('thousands separators survive', () => {
    expect(budgetLineFor('barraginha')!.notePt).toMatch(/R\$ 70/);
    expect(budgetLineFor('captacao-agua-da-chuva')!.notePt).toMatch(/R\$ 4\.500/);
    expect(budgetLineFor('captacao-agua-da-chuva')!.notePt).toMatch(/R\$ 10\.500/);
  });

  test('a ficha that closes no price says so instead of guessing', () => {
    for (const id of ['parques-lineares', 'sistema-alimentar-local']) {
      const line = budgetLineFor(id)!;
      expect(line.basis).toBe('none');
      expect(line.lowBrl).toBeNull();
      expect(line.notePt).toMatch(/não fecha um preço/);
    }
  });

  test('a per-m² price with no footprint reports the rate, not a total', () => {
    const noArea = budgetLineFor('jardins-de-chuva')!;
    expect(noArea.lowBrl).toBeNull();
    expect(noArea.notePt).toMatch(/Falta desenhar a área/);
    const withArea = budgetLineFor('jardins-de-chuva', 300)!;
    expect(withArea.lowBrl).toBe(120_000);
    expect(withArea.highBrl).toBe(210_000);
  });

  test('the range is never presented as a budget', () => {
    for (const id of Object.keys(SOLUTION_COSTS)) {
      const line = budgetLineFor(id, 250)!;
      expect(line.notePt.length).toBeGreaterThan(20);
      // Every line points at the next action — a quote, a count, a drawing.
      expect(line.notePt).toMatch(/cotação|quantas|orça|Falta desenhar/i);
      expect(line.noteEn).toMatch(/quote|how many|budgeted|footprint/i);
    }
  });

  test('a derived figure always shows its arithmetic', () => {
    for (const [id, cost] of Object.entries(SOLUTION_COSTS)) {
      if (!cost.notaPt) continue;
      const line = budgetLineFor(id, 100)!;
      expect(line.notePt, `${id} hides its derivation`).toContain(cost.notaPt);
      expect(line.noteEn).toContain(cost.notaEn!);
    }
  });

  test('an unknown solution returns nothing rather than a zero', () => {
    expect(budgetLineFor('no-such-solution', 300)).toBeNull();
  });
});

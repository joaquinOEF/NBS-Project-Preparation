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

// ⚠️ NO-SIZE-QUESTION-AT-ALL. `askArea` correctly skips the footprint for a
// solution priced per unit or per project — tracing an outline buys nothing
// when the price is per tree — and then nothing asked the question that DOES
// apply. `budgetLineFor` even ended its own note with "quantas vocês querem?"
// and no beat ever collected the answer, so nine of the 27 solutions left W3
// with a price per cistern, no number of cisterns, no total, and nothing to put
// under "dimensões" in a concept note.

test.describe('W3 sizing — the count, for what is counted rather than measured', () => {
  test('every counted solution can be asked about', () => {
    // The question needs a noun and some counts to offer. Without them the flow
    // silently falls back to asking nothing, which is the hole itself.
    for (const [id, cost] of Object.entries(SOLUTION_COSTS)) {
      if (cost.basis !== 'unit' && cost.basis !== 'project') continue;
      expect(cost.unitPt, `${id} has no unit noun`).toBeTruthy();
      expect(cost.unitPluralPt, `${id} has no plural`).toBeTruthy();
      expect(cost.unitChips?.length, `${id} offers no counts`).toBeGreaterThan(0);
    }
  });

  test('a per-unit band times a count closes a total', () => {
    const five = budgetLineFor('captacao-agua-da-chuva', undefined, 5)!;
    expect(five.lowBrl).toBe(4500 * 5);
    expect(five.highBrl).toBe(10500 * 5);
    expect(five.units).toBe(5);
    expect(five.notePt).toContain('5 cisternas');
    // The reference stays visible: a total nobody can trace back is a total
    // nobody can defend in front of a secretariat.
    expect(five.notePt).toContain('R$ 4.500');
    expect(five.notePt).toMatch(/não um orçamento fechado/);
  });

  test('one of something is singular', () => {
    expect(budgetLineFor('barraginha', undefined, 1)!.notePt).toContain('1 barraginha');
    expect(budgetLineFor('barraginha', undefined, 2)!.notePt).toContain('2 barraginhas');
  });

  test('⚠️ a per-PROJECT band never multiplies', () => {
    // hortas urbanas is "R$ 300–1.200 for a small bed" and "perto de R$ 25.000"
    // for a proper community garden — in the same ficha sentence. Multiplying
    // the small end by a count would hand an organisation a total that reads
    // authoritative and is wrong by an order of magnitude.
    const three = budgetLineFor('hortas-urbanas', undefined, 3)!;
    expect(three.units).toBe(3);
    expect(three.lowBrl, 'no computed total for a per-project band').toBeNull();
    expect(three.highBrl).toBeNull();
    expect(three.notePt).toContain('3 hortas');
    expect(three.notePt).toMatch(/depende do porte/);
  });

  test('without a count, the note still says what one costs', () => {
    const none = budgetLineFor('corredores-verdes')!;
    expect(none.lowBrl).toBeNull();
    expect(none.notePt).toContain('R$ 250');
  });
});

// ⚠️ THE PRICE IGNORED WHO BUILDS IT, AND W3 ASKS WHO BUILDS IT — one beat
// after showing the band. The fichas already knew it mattered: a cistern is
// R$ 4.500 in a Programa Cisternas mutirão against R$ 8.000–10.500 contracted
// by edital; a teto verde is R$ 5/m² built bidim against R$ 150–350 bought in.
// An organisation that answered "mutirão" printed a contractor's price.

test.describe('W3 sizing — who builds it moves the number', () => {
  test('a self-build band replaces the contracted one', () => {
    const bought = budgetLineFor('teto-verde', 100, undefined, 'contratada')!;
    const built = budgetLineFor('teto-verde', 100, undefined, 'mutirao')!;
    expect(bought.lowBrl).toBe(150 * 100);
    expect(built.lowBrl).toBe(5 * 100);
    // …and says which one it is, so nobody quotes the wrong band at a supplier.
    expect(built.notePt).toMatch(/faixa de mutirão da própria ficha/);
  });

  test('⚠️ the note describing the OTHER model does not print beside this one', () => {
    // teto-verde's nota opens "Faixa do sistema comprado pronto", which is
    // false once R$ 5/m² is the band on screen.
    expect(budgetLineFor('teto-verde', 100, undefined, 'mutirao')!.notePt)
      .not.toMatch(/Faixa do sistema comprado pronto/);
    expect(budgetLineFor('teto-verde', 100, undefined, 'contratada')!.notePt)
      .toMatch(/Faixa do sistema comprado pronto/);
  });

  test('the ficha reference stays the ficha range — only the total moves', () => {
    const three = budgetLineFor('captacao-agua-da-chuva', undefined, 3, 'mutirao')!;
    expect(three.lowBrl).toBe(4500 * 3);
    // The parenthetical is labelled "à referência da ficha", so it cites what
    // the ficha says, not the narrowed band.
    expect(three.notePt).toContain('R$ 4.500–R$ 10.500');
  });

  test('a solution the ficha says cannot be self-built says so', () => {
    const note = budgetLineFor('solo-grampeado-verde', 200, undefined, 'mutirao')!.notePt;
    expect(note).toMatch(/Vocês disseram mutirão/);
    expect(note).toMatch(/não dá pra mutirão/);
    // The band does NOT move — there is no self-build price to move it to.
    expect(budgetLineFor('solo-grampeado-verde', 200, undefined, 'mutirao')!.lowBrl)
      .toBe(budgetLineFor('solo-grampeado-verde', 200, undefined, 'contratada')!.lowBrl);
  });

  test('⚠️ where the ficha states nothing, no multiplier is invented', () => {
    // Rain gardens are the most-chosen solution and no source gives a
    // self-build figure — checked, including the Recife per-m³ study, which is
    // a different basis. So the band stands, says what it assumes, and the
    // missing number becomes a named gap rather than a guess.
    const built = budgetLineFor('jardins-de-chuva', 500, undefined, 'mutirao')!;
    const hired = budgetLineFor('jardins-de-chuva', 500, undefined, 'contratada')!;
    expect(built.lowBrl).toBe(hired.lowBrl);
    expect(built.notePt).toMatch(/Esta faixa é de execução contratada/);
    expect(built.builtBySelfWithoutFigure).toBe(true);
  });

  test('every self-build figure is literal in its own ficha', () => {
    // The invariant that makes the mutirão band trustworthy — it is not a
    // discount rate somebody chose. Enforced at module load; asserted here so
    // the reason is written down where it is read.
    for (const [id, cost] of Object.entries(SOLUTION_COSTS)) {
      const bm = cost.buildModel;
      if (!bm?.mutiraoLow) continue;
      const source = NBS_SOLUTION_FICHAS[id].pt.quantoCusta;
      expect(
        source.includes(String(bm.mutiraoLow)) || source.includes(bm.mutiraoLow.toLocaleString('pt-BR')),
        `${id}: ${bm.mutiraoLow} not found in its quantoCusta`,
      ).toBe(true);
    }
  });
});

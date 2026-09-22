import { test, expect } from '@playwright/test';
import { buildSolutionTest } from '../shared/w3-solution-test';
import { buildDossier } from '../shared/w3-dossier';
import { buildRoadmap } from '../shared/w3-roadmap';
import { conceptNoteFacts } from '../shared/concept-note';
import { SOLUTION_COSTS } from '../shared/w3-sizing';
import { NBS_SOLUTIONS } from '../shared/nbs-catalog';
import { sizeOf, serializeTests, type SolutionTest } from '../shared/w3-tests';
import type { W3Input } from '../shared/w3-dossier';

// ONE SOLUTION, ONE PRICE — whichever page it is read on (22 Sept audit).
//
// Two staging records, replayed through the builders:
//   · Caldas Junior — jardins de chuva tested over 836 m². Card and comparison:
//     R$ 334–585 mil. Coordinator board, hoja de ruta, Resumo: R$ 1,16–2,03 mi,
//     over the 2,900 m² drawn for the whole site in Encontro 2.
//   · session c2a6ab61 — 25 street trees on the card, R$ 6.250–12.500; 2 trees
//     everywhere else, because escola-verde's "2 pátios" was tested first and
//     filled the one project-wide `intervention_units`.
// The card priced per test; everything built on the dossier priced per place.
// `sizeOf` is now the one rule, and this spec pins that every surface agrees.

const SITE = {
  bairro: 'Partenon', site_name: 'Colégio Caldas Junior', current_use: 'paved',
  land_tenure: 'formal-agreement', site_worry: 'enxurrada', site_area_m2: '2900',
  _site_lat: '-30.0582', _site_lng: '-51.1598',
};

function inputFor(tests: SolutionTest[], extra: Record<string, string> = {}): W3Input {
  const liked = tests.filter(t => t.reaction === 'faz-sentido').map(t => t.solutionId);
  return {
    site: SITE,
    org: { org_name: 'Org de teste' },
    solutions: liked,
    areaM2: 2900,
    w3: { solution_tests_json: serializeTests(tests), chosen_solutions: liked.join(','), ...extra },
  };
}
const at = '2026-09-22T12:00:00.000Z';

test.describe('a solution is priced at its own test, on every surface', () => {
  test('⚠️ Caldas Junior: the rain garden is 836 m² on the board, the roadmap and the Resumo — not the 2,900 m² site', () => {
    const tests: SolutionTest[] = [
      { solutionId: 'jardins-de-chuva', reaction: 'faz-sentido', areaM2: 836, testedAt: at },
      { solutionId: 'captacao-agua-da-chuva', reaction: 'faz-sentido', units: 5, testedAt: at },
    ];
    const input = inputFor(tests);
    const card = buildSolutionTest('jardins-de-chuva', input, tests[0], 'pt')!;
    const board = buildDossier(input, 'pt').budget.find(b => b.solutionId === 'jardins-de-chuva')!;
    const roadmap = buildRoadmap(input, 'pt').budget.find(b => b.solutionId === 'jardins-de-chuva')!;
    const note = conceptNoteFacts(input, 'pt').solutions.find(s => s.id === 'jardins-de-chuva')!;
    expect(card.sizedBy).toEqual({ areaM2: 836 });
    expect([board.lowBrl, board.highBrl]).toEqual([334_400, 585_200]);
    expect([roadmap.lowBrl, roadmap.highBrl]).toEqual([334_400, 585_200]);
    expect(card.cost!.note).toContain('334.400');
    expect(JSON.stringify(note)).toContain('334.400');
    expect(JSON.stringify(note)).not.toContain('1.160.000');
  });

  test('⚠️ c2a6ab61: 25 trees stay 25 when a schoolyard counted 2 was tested first', () => {
    const tests: SolutionTest[] = [
      { solutionId: 'escola-verde', reaction: 'faz-sentido', units: 2, testedAt: at },
      { solutionId: 'corredores-verdes', reaction: 'faz-sentido', units: 25, testedAt: at },
    ];
    // The legacy single field still holds the first liked count, as the flow writes it.
    const input = inputFor(tests, { intervention_units: '2' });
    const board = buildDossier(input, 'pt').budget.find(b => b.solutionId === 'corredores-verdes')!;
    expect(board.units).toBe(25);
    expect([board.lowBrl, board.highBrl]).toEqual([6_250, 12_500]);
    expect(buildRoadmap(input, 'pt').budget.find(b => b.solutionId === 'corredores-verdes')!.units).toBe(25);
  });

  test('every priced solution: card, board and roadmap print the same line at its own test size', () => {
    for (const s of NBS_SOLUTIONS) {
      const cost = SOLUTION_COSTS[s.id];
      if (!cost) continue;
      const test: SolutionTest = cost.basis === 'm2'
        ? { solutionId: s.id, reaction: 'faz-sentido', areaM2: 120, testedAt: at }
        : { solutionId: s.id, reaction: 'faz-sentido', units: 7, testedAt: at };
      // A second, larger-sized solution tested first — what used to leak onto every line.
      const first: SolutionTest = { solutionId: s.id === 'teto-verde' ? 'jardins-de-chuva' : 'teto-verde', reaction: 'faz-sentido', areaM2: 600, units: 3, testedAt: at };
      const input = inputFor([first, test], { intervention_units: '3' });
      const card = buildSolutionTest(s.id, input, test, 'pt')!;
      const board = buildDossier(input, 'pt').budget.find(b => b.solutionId === s.id)!;
      const roadmap = buildRoadmap(input, 'pt').budget.find(b => b.solutionId === s.id)!;
      expect(board.notePt, s.id).toBe(card.cost!.note);
      expect(roadmap.notePt, s.id).toBe(card.cost!.note);
    }
  });

  test('the rule itself: 0 is "asked and unknown", never the site; no test falls back to how old records were written', () => {
    const input = inputFor([{ solutionId: 'jardins-de-chuva', reaction: 'faz-sentido', areaM2: 0, testedAt: at }], { intervention_units: '4' });
    expect(sizeOf('jardins-de-chuva', input)).toEqual({ areaM2: undefined, units: undefined });
    // A session from before per-test sizes: the footprint WAS the answer.
    expect(sizeOf('jardins-de-chuva', inputFor([{ solutionId: 'jardins-de-chuva', reaction: 'faz-sentido', testedAt: at }]))).toEqual({ areaM2: 2900, units: undefined });
    // A record from before the loop: no tests at all.
    expect(sizeOf('cisternas', { site: SITE, w3: { intervention_units: '4' } })).toEqual({ areaM2: 2900, units: 4 });
  });
});

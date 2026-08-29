import { test, expect } from '@playwright/test';
import {
  NBS_SOLUTIONS, SOLUTION_MECHANISMS, orderSolutionsByMechanism, mechanismNote,
  solutionsForFamilia,
} from '../shared/nbs-catalog';
import { WORRY_SUBTYPES } from '../shared/site-knowledge';

// Backlog #24, second half. COUGAR convening: "solution types differ
// fundamentally by hazard type" — an org that says Inundação should not be shown
// rain gardens first, because a rain garden answers Alagamento.
//
// The two rules that make a wrong tag cheap are what these pin:
//   1. ORDER AND EXPLAIN, NEVER EXCLUDE — the flow promises "nada fica
//      descartado", so every solution stays reachable whatever the tags say.
//   2. The tags are OUR read, drafted from each solution's own whatItIs, and
//      marked provisional until Robson/Hesioni confirm.

test.describe('solution mechanisms — ordering, never hiding', () => {
  test('⚠️ nothing is ever removed, whatever the org named', () => {
    for (const familia of ['aguas-pluviais', 'verde-urbano', 'encostas-e-solo'] as const) {
      const all = solutionsForFamilia(familia);
      for (const worries of [['inundacao'], ['alagamento'], ['enxurrada', 'heat'], ['other'], []]) {
        const ordered = orderSolutionsByMechanism(all, worries);
        expect(ordered, `${familia} / ${worries.join('+')} must keep every solution`)
          .toHaveLength(all.length);
        expect(new Set(ordered.map(s => s.id))).toEqual(new Set(all.map(s => s.id)));
      }
    }
  });

  test('Inundação leads with the river answers, not the rain garden', () => {
    const water = solutionsForFamilia('aguas-pluviais');
    const first = orderSolutionsByMechanism(water, ['inundacao'])[0];
    expect(SOLUTION_MECHANISMS[first.id]).toContain('inundacao');
    // …and the rain garden is still there, just not first.
    const ids = orderSolutionsByMechanism(water, ['inundacao']).map(s => s.id);
    expect(ids).toContain('jardins-de-chuva');
    expect(ids.indexOf('jardins-de-chuva')).toBeGreaterThan(0);
  });

  test('Alagamento leads with infiltration — the everyday-water answers', () => {
    const water = solutionsForFamilia('aguas-pluviais');
    const first = orderSolutionsByMechanism(water, ['alagamento'])[0];
    expect(SOLUTION_MECHANISMS[first.id]).toContain('alagamento');
  });

  test('Enxurrada leads with the ones that name velocity or slope', () => {
    const water = solutionsForFamilia('aguas-pluviais');
    const top = orderSolutionsByMechanism(water, ['enxurrada'])
      .slice(0, 4).map(s => s.id);
    // "escada hidráulica vegetada" says it in its own description:
    // "terrenos inclinados, diminuindo sua velocidade".
    expect(top).toContain('escada-hidraulica-vegetada');
  });

  test('no worry named, or only "outra coisa" — catalogue order, untouched', () => {
    const water = solutionsForFamilia('aguas-pluviais');
    for (const worries of [[], ['other']]) {
      expect(orderSolutionsByMechanism(water, worries).map(s => s.id))
        .toEqual(water.map(s => s.id));
    }
  });

  test('every tag names a real mechanism, and every solution is accounted for', () => {
    const known = new Set(WORRY_SUBTYPES.map(w => w.id));
    for (const [id, tags] of Object.entries(SOLUTION_MECHANISMS)) {
      expect(NBS_SOLUTIONS.some(s => s.id === id), `${id} is not a solution`).toBe(true);
      for (const t of tags) expect(known, `${id} tagged with unknown "${t}"`).toContain(t);
    }
    // Every solution has an ENTRY — an empty list is a deliberate "neutral",
    // a missing key is someone forgetting. The difference matters when a
    // domain expert reads this map to confirm it.
    for (const s of NBS_SOLUTIONS) {
      expect(SOLUTION_MECHANISMS[s.id], `${s.id} has no entry`).toBeDefined();
    }
  });

  test('the note speaks the org\'s words back, or says nothing', () => {
    // Reuses the exact plain-language phrase from the chip they tapped, so the
    // card and the question agree.
    // The subtype descriptions are written as standalone chip captions ("A água
    // que desce com força"), so the article belongs to them and the contraction
    // is ours: "pra a" and "pra o" are things nobody says. This spec pinned the
    // uncontracted strings until W3 became the first caller to actually render
    // the note.
    expect(mechanismNote('escada-hidraulica-vegetada', ['enxurrada'], 'pt'))
      .toBe('pra água que desce com força');
    expect(mechanismNote('parques-lineares', ['inundacao'], 'pt'))
      .toBe('pro rio ou arroio que transborda');
    // No match → no badge. A badge that says nothing is worse than none.
    expect(mechanismNote('jardins-de-chuva', ['inundacao'], 'pt')).toBeNull();
    expect(mechanismNote('hortas-urbanas', ['alagamento'], 'pt')).toBeNull();
  });
});

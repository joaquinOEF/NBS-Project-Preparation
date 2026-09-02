import { test, expect } from '@playwright/test';
import { scoreW3Maturity } from '../shared/w3-maturity';
import { PHASE_COMPLETION_METRICS, phaseComplete } from '../shared/cbo-schema';

// ⚠️ FOUR SCORES NOBODY EVER WROTE. `PHASE_COMPLETION_METRICS[3]` has named
// problem_clarity, solution_clarity, climate_nbs_impact and financial_thinking
// since the schema was written, the close gate that reads them has always
// existed, and nothing ever called score_maturity — so every organisation left
// the encontro that produces the most with an unscored record and a blank cell
// on the coordinator's roster.

test.describe('the four scores Encontro 3 owes', () => {
  const rich = () => scoreW3Maturity({
    site: { site_story: 'A água fica dias parada.', site_worry: 'alagamento' },
    w3: {
      justification_why_here: 'É onde a água desce.', baseline_condition: 'Terra batida.',
      construction_model: 'mutirao', expected_impact: '75 mil litros',
      expected_impact_reaction: 'faz-sentido', sustainability_model: 'edital',
      maintenance_frequency: 'trimestral',
    },
    solutions: ['jardins-de-chuva'], areaM2: 500, hasCostBand: true,
  });

  test('it scores exactly the metrics the phase declares — no more, no fewer', () => {
    // The gate reads PHASE_COMPLETION_METRICS[3]; scoring anything else leaves
    // it unsatisfied forever, which is the state this replaces.
    expect(rich().map(s => s.metric).sort()).toEqual([...PHASE_COMPLETION_METRICS[3]].sort());
  });

  test('a complete record scores full marks, and says why for each', () => {
    for (const s of rich()) {
      expect(s.score, s.metric).toBe(3);
      expect(s.justification.length, s.metric).toBeGreaterThan(10);
    }
  });

  test('⚠️ an empty record scores zero WITHOUT blaming anyone', () => {
    // 0 means "we never asked", never "they failed" — the justification is the
    // difference, and a coordinator reads it.
    for (const s of scoreW3Maturity({ site: {}, w3: {}, solutions: [], hasCostBand: false })) {
      expect(s.score).toBe(0);
      expect(s.justification).toMatch(/não perguntada|nada registrado|nenhuma solução|sem linha de base/);
    }
  });

  test('"ainda não sabemos" about money scores, because it is an answer', () => {
    // An organisation that faced the question and says it does not know is
    // ahead of one that was never asked, and the encontro says so out loud.
    const unsure = scoreW3Maturity({
      site: {}, w3: { sustainability_model: 'indefinido' }, solutions: [], hasCostBand: false,
    }).find(s => s.metric === 'financial_thinking')!;
    expect(unsure.score).toBe(1);
    expect(unsure.justification).toMatch(/resposta honesta|vira pauta/);
  });

  test('the scores make phaseComplete(3) true — which is the whole point', () => {
    const state = { sections: {}, maturityScores: rich() } as any;
    expect(phaseComplete(state, 3)).toBe(true);
  });
});

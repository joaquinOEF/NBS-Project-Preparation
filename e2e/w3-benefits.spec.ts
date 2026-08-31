import { test, expect } from '@playwright/test';
import { SOLUTION_BENEFITS, benefitFor } from '../shared/w3-benefits';
import { NBS_SOLUTIONS } from '../shared/nbs-catalog';
import { retentionFor } from '../shared/nbs-performance';
import { buildRoadmap } from '../shared/w3-roadmap';

// W3 BENEFITS — the half of the argument W3 supplies rather than collects.
//
// The rule these pin: WE bring the number, they react to it. An organisation
// asked "quantos litros vocês esperam segurar?" answers with a blank or a
// guess, and a guess we store becomes data. So the figure has to be ours, it
// has to be sourced, and it has to be right — because a benefit number is the
// thing an organisation repeats to a secretariat, and a wrong one is worse than
// a blank and louder.

test.describe('W3 benefits — the number is ours, and it has to be right', () => {
  test('a cubic metre is a thousand litres', () => {
    // The first version divided where it should have multiplied: 3,000 m³
    // printed as "3 mil litros" — a thousand times under, in the one figure an
    // organisation would say out loud.
    const small = benefitFor('jardins-de-chuva', 500)!;
    expect(small.headlinePt).toContain('75.000');
    expect(small.headlinePt).toContain('175.000');
    const big = benefitFor('jardins-de-chuva', 20_000)!;
    expect(big.headlinePt).toMatch(/milhões de litros/);
    expect(big.headlinePt).not.toMatch(/\b3 mil litros\b/);
  });

  test('a unit is not a suggestion', () => {
    // Biovaletas are quoted per LINEAR metre and permeable paving as a flow
    // RATE per hour. Multiplying either by a polygon's m² is how you publish a
    // confident wrong number.
    const swale = benefitFor('biovaletas', 500)!;
    expect(swale.basis).toBe('rate');
    expect(swale.headlinePt).not.toMatch(/litros de água que hoje vai pra rua/);
    expect(swale.notaPt, 'must say what is missing').toMatch(/comprimento/);

    const paving = benefitFor('pavimentos-permeaveis', 500)!;
    expect(paving.basis).toBe('rate');
    expect(paving.notaPt).toMatch(/velocidade|infiltração/);
  });

  test('15 solutions have no number, and none of them invents one', () => {
    const silent = NBS_SOLUTIONS.filter(s => !benefitFor(s.id, 500)!.headlinePt);
    expect(silent.length).toBeGreaterThan(0);
    for (const s of silent) {
      const b = benefitFor(s.id, 500)!;
      // No number, but never nothing: it still says what the thing does.
      expect(b.claimPt.length, `${s.id} must still say what it does`).toBeGreaterThan(20);
      expect(b.basis).toMatch(/qualitative|area_effect/);
    }
    // The whole slope family is in here — the repo holds no erosion or
    // stability figure anywhere, and that is the honest answer.
    for (const id of ['grade-viva', 'muro-de-arrimo-verde', 'solo-grampeado-verde', 'contencoes-em-geocelulas']) {
      expect(benefitFor(id, 500)!.headlinePt, `${id} must not claim a number`).toBeNull();
    }
  });

  test('every per-m² figure still matches the performance table', () => {
    // Module load throws otherwise; restated so the failure names itself. A
    // benefit that drifts from nbs-performance puts a different number in the
    // roadmap than in the technical annex.
    for (const s of NBS_SOLUTIONS) {
      const b = SOLUTION_BENEFITS[s.id];
      const perf = retentionFor(s.id);
      if (!perf || b.notaPt) continue;
      expect(b.low, `${s.id} low`).toBe(perf.min);
      expect(b.high, `${s.id} high`).toBe(perf.max);
    }
  });

  test('a borrowed figure declares itself', () => {
    // The stormwater planter uses the rain garden's range because its own ficha
    // calls it "um jardim de chuva compactado" — legitimate, and it has to say
    // so on the page rather than in a code comment.
    const planter = benefitFor('canteiro-pluvial', 100)!;
    expect(planter.notaPt).toMatch(/jardim de chuva compactado/);
    expect(planter.confidence).toBe('baixa');
  });

  test('every solution is answered for', () => {
    for (const s of NBS_SOLUTIONS) expect(benefitFor(s.id), s.id).not.toBeNull();
    expect(Object.keys(SOLUTION_BENEFITS).length).toBe(NBS_SOLUTIONS.length);
  });

  test('secondary effects scale off the area, or say they do not', () => {
    const forest = benefitFor('reflorestamento', 10_000)!; // one hectare
    const carbon = forest.extrasPt.find(e => e.startsWith('carbono'))!;
    expect(carbon).toBeTruthy();
    // 3–11 tCO2e/ha/yr over exactly one hectare.
    expect(carbon).toMatch(/entre 3 e 11/);
    // Cooling does not scale linearly and is stated, not multiplied.
    const park = benefitFor('parques-e-florestas-urbanas', 500)!;
    expect(park.extrasPt.some(e => /temperatura/.test(e) && !/\d+,\d+ toneladas/.test(e))).toBe(true);
  });
});

test.describe('W3 roadmap — a draft route, not a verdict', () => {
  const SARANDI = {
    org: { org_name: 'Horta Raízes do Sarandi', contact_name: 'Marlene', prior_project_scale: 'funded' },
    site: {
      bairro: 'Sarandi', site_name: 'Terreno ao lado da horta',
      site_lat: '-30.0906', site_lng: '-51.1726',
      land_tenure: 'public-informal', site_worry: 'alagamento',
      site_story: 'Quando chove forte a água entra pelo fundo.',
      site_knowledge_depth: 'strong', site_area_m2: '500',
    },
    solutions: ['jardins-de-chuva'],
    areaM2: 500,
    w3: {
      justification_why_here: 'É o único terreno livre do quarteirão.',
      baseline_condition: 'Terra batida com entulho.',
      construction_model: 'mista', project_timeframe: '1-ano',
      monitoring_capacity: 'parceiro', who_maintains: 'parceria-prefeitura',
      maintenance_frequency: 'trimestral', sustainability_model: 'indefinido',
      expected_impact_reaction: 'parece-pouco',
    },
  };

  test('every block says where it came from and what would change it', () => {
    const r = buildRoadmap(SARANDI as any, 'pt');
    // A route you cannot redirect is a verdict wearing a friendlier word.
    for (const b of [...r.what, ...r.how]) {
      expect(b.from, `${b.title} must cite its source`).toBeTruthy();
    }
    const changeable = [...r.what, ...r.how].filter(b => b.changedBy);
    expect(changeable.length).toBeGreaterThanOrEqual(5);
  });

  test('"parece pouco" is honoured, not smoothed over', () => {
    const r = buildRoadmap(SARANDI as any, 'pt');
    const expect_ = r.what.find(b => /espera que aconteça/.test(b.title))!;
    expect(expect_.lines.join(' ')).toMatch(/parece pouco/);
    // And it carries the reason they are right — the 2024 scale note.
    expect(expect_.lines.join(' ')).toMatch(/2024/);
  });

  test('the open questions are part of the route, not an appendix', () => {
    const r = buildRoadmap(SARANDI as any, 'pt');
    expect(r.open.length).toBeGreaterThan(0);
    // Recurring money is unanswered — the block says so rather than reading as complete.
    expect(r.how.some(b => b.open)).toBe(true);
    expect(r.steps.length).toBeGreaterThan(3);
    expect(r.steps.every(s => s.owner === 'org' || s.owner === 'coordination')).toBe(true);
  });

  test('an organisation with almost nothing still gets a usable route', () => {
    const thin = { org: { org_name: 'Grupo Novo' }, site: { bairro: 'Rubem Berta' }, solutions: [], w3: {} };
    const r = buildRoadmap(thin as any, 'pt');
    expect(r.state).toBe('needs_site');
    expect(r.what.length).toBeGreaterThan(0);
    // It says what is missing rather than rendering blanks.
    expect(r.what.some(b => b.open)).toBe(true);
    expect(r.open.join(' ')).toMatch(/lugar/);
  });

  test('both languages produce the same shape', () => {
    const pt = buildRoadmap(SARANDI as any, 'pt');
    const en = buildRoadmap(SARANDI as any, 'en');
    expect(en.what.length).toBe(pt.what.length);
    expect(en.how.length).toBe(pt.how.length);
    expect(en.steps.length).toBe(pt.steps.length);
    expect(en.what[0].title).not.toBe(pt.what[0].title);
  });
});

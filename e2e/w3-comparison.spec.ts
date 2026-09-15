import { test, expect } from '@playwright/test';
import { buildSolutionTest } from '../shared/w3-solution-test';
import { buildComparison, prosAndCons } from '../shared/w3-comparison';
import { parseTests, serializeTests, upsertTest, likedIds, seedTestsFromChosen, REACTION, type SolutionTest } from '../shared/w3-tests';
import { NBS_SOLUTIONS } from '../shared/nbs-catalog';
import { SOLUTION_COSTS } from '../shared/w3-sizing';
import type { W3Input } from '../shared/w3-dossier';
import { renderComparisonHtml, renderScenarioHtml } from '../server/services/comparisonPrint';

// THE TEST CARD AND THE COMPARISON — what Encontro 3 hands back since the
// 10 September meeting. Both are pure functions over the record and the
// catalogue; both are pinned here so a solution cannot ship without its four
// answers, and a comparison cannot say more or less than what was tested.

const SARANDI: W3Input = {
  org: { org_name: 'Raízes do Sarandi', contact_name: 'Marlene' },
  site: {
    bairro: 'Sarandi', site_lat: '-30.0906', site_lng: '-51.1726',
    site_name: 'Pátio da EMEI Solar', site_story: 'Quando chove forte a água entra pelo fundo.',
    site_worry: 'alagamento', current_use: 'paved', land_tenure: 'public-informal',
    nbs_interest: 'aguas-pluviais',
  },
  solutions: ['jardins-de-chuva'],
  areaM2: 500,
  w3: { construction_model: 'mutirao' },
};

const at = '2026-09-30T12:00:00.000Z';

test.describe('one test — every solution gets the same four answers', () => {
  test('all 27 build a card with every row present', () => {
    const missing: string[] = [];
    for (const s of NBS_SOLUTIONS) {
      const card = buildSolutionTest(s.id, SARANDI, { solutionId: s.id, reaction: null, units: 2, testedAt: at }, 'pt');
      if (!card) { missing.push(`${s.id}: no card`); continue; }
      if (!card.needs.length) missing.push(`${s.id}: needs`);
      if (!card.verdict?.state) missing.push(`${s.id}: verdict`);
      if (!card.effect.claim) missing.push(`${s.id}: effect`);
      if (!card.upkeep) missing.push(`${s.id}: upkeep`);
      if (!card.complexity.level) missing.push(`${s.id}: complexity`);
      // Priced, or honest about not being priced — never blank.
      if (!card.cost) missing.push(`${s.id}: cost (basis ${SOLUTION_COSTS[s.id]?.basis})`);
      if (s.tipo === 'apoio' && !card.supportingMeasure) missing.push(`${s.id}: apoio badge`);
      if (s.tipo === 'sbn' && card.supportingMeasure) missing.push(`${s.id}: badged apoio but is sbn`);
    }
    expect(missing).toEqual([]);
  });

  test('the count on the card is the TEST\'s, not the project\'s', () => {
    // Two per-unit solutions, two different counts, one project.
    const a = buildSolutionTest('captacao-agua-da-chuva', SARANDI, { solutionId: 'captacao-agua-da-chuva', reaction: null, units: 2, testedAt: at }, 'pt')!;
    const b = buildSolutionTest('captacao-agua-da-chuva', SARANDI, { solutionId: 'captacao-agua-da-chuva', reaction: null, units: 5, testedAt: at }, 'pt')!;
    expect(a.cost?.note).toContain('2 cisternas');
    expect(b.cost?.note).toContain('5 cisternas');
    expect(a.sizedBy.units).toBe(2);
  });

  test('the footprint is the place\'s, so a per-m² card prices the drawn area', () => {
    const card = buildSolutionTest('jardins-de-chuva', SARANDI, { solutionId: 'jardins-de-chuva', reaction: null, testedAt: at }, 'pt')!;
    expect(card.cost?.note).toMatch(/500 m²/);
    expect(card.sizedBy.areaM2).toBe(500);
    // And the effect over that footprint, with the scale note attached once.
    expect(card.effect.siteSpecific).toBe(true);
    expect(card.effect.headline).toBeTruthy();
  });

  test('it says what argues against it, from the site record', () => {
    const card = buildSolutionTest('restauracao-areas-umidas', SARANDI, undefined, 'pt')!;
    expect(card.caveat, 'no wetland in the record → the card says so').toMatch(/banhado|curso d.água/i);
    const ok = buildSolutionTest('jardins-de-chuva', SARANDI, undefined, 'pt')!;
    expect(ok.answersWorry).toMatch(/junta/);
  });
});

test.describe('the comparison — one column per test, nothing more or less', () => {
  const tests: SolutionTest[] = [
    { solutionId: 'jardins-de-chuva', reaction: 'faz-sentido', testedAt: at, detailQuestionId: 'soil-type', detailAnswer: 'Mais barro — a água empoça' },
    { solutionId: 'biovaletas', reaction: 'nao-e-pra-gente', testedAt: at },
    { solutionId: 'hortas-urbanas', reaction: 'ainda-nao-sabemos', units: 2, testedAt: at },
  ];

  test('columns = tests, in the order they were tried', () => {
    const cmp = buildComparison(SARANDI, tests, 'pt');
    expect(cmp.columns.map(c => c.solutionId)).toEqual(['jardins-de-chuva', 'biovaletas', 'hortas-urbanas']);
    expect(cmp.columns.map(c => c.reaction?.value)).toEqual(['faz-sentido', 'nao-e-pra-gente', 'ainda-nao-sabemos']);
    expect(cmp.columns[0].detail).toBe('Mais barro — a água empoça');
  });

  test('the reaction is written in the page register, not the chip\'s', () => {
    const cmp = buildComparison(SARANDI, tests, 'pt');
    expect(cmp.columns[1].reaction?.text).toBe('Descartada pela organização');
    expect(cmp.columns[1].reaction?.text).not.toBe(REACTION['nao-e-pra-gente'].chipPt);
  });

  test('pros and cons are rules over the card, each with a source', () => {
    const cmp = buildComparison(SARANDI, tests, 'pt');
    for (const col of cmp.columns) {
      for (const p of [...col.pros, ...col.cons]) {
        expect(p.source.length, `${col.solutionId}: "${p.text}"`).toBeGreaterThan(3);
      }
    }
    // A rain garden answers the ponding they named and needs a study — one of each.
    const jc = cmp.columns[0];
    expect(jc.pros.some(p => /junta/.test(p.text))).toBe(true);
    expect(jc.cons.some(p => /infiltra/.test(p.text))).toBe(true);
    // An unnumbered solution says so rather than inventing a figure.
    const hortas = cmp.columns[2];
    expect(hortas.cons.some(p => /sem número de referência/i.test(p.text))).toBe(true);
    // The rules alone, for the 27: never throw, always sourced.
    for (const s of NBS_SOLUTIONS) {
      const card = buildSolutionTest(s.id, SARANDI, undefined, 'pt')!;
      const { pros, cons } = prosAndCons(card, 'pt');
      for (const p of [...pros, ...cons]) expect(p.source).toBeTruthy();
    }
  });

  test('⚠️ nothing on the page speaks in the second person', () => {
    const cmp = buildComparison(SARANDI, tests, 'pt', 'Visita de 28/09: o pátio drena para a rua de baixo.');
    const SECOND = /\b(voc[eê]s|vcs|nosso|nossa|nossos|nossas)\b|\ba gente\b/i;
    const cells: string[] = [];
    for (const col of cmp.columns) {
      cells.push(col.card.complexity.detail, ...col.card.needs, col.card.verdict.why, col.card.verdict.unblockedBy,
        col.card.effect.claim, col.card.effect.headline ?? '', col.card.cost?.note ?? '', col.card.upkeep,
        ...col.pros.map(p => p.text), ...col.cons.map(p => p.text), col.reaction?.text ?? '');
    }
    cells.push(...cmp.rows.map(r => r.label), cmp.docLabel, cmp.docAudience);
    const hits = cells.filter(c => SECOND.test(c));
    expect(hits, 'the workshop speaks; the document is written').toEqual([]);
    // The printed page too — headings and footer included; the technical note
    // and the detail answer are quoted, so they are stripped first.
    const html = renderComparisonHtml(cmp, 'pt')
      .replace('Visita de 28/09: o pátio drena para a rua de baixo.', '')
      .replace('Mais barro — a água empoça', '');
    const text = html.replace(/<style[\s\S]*?<\/style>/g, '').replace(/<[^>]+>/g, ' ');
    expect(text.match(new RegExp(SECOND.source, 'gi')) ?? []).toEqual([]);
    expect(html).toContain('RASCUNHO');
    expect(html).toContain('Leitura técnica da coordenação');
    for (const col of cmp.columns) expect(html).toContain(col.label);
  });

  test('each scenario prints alone, in the same register', () => {
    const cmp = buildComparison(SARANDI, tests, 'pt', 'Visita de 28/09: o pátio drena para a rua de baixo.');
    const SECOND = /\b(voc[eê]s|vcs|nosso|nossa|nossos|nossas)\b|\ba gente\b/i;
    for (const col of cmp.columns) {
      const html = renderScenarioHtml(col, cmp, 'pt')
        .replace('Visita de 28/09: o pátio drena para a rua de baixo.', '')
        .replace('Mais barro — a água empoça', '');
      expect(html).toContain('RASCUNHO');
      expect(html).toContain(col.label);
      expect(html).toContain('Cenário');
      const text = html.replace(/<style[\s\S]*?<\/style>/g, '').replace(/<[^>]+>/g, ' ');
      expect(text.match(new RegExp(SECOND.source, 'gi')) ?? [], col.solutionId).toEqual([]);
      expect(text).not.toMatch(/\b(faz-sentido|nao-e-pra-gente|needs_study|public-informal|quemPrecisaDizerSim|intervention_site)\b/);
    }
    expect(renderScenarioHtml(cmp.columns[2], cmp, 'pt')).toContain('Calculado para 2 unidades');
  });

  test('no machine id reaches a person', () => {
    const cmp = buildComparison(SARANDI, tests, 'pt');
    const html = renderComparisonHtml(cmp, 'pt');
    const body = html.replace(/<style[\s\S]*?<\/style>/g, '').replace(/data-[a-z-]+="[^"]*"/g, '');
    expect(body).not.toMatch(/\b(faz-sentido|nao-e-pra-gente|ainda-nao-sabemos|needs_study|needs_permission|public-informal|aguas-pluviais|quemPrecisaDizerSim|intervention_site|land_tenure|jardins-de-chuva|hortas-urbanas)\b/);
  });

  test('English renders too', () => {
    const cmp = buildComparison(SARANDI, tests, 'en');
    expect(cmp.docLabel).toBe('Comparison of the solutions tested');
    expect(cmp.columns[1].reaction?.text).toBe('Set aside by the organisation');
    expect(renderComparisonHtml(cmp, 'en')).toContain('DRAFT');
  });
});

test.describe('the tests record — and chosen_solutions derived from it', () => {
  test('round-trips, upserts in order, and derives the liked ones', () => {
    let tests = parseTests(undefined);
    expect(tests).toEqual([]);
    tests = upsertTest(tests, { solutionId: 'a' });
    tests = upsertTest(tests, { solutionId: 'b', units: 3 });
    tests = upsertTest(tests, { solutionId: 'a', reaction: 'faz-sentido' });
    expect(tests.map(t => t.solutionId)).toEqual(['a', 'b']);
    expect(tests[0].reaction).toBe('faz-sentido');
    expect(tests[1].units).toBe(3);
    expect(likedIds(tests)).toEqual(['a']);
    expect(parseTests(serializeTests(tests))).toEqual(tests);
    expect(parseTests('not json')).toEqual([]);
  });

  test('a session from before the loop is seeded from its chosen_solutions — once', () => {
    const seeded = seedTestsFromChosen([], ['jardins-de-chuva', 'biovaletas']);
    expect(seeded.map(t => t.solutionId)).toEqual(['jardins-de-chuva', 'biovaletas']);
    expect(seeded.every(t => t.reaction === 'faz-sentido')).toBe(true);
    // Never over an existing record.
    const existing: SolutionTest[] = [{ solutionId: 'hortas-urbanas', reaction: null, testedAt: at }];
    expect(seedTestsFromChosen(existing, ['jardins-de-chuva'])).toBe(existing);
  });
});

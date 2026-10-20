import { test, expect } from '@playwright/test';
import { budgetLineFor } from '../shared/w3-sizing';
import { portfolioOrg, projectCard } from '../shared/preportfolio';
import { buildPrenote, prenoteInputFromSections } from '../shared/e4-prenote';
import { renderPreportfolioHtml } from '../server/services/preportfolioPrint';
import { createEmptyCboState } from '../shared/cbo-schema';

// WHY THE REAL COHORT'S PRE-PORTFOLIO SUMMED TO R$ 200–331 MIL FOR EIGHT
// ORGANISATIONS (audit, 20 Oct 2026, the prod copy on staging):
//   - seven of eight sizes were the PILOT the organisation named in Encontro 3
//     ("até 50 m², do tamanho de uma sala") and none had been measured at a
//     technical visit — the page has to say whose number the size is;
//   - a 1.200 m² community garden printed "sem estimativa", because the ficha
//     prices a garden per instance and the total was withheld for want of a
//     size it already had.

const record = (fields: Record<string, Record<string, string>>) => {
  const s = createEmptyCboState('porto-alegre');
  for (const [sec, kv] of Object.entries(fields)) {
    for (const [k, v] of Object.entries(kv)) (s.sections as any)[sec].fields[k] = { value: v, confidence: 'high', source: 'user', userEdited: false };
  }
  return s;
};

test.describe('a garden is priced at the size on record', () => {
  test('above the ficha\'s 50 m², its own community-garden figure', () => {
    const line = budgetLineFor('hortas-urbanas', 1200)!;
    expect(line).toMatchObject({ lowBrl: 25000, highBrl: 25000, units: 1, areaM2: 1200 });
    expect(line.notePt).toContain('porte médio');
  });

  test('up to 50 m², the small-garden band', () => {
    expect(budgetLineFor('hortas-urbanas', 40)).toMatchObject({ lowBrl: 300, highBrl: 1200 });
  });

  test('with no area, the total is still withheld — a count says nothing about the size', () => {
    expect(budgetLineFor('hortas-urbanas', undefined, 2)).toMatchObject({ lowBrl: null, highBrl: null, units: 2 });
  });

  test('with a count, the area is the place\'s, not one garden\'s — still withheld', () => {
    expect(budgetLineFor('hortas-urbanas', 2900, 7)).toMatchObject({ lowBrl: null, highBrl: null, units: 7 });
  });

  test('Associação Vitória\'s pre-note now carries a value', () => {
    const s = record({
      intervention_site: { bairro: 'Humaitá', site_worry: 'alagamento' },
      intervention_type: {
        solution_tests_json: JSON.stringify([{ solutionId: 'hortas-urbanas', reaction: 'faz-sentido', units: 1, testedAt: '2026-09-29T20:38:00Z' }]),
        _e4_solution_json: JSON.stringify({ solutionId: 'hortas-urbanas', source: 'organizacao', areaM2: 1200 }),
      },
    });
    const note = buildPrenote(prenoteInputFromSections(s.sections as any, 'pt'));
    expect(note.total).toEqual({ low: 25000, high: 25000 });
  });
});

test.describe('the page says whose number the size is', () => {
  const tested = JSON.stringify([{ solutionId: 'jardins-de-chuva', reaction: 'faz-sentido', areaM2: 40, testedAt: '2026-09-30T01:40:00Z' }]);
  const pilot = record({ intervention_site: { bairro: 'Restinga', site_worry: 'alagamento' }, intervention_type: { solution_tests_json: tested } });
  const measured = record({
    intervention_site: { bairro: 'Floresta', site_worry: 'alagamento' },
    intervention_type: { solution_tests_json: tested, _visit_json: JSON.stringify({ solutionId: 'jardins-de-chuva', areaM2: 140, date: '2026-10-23', recordedAt: 'x' }) },
  });

  test('a size from the visit is measured; one said in Encontro 3 is the pilot', () => {
    const a = portfolioOrg('a', 'Sementes da Vida Nova', pilot.sections);
    const b = portfolioOrg('b', 'Ksa Rosa', measured.sections);
    expect(a.sizeMeasured).toBe(false);
    expect(b.sizeMeasured).toBe(true);
    expect(projectCard(['a', 'b'], [a, b]).pilotSized).toEqual(['Sementes da Vida Nova']);
  });

  test('the printed pre-portfolio names the pilot scale, on the cover and on each row', () => {
    const a = portfolioOrg('a', 'Sementes da Vida Nova', pilot.sections);
    const b = portfolioOrg('b', 'Ksa Rosa', measured.sections);
    const html = renderPreportfolioHtml({
      cohortName: 'Rede SCbN',
      groups: [{ memberIds: ['a', 'b'] } as any],
      orgs: [a, b],
      prenotes: new Map([['a', buildPrenote(prenoteInputFromSections(pilot.sections as any, 'pt'))], ['b', buildPrenote(prenoteInputFromSections(measured.sections as any, 'pt'))]]),
    });
    expect(html).toContain('<strong>Escala piloto:</strong> 1 de 2 tamanhos ainda não foi medido na visita técnica');
    expect(html).toContain('40 m² · escala piloto, dita no Encontro 3');
    expect(html).toContain('140 m² · medido na visita técnica');
  });
});

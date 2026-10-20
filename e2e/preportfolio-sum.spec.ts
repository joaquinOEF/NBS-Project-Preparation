import { test, expect } from '@playwright/test';
import { portfolioOrg, projectCard, ALWAYS_OUTSIDE_PT } from '../shared/preportfolio';
import { buildPrenote, prenoteInputFromSections } from '../shared/e4-prenote';
import { renderPreportfolioHtml } from '../server/services/preportfolioPrint';
import { createEmptyCboState } from '../shared/cbo-schema';

// WHAT THE SUM IS. The pre-portfolio's estimate adds only rows with a published
// price — the works at the ficha's reference, a study priced in w3-studies —
// and never a percentage we chose (audit, 20 Oct 2026: GIZ and edital figures
// may already carry a contractor's overhead, so a TCU BDI on top could count it
// twice). What it leaves out is therefore NAMED, on the cover and per project,
// so a low number reads as "this much is priced", not as "this is the cost".

const record = (sol: string, areaM2: number, extra: Record<string, string> = {}) => {
  const s = createEmptyCboState('porto-alegre');
  const set = (sec: string, k: string, v: string) => { (s.sections as any)[sec].fields[k] = { value: v, confidence: 'high', source: 'user', userEdited: false }; };
  set('intervention_site', 'bairro', 'Morro da Cruz');
  set('intervention_site', 'site_worry', 'deslizamento');
  set('intervention_type', 'solution_tests_json', JSON.stringify([{ solutionId: sol, reaction: 'faz-sentido', areaM2, testedAt: '2026-09-30T12:00:00Z' }]));
  for (const [k, v] of Object.entries(extra)) set('operations_sustain', k, v);
  return s;
};

test('a priced study is inside the sum; upkeep without a figure is named outside', () => {
  const wall = record('muro-de-arrimo-verde', 160);
  const note = buildPrenote(prenoteInputFromSections(wall.sections as any, 'pt'));
  // 160 m² × R$ 200–300 + the geotechnical study (CYPE, R$ 820–5.125).
  expect(note.total).toEqual({ low: 32820, high: 53125 });
  const o = portfolioOrg('p', 'Periferia Feminista', wall.sections);
  expect(o.outside).toEqual(['manutencao']);
});

test('the cover says what the sum includes and names what it leaves out', () => {
  const a = record('muro-de-arrimo-verde', 160);
  const b = record('jardins-de-chuva', 40);
  const orgs = [portfolioOrg('a', 'Periferia Feminista', a.sections), portfolioOrg('b', 'Sementes da Vida Nova', b.sections)];
  const card = projectCard(['a', 'b'], orgs);
  expect(card.outside.manutencao).toEqual(['Periferia Feminista', 'Sementes da Vida Nova']);
  const html = renderPreportfolioHtml({
    cohortName: 'Rede SCbN',
    groups: [{ memberIds: ['a', 'b'] } as any],
    orgs,
    prenotes: new Map([['a', buildPrenote(prenoteInputFromSections(a.sections as any, 'pt'))], ['b', buildPrenote(prenoteInputFromSections(b.sections as any, 'pt'))]]),
  });
  expect(html).toContain('<strong>O que a soma inclui:</strong> a obra, ao preço de referência de cada ficha, e os estudos que têm preço publicado.');
  for (const x of ALWAYS_OUTSIDE_PT) expect(html).toContain(x);
  expect(html).toContain('a manutenção (todas as 2 organizações)');
  expect(html).toContain('Fora da soma:');
});

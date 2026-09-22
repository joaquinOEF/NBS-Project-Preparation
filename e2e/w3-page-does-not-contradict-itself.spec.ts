import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { buildSolutionTest } from '../shared/w3-solution-test';
import { buildComparison } from '../shared/w3-comparison';
import { fitFor } from '../shared/w3-criteria';
import { scoreW3Maturity } from '../shared/w3-maturity';
import { benefitFor } from '../shared/w3-benefits';
import { DOCUMENT_NOTES_FIELD } from '../shared/w3-document-notes';
import type { W3Input } from '../shared/w3-dossier';

// THREE THINGS THE SAME PAGE SAID AT ONCE (JVP, staging comparison PDF, 22 Sept).
//
//  · "O QUE TRAVA → precisa de um teste de infiltração do solo", four rows above
//    "o relatório documenta ensaio de infiltração já realizado no local …
//    dispensando a necessidade de novo teste". Both honest on their own.
//  · Barraginha in the first column, marked ✔ "responde ao que preocupa", on a
//    project whose focus is heat — it answers enxurrada, named second — ranked
//    above the rain garden the technical visit recommended.
//  · "Impacto climático 3/3 — número de impacto calculado e conferido com a
//    organização", certifying a technique rate (0,1–0,2 m³ per linear metre of
//    swale) that was never computed for this yard and never put to them as a
//    number; and "sem definir quem constrói" about an organisation that had
//    answered who would build it on all four tests.

const NOTES = (studyDone?: string) => JSON.stringify({ measures: [], notes: [{
  solutionId: 'jardins-de-chuva', stance: 'a-favor',
  textPt: 'O relatório documenta ensaio de infiltração já realizado no local, com 4 e 6 mm/h.',
  textEn: 'The report documents an infiltration test already carried out on site.',
  quote: 'Foi feito um teste de infiltração com anel simples', sourceFilename: 'relatorio.pdf',
  ...(studyDone ? { studyDone, studyQuote: 'Foi feito um teste de infiltração com anel simples' } : {}),
}] });

const input = (site: Record<string, string> = {}, type: Record<string, string> = {}): W3Input => ({
  org: {}, site: { bairro: 'Partenon', site_name: 'Pátio', _site_lat: '-30.0583', _site_lng: '-51.1672', current_use: 'paved', land_tenure: 'formal-agreement', site_worry: 'heat, enxurrada', nbs_interest: 'aguas-pluviais', ...site },
  solutions: ['jardins-de-chuva'], areaM2: 96, w3: { chosen_solutions: 'jardins-de-chuva', ...type },
});

test.describe('a claim from a file is a claim until they confirm it', () => {
  test('⚠️ the note says so itself — and stops saying it once the organisation confirms', () => {
    const unconfirmed = buildSolutionTest('jardins-de-chuva', input({}, { [DOCUMENT_NOTES_FIELD]: NOTES('infiltration') }), undefined, 'pt')!;
    expect(unconfirmed.verdict.state, 'the verdict still moves only on their word').toBe('needs_study');
    expect(unconfirmed.fromTheirFiles[0].text).toContain('a organização ainda não confirmou');

    const confirmed = buildSolutionTest('jardins-de-chuva', input({ studies_done: 'infiltration', studies_done_source: 'relatorio.pdf' }, { [DOCUMENT_NOTES_FIELD]: NOTES('infiltration') }), undefined, 'pt')!;
    expect(confirmed.verdict.state).not.toBe('needs_study');
    expect(confirmed.fromTheirFiles[0].text).not.toContain('ainda não confirmou');

    // A note that claims nothing about a study is never marked.
    const plain = buildSolutionTest('jardins-de-chuva', input({}, { [DOCUMENT_NOTES_FIELD]: NOTES() }), undefined, 'pt')!;
    expect(plain.fromTheirFiles[0].text).not.toContain('ainda não confirmou');

    // …and the comparison says the same thing as the card.
    const col = buildComparison(input({}, { [DOCUMENT_NOTES_FIELD]: NOTES('infiltration') }), [{ solutionId: 'jardins-de-chuva', areaM2: 96, reaction: 'faz-sentido', testedAt: '' } as any], 'pt').columns[0];
    expect(JSON.stringify(col)).toContain('ainda não confirmou');
  });
});

test.describe('"responde ao que preocupa" means the worry they put first', () => {
  const card = (id: string, worry: string) => buildSolutionTest(id, input({ site_worry: worry }), undefined, 'pt')!;

  test('⚠️ a second-named worry is no longer a full mark — the shelf and the ranking read the same focus', () => {
    // heat first: a stormwater solution answers something else they named.
    const heatFirst = fitFor('efeito', card('biovaletas', 'heat, enxurrada'), undefined, 'pt');
    expect(heatFirst.fit).toBe('medio');
    expect(heatFirst.why).toContain('não é o foco deste projeto');
    expect(heatFirst.why).not.toMatch(/ a a /);   // "responde a a água…"

    // enxurrada first: the same solution, now on the focus.
    const waterFirst = fitFor('efeito', card('biovaletas', 'enxurrada, heat'), undefined, 'pt');
    expect(waterFirst.fit).toBe('bom');
    expect(waterFirst.why).toBe('responde ao que pesa mais');

    // A solution answering no named worry keeps its own, weaker reading.
    const neither = fitFor('efeito', card('jardins-de-chuva', 'heat'), undefined, 'pt');
    expect(neither.fit).toBe('medio');
    expect(neither.why).toContain('em outro problema');
  });
});

test.describe('the score says what was actually answered', () => {
  test('⚠️ "quem constrói" is what they answered per test, not a field the tail used to write', () => {
    const base = { site: { site_worry: 'heat' }, w3: {}, solutions: ['jardins-de-chuva'], areaM2: 96, hasCostBand: true };
    const without = scoreW3Maturity(base as any).find(m => m.metric === 'solution_clarity')!;
    expect(without.score).toBe(2);
    const with_ = scoreW3Maturity({ ...base, who: ['nos-com-parceiro', 'nos'] } as any).find(m => m.metric === 'solution_clarity')!;
    expect(with_.score, 'answered four times and scored as if never asked').toBe(3);
    expect(with_.justification).toContain('com quem constrói definido');
    // The legacy field still counts, so a session that walked the old tail is unaffected.
    expect(scoreW3Maturity({ ...base, w3: { construction_model: 'mutirao' } } as any).find(m => m.metric === 'solution_clarity')!.score).toBe(3);
  });

  test('⚠️ a technique rate is not this project\'s impact figure', () => {
    // The two shapes, from the evidence base itself.
    expect(benefitFor('biovaletas', 96, undefined)!.siteSpecific, 'a rate: per linear metre, nothing multiplied it').toBe(false);
    expect(benefitFor('jardins-de-chuva', 96, undefined)!.siteSpecific, 'a volume computed for their size').toBe(true);

    // Nothing is stored for the rate, so the metric reports the gap instead of
    // certifying "calculado e conferido com a organização".
    const rate = scoreW3Maturity({ site: {}, w3: {}, solutions: ['biovaletas'], areaM2: 96, hasCostBand: true } as any).find(m => m.metric === 'climate_nbs_impact')!;
    expect(rate.score).toBeLessThan(3);
    const figure = scoreW3Maturity({ site: {}, w3: { expected_impact: 'Numa chuva forte, segura entre 14.400 e 33.600 litros', expected_impact_reaction: 'faz-sentido' }, solutions: ['jardins-de-chuva'], areaM2: 96, hasCostBand: true } as any).find(m => m.metric === 'climate_nbs_impact')!;
    expect(figure.score).toBe(3);

    // ⚠️ The write itself: only a site-specific figure, and the reaction with it.
    const flow = fs.readFileSync(path.join(process.cwd(), 'server/services/cboE3Checkpoint.ts'), 'utf8');
    expect(flow).toContain('const siteFigure = card?.effect.siteSpecific ? card.effect.headline : null;');
    expect(flow).not.toContain("expected_impact_reaction: 'faz-sentido',\n        ...(card");
  });

  test('the denominator says which encontros own the rest', () => {
    for (const f of ['client/src/locales/pt.json', 'client/src/locales/en.json']) {
      const json = JSON.parse(fs.readFileSync(path.join(process.cwd(), f), 'utf8'));
      expect(json.cbo.scorecard.metricsPending, f).toContain('9');
    }
    const routes = fs.readFileSync(path.join(process.cwd(), 'server/routes/cboRoutes.ts'), 'utf8');
    expect(routes).toContain('de 9 métricas avaliadas até aqui');
  });
});

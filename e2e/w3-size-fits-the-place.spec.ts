import { test, expect } from '@playwright/test';
import { TestApi } from './helpers/testApi';
import { measureSurface, solutionSurface, measureFits, orderMeasuresFor, sizeDoubt } from '../shared/w3-size-check';
import { budgetLineFor } from '../shared/w3-sizing';
import { DOCUMENT_NOTES_FIELD } from '../shared/w3-document-notes';
import { NBS_SOLUTIONS } from '../shared/nbs-catalog';
import { SOLUTION_SURFACE } from '../shared/w3-size-check';

// A SIZE THAT CANNOT BE RIGHT (JVP, staging, 22 Sept).
//
// A rain garden was priced over 836 m² — the whole cemented patio, read out of
// the organisation's own sketch — while the same sketch carries the 12 × 8 m
// strip of earth the technical visit designates for it. R$ 334.400–585.200
// instead of R$ 38.400–67.200, to a parents' association holding R$ 8.200; and
// the bioswale tested next inherited the same number with no question, billing
// the same ground twice. Every function did what it says: nothing anywhere
// compared the number to the place.

const M = (labelPt: string, m2: number, quote: string) => ({ labelPt, labelEn: labelPt, quote, sourceFilename: 'relatorio.pdf', m2 });
const STRIP = M('faixa de terra no canto nordeste', 96, 'faixa de terra de aproximadamente 12 × 8 m');
const PATIO = M('pátio de recreio cimentado', 836, 'É todo cimentado, com cerca de 38 × 22 m');
const ROOF = M('telhado da quadra coberta', 600, 'telhado da quadra coberta (aprox. 600 m²)');

test.describe('what a measure describes, and what a solution is built on', () => {
  test('roof, open ground, sealed ground — from the words their own files use', () => {
    expect(measureSurface(STRIP)).toBe('open-ground');
    expect(measureSurface(PATIO)).toBe('sealed-ground');
    expect(measureSurface(ROOF)).toBe('roof');
    expect(measureSurface(M('área útil', 500, 'área útil de 500 m²')), 'nothing to read → never blocks').toBe('unclear');

    expect(solutionSurface('jardins-de-chuva')).toBe('open-ground');
    expect(solutionSurface('teto-verde')).toBe('roof');
    // ⚠️ The one solution for which the cemented yard IS the right measure.
    expect(solutionSurface('pavimentos-permeaveis')).toBe('sealed-ground');

    expect(measureFits('jardins-de-chuva', STRIP)).toBe(true);
    expect(measureFits('jardins-de-chuva', PATIO)).toBe(false);
    expect(measureFits('pavimentos-permeaveis', PATIO)).toBe(true);
    expect(measureFits('jardins-de-chuva', M('área útil', 500, 'área útil de 500 m²')), 'unclear never blocks').toBe(true);
  });

  test('⚠️ all 27 declare a surface, and the check is a property of the catalogue', () => {
    // Not "a rain garden and two exceptions": every solution says what it is
    // built on, so a solution added next year is checked the same way.
    for (const s of NBS_SOLUTIONS) expect(SOLUTION_SURFACE[s.id], s.id).toBeTruthy();
    expect(Object.keys(SOLUTION_SURFACE).sort()).toEqual(NBS_SOLUTIONS.map(s => s.id).sort());

    // Handed the measure of a cemented yard, every solution built on earth asks
    // — and the two that legitimately live on concrete or on a roof do not.
    for (const s of NBS_SOLUTIONS) {
      const d = sizeDoubt({ solutionId: s.id, areaM2: 836, siteAreaM2: 2900, measures: [PATIO] });
      if (solutionSurface(s.id) === 'open-ground') expect(d?.kind, s.id).toBe('wrong-surface');
      else if (solutionSurface(s.id) === 'sealed-ground') expect(d, s.id).toBeNull();
    }
    // …and the roof's 600 m² is the wrong number for anything built on earth.
    for (const s of NBS_SOLUTIONS.filter(s => solutionSurface(s.id) === 'open-ground')) {
      expect(sizeDoubt({ solutionId: s.id, areaM2: 600, measures: [ROOF] })?.kind, s.id).toBe('wrong-surface');
    }
    expect(sizeDoubt({ solutionId: 'teto-verde', areaM2: 600, measures: [ROOF] }), 'a green roof sized by the roof').toBeNull();
    expect(sizeDoubt({ solutionId: 'captacao-agua-da-chuva', areaM2: 600, measures: [ROOF] }), 'a cistern belongs to the roof too').toBeNull();
  });

  test('the fitting measure leads, and nothing is removed', () => {
    expect(orderMeasuresFor('jardins-de-chuva', [PATIO, STRIP]).map(m => m.m2)).toEqual([96, 836]);
    expect(orderMeasuresFor('pavimentos-permeaveis', [STRIP, PATIO]).map(m => m.m2)).toEqual([836, 96]);
    expect(orderMeasuresFor('jardins-de-chuva', [PATIO]), 'a measure they consider right is still one tap away').toHaveLength(1);
  });
});

test.describe('the doubt — one question, never a refusal', () => {
  const doubt = (solutionId: string, areaM2: number, over: { measures?: any[]; siteAreaM2?: number } = {}) =>
    sizeDoubt({ solutionId, areaM2, siteAreaM2: over.siteAreaM2 ?? 2900, measures: over.measures ?? [STRIP, PATIO] });

  test('⚠️ the staging case: a rain garden sized by the measure of the concrete', () => {
    const d = doubt('jardins-de-chuva', 836)!;
    expect(d.kind).toBe('wrong-surface');
    expect(d.matched?.m2).toBe(836);
    expect(d.alternative?.m2, 'and the strip their report designates is what it offers').toBe(96);
    // The size their own material gives raises nothing.
    expect(doubt('jardins-de-chuva', 96)).toBeNull();
    // Nor does the patio for the solution that replaces the patio.
    expect(doubt('pavimentos-permeaveis', 836)).toBeNull();
  });

  test('a smaller measure that fits; most of the place; and nothing to argue with', () => {
    // A number that is not any measure, with a fitting smaller one on record.
    expect(doubt('jardins-de-chuva', 400)).toMatchObject({ kind: 'smaller-measure-fits', alternative: { m2: 96 } });
    // No measures at all: only a footprint LARGER than the place they drew.
    // ⚠️ Not "most of it": the polygon drawn in Encontro 2 is the area they mean
    // to work in, so a test sized at all of it is the ordinary answer.
    expect(doubt('jardins-de-chuva', 3200, { measures: [] })).toMatchObject({ kind: 'bigger-than-the-place' });
    expect(doubt('jardins-de-chuva', 2900, { measures: [] }), 'the whole drawn place is a normal answer').toBeNull();
    expect(doubt('jardins-de-chuva', 400, { measures: [] })).toBeNull();
    expect(doubt('jardins-de-chuva', 9000, { measures: [], siteAreaM2: 0 }), 'no place drawn, nothing to compare').toBeNull();
    expect(sizeDoubt({ solutionId: 'jardins-de-chuva', areaM2: 0 }), 'no size, no doubt').toBeNull();
  });

  test('the money this is about', () => {
    expect(budgetLineFor('jardins-de-chuva', 836)?.notePt).toContain('R$ 334.400');
    expect(budgetLineFor('jardins-de-chuva', 96)?.notePt).toContain('R$ 38.400');
  });
});

test.describe('in a session — the question is asked before the price', () => {
  test.use({ locale: 'pt-BR' });

  test('⚠️ 836 m² is questioned, the strip is one tap, and the next solution never inherits in silence', async ({ page, request }) => {
    const api = new TestApi(request);
    test.skip(!(await api.ping()).fakeModel, 'needs the fake model env (for seeding)');
    await page.goto('/cbo-profile');
    const marker = page.getByTestId('cbo-stream-status');
    await expect(marker).toHaveAttribute('data-cbo-id', /.+/, { timeout: 30_000 });
    const cboId = (await marker.getAttribute('data-cbo-id'))!;
    const S = (sectionId: string, fields: Record<string, string>) => Object.entries(fields).map(([field, value]) => ({ sectionId, field, value }));
    await api.seedState(cboId, { phase: 3, language: 'pt', sections: [
      ...S('org_profile', { org_name: 'APM Caldas Junior' }),
      ...S('intervention_site', {
        bairro: 'Partenon', site_name: 'Pátio dos fundos', _site_lat: '-30.0583', _site_lng: '-51.1672',
        site_worry: 'alagamento', current_use: 'paved', land_tenure: 'formal-agreement', nbs_interest: 'aguas-pluviais',
        site_story: 'A água empoça.', site_knowledge_depth: 'strong', site_area_m2: '2900', site_area_source: 'drawn',
      }),
      ...S('intervention_type', { _quick_tests: 'yes', studies_done: 'infiltration', [DOCUMENT_NOTES_FIELD]: JSON.stringify({ notes: [], measures: [STRIP, PATIO] }) }),
    ] });
    const chip = (label: string) => page.locator(`[data-testid^="cbo-option-"][data-option-label="${label}"]`);
    const thread = page.getByTestId('cbo-chat-thread');
    const box = page.getByTestId('cbo-chat-input');
    const say = async (t: string) => { await box.fill(t); await box.press('Enter'); };

    await say('Vamos começar o Encontro 3.');
    await chip('É isso ✓').click();
    await expect(chip('📎 Mandar agora')).toBeVisible({ timeout: 20_000 });
    await say('seguir sem');
    await expect(page.getByTestId('cbo-solution-options')).toBeVisible({ timeout: 30_000 });
    await say('Jardins de chuva');

    // Both measures are offered — the strip that fits above the concrete.
    const strip = chip('Usar 96 m² — faixa de terra no canto nordeste');
    const patio = chip('Usar 836 m² — pátio de recreio cimentado');
    await expect(strip).toBeVisible({ timeout: 20_000 });
    await expect(patio).toBeVisible();
    const labels = await page.locator('[data-testid^="cbo-option-"]').evaluateAll(els => els.map(e => e.getAttribute('data-option-label')));
    expect(labels.indexOf('Usar 96 m² — faixa de terra no canto nordeste')).toBeLessThan(labels.indexOf('Usar 836 m² — pátio de recreio cimentado'));

    // They tap the concrete. The card does NOT come back priced at half a million.
    await patio.click();
    await expect(chip('Sim, é isso mesmo')).toBeVisible({ timeout: 20_000 });
    await expect(thread.getByText(/pátio de recreio cimentado/).last()).toBeVisible();
    await expect(thread.getByText(/ocupa esse tamanho todo/)).toBeVisible();
    await expect(page.getByTestId('solution-test-cost'), 'no price until the size is settled').toHaveCount(0);
    // …and the question survives a reload, like every other pending ask.
    await page.reload();
    await expect(chip('Sim, é isso mesmo')).toBeVisible({ timeout: 30_000 });
    await chip('Usar 96 m² — faixa de terra no canto nordeste').click();

    await expect(page.getByTestId('solution-test-cost').last()).toContainText('96 m²', { timeout: 30_000 });
    await expect(page.getByTestId('solution-test-cost').last()).toContainText('R$ 38.400');

    // The second ground solution is OFFERED the same size, never given it.
    await chip('Faz sentido pra gente').click();
    // The rain garden's decisive detail (soil), then the loop's own question.
    await chip('Mais barro — a água empoça').click({ timeout: 30_000 });
    await expect(chip('Testar outra solução')).toBeVisible({ timeout: 30_000 });
    await chip('Testar outra solução').click();
    await expect(page.getByTestId('cbo-solution-options').last()).toBeVisible({ timeout: 30_000 });
    await say('Biovaletas');
    await expect(chip('Sim, o mesmo tamanho')).toBeVisible({ timeout: 20_000 });
    await expect(thread.getByText(/vale o mesmo tamanho/)).toBeVisible();
    await chip('Sim, o mesmo tamanho').click();
    await expect(page.getByTestId('solution-test-cost').last()).toContainText('96 m²', { timeout: 30_000 });

    const state = await (await request.get(`/api/cbo/${cboId}`)).json();
    const sections = (state.state ?? state).sections;
    const tests = JSON.parse(sections.intervention_type.fields.solution_tests_json.value);
    expect(tests.find((t: any) => t.solutionId === 'jardins-de-chuva').areaM2).toBe(96);
    expect(tests.find((t: any) => t.solutionId === 'biovaletas').areaM2).toBe(96);
    expect(sections.intervention_site.fields.site_area_m2.value, 'the place keeps what it drew').toBe('2900');
  });
});

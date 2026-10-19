import { test, expect } from '@playwright/test';
import { TestApi } from './helpers/testApi';
import { solutionsNamedIn, testsOf } from '../shared/recorded-solutions';
import { prenoteSolution, prenoteInputFromSections } from '../shared/e4-prenote';

// EVERY ERA OF RECORD (shared/recorded-solutions.ts).
//
// Real organisations will not walk Encontros 1–3 again. Conceito Arte's
// Encontro 3 wrote solution NAMES into `solution_types`, which nothing read: in
// Encontro 4 it was "nenhuma solução foi testada", and it had no place on the
// pre-portfolio. These pin the reader and the two places it had to reach.

const CONCEITO_TYPE = {
  _e3_closed: 'yes',
  solution_types: 'Jardins de chuva, Biovaletas, Bacia de retenção, Cisterna de água da chuva, Evapotranspiração',
  site_area_m2: '246',
};

test.describe('which solutions a record has', () => {
  test('names in a sentence, in order, longest first, with the words people use', () => {
    expect(solutionsNamedIn('Jardins de chuva com biovaletas, na Praça Oliveira Rolim')).toEqual(['jardins-de-chuva', 'biovaletas']);
    expect(solutionsNamedIn('umas cisternas e um telhado verde')).toEqual(['captacao-agua-da-chuva', 'teto-verde']);
    expect(solutionsNamedIn('Parques lineares')).toEqual(['parques-lineares']);
    expect(solutionsNamedIn('não sei')).toEqual([]);
  });

  test('three eras: tests, then chosen ids, then names — never "no solution" for a record that has one', () => {
    expect(testsOf({ solution_tests_json: JSON.stringify([{ solutionId: 'teto-verde', reaction: 'faz-sentido', testedAt: 'x' }]), solution_types: 'Biovaletas' }).map(t => t.solutionId)).toEqual(['teto-verde']);
    expect(testsOf({ chosen_solutions: 'hortas-urbanas, compostagem' }).map(t => t.solutionId)).toEqual(['hortas-urbanas', 'compostagem']);
    const legacy = testsOf(CONCEITO_TYPE);
    // Evapotranspiração is not in the catalogue; the other four are.
    expect(legacy.map(t => t.solutionId)).toEqual(['jardins-de-chuva', 'biovaletas', 'bacia-de-retencao', 'captacao-agua-da-chuva']);
    expect(legacy.every(t => t.reaction === 'faz-sentido')).toBe(true);
  });

  test('the pre-note of a first-era record has a solution — so it reaches the pre-portfolio', () => {
    const sections: any = { intervention_type: { fields: Object.fromEntries(Object.entries(CONCEITO_TYPE).map(([k, v]) => [k, { value: v }])) }, intervention_site: { fields: {} } };
    expect(prenoteSolution(prenoteInputFromSections(sections))?.id).toBe('jardins-de-chuva');
  });
});

test.describe('Encontro 4 reads a typed name', () => {
  async function chat(request: any, cboId: string, message: string, turnKind = 'chip') {
    const r = await request.post(`/api/cbo/${cboId}/chat`, { data: { message, lang: 'pt', turnKind } });
    const text = await r.text();
    const ev = text.split('\n\n').map((b: string) => b.trim()).filter((b: string) => b.startsWith('data:')).map((b: string) => JSON.parse(b.slice(5).trim()));
    const ask = ev.filter((e: any) => e.type === 'ask_user').pop();
    const done = ev.filter((e: any) => e.type === 'done').pop();
    return { ask, labels: (ask?.options ?? []).map((o: any) => o.label) as string[], served: /E4 checkpoint/.test(String(done?.summary ?? '')) };
  }

  test('a first-era record is offered its own solutions; a sentence naming two asks which', async ({ page }) => {
    const api = new TestApi(page.request);
    test.skip(!(await api.ping()).fakeModel, 'needs the fake model');
    const { cboId } = await api.newSession();
    await api.seedState(cboId, { phase: 4, language: 'pt', sections: [
      { sectionId: 'org_profile', field: 'org_name', value: 'Conceito Arte' },
      { sectionId: 'intervention_site', field: 'bairro', value: 'Sarandi' },
      { sectionId: 'intervention_site', field: '_site_lat', value: '-29.99' },
      { sectionId: 'intervention_site', field: '_site_lng', value: '-51.13' },
      ...Object.entries(CONCEITO_TYPE).map(([field, value]) => ({ sectionId: 'intervention_type', field, value })),
    ] });
    let s = await chat(page.request, cboId, 'Vamos começar o Encontro 4.', 'text');
    expect(s.ask.question).toBe('Qual solução vira a pré-nota?');
    expect(s.labels.slice(0, 2)).toEqual(['Jardins de chuva', 'Biovaletas']);
    // Typed, not tapped — and naming two.
    s = await chat(page.request, cboId, 'Jardins de chuva com biovaletas, na Praça Oliveira Rolim', 'text');
    expect(s.served, 'the encontro answers, not the model').toBe(true);
    expect(s.ask.question).toMatch(/Qual delas vira a pré-nota/);
    expect(s.labels.slice(0, 2)).toEqual(['Jardins de chuva', 'Biovaletas']);
    s = await chat(page.request, cboId, 'Biovaletas');
    expect(s.served).toBe(true);
    const st: any = (await (await page.request.get(`/api/cbo/${cboId}`)).json()).state;
    expect(JSON.parse(st.sections.intervention_type.fields._e4_solution_json.value).solutionId).toBe('biovaletas');
  });
});

test.describe('the documents read every era too', () => {
  test('recordedSolutionIds: chosen ids, else what made sense, else first-era names', async () => {
    const { recordedSolutionIds } = await import('../shared/recorded-solutions');
    expect(recordedSolutionIds({ chosen_solutions: 'teto-verde' })).toEqual(['teto-verde']);
    expect(recordedSolutionIds({ solution_tests_json: JSON.stringify([
      { solutionId: 'biovaletas', reaction: 'nao-e-pra-gente', testedAt: 'x' },
      { solutionId: 'jardins-de-chuva', reaction: 'faz-sentido', testedAt: 'x' },
    ]) })).toEqual(['jardins-de-chuva']);
    expect(recordedSolutionIds(CONCEITO_TYPE)).toEqual(['jardins-de-chuva', 'biovaletas', 'bacia-de-retencao', 'captacao-agua-da-chuva']);
  });

  test("a first-era record's profile lists its solutions", async () => {
    const { buildOrgProfile } = await import('../shared/org-profile');
    const state: any = { phase: 3, sections: { org_profile: { fields: { org_name: { value: 'Conceito Arte' } } }, intervention_site: { fields: {} }, intervention_type: { fields: Object.fromEntries(Object.entries(CONCEITO_TYPE).map(([k, v]) => [k, { value: v }])) } }, maturityScores: [], priorityFlags: [], metadata: {} };
    const profile = buildOrgProfile({ state, orgName: 'Conceito Arte', lang: 'pt' } as any);
    expect(JSON.stringify(profile)).toContain('Jardins de chuva');
  });
});

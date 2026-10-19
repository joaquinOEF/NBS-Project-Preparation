import { test, expect } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { TestApi } from './helpers/testApi';
import { parseVisit, visitFromInput, visitOptions, visitSummary } from '../shared/e4-visit';
import { buildOrgProfile } from '../shared/org-profile';
import { createEmptyCboState } from '../shared/cbo-schema';

// THE TECHNICAL VISIT — which solution an organisation takes into Encontro 4.
//
// Vila Flores and Robson visit each place and recommend one solution; the
// drawer records it and Encontro 4 opens on it. What has to hold: a choice is
// always a real solution at a size in the unit it is priced in; the list puts
// what they tested first (liked first) without hiding the rest of the
// catalogue; anyone on the coordinator side can record, change or clear it;
// and once recorded it shows on the roster and on the printed Perfil.

const TESTS = JSON.stringify([
  { solutionId: 'pavimentos-permeaveis', reaction: 'nao-e-pra-gente', testedAt: '2026-09-15T12:10:00Z' },
  { solutionId: 'corredores-verdes', reaction: 'ainda-nao-sabemos', units: 25, testedAt: '2026-09-15T12:05:00Z' },
  { solutionId: 'jardins-de-chuva', reaction: 'faz-sentido', areaM2: 120, testedAt: '2026-09-15T12:00:00Z' },
]);

test.describe('the visit choice — pure', () => {
  test('what they tested comes first, liked first, and nothing else is hidden', () => {
    const { tested, others } = visitOptions(TESTS);
    expect(tested.map(t => t.solutionId)).toEqual(['jardins-de-chuva', 'corredores-verdes', 'pavimentos-permeaveis']);
    expect(others.length + tested.length, 'Robson may recommend something they never tried').toBe(27);
    expect(others.some(o => o.solutionId === 'jardins-de-chuva')).toBe(false);
  });

  test('the size goes in the unit the solution is priced in', () => {
    const area = visitFromInput({ solutionId: 'jardins-de-chuva', areaM2: '150,5', units: 9 }, new Date('2026-10-23T10:00:00Z'));
    expect(area).toMatchObject({ solutionId: 'jardins-de-chuva', areaM2: 151 });
    expect((area as any).units).toBeUndefined();
    const trees = visitFromInput({ solutionId: 'corredores-verdes', areaM2: 400, units: '30' });
    expect(trees).toMatchObject({ units: 30 });
    expect((trees as any).areaM2).toBeUndefined();
  });

  test('a made-up solution or a malformed date is refused, not stored', () => {
    expect(visitFromInput({ solutionId: 'jardim-magico' })).toEqual({ error: 'unknown solution' });
    expect(visitFromInput({ solutionId: 'jardins-de-chuva', date: '23/10/2026' })).toEqual({ error: 'date must be YYYY-MM-DD' });
    expect(parseVisit('{"solutionId":"jardim-magico"}')).toBeNull();
    expect(parseVisit('not json')).toBeNull();
  });

  test('one line for a card or a page', () => {
    expect(visitSummary({ solutionId: 'jardins-de-chuva', areaM2: 1200, date: '2026-10-23', recordedAt: '' })).toBe('Jardins de chuva · 1.200 m² · visita em 23/10/2026');
    expect(visitSummary({ solutionId: 'corredores-verdes', units: 25, recordedAt: '' })).toBe('Corredores verdes · 25 árvores');
  });

  test('the printed Perfil carries it', () => {
    const s = createEmptyCboState('porto-alegre');
    (s.sections as any).intervention_type.fields._visit_json = { value: JSON.stringify({ solutionId: 'jardins-de-chuva', areaM2: 120, recordedAt: 'x' }), confidence: 'high', source: 'coordinator', userEdited: false };
    expect(buildOrgProfile({ orgName: 'Ksa Rosa', state: s }).visit).toBe('Jardins de chuva · 120 m²');
    expect(buildOrgProfile({ orgName: 'Ksa Rosa', state: createEmptyCboState('porto-alegre') }).visit).toBeNull();
  });
});

test.describe('the visit choice — the coordinator route', () => {
  test('record, change and clear it; the roster and the reading follow', async ({ page }) => {
    const api = new TestApi(page.request);
    test.skip(!(await api.ping()).fakeModel, 'needs the fake model');
    const tag = randomUUID().slice(0, 6);
    const cohort = (await api.createCohort(`Visita ${tag}`)).cohort;
    await api.createCoordinator({ email: `visit-${tag}@e2e.test`, password: 'pw-123456', cohortId: cohort.id });
    const ksa = (await api.inviteMember(cohort.id, { orgName: 'Ksa Rosa', neighborhood: 'Floresta', withSession: true })).member;
    await api.seedState(ksa.cboStateId, {
      phase: 3, language: 'pt',
      sections: [{ sectionId: 'intervention_type', field: 'solution_tests_json', value: TESTS }],
    });
    const url = `/api/cohort/${cohort.coordinatorSlug}/member/${ksa.id}/visit`;

    const bad = await page.request.patch(url, { data: { solutionId: 'jardim-magico' } });
    expect(bad.status()).toBe(400);

    const ok = await page.request.patch(url, { data: { solutionId: 'jardins-de-chuva', areaM2: '140', date: '2026-10-23', note: 'Solo argiloso; dreno de fundo.' } });
    expect(ok.ok()).toBe(true);
    expect((await ok.json()).visit).toMatchObject({ solutionId: 'jardins-de-chuva', areaM2: 140, date: '2026-10-23' });

    const profile = await (await page.request.get(`/api/cohort/${cohort.coordinatorSlug}/member/${ksa.id}/profile`)).json();
    const type = profile.profile.sections.intervention_type.fields;
    expect(parseVisit(type._visit_json.value)?.areaM2).toBe(140);
    expect(type.technical_note.value).toBe('Solo argiloso; dreno de fundo.');

    // A save without `note` must not blank the reading.
    await page.request.patch(url, { data: { solutionId: 'corredores-verdes', units: 30 } });
    const after = await (await page.request.get(`/api/cohort/${cohort.coordinatorSlug}/member/${ksa.id}/profile`)).json();
    expect(after.profile.sections.intervention_type.fields.technical_note.value).toBe('Solo argiloso; dreno de fundo.');

    const roster = await (await page.request.get(`/api/cohort/${cohort.coordinatorSlug}`)).json();
    const row = (roster.members ?? []).find((m: any) => m.id === ksa.id);
    expect(row?.w3?.visit?.summary).toBe('Corredores verdes · 30 árvores');

    const cleared = await page.request.patch(url, { data: { solutionId: null } });
    expect((await cleared.json()).visit).toBeNull();
    const roster2 = await (await page.request.get(`/api/cohort/${cohort.coordinatorSlug}`)).json();
    expect((roster2.members ?? []).find((m: any) => m.id === ksa.id)?.w3?.visit ?? null).toBeNull();
  });
});

test.describe('the visit choice — the drawer', () => {
  test.use({ locale: 'pt-BR' });

  test('Vila Flores records the visit from the Perfil tab, and the roster shows it', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const api = new TestApi(page.request);
    test.skip(!(await api.ping()).fakeModel, 'needs the fake model');
    const tag = randomUUID().slice(0, 6);
    const cohort = (await api.createCohort(`Visita UI ${tag}`)).cohort;
    await api.createCoordinator({ email: `visit-ui-${tag}@e2e.test`, password: 'pw-123456', cohortId: cohort.id });
    const m = (await api.inviteMember(cohort.id, { orgName: 'Ksa Rosa', neighborhood: 'Floresta', withSession: true })).member;
    await api.seedState(m.cboStateId, { phase: 3, language: 'pt', sections: [{ sectionId: 'intervention_type', field: 'solution_tests_json', value: TESTS }] });

    await page.goto(`/orchestrator?cohort=${cohort.coordinatorSlug}`);
    // After Encontro 3 the card itself offers the visit, straight onto its tab.
    await page.getByTestId(`button-visit-${m.id}`).click({ timeout: 30_000 });
    const editor = page.getByTestId('visit-editor');
    await expect(editor).toBeVisible();
    await expect(page.getByTestId('visit-status')).toHaveText('Sem visita registrada');

    await page.getByTestId('visit-solution').selectOption('jardins-de-chuva');
    // It starts from the size they tested it at.
    await expect(page.getByTestId('visit-size')).toHaveValue('120');
    await page.getByTestId('visit-date').fill('2026-10-23');
    await page.getByTestId('technical-note-input').fill('Solo argiloso; dreno de fundo.');
    await page.getByTestId('visit-save').click();
    await expect(page.getByTestId('visit-status')).toHaveText('Registrada: Jardins de chuva · 120 m² · visita em 23/10/2026');
    if (process.env.DRAWER_SHOTS) await editor.screenshot({ path: `${process.env.DRAWER_SHOTS}/visit-editor.png` });

    await page.goto(`/orchestrator?cohort=${cohort.coordinatorSlug}`);
    await expect(page.getByTestId(`w3-visit-${m.id}`)).toBeVisible({ timeout: 30_000 });
  });
});

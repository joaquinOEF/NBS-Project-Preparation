import { test, expect } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { TestApi } from './helpers/testApi';
import { parseSnapshot, trimToEndOfE2, stripContacts, type StateSnapshot } from '../shared/state-snapshot';

// TEST ORGANISATIONS FROM REAL RECORDS (docs/test-orgs.md).
//
// Encontro 3 reads everything Encontros 1 and 2 collected, so trying it on
// sample data tries a different product. A snapshot carries a real record to
// where it can be replayed — a clone in place, or an import in another
// environment — trimmed to where the organisation stood when Encontro 2
// closed. These tests pin the trim, the guarantees (the original is never
// touched; contacts do not travel; copies stay out of the analysis) and the
// path the copy then walks: "Começar Encontro 3", on ITS place.

const snap = (over: Partial<StateSnapshot> = {}): StateSnapshot => ({
  version: 1, exportedAt: '2026-09-21T00:00:00Z', orgName: 'Ksa Rosa', neighborhood: 'Floresta', phase: 3, language: 'pt',
  sections: {
    org_profile: { org_name: { value: 'Ksa Rosa' }, contact_name: { value: 'Marlene' }, contact_email: { value: 'm@ksa.org' }, contact_phone: { value: '51 9999' } },
    intervention_site: {
      site_name: { value: 'Voluntários da Pátria 1039' }, site_worry: { value: 'alagamento' }, site_area_m2: { value: '600' },
      _role_done: { value: 'yes' }, _area_asked: { value: 'yes' }, _worry_focus_pending: { value: 'yes' },
    },
    intervention_type: { chosen_solutions: { value: 'jardins-de-chuva' }, solution_tests_json: { value: '[]' } },
    impact_monitoring: { expected_impact: { value: 'x' } },
  },
  maturityScores: [
    { metric: 'org_delivery_capacity', score: 2 }, { metric: 'site_control', score: 1 },
    { metric: 'problem_clarity', score: 2 }, { metric: 'financial_thinking', score: 1 },
  ],
  priorityFlags: [],
  messages: [
    { role: 'user', content: 'Vamos começar.' }, { role: 'assistant', content: 'Oi!' },
    { role: 'user', content: 'Vamos começar o Encontro 3.' }, { role: 'assistant', content: 'Bem-vindas ao Encontro 3.' },
  ],
  docs: [{ filename: 'estatuto.pdf', droppedInPhase: 1 }, { filename: 'patio-hoje.jpg', droppedInPhase: 3 }],
  ...over,
});

test.describe('the trim — where an organisation stood when Encontro 2 closed', () => {
  const t = trimToEndOfE2(snap());

  test('everything from Encontro 3 on is gone, and nothing before it', () => {
    expect(Object.keys(t.sections).sort()).toEqual(['intervention_site', 'org_profile']);
    expect(t.sections.intervention_site.site_name.value).toBe('Voluntários da Pátria 1039');
    // The footprint is Encontro 2's too; Encontro 3's private flags are not.
    expect(t.sections.intervention_site.site_area_m2.value).toBe('600');
    expect(t.sections.intervention_site._area_asked).toBeUndefined();
    expect(t.sections.intervention_site._worry_focus_pending).toBeUndefined();
    expect(t.maturityScores.map(m => m.metric).sort()).toEqual(['org_delivery_capacity', 'site_control']);
  });

  test('it reads as "Encontro 2 closed", whichever marker the original carried', () => {
    expect(t.phase).toBe(2);
    expect(t.sections.intervention_site._role_done.value).toBe('yes');
    const bare = trimToEndOfE2(snap({ sections: { intervention_site: { site_name: { value: 'X' } } } }));
    expect(bare.sections.intervention_site._e2_closed.value).toBe('yes');
  });

  test('the transcript stops at the line that opened Encontro 3; later documents stay behind', () => {
    expect(t.messages!.map(m => m.content)).toEqual(['Vamos começar.', 'Oi!']);
    expect(t.docs!.map(d => d.filename)).toEqual(['estatuto.pdf']);
  });

  test('contacts do not travel; a bare database state is accepted', () => {
    const s = stripContacts(snap());
    expect(s.sections.org_profile.contact_email).toBeUndefined();
    expect(s.sections.org_profile.contact_phone).toBeUndefined();
    expect(s.sections.org_profile.contact_name.value).toBe('Marlene');
    const bare = parseSnapshot({ orgName: 'Do banco', phase: 2, sections: { org_profile: { fields: { org_name: { value: 'Do banco' } } } }, maturityScores: [], priorityFlags: [], metadata: {} });
    expect(bare.sections.org_profile.org_name.value).toBe('Do banco');
    expect(() => parseSnapshot({ hello: 'world' })).toThrow(/not a snapshot/);
  });
});

const FULL = [
  { sectionId: 'org_profile', field: 'org_name', value: 'Ksa Rosa' },
  { sectionId: 'org_profile', field: 'contact_name', value: 'Marlene Souza' },
  { sectionId: 'org_profile', field: 'contact_email', value: 'marlene@ksarosa.org' },
  { sectionId: 'org_profile', field: 'mission_summary', value: 'Casa de cultura e horta comunitária no 4º Distrito.' },
  { sectionId: 'intervention_site', field: 'bairro', value: 'Floresta' },
  { sectionId: 'intervention_site', field: 'site_name', value: 'Voluntários da Pátria 1039' },
  { sectionId: 'intervention_site', field: '_site_lat', value: '-30.0198' },
  { sectionId: 'intervention_site', field: '_site_lng', value: '-51.2032' },
  { sectionId: 'intervention_site', field: 'current_use', value: 'paved' },
  { sectionId: 'intervention_site', field: 'land_tenure', value: 'private-owned' },
  { sectionId: 'intervention_site', field: 'site_worry', value: 'alagamento' },
  { sectionId: 'intervention_site', field: 'site_story', value: 'Quando chove forte a água entra pelo portão e fica dois dias no pátio.' },
  { sectionId: 'intervention_site', field: 'site_knowledge_depth', value: 'strong' },
  { sectionId: 'intervention_site', field: 'nbs_interest', value: 'aguas-pluviais' },
  { sectionId: 'intervention_site', field: '_role_done', value: 'yes' },
  // …and a finished Encontro 3 on top, which the copy must not inherit.
  { sectionId: 'intervention_type', field: 'chosen_solutions', value: 'jardins-de-chuva' },
  { sectionId: 'intervention_type', field: 'solution_tests_json', value: JSON.stringify([{ solutionId: 'jardins-de-chuva', reaction: 'faz-sentido', testedAt: '2026-09-15T12:00:00Z' }]) },
  { sectionId: 'intervention_type', field: '_e3_opened', value: 'yes' },
  { sectionId: 'intervention_site', field: '_area_asked', value: 'yes' },
];

test.describe('a copy of a real record — clone, import, and the path it walks', () => {
  test.use({ locale: 'pt-BR' });

  test('a clone lands at the end of Encontro 2, walks into Encontro 3 on ITS place, and the original is untouched', async ({ page }) => {
    const api = new TestApi(page.request);
    test.skip(!(await api.ping()).fakeModel, 'needs the fake model');
    const cohort = (await api.createCohort(`Copies ${randomUUID().slice(0, 6)}`)).cohort;
    await api.createCoordinator({ email: `copy-${randomUUID()}@e2e.test`, password: 'pw-123456', cohortId: cohort.id });
    const orig = (await api.inviteMember(cohort.id, { orgName: 'Ksa Rosa', neighborhood: 'Floresta', withSession: true, unlockedPhases: [1, 2, 3] })).member;
    await api.seedState(orig.cboStateId, { phase: 3, language: 'pt', sections: FULL, maturity: [{ metric: 'site_control', score: 2 }, { metric: 'problem_clarity', score: 2 }] });

    const r = await page.request.post(`/api/cohort/${cohort.coordinatorSlug}/member/${orig.id}/clone`, { data: {} });
    expect(r.ok()).toBe(true);
    const { member: copy } = await r.json();
    expect(copy.id).not.toBe(orig.id);
    expect(copy.orgName).toBe('Ksa Rosa (teste)');
    expect(copy.cboStateId).not.toBe(orig.cboStateId);
    expect(copy.capabilityToken).not.toBe(orig.capabilityToken);
    expect(copy.unlockedPhases).toEqual([1, 2, 3]);
    expect(copy.excludeFromPortfolio, 'a copy stays out of the synergy analysis').toBe(true);

    const st = (await (await page.request.get(`/api/cbo/${copy.cboStateId}`)).json()).state;
    expect(st.phase).toBe(2);
    expect(st.sections.intervention_site.fields.site_story.value).toContain('entra pelo portão');
    expect(st.sections.intervention_site.fields._area_asked).toBeUndefined();
    expect(Object.keys(st.sections.intervention_type.fields)).toEqual([]);
    expect(st.maturityScores.map((m: any) => m.metric)).toEqual(['site_control']);
    // Same cohort, same coordinator: a clone keeps the contacts.
    expect(st.sections.org_profile.fields.contact_email.value).toBe('marlene@ksarosa.org');

    // The original is exactly as it was.
    const o = (await (await page.request.get(`/api/cbo/${orig.cboStateId}`)).json()).state;
    expect(o.phase).toBe(3);
    expect(o.sections.intervention_type.fields.chosen_solutions.value).toBe('jardins-de-chuva');

    // The path: its own link → "Começar Encontro 3" → the door names ITS place.
    await page.goto(`/cbo-profile?t=${copy.capabilityToken}`);
    await page.getByTestId('button-cbo-welcome-cta').click({ timeout: 30_000 });
    const preamble = page.getByTestId('button-encontro-3-start');
    const banner = page.getByTestId('button-start-encontro-3');
    await expect(preamble.or(banner).first()).toBeVisible({ timeout: 20_000 });
    await preamble.or(banner).first().click();
    const chip = (label: string) => page.locator(`[data-testid^="cbo-option-"][data-option-label="${label}"]`);
    await expect(chip('É isso ✓')).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId('cbo-chat-thread')).toContainText('Voluntários da Pátria 1039');
  });

  test('export here, import there: the record arrives, the contacts do not', async ({ page }) => {
    const api = new TestApi(page.request);
    test.skip(!(await api.ping()).fakeModel, 'needs the fake model');
    const prod = (await api.createCohort(`Prod ${randomUUID().slice(0, 6)}`)).cohort;
    const staging = (await api.createCohort(`Staging ${randomUUID().slice(0, 6)}`)).cohort;
    // An admin coordinator may act on both cohorts — two environments in one database.
    await api.createCoordinator({ email: `admin-${randomUUID()}@e2e.test`, password: 'pw-123456' });
    const orig = (await api.inviteMember(prod.id, { orgName: 'Ksa Rosa', neighborhood: 'Floresta', withSession: true })).member;
    await api.seedState(orig.cboStateId, { phase: 3, language: 'pt', sections: FULL });

    const ex = await page.request.get(`/api/cohort/${prod.coordinatorSlug}/member/${orig.id}/snapshot`);
    expect(ex.ok()).toBe(true);
    expect(ex.headers()['content-disposition']).toContain('ksa-rosa.snapshot.json');
    const snapshot = await ex.json();
    expect(snapshot.version).toBe(1);
    expect(snapshot.sections.intervention_type.chosen_solutions.value).toBe('jardins-de-chuva');

    const im = await page.request.post(`/api/cohort/${staging.coordinatorSlug}/members/import`, { data: { snapshot, orgName: 'Ksa Rosa — ensaio' } });
    expect(im.ok()).toBe(true);
    const { member: copy, summary } = await im.json();
    expect(copy.cohortId).toBe(staging.id);
    expect(copy.orgName).toBe('Ksa Rosa — ensaio');
    expect(summary.hasSite).toBe(true);
    const st = (await (await page.request.get(`/api/cbo/${copy.cboStateId}`)).json()).state;
    expect(st.sections.org_profile.fields.org_name.value).toBe('Ksa Rosa — ensaio');
    expect(st.sections.org_profile.fields.contact_email, 'contacts do not travel between environments').toBeUndefined();
    expect(st.sections.intervention_site.fields.site_name.value).toBe('Voluntários da Pátria 1039');
    expect(Object.keys(st.sections.intervention_type.fields)).toEqual([]);

    const bad = await page.request.post(`/api/cohort/${staging.coordinatorSlug}/members/import`, { data: { snapshot: { hello: 'world' } } });
    expect(bad.status()).toBe(400);
  });

  test('the drawer button ends on the copy\'s own link', async ({ page }) => {
    const api = new TestApi(page.request);
    test.skip(!(await api.ping()).fakeModel, 'needs the fake model');
    const cohort = (await api.createCohort(`Drawer ${randomUUID().slice(0, 6)}`)).cohort;
    await api.createCoordinator({ email: `drawer-${randomUUID()}@e2e.test`, password: 'pw-123456', cohortId: cohort.id });
    const orig = (await api.inviteMember(cohort.id, { orgName: 'COOP20', neighborhood: 'Floresta', withSession: true })).member;
    await api.seedState(orig.cboStateId, { phase: 3, language: 'pt', sections: FULL.map(f => f.field === 'org_name' ? { ...f, value: 'COOP20' } : f) });

    await page.goto(`/orchestrator?cohort=${cohort.coordinatorSlug}`);
    await page.getByTestId(`card-orchestrator-project-${orig.id}`).click({ timeout: 30_000 });
    await page.getByTestId('cbo-drawer-clone-test').click();
    const share = page.getByRole('dialog').filter({ hasText: 'COOP20 (teste)' });
    await expect(share).toBeVisible({ timeout: 20_000 });
    await expect(share).toContainText('/cbo-profile?t=');
    await page.keyboard.press('Escape');
    await expect(page.locator('[data-testid^="card-orchestrator-project-"]')).toHaveCount(2, { timeout: 15_000 });

    // And the import door is on the same header.
    await page.getByTestId('button-import-org').click();
    await page.getByTestId('input-snapshot-json').fill('{ nope');
    await expect(page.getByTestId('snapshot-preview-error')).toBeVisible();
    await expect(page.getByTestId('button-import-org-submit')).toBeDisabled();
  });
});

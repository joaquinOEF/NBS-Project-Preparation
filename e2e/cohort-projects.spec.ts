import { test, expect } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { TestApi } from './helpers/testApi';

// PROJECTS — the unit of work after Encontro 3 (docs/projects.md).
//
// A coordinator names a project and picks its organisations; the platform
// creates one shared session and one link with it. Everyone with the link
// lands in the same conversation, which opens on the brief: every member's
// record, side by side, then what they share. These tests walk that path end
// to end — the board, the link, the door, the document — and pin the things
// that would quietly break it: a link that resolves before the session
// exists, a brief that forgets an organisation, a door that does not survive
// a reload, a printed page in the wrong register.

const site = (org: string, bairro: string, worry: string, tests: string) => [
  { sectionId: 'org_profile', field: 'org_name', value: org },
  { sectionId: 'intervention_site', field: 'bairro', value: bairro },
  { sectionId: 'intervention_site', field: 'site_name', value: `Pátio da ${org}` },
  { sectionId: 'intervention_site', field: '_site_lat', value: '-30.0906' },
  { sectionId: 'intervention_site', field: '_site_lng', value: '-51.1726' },
  { sectionId: 'intervention_site', field: 'current_use', value: 'paved' },
  { sectionId: 'intervention_site', field: 'land_tenure', value: 'public-informal' },
  { sectionId: 'intervention_site', field: 'site_worry', value: worry },
  { sectionId: 'intervention_site', field: 'site_story', value: `Na ${org} a água entra pelo fundo e fica dias.` },
  { sectionId: 'intervention_site', field: 'site_area_m2', value: '600' },
  { sectionId: 'intervention_type', field: 'solution_tests_json', value: tests },
];

const TESTED = JSON.stringify([
  { solutionId: 'jardins-de-chuva', reaction: 'faz-sentido', testedAt: '2026-09-15T12:00:00Z' },
  { solutionId: 'pavimentos-permeaveis', reaction: 'nao-e-pra-gente', testedAt: '2026-09-15T12:10:00Z' },
]);

async function seedCohort(api: TestApi, tag: string) {
  const cohort = (await api.createCohort(`Proj ${tag}`)).cohort;
  await api.createCoordinator({ email: `proj-${tag}-${randomUUID()}@e2e.test`, password: 'pw-123456', cohortId: cohort.id });
  const ksa = (await api.inviteMember(cohort.id, { orgName: 'Ksa Rosa', neighborhood: 'Floresta', withSession: true })).member;
  const coop = (await api.inviteMember(cohort.id, { orgName: 'COOP20', neighborhood: 'Floresta', withSession: true })).member;
  const fresh = (await api.inviteMember(cohort.id, { orgName: 'Periferia Feminista', neighborhood: 'Morro da Cruz', withSession: true })).member;
  await api.seedState(ksa.cboStateId, { phase: 3, language: 'pt', sections: site('Ksa Rosa', 'Floresta', 'alagamento', TESTED) });
  await api.seedState(coop.cboStateId, { phase: 3, language: 'pt', sections: site('COOP20', 'Floresta', 'alagamento', TESTED) });
  return { cohort, ksa, coop, fresh };
}

test.describe('projects — the link, the door, the document', () => {
  test.use({ locale: 'pt-BR' });

  test('a project is created with its session, and the link resolves at once', async ({ page }) => {
    const api = new TestApi(page.request);
    test.skip(!(await api.ping()).fakeModel, 'needs the fake model');
    const { cohort, ksa, coop, fresh } = await seedCohort(api, randomUUID().slice(0, 6));

    const project = await api.createProject(cohort.coordinatorSlug, { title: 'Água e enchentes — Floresta', memberIds: [ksa.id, coop.id, fresh.id] });
    expect(project.capabilityToken, 'the link is the point of a project').toMatch(/^[A-Za-z0-9_-]{24}$/);
    expect(project.cboStateId, 'the session exists with the project — no first-opener race').toBeTruthy();
    expect(project.memberIds).toEqual([ksa.id, coop.id, fresh.id]);

    // The token is the credential: no cookie on a fresh context.
    const anon = await page.context().browser()!.newContext();
    const r = await anon.request.get(`/api/project/by-token/${project.capabilityToken}`);
    expect(r.ok()).toBe(true);
    const resolved = await r.json();
    expect(resolved.cboStateId).toBe(project.cboStateId);
    expect(resolved.members.map((m: any) => m.orgName)).toEqual(['Ksa Rosa', 'COOP20', 'Periferia Feminista']);
    expect(resolved.cohort?.name).toContain('Proj');
    await anon.close();

    // The session carries the discriminator that routes it.
    const st = await (await page.request.get(`/api/cbo/${project.cboStateId}`)).json();
    expect(st.state.metadata.project).toEqual({ id: project.id, cohortId: cohort.id });
    expect(st.state.phase).toBe(3);

    // Members from another cohort are dropped, never adopted.
    const other = (await api.createCohort('Other')).cohort;
    const stranger = (await api.inviteMember(other.id, { orgName: 'Stranger', withSession: false })).member;
    const p2 = await api.createProject(cohort.coordinatorSlug, { title: 'Só a Ksa', memberIds: [ksa.id, stranger.id] });
    expect(p2.memberIds).toEqual([ksa.id]);
    const bad = await page.request.post(`/api/cohort/${cohort.coordinatorSlug}/projects`, { data: { title: 'Ninguém', memberIds: [stranger.id] } });
    expect(bad.status()).toBe(400);
  });

  test('the brief carries every organisation, tested or not, in the written register', async ({ page }) => {
    const api = new TestApi(page.request);
    test.skip(!(await api.ping()).fakeModel, 'needs the fake model');
    const { cohort, ksa, coop, fresh } = await seedCohort(api, randomUUID().slice(0, 6));
    const project = await api.createProject(cohort.coordinatorSlug, { title: 'Floresta junta', memberIds: [ksa.id, coop.id, fresh.id] });

    const r = await page.request.get(`/api/project/${project.id}/brief?lang=pt`);
    expect(r.ok()).toBe(true);
    const html = await r.text();
    const text = html.replace(/<style[\s\S]*?<\/style>/g, '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
    expect(text).toContain('Floresta junta');
    for (const org of ['Ksa Rosa', 'COOP20', 'Periferia Feminista']) expect(text, org).toContain(org);
    // What each tested, with the reaction in report words.
    expect(text).toMatch(/Jardins de chuva/i);
    expect(text).toMatch(/Faz sentido|fez sentido/i);
    // The organisation that has not reached Encontro 3 says so — never a blank.
    expect(text).toContain('Ainda não testou soluções no Encontro 3');
    // What they share: Floresta groups the two that marked it.
    expect(text).toMatch(/Em comum/);
    expect(text).toMatch(/Floresta/);
    // Written register: third person, sources, no machine ids, no principle bleed.
    expect(text).toMatch(/Fonte:/);
    expect(text).not.toMatch(/\bvocês\b/i);
    expect(text).not.toMatch(/nada fica descartado|the map does not lead/i);
    expect(text).not.toMatch(/jardins-de-chuva|pavimentos-permeaveis/);
    expect(text, 'no code path on a printed page').not.toMatch(/shared\/|server\//);
    expect(text).toContain('RASCUNHO');
  });

  test('the door: the brief card, the roster question, and a reload that lands on the same question', async ({ page }) => {
    const api = new TestApi(page.request);
    test.skip(!(await api.ping()).fakeModel, 'needs the fake model');
    const { cohort, ksa, coop } = await seedCohort(api, randomUUID().slice(0, 6));
    const project = await api.createProject(cohort.coordinatorSlug, { title: 'Água e enchentes — Floresta', memberIds: [ksa.id, coop.id] });
    const chip = (label: string) => page.locator(`[data-testid^="cbo-option-"][data-option-label="${label}"]`);

    await page.goto(`/cbo-profile?p=${project.capabilityToken}`);
    // No welcome screen: the header is the project, the door is the brief.
    await expect(page.getByTestId('project-badge')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText('Água e enchentes — Floresta').first()).toBeVisible();
    const brief = page.getByTestId('cbo-project-brief');
    await expect(brief).toBeVisible({ timeout: 30_000 });
    await expect(brief).toHaveAttribute('data-blocks', '2');
    await expect(brief.getByTestId(`brief-block-${ksa.id}`)).toContainText('Ksa Rosa');
    await expect(brief.getByTestId(`brief-block-${coop.id}`)).toContainText('COOP20');
    await expect(brief.getByTestId(`brief-block-${ksa.id}`)).toContainText('Jardins de chuva');
    await expect(brief.getByTestId('project-brief-print')).toHaveAttribute('href', `/api/project/${project.id}/brief?lang=pt`);
    await expect(chip('Confere ✓')).toBeVisible({ timeout: 15_000 });
    await expect(chip('Falta gente ou tem gente sobrando')).toBeVisible();

    // Reload mid-door: the brief is still there and so is the question.
    await page.reload();
    await expect(page.getByTestId('cbo-project-brief')).toBeVisible({ timeout: 30_000 });
    await expect(chip('Confere ✓')).toBeVisible({ timeout: 15_000 });
    // Exactly one brief — the reload must not open the door twice.
    await expect(page.getByTestId('cbo-project-brief')).toHaveCount(1);

    await chip('Confere ✓').click();
    await expect(page.getByText('Por onde querem começar?')).toBeVisible({ timeout: 15_000 });
    await expect(chip('O que a gente tem em comum')).toBeVisible();

    // The roster ask never comes back on its own after it was answered.
    await page.reload();
    await expect(chip('O que a gente tem em comum')).toBeVisible({ timeout: 30_000 });
    await expect(chip('Confere ✓')).toHaveCount(0);
  });

  test('an archived or deleted project stops resolving; the organisations are untouched', async ({ page }) => {
    const api = new TestApi(page.request);
    test.skip(!(await api.ping()).fakeModel, 'needs the fake model');
    const { cohort, ksa, coop } = await seedCohort(api, randomUUID().slice(0, 6));
    const project = await api.createProject(cohort.coordinatorSlug, { title: 'Arquivar', memberIds: [ksa.id, coop.id] });

    const patch = await page.request.patch(`/api/cohort/${cohort.coordinatorSlug}/projects/${project.id}`, { data: { archived: true } });
    expect(patch.ok()).toBe(true);
    expect((await page.request.get(`/api/project/by-token/${project.capabilityToken}`)).status()).toBe(404);
    const back = await page.request.patch(`/api/cohort/${cohort.coordinatorSlug}/projects/${project.id}`, { data: { archived: false, title: 'De volta' } });
    expect((await back.json()).project.title).toBe('De volta');
    expect((await page.request.get(`/api/project/by-token/${project.capabilityToken}`)).ok()).toBe(true);

    const del = await page.request.delete(`/api/cohort/${cohort.coordinatorSlug}/projects/${project.id}`);
    expect(del.ok()).toBe(true);
    expect((await page.request.get(`/api/project/by-token/${project.capabilityToken}`)).status()).toBe(404);
    // The members' own links still work.
    expect((await page.request.get(`/api/cbo-member/by-token/${ksa.capabilityToken}`)).ok()).toBe(true);
  });
});

test.describe('projects — the board', () => {
  test.use({ locale: 'pt-BR' });

  test('Organizações | Projetos: an empty state, a dialog, a card with the link', async ({ page }) => {
    const api = new TestApi(page.request);
    test.skip(!(await api.ping()).fakeModel, 'needs the fake model');
    const { cohort, ksa, coop } = await seedCohort(api, randomUUID().slice(0, 6));

    await page.goto(`/orchestrator?cohort=${cohort.coordinatorSlug}`);
    await expect(page.getByTestId('orchestrator-view-switch')).toBeVisible({ timeout: 30_000 });
    // The roster is the default; the projects view is one tap and says what a project is.
    await expect(page.getByTestId('view-orgs')).toHaveAttribute('aria-pressed', 'true');
    await page.getByTestId('view-projects').click();
    await expect(page).toHaveURL(/view=projects/);
    await expect(page.getByTestId('projects-empty')).toBeVisible();
    await expect(page.getByTestId('projects-empty')).toContainText('organizações');

    await page.getByTestId('button-create-project-empty').click();
    const dialog = page.getByTestId('create-project-dialog');
    await expect(dialog).toBeVisible();
    await dialog.getByTestId('input-project-title').fill('Água e enchentes — Floresta');
    // Nothing picked yet → cannot submit.
    await expect(dialog.getByTestId('button-create-project-submit')).toBeDisabled();
    await dialog.getByTestId(`project-member-${ksa.id}`).click();
    await dialog.getByTestId(`project-member-${coop.id}`).click();
    await dialog.getByTestId('button-create-project-submit').click();

    // The link is in hand the moment the project exists.
    const share = page.getByRole('dialog').filter({ hasText: 'Água e enchentes — Floresta' });
    await expect(share).toBeVisible({ timeout: 15_000 });
    await expect(share).toContainText('/cbo-profile?p=');
    await page.keyboard.press('Escape');

    const card = page.locator('[data-testid^="project-card-"]').first();
    await expect(card).toBeVisible();
    await expect(card.getByTestId('project-title')).toHaveText('Água e enchentes — Floresta');
    await expect(card.getByTestId('project-orgs')).toContainText('Ksa Rosa');
    await expect(card.getByTestId('project-orgs')).toContainText('COOP20');
    await expect(card.getByTestId('link-project-chat')).toHaveAttribute('href', /cbo-profile\?p=[A-Za-z0-9_-]{24}$/);
    await expect(card.getByTestId('link-project-brief')).toHaveAttribute('href', /\/api\/project\/.+\/brief\?lang=pt/);

    // The count on the switch follows.
    await expect(page.getByTestId('view-projects')).toContainText('1');

    // A reload lands on the projects view, not back on the roster.
    await page.reload();
    await expect(page.getByTestId('projects-grid')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId('view-projects')).toHaveAttribute('aria-pressed', 'true');
  });
});

import { test, expect, type APIRequestContext } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { TestApi } from './helpers/testApi';

// "LEVAR AO ENCONTRO 4" — decided in the 22 Oct call (Ana, Vila Flores):
// Misturaí, Periferia Feminista and others are still in Encontro 2 or 3, but
// their solution was settled with Vila Flores at the visit. The coordination
// takes them straight to the initial proposal; Encontro 4 asks what the
// skipped encontros would have given it — the problem, the place, and anything
// else they want to tell or attach — and the record says what was skipped.

async function chat(request: APIRequestContext, cboId: string, message: string, turnKind = 'chip'): Promise<any[]> {
  const r = await request.post(`/api/cbo/${cboId}/chat`, { data: { message, lang: 'pt', turnKind } });
  expect(r.ok(), `chat ${message}`).toBe(true);
  const text = await r.text();
  return text.split('\n\n').map(b => b.trim()).filter(b => b.startsWith('data:')).map(b => { try { return JSON.parse(b.slice(5).trim()); } catch { return null; } }).filter(Boolean);
}
async function step(request: APIRequestContext, cboId: string, message: string, turnKind = 'chip') {
  const events = await chat(request, cboId, message, turnKind);
  const done = events.filter(e => e.type === 'done').pop();
  expect(String(done?.summary ?? ''), `"${message}" is the encontro's, not the model's`).toMatch(/E4 checkpoint/);
  const asks = events.filter(e => e.type === 'ask_user');
  expect(asks.length, `"${message}" ends on something to tap`).toBeGreaterThan(0);
  const ask = asks[asks.length - 1];
  return { events, ask, labels: (ask?.options ?? []).map((o: any) => o.label) as string[] };
}
const fields = async (request: APIRequestContext, cboId: string, section: string) => {
  const j: any = await (await request.get(`/api/cbo/${cboId}`)).json();
  const f = (j.state ?? j).sections?.[section]?.fields ?? {};
  return Object.fromEntries(Object.entries(f).map(([k, v]: any) => [k, String(v?.value ?? '')])) as Record<string, string>;
};

test.describe('Levar ao Encontro 4', () => {
  test.use({ locale: 'pt-BR' });

  test('from Encontro 2, with no place and no problem: the coordination skips, Encontro 4 asks what is missing', async ({ page }) => {
    test.setTimeout(180_000);
    const api = new TestApi(page.request);
    test.skip(!(await api.ping()).fakeModel, 'needs the fake model');
    const tag = randomUUID().slice(0, 6);
    const cohort = (await api.createCohort(`Pular ${tag}`)).cohort;
    await api.createCoordinator({ email: `skip-${tag}@e2e.test`, password: 'pw-123456', cohortId: cohort.id });
    const m = (await api.inviteMember(cohort.id, { orgName: 'Misturaí', neighborhood: 'Santana', withSession: true, unlockedPhases: [1, 2] })).member;
    await api.seedState(m.cboStateId, { phase: 2, language: 'pt', sections: [
      { sectionId: 'org_profile', field: 'org_name', value: 'Misturaí' },
      { sectionId: 'intervention_site', field: 'bairro', value: 'Santana' },
      // Robson recorded the visit: the solution settled with them on the ground.
      { sectionId: 'intervention_type', field: '_visit_json', value: JSON.stringify({ solutionId: 'jardins-de-chuva', areaM2: 60, date: '2026-10-24', recordedAt: 'x' }) },
    ] });

    // The coordination, in the visit tab.
    await page.goto(`/orchestrator?cohort=${cohort.coordinatorSlug}`);
    const card = page.getByTestId(`card-orchestrator-project-${m.id}`);
    await expect(page.getByTestId(`journey-next-${m.id}`)).toContainText('Encontro 2', { timeout: 30_000 });
    await card.click();
    await page.getByTestId('cbo-tab-visita').click();
    await expect(page.getByTestId('visit-skip-e4')).toContainText('Encontro 2');
    await page.getByTestId('visit-skip-e4-button').click();
    await page.getByTestId('visit-skip-e4-confirm').click();
    await expect(page.getByTestId('visit-skip-e4')).toHaveCount(0);

    // The board behind the drawer moved without a reload: 2 and 3 passed (dashed), not done.
    await expect(page.getByTestId(`journey-next-${m.id}`)).toContainText('Encontro 4', { timeout: 15_000 });
    const dots = page.getByTestId(`journey-dots-${m.id}`);
    await expect(dots.locator('[data-skipped="yes"]')).toHaveCount(2);

    // What was skipped is recorded — never written as closed.
    const site = await fields(page.request, m.cboStateId, 'intervention_site');
    let type = await fields(page.request, m.cboStateId, 'intervention_type');
    expect(site._e2_skipped).toBe('yes');
    expect(type._e3_skipped).toBe('yes');
    expect(site._e2_closed ?? '').toBe('');
    expect(type._e3_closed ?? '').toBe('');
    expect(JSON.parse(type._skip_json)).toMatchObject({ from: 2 });

    // The organisation, on its phone.
    const r = page.request;
    // The first open after a skip goes through the resume card, which sends
    // "Continuar da Fase 4." — with the full stop. It is the encontro's line.
    let s = await step(r, m.cboStateId, 'Continuar da Fase 4.', 'text');
    expect(s.ask.question, 'not offered a close of an encontro it never reached').not.toMatch(/Fechamos o Encontro 3/);
    expect(s.ask.question).toMatch(/Jardins de chuva/);
    s = await step(r, m.cboStateId, 'É essa ✓');
    s = await step(r, m.cboStateId, 'Isso ✓');
    expect(s.ask.question, 'no place marked: the map, or carry on').toMatch(/não está marcado no mapa/);
    s = await step(r, m.cboStateId, 'Seguir sem o lugar');
    // Nothing on record about the problem: asked in Encontro 2's own words.
    expect(s.ask.question).toBe('Qual é o problema principal que essa solução enfrenta aqui?');
    expect(s.labels).toContain('💧 Alagamento');
    s = await step(r, m.cboStateId, '💧 Alagamento');
    // Then their context: words, audio or files — the files chip opens the chooser.
    expect(s.ask.question).toBe('Querem acrescentar algo?');
    const attach = s.ask.options.find((o: any) => o.label === '📎 Anexar arquivos');
    expect(attach?.action).toBe('upload_then_answer');
    // A file at this step is acknowledged on the spot (and read again in the background).
    s = await step(r, m.cboStateId, 'Uploaded "projeto-praca.pdf"', 'upload');
    expect(s.events.some(e => e.type === 'chat' && /Recebi ✓/.test(e.content)), 'the file is acknowledged').toBe(true);
    expect(s.ask.question).toBe('Mais alguma coisa?');
    s = await step(r, m.cboStateId, 'A praça alaga toda vez que chove forte e a gente já plantou mudas com 30 famílias.', 'text');
    expect(s.ask.question).toBe('Mais alguma coisa?');
    s = await step(r, m.cboStateId, 'Pode seguir');
    expect(s.events.some(e => e.type === 'show_prenote'), 'the draft follows').toBe(true);

    // The gaps: a sentence typed at the indicators question is kept, then the menu once more.
    s = await step(r, m.cboStateId, 'Umas 40 famílias da praça.', 'text');
    expect(s.ask.question).toMatch(/o que vocês mais querem ver mudar/);
    s = await step(r, m.cboStateId, 'Que a praça pare de alagar quando chove.', 'text');
    expect(s.ask.question).toBe('E qual destes mede melhor essa mudança?');
    s = await step(r, m.cboStateId, 'Todas essas');
    expect(s.ask.question).toMatch(/Quem faria a obra/);

    type = await fields(page.request, m.cboStateId, 'intervention_type');
    expect(type.project_notes).toContain('O que querem ver mudar: Que a praça pare de alagar');
    expect(type.project_notes, 'what they told goes where every pass reads it').toContain('já plantou mudas com 30 famílias');
    expect((await fields(page.request, m.cboStateId, 'intervention_site')).site_worry).toBe('alagamento');
  });

  test('the route refuses an organisation already in Encontro 4', async ({ page }) => {
    const api = new TestApi(page.request);
    test.skip(!(await api.ping()).fakeModel, 'needs the fake model');
    const tag = randomUUID().slice(0, 6);
    const cohort = (await api.createCohort(`Pular2 ${tag}`)).cohort;
    await api.createCoordinator({ email: `skip2-${tag}@e2e.test`, password: 'pw-123456', cohortId: cohort.id });
    const m = (await api.inviteMember(cohort.id, { orgName: 'Já no 4', neighborhood: 'Floresta', withSession: true, unlockedPhases: [1, 2, 3, 4] })).member;
    await api.seedState(m.cboStateId, { phase: 4, language: 'pt', sections: [{ sectionId: 'intervention_site', field: 'bairro', value: 'Floresta' }] });
    const res = await page.request.post(`/api/cohort/${cohort.coordinatorSlug}/member/${m.id}/skip-to-e4`, { data: {} });
    expect(res.status()).toBe(409);
  });
});

test.describe('Levar ao Encontro 4 — from the card', () => {
  test.use({ locale: 'pt-BR' });

  test('with Encontro 4 open, a card still in 1–3 offers it; a tested Encontro 3 is closed as it stands, not skipped', async ({ page }) => {
    test.setTimeout(120_000);
    const api = new TestApi(page.request);
    test.skip(!(await api.ping()).fakeModel, 'needs the fake model');
    const tag = randomUUID().slice(0, 6);
    const cohort = (await api.createCohort(`Pular card ${tag}`)).cohort;
    await api.createCoordinator({ email: `skipcard-${tag}@e2e.test`, password: 'pw-123456', cohortId: cohort.id });
    // Ksa Rosa's shape: tested, the close never written.
    const m = (await api.inviteMember(cohort.id, { orgName: 'Ksa Rosa', neighborhood: 'Floresta', withSession: true, unlockedPhases: [1, 2, 3] })).member;
    await api.seedState(m.cboStateId, { phase: 3, language: 'pt', sections: [
      { sectionId: 'intervention_site', field: 'bairro', value: 'Floresta' },
      { sectionId: 'intervention_type', field: 'solution_tests_json', value: JSON.stringify([{ solutionId: 'compostagem', reaction: 'faz-sentido', testedAt: '2026-09-30T13:41:00Z' }]) },
    ] });

    // Encontro 4 not open yet: no skip on the card.
    await page.goto(`/orchestrator?cohort=${cohort.coordinatorSlug}`);
    await expect(page.getByTestId(`card-orchestrator-project-${m.id}`)).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId(`button-skip-e4-${m.id}`)).toHaveCount(0);

    // Opened: the card offers it, and the visit tab opens with the confirmation waiting.
    expect((await page.request.patch(`/api/cohort/${cohort.coordinatorSlug}/open-workshop`, { data: { phase: 4, openedAt: '2026-10-29' } })).ok()).toBe(true);
    await page.reload();
    await page.getByTestId(`button-skip-e4-${m.id}`).click({ timeout: 30_000 });
    await expect(page.getByTestId('cbo-tab-visita')).toHaveAttribute('data-state', 'active');
    await page.getByTestId('visit-skip-e4-confirm').click();
    await expect(page.getByTestId('visit-skip-e4')).toHaveCount(0);
    await page.keyboard.press('Escape');
    await expect(page.getByTestId(`button-skip-e4-${m.id}`)).toHaveCount(0, { timeout: 15_000 });

    const type = await fields(page.request, m.cboStateId, 'intervention_type');
    expect(type._e3_closed, 'tested = done in substance: closed as it stands').toBe('yes');
    expect(type._e3_closed_by).toBe('coordination');
    expect(type._e3_skipped ?? '').toBe('');
  });
});

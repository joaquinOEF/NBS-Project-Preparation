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
    // Step 2: what is still missing, all optional — this org's coordination leaves it all to them.
    await expect(page.getByTestId('skip-e4-steps')).toHaveText('Passo 2 de 2');
    await expect(page.getByTestId('e4-answers-optional')).toContainText('Tudo aqui é opcional');
    await page.getByTestId('e4-answers-leave').click();
    await expect(page.getByTestId('cbo-tab-documentos')).toHaveAttribute('data-state', 'active');
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
    // Its own view, confirmation first (22 Oct decision), then what is still missing.
    await expect(page.getByTestId('skip-e4-steps')).toHaveText('Passo 1 de 2');
    await page.getByTestId('visit-skip-e4-confirm').click();
    await expect(page.getByTestId('skip-e4-done')).toContainText('Encontro 4 aberto para Ksa Rosa');
    await expect(page.getByTestId('e4-answers-skip')).toBeVisible();
    await page.getByTestId('e4-answers-leave').click();
    await expect(page.getByTestId('skip-e4-view')).toHaveCount(0);
    await page.keyboard.press('Escape');
    await expect(page.getByTestId(`button-skip-e4-${m.id}`)).toHaveCount(0, { timeout: 15_000 });

    const type = await fields(page.request, m.cboStateId, 'intervention_type');
    expect(type._e3_closed, 'tested = done in substance: closed as it stands').toBe('yes');
    expect(type._e3_closed_by).toBe('coordination');
    expect(type._e3_skipped ?? '').toBe('');
  });
});

test.describe('Levar ao Encontro 4 — the coordination answers some, the organisation the rest', () => {
  test.use({ locale: 'pt-BR' });

  test('answered in the drawer = not asked in the chat; marked on the page; confirmed in one check; a correction takes the mark away', async ({ page }) => {
    test.setTimeout(240_000);
    const api = new TestApi(page.request);
    test.skip(!(await api.ping()).fakeModel, 'needs the fake model');
    const tag = randomUUID().slice(0, 6);
    const cohort = (await api.createCohort(`Lacunas ${tag}`)).cohort;
    await api.createCoordinator({ email: `gaps-${tag}@e2e.test`, password: 'pw-123456', cohortId: cohort.id });
    const m = (await api.inviteMember(cohort.id, { orgName: 'Periferia Feminista', neighborhood: 'Restinga', withSession: true, unlockedPhases: [1, 2] })).member;
    await api.seedState(m.cboStateId, { phase: 2, language: 'pt', sections: [
      { sectionId: 'org_profile', field: 'org_name', value: 'Periferia Feminista' },
      { sectionId: 'intervention_site', field: 'bairro', value: 'Restinga' },
    ] });
    expect((await page.request.patch(`/api/cohort/${cohort.coordinatorSlug}/open-workshop`, { data: { phase: 4, openedAt: '2026-10-29' } })).ok()).toBe(true);

    // ── The coordination: skip from the card, answer what it knows ──────────
    await page.goto(`/orchestrator?cohort=${cohort.coordinatorSlug}`);
    await page.getByTestId(`button-skip-e4-${m.id}`).click({ timeout: 30_000 });
    await page.getByTestId('visit-skip-e4-confirm').click();
    const form = page.getByTestId('e4-answers-skip');
    await expect(form).toBeVisible();
    // Skipped from Encontro 2: everything is open, and each item says it is optional.
    await expect(form.getByText('opcional', { exact: true })).toHaveCount(11);
    await page.getByTestId('e4a-input-solution').selectOption('jardins-de-chuva');
    await page.getByTestId('e4a-input-size').fill('120');
    await page.getByTestId('e4a-map').click({ position: { x: 150, y: 90 } });
    await expect(page.getByTestId('e4a-pin')).toBeVisible();
    await page.getByTestId('e4a-input-sitename').fill('Pátio da sede');
    await page.getByTestId('e4a-problem-heat').click();
    await page.getByTestId('e4a-input-beneficiarios').fill('Umas 40 famílias e as crianças da creche');
    await page.getByTestId('e4a-build-mutirao').click();
    await page.getByTestId('e4a-input-context').fill('Na visita vimos que o pátio não tem nenhuma sombra.');
    await page.getByTestId('e4-answers-save').click();
    await expect(page.getByTestId('e4-answers-saved')).toBeVisible();
    // Saved answers fold into what was answered, marked as the coordination's.
    await expect(page.getByTestId('e4a-answered-beneficiarios')).toContainText('Umas 40 famílias');
    await expect(page.getByTestId('e4a-item-quem-faz-obra')).toContainText('registrado pela coordenação');
    await expect(page.getByTestId('e4-answers-leave')).toHaveText('Deixar o resto para a organização');
    await page.getByTestId('e4-answers-leave').click();

    // In Documentos: the proposal names what the coordination answered, and the form stays for later.
    await expect(page.getByTestId('prenote-bycoord-problema')).toContainText('quem é atingido');
    await expect(page.getByTestId('prenote-bycoord-solucao')).toContainText('quem faz a obra');
    await expect(page.getByTestId('e4-answers-documents')).toContainText('O que ainda falta (4)');

    let type = await fields(page.request, m.cboStateId, 'intervention_type');
    const site = await fields(page.request, m.cboStateId, 'intervention_site');
    expect(JSON.parse(type._e4_solution_json)).toMatchObject({ solutionId: 'jardins-de-chuva', source: 'coordenacao', areaM2: 120 });
    expect(type.construction_model).toBe('mutirao');
    expect(type.project_notes).toContain('Da coordenação: Na visita vimos');
    expect(site.beneficiaries_note).toBe('Umas 40 famílias e as crianças da creche');
    expect(site.site_worry).toBe('heat');
    expect(site._site_lat).not.toBe('');
    expect(site.site_name).toBe('Pátio da sede');

    // ── The organisation: only what was left ─────────────────────────────────
    const r = page.request;
    let s = await step(r, m.cboStateId, 'Continuar da Fase 4.', 'text');
    const asked: string[] = [s.ask.question];
    // Solution, size, place and problem were answered: straight to their context.
    expect(s.ask.question).toBe('Querem acrescentar algo?');
    s = await step(r, m.cboStateId, 'Pode seguir');
    asked.push(s.ask.question);
    const draft = s.events.find(e => e.type === 'show_prenote')?.prenote;
    expect(draft?.byCoordination).toEqual(['solution', 'size', 'place', 'problem', 'beneficiarios', 'quem-faz-obra']);
    // Who is affected was answered: the first gap is what they want to see change.
    expect(s.ask.question).toMatch(/o que vocês mais querem ver mudar/);
    s = await step(r, m.cboStateId, 'Todas essas');
    asked.push(s.ask.question);
    // Who builds was answered: who looks after it comes next.
    expect(s.ask.question).toMatch(/quem cuida no dia a dia/);
    s = await step(r, m.cboStateId, 'A própria organização');
    s = await step(r, m.cboStateId, 'Nada por enquanto');
    s = await step(r, m.cboStateId, 'Ninguém ainda');
    asked.push(s.ask.question);
    expect(asked.join(' | '), 'never asked what the coordination answered').not.toMatch(/Quem faria a obra|quem sofre mais|tamanho|marcado no mapa|problema principal/);

    // ── One check, naming what the coordination answered ────────────────────
    expect(s.ask.question).toBe('Confere tudo?');
    expect(s.labels).toEqual(['Está certo ✓', 'Corrigir uma']);
    const said = s.events.filter(e => e.type === 'chat').map(e => e.content).join(' ');
    expect(said).toContain('A coordenação já adiantou 6 respostas');
    expect(said).toContain('quem faz a obra');

    // A correction: latest answer wins, and the mark goes with the old value.
    s = await step(r, m.cboStateId, 'Corrigir uma');
    expect(s.labels).toContain('O lugar no mapa');
    expect(s.labels).toContain('O problema principal');
    s = await step(r, m.cboStateId, 'Quem faz e quem cuida');
    expect(s.ask.question).toMatch(/Quem faria a obra/);
    s = await step(r, m.cboStateId, 'Empresa contratada');
    s = await step(r, m.cboStateId, 'A própria organização');
    expect(s.ask.question).toBe('Confere tudo?');
    const after = s.events.filter(e => e.type === 'chat').map(e => e.content).join(' ');
    expect(after).toContain('A coordenação já adiantou 5 respostas');
    expect(after).not.toContain('quem faz a obra');
    s = await step(r, m.cboStateId, 'Está certo ✓');
    type = await fields(page.request, m.cboStateId, 'intervention_type');
    expect(type._e4_closed).toBe('yes');
    expect(type.construction_model).toBe('contratada');

    // The printed page says whose answer each line is.
    const html = await (await page.request.get(`/api/cbo/${m.cboStateId}/prenote?lang=pt`)).text();
    expect(html).toContain('registrado pela coordenação');
    expect(html).toContain('indicada pela coordenação');
  });

  test('the answers route refuses an organisation not yet in Encontro 4, and ignores options it does not know', async ({ page }) => {
    const api = new TestApi(page.request);
    test.skip(!(await api.ping()).fakeModel, 'needs the fake model');
    const tag = randomUUID().slice(0, 6);
    const cohort = (await api.createCohort(`Lacunas2 ${tag}`)).cohort;
    await api.createCoordinator({ email: `gaps2-${tag}@e2e.test`, password: 'pw-123456', cohortId: cohort.id });
    const m = (await api.inviteMember(cohort.id, { orgName: 'Ainda no 2', neighborhood: 'Floresta', withSession: true, unlockedPhases: [1, 2] })).member;
    await api.seedState(m.cboStateId, { phase: 2, language: 'pt', sections: [{ sectionId: 'intervention_site', field: 'bairro', value: 'Floresta' }] });
    const url = `/api/cohort/${cohort.coordinatorSlug}/member/${m.id}/e4-answers`;
    expect((await page.request.post(url, { data: { answers: { beneficiarios: 'x' } } })).status()).toBe(409);
    await api.seedState(m.cboStateId, { phase: 4, language: 'pt', sections: [] });
    expect((await page.request.post(url, { data: { answers: { solutionId: 'nao-existe' } } })).status()).toBe(400);
    const ok = await (await page.request.post(url, { data: { answers: { quemFaz: 'robos', quemCuida: 'nos', problem: 'other' } } })).json();
    expect(ok.values['quem-faz-obra']).toBe('');
    expect(ok.values['quem-cuida']).toBe('nos');
    expect(ok.values.problem).toBe('');
    expect(ok.byCoordination).toEqual(['quem-cuida']);
  });
});

test.describe('a typed "quem faria / quem cuida" is read only when it says it plainly', () => {
  test('typedChoice', async () => {
    const { typedChoice } = await import('../server/services/cboE4Checkpoint');
    expect(typedChoice('quem-faz-obra', 'Mutirão com o apoio de um engenheiro')).toBe('mista');
    expect(typedChoice('quem-faz-obra', 'a gente mesmo, em mutirão')).toBe('mutirao');
    expect(typedChoice('quem-faz-obra', 'uma empresa contratada pela prefeitura')).toBe('contratada');
    expect(typedChoice('quem-faz-obra', 'os alunos da UFRGS')).toBe('parceria');
    expect(typedChoice('quem-faz-obra', 'ainda não sabemos quem')).toBe('indefinido');
    expect(typedChoice('quem-faz-obra', 'A gente acha que sim, é isso mesmo')).toBeNull();
    expect(typedChoice('quem-cuida', 'os voluntários da comunidade')).toBe('voluntarios');
    expect(typedChoice('quem-cuida', 'a própria organização cuida')).toBe('nos');
    expect(typedChoice('quem-cuida', 'o DMAE deveria cuidar')).toBe('parceria-prefeitura');
    expect(typedChoice('quem-cuida', 'depende do inverno')).toBeNull();
  });
});

test.describe('every encontro answers its own resume card', () => {
  for (const [phase, sections, pattern] of [
    [2, [{ sectionId: 'org_profile', field: 'org_name', value: 'X' }], /E2 (entry|return)/],
    [3, [{ sectionId: 'intervention_site', field: 'bairro', value: 'Floresta' }, { sectionId: 'intervention_site', field: '_e2_closed', value: 'yes' }], /E3 checkpoint/],
    [4, [{ sectionId: 'intervention_site', field: 'bairro', value: 'Floresta' }, { sectionId: 'intervention_type', field: '_e3_closed', value: 'yes' }], /E4 checkpoint/],
  ] as const) {
    test(`"Continuar da Fase ${phase}." opens Encontro ${phase}, not the model`, async ({ page }) => {
      const api = new TestApi(page.request);
      test.skip(!(await api.ping()).fakeModel, 'needs the fake model');
      const { cboId } = await api.newSession();
      await api.seedState(cboId, { phase, language: 'pt', sections: sections as any });
      const events = await chat(page.request, cboId, `Continuar da Fase ${phase}.`, 'system');
      expect(String(events.filter(e => e.type === 'done').pop()?.summary ?? '')).toMatch(pattern);
    });
  }
});

import { test, expect, type APIRequestContext } from '@playwright/test';
import { TestApi } from './helpers/testApi';
import { prenoteGaps, prenoteInputFromSections, parseE4Solution } from '../shared/e4-prenote';
import { parsePending, PENDING_FIELD } from '../shared/pending-question';

// ENCONTRO 4 — input, prefill, gaps, one check (server/services/cboE4Checkpoint.ts).
//
// Walked over HTTP like an organisation would: every turn served by the
// template (never the model), every turn ending on something to tap, a
// return landing on the same question, nothing that waits on a person — an
// unclosed Encontro 3 is closed as it stands, a missing visit means they
// pick, a missing place can be skipped.

const TESTS = JSON.stringify([
  { solutionId: 'jardins-de-chuva', reaction: 'faz-sentido', areaM2: 120, who: 'nos', hardest: 'custo', testedAt: '2026-09-15T12:00:00Z' },
  { solutionId: 'corredores-verdes', reaction: 'ainda-nao-sabemos', units: 25, testedAt: '2026-09-15T12:05:00Z' },
]);
const BASE_FIELDS = [
  { sectionId: 'org_profile', field: 'org_name', value: 'Ksa Rosa' },
  { sectionId: 'org_profile', field: 'contact_name', value: 'Marlene' },
  { sectionId: 'intervention_site', field: 'bairro', value: 'Floresta' },
  { sectionId: 'intervention_site', field: 'site_name', value: 'Voluntários da Pátria 1039' },
  { sectionId: 'intervention_site', field: 'site_worry', value: 'alagamento' },
  { sectionId: 'intervention_site', field: 'site_story', value: 'Quando chove forte a água entra pelo portão.' },
  { sectionId: 'intervention_site', field: 'land_tenure', value: 'private-owned' },
  { sectionId: 'intervention_site', field: 'site_area_m2', value: '600' },
  { sectionId: 'intervention_type', field: 'solution_tests_json', value: TESTS },
  { sectionId: 'intervention_type', field: 'chosen_solutions', value: 'jardins-de-chuva' },
];
const PLACE = [
  { sectionId: 'intervention_site', field: '_site_lat', value: '-30.0198' },
  { sectionId: 'intervention_site', field: '_site_lng', value: '-51.2032' },
];

async function chat(request: APIRequestContext, cboId: string, message: string, turnKind = 'chip'): Promise<any[]> {
  const r = await request.post(`/api/cbo/${cboId}/chat`, { data: { message, lang: 'pt', turnKind } });
  expect(r.ok(), `chat ${message}`).toBe(true);
  const text = await r.text();
  return text.split('\n\n').map(b => b.trim()).filter(b => b.startsWith('data:')).map(b => { try { return JSON.parse(b.slice(5).trim()); } catch { return null; } }).filter(Boolean);
}
const stateOf = async (request: APIRequestContext, cboId: string) => {
  const j: any = await (await request.get(`/api/cbo/${cboId}`)).json();
  return j.state ?? j;
};
/** One templated turn: served by E4, ends on a question. Returns the last question. */
async function step(request: APIRequestContext, cboId: string, message: string, turnKind = 'chip') {
  const events = await chat(request, cboId, message, turnKind);
  const done = events.filter(e => e.type === 'done').pop();
  expect(String(done?.summary ?? ''), `"${message}" is the encontro's, not the model's`).toMatch(/E4 checkpoint/);
  const asks = events.filter(e => e.type === 'ask_user');
  const actionable = asks.length || events.some(e => e.type === 'open_map');
  expect(actionable, `"${message}" ends on something to tap`).toBeTruthy();
  return { events, ask: asks[asks.length - 1], labels: (asks[asks.length - 1]?.options ?? []).map((o: any) => o.label) as string[] };
}

test.describe('Encontro 4 — the pre-note, walked', () => {
  test('the polite path: the visit\'s choice, confirmations, five gaps, one check', async ({ page }) => {
    const api = new TestApi(page.request);
    test.skip(!(await api.ping()).fakeModel, 'needs the fake model');
    const { cboId } = await api.newSession();
    await api.seedState(cboId, { phase: 4, language: 'pt', sections: [
      ...BASE_FIELDS, ...PLACE,
      { sectionId: 'intervention_type', field: '_e3_closed', value: 'yes' },
      { sectionId: 'intervention_type', field: '_visit_json', value: JSON.stringify({ solutionId: 'jardins-de-chuva', areaM2: 140, date: '2026-10-23', recordedAt: 'x' }) },
      { sectionId: 'intervention_site', field: 'prior_collaboration_detail', value: 'COOP20 e a escola estadual' },
    ] });
    const r = page.request;

    let s = await step(r, cboId, 'Vamos começar o Encontro 4.', 'text');
    expect(s.ask.question).toMatch(/Depois da visita técnica, a indicação foi: \*\*Jardins de chuva · 140 m² · visita em 23\/10\/2026\*\*/);
    s = await step(r, cboId, 'É essa ✓');
    expect(s.ask.question, 'the visit\'s size, not the test\'s').toMatch(/140 m²/);
    s = await step(r, cboId, 'Isso ✓');
    expect(s.ask.question).toMatch(/a água que junta e não escoa/);
    s = await step(r, cboId, 'Isso ✓');
    // The draft appears at once, and the first gap follows in the same turn.
    expect(s.events.some(e => e.type === 'show_prenote'), 'the draft is shown').toBe(true);
    const draft = s.events.find(e => e.type === 'show_prenote').prenote;
    expect(draft.solution).toMatchObject({ id: 'jardins-de-chuva', source: 'visita', areaM2: 140 });
    expect(s.ask.question).toMatch(/quem sofre mais/);
    s = await step(r, cboId, 'Umas 40 famílias da rua de baixo', 'text');
    expect(s.ask.question).toMatch(/o que vocês mais querem ver mudar/);
    expect(s.labels[0], 'the change that answers their worry comes first').toBe('Menos água parada / menos alagamento');
    s = await step(r, cboId, 'Menos água parada / menos alagamento');
    // Encontro 3 already said who would build it — a confirmation, not a question.
    expect(s.ask.question).toMatch(/No Encontro 3, pra quem faria a obra, vocês disseram: \*\*a própria organização, em mutirão\*\*/);
    s = await step(r, cboId, 'Isso ✓');
    expect(s.ask.question).toMatch(/quem cuida no dia a dia/);
    s = await step(r, cboId, 'Voluntários da comunidade');
    // What they bring, from what the record already says — confirmed, then added to.
    expect(s.ask.question).toMatch(/Pelo que vocês já contaram, a organização coloca no projeto: \*\*Mutirão; terreno já em uso pela organização\*\*/);
    s = await step(r, cboId, 'Isso, e mais coisa');
    s = await step(r, cboId, 'Mutirão de 20 pessoas e as mudas do viveiro', 'text');
    // Who they worked with in Encontro 2 — offered as the partners, confirmed in one tap.
    expect(s.ask.question).toMatch(/No registro de vocês aparece: \*\*COOP20 e a escola estadual\*\*/);
    s = await step(r, cboId, 'Isso ✓');
    expect(s.ask.question).toBe('Está bom assim?');
    const full = s.events.find(e => e.type === 'show_prenote').prenote;
    expect(full.gaps).toEqual([]);
    s = await step(r, cboId, 'Pode fechar ✓');

    const st = await stateOf(r, cboId);
    const t = st.sections.intervention_type.fields;
    expect(t._e4_closed.value).toBe('yes');
    expect(t.construction_model.value).toBe('mutirao');
    expect(st.sections.operations_sustain.fields.who_maintains.value).toBe('voluntarios');
    expect(st.sections.intervention_site.fields.beneficiaries_note.value).toBe('Umas 40 famílias da rua de baixo');
    expect(prenoteGaps(prenoteInputFromSections(st.sections))).toEqual([]);

    expect(t.e4_contribution.value).toBe('Mutirão; terreno já em uso pela organização; Mutirão de 20 pessoas e as mudas do viveiro');
    expect(t.e4_partners.value).toBe('COOP20 e a escola estadual');
    const html = await (await r.get(`/api/cbo/${cboId}/prenote`)).text();
    expect(html).toContain('meta: 40 famílias');
    expect(html).toContain('Mutirão de 20 pessoas e as mudas do viveiro');
    expect(html).toContain('COOP20 e a escola estadual');
  });

  test('"Não sei ainda" leaves the count question — it is never read as an unreadable size', async ({ page }) => {
    // Simulated Ksa Rosa, 2026-10-17: "Mais ou menos quantas cisternas?" →
    // "Não sei ainda" → "Não consegui ler um tamanho" → the same question, four
    // times, until the walk ran out of turns. The chip is the ask's own way out.
    const api = new TestApi(page.request);
    test.skip(!(await api.ping()).fakeModel, 'needs the fake model');
    const { cboId } = await api.newSession();
    await api.seedState(cboId, { phase: 4, language: 'pt', sections: [
      ...BASE_FIELDS, ...PLACE,
      { sectionId: 'intervention_type', field: '_e3_closed', value: 'yes' },
      // Counted in units, and nothing on record says how many.
      { sectionId: 'intervention_type', field: '_visit_json', value: JSON.stringify({ solutionId: 'captacao-agua-da-chuva', date: '2026-10-23', recordedAt: 'x' }) },
    ] });
    const r = page.request;
    let s = await step(r, cboId, 'Vamos começar o Encontro 4.', 'text');
    s = await step(r, cboId, 'É essa ✓');
    expect(s.ask.question).toMatch(/Mais ou menos quantas/);
    s = await step(r, cboId, 'Não sei ainda');
    expect(s.ask.question, 'the encontro moves on').not.toMatch(/Mais ou menos quantas/);
    expect(s.events.filter(e => e.type === 'chat').map(e => e.content).join(' ')).not.toMatch(/Não consegui ler um tamanho/);
    const t = (await stateOf(r, cboId)).sections.intervention_type.fields;
    expect(t._e4_size_ok?.value).toBe('yes');
  });

  test('nothing waits on a person: E3 still open, no visit, no place, no size', async ({ page }) => {
    const api = new TestApi(page.request);
    test.skip(!(await api.ping()).fakeModel, 'needs the fake model');
    const { cboId } = await api.newSession();
    await api.seedState(cboId, { phase: 4, language: 'pt', sections: [
      ...BASE_FIELDS.filter(f => f.field !== 'solution_tests_json'),
      { sectionId: 'intervention_type', field: 'solution_tests_json', value: JSON.stringify([{ solutionId: 'teto-verde', reaction: 'faz-sentido', testedAt: 'x' }]) },
    ] });
    const r = page.request;
    let s = await step(r, cboId, 'Vamos começar o Encontro 4.', 'text');
    expect(s.labels).toEqual(['Fechar o Encontro 3 e seguir']);
    s = await step(r, cboId, 'Fechar o Encontro 3 e seguir');
    // No visit recorded: they pick, and the choice is marked as theirs.
    expect(s.ask.question).toBe('Qual solução vira a pré-nota?');
    expect(s.labels).toEqual(['Teto verde', 'Outra solução']);
    s = await step(r, cboId, 'Outra solução');
    s = await step(r, cboId, 'jardins de chuva', 'text');
    let st = await stateOf(r, cboId);
    expect(parseE4Solution(st.sections.intervention_type.fields._e4_solution_json.value)).toMatchObject({ solutionId: 'jardins-de-chuva', source: 'organizacao' });
    // No size anywhere — the place footprint (600 m²) is the fallback; "Mudou" lets them say it.
    expect(s.ask.question).toMatch(/600 m²/);
    s = await step(r, cboId, 'Mudou');
    expect(s.ask.question).toMatch(/de que tamanho/);
    s = await step(r, cboId, '10 por 12', 'text');
    st = await stateOf(r, cboId);
    expect(parseE4Solution(st.sections.intervention_type.fields._e4_solution_json.value)?.areaM2).toBe(120);
    // No place marked: offered, never forced.
    expect(s.labels).toEqual(['Marcar o lugar agora', 'Seguir sem o lugar']);
    s = await step(r, cboId, 'Seguir sem o lugar');
    expect(s.ask.question).toMatch(/continua sendo/);
  });

  test('a return lands on the same question; "Mudar algo" reopens one part only', async ({ page }) => {
    const api = new TestApi(page.request);
    test.skip(!(await api.ping()).fakeModel, 'needs the fake model');
    const { cboId } = await api.newSession();
    await api.seedState(cboId, { phase: 4, language: 'pt', sections: [
      ...BASE_FIELDS, ...PLACE,
      { sectionId: 'intervention_type', field: '_e3_closed', value: 'yes' },
    ] });
    const r = page.request;
    await step(r, cboId, 'Vamos começar o Encontro 4.', 'text');
    let s = await step(r, cboId, 'Jardins de chuva');
    const before = (await stateOf(r, cboId)).sections.intervention_type.fields[PENDING_FIELD].value;
    const q = parsePending(before)!.asks.slice(-1)[0].question;
    s = await step(r, cboId, 'Continuar da Fase 4', 'text');
    expect(s.ask.question, 'a return re-asks what was on screen').toBe(q);

    for (const [msg, kind] of [['Isso ✓', 'chip'], ['Isso ✓', 'chip'], ['Não sei dizer', 'chip'], ['Menos água parada / menos alagamento', 'chip'], ['Isso ✓', 'chip'], ['A própria organização', 'chip'], ['Não é bem isso', 'chip'], ['Nada por enquanto', 'chip'], ['Ninguém ainda', 'chip']] as const) {
      s = await step(r, cboId, msg, kind);
    }
    expect(s.ask.question).toBe('Está bom assim?');
    // "Não sei" closes the question and never prints as information.
    const html = await (await r.get(`/api/cbo/${cboId}/prenote`)).text();
    expect(html).not.toMatch(/Quem é atingido, segundo a organização: não sei/);
    s = await step(r, cboId, 'Pode fechar ✓');
    s = await step(r, cboId, 'Mudar algo');
    s = await step(r, cboId, 'O que querem ver mudar');
    expect(s.ask.question).toMatch(/o que vocês mais querem ver mudar/);
    s = await step(r, cboId, 'Todas essas');
    expect(s.ask.question, 'only that part was reopened').toBe('Está bom assim?');
    const st = await stateOf(r, cboId);
    expect(st.sections.intervention_type.fields._e4_changes.value.split(',').length).toBeGreaterThan(1);
  });

  test('a question in their own words goes to the model — and the step comes back', async ({ page }) => {
    const api = new TestApi(page.request);
    test.skip(!(await api.ping()).fakeModel, 'needs the fake model');
    const { cboId } = await api.newSession();
    await api.seedState(cboId, { phase: 4, language: 'pt', sections: [
      ...BASE_FIELDS, ...PLACE,
      { sectionId: 'intervention_type', field: '_e3_closed', value: 'yes' },
      { sectionId: 'intervention_type', field: '_visit_json', value: JSON.stringify({ solutionId: 'jardins-de-chuva', recordedAt: 'x' }) },
    ] });
    const r = page.request;
    for (const m of ['Vamos começar o Encontro 4.', 'É essa ✓', 'Isso ✓', 'Isso ✓']) await step(r, cboId, m, m.startsWith('Vamos') ? 'text' : 'chip');
    await step(r, cboId, 'umas 30 famílias', 'text');
    // At "o que querem ver mudar", a doubt instead of a chip.
    await api.scriptCbo(cboId, [[{ op: 'say', text: 'Contrapartida é o que a organização coloca no projeto.' }]]);
    const events = await chat(r, cboId, 'o que é contrapartida?', 'text');
    const done = events.filter(e => e.type === 'done').pop();
    expect(String(done?.summary ?? '')).not.toMatch(/E4 checkpoint \(mudancas/);
    const last = events.filter(e => e.type === 'ask_user').pop();
    expect(last?.question, 'the encontro puts its own question back').toMatch(/o que vocês mais querem ver mudar/);
    // …and a tap on it still lands.
    const s = await step(r, cboId, 'Menos água parada / menos alagamento');
    expect(s.ask.question).toMatch(/No Encontro 3, pra quem faria a obra/);
  });
});

test.describe('Encontro 4 — on the organisation\'s phone', () => {
  test.use({ locale: 'pt-BR' });

  test('from the closed Encontro 3 to the draft on screen', async ({ page, request }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const api = new TestApi(request);
    test.skip(!(await api.ping()).fakeModel, 'needs the fake model');
    const cohort = (await api.createCohort(`E4 UI ${Math.random().toString(36).slice(2, 8)}`)).cohort;
    await api.createCoordinator({ email: `e4ui-${Math.random().toString(36).slice(2, 10)}@e2e.test`, password: 'pw-123456', cohortId: cohort.id });
    const m = (await api.inviteMember(cohort.id, { orgName: 'Ksa Rosa', neighborhood: 'Floresta', withSession: true })).member;
    await api.seedState(m.cboStateId, { phase: 3, language: 'pt', sections: [
      ...BASE_FIELDS, ...PLACE,
      { sectionId: 'intervention_type', field: '_e3_opened', value: 'yes' },
      { sectionId: 'intervention_type', field: '_e3_closed', value: 'yes' },
      { sectionId: 'intervention_type', field: '_visit_json', value: JSON.stringify({ solutionId: 'jardins-de-chuva', areaM2: 140, recordedAt: 'x' }) },
    ] });
    await request.patch(`/api/cohort/${cohort.coordinatorSlug}/open-workshop`, { data: { phase: 4 } });

    await page.goto(`/cbo-profile?t=${m.capabilityToken}`);
    const cta = page.getByTestId('button-cbo-welcome-cta');
    await cta.waitFor({ state: 'visible', timeout: 30_000 }).catch(() => {});
    if (await cta.isVisible().catch(() => false)) await cta.click();
    const door = page.getByTestId('button-encontro-4-start').or(page.getByTestId('button-start-encontro-4'));
    await expect(door).toBeVisible({ timeout: 30_000 });
    await door.click();
    const opt = (label: string) => page.locator('[data-testid^="cbo-option-"]').filter({ hasText: label }).first();
    await expect(opt('É essa ✓')).toBeVisible({ timeout: 30_000 });
    await opt('É essa ✓').click();
    await expect(page.getByText(/Continua esse tamanho/)).toBeVisible({ timeout: 30_000 });
    await opt('Isso ✓').click();
    await expect(page.getByText(/continua sendo/)).toBeVisible({ timeout: 30_000 });
    await opt('Isso ✓').click();
    const card = page.getByTestId('cbo-prenote').last();
    await expect(card).toBeVisible({ timeout: 30_000 });
    await expect(card).toContainText('Jardins de chuva');
    await expect(card.getByTestId('prenote-card-missing-problema')).toBeVisible();
    // Markdown is rendered, never shown raw — and no line runs past three rows
    // (a funding path is 400 characters; the whole text is in the PDF).
    expect(await card.innerText(), 'no raw ** on the projector').not.toContain('**');
    const rows = await card.getByTestId('prenote-card-line').evaluateAll(els => els.map(el => {
      const lh = parseFloat(getComputedStyle(el).lineHeight) || 16;
      return Math.round(el.getBoundingClientRect().height / lh);
    }));
    expect(rows.length).toBeGreaterThan(3);
    expect(Math.max(...rows), 'a card line is at most three rows').toBeLessThanOrEqual(3);
    if (process.env.DRAWER_SHOTS) await card.screenshot({ path: `${process.env.DRAWER_SHOTS}/e4-draft-card.png` });
  });
});

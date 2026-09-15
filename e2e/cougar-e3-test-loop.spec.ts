import { test, expect } from '@playwright/test';
import { TestApi } from './helpers/testApi';

// THE LOOP — Encontro 3 since the 10 September meeting: test several
// solutions, react to each, compare, and stop or go on to detail.
//
// This walks the whole path an organisation takes on 30 September, in the
// browser, with no fake-model script: every beat is a server template. It
// pins the things that broke in the review of this design before it shipped —
// a reaction chip read as a spoken size, a per-unit count inherited by the
// next solution, a parked session that came back to a dead transcript, and a
// session from before the loop that never got its comparison.

const W2_STATE = [
  { sectionId: 'org_profile', field: 'org_name', value: 'Raízes do Sarandi' },
  { sectionId: 'org_profile', field: 'contact_name', value: 'Marlene Souza' },
  { sectionId: 'intervention_site', field: 'bairro', value: 'Sarandi' },
  { sectionId: 'intervention_site', field: 'site_name', value: 'Pátio da EMEI Solar' },
  { sectionId: 'intervention_site', field: '_site_lat', value: '-30.0906' },
  { sectionId: 'intervention_site', field: '_site_lng', value: '-51.1726' },
  { sectionId: 'intervention_site', field: 'current_use', value: 'paved' },
  { sectionId: 'intervention_site', field: 'land_tenure', value: 'public-informal' },
  { sectionId: 'intervention_site', field: 'site_worry', value: 'alagamento' },
  { sectionId: 'intervention_site', field: 'site_story', value: 'Quando chove forte a água entra pelo fundo e fica dias.' },
  { sectionId: 'intervention_site', field: 'site_knowledge_depth', value: 'strong' },
  { sectionId: 'intervention_site', field: 'nbs_interest', value: 'aguas-pluviais' },
];

test.describe('COUGAR — E3 test loop', () => {
  test.use({ locale: 'pt-BR' });

  const boot = async (page: any, request: any, sections: any[]) => {
    const api = new TestApi(request);
    test.skip(!(await api.ping()).fakeModel, 'needs the fake model env (for seeding)');
    await page.goto('/cbo-profile');
    const marker = page.getByTestId('cbo-stream-status');
    await expect(marker).toHaveAttribute('data-cbo-id', /.+/, { timeout: 30_000 });
    const cboId = (await marker.getAttribute('data-cbo-id'))!;
    await api.seedState(cboId, { phase: 3, language: 'pt', sections });
    const input = page.getByTestId('cbo-chat-input');
    await input.fill('Vamos começar o Encontro 3.');
    await input.press('Enter');
    return cboId;
  };
  const chipFor = (page: any) => (label: string) =>
    page.locator(`[data-testid^="cbo-option-"][data-option-label="${label}"]`);

  test('two tests, a comparison, a park, a return — and the record says what it should', async ({ page, request }) => {
    const cboId = await boot(page, request, W2_STATE);
    const chip = chipFor(page);
    const thread = page.getByTestId('cbo-chat-thread');

    // 0 · The door: what is missing, before the reading starts. An upload here
    //     is acknowledged by the beat, never handed to the model.
    await chip('É isso ✓').click();
    await expect(chip('Já mandamos tudo')).toBeVisible({ timeout: 15_000 });
    await expect(thread.getByText('ainda não tem nenhum arquivo aqui', { exact: false })).toBeVisible();
    const input = page.getByTestId('cbo-chat-input');
    await input.fill('I\'m uploading: "patio-hoje.jpg"');
    await input.press('Enter');
    await expect(chip('Pronto, pode seguir')).toBeVisible({ timeout: 15_000 });
    await expect(thread.getByText('Vamos continuar', { exact: false })).toHaveCount(0);
    await chip('Pronto, pode seguir').click();

    // 1 · The shelf asks Robson's question.
    await expect(thread.getByText('Qual vocês querem testar primeiro?', { exact: false })).toBeVisible({ timeout: 15_000 });
    await chip('Jardins de chuva').click();

    // 2 · Per-m²: the footprint, once. Trace it.
    await expect(chip('Desenhar no mapa')).toBeVisible({ timeout: 15_000 });
    await chip('Desenhar no mapa').click();
    const map = page.locator('.leaflet-container').first();
    await expect(map).toBeVisible({ timeout: 20_000 });
    await page.waitForTimeout(2000);
    const box = (await map.boundingBox())!;
    const cx = box.x + box.width / 2, cy = box.y + box.height / 2, d = Math.min(box.width, box.height) / 6;
    await page.mouse.click(cx - d, cy - d);
    await page.mouse.click(cx + d, cy - d);
    await page.mouse.click(cx + d, cy + d);
    await page.mouse.dblclick(cx - d, cy + d);
    const confirm = page.getByTestId('map-confirm-site');
    await expect(confirm).toBeEnabled({ timeout: 10_000 });
    await confirm.click();

    // 3 · The card: the four answers, the verdict badge, and a reaction ask.
    //     ⚠️ The reaction chip must NOT be read as a spoken size — that is what
    //     a standing `_area_pending` did before showTestCard cleared it.
    const card = page.getByTestId('cbo-solution-test-jardins-de-chuva');
    await expect(card).toBeVisible({ timeout: 20_000 });
    await expect(card.getByTestId('solution-test-verdict-needs_study')).toBeVisible();
    await expect(card.getByTestId('solution-test-complexity')).toContainText('Simples');
    await expect(card.getByTestId('solution-test-needs')).toContainText('SMAMUS');
    await expect(card.getByTestId('solution-test-cost')).toContainText('R$');
    await chip('Faz sentido pra gente').click();
    await expect(thread.getByText('não vou chutar um número', { exact: false })).toHaveCount(0);

    // 4 · This solution's decisive detail, then the loop question.
    await expect(chip('Mais barro — a água empoça')).toBeVisible({ timeout: 15_000 });
    await chip('Mais barro — a água empoça').click();
    await expect(chip('Testar outra solução')).toBeVisible({ timeout: 15_000 });

    // 5 · Reload mid-loop: the pending question comes back, not a dead thread.
    await page.reload();
    await expect(chip('Testar outra solução')).toBeVisible({ timeout: 30_000 });
    await chip('Testar outra solução').click();

    // 6 · Back on the shelf: the tested one is gone, the catalogue is not.
    await expect(thread.getByText('Qual vocês querem testar agora?', { exact: false })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId('cbo-solution-options').last().getByTestId('solution-option-jardins-de-chuva')).toHaveCount(0);
    await chip('Ver todas as soluções').click();
    await expect(page.getByTestId('cbo-solution-options').last()).toBeVisible({ timeout: 10_000 });
    await page.getByTestId('solution-option-captacao-agua-da-chuva').last().click();
    await page.getByTestId('solution-choose-captacao-agua-da-chuva').click();

    // 7 · Per-unit: the count, PER TEST — the footprint above buys nothing here.
    await expect(thread.getByText('Quantas cisternas', { exact: false }).last()).toBeVisible({ timeout: 15_000 });
    await chip('5').click();
    const card2 = page.getByTestId('cbo-solution-test-captacao-agua-da-chuva');
    await expect(card2).toBeVisible({ timeout: 20_000 });
    await expect(card2.getByTestId('solution-test-cost')).toContainText('5 cisternas');
    // Robson's word for what the IUCN standard would not call an NbS.
    await expect(card2.getByTestId('solution-test-complexity')).toContainText('Medida de apoio');
    await chip('Não é pra gente').click();

    // 8 · The comparison: one column per test, the set-aside one marked. The
    //     nudge says how many are tested, and never blocks.
    await expect(chip('Ver a comparação')).toBeVisible({ timeout: 15_000 });
    await expect(page.locator('[data-option-label="Testar outra solução"]').last()).toContainText('terceira');
    await chip('Ver a comparação').click();
    const cmp = page.getByTestId('cbo-comparison');
    await expect(cmp).toBeVisible({ timeout: 20_000 });
    await expect(cmp).toHaveAttribute('data-columns', '2');
    await expect(cmp.getByTestId('comparison-col-jardins-de-chuva')).toBeVisible();
    await expect(cmp.getByTestId('comparison-col-captacao-agua-da-chuva')).toBeVisible();
    await expect(cmp.getByTestId('comparison-row-reaction')).toContainText('Descartada pela organização');
    // The printed copy, from the same function.
    const href = await cmp.getByTestId('comparison-print').getAttribute('href');
    const printed = await request.get(href!);
    expect(printed.ok()).toBe(true);
    const html = await printed.text();
    expect(html).toContain('RASCUNHO');
    expect(html).toContain('Jardins de chuva');
    expect(html).toContain('Descartada pela organização');
    // And each scenario on its own page — the proto concept node.
    const scen = await request.get(`/api/cbo/${cboId}/scenario/captacao-agua-da-chuva?lang=pt`);
    expect(scen.ok()).toBe(true);
    const scenHtml = await scen.text();
    expect(scenHtml).toContain('Cenário');
    expect(scenHtml).toContain('Captação de água da chuva');
    expect(scenHtml).toContain('Descartada pela organização');
    expect((await request.get(`/api/cbo/${cboId}/scenario/hortas-urbanas`)).status()).toBe(404);
    await expect(cmp.getByTestId('scenario-print-jardins-de-chuva')).toBeVisible();

    // 9 · Park. It ends on a question, so a return finds one.
    await chip('Deixar pra depois').click();
    await expect(chip('Detalhar agora')).toBeVisible({ timeout: 15_000 });
    await page.reload();
    await expect(chip('Detalhar agora')).toBeVisible({ timeout: 30_000 });

    // 10 · The record, before detailing: derived chosen, per-test counts, and
    //      the single-value document fields filled by the LIKED test only.
    const body = await (await request.get(`/api/cbo/${cboId}`)).json();
    const f = (s: string, k: string) => body.state?.sections?.[s]?.fields?.[k]?.value;
    expect(f('intervention_type', 'chosen_solutions')).toBe('jardins-de-chuva');
    const tests = JSON.parse(f('intervention_type', 'solution_tests_json'));
    expect(tests.map((t: any) => [t.solutionId, t.reaction])).toEqual([
      ['jardins-de-chuva', 'faz-sentido'],
      ['captacao-agua-da-chuva', 'nao-e-pra-gente'],
    ]);
    expect(tests[1].units).toBe(5);
    expect(f('intervention_type', 'intervention_units') ?? '').toBe('');
    expect(f('intervention_type', 'detail_question_id')).toBe('soil-type');
    expect(f('intervention_type', '_detail_parked')).toBe('yes');
    expect(f('intervention_type', '_e3_closed') ?? '').toBe('');
    // Three scores at the comparison; the fourth is the tail's.
    const metrics = (body.state?.maturityScores ?? []).map((m: any) => m.metric).sort();
    expect(metrics).toEqual(['climate_nbs_impact', 'problem_clarity', 'solution_clarity']);

    expect(f('intervention_type', '_material_done')).toBe('yes');

    // 11 · Into the tail: who builds it heads it.
    await chip('Detalhar agora').click();
    await expect(chip('Mutirão')).toBeVisible({ timeout: 15_000 });
  });

  test('the resume chip on an open workshop serves the beat the record is on', async ({ page, request }) => {
    const cboId = await boot(page, request, W2_STATE);
    const chip = chipFor(page);
    await chip('É isso ✓').click();
    await expect(chip('Seguir sem')).toBeVisible({ timeout: 15_000 });
    await chip('Seguir sem').click();
    await expect(chip('Ver todas as soluções')).toBeVisible({ timeout: 15_000 });
    // Leave, come back, and say the entry line again — the client does exactly
    // this when an organisation reopens a workshop it left open. Before, this
    // fell through to the model; now it is the shelf again.
    await page.reload();
    const input = page.getByTestId('cbo-chat-input');
    await input.fill('Vamos começar o Encontro 3.');
    await input.press('Enter');
    await expect(page.getByTestId('cbo-chat-thread').getByText('Qual vocês querem testar primeiro?', { exact: false }).last()).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId('cbo-chat-thread').getByText('Bem-vindas ao Encontro 3', { exact: false })).toHaveCount(1);
    void cboId;
  });

  test('a session from before the loop gets its comparison, seeded from what it chose', async ({ page, request }) => {
    // Exactly what the board's Fechar/reopen leaves behind: an open E3 with a
    // chosen solution and no tests. It never passes through the opening again.
    const cboId = await boot(page, request, [
      ...W2_STATE,
      { sectionId: 'intervention_type', field: '_e3_opened', value: 'yes' },
      { sectionId: 'intervention_type', field: 'chosen_solutions', value: 'jardins-de-chuva' },
      { sectionId: 'intervention_site', field: 'site_area_m2', value: '500' },
      { sectionId: 'intervention_site', field: '_area_asked', value: 'yes' },
    ]);
    const chip = chipFor(page);
    await expect(chip('Ver a comparação')).toBeVisible({ timeout: 15_000 });
    await chip('Ver a comparação').click();
    const cmp = page.getByTestId('cbo-comparison');
    await expect(cmp).toBeVisible({ timeout: 20_000 });
    await expect(cmp).toHaveAttribute('data-columns', '1');
    await expect(cmp.getByTestId('comparison-row-reaction')).toContainText('Faz sentido para a organização');
    const body = await (await request.get(`/api/cbo/${cboId}`)).json();
    expect(body.state?.sections?.intervention_type?.fields?.chosen_solutions?.value).toBe('jardins-de-chuva');
  });
});

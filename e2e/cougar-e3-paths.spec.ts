import { test, expect } from '@playwright/test';
import { TestApi } from './helpers/testApi';

// The two E3 paths the happy-path journey doesn't touch, and the one rule that
// governs the whole workshop.
//
//  1 · the footprint map — draw the area, get a real number off the ficha
//  2 · an organisation that never marked a place — W3 must NOT manufacture a
//      project on top of nothing, and must say what would unblock it
//  3 · the manifest rule live in the chat: a city maintenance partnership is
//      not offered on land the organisation owns

const BASE = [
  { sectionId: 'org_profile', field: 'org_name', value: 'Coletivo Encosta Viva' },
  { sectionId: 'org_profile', field: 'contact_name', value: 'Antônia Reis' },
];

const SITED = [
  ...BASE,
  { sectionId: 'intervention_site', field: 'bairro', value: 'Sarandi' },
  { sectionId: 'intervention_site', field: 'site_name', value: 'Terreno da associação' },
  { sectionId: 'intervention_site', field: '_site_lat', value: '-30.0906' },
  { sectionId: 'intervention_site', field: '_site_lng', value: '-51.1726' },
  { sectionId: 'intervention_site', field: 'site_worry', value: 'alagamento' },
  { sectionId: 'intervention_site', field: 'nbs_interest', value: 'aguas-pluviais' },
];

test.describe('COUGAR — E3 paths', () => {
  test.use({ locale: 'pt-BR' });

  const start = async (page: any, request: any, sections: any[]) => {
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

  test('the footprint map turns a traced shape into a price range', async ({ page, request }) => {
    const cboId = await start(page, request, [
      ...SITED,
      { sectionId: 'intervention_site', field: 'land_tenure', value: 'private-owned' },
    ]);
    const chip = chipFor(page);

    await expect(chip('É isso ✓')).toBeVisible({ timeout: 15_000 });
    await chip('É isso ✓').click();
    await expect(page.getByTestId('cbo-solution-options')).toBeVisible({ timeout: 10_000 });
    // Bioswales are priced per m², which is what makes the drawing buy a
    // number — the verdict is not what is under test here.
    await chip('Biovaletas').click();

    await expect(chip('Desenhar no mapa')).toBeVisible({ timeout: 10_000 });
    await chip('Desenhar no mapa').click();

    // The map opens ON the site, in satellite, with polygon drawing already
    // armed — no chooser overlay, no point/area toggle to hunt for.
    const map = page.locator('.leaflet-container').first();
    await expect(map).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId('map-simple-chooser')).toHaveCount(0);
    const confirm = page.getByTestId('map-confirm-site');
    await expect(confirm).toBeDisabled({ timeout: 10_000 });

    // Let the view settle before tracing. The session re-centres on the site a
    // couple of times while the panel finishes opening (a single setView lands
    // against a stale container size), and a corner placed mid-settle lands
    // somewhere else entirely.
    await page.waitForTimeout(2000);

    // Trace four corners and double-click to close.
    const box = (await map.boundingBox())!;
    const cx = box.x + box.width / 2;
    const cy = box.y + box.height / 2;
    const d = Math.min(box.width, box.height) / 6;
    await page.mouse.click(cx - d, cy - d);
    await page.mouse.click(cx + d, cy - d);
    await page.mouse.click(cx + d, cy + d);
    await page.mouse.dblclick(cx - d, cy + d);

    // The button now carries the number, so they can see whether they drew the
    // size they meant to before committing to it.
    await expect(confirm).toBeEnabled({ timeout: 10_000 });
    await expect(confirm).toContainText('m²', { timeout: 5_000 });
    await confirm.click();

    // Back in the chat: a price range off the ficha's own published R$/m²,
    // worded as a range to quote against rather than as a budget. (Scoped to
    // the thread — "Área (m²)" also exists as a hidden label in the side panel.)
    await expect(
      page.getByText('pedir cotação', { exact: false }).last(),
    ).toBeVisible({ timeout: 15_000 });
    // And straight into who builds it — the pair that turns "a bioswale" into
    // something with a number and a crew.
    await expect(chip('Mutirão')).toBeVisible({ timeout: 15_000 });
    await chip('Mutirão').click();

    // ⚠️ Bioswales are quoted per LINEAR metre, so even WITH a drawn area there
    // is no volume for this yard — the flow states the rate, says what is
    // missing, and does NOT ask them to react to it.
    const inThread = (t: string) =>
      page.getByTestId('cbo-chat-thread').getByText(t, { exact: false }).last();
    await page.getByTestId('cbo-chat-input').fill('É onde a água desce.');
    await page.getByTestId('cbo-chat-input').press('Enter');
    await expect(inThread('como é o lugar hoje')).toBeVisible({ timeout: 15_000 });
    await page.getByTestId('cbo-chat-input').fill('Vala de terra batida.');
    await page.getByTestId('cbo-chat-input').press('Enter');
    await expect(inThread('comprimento')).toBeVisible({ timeout: 15_000 });
    await expect(chip('Faz sentido')).toHaveCount(0);

    // ⚠️ FOOTPRINT-ZOOM. `> 0` is the assertion that let a four-orders-of-
    // magnitude bug ship: the draw session opened fitted to the whole bairro at
    // zoom 16, so four taps traced ten square kilometres and the org was told
    // its rain garden covered 9,986,500 m² and cost about four billion reais.
    // The area was, technically, greater than zero.
    //
    // The trace here spans about a third of the viewport at zoom 18, which is
    // a yard, not a district. Bound it on both sides.
    const body = await (await request.get(`/api/cbo/${cboId}`)).json();
    const area = Number(body.state?.sections?.intervention_site?.fields?.site_area_m2?.value);
    expect(area).toBeGreaterThan(0);
    expect(area, 'a traced yard, not a neighbourhood').toBeLessThan(20_000);
  });

  // ⚠️ NO-SIZE-QUESTION-AT-ALL. The footprint is correctly skipped for a
  // solution priced per unit — tracing an outline buys nothing when the price
  // is per cistern — and then nothing asked the question that DOES apply. The
  // note printed above it even ended "quantas vocês querem?".
  test('a solution counted per unit is asked how many, and the count closes a total', async ({ page, request }) => {
    await start(page, request, [
      ...SITED,
      { sectionId: 'intervention_site', field: 'land_tenure', value: 'private-owned' },
    ]);
    const chip = chipFor(page);
    const inThread = (t: string) =>
      page.getByTestId('cbo-chat-thread').getByText(t, { exact: false }).last();

    await expect(chip('É isso ✓')).toBeVisible({ timeout: 15_000 });
    await chip('É isso ✓').click();
    await expect(page.getByTestId('cbo-solution-options')).toBeVisible({ timeout: 10_000 });
    await expect(chip('Ver todas as soluções')).toBeVisible({ timeout: 10_000 });
    await chip('Ver todas as soluções').click();
    await expect(page.getByTestId('cbo-solution-options').last()).toBeVisible({ timeout: 10_000 });
    await page.getByTestId('solution-option-captacao-agua-da-chuva').last().click();
    await page.getByTestId('solution-choose-captacao-agua-da-chuva').click();

    // Not a footprint — a count, in the ficha's own noun, agreeing in Portuguese.
    await expect(inThread('Quantas cisternas')).toBeVisible({ timeout: 15_000 });
    await expect(chip('Desenhar no mapa'), 'nothing to trace when the price is per cistern').toHaveCount(0);
    await expect(chip('5')).toBeVisible({ timeout: 10_000 });
    await chip('5').click();

    // The count does for a per-unit price what the footprint does for a per-m²
    // one: it closes a total, with the reference still visible behind it.
    await expect(inThread('5 cisternas')).toBeVisible({ timeout: 15_000 });
    await expect(inThread('pedir cotação')).toBeVisible({ timeout: 10_000 });
    await expect(chip('Mutirão')).toBeVisible({ timeout: 15_000 });
  });

  test('a city partnership is not offered on land the organisation owns', async ({ page, request }) => {
    const cboId = await start(page, request, [
      ...SITED,
      { sectionId: 'intervention_site', field: 'land_tenure', value: 'private-owned' },
    ]);
    const chip = chipFor(page);
    await expect(chip('É isso ✓')).toBeVisible({ timeout: 15_000 });
    await chip('É isso ✓').click();
    await expect(page.getByTestId('cbo-solution-options')).toBeVisible({ timeout: 10_000 });
    await chip('Biovaletas').click();
    await expect(chip('Ainda não sei o tamanho')).toBeVisible({ timeout: 10_000 });
    await chip('Ainda não sei o tamanho').click();
    // ⚠️ The gap asks once more, by another road: it could not give metres, so
    // it is offered a comparison. Declining leaves the pendency exactly as
    // before the retry existed. See shared/w3-gap-questions.ts.
    await expect(chip('Não dá pra chutar')).toBeVisible({ timeout: 10_000 });
    await chip('Não dá pra chutar').click();
    await expect(chip('Mutirão')).toBeVisible({ timeout: 10_000 });
    await chip('Mutirão').click();

    const input = page.getByTestId('cbo-chat-input');
    await expect(page.getByText('Por que', { exact: false }).last()).toBeVisible({ timeout: 10_000 });
    await input.fill('É o pátio que alaga toda chuva.');
    await input.press('Enter');
    await expect(page.getByText('como é o lugar hoje', { exact: false }).last()).toBeVisible({ timeout: 10_000 });
    await input.fill('Cimento, sem sombra.');
    await input.press('Enter');
    // Permeable paving is quoted as an infiltration RATE, so there is no litre
    // headline to react to — the flow goes straight on rather than inventing one.
    await expect(chip('6 meses')).toBeVisible({ timeout: 15_000 });
    await chip('6 meses').click();
    await expect(chip('A gente mesmo')).toBeVisible({ timeout: 10_000 });
    await chip('A gente mesmo').click();

    // The land is theirs, so an agreement with the prefeitura is one nobody
    // could sign — it is absent from the chips, not offered and then refused.
    await expect(page.getByText('quem cuida disso no dia a dia', { exact: false }).last()).toBeVisible({ timeout: 10_000 });
    await expect(chip('A gente mesmo')).toBeVisible();
    await expect(chip('Empresa contratada')).toBeVisible();
    await expect(chip('Parceria com a prefeitura')).toHaveCount(0);
    // ⚠️ And the rule is not only a chip filter. Typed (or relayed by the
    // model), the same answer reached the write path with the label intact and
    // was stored — so the org would have left W3 with a maintenance agreement
    // the city cannot sign. The engine now refuses the value itself.
    await page.getByTestId('cbo-chat-input').fill('Parceria com a prefeitura');
    await page.getByTestId('cbo-chat-input').press('Enter');
    await page.waitForTimeout(2500);
    const body = await (await request.get(`/api/cbo/${cboId}`)).json();
    expect(body.state?.sections?.operations_sustain?.fields?.who_maintains?.value).not.toBe('parceria-prefeitura');
  });

  test('no place marked means no project — and W3 says exactly that', async ({ page, request }) => {
    await start(page, request, BASE);
    const chip = chipFor(page);

    // ⚠️ An org with no pin is NOT asked to confirm a place it never marked.
    // The opening used to say "no Encontro 2 vocês marcaram Rubem Berta" to an
    // organisation that had marked nothing — claiming something that did not
    // happen, to the org least able to argue with us about its own record.
    await expect(chip('Marcar o lugar agora')).toBeVisible({ timeout: 15_000 });
    await expect(chip('É isso ✓')).toHaveCount(0);
    await chip('Seguir sem o lugar').click();
    await expect(page.getByTestId('cbo-solution-options')).toBeVisible({ timeout: 10_000 });
    // Nothing is filtered even here: the full catalogue is still reachable.
    await chip('Ver todas as soluções').click();
    await expect(page.getByTestId('cbo-solution-options').last()).toBeVisible({ timeout: 10_000 });
    // Hortas urbanas is 18th in the catalogue, so no chip can carry it — this
    // is the path an organisation actually takes for most of the 27: open the
    // ficha, read it, choose from inside it.
    await page.getByTestId('solution-option-hortas-urbanas').last().click();
    await page.getByTestId('solution-choose-hortas-urbanas').click();

    // Hortas are priced per project, so the footprint question is skipped rather
    // than performed — asking for a drawing that buys nothing is theatre. What
    // used to follow was NOTHING: straight to who builds it, with the size never
    // asked in any form. The count is the question that applies here.
    await expect(
      page.getByTestId('cbo-chat-thread').getByText('Quantas hortas', { exact: false }).last(),
    ).toBeVisible({ timeout: 15_000 });
    await chip('2').click();
    await expect(chip('Mutirão')).toBeVisible({ timeout: 15_000 });
    await chip('Mutirão').click();
    await expect(page.getByText('Por que', { exact: false }).last()).toBeVisible({ timeout: 10_000 });
    const input = page.getByTestId('cbo-chat-input');
    await input.fill('A gente quer plantar onde hoje é entulho.');
    await input.press('Enter');
    await expect(page.getByText('como é o lugar hoje', { exact: false }).last()).toBeVisible({ timeout: 10_000 });
    await chip('Prefiro pular').click();

    // Hortas have no quantified benefit in the repo, so no number is offered to
    // react to — the flow says so and carries on to the timeframe.
    await expect(chip('6 meses')).toBeVisible({ timeout: 15_000 });
    await chip('6 meses').click();
    await expect(chip('Ninguém ainda')).toBeVisible({ timeout: 10_000 });
    await chip('Ninguém ainda').click();
    await expect(page.getByText('quem cuida disso no dia a dia', { exact: false }).last()).toBeVisible({ timeout: 10_000 });
    await chip('Voluntários da comunidade').click();
    await expect(chip('Todo mês')).toBeVisible({ timeout: 10_000 });
    await chip('Todo mês').click();
    await expect(chip('Ainda não sabemos')).toBeVisible({ timeout: 10_000 });
    await chip('Ainda não sabemos').click();
    // ⚠️ The recurring money is the one gap the coordination carries to the
    // prefeitura, so it is worth one more road: who pays the bills there TODAY
    // is a fact the organisation holds. Declined here, and the gap stands.
    await expect(chip('Não sei dizer')).toBeVisible({ timeout: 10_000 });
    await chip('Não sei dizer').click();
    await expect(chip('Só essa por enquanto')).toBeVisible({ timeout: 10_000 });
    await chip('Só essa por enquanto').click();

    // The dossier is short, and honest about why: it does not manufacture a
    // scoped project over a place nobody has chosen.
    const roadmap = page.getByTestId('cbo-roadmap');
    await expect(roadmap).toBeVisible({ timeout: 15_000 });
    await expect(roadmap).toContainText('falta marcar o lugar');
    await expect(roadmap.getByText('Marcar um lugar no mapa', { exact: false })).toBeVisible();
    await expect(roadmap.getByTestId('roadmap-open')).toBeVisible();
  });
});

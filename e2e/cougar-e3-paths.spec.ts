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

    const body = await (await request.get(`/api/cbo/${cboId}`)).json();
    const area = Number(body.state?.sections?.intervention_site?.fields?.site_area_m2?.value);
    expect(area).toBeGreaterThan(0);
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

    const input = page.getByTestId('cbo-chat-input');
    await expect(page.getByText('Por que', { exact: false }).last()).toBeVisible({ timeout: 10_000 });
    await input.fill('É o pátio que alaga toda chuva.');
    await input.press('Enter');
    await expect(page.getByText('como é o lugar hoje', { exact: false }).last()).toBeVisible({ timeout: 10_000 });
    await input.fill('Cimento, sem sombra.');
    await input.press('Enter');

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

    // Hortas are priced per project, so the footprint question is skipped
    // rather than performed — asking for a drawing that buys nothing is theatre.
    await expect(page.getByText('Por que', { exact: false }).last()).toBeVisible({ timeout: 10_000 });
    const input = page.getByTestId('cbo-chat-input');
    await input.fill('A gente quer plantar onde hoje é entulho.');
    await input.press('Enter');
    await expect(page.getByText('como é o lugar hoje', { exact: false }).last()).toBeVisible({ timeout: 10_000 });
    await chip('Prefiro pular').click();

    await expect(page.getByText('quem cuida disso no dia a dia', { exact: false }).last()).toBeVisible({ timeout: 10_000 });
    await chip('Voluntários da comunidade').click();
    await expect(chip('Todo mês')).toBeVisible({ timeout: 10_000 });
    await chip('Todo mês').click();
    await expect(chip('Ainda não sabemos')).toBeVisible({ timeout: 10_000 });
    await chip('Ainda não sabemos').click();
    await expect(chip('Só essa por enquanto')).toBeVisible({ timeout: 10_000 });
    await chip('Só essa por enquanto').click();

    // The dossier is short, and honest about why: it does not manufacture a
    // scoped project over a place nobody has chosen.
    const dossier = page.getByTestId('cbo-dossier');
    await expect(dossier).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId('dossier-verdict-needs_site')).toBeVisible();
    await expect(dossier.getByText('Marcar um lugar no mapa', { exact: false })).toBeVisible();
    await expect(dossier.getByTestId('dossier-gaps')).toBeVisible();
  });
});

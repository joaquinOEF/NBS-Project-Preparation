import { test, expect } from '@playwright/test';
import { TestApi } from './helpers/testApi';
import { clickCenterZone } from './helpers/mapActions';

// The FULL linear E2 journey (W2 redesign): educational → um-bairro-ou-mais →
// Map 1 (tour + bairro) → tem-um-lugar fork → Map 2 (focused, pin) → site card
// → current use → tenure → photos ask → famílias recommendation → closing.
//
// Every stage boundary is a server-templated checkpoint (serveE2Checkpoint) —
// this whole spec runs WITHOUT a single fake-model script: if any step fell
// through to the model, the fake model's default turn ("Vamos continuar")
// would render instead of the next checkpoint and the assertions would fail.

test.describe('COUGAR — E2 linear journey (all checkpoints)', () => {
  test.use({ locale: 'pt-BR' });

  test('chat → mapa → chat, end to end, then survives reload', async ({ page, request }) => {
    const api = new TestApi(request);
    test.skip(!(await api.ping()).fakeModel, 'needs the fake model env (for seeding)');

    await page.goto('/cbo-profile');
    const marker = page.getByTestId('cbo-stream-status');
    await expect(marker).toHaveAttribute('data-cbo-id', /.+/, { timeout: 30_000 });
    const cboId = (await marker.getAttribute('data-cbo-id'))!;
    await api.seedState(cboId, { phase: 2 });

    const chip = (label: string) =>
      page.locator(`[data-testid^="cbo-option-"][data-option-label="${label}"]`);
    const input = page.getByTestId('cbo-chat-input');

    // 1 · Entry template: famílias strip + continue/skip chips.
    await input.fill('Vamos começar o Encontro 2.');
    await input.press('Enter');
    await expect(page.locator('[data-testid^="familia-card-"]').first()).toBeVisible({ timeout: 10_000 });
    await expect(chip('Já conheço SbN — pular')).toBeVisible();

    // 2 · Skip → the one-or-more-bairros checkpoint (template, instant).
    await chip('Já conheço SbN — pular').click();
    await expect(page.getByText('um bairro só ou em mais de um', { exact: false })).toBeVisible({ timeout: 8_000 });

    // 3 · "Um bairro" → Map 1: hazard tour, then the bairro pick, confirmed
    // at the zone step (no site step in this session).
    await chip('Um bairro').click();
    await expect(page.locator('.leaflet-container').first()).toBeVisible({ timeout: 20_000 });
    const tourNext = page.getByTestId('map-tour-next');
    await expect(tourNext).toBeVisible({ timeout: 15_000 });
    await tourNext.click();
    await tourNext.click();
    await tourNext.click();
    await expect(tourNext).toHaveCount(0, { timeout: 10_000 });
    await clickCenterZone(page);
    const confirmBairro = page.getByTestId('map-confirm-bairro');
    await expect(confirmBairro).toBeEnabled({ timeout: 10_000 });
    await confirmBairro.click();

    // 4 · Bairro checkpoint: confirmation + the "tem um lugar?" fork.
    await expect(page.getByText('confirmado', { exact: false })).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText('lugar específico', { exact: false })).toBeVisible();

    // 4b · Detour through the "Ainda não" fork (decision A2: only the two
    // post-it exits) and come back via the parked chip — proves resume.
    await chip('Ainda não').click();
    await expect(chip('Pedir apoio à coordenação')).toBeVisible({ timeout: 8_000 });
    await chip('Vou verificar e volto').click();
    await expect(chip('Já sei o lugar')).toBeVisible({ timeout: 8_000 });
    await chip('Já sei o lugar').click();

    // 5 · Map 2: focused site session — chooser overlay → pin path.
    await expect(page.getByTestId('map-simple-chooser')).toBeVisible({ timeout: 20_000 });
    await page.getByTestId('map-simple-pin').click();
    await page.waitForTimeout(500);
    const mapBox2 = (await page.locator('.leaflet-container').first().boundingBox())!;
    await page.mouse.click(mapBox2.x + mapBox2.width / 2, mapBox2.y + mapBox2.height / 2);
    const confirmSite = page.getByTestId('map-confirm-site');
    await expect(confirmSite).toBeEnabled({ timeout: 10_000 });
    await confirmSite.click();

    // 6 · Site card checkpoint: the B1 card + confirm chips.
    const siteCard = page.getByTestId('cbo-site-card');
    await expect(siteCard).toBeVisible({ timeout: 10_000 });
    await expect(siteCard.getByText('Enchente', { exact: false })).toBeVisible();
    await chip('Confirmar ✓').click();

    // 7 · Describe stage, all templated: current use → tenure → photos.
    await expect(page.getByText('Como é esse lugar hoje', { exact: false })).toBeVisible({ timeout: 8_000 });
    await chip('Abandonado / degradado').click();
    await expect(page.getByText('acesso a esse espaço', { exact: false })).toBeVisible({ timeout: 8_000 });
    await chip('É da prefeitura, mas a gente usa').click();
    await expect(page.getByText('fotos do lugar', { exact: false })).toBeVisible({ timeout: 8_000 });
    await chip('Não tenho agora').click();

    // 8 · Famílias recommendation: ≥2 famílias, ranked, with example variants.
    const reco = page.getByTestId('cbo-familia-reco');
    await expect(reco).toBeVisible({ timeout: 8_000 });
    expect(await reco.locator('[data-testid^="familia-reco-"]').count()).toBeGreaterThanOrEqual(2);
    await expect(reco.getByText('ex.:', { exact: false }).first()).toBeVisible();

    // 9 · Close.
    await chip('Faz sentido').click();
    await expect(page.getByText('Pronto', { exact: false })).toBeVisible({ timeout: 8_000 });

    // 10 · Reload: the site card and the recommendation are composer-persisted.
    await page.reload();
    await expect(page.getByTestId('cbo-site-card')).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId('cbo-familia-reco')).toBeVisible();
  });
});

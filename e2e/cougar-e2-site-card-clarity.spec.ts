import { test, expect, type Page } from '@playwright/test';
import { TestApi } from './helpers/testApi';

// E2 site step — the card asks ONE question, about the PLACE (JVP, 2026-08-03:
// "what is the user supposed to choose here? if the risks are ok? if the site
// is ok?").
//
// The three risk bars are bairro MEANS. Under an eyebrow reading "seu lugar"
// they read as this site's risk, invited a judgement, and offered no chip to
// disagree — while the diagnostic asks exactly that ~10 turns later and has to
// open by undoing the card ("isso é a média do bairro inteiro, NÃO do lugar de
// vocês"). What this pins: the card names the place, shows it, and — since
// 10 Nov 2026 — shows the Prefeitura's PLAC ameaça at the pin instead of our
// bairro percentile.

const SITE_PAYLOAD = [
  'Map selection (composite mode):',
  '- [zone] Partenon: MEDIUM risk, intervention: urban forest, area: 8.1 km², pop: 45.768, flood: 22%, heat: 51%, landslide: 14%, at (-30.0577, -51.1936)',
  '- [custom] Ponto marcado (-30.0577, -51.1936) at (-30.0577, -51.1936)',
  'Total: 2 assets, 0 sampled points',
].join('\n');

async function toSiteCard(page: Page, request: any): Promise<string> {
  const api = new TestApi(request);
  await page.goto('/cbo-profile');
  const marker = page.getByTestId('cbo-stream-status');
  await expect(marker).toHaveAttribute('data-cbo-id', /.+/, { timeout: 30_000 });
  const cboId = (await marker.getAttribute('data-cbo-id'))!;
  await api.seedState(cboId, { phase: 2 });

  await request.post(`/api/cbo/${cboId}/chat`, {
    data: { message: SITE_PAYLOAD, lang: 'pt', turnKind: 'map' },
  });
  await page.reload();
  await expect(page.getByTestId('cbo-site-card')).toBeVisible({ timeout: 20_000 });
  return cboId;
}

test.describe('COUGAR — E2 site card confirms the place, not the risk', () => {
  test.use({ locale: 'pt-BR' });

  test('the question names what is being confirmed', async ({ page, request }) => {
    test.setTimeout(120_000);
    const api = new TestApi(request);
    test.skip(!(await api.ping()).fakeModel, 'needs the fake model');
    await toSiteCard(page, request);

    // "É isso mesmo?" over a card full of risk bars asked two questions at once.
    await expect(page.getByText('Esse é o lugar certo?', { exact: false })).toBeVisible();
    await expect(page.getByText('É isso mesmo?', { exact: false })).toHaveCount(0);
  });

  test('hazard is the PLAC ameaça at the pin, never a bairro average', async ({ page, request }) => {
    test.setTimeout(120_000);
    const api = new TestApi(request);
    test.skip(!(await api.ping()).fakeModel, 'needs the fake model');
    await toSiteCard(page, request);

    const card = page.getByTestId('cbo-site-card');
    // The eyebrow names the place, not "seu lugar" risk.
    await expect(card).not.toContainText(/SEU LUGAR/i);
    // The official ameaça sampled at the pin, with its source (JVP, 10 Nov 2026).
    await expect(card).toContainText(/Ameaça no ponto \(PLAC\)/i);
    await expect(card).toContainText('PLAC/ARVC, cenário 2050');
    // Our bairro index is gone: no average, no bairro label, no percentile.
    await expect(card).not.toContainText(/em média/i);
    await expect(card).not.toContainText(/média do bairro/i);
    await expect(card).not.toContainText(/no bairro/i);
    await expect(card).not.toContainText(/\d+\s*%/);
    await expect(page.getByTestId('cbo-site-card-risk-label')).toHaveCount(0);
    // Flood is named as what the layer is — the arroios — never plain "Enchente".
    await expect(card).not.toContainText(/Enchente/);
  });

  test('a dropped pin gets a map thumbnail, not just a latitude', async ({ page, request }) => {
    test.setTimeout(120_000);
    const api = new TestApi(request);
    test.skip(!(await api.ping()).fakeModel, 'needs the fake model');
    await toSiteCard(page, request);

    // The thumbnail is the only way to answer "is the pin on the right block?".
    const thumb = page.getByTestId('cbo-site-thumb');
    await expect(thumb).toBeVisible();
    // ⚠️ Esri, not CARTO. CARTO now stamps "API KEY REQUIRED" diagonally across
    // every tile it serves and still answers 200, so a src assertion on the old
    // host would keep passing while the card showed a watermark. See
    // client/src/core/lib/basemaps.ts.
    await expect(thumb.locator('img').first()).toHaveAttribute('src', /arcgisonline\.com/);

    // Tiles must actually PAINT, not just carry a src. The first cut used
    // loading="lazy" and rendered an empty beige box.
    await expect
      .poll(async () => page.$$eval('[data-testid="cbo-site-thumb"] img',
        imgs => imgs.filter(i => (i as HTMLImageElement).naturalWidth > 0).length),
        { timeout: 15_000 })
      .toBeGreaterThanOrEqual(9);

    // And they must COVER the frame — no uncovered gutter. A 2×2 mosaic only
    // guarantees coverage to 256px, which left the map floating in beige on a
    // wider card; 3×3 covers any frame up to 512.
    const gutter = await page.evaluate(() => {
      const frame = document.querySelector('[data-testid="cbo-site-thumb"]')!.getBoundingClientRect();
      const m = (document.querySelector('[data-testid="cbo-site-thumb"] img') as HTMLElement)
        .parentElement!.getBoundingClientRect();
      return { left: m.left - frame.left, top: m.top - frame.top,
               right: frame.right - m.right, bottom: frame.bottom - m.bottom };
    });
    for (const [side, v] of Object.entries(gutter)) {
      expect(v, `uncovered ${side} gutter in the thumbnail`).toBeLessThanOrEqual(0);
    }

    // The headline is an address when Nominatim answered, and the raw
    // coordinate name when it didn't — but never ONLY a bare coordinate with no
    // map to check it against. (Nominatim is a live dependency; asserting a
    // specific street would make this spec flaky by design.)
    await expect(page.getByTestId('cbo-site-card-name')).toBeVisible();

    await page.screenshot({ path: 'test-results/e2-site-card.png' });
  });
});


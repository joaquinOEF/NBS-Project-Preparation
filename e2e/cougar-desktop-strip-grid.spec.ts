import { test, expect } from '@playwright/test';
import { TestApi } from './helpers/testApi';

// Desktop examples/types strip: on phones the strip is a horizontal swipe row
// (snap-x); on desktop that pattern left cards half-cut behind a scrollbar.
// At md+ the strip wraps into rows instead — every card fully visible, no
// horizontal scroll inside the chat column.

test.describe('COUGAR — showcase strip wraps into a grid on desktop', () => {
  test.use({ viewport: { width: 1512, height: 950 }, locale: 'pt-BR' });

  test('all cards visible, strip does not scroll horizontally at 1512px', async ({ page, request }) => {
    const api = new TestApi(request);
    test.skip(!(await api.ping()).fakeModel, 'needs the fake model');

    await page.goto('/cbo-profile');
    const marker = page.getByTestId('cbo-stream-status');
    await expect(marker).toHaveAttribute('data-cbo-id', /.+/, { timeout: 30_000 });
    const cboId = (await marker.getAttribute('data-cbo-id'))!;

    await api.scriptCbo(cboId, [[
      { op: 'show_examples', cardIds: ['curitiba-barigui', 'poa-goncalo-de-carvalho', 'bh-drenurbs', 'poa-varzea-lab'], mode: 'browse', intro: 'Exemplos reais' } as any,
      { op: 'say', text: 'Esses são exemplos reais.' },
      { op: 'ask_user', question: 'Seguimos?', options: [{ label: 'Sim' }] },
    ]]);
    await page.getByTestId('cbo-chat-input').fill('Quero ver exemplos');
    await page.getByTestId('cbo-chat-input').press('Enter');
    await expect(marker).toHaveAttribute('data-streaming', 'false');

    const cards = page.locator('[data-testid^="showcase-card-"]');
    await expect(cards.first()).toBeVisible();
    const n = await cards.count();
    expect(n).toBeGreaterThanOrEqual(3);

    // Every card sits fully inside the chat column — none clipped at an edge.
    // Chat-first desktop: the column ends at the collapsed panel's edge strip
    // (or, with the panel open, at the half-viewport split) — not at a
    // hardcoded vw/2.
    const chatRight = await page.evaluate(() => {
      const strip = document.querySelector('[data-testid="cbo-panel-strip"]');
      if (strip) return strip.getBoundingClientRect().left;
      return document.documentElement.clientWidth / 2;
    });
    for (let i = 0; i < n; i++) {
      const box = (await cards.nth(i).boundingBox())!;
      expect(box.x).toBeGreaterThanOrEqual(-1);
      expect(box.x + box.width).toBeLessThanOrEqual(chatRight + 2);
    }

    // The strip container itself has nothing to scroll (it wrapped instead).
    const strip = cards.first().locator('xpath=ancestor::div[contains(@class,"md:flex-wrap")]');
    const scroll = await strip.evaluate(el => ({ sw: el.scrollWidth, cw: el.clientWidth }));
    expect(scroll.sw).toBeLessThanOrEqual(scroll.cw + 1);
  });
});

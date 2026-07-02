import { test, expect } from '@playwright/test';
import { TestApi } from './helpers/testApi';

// The NBS type/example strips must scroll INTERNALLY — not drag the whole page
// sideways at phone width (documented walkthrough: header cut off, question
// card clipped). Regression: after rendering the widest composer, the document
// must have zero horizontal overflow at 390px.

test.describe('CBO — no page-level horizontal scroll on a phone', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('types strip renders without widening the page', async ({ page, request }) => {
    const api = new TestApi(request);
    test.skip(!(await api.ping()).fakeModel, 'needs the fake model');

    await page.goto('/cbo-profile');
    const marker = page.getByTestId('cbo-stream-status');
    await expect(marker).toHaveAttribute('data-cbo-id', /.+/, { timeout: 30_000 });
    const cboId = (await marker.getAttribute('data-cbo-id'))!;

    await api.scriptCbo(cboId, [[
      { op: 'say', text: 'Dois minutos sobre os tipos de SbN.' },
      { op: 'show_types' },
      { op: 'ask_user', question: 'Seguimos pros exemplos?', options: [{ label: 'Ver exemplos' }, { label: 'Pular' }] },
    ]]);
    await page.getByTestId('cbo-chat-input').fill('vamos');
    await page.getByTestId('cbo-chat-input').press('Enter');
    await expect(marker).toHaveAttribute('data-streaming', 'false', { timeout: 20_000 });
    await expect(page.getByText('Bioswales', { exact: false }).first()).toBeVisible({ timeout: 15_000 });

    // The page itself must not overflow horizontally (the strip scrolls inside).
    const overflow = await page.evaluate(() => {
      const el = document.documentElement;
      return Math.max(el.scrollWidth - el.clientWidth, document.body.scrollWidth - document.body.clientWidth);
    });
    expect(overflow).toBe(0);
  });
});

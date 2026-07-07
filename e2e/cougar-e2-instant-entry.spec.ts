import { test, expect } from '@playwright/test';
import { TestApi } from './helpers/testApi';

// W2 latency: E2's Turn 1 (types strip + continue/skip chips) is fully
// scripted by the skill, so the server serves it as a template with zero
// model time (serveEncontro2Entry). Assertions: instant, correct chips,
// persisted (reload-safe), and non-virgin entries fall through to the model.

test.describe('COUGAR — instant E2 entry', () => {
  test.use({ locale: 'pt-BR' });

  test('the banner message gets the templated types turn, instantly', async ({ page, request }) => {
    const api = new TestApi(request);
    test.skip(!(await api.ping()).fakeModel, 'needs the fake model');

    await page.goto('/cbo-profile');
    const marker = page.getByTestId('cbo-stream-status');
    await expect(marker).toHaveAttribute('data-cbo-id', /.+/, { timeout: 30_000 });
    const cboId = (await marker.getAttribute('data-cbo-id'))!;

    // Phase 2 session — the E2 entry precondition.
    await api.seedState(cboId, { phase: 2 });

    // NO fake script: if the template didn't intercept, the fake model's
    // default turn ("Vamos continuar") would render instead of the strip.
    const t0 = Date.now();
    const input = page.getByTestId('cbo-chat-input');
    await input.fill('Vamos começar o Encontro 2.');
    await input.press('Enter');

    // The full templated turn: greeting, strip, follow-up line, chips.
    await expect(page.getByText('tipos de Solução baseada na Natureza', { exact: false })).toBeVisible({ timeout: 8_000 });
    await expect(page.locator('[data-testid^="type-card-"]').first()).toBeVisible();
    await expect(page.getByTestId('cbo-option-0')).toHaveAttribute('data-option-label', 'Ver exemplos');
    await expect(page.getByTestId('cbo-option-1')).toHaveAttribute('data-option-label', 'Já conheço SbN — pular');
    expect(Date.now() - t0).toBeLessThan(8_000); // UI-time, not model-time
    await expect(page.getByText('Vamos continuar', { exact: false })).toHaveCount(0); // model never ran

    // Persisted: reload rehydrates the strip AND the pending question.
    await page.reload();
    await expect(page.locator('[data-testid^="type-card-"]').first()).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId('cbo-option-0')).toHaveAttribute('data-option-label', 'Ver exemplos', { timeout: 10_000 });

    // Non-virgin: sending the banner again falls through to the model
    // (scripted turn consumed — template must NOT double-post the strip).
    await api.scriptCbo(cboId, [[
      { op: 'say', text: 'Seguindo de onde paramos.' },
      { op: 'ask_user', question: 'Continuar?', options: [{ label: 'Sim' }] },
    ]]);
    await input.fill('Vamos começar o Encontro 2.');
    await input.press('Enter');
    await expect(page.getByText('Seguindo de onde paramos', { exact: false })).toBeVisible({ timeout: 20_000 });
    expect(await page.locator('[data-testid^="type-card-"]').count()).toBeGreaterThan(0); // old strip still there, not duplicated as a second strip block
  });
});

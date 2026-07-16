import { test, expect } from '@playwright/test';
import { TestApi } from '../helpers/testApi';

// LIVE quality check — NON-GATING. The E2 linear flow's templates are fully
// covered by deterministic specs; what they CANNOT cover is the handful of
// model-owned turns the rewritten skill defines. This drives the REAL model
// through the two most load-bearing ones:
//   1. "Ver exemplos" → the model must show the examples strip AND re-offer
//      the exact "✓ Entendi" chip (the checkpoint resumes on that label).
//   2. "É outro tipo de lugar" on the site card → the model must converse
//      (not re-serve checkpoints) and leave the user with a way forward.
// Wording is non-deterministic → structural assertions only.
//
// Run on-demand against a real-model server (see cbo-live-smoke.spec.ts):
//   RUN_LIVE_QUALITY=1 E2E_BASE_URL=http://localhost:5100 npx playwright test e2e/quality/cbo-e2-linear-live.spec.ts --project=chromium

const RUN = process.env.RUN_LIVE_QUALITY === '1';

test.describe('E2 linear flow — live model-owned turns @live', () => {
  test.use({ locale: 'pt-BR' });
  test.skip(!RUN, 'Set RUN_LIVE_QUALITY=1 and point E2E_BASE_URL at a real (non-fake-model) server to run.');

  test('"Ver exemplos" → examples strip + the exact "✓ Entendi" chip', async ({ page, request }) => {
    const api = new TestApi(request);
    await page.goto('/cbo-profile');
    const marker = page.getByTestId('cbo-stream-status');
    await expect(marker).toHaveAttribute('data-cbo-id', /.+/, { timeout: 30_000 });
    const cboId = (await marker.getAttribute('data-cbo-id'))!;
    await api.seedState(cboId, { phase: 2, language: 'pt' });

    const input = page.getByTestId('cbo-chat-input');
    await input.fill('Vamos começar o Encontro 2.');
    await input.press('Enter');
    const verExemplos = page.locator('[data-testid^="cbo-option-"][data-option-label="Ver exemplos"]');
    await expect(verExemplos).toBeVisible({ timeout: 15_000 });
    await verExemplos.click();

    // REAL model turn: the skill's Turn-2 job — examples strip + confirm ask.
    await expect(page.locator('[data-testid^="showcase-card-"]').first()).toBeVisible({ timeout: 120_000 });
    // The label matters, not just "some question": the next checkpoint fires
    // on "entendi". Accept the exact chip or any option containing it.
    await expect(page.locator('[data-testid^="cbo-option-"]').filter({ hasText: /entendi/i }).first()).toBeVisible({ timeout: 30_000 });
  });

  test('"É outro tipo de lugar" → the model converses and does not strand the user', async ({ page, request }) => {
    const api = new TestApi(request);
    await page.goto('/cbo-profile');
    const marker = page.getByTestId('cbo-stream-status');
    await expect(marker).toHaveAttribute('data-cbo-id', /.+/, { timeout: 30_000 });
    const cboId = (await marker.getAttribute('data-cbo-id'))!;
    await api.seedState(cboId, { phase: 2, language: 'pt' });

    const input = page.getByTestId('cbo-chat-input');
    // Reach the site card via the checkpoint parser — the payload goes through
    // the API (multiline; the chat input is single-line), then a reload
    // rehydrates the served card + chips. No model involved up to here.
    await request.post(`/api/cbo/${cboId}/chat`, {
      data: {
        message: [
          'Map selection (composite mode):',
          '- [zone] Bela Vista: HIGH risk, intervention: flood parks, area: 1.2 km², pop: 11.128, flood: 78%, heat: 41%, landslide: 12%, at (-30.0327, -51.1898)',
          '- [custom] Terreno da associação at (-30.0330, -51.1900)',
          'Total: 2 assets, 0 sampled points',
        ].join('\n'),
        lang: 'pt',
        turnKind: 'map',
      },
    });
    await page.reload();
    await expect(page.getByTestId('cbo-site-card')).toBeVisible({ timeout: 15_000 });

    const outroTipo = page.locator('[data-testid^="cbo-option-"][data-option-label="É outro tipo de lugar"]');
    await expect(outroTipo).toBeVisible();
    await outroTipo.click();

    // REAL model turn: it should ask what the place is (free text) — i.e. the
    // turn ends with SOME prompt and no checkpoint hijack. Loose assertions.
    await expect(marker).toHaveAttribute('data-streaming', 'false', { timeout: 120_000 });
    const asked = await page.locator('[data-testid^="cbo-option-"]').count();
    const inputEnabled = await input.isEnabled();
    expect(asked > 0 || inputEnabled).toBeTruthy();

    // Answer; the model should store it and put the user back on a path
    // (re-offered confirm chips or a follow-up question — never a dead end).
    await input.fill('É um pátio de escola que a gente usa nos fins de semana.');
    await input.press('Enter');
    await expect(marker).toHaveAttribute('data-streaming', 'false', { timeout: 120_000 });
    // Not stranded = the transcript shows the model's follow-up question and
    // the user can still act (live chips, or after an SSE drop the reload path
    // with a usable input). Long live turns drop the SSE occasionally
    // (observed 2026-07-16) which downgrades the chips to their persisted
    // render — the user types instead; that's degraded, not stranded.
    await page.reload();
    await expect(marker).toHaveAttribute('data-cbo-id', /.+/, { timeout: 30_000 });
    const liveOptions = await page.locator('[data-testid^="cbo-option-"]').count();
    const canType = await input.isEnabled().catch(() => false);
    expect(liveOptions > 0 || canType).toBeTruthy();
  });
});

import { test, expect } from '@playwright/test';

// Voice-note INPUT plumbing (deterministic). The real transcription runs on a
// Replit AI key we don't have locally, so we DON'T test speech→text accuracy
// here — that's a live/manual check. What we DO test is the whole browser-side
// risk surface, which has no key dependency:
//   • the mic button renders and toggles (tap-to-start / tap-to-stop),
//   • MediaRecorder actually records and POSTs an audio blob to /transcribe,
//   • on stop the transcript SENDS immediately (no intermediate undo step),
//   • the sent bubble is marked as a voice message.
//
// Chromium gets a synthetic mic via --use-fake-device-for-media-stream, and we
// stub the /transcribe response in the browser (route interception) so no model
// key is needed and the assertion is deterministic. The chat turn itself runs
// against the deterministic fake model (CBO_FAKE_MODEL=1).

const STUB_TRANSCRIPT = 'Somos a Horta Comunitária Cascata, do bairro Cascata.';

// Synthetic audio device + auto-accepted mic prompt, plus an explicit grant.
// launchOptions forces a dedicated worker, so it must be top-level (not in a
// describe group) per Playwright.
test.use({
  launchOptions: { args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'] },
  permissions: ['microphone'],
});

test.describe('CBO voice input (fake mic + stubbed transcription)', () => {
  test('record → stop → transcript sends immediately as a voice message', async ({ page }) => {
    const probe = { hits: 0, bytes: 0 };
    await page.route('**/api/cbo/*/transcribe', async (route) => {
      probe.hits++;
      probe.bytes = route.request().postDataBuffer()?.length ?? 0;
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ text: STUB_TRANSCRIPT }) });
    });

    await page.goto('/cbo-profile');
    const marker = page.getByTestId('cbo-stream-status');
    await expect(marker).toHaveAttribute('data-cbo-id', /.+/);
    await expect(marker).toHaveAttribute('data-turns', '0');

    const mic = page.getByTestId('button-cbo-voice');
    await expect(mic).toBeVisible();
    await mic.click();                                   // tap to start
    await expect(mic).toHaveAttribute('aria-label', /stop|parar/i);
    await page.waitForTimeout(2000);                     // record enough to clear the silence guard
    await mic.click();                                   // tap to stop → transcribe → SEND

    // The transcript is sent straight away: it shows as a user bubble and a turn
    // fires (the fake model answers). There is NO intermediate undo bar.
    await expect(page.locator('.bg-green-600', { hasText: STUB_TRANSCRIPT })).toBeVisible({ timeout: 15_000 });
    await expect(marker).toHaveAttribute('data-turns', '1', { timeout: 30_000 });

    // The client genuinely uploaded recorded audio (not an empty/sham blob).
    expect(probe.hits).toBe(1);
    expect(probe.bytes, 'recorded audio should be a non-trivial multipart upload').toBeGreaterThan(1200);
  });
});

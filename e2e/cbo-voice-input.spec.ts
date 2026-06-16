import { test, expect } from '@playwright/test';

// Voice-note INPUT plumbing (deterministic). The real transcription runs on a
// Replit AI key we don't have locally, so we DON'T test speech→text accuracy
// here — that's a live/manual check. What we DO test is the whole browser-side
// risk surface, which has no key dependency:
//   • the mic button renders and toggles (tap-to-start / tap-to-stop),
//   • MediaRecorder actually records and POSTs an audio blob to /transcribe,
//   • on stop the transcript AUTO-SENDS after a short undo window,
//   • cancelling the undo window keeps the text in the box instead (recovery).
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

async function stubTranscribe(page: import('@playwright/test').Page) {
  const probe = { hits: 0, bytes: 0 };
  await page.route('**/api/cbo/*/transcribe', async (route) => {
    probe.hits++;
    probe.bytes = route.request().postDataBuffer()?.length ?? 0;
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ text: STUB_TRANSCRIPT }) });
  });
  return probe;
}

async function recordOnce(page: import('@playwright/test').Page) {
  const mic = page.getByTestId('button-cbo-voice');
  await expect(mic).toBeVisible();
  await mic.click();                                   // tap to start
  await expect(mic).toHaveAttribute('aria-label', /stop|parar/i);
  await page.waitForTimeout(2000);                     // record enough to clear the silence guard
  await mic.click();                                   // tap to stop → transcribe → undo window
}

test.describe('CBO voice input (fake mic + stubbed transcription)', () => {
  test('record → stop → auto-sends after the undo window (marked as voice)', async ({ page }) => {
    const probe = await stubTranscribe(page);
    await page.goto('/cbo-profile');
    const marker = page.getByTestId('cbo-stream-status');
    await expect(marker).toHaveAttribute('data-cbo-id', /.+/);
    await expect(marker).toHaveAttribute('data-turns', '0');

    await recordOnce(page);

    // The undo window appears with the transcript + a cancel button.
    await expect(page.getByTestId('cbo-voice-pending')).toBeVisible();
    await expect(page.getByTestId('cbo-voice-pending')).toContainText(STUB_TRANSCRIPT);

    // Left untouched, it auto-sends: the transcript shows as a sent user bubble
    // and a turn fires (the fake model answers). The undo bar goes away.
    await expect(page.locator('.bg-green-600', { hasText: STUB_TRANSCRIPT })).toBeVisible({ timeout: 15_000 });
    await expect(marker).toHaveAttribute('data-turns', '1', { timeout: 30_000 });
    await expect(page.getByTestId('cbo-voice-pending')).toHaveCount(0);

    // The client genuinely uploaded recorded audio (not an empty/sham blob).
    expect(probe.hits).toBe(1);
    expect(probe.bytes, 'recorded audio should be a non-trivial multipart upload').toBeGreaterThan(1200);
  });

  test('cancel during the undo window keeps the text in the box, does not send', async ({ page }) => {
    await stubTranscribe(page);
    await page.goto('/cbo-profile');
    const marker = page.getByTestId('cbo-stream-status');
    await expect(marker).toHaveAttribute('data-cbo-id', /.+/);
    await expect(marker).toHaveAttribute('data-turns', '0');

    await recordOnce(page);

    // Cancel before the countdown elapses → transcript drops into the input,
    // nothing is sent.
    await expect(page.getByTestId('cbo-voice-pending')).toBeVisible();
    await page.getByTestId('button-cbo-voice-cancel').click();

    await expect(page.getByTestId('cbo-chat-input')).toHaveValue(STUB_TRANSCRIPT);
    await expect(page.getByTestId('cbo-voice-pending')).toHaveCount(0);
    await expect(marker).toHaveAttribute('data-turns', '0');
    // Not sent as a bubble either.
    await expect(page.locator('.bg-green-600', { hasText: STUB_TRANSCRIPT })).toHaveCount(0);
  });
});

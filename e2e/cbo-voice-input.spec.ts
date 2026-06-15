import { test, expect } from '@playwright/test';

// Voice-note INPUT plumbing (deterministic). The real transcription runs on a
// Replit AI key we don't have locally, so we DON'T test speech→text accuracy
// here — that's a live/manual check. What we DO test is the whole browser-side
// risk surface, which has no key dependency:
//   • the mic button renders and toggles (tap-to-start / tap-to-stop),
//   • MediaRecorder actually records and POSTs an audio blob to /transcribe,
//   • the returned transcript lands in the input box for REVIEW,
//   • it is NOT auto-sent (no turn fires, no user bubble appears).
//
// Chromium gets a synthetic mic via --use-fake-device-for-media-stream, and we
// stub the /transcribe response in the browser (route interception) so no model
// key is needed and the assertion is deterministic.

const STUB_TRANSCRIPT = 'Somos a Horta Comunitária Cascata, do bairro Cascata.';

// Synthetic audio device + auto-accepted mic prompt, plus an explicit grant.
// launchOptions forces a dedicated worker, so it must be top-level (not in a
// describe group) per Playwright.
test.use({
  launchOptions: { args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'] },
  permissions: ['microphone'],
});

test.describe('CBO voice input (fake mic + stubbed transcription)', () => {
  test('record → stop → transcript fills the input for review, not auto-sent', async ({ page }) => {
    // Stub the transcription endpoint IN THE BROWSER so we never need a real key.
    // Capture the request to prove the client actually uploaded recorded audio.
    let postedAudioBytes = 0;
    let transcribeHits = 0;
    await page.route('**/api/cbo/*/transcribe', async (route) => {
      transcribeHits++;
      postedAudioBytes = route.request().postDataBuffer()?.length ?? 0;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ text: STUB_TRANSCRIPT }),
      });
    });

    await page.goto('/cbo-profile');
    const marker = page.getByTestId('cbo-stream-status');
    await expect(marker).toHaveAttribute('data-cbo-id', /.+/);

    const mic = page.getByTestId('button-cbo-voice');
    const input = page.getByTestId('cbo-chat-input');
    // The button only renders when the browser supports MediaRecorder — which
    // Chromium does, so it must be here.
    await expect(mic).toBeVisible();
    await expect(input).toHaveValue('');
    await expect(marker).toHaveAttribute('data-turns', '0');

    // Tap to start. getUserMedia resolves against the fake device, MediaRecorder
    // starts → the button flips to its "stop" affordance.
    await mic.click();
    await expect(mic).toHaveAttribute('aria-label', /stop|parar/i);

    // Record long enough to clear the client's tiny-blob (silence) guard.
    await page.waitForTimeout(2000);

    // Tap to stop → onstop builds the blob and POSTs it to /transcribe (stubbed),
    // then the transcript is appended to the input. Wait for that to land.
    await mic.click();
    await expect(input).toHaveValue(STUB_TRANSCRIPT, { timeout: 15_000 });

    // It went into the box for REVIEW — it was NOT sent. No turn fired, and no
    // user message bubble with the transcript exists.
    await expect(marker).toHaveAttribute('data-turns', '0');
    await expect(page.locator('.bg-green-600', { hasText: STUB_TRANSCRIPT })).toHaveCount(0);

    // The client genuinely uploaded recorded audio (not an empty/sham blob).
    expect(transcribeHits).toBe(1);
    expect(postedAudioBytes, 'recorded audio should be a non-trivial multipart upload').toBeGreaterThan(1200);

    // The mic returned to idle (ready to record again).
    await expect(mic).toHaveAttribute('aria-label', /record|gravar/i);

    // And the user can still edit + send normally from here: the transcript is
    // just prefilled text. Append a word and confirm the composer accepts it.
    await input.click();
    await input.press('End');
    await input.type(' Obrigada!');
    await expect(input).toHaveValue(`${STUB_TRANSCRIPT} Obrigada!`);
  });
});

import { test, expect } from '@playwright/test';

// Task #8 — the city view is hidden from the landing (no role card) but stays
// reachable by direct URL at /city. Recorded as a short demo video.

test.describe('COUGAR #8 — hide city view behind /city', () => {
  test('landing has no city card; /city still renders the city view', async ({ page }) => {
    // Landing: role selection, with the city card removed.
    await page.goto('/');
    await expect(page.getByTestId('text-landing-title')).toBeVisible();
    await page.waitForTimeout(1200); // let the card animations settle (for the video)

    await expect(page.getByTestId('card-role-city')).toHaveCount(0);
    await expect(page.getByTestId('card-role-cbo')).toBeVisible();
    await expect(page.getByTestId('card-role-orchestrator')).toBeVisible();
    await page.waitForTimeout(800);

    // The city view is still reachable by direct URL — it lands on the
    // CityCatalyst gate (auth or sample), exactly as the city role always did;
    // only the entry point moved (off the landing → /city).
    await page.goto('/city');
    await expect(page.getByTestId('text-login-title')).toBeVisible();
    await page.waitForTimeout(1000);

    // Through the sample-data path, the actual city view renders.
    await page.getByTestId('button-sample-login').click();
    await expect(page.getByTestId('text-page-title')).toBeVisible();
    await expect(page.getByTestId('grid-cities')).toBeVisible();
    await page.waitForTimeout(1500); // hold on the city view for the video
  });
});

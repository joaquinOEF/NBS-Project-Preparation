import { test, expect } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { TestApi } from './helpers/testApi';

// Task #1 — the coordinator map shows the neighborhoods always, with FOUR
// exclusive risk views: Flood / Heat / Landslide hazard rasters + the composite
// Risk-by-neighborhood choropleth. One at a time. Recorded as a demo video.

test.describe('COUGAR #1 — coordinator risk map (exclusive views)', () => {
  test('four exclusive risk-view buttons drive the map; neighborhoods always shown', async ({ page }) => {
    const api = new TestApi(page.request);
    await api.createCoordinator({ email: `map-${randomUUID()}@e2e.test`, password: 'map-pass-123', name: 'Map' });

    await page.goto('/orchestrator');

    // The map renders with the always-on neighborhood outlines.
    await expect(page.locator('.leaflet-container').first()).toBeVisible({ timeout: 20_000 });

    const flood = page.getByTestId('risk-view-flood');
    const heat = page.getByTestId('risk-view-heat');
    const landslide = page.getByTestId('risk-view-landslide');
    const risk = page.getByTestId('risk-view-risk');
    await expect(flood).toBeVisible();

    // Defaults to flood.
    await expect(flood).toHaveAttribute('aria-pressed', 'true');
    await page.waitForTimeout(1500); // hold on flood raster

    // Exclusive switching: each view turns the others off.
    await heat.click();
    await expect(heat).toHaveAttribute('aria-pressed', 'true');
    await expect(flood).toHaveAttribute('aria-pressed', 'false');
    await page.waitForTimeout(1300);

    await landslide.click();
    await expect(landslide).toHaveAttribute('aria-pressed', 'true');
    await expect(heat).toHaveAttribute('aria-pressed', 'false');
    await page.waitForTimeout(1300);

    // Risk-by-neighborhood → choropleth + priority legend.
    await risk.click();
    await expect(risk).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByText('Priority score', { exact: false })).toBeVisible();
    await page.waitForTimeout(1500);

    // Clicking the active view turns it off (just outlines + markers remain).
    await risk.click();
    await expect(risk).toHaveAttribute('aria-pressed', 'false');
    await page.waitForTimeout(1200);
  });
});

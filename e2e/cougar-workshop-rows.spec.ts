import { test, expect } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { TestApi } from './helpers/testApi';

// Task #2 — the workshop cadence is now single-column collapsible rows (was a
// 2-column grid of always-expanded cards). Rows minimize to a compact header
// to take less space; the active/next-up one stays expanded; any row toggles.
// Recorded as a demo video.

test.describe('COUGAR #2 — workshops as collapsible rows', () => {
  test('compact rows; active expanded, others minimized; any row toggles', async ({ page }) => {
    // Auth the PAGE's own context (cookie shared with page.request), then the
    // orchestrator loads the default cohort with its 6 seeded workshops.
    const api = new TestApi(page.request);
    await api.createCoordinator({ email: `ws-${randomUUID()}@e2e.test`, password: 'ws-pass-12345', name: 'WS' });

    await page.goto('/orchestrator');

    // All six workshops render as rows (single column).
    const toggle0 = page.getByTestId('workshop-toggle-0');
    const toggle1 = page.getByTestId('workshop-toggle-1');
    await expect(toggle0).toBeVisible();
    await expect(page.getByTestId('workshop-toggle-5')).toBeVisible();
    await page.waitForTimeout(1200);

    // The next-up (first) workshop is expanded by default; a later one is
    // collapsed (compact).
    await expect(toggle0).toHaveAttribute('aria-expanded', 'true');
    await expect(toggle1).toHaveAttribute('aria-expanded', 'false');
    await page.waitForTimeout(600);

    // Expand a collapsed row → its body (Expected output) appears.
    await toggle1.click();
    await expect(toggle1).toHaveAttribute('aria-expanded', 'true');
    await page.waitForTimeout(1200);

    // Collapse it again → back to compact.
    await toggle1.click();
    await expect(toggle1).toHaveAttribute('aria-expanded', 'false');
    await page.waitForTimeout(1000);
  });
});

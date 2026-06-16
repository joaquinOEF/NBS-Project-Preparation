import { test, expect } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { TestApi } from './helpers/testApi';

// Coordinator risk map (v2). Full-width map on top with the participant list
// below; always-on neighborhoods; four exclusive views — Flood/Heat/Landslide
// (raster, flood = interpolated gap-free hazard) + Risk-by-neighborhood, now
// colored like the site explorer (typology hue + risk-scaled intensity).

test.describe('COUGAR #1 — coordinator risk map (v2)', () => {
  test('full-width map + participants below; four exclusive views; zone-priority coloring', async ({ page, request }) => {
    const api = new TestApi(page.request);
    await api.createCoordinator({ email: `map-${randomUUID()}@e2e.test`, password: 'map-pass-123', name: 'Map' }); // admin

    // A participant so the list-below-the-map renders (#3).
    const mine = await (await page.request.get('/api/cohort/mine')).json();
    const member = (await new TestApi(request).inviteMember(mine.cohort.id, { orgName: 'Org Mapa', withSession: true })).member;

    await page.goto('/orchestrator');
    const mapBox = page.locator('.leaflet-container').first();
    await expect(mapBox).toBeVisible({ timeout: 20_000 });

    const flood = page.getByTestId('risk-view-flood');
    const heat = page.getByTestId('risk-view-heat');
    const landslide = page.getByTestId('risk-view-landslide');
    const risk = page.getByTestId('risk-view-risk');
    const card = page.getByTestId(`card-orchestrator-project-${member.id}`);

    // #3 — map is full-width on top; the participant card sits BELOW it.
    await expect(card).toBeVisible();
    const mb = (await mapBox.boundingBox())!;
    const cb = (await card.boundingBox())!;
    expect(cb.y, 'participant card is below the map').toBeGreaterThan(mb.y + mb.height - 4);
    expect(mb.width, 'map spans most of the page width').toBeGreaterThan(900);
    await page.waitForTimeout(1200);

    // Defaults to flood (now the interpolated hazard raster).
    await expect(flood).toHaveAttribute('aria-pressed', 'true');
    await page.waitForTimeout(1200);

    // Exclusive switching.
    await heat.click();
    await expect(heat).toHaveAttribute('aria-pressed', 'true');
    await expect(flood).toHaveAttribute('aria-pressed', 'false');
    await page.waitForTimeout(1000);

    await landslide.click();
    await expect(landslide).toHaveAttribute('aria-pressed', 'true');
    await page.waitForTimeout(1000);

    // #4 — Risk by neighborhood: zone-priority coloring (typology hue + intensity).
    await risk.click();
    await expect(risk).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByText('Zone priority', { exact: false })).toBeVisible();
    await expect(page.getByText('Stronger fill = higher risk', { exact: false })).toBeVisible();
    await page.waitForTimeout(1600);

    // Click the active view off → just outlines + markers.
    await risk.click();
    await expect(risk).toHaveAttribute('aria-pressed', 'false');
    await page.waitForTimeout(1000);
  });
});

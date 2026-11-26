import { test, expect } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { TestApi } from './helpers/testApi';
import { openAdvanced, showMap } from './helpers/orchestrator';

// Coordinator risk map (v2). Full-width map on top with the participant list
// below; always-on neighborhoods; four exclusive views — Flood/Heat/Landslide
// (PLAC/ARVC ameaça rasters) + Priority-by-neighborhood (OEF estimate), colored
// like the site explorer (typology hue + priority-scaled intensity), plus the
// observed May 2024 flood extent as an overlay on top of any of them.
//
// Labels follow the official-data stance (docs/arvc-official.md): the hazard
// toggles say "Ameaça" with source PLAC/ARVC, and the bairro view is our own
// ranking, so it says "estimativa OEF" and never "risco".

test.describe('COUGAR #1 — coordinator risk map (v2)', () => {
  test('full-width map + participants below; four exclusive views; zone-priority coloring', async ({ page, request }) => {
    const api = new TestApi(page.request);
    await api.createCoordinator({ email: `map-${randomUUID()}@e2e.test`, password: 'map-pass-123', name: 'Map' }); // admin

    // A participant so the list-below-the-map renders (#3).
    const mine = await (await page.request.get('/api/cohort/mine')).json();
    const member = (await new TestApi(request).inviteMember(mine.cohort.id, { orgName: 'Org Mapa', withSession: true })).member;

    await page.goto('/orchestrator');
    await showMap(page);
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

    // Defaults to flood (SGB susceptibility since 24 Nov 2026: streams and
    // Guaíba together), with its source and the pointer to the 2024 overlay.
    await expect(flood).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByTestId('hazard-source')).toContainText('SGB/CPRM');
    await expect(page.getByTestId('flood-fluvial-note')).toContainText('Guaíba together');
    await page.waitForTimeout(1200);

    // May 2024 flood extent — an overlay, not exclusive with the hazard view.
    const flood2024 = page.getByTestId('risk-view-flood2024');
    await expect(flood2024).toHaveText(/Area flooded in May 2024/);
    const pathsBefore = await page.locator('.leaflet-overlay-pane path').count();
    await flood2024.click();
    await expect(flood2024).toHaveAttribute('aria-pressed', 'true');
    await expect(flood).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByTestId('flood2024-source')).toBeVisible();
    await expect.poll(() => page.locator('.leaflet-overlay-pane path').count(), { timeout: 15_000 })
      .toBeGreaterThan(pathsBefore);
    await flood2024.click();
    await expect(flood2024).toHaveAttribute('aria-pressed', 'false');

    // Exclusive switching.
    await heat.click();
    await expect(heat).toHaveAttribute('aria-pressed', 'true');
    await expect(flood).toHaveAttribute('aria-pressed', 'false');
    await expect(page.getByTestId('hazard-source')).toContainText('PLAC/ARVC');
    await page.waitForTimeout(1000);

    await landslide.click();
    await expect(landslide).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByTestId('hazard-source')).toContainText('SGB/CPRM');
    await expect(page.getByTestId('landslide-sgb-note')).toBeVisible();
    await page.waitForTimeout(1000);

    // #4 — Priority by neighborhood (OEF estimate): typology hue + intensity.
    await risk.click();
    await expect(risk).toHaveAttribute('aria-pressed', 'true');
    await expect(risk).toContainText('OEF estimate');
    await expect(page.getByText('Priority (OEF estimate, from the PLAC)', { exact: false })).toBeVisible();
    await expect(page.getByText('Stronger fill = higher priority', { exact: false })).toBeVisible();
    await page.waitForTimeout(1600);

    // Click the active view off → just outlines + markers.
    await risk.click();
    await expect(risk).toHaveAttribute('aria-pressed', 'false');
    await page.waitForTimeout(1000);
  });

  test('"Organizations only": no hazard, no 2024 flood, bairros say only their name', async ({ page }) => {
    const api = new TestApi(page.request);
    await api.createCoordinator({ email: `map-orgs-${randomUUID()}@e2e.test`, password: 'map-pass-123', name: 'Orgs' });
    await page.goto('/orchestrator');
    await showMap(page);
    await expect(page.locator('.leaflet-container').first()).toBeVisible({ timeout: 20_000 });

    const orgs = page.getByTestId('risk-view-orgs');
    const flood = page.getByTestId('risk-view-flood');
    const flood2024 = page.getByTestId('risk-view-flood2024');
    await expect(orgs).toHaveText(/Organizations only/);
    await expect(orgs).toHaveAttribute('aria-pressed', 'false');

    await flood2024.click();
    await expect(flood2024).toHaveAttribute('aria-pressed', 'true');
    await orgs.click();
    await expect(orgs).toHaveAttribute('aria-pressed', 'true');
    await expect(flood).toHaveAttribute('aria-pressed', 'false');
    await expect(flood2024).toHaveAttribute('aria-pressed', 'false');
    await expect(page.getByTestId('hazard-source')).toHaveCount(0);
    await expect(page.locator('.leaflet-tile-pane img[src*="sgb-susc"], .leaflet-tile-pane img[src*="/arvc/"]')).toHaveCount(0);

    // A bairro's tooltip carries its name and no OEF priority.
    await expect.poll(() => page.locator('.leaflet-overlay-pane path.leaflet-interactive').count(), { timeout: 15_000 }).toBeGreaterThan(10);
    await page.locator('.leaflet-overlay-pane path.leaflet-interactive').nth(5).hover({ force: true });
    const tip = page.locator('.orch-marker-tip').first();
    await expect(tip).toBeVisible();
    await expect(tip).not.toContainText(/priority|prioridade/i);

    // Choosing a hazard leaves the view.
    await flood.click();
    await expect(orgs).toHaveAttribute('aria-pressed', 'false');
  });

  test('pt: hazard toggles name their source, the bairro view reads "estimativa OEF"', async ({ page }) => {
    await page.addInitScript(() => { try { localStorage.setItem('i18nextLng', 'pt'); } catch {} });
    const api = new TestApi(page.request);
    await api.createCoordinator({ email: `map-pt-${randomUUID()}@e2e.test`, password: 'map-pass-123', name: 'Mapa' });

    await page.goto('/orchestrator');
    await showMap(page);
    await expect(page.locator('.leaflet-container').first()).toBeVisible({ timeout: 20_000 });

    await expect(page.getByTestId('risk-view-flood')).toHaveText(/Suscetibilidade a inundação \(SGB\)/);
    await expect(page.getByTestId('risk-view-heat')).toHaveText(/Ameaça de ondas de calor/);
    await expect(page.getByTestId('risk-view-landslide')).toHaveText(/Suscetibilidade a deslizamentos \(SGB\)/);
    await expect(page.getByTestId('risk-view-flood2024')).toHaveText(/Área inundada em maio de 2024/);
    await expect(page.getByTestId('hazard-source')).toContainText('SGB/CPRM');

    const bairro = page.getByTestId('risk-view-risk');
    await expect(bairro).toHaveText(/Prioridade por bairro \(estimativa OEF\)/);
    await expect(bairro).not.toContainText(/risco/i);
    await bairro.click();
    await expect(page.getByText('Prioridade (estimativa OEF, a partir do PLAC)')).toBeVisible();
    await expect(page.getByText('Preenchimento mais forte = maior prioridade')).toBeVisible();
  });
});

import { test, expect } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { TestApi } from './helpers/testApi';
import { showMap } from './helpers/orchestrator';

// Coordinator map pins (26 Nov 2026): hover shows who, where, which encontro
// (and what they work on / open requests); a click opens the organisation on
// Perfil; on touch the first tap shows the label and the second opens; in
// "Organizations only" a switch keeps the names on screen.

async function placedMember(page: any, request: any, orgName: string, at: [number, number]) {
  // Its own cohort: the admin cohort collects every spec's pins, and a pin
  // under another one cannot be hovered.
  const api = new TestApi(page.request);
  const { cohort } = await new TestApi(request).createCohort(`Pins ${randomUUID().slice(0, 6)}`);
  await api.createCoordinator({ email: `pin-${randomUUID()}@e2e.test`, password: 'map-pass-123', name: 'Pin', cohortId: cohort.id });
  const member = (await new TestApi(request).inviteMember(cohort.id, { orgName, neighborhood: 'Sarandi' })).member;
  const put = await page.request.put(`/api/cbo-member/${member.memberSlug}/site`, { data: { name: 'Ponto', coordinates: at } });
  expect(put.ok()).toBeTruthy();
  return member;
}

test.describe('coordinator map pins', () => {
  test('hover label, click opens Perfil, show-names switch', async ({ page, request }) => {
    const name = `Org Pino ${randomUUID().slice(0, 5)}`;
    const member = await placedMember(page, request, name, [-30.225, -51.075]);
    await page.goto('/orchestrator');
    await showMap(page);
    const pin = page.locator(`.orch-marker:has(.orch-marker-inner[data-id="${member.id}"])`);
    await expect(pin).toBeVisible({ timeout: 20_000 });

    await pin.hover();
    const tip = page.locator('.orch-marker-tip', { hasText: name });
    await expect(tip).toBeVisible();
    await expect(tip).toContainText('Sarandi · Encontro 1');

    await pin.click();
    await expect(page.getByTestId('cbo-files-drawer')).toBeVisible();
    await expect(page.getByTestId('cbo-drawer-title')).toContainText(name);
    await expect(page.getByTestId('cbo-tab-perfil')).toHaveAttribute('data-state', 'active');
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('cbo-files-drawer')).toBeHidden();

    // The switch exists only in "Organizations only"; names then stay on screen.
    await expect(page.getByTestId('map-show-names')).toHaveCount(0);
    await page.getByTestId('risk-view-orgs').click();
    await page.getByTestId('map-show-names').locator('input').check();
    await page.mouse.move(5, 5);
    await expect(page.locator('.orch-marker-name', { hasText: name })).toBeVisible();
    await page.getByTestId('risk-view-flood').click();
    await expect(page.locator('.orch-marker-name')).toHaveCount(0);

    // "Show organizations": over a risk view the pins can be taken off the map
    // (the risk map alone), and they are back in "Organizations only".
    await expect(pin).toBeVisible();
    await page.getByTestId('map-show-pins').locator('input').uncheck();
    await expect(pin).toBeHidden();
    await page.getByTestId('risk-view-heat').click();
    await expect(pin).toBeHidden();
    await page.getByTestId('risk-view-orgs').click();
    await expect(page.getByTestId('map-show-pins')).toHaveCount(0);
    await expect(pin).toBeVisible();
    await page.getByTestId('risk-view-flood').click();
    await page.getByTestId('map-show-pins').locator('input').check();
    await expect(pin).toBeVisible();
  });
});

test('a test copy ("… (teste)") gets no pin; the original keeps its own', async ({ page, request }) => {
  const name = `Org Original ${randomUUID().slice(0, 5)}`;
  const original = await placedMember(page, request, name, [-30.16, -51.10]);
  const mine = await (await page.request.get('/api/cohort/mine')).json();
  const copy = (await new TestApi(request).inviteMember(mine.cohort.id, { orgName: `${name} (teste)` })).member;
  const put = await page.request.put(`/api/cbo-member/${copy.memberSlug}/site`, { data: { name: 'Ponto', coordinates: [-30.16, -51.10] } });
  expect(put.ok()).toBeTruthy();
  await page.goto('/orchestrator');
  await showMap(page);
  await expect(page.locator(`.orch-marker-inner[data-id="${original.id}"]`)).toBeVisible({ timeout: 20_000 });
  await expect(page.locator(`.orch-marker-inner[data-id="${copy.id}"]`)).toHaveCount(0);
});

test.describe('coordinator map pins — touch', () => {
  test.use({ hasTouch: true, isMobile: false, viewport: { width: 1180, height: 820 } });
  test('first tap shows the label, second opens', async ({ page, request }) => {
    const name = `Org Toque ${randomUUID().slice(0, 5)}`;
    const member = await placedMember(page, request, name, [-30.10, -51.06]);
    await page.goto('/orchestrator');
    await showMap(page);
    const pin = page.locator(`.orch-marker:has(.orch-marker-inner[data-id="${member.id}"])`);
    await expect(pin).toBeVisible({ timeout: 20_000 });
    await pin.tap();
    await expect(page.locator('.orch-marker-tip', { hasText: name })).toBeVisible();
    await expect(page.getByTestId('cbo-files-drawer')).toHaveCount(0);
    await pin.tap();
    await expect(page.getByTestId('cbo-drawer-title')).toContainText(name);
  });
});

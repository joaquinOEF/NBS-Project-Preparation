import { expect, type Page } from '@playwright/test';

/** Open "Ferramentas avançadas" (reset / delete / new cohort / export / import / simulate) if it is closed. */
export async function openAdvanced(page: Page) {
  const toggle = page.getByTestId('button-advanced-tools');
  await expect(toggle).toBeVisible({ timeout: 20_000 });
  if ((await toggle.getAttribute('aria-expanded')) !== 'true') await toggle.click();
  await expect(page.getByTestId('advanced-tools')).toBeVisible();
}

/** Show the map / solutions / cases region if it is folded. */
export async function showMap(page: Page) {
  const toggle = page.getByTestId('button-toggle-map');
  await expect(toggle).toBeVisible({ timeout: 20_000 });
  if ((await toggle.getAttribute('aria-expanded')) !== 'true') await toggle.click();
}

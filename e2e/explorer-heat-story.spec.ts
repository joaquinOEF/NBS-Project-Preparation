import { test, expect } from '@playwright/test';

// THE HEAT STORY, as a presenter walks it (shared/explorer-stories.ts):
//   the link → heat map + the story's first chip → 5 parks pinned → tap pin 1 →
//   a proposal with the official readings and its because line → Add → the site
//   is on the map at once, and still there after a reload.
// No model anywhere on this path: the suite's server has a dummy key, so this
// also proves the template stands on its own when the model cannot answer.

// reset=1: the sample project is one shared record; start from no sites.
const STORY = '/sample/site-explorer/sample-ada-1?story=heat&reset=1';

test('the heat story, from an empty browser to a saved site', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(STORY);

  // The chat is open on the story, the heat map is on, the first chip is waiting.
  await expect(page.getByTestId('explorer-story-title')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId('key-map-heat')).toHaveAttribute('aria-pressed', 'true');
  await expect(page).not.toHaveURL(/reset=/);
  await expect(page.locator('.intervention-site-marker')).toHaveCount(0);
  await expect(page.getByTestId('explorer-narration').first()).toContainText('Heat-wave hazard projected for 2050');
  const chip = page.getByTestId('explorer-chip-parks_heat');
  await expect(chip).toHaveText('5 parks where cooling matters most');

  // The chip: five numbered pins and the same five as rows, with the rule above them.
  await chip.click();
  await expect(page.locator('.explorer-pin')).toHaveCount(5);
  await expect(page.getByTestId('explorer-rank-list').locator('button')).toHaveCount(5);
  await expect(page.getByTestId('explorer-result-rank')).toContainText('No combined score');
  await expect(page.getByTestId('explorer-rank-row-1')).toContainText('Praça José Dornelles Medina');
  await expect(page.getByTestId('explorer-rank-row-1')).toContainText('very high');
  // Nothing on screen says the model could not be reached.
  await expect(page.getByText(/error|could not|cannot answer/i)).toHaveCount(0);

  // Pin 1 on the map opens the proposal: official readings, the because line, one button.
  await page.locator('.explorer-pin', { hasText: /^1$/ }).click();
  const proposal = page.getByTestId('explorer-proposal');
  await expect(proposal.getByTestId('explorer-proposal-name')).toHaveText('Praça José Dornelles Medina');
  await expect(proposal.locator('[data-hazard="heat"]')).toContainText('very high');
  await expect(proposal.locator('[data-hazard="heat"]')).toContainText('climate plan, 2050');
  await expect(proposal.locator('[data-hazard="flood"]')).toContainText('SGB');
  await expect(proposal.getByTestId('explorer-proposal-because')).toHaveText(/^Heat here: very high hazard \(climate plan, 2050\) → /);
  // The map frames the square: its outline is drawn, its pin stays on it, and
  // at street level the heat raster steps back so the ground reads through.
  await expect(page.locator('path.explorer-place-outline')).toHaveCount(1);
  await expect(page.locator('.explorer-pin', { hasText: /^1$/ })).toBeVisible();
  await expect.poll(() => page.evaluate(() => Number((document.querySelector('.leaflet-explorerRaster-pane .leaflet-layer') as HTMLElement | null)?.style.opacity))).toBeLessThan(0.4);
  const add = proposal.getByTestId('explorer-proposal-add');
  await expect(add).toHaveText('Add “Shade & Cooling Retrofit” here');

  // Add: on the map immediately, confirmed in the chat with what to ask next.
  const saved = page.waitForResponse(r => r.url().includes('/blocks/site_explorer') && r.request().method() === 'PUT' && r.ok());
  await add.click();
  await expect(add).toHaveText('Added: Shade & Cooling Retrofit');
  await expect(page.locator('.intervention-site-marker')).toHaveCount(1);
  await expect(page.getByTestId('explorer-chips').getByRole('button').first()).toHaveText('Same question for flooding?');
  // Its numbered pin steps aside for the site's own marker.
  await expect(page.locator('.explorer-pin')).toHaveCount(4);
  const sites = () => page.evaluate(() => {
    const ctx = JSON.parse(localStorage.getItem('nbs_project_context_sample-ada-1') || '{}');
    const zone = (ctx.siteExplorer?.selectedZones ?? []).find((z: any) => z.zoneId === 'vila_ipiranga');
    return (zone?.interventionPortfolio ?? []).map((i: any) => `${i.assetName} · ${i.interventionId}`);
  });
  expect(await sites()).toContain('Praça José Dornelles Medina · shade_plaza');
  await saved;

  // …and it is still there after a reload (no "refresh to see it", no losing it either).
  await page.reload();
  await expect(page.getByTestId('key-maps')).toBeVisible({ timeout: 30_000 });
  await expect(page.locator('.intervention-site-marker').first()).toBeVisible({ timeout: 30_000 });
  expect(await sites()).toContain('Praça José Dornelles Medina · shade_plaza');
});

test('the three stories are one link each, and listed in the chat for a presenter', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  for (const [story, map, chip] of [['flood', 'flood', 'schools_flood'], ['landslide', 'landslide', 'story_gloria']] as const) {
    await page.goto(`/sample/site-explorer/sample-ada-1?story=${story}`);
    await expect(page.getByTestId('explorer-story-title')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId(`key-map-${map}`)).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByTestId(`explorer-chip-${chip}`)).toBeVisible();
  }
  // From the drawer's header, without the URL.
  await page.getByTestId('explorer-stories-button').click();
  const menu = page.getByTestId('explorer-stories-menu');
  await expect(menu.getByRole('link')).toHaveCount(3);
  await expect(menu.getByTestId('explorer-story-heat')).toHaveAttribute('href', /\?story=heat$/);
  await menu.getByTestId('explorer-story-heat').click();
  await expect(page.getByTestId('key-map-heat')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('explorer-chip-parks_heat')).toBeVisible();
  await expect(page).toHaveURL(/story=heat/);
});

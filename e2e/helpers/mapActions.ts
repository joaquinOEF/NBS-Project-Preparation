import { expect, type Page } from '@playwright/test';

// Wait for the zones GeoJSON (94 bairros → >50 SVG paths), then click the map
// center to select whichever bairro sits there. A flat wait is flaky under
// full-suite parallelism (server still streaming the GeoJSON while the click
// lands on nothing).
export async function clickCenterZone(page: Page) {
  await expect
    .poll(async () => page.locator('.leaflet-overlay-pane svg path').count(), { timeout: 20_000 })
    .toBeGreaterThan(50);
  await page.waitForTimeout(400); // let the layer settle/animate
  const box = (await page.locator('.leaflet-container').first().boundingBox())!;
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
}

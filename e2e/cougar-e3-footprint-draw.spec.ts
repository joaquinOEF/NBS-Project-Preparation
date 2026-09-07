import { test, expect } from '@playwright/test';
import { TestApi } from './helpers/testApi';

// TRACING THE FOOTPRINT — the one map session with no test until now.
//
// Drawing has been possible since the map shipped and nothing drove it in CI,
// so two defects rode into a live workshop together (JVP screenshot,
// 2026-09-07):
//
//   • the drawn area was named "Área desenhada (0 pontos)" — the name was built
//     INSIDE a setState updater, which React runs after the next line empties
//     the vertex ref;
//   • the chat answered "how big is it" with the Encontro 2 hazard read-out,
//     underscores and all, and never showed the shape or the m².
//
// This walks the real beats — no fake-model script — and ends where the room
// ends: looking at what it drew.

const W2_STATE = [
  { sectionId: 'org_profile', field: 'org_name', value: 'Raízes do Sarandi' },
  { sectionId: 'intervention_site', field: 'bairro', value: 'Sarandi' },
  { sectionId: 'intervention_site', field: 'site_name', value: 'Pátio da EMEI Solar' },
  { sectionId: 'intervention_site', field: '_site_lat', value: '-30.0906' },
  { sectionId: 'intervention_site', field: '_site_lng', value: '-51.1726' },
  { sectionId: 'intervention_site', field: 'current_use', value: 'paved' },
  { sectionId: 'intervention_site', field: 'site_worry', value: 'alagamento' },
  { sectionId: 'intervention_site', field: 'site_story', value: 'Quando chove forte a água entra pelo fundo.' },
  { sectionId: 'intervention_site', field: 'nbs_interest', value: 'aguas-pluviais' },
];

test.describe('COUGAR — E3 footprint', () => {
  test.use({ locale: 'pt-BR' });

  test('traced area → m² in the bubble, the shape in a card', async ({ page, request }) => {
    const api = new TestApi(request);
    test.skip(!(await api.ping()).fakeModel, 'needs the fake model env (for seeding)');

    await page.goto('/cbo-profile');
    const marker = page.getByTestId('cbo-stream-status');
    await expect(marker).toHaveAttribute('data-cbo-id', /.+/, { timeout: 30_000 });
    const cboId = (await marker.getAttribute('data-cbo-id'))!;
    await api.seedState(cboId, { phase: 3, language: 'pt', sections: W2_STATE });

    const chip = (label: string) =>
      page.locator(`[data-testid^="cbo-option-"][data-option-label="${label}"]`);
    const input = page.getByTestId('cbo-chat-input');

    await input.fill('Vamos começar o Encontro 3.');
    await input.press('Enter');
    await chip('É isso ✓').click();
    await expect(page.getByTestId('cbo-solution-options')).toBeVisible({ timeout: 15_000 });
    await chip('Jardins de chuva').click();

    // The size beat, and the road that opens the map.
    await expect(page.getByText('Contorne no mapa', { exact: false }).last()).toBeVisible({ timeout: 15_000 });
    await chip('Desenhar no mapa').click();

    const map = page.locator('.leaflet-container').first();
    await expect(map).toBeVisible({ timeout: 30_000 });
    // Polygon drawing is already armed in footprint mode — no toolbar tap.
    const box = (await map.boundingBox())!;
    await page.waitForTimeout(1500); // the staggered fit to the saved pin
    const cx = box.x + box.width / 2;
    const cy = box.y + box.height / 2;
    const corners: Array<[number, number]> = [
      [cx - 40, cy - 30], [cx + 40, cy - 30], [cx + 40, cy + 30], [cx - 40, cy + 30],
    ];
    for (const [x, y] of corners) await page.mouse.click(x, y);
    // Close on the first vertex, the way the help copy says to.
    await page.mouse.click(corners[0][0], corners[0][1]);

    const confirm = page.getByTestId('map-confirm-site');
    await expect(confirm).toBeEnabled({ timeout: 10_000 });
    await confirm.click();

    // ── Back in the chat ────────────────────────────────────────────────────
    const thread = page.getByTestId('cbo-chat-thread');
    // The bubble states the size they just traced …
    await expect(thread.getByText('Desenhei a área no mapa', { exact: false })).toBeVisible({ timeout: 20_000 });
    // … and never the vertex count, the hazard read-out, or raw markdown.
    await expect(thread.getByText('pontos)', { exact: false })).toHaveCount(0);
    await expect(thread.getByText('_(comparado', { exact: false })).toHaveCount(0);

    // The shape itself, over the imagery it was traced on.
    const card = page.getByTestId('cbo-footprint-card');
    await expect(card).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId('cbo-footprint-thumb')).toBeVisible();
    await expect(page.getByTestId('cbo-footprint-area')).toContainText('m²');
    // A real traced area, not a degenerate one — the "(0 pontos)" bug shipped
    // because nothing ever asserted the number that came out of the draw.
    const area = Number((await page.getByTestId('cbo-footprint-area').innerText()).replace(/[^\d]/g, ''));
    expect(area).toBeGreaterThan(0);
  });

  // ⚠️ THE CONDITION THE DEFECT NEEDED. With a raster layer enabled, closing the
  // polygon awaits `sampleRasterAtPoint` before it stores the asset — which
  // pushes the setState outside the event handler, defers React's updater to
  // render time, and lets it read the vertex ref AFTER the next line empties
  // it. Measured 2026-09-07: 0 vertices under that condition, 4 without it —
  // and reruns flip, because it is a race. So this test does not pin the count;
  // it pins that the name states a SIZE, which is true whoever wins the race.
  test('a drawn area is named by its size, with rasters loaded', async ({ page, request }) => {
    const api = new TestApi(request);
    test.skip(!(await api.ping()).fakeModel, 'needs the fake model');

    await page.goto('/cbo-profile');
    const marker = page.getByTestId('cbo-stream-status');
    await expect(marker).toHaveAttribute('data-cbo-id', /.+/, { timeout: 30_000 });
    const cboId = (await marker.getAttribute('data-cbo-id'))!;
    await api.scriptCbo(cboId, [[
      { op: 'say', text: 'Vamos pro mapa.' },
      { op: 'open_map', params: {
        preset: 'e3_footprint',
        focusZone: 'Sarandi',
        tileLayers: ['arvc_flood_hazard', 'arvc_heat_hazard'],
        showLegendSimple: true,
        drawFootprint: { lat: -30.0906, lng: -51.1726, name: 'Pátio da EMEI Solar' },
      } },
    ]]);
    const input = page.getByTestId('cbo-chat-input');
    await input.fill('Abrir o mapa');
    await input.press('Enter');

    const map = page.locator('.leaflet-container').first();
    await expect(map).toBeVisible({ timeout: 30_000 });
    await page.waitForTimeout(1800);
    const box = (await map.boundingBox())!;
    const cx = box.x + box.width / 2;
    const cy = box.y + box.height / 2;
    const corners: Array<[number, number]> = [
      [cx - 40, cy - 30], [cx + 40, cy - 30], [cx + 40, cy + 30], [cx - 40, cy + 30],
    ];
    for (const [x, y] of corners) await page.mouse.click(x, y);
    await page.mouse.click(corners[0][0], corners[0][1]);

    const root = page.locator('[data-selection-names]');
    await expect(root).toHaveAttribute('data-selection-names', /m²/, { timeout: 10_000 });
    await expect(root).not.toHaveAttribute('data-selection-names', /pontos/);
  });

  // ⚠️ THE THIRD ROAD. Before this, the size beat offered a map or a deferral —
  // so an organisation on a laptop, or one that simply knows its yard is "uns
  // trinta por vinte", had to record "ainda não sei o tamanho" about a place it
  // could measure with a tape. A said size is not a measurement and is not
  // nothing: it is priced, with its provenance attached.
  test('the size can be said instead of traced — and a non-answer is refused', async ({ page, request }) => {
    const api = new TestApi(request);
    test.skip(!(await api.ping()).fakeModel, 'needs the fake model env (for seeding)');

    await page.goto('/cbo-profile');
    const marker = page.getByTestId('cbo-stream-status');
    await expect(marker).toHaveAttribute('data-cbo-id', /.+/, { timeout: 30_000 });
    const cboId = (await marker.getAttribute('data-cbo-id'))!;
    await api.seedState(cboId, { phase: 3, language: 'pt', sections: W2_STATE });

    const chip = (label: string) =>
      page.locator(`[data-testid^="cbo-option-"][data-option-label="${label}"]`);
    const input = page.getByTestId('cbo-chat-input');
    const thread = page.getByTestId('cbo-chat-thread');

    await input.fill('Vamos começar o Encontro 3.');
    await input.press('Enter');
    await chip('É isso ✓').click();
    await expect(page.getByTestId('cbo-solution-options')).toBeVisible({ timeout: 15_000 });
    await chip('Jardins de chuva').click();
    await expect(page.getByText('Contorne no mapa', { exact: false }).last()).toBeVisible({ timeout: 15_000 });

    // The two new affordances are there, and they reach the composer rather
    // than answering — that is what `action` means on an option.
    await expect(page.getByTestId('cbo-option-write')).toBeVisible();
    await expect(page.getByTestId('cbo-option-record')).toBeVisible();

    // A sentence that states no area is refused, out loud, and asks again by
    // the honest road instead of guessing.
    await input.fill('uns 20 metros de rua');
    await input.press('Enter');
    await expect(thread.getByText('não vou chutar um número', { exact: false })).toBeVisible({ timeout: 15_000 });
    await expect(chip('Do tamanho de uma quadra de vôlei')).toBeVisible({ timeout: 10_000 });
  });

  test('a stated size is priced, with its provenance', async ({ page, request }) => {
    const api = new TestApi(request);
    test.skip(!(await api.ping()).fakeModel, 'needs the fake model env (for seeding)');

    await page.goto('/cbo-profile');
    const marker = page.getByTestId('cbo-stream-status');
    await expect(marker).toHaveAttribute('data-cbo-id', /.+/, { timeout: 30_000 });
    const cboId = (await marker.getAttribute('data-cbo-id'))!;
    await api.seedState(cboId, { phase: 3, language: 'pt', sections: W2_STATE });

    const chip = (label: string) =>
      page.locator(`[data-testid^="cbo-option-"][data-option-label="${label}"]`);
    const input = page.getByTestId('cbo-chat-input');
    const thread = page.getByTestId('cbo-chat-thread');

    await input.fill('Vamos começar o Encontro 3.');
    await input.press('Enter');
    await chip('É isso ✓').click();
    await expect(page.getByTestId('cbo-solution-options')).toBeVisible({ timeout: 15_000 });
    await chip('Jardins de chuva').click();
    await expect(page.getByText('Contorne no mapa', { exact: false }).last()).toBeVisible({ timeout: 15_000 });

    await input.fill('é mais ou menos 30 por 20 metros');
    await input.press('Enter');

    // The number, read back with what it is — and what it is not.
    await expect(thread.getByText('600 m²', { exact: false }).last()).toBeVisible({ timeout: 15_000 });
    await expect(thread.getByText('não é medida', { exact: false })).toBeVisible();
    // And the flow carries on to the next beat rather than stalling on size.
    await expect(page.getByText('quem constrói', { exact: false }).last()).toBeVisible({ timeout: 15_000 });
  });
});

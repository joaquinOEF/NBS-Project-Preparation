import { test, expect } from '@playwright/test';
import { TestApi } from './helpers/testApi';

// The two-level NBS selector (família → variante, shared/nbs-catalog.ts).
// The taxonomy decision from the Perfect Demo meeting: the agent recommends at
// the FAMÍLIA level (hazards support that reliably); the organization picks the
// variant. Guards: hazard-driven família ranking + badge, recommended famílias
// start expanded / others collapsed, variant selection, and the confirm message
// carrying solution id + família + mapped legacy type for downstream flows.

test.describe('COUGAR — E3 two-level solution selector', () => {
  test.use({ locale: 'pt-BR' });

  test('hazards recommend famílias; a variant is picked; confirm names solution + família + mapped type', async ({ page, request }) => {
    const api = new TestApi(request);
    test.skip(!(await api.ping()).fakeModel, 'needs the fake model');

    await page.goto('/cbo-profile');
    const marker = page.getByTestId('cbo-stream-status');
    await expect(marker).toHaveAttribute('data-cbo-id', /.+/, { timeout: 30_000 });
    const cboId = (await marker.getAttribute('data-cbo-id'))!;

    // Flood-dominant site → Águas Pluviais must rank first (its flood weight is
    // 1.0), with Recuperação de Ecossistemas second (flood 0.7).
    await api.scriptCbo(cboId, [
      [
        { op: 'set_phase', phase: 3 },
        { op: 'say', text: 'Escolhe a solução de SbN.' },
        {
          op: 'open_intervention_selector',
          params: {
            prompt: 'Escolha a solução para o seu terreno',
            multiSelect: true,
            maxRecommendations: 2,
            siteHazards: { flood: 0.9, heat: 0.2, landslide: 0.1 },
          },
        },
      ],
      [{ op: 'say', text: 'Ótima escolha, anotei aqui.' }],
    ]);
    await page.getByTestId('cbo-chat-input').fill('vamos escolher');
    await page.getByTestId('cbo-chat-input').press('Enter');

    // All five famílias render; the flood-driven one is first and badged.
    const aguas = page.getByTestId('selector-familia-aguas-pluviais');
    await expect(aguas).toBeVisible({ timeout: 30_000 });
    expect(await page.locator('[data-testid^="selector-familia-"]').count()).toBe(5);
    await expect(aguas.getByText(/Recomendado|Recommended/)).toBeVisible();

    // Recommended famílias start expanded (variants visible); non-recommended
    // start collapsed and open on tap.
    await expect(page.getByTestId('selector-solution-jardins-de-chuva')).toBeVisible();
    await expect(page.getByTestId('selector-solution-hortas-urbanas')).toHaveCount(0);
    await page.getByTestId('selector-familia-agricultura-urbana').click();
    await expect(page.getByTestId('selector-solution-hortas-urbanas')).toBeVisible();

    // "Saiba mais" opens the variant's own ficha técnica (not the mapped
    // type's content — that's reachable from inside the ficha as a complement).
    await page.getByTestId('selector-saibamais-jardins-de-chuva').click();
    await expect(page.getByTestId('selector-ficha-view')).toBeVisible();
    await expect(page.getByTestId('solution-detail-jardins-de-chuva')).toBeVisible();
    await expect(page.getByText('Quem precisa dizer sim')).toBeVisible();
    await page.getByTestId('selector-ficha-back').click();
    await expect(page.getByTestId('selector-ficha-view')).toHaveCount(0);

    // Pick a variant inside the recommended família and confirm.
    await page.getByTestId('selector-select-jardins-de-chuva').click();
    await page.getByTestId('selector-confirm').click();

    // The confirm round-trips as a chat message the agent can parse: solution
    // id + família label + the mapped deep-content type/knowledge file.
    await expect(page.getByText('Jardins de chuva (jardins-de-chuva)', { exact: false })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText('Gestão de Águas Pluviais', { exact: false }).first()).toBeVisible();
    await expect(page.getByText('bioswales-rain-gardens.md', { exact: false })).toBeVisible();
    await expect(page.getByText('Ótima escolha, anotei aqui', { exact: false })).toBeVisible({ timeout: 20_000 });
  });
});

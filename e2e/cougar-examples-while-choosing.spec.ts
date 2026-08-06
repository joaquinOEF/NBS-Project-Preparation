import { test, expect } from '@playwright/test';
import { TestApi } from './helpers/testApi';
import { orderShowcaseCardsFor, NBS_SHOWCASE_CARDS } from '../shared/nbs-showcase-cards';

// Backlog #27, from the COUGAR convening: "make NBS family examples more
// discoverable through an exploratory component so users can reference back to
// case studies while selecting solutions". Orgs were choosing famílias blind.
//
// ⚠️ The whole risk of this feature is in HOW it opens. The chip contract is
// "the chip still posts its message" — the E2 checkpoint machine derives its
// position from the answers. So an examples option would either answer the
// question by accident or strand the flow. It has to be a SECONDARY control,
// and opening it must cost nothing: the question is still there afterwards.

test.describe('COUGAR — real cases, reachable while choosing', () => {
  test.use({ locale: 'pt-BR' });

  test('opening the cases does NOT answer the question', async ({ page, request }) => {
    test.setTimeout(120_000);
    const api = new TestApi(request);
    test.skip(!(await api.ping()).fakeModel, 'needs the fake model');

    await page.goto('/cbo-profile');
    const marker = page.getByTestId('cbo-stream-status');
    await expect(marker).toHaveAttribute('data-cbo-id', /.+/, { timeout: 30_000 });
    const cboId = (await marker.getAttribute('data-cbo-id'))!;

    await api.scriptCbo(cboId, [[
      { op: 'set_phase', phase: 2 } as any,
      { op: 'ask_user', question: 'Em quais famílias vocês teriam interesse?', options: [
        { label: 'Gestão de Águas Pluviais', description: 'água da chuva' },
        { label: 'Agricultura Urbana', description: 'comida' },
      ], showExamples: true } as any,
    ]]);
    await page.getByTestId('cbo-chat-input').fill('oi');
    await page.getByTestId('cbo-chat-input').press('Enter');

    const control = page.getByTestId('cbo-show-examples');
    await expect(control, 'the secondary control must be offered here').toBeVisible({ timeout: 30_000 });

    const turnsBefore = (await (await request.get(`/api/cbo/${cboId}/messages`)).json()).length;

    await control.click();
    await expect(page.getByTestId('nbs-examples-sheet')).toBeVisible({ timeout: 10_000 });

    // THE ASSERTION. No turn was sent, nothing was answered, and the question is
    // still on screen behind the sheet.
    await page.waitForTimeout(800);
    const turnsAfter = (await (await request.get(`/api/cbo/${cboId}/messages`)).json()).length;
    expect(turnsAfter, 'looking at cases must not post a turn').toBe(turnsBefore);

    await page.keyboard.press('Escape');
    await expect(page.getByTestId('nbs-examples-sheet')).toBeHidden({ timeout: 10_000 });
    await expect(
      page.locator('[data-testid^="cbo-option-"][data-option-label="Gestão de Águas Pluviais"]'),
      'the question must survive a trip to the cases',
    ).toBeVisible();

    // …and answering still works afterwards.
    await page.locator('[data-testid^="cbo-option-"][data-option-label="Gestão de Águas Pluviais"]').click();
    await expect.poll(async () =>
      (await (await request.get(`/api/cbo/${cboId}/messages`)).json()).length,
      { timeout: 20_000 }).toBeGreaterThan(turnsBefore);
  });

  test('the control is absent on questions that are not a choice', async ({ page, request }) => {
    test.setTimeout(120_000);
    const api = new TestApi(request);
    test.skip(!(await api.ping()).fakeModel, 'needs the fake model');

    await page.goto('/cbo-profile');
    const marker = page.getByTestId('cbo-stream-status');
    await expect(marker).toHaveAttribute('data-cbo-id', /.+/, { timeout: 30_000 });
    const cboId = (await marker.getAttribute('data-cbo-id'))!;

    await api.scriptCbo(cboId, [[
      { op: 'ask_user', question: 'Vocês atuam em um bairro só?', options: [
        { label: 'Um bairro', description: 'só um' },
        { label: 'Mais de um', description: 'vários' },
      ] } as any,
    ]]);
    await page.getByTestId('cbo-chat-input').fill('oi');
    await page.getByTestId('cbo-chat-input').press('Enter');

    await expect(page.locator('[data-testid^="cbo-option-"][data-option-label="Um bairro"]'))
      .toBeVisible({ timeout: 30_000 });
    // Offering cases beside "how many bairros?" would be noise.
    await expect(page.getByTestId('cbo-show-examples')).toHaveCount(0);
  });

  test('theirs first, but nothing is filtered out', () => {
    const all = NBS_SHOWCASE_CARDS;
    const ordered = orderShowcaseCardsFor(all, ['heat']);
    // Every case stays reachable — the ranking that would filter runs on bairro
    // averages, not their site, and the flow promises nada fica descartado.
    expect(ordered).toHaveLength(all.length);
    expect(new Set(ordered.map(c => c.id))).toEqual(new Set(all.map(c => c.id)));
    expect(ordered[0].hazard).toBe('heat');
    // `mixed` speaks to their hazard among others — between theirs and the rest.
    const firstOther = ordered.findIndex(c => c.hazard !== 'heat' && c.hazard !== 'mixed');
    const firstMixed = ordered.findIndex(c => c.hazard === 'mixed');
    if (firstMixed >= 0 && firstOther >= 0) expect(firstMixed).toBeLessThan(firstOther);
    // No worry named yet → catalogue order, untouched.
    expect(orderShowcaseCardsFor(all, []).map(c => c.id)).toEqual(all.map(c => c.id));
  });
});

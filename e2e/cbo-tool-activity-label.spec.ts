import { test, expect } from '@playwright/test';
import { TestApi } from './helpers/testApi';

// Field report 2026-07 — while the agent works, users only ever saw a generic
// "Processando…" and couldn't tell it was e.g. reading their website. The
// agent now emits 'thinking_step' events when a tool starts and the working
// indicator shows that label live. Ephemeral by design: the label must vanish
// as soon as text streams / the turn ends, and never leak into the next turn.

test('working indicator shows the live tool label, then falls back to generic', async ({ page, request }) => {
  const api = new TestApi(request);
  test.skip(!(await api.ping()).fakeModel, 'CBO_FAKE_MODEL not enabled on target.');

  await page.goto('/cbo-profile');
  const marker = page.getByTestId('cbo-stream-status');
  await expect(marker).toHaveAttribute('data-cbo-id', /.+/);
  const cboId = (await marker.getAttribute('data-cbo-id'))!;

  await api.scriptCbo(cboId, [
    // Turn 1: a tool label held visible by a thinking gap, then a reply.
    [
      { op: 'thinking_step', label: 'Lendo vilaflores.org…' },
      { op: 'wait', ms: 2000 },
      { op: 'say', text: 'Li o site, ficou ótimo.' },
      { op: 'ask_user', question: 'Seguimos?', options: [{ label: 'Sim' }, { label: 'Ainda não' }] },
    ],
    // Turn 2: no tool step — the indicator must be back to the generic label.
    [
      { op: 'wait', ms: 2000 },
      { op: 'say', text: 'Beleza.' },
    ],
  ]);

  const input = page.getByTestId('cbo-chat-input');
  const workingLabel = page.getByTestId('cbo-working-label');

  await input.fill('manda ver');
  await input.press('Enter');
  // While the (fake) tool runs, the indicator narrates it…
  await expect(workingLabel).toHaveText('Lendo vilaflores.org…', { timeout: 10_000 });
  // …and once the turn lands, the reply is there and the indicator is gone.
  await expect(page.getByText('Li o site, ficou ótimo.')).toBeVisible({ timeout: 10_000 });
  await expect(workingLabel).not.toBeVisible();

  // Next turn: the old tool label must NOT leak into the generic indicator.
  await input.fill('e agora?');
  await input.press('Enter');
  await expect(workingLabel).toBeVisible({ timeout: 10_000 });
  await expect(workingLabel).not.toHaveText('Lendo vilaflores.org…');
  await expect(page.getByText('Beleza.')).toBeVisible({ timeout: 10_000 });
});

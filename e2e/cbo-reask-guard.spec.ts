import { test, expect } from '@playwright/test';
import { TestApi } from './helpers/testApi';

// Re-ask guard (COUGAR Perfect Demo, 2026-07-14): the live model asked "How is
// your team structured?" again immediately after the user had answered it —
// ask_user carries no field id, so nothing stopped a duplicate. The guard
// infers the target enum field from the chip labels and drops the question
// when that field is already answered; `allowReask: true` (reserved for a
// user-requested change) bypasses it. The fake model mirrors the real guard's
// logic (shared enumFieldsMatchingOptions + the same filled check).

test.describe('COUGAR — answered chip questions are not re-asked', () => {
  test.use({ locale: 'pt-BR' });

  test('a duplicate of an answered field is dropped; allowReask shows it', async ({ page, request }) => {
    const api = new TestApi(request);
    const ping = await api.ping();
    test.skip(!ping.fakeModel, 'CBO_FAKE_MODEL is not enabled on the target — skipping deterministic spec.');

    await page.goto('/cbo-profile');
    const marker = page.getByTestId('cbo-stream-status');
    await expect(marker).toHaveAttribute('data-cbo-id', /.+/);
    const cboId = (await marker.getAttribute('data-cbo-id'))!;

    const teamChips = [
      { label: 'Todas voluntárias' },
      { label: 'Maioria voluntárias' },
      { label: 'Metade e metade' },
      { label: 'Maioria pagas' },
      { label: 'Todas pagas' },
    ];

    await api.scriptCbo(cboId, [
      // Turn 1 — the answer is stored, then the (misbehaving) agent re-asks the
      // exact same field: the duplicate must be dropped, and only the follow-up
      // question about an UNANSWERED field (year_founded) may render.
      [
        { op: 'update_section', sectionId: 'org_profile', field: 'paid_vs_volunteer', value: 'Maioria pagas' },
        { op: 'say', text: 'Anotei a estrutura da equipe.' },
        { op: 'ask_user', question: 'Como é a estrutura da equipe?', options: teamChips },
        { op: 'ask_user', question: 'Há quanto tempo a organização existe?', options: [{ label: '2 a 5 anos' }, { label: 'Mais de 10 anos' }] },
      ],
      // Turn 2 — the user asked to CHANGE the answer: allowReask renders the
      // same chips again.
      [
        { op: 'say', text: 'Claro, vamos ajustar.' },
        { op: 'ask_user', question: 'Como é a estrutura da equipe?', options: teamChips, allowReask: true },
      ],
    ]);

    const input = page.getByTestId('cbo-chat-input');
    await input.fill('maioria pagas');
    await input.press('Enter');
    await expect(marker).toHaveAttribute('data-streaming', 'false');

    // The unanswered follow-up shows; the duplicate never renders.
    await expect(page.getByText('Há quanto tempo a organização existe?')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText('Como é a estrutura da equipe?')).toHaveCount(0);

    // Answer the visible question so the composer clears, then request a change.
    await page.getByText('2 a 5 anos', { exact: false }).first().click();
    await expect(marker).toHaveAttribute('data-turns', '2');

    // allowReask (the deliberate change flow) does render the answered field.
    await expect(page.getByText('Como é a estrutura da equipe?')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText('Todas voluntárias').first()).toBeVisible();
  });
});

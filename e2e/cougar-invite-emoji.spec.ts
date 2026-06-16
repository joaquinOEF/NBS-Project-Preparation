import { test, expect } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { TestApi } from './helpers/testApi';

// Task #5 (revised) — the 👋 wave kept rendering as a replacement char (�) in
// real WhatsApp delivery despite the source code-point being correct, so it was
// REMOVED. The invite greeting must now contain neither the emoji nor a
// replacement char.

test.describe('COUGAR #5 — invite greeting has no emoji', () => {
  test('the share preview has no wave emoji and no replacement char', async ({ page, request }) => {
    const ext = new TestApi(request);
    const { cohort } = await ext.createCohort('e2e emoji');
    const member = (await ext.inviteMember(cohort.id, { orgName: 'Org Wave', withSession: true })).member;

    const api = new TestApi(page.request);
    await api.createCoordinator({ email: `emoji-${randomUUID()}@e2e.test`, password: 'pw-123456', name: 'Emoji', cohortId: cohort.id });

    await page.goto('/orchestrator');
    const card = page.getByTestId(`card-orchestrator-project-${member.id}`);
    await expect(card).toBeVisible({ timeout: 20_000 });
    await card.click(); // opens the share-link dialog

    await page.getByText('Preview message', { exact: false }).click();
    await page.waitForTimeout(800);

    const txt = await page.getByRole('dialog').innerText();
    expect(txt, 'no wave emoji').not.toContain('\u{1F44B}');
    expect(txt, 'no replacement char').not.toContain('�');

    // And the real WhatsApp link carries a clean greeting (no emoji either).
    const decoded = decodeURIComponent(((await page.locator('a[href*="wa.me"]').first().getAttribute('href')) || '').split('text=')[1] || '');
    expect(decoded).toMatch(/^(Olá|Hi)!\n/);
    expect(decoded).not.toContain('\u{1F44B}');
  });
});

import { test, expect } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { TestApi } from './helpers/testApi';

// Task #5 — the invite preview message must render the 👋 wave, not a
// replacement char (�). The greeting is written with an explicit \u{1F44B}
// escape so no toolchain re-save can mangle it. This drives the real share
// dialog and asserts the rendered preview.

test.describe('COUGAR #5 — invite preview renders the wave emoji', () => {
  test('the share preview shows 👋, not a replacement char', async ({ page, request }) => {
    const ext = new TestApi(request);
    const { cohort } = await ext.createCohort('e2e emoji');
    const member = (await ext.inviteMember(cohort.id, { orgName: 'Org Wave', withSession: true })).member;

    // Auth the page as a coordinator scoped to this cohort.
    const api = new TestApi(page.request);
    await api.createCoordinator({ email: `emoji-${randomUUID()}@e2e.test`, password: 'pw-123456', name: 'Emoji', cohortId: cohort.id });

    await page.goto('/orchestrator');
    const card = page.getByTestId(`card-orchestrator-project-${member.id}`);
    await expect(card).toBeVisible({ timeout: 20_000 });
    await page.waitForTimeout(800);
    await card.click(); // opens the share-link dialog

    // Expand the message preview.
    await page.getByText('Preview message', { exact: false }).click();
    await page.waitForTimeout(1000);

    const dialog = page.getByRole('dialog');
    const txt = await dialog.innerText();
    expect(txt, 'preview should contain the wave emoji').toContain('\u{1F44B}');
    expect(txt, 'preview should NOT contain the replacement char').not.toContain('�');
    await page.waitForTimeout(1200); // hold for the video
  });
});

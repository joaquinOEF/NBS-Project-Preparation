import { test, expect } from '@playwright/test';
import { TestApi } from './helpers/testApi';

// Restart is irreversible (DELETE /api/cbo/:id). It must never fire from a
// single (mis)tap — a confirmation dialog guards it, Cancel is harmless, and
// only the explicit destructive action resets the session.

test.describe('CBO restart requires confirmation', () => {
  test('cancel keeps everything; confirm resets to a fresh session', async ({ page, request }) => {
    const api = new TestApi(request);
    test.skip(!(await api.ping()).fakeModel, 'needs the fake model');

    await page.goto('/cbo-profile');
    const marker = page.getByTestId('cbo-stream-status');
    await expect(marker).toHaveAttribute('data-cbo-id', /.+/, { timeout: 30_000 });
    const cboId = (await marker.getAttribute('data-cbo-id'))!;

    // Put real data into the session so loss would matter.
    await api.scriptCbo(cboId, [[
      { op: 'say', text: 'Anotado!' },
      { op: 'update_section', sectionId: 'org_profile', field: 'org_name', value: 'Horta do Beco' },
      { op: 'set_phase', phase: 1 },
      { op: 'ask_user', question: 'Seguimos?', options: [{ label: 'Sim' }] },
    ]]);
    await page.getByTestId('cbo-chat-input').fill('oi');
    await page.getByTestId('cbo-chat-input').press('Enter');
    await expect(marker).toHaveAttribute('data-org-name', 'Horta do Beco');

    // Tap restart → the dialog appears; NOTHING was deleted yet.
    await page.getByTestId('cbo-restart-trigger').click();
    await expect(page.getByTestId('cbo-restart-dialog')).toBeVisible();

    // Cancel → dialog closes, session + data intact.
    await page.getByTestId('cbo-restart-cancel').click();
    await expect(page.getByTestId('cbo-restart-dialog')).toHaveCount(0);
    await expect(marker).toHaveAttribute('data-org-name', 'Horta do Beco');
    await expect(marker).toHaveAttribute('data-cbo-id', cboId);

    // Restart again and CONFIRM → a fresh, empty session with a new id.
    await page.getByTestId('cbo-restart-trigger').click();
    await page.getByTestId('cbo-restart-confirm').click();
    await expect(marker).not.toHaveAttribute('data-cbo-id', cboId, { timeout: 15_000 });
    await expect(marker).not.toHaveAttribute('data-org-name', 'Horta do Beco');
  });
});

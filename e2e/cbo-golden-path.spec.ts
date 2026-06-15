import { test, expect } from '@playwright/test';
import { TestApi } from './helpers/testApi';

// Golden path: open the CBO flow as a user, drive ONE deterministic turn through
// the fake model, and assert the turn rendered + persisted + advanced phase —
// then prove it survives a reload. This is the end-to-end proof that the seam
// (PR 1) + the stream-complete contract (this PR) work together. Branch/scenario
// coverage comes in PR 3.

test.describe('CBO golden path (fake model)', () => {
  test('one scripted turn: chips render, field persists, phase advances, survives reload', async ({ page, request }) => {
    const api = new TestApi(request);

    // Precondition: the target must have the fake model on, or the live SDK
    // would run (non-deterministic). Skip loudly rather than flake.
    const ping = await api.ping();
    expect(ping.ok).toBeTruthy();
    test.skip(!ping.fakeModel, 'CBO_FAKE_MODEL is not enabled on the target — skipping deterministic spec.');

    // Open a fresh session. With no ?t= token the page creates its own CBO via
    // POST /api/cbo and writes the id to the hidden status marker.
    await page.goto('/cbo-profile');
    const marker = page.getByTestId('cbo-stream-status');
    await expect(marker).toHaveAttribute('data-cbo-id', /.+/);
    const cboId = (await marker.getAttribute('data-cbo-id'))!;
    expect(cboId).toBeTruthy();

    // Script the next agent turn deterministically: greet, persist the org name,
    // advance to phase 1, and ask a chip question.
    await api.scriptCbo(cboId, [
      [
        { op: 'say', text: 'Boa! Vamos registrar sua organização.' },
        { op: 'update_section', sectionId: 'org_profile', field: 'org_name', value: 'Horta Comunitária Cascata' },
        { op: 'set_phase', phase: 1 },
        { op: 'ask_user', question: 'Quantas pessoas fazem parte?', options: [{ label: '1–5' }, { label: '6–20' }] },
      ],
    ]);

    // Drive the turn — typing + Enter submits the composer form → sendMessage.
    const input = page.getByTestId('cbo-chat-input');
    await input.fill('Olá!');
    await input.press('Enter');

    // Wait for the turn to finish. SSE never goes network-idle, so we key off
    // the marker's attributes instead.
    await expect(marker).toHaveAttribute('data-turns', '1');
    await expect(marker).toHaveAttribute('data-streaming', 'false');

    // The agent's message rendered in chat.
    await expect(page.getByText('Vamos registrar sua organização', { exact: false })).toBeVisible();

    // The chip question rendered with the scripted options.
    await expect(page.getByTestId('cbo-question-card')).toBeVisible();
    await expect(page.getByTestId('cbo-option-0')).toHaveAttribute('data-option-label', '1–5');
    await expect(page.getByTestId('cbo-option-1')).toHaveAttribute('data-option-label', '6–20');

    // State propagated to the UI: org-name field filled, phase advanced.
    await expect(marker).toHaveAttribute('data-org-name', 'Horta Comunitária Cascata');
    await expect(marker).toHaveAttribute('data-phase', '1');

    // Resume: a reload rehydrates the same session and keeps the persisted field.
    await page.reload();
    await expect(page.getByTestId('cbo-stream-status')).toHaveAttribute('data-org-name', 'Horta Comunitária Cascata');
  });
});

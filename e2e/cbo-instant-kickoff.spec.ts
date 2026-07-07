import { test, expect } from '@playwright/test';
import { TestApi } from './helpers/testApi';

// W1 latency pack P2: turn 1 of E1 is deterministic, so /api/cbo/:id/kickoff
// serves it from a template with ZERO model time. The greeting must appear
// near-instantly, carry the invite prefill (org name), persist as a normal
// transcript message (reload-safe), and fire only on a virgin transcript.

test.describe('CBO — instant templated kickoff', () => {
  test.use({ locale: 'pt-BR' });

  test('cohort invite: greeting is instant, carries the org name, survives reload', async ({ page, request }) => {
    const api = new TestApi(request);
    test.skip(!(await api.ping()).fakeModel, 'needs the fake model');

    const { cohort } = await api.createCohort('e2e instant-kickoff');
    const m = await api.inviteMember(cohort.id, { orgName: 'Horta do Beco', neighborhood: 'Cascata' });

    await page.goto(m.inviteUrl);
    const t0 = Date.now();
    await page.getByTestId('button-cbo-welcome-cta').click({ timeout: 30_000 });
    const pre = page.getByTestId('button-encontro-1-start');
    if (await pre.isVisible({ timeout: 8_000 }).catch(() => false)) await pre.click();

    // The templated greeting: org name + the name/role question, fast.
    await expect(page.getByText('Horta do Beco', { exact: false }).first()).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText('com quem eu tô falando', { exact: false })).toBeVisible();
    // Sanity: this arrived in UI-time, not model-time (generous CI bound; a
    // model turn is 6-17s + the fake path would need a scripted turn anyway).
    expect(Date.now() - t0).toBeLessThan(9_000);

    // Persisted: a reload still shows the greeting (it's a transcript message).
    await page.reload();
    // isVisible() doesn't wait — use waiting clicks with a tolerant catch.
    await page.getByTestId('button-cbo-welcome-cta').click({ timeout: 15_000 }).catch(() => {});
    await page.getByTestId('button-encontro-1-start').click({ timeout: 5_000 }).catch(() => {});
    await expect(page.getByText('com quem eu tô falando', { exact: false })).toBeVisible({ timeout: 20_000 });

    // Virgin-only: calling it again no-ops.
    const marker = page.getByTestId('cbo-stream-status');
    await expect(marker).toHaveAttribute('data-cbo-id', /.+/);
    const cboId = (await marker.getAttribute('data-cbo-id'))!;
    const second = await page.evaluate(async (id) => {
      const r = await fetch(`/api/cbo/${id}/kickoff`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ lang: 'pt' }) });
      return r.json();
    }, cboId);
    expect(second.ok).toBe(false);

    // And the user's first answer flows into a normal (scripted) model turn.
    await api.scriptCbo(cboId, [[
      { op: 'update_section', sectionId: 'org_profile', field: 'contact_name', value: 'Maria' },
      { op: 'say', text: 'Anotado.' },
      { op: 'ask_user', question: 'O que vocês fazem?', options: [{ label: 'Hortas' }, { label: 'Educação ambiental' }] },
    ]]);
    const input = page.getByTestId('cbo-chat-input');
    await input.fill('Maria, coordenadora');
    await input.press('Enter');
    await expect(page.getByTestId('cbo-question-card')).toBeVisible({ timeout: 20_000 });
  });
});

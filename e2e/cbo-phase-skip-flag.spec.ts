import { test, expect } from '@playwright/test';
import { TestApi } from './helpers/testApi';

// The skip-to-phase demo tool ([SKIP TO phase:X] via clickable progress-bar
// segments) overwrites earlier sections with CEA Bom Jesus sample data and
// renames the org — it must be dead unless ENABLE_PHASE_SKIP=1 (a flag the
// prod Deployment never sets, same family as ENABLE_TEST_ROUTES). The e2e
// dev server does NOT set it, so this suite runs in the prod-default shape:
// segments are inert indicators and even TYPING the magic string is blocked
// server-side before it can touch the model or the state.

test.describe('COUGAR — phase skipping is dead without ENABLE_PHASE_SKIP', () => {
  test('segments are not buttons; a typed [SKIP TO] is blocked server-side', async ({ page, request }) => {
    const api = new TestApi(request);
    test.skip(!(await api.ping()).fakeModel, 'CBO_FAKE_MODEL not enabled on target.');

    await page.goto('/cbo-profile');
    const marker = page.getByTestId('cbo-stream-status');
    await expect(marker).toHaveAttribute('data-cbo-id', /.+/);
    const cboId = (await marker.getAttribute('data-cbo-id'))!;

    // The server reports the flag off, and the unlocked segment renders as a
    // plain indicator (a DIV), not a tap target.
    const info = await (await page.request.get(`/api/cbo/${cboId}`)).json();
    expect(info.phaseSkipEnabled).toBe(false);
    const seg = page.getByTestId('cbo-progress-unlocked-1');
    await expect(seg).toBeVisible();
    expect(await seg.evaluate(el => el.tagName)).toBe('DIV');

    // Even typing the magic string is intercepted before model/state: the org
    // name is not replaced by the sample org and the phase does not jump.
    const input = page.getByTestId('cbo-chat-input');
    await input.fill('[SKIP TO phase:4]');
    await input.press('Enter');
    await expect(page.getByText(/atalho de demonstração está desativado|demo shortcut is disabled/)).toBeVisible({ timeout: 15_000 });

    const after = (await (await page.request.get(`/api/cbo/${cboId}`)).json()).state;
    expect(after.orgName, 'sample org must never be stamped in').not.toBe('CEA Bom Jesus');
    expect(after.phase, 'phase must not jump').toBeLessThanOrEqual(1);
    const fields = after.sections?.org_profile?.fields ?? {};
    expect(fields.contact_name?.value ?? '').not.toBe('Maria Santos');
  });
});

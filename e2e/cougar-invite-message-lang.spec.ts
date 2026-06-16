import { test, expect } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { TestApi } from './helpers/testApi';

// The invite message should follow the FORCED cohort language, not the
// coordinator's browser — so "set PT" gives the org a PT message AND a PT page.
// Here the coordinator's browser is English; the cohort is forced to PT.
test.use({ locale: 'en-US' });

test.describe('COUGAR — invite message follows cohort language', () => {
  test('EN-browser coordinator + PT cohort → the invite message is Portuguese', async ({ page, request }) => {
    const api = new TestApi(page.request);
    await api.createCoordinator({ email: `iml-${randomUUID()}@e2e.test`, password: 'iml-pass-1', name: 'IML' }); // admin

    // Force the cohort to PT.
    await page.request.patch('/api/cohort/default/language', { data: { language: 'pt' } });
    const mine = await (await page.request.get('/api/cohort/mine')).json();
    const member = (await new TestApi(request).inviteMember(mine.cohort.id, { orgName: 'Org Msg', withSession: true })).member;

    await page.goto('/orchestrator');
    const card = page.getByTestId(`card-orchestrator-project-${member.id}`);
    await expect(card).toBeVisible({ timeout: 20_000 });
    await card.click(); // share dialog

    const decoded = decodeURIComponent(((await page.locator('a[href*="wa.me"]').first().getAttribute('href')) || '').split('text=')[1] || '');
    // Portuguese greeting despite the en-US browser, because the cohort is PT.
    expect(decoded.startsWith('Olá'), `expected PT message, got: ${decoded.slice(0, 20)}`).toBeTruthy();
    expect(decoded).toContain('Este é o link da plataforma');
  });
});

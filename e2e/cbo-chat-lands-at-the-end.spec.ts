import { test, expect } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { TestApi } from './helpers/testApi';

// ⚠️ OPENS AT THE TOP. A returning organisation landed at the START of its
// transcript — the beginning of Encontro 2, weeks of conversation above the
// live question — and had to scroll to find where it actually was.
//
// The auto-scroll effect existed; it just watched the wrong thing. Messages
// load while the org is still on the welcome screen, so it fired once against
// an unmounted thread and never ran again, because entering the chat changes
// nothing it depended on.

test.describe('opening a returning session', () => {
  test.use({ locale: 'pt-BR' });

  const longThread = (n: number) =>
    Array.from({ length: n }, (_, i) => [{ op: 'say', text: `Mensagem ${i + 1} de ${n}. ${'Conversa anterior. '.repeat(6)}` }]);

  test('lands at the end of the thread, not the beginning', async ({ page, request }) => {
    const api = new TestApi(request);
    test.skip(!(await api.ping()).fakeModel, 'needs the fake model');
    const cohort = (await api.createCohort(`Scroll ${randomUUID().slice(0, 6)}`)).cohort;
    await api.createCoordinator({ email: `scroll-${randomUUID()}@e2e.test`, password: 'pw-123456', cohortId: cohort.id });
    const m = (await api.inviteMember(cohort.id, { orgName: 'Voltando', neighborhood: 'Azenha', withSession: true })).member;
    await api.seedState(m.cboStateId, {
      phase: 2, language: 'pt',
      sections: [{ sectionId: 'intervention_site', field: 'bairro', value: 'Azenha' }],
    });

    // A transcript long enough that top and bottom cannot both be on screen.
    await request.post(`/__test/cbo/${m.cboStateId}/script`, { data: { turns: longThread(20) } });
    await page.goto(`/cbo-profile?t=${m.capabilityToken}`);
    const cta = page.getByTestId('button-cbo-welcome-cta');
    await expect(cta).toBeVisible({ timeout: 30_000 });
    await cta.click();
    // The Encontro 2 preamble sits between the welcome and the thread for an
    // org that has not closed the encontro — which this one has not, by design.
    // (It used to be skipped here because `phaseComplete` counted one answered
    // field as a finished encontro; `encontroClosed` no longer does.)
    const preamble = page.getByTestId('button-encontro-2-start');
    await preamble.waitFor({ state: 'visible', timeout: 15_000 }).catch(() => {});
    if (await preamble.isVisible().catch(() => false)) await preamble.click();
    const input = page.getByTestId('cbo-chat-input');
    await expect(input).toBeVisible({ timeout: 30_000 });
    for (let i = 0; i < 20; i++) {
      await input.fill(`oi ${i}`);
      await input.press('Enter');
      await page.waitForTimeout(120);
    }
    const thread = page.getByTestId('cbo-chat-thread');
    await expect.poll(async () => thread.evaluate((el: any) => el.scrollHeight > el.clientHeight + 200), { timeout: 20_000 }).toBe(true);

    // Re-open it cold, the way an organisation comes back to its own link.
    await page.reload();
    const back = page.getByTestId('button-cbo-welcome-cta');
    await back.waitFor({ state: 'visible', timeout: 20_000 }).catch(() => {});
    if (await back.isVisible().catch(() => false)) await back.click();
    await expect(page.getByTestId('cbo-chat-thread')).toBeVisible({ timeout: 30_000 });

    // At the end: the distance left to scroll is a screen's worth of nothing.
    await expect
      .poll(async () => page.getByTestId('cbo-chat-thread').evaluate(
        (el: any) => el.scrollHeight - el.scrollTop - el.clientHeight,
      ), { timeout: 20_000 })
      .toBeLessThan(120);
  });

  test('reading further up is not interrupted — a pill offers the jump instead', async ({ page, request }) => {
    const api = new TestApi(request);
    test.skip(!(await api.ping()).fakeModel, 'needs the fake model');
    const cohort = (await api.createCohort(`Pill ${randomUUID().slice(0, 6)}`)).cohort;
    await api.createCoordinator({ email: `pill-${randomUUID()}@e2e.test`, password: 'pw-123456', cohortId: cohort.id });
    const m = (await api.inviteMember(cohort.id, { orgName: 'Lendo', neighborhood: 'Azenha', withSession: true })).member;
    await api.seedState(m.cboStateId, {
      phase: 2, language: 'pt',
      sections: [{ sectionId: 'intervention_site', field: 'bairro', value: 'Azenha' }],
    });
    await request.post(`/__test/cbo/${m.cboStateId}/script`, {
      data: { turns: [...longThread(14), [{ op: 'say', text: 'Uma resposta nova que chega enquanto eles leem.' }]] },
    });

    await page.goto(`/cbo-profile?t=${m.capabilityToken}`);
    const cta = page.getByTestId('button-cbo-welcome-cta');
    await expect(cta).toBeVisible({ timeout: 30_000 });
    await cta.click();
    // The Encontro 2 preamble sits between the welcome and the thread for an
    // org that has not closed the encontro — which this one has not, by design.
    // (It used to be skipped here because `phaseComplete` counted one answered
    // field as a finished encontro; `encontroClosed` no longer does.)
    const preamble = page.getByTestId('button-encontro-2-start');
    await preamble.waitFor({ state: 'visible', timeout: 15_000 }).catch(() => {});
    if (await preamble.isVisible().catch(() => false)) await preamble.click();
    const input = page.getByTestId('cbo-chat-input');
    await expect(input).toBeVisible({ timeout: 30_000 });
    for (let i = 0; i < 14; i++) {
      await input.fill(`oi ${i}`);
      await input.press('Enter');
      await page.waitForTimeout(120);
    }

    const thread = page.getByTestId('cbo-chat-thread');
    await expect.poll(async () => thread.evaluate((el: any) => el.scrollHeight > el.clientHeight + 300), { timeout: 20_000 }).toBe(true);

    // They scroll up to re-read something.
    await thread.evaluate((el: any) => { el.scrollTop = 0; el.dispatchEvent(new Event('scroll')); });
    const top = await thread.evaluate((el: any) => el.scrollTop);

    // A new message arrives.
    await input.fill('mais uma');
    await input.press('Enter');

    // The view stays where they left it, and the way back is offered.
    await expect(page.getByTestId('button-jump-to-latest')).toBeVisible({ timeout: 20_000 });
    expect(await thread.evaluate((el: any) => el.scrollTop), 'the view did not jump').toBeLessThan(top + 200);

    await page.getByTestId('button-jump-to-latest').click();
    await expect
      .poll(async () => thread.evaluate((el: any) => el.scrollHeight - el.scrollTop - el.clientHeight), { timeout: 15_000 })
      .toBeLessThan(120);
    await expect(page.getByTestId('button-jump-to-latest')).toHaveCount(0);
  });
});

import { test, expect } from '@playwright/test';
import { TestApi } from './helpers/testApi';

// Field report 2026-07 — "Intro page (before entering the chat) is not
// scrolling so in the PC view you can not completely see the button to
// continue." Root cause: the chat shell's document scroll-lock (html/body
// overflow:hidden, needed to pin the composer on mobile) ran unconditionally,
// including while the welcome/preamble screens were up — and those screens
// have no inner scroller of their own. The fix scopes the lock to the chat
// shell. NOTE: we assert on computed styles + real scrolling, not on clicking
// the CTA — Playwright's click auto-scrolls via scrollIntoView, which works
// even inside overflow:hidden and would mask the bug.

test.use({ viewport: { width: 1280, height: 420 } }); // short desktop window → CTA below the fold

test.describe('COUGAR — pre-chat screens scroll on desktop', () => {
  test('welcome screen scrolls; the lock re-engages once the chat shell shows', async ({ page, request }) => {
    const api = new TestApi(request);
    const { cohort } = await api.createCohort('e2e welcome-scroll');
    const invited = await api.inviteMember(cohort.id, { orgName: 'Org Rolagem' });

    await page.goto(invited.inviteUrl);
    const cta = page.getByTestId('button-cbo-welcome-cta');
    await expect(cta).toBeAttached({ timeout: 30_000 });

    // The document must NOT be scroll-locked while the welcome screen is up.
    const overflows = () => page.evaluate(() => ({
      html: getComputedStyle(document.documentElement).overflow,
      body: getComputedStyle(document.body).overflow,
    }));
    expect(await overflows()).not.toMatchObject({ body: 'hidden' });

    // And scrolling actually works — the welcome content overflows this short
    // viewport, so a user-style scroll must move the page (reach the CTA).
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    expect(await page.evaluate(() => window.scrollY), 'welcome page must scroll on a short desktop viewport').toBeGreaterThan(0);
    await expect(cta).toBeInViewport();

    await cta.click();

    // The preamble (if shown) is also pre-chat → still unlocked.
    const pre = page.getByTestId('button-encontro-1-start');
    if (await pre.isVisible({ timeout: 8_000 }).catch(() => false)) {
      expect((await overflows()).body, 'preamble must also keep document scroll').not.toBe('hidden');
      await pre.click();
    }

    // Chat shell up → the mobile pin-the-composer lock re-engages.
    const marker = page.getByTestId('cbo-stream-status');
    await expect(marker).toHaveAttribute('data-cbo-id', /.+/, { timeout: 30_000 });
    await expect.poll(async () => (await overflows()).body, { timeout: 10_000 }).toBe('hidden');
  });
});

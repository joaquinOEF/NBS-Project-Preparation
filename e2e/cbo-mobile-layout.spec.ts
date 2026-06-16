import { test, expect } from '@playwright/test';
import { TestApi } from './helpers/testApi';

// Mobile layout harness for the CBO chat — runs in the `webkit-mobile` project
// (WebKit at an iPhone viewport), the closest headless stand-in for the iOS
// Safari the CBOs actually use. It guards the structural invariants that kept
// breaking on real iPhones:
//   • exactly ONE composer + ONE bottom tab bar (no doubling / ghosting),
//   • the bottom tab bar is pinned to the bottom of the viewport,
//   • the page itself does not scroll (only the inner message list does) —
//     so the bottom bar can't slide as the chat scrolls,
//   • no horizontal overflow (nothing shoved off the right edge),
//   • the composer input stays within the viewport.
//
// What it CANNOT reproduce: the purely dynamic iOS chrome (address-bar collapse
// on scroll) — that still needs a real device. But the gross breakage (doubled
// bars, black gaps from a too-short shell, h-overflow) shows up here.

test.describe('CBO mobile layout @mobile', () => {
  test('single composer + bottom bar, pinned to the bottom, no page scroll, no h-overflow', async ({ page }) => {
    await page.goto('/cbo-profile');
    const marker = page.getByTestId('cbo-stream-status');
    await expect(marker).toHaveAttribute('data-cbo-id', /.+/);

    const vw = page.viewportSize()!.width;
    const vh = page.viewportSize()!.height;

    // Exactly one mobile tab bar + one composer (no ghost/duplicate render).
    await expect(page.getByTestId('mobile-tab-chat')).toHaveCount(1);
    await expect(page.getByTestId('mobile-tab-perfil')).toHaveCount(1);
    await expect(page.getByTestId('cbo-chat-input')).toHaveCount(1);

    // No horizontal overflow anywhere.
    const widths = await page.evaluate(() => ({
      docScroll: document.documentElement.scrollWidth,
      docClient: document.documentElement.clientWidth,
      bodyScroll: document.body.scrollWidth,
    }));
    expect(widths.docScroll, 'document should not overflow horizontally').toBeLessThanOrEqual(widths.docClient + 1);
    expect(widths.bodyScroll).toBeLessThanOrEqual(vw + 1);

    // The bottom tab bar sits flush at the bottom of the viewport.
    const navBox = (await page.getByTestId('mobile-tab-chat').boundingBox())!;
    expect(navBox, 'mobile tab bar should have a box').toBeTruthy();
    expect(navBox.y + navBox.height, 'tab bar bottom should reach the viewport bottom').toBeGreaterThan(vh - 8);
    expect(navBox.y + navBox.height).toBeLessThanOrEqual(vh + 1);

    // The composer input is visible within the viewport.
    await expect(page.getByTestId('cbo-chat-input')).toBeInViewport();

    // The PAGE itself must not scroll — only the inner message list does (the
    // document is locked, so the browser chrome can't move the bottom bar). Try
    // to force a document scroll; it must stay at 0 and the bar must not move.
    const navBefore = navBox.y;
    await page.evaluate(() => {
      window.scrollTo(0, 1000);
      document.documentElement.scrollTop = 1000;
      document.body.scrollTop = 1000;
    });
    await page.waitForTimeout(100);
    const pageScrolled = await page.evaluate(() => ({
      win: window.scrollY,
      html: document.documentElement.scrollTop,
      body: document.body.scrollTop,
    }));
    expect(pageScrolled.win, 'the page (window) must not scroll').toBe(0);
    expect(pageScrolled.html, 'html must not scroll').toBe(0);
    expect(pageScrolled.body, 'body must not scroll').toBe(0);
    const navAfter = (await page.getByTestId('mobile-tab-chat').boundingBox())!;
    expect(Math.abs(navAfter.y - navBefore), 'bottom bar must stay pinned').toBeLessThanOrEqual(1);
  });

  // The real complaint was on the QUESTION screen — chips getting pushed up /
  // hidden by a gap. Drive a scripted turn so a question card with chips renders,
  // then assert the chips + composer are visible above the pinned bottom bar.
  test('with an active question, chips + composer stay visible above the pinned bar', async ({ page, request }) => {
    const api = new TestApi(request);
    const ping = await api.ping();
    test.skip(!ping.fakeModel, 'CBO_FAKE_MODEL is not enabled on the target — skipping.');

    await page.goto('/cbo-profile');
    const marker = page.getByTestId('cbo-stream-status');
    await expect(marker).toHaveAttribute('data-cbo-id', /.+/);
    const cboId = (await marker.getAttribute('data-cbo-id'))!;
    const vh = page.viewportSize()!.height;

    await api.scriptCbo(cboId, [[
      { op: 'say', text: 'Boa! Vamos começar.' },
      { op: 'set_phase', phase: 1 },
      { op: 'ask_user', question: 'O que vocês fazem?', options: [
        { label: 'Hortas e segurança alimentar' }, { label: 'Arborização e áreas verdes' },
        { label: 'Resiliência climática' }, { label: 'Educação ambiental' },
      ] },
    ]]);
    await page.getByTestId('cbo-chat-input').fill('Olá!');
    await page.getByTestId('cbo-chat-input').press('Enter');
    await expect(marker).toHaveAttribute('data-turns', '1');

    // The question card + its chips render and sit within the viewport (not
    // pushed off-screen by a gap), and the bottom bar is still flush.
    await expect(page.getByTestId('cbo-question-card')).toBeVisible();
    await expect(page.getByTestId('cbo-option-0')).toBeInViewport();
    await expect(page.getByTestId('cbo-chat-input')).toBeInViewport();

    const navBox = (await page.getByTestId('mobile-tab-chat').boundingBox())!;
    expect(navBox.y + navBox.height, 'bottom bar flush with content present').toBeGreaterThan(vh - 8);
    expect(navBox.y + navBox.height).toBeLessThanOrEqual(vh + 1);

    const w = await page.evaluate(() => ({ s: document.documentElement.scrollWidth, c: document.documentElement.clientWidth }));
    expect(w.s, 'no h-overflow with content present').toBeLessThanOrEqual(w.c + 1);
  });
});

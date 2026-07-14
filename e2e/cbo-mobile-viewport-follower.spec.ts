import { test, expect } from '@playwright/test';

// The chat shell must FOLLOW the visual viewport, not just match its height
// (field report 2026-07-15: iOS scrolls the visual viewport down when the
// keyboard opens — visualViewport.offsetTop > 0 — and a top-anchored shell
// leaves dead space below the tab bar that grows while typing and survives
// keyboard dismissal). Playwright can't summon a real keyboard, so this stubs
// window.visualViewport before the app boots and drives it like iOS does,
// asserting the two CSS variables and the shell's actual box react.
// Mechanism + invariants: docs/mobile-viewport.md.

test.describe('COUGAR — chat shell follows the visual viewport', () => {
  test.use({ viewport: { width: 390, height: 844 }, locale: 'pt-BR' });

  test('height + translate track a keyboard-style resize/offset and recover', async ({ page }) => {
    await page.addInitScript(() => {
      const listeners: Record<string, Set<() => void>> = {};
      const vv = {
        width: 390,
        height: 844,
        offsetTop: 0,
        offsetLeft: 0,
        pageTop: 0,
        pageLeft: 0,
        scale: 1,
        addEventListener(t: string, fn: () => void) { (listeners[t] ??= new Set()).add(fn); },
        removeEventListener(t: string, fn: () => void) { listeners[t]?.delete(fn); },
        // Test seam: mutate + fire, the way an iOS keyboard open/close does.
        __set(height: number, offsetTop: number) {
          this.height = height;
          this.offsetTop = offsetTop;
          listeners['resize']?.forEach(fn => fn());
          listeners['scroll']?.forEach(fn => fn());
        },
      };
      Object.defineProperty(window, 'visualViewport', { value: vv, configurable: true });
    });

    await page.goto('/cbo-profile');
    const shell = page.getByTestId('cbo-shell');
    await expect(shell).toBeVisible();

    // Baseline: shell fills the stubbed viewport, no translate.
    await expect.poll(async () => (await shell.boundingBox())!.height).toBe(844);
    expect((await shell.boundingBox())!.y).toBe(0);

    // "Keyboard opens": visible area shrinks to 500px and iOS scrolls the
    // visual viewport down by 300px. The shell must shrink AND move down —
    // its box exactly covering [300, 800].
    await page.evaluate(() => (window.visualViewport as any).__set(500, 300));
    await expect.poll(async () => (await shell.boundingBox())!.height).toBe(500);
    await expect.poll(async () => (await shell.boundingBox())!.y).toBe(300);

    // "Keyboard closes" (iOS restores): shell recovers the full area with no
    // residual offset — the dead-space-below-the-tab-bar regression.
    await page.evaluate(() => (window.visualViewport as any).__set(844, 0));
    await expect.poll(async () => (await shell.boundingBox())!.height).toBe(844);
    await expect.poll(async () => (await shell.boundingBox())!.y).toBe(0);

    // The variables the layout runs on are what the handler wrote.
    const vars = await page.evaluate(() => ({
      vh: document.documentElement.style.getPropertyValue('--cbo-vh'),
      top: document.documentElement.style.getPropertyValue('--cbo-vv-top'),
    }));
    expect(vars.vh).toBe('844px');
    expect(vars.top).toBe('0px');
  });
});

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

    // "Keyboard opens": the composer is FOCUSED (the only way a keyboard
    // opens), the visible area shrinks to 500px and iOS scrolls the visual
    // viewport down by 300px. The shell must shrink AND move down — its box
    // exactly covering [300, 800]. (Focus matters: an unfocused page with a
    // small vv is treated as a stale report and clamped, below.)
    await page.getByTestId('cbo-chat-input').focus();
    await page.evaluate(() => (window.visualViewport as any).__set(500, 300));
    await expect.poll(async () => (await shell.boundingBox())!.height).toBe(500);
    await expect.poll(async () => (await shell.boundingBox())!.y).toBe(300);

    // "Keyboard closes" the honest way (iOS restores the values): shell
    // recovers the full area with no residual offset.
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

  test('a STALE keyboard dismissal (no vv event, values stuck small) still recovers on blur', async ({ page }) => {
    // Field report 2026-07-15 round 2: fine at session start, short shell +
    // dead space after the first typed turn. iOS dismissed the keyboard but
    // visualViewport kept reporting the keyboard-sized height and fired NO
    // further event (iOS 26 regression). The recovery signal is focus: no
    // editable element focused ⇒ keyboard cannot be open ⇒ clamp to the
    // layout viewport.
    await page.addInitScript(() => {
      const listeners: Record<string, Set<() => void>> = {};
      const vv = {
        width: 390, height: 844, offsetTop: 0, offsetLeft: 0, pageTop: 0, pageLeft: 0, scale: 1,
        addEventListener(t: string, fn: () => void) { (listeners[t] ??= new Set()).add(fn); },
        removeEventListener(t: string, fn: () => void) { listeners[t]?.delete(fn); },
        __set(height: number, offsetTop: number) {
          this.height = height;
          this.offsetTop = offsetTop;
          listeners['resize']?.forEach(fn => fn());
          listeners['scroll']?.forEach(fn => fn());
        },
        // Mutate WITHOUT firing events — how the stale bug actually behaves.
        __setSilently(height: number, offsetTop: number) {
          this.height = height;
          this.offsetTop = offsetTop;
        },
      };
      Object.defineProperty(window, 'visualViewport', { value: vv, configurable: true });
    });

    await page.goto('/cbo-profile');
    const shell = page.getByTestId('cbo-shell');
    await expect(shell).toBeVisible();

    // Keyboard opens while the composer is focused.
    await page.getByTestId('cbo-chat-input').focus();
    await page.evaluate(() => (window.visualViewport as any).__set(500, 300));
    await expect.poll(async () => (await shell.boundingBox())!.height).toBe(500);

    // Keyboard dismisses but iOS lies: values stay small, NO event fires.
    // The blur alone must bring the shell back (focusout + settle timer).
    await page.evaluate(() => {
      (window.visualViewport as any).__setSilently(500, 300);
      (document.activeElement as HTMLElement | null)?.blur();
    });
    await expect.poll(async () => (await shell.boundingBox())!.height, { timeout: 3_000 }).toBe(844);
    await expect.poll(async () => (await shell.boundingBox())!.y).toBe(0);
  });

  // ── Round 3 (field report 2026-08-10) ────────────────────────────────────
  // The two tests above both passed while the bug was live on a real iPhone,
  // which is the point: they only covered failures the SHELL's own variables
  // could express. The screenshots showed something neither could produce —
  // the header scrolled off the top with no way back (the document is locked,
  // so the user cannot scroll to it) and an equal dead band under the tab bar.
  // That is a displaced shell, and a shell in normal flow is displaced by any
  // document scroll. Evidence: docs/evidence/mobile-2026-08-10-*.png.

  test('⚠️ a document scroll cannot displace the shell', async ({ page }) => {
    // The visual viewport is stubbed and SILENT here on purpose. Chromium
    // helpfully fires a visualViewport `scroll` event when the page scrolls,
    // which triggers a re-measure and hides the defect; iOS is exactly where
    // that event cannot be relied on. With no event to rescue it, the only
    // thing keeping the shell in place is that it is out of flow.
    await page.addInitScript(() => {
      const vv = {
        width: 390, height: 844, offsetTop: 0, offsetLeft: 0, pageTop: 0, pageLeft: 0, scale: 1,
        addEventListener() {}, removeEventListener() {},
      };
      Object.defineProperty(window, 'visualViewport', { value: vv, configurable: true });
    });

    await page.goto('/cbo-profile');
    const shell = page.getByTestId('cbo-shell');
    await expect(shell).toBeVisible();
    await expect.poll(async () => (await shell.boundingBox())!.y).toBe(0);

    // iOS scroll-into-view moves the document even when we have locked it —
    // our lock is a request, not a guarantee. Simulate it winning: hand the
    // document real scrollable overflow and scroll it.
    const scrolled = await page.evaluate(() => {
      const spacer = document.createElement('div');
      spacer.id = 'probe-spacer';
      spacer.style.cssText = 'height:1200px';
      document.body.appendChild(spacer);
      document.documentElement.style.overflow = 'auto';
      document.body.style.overflow = 'auto';
      // The lock puts height:100% + overflow:hidden on html, body AND #root,
      // so BODY is the scroll box here — not the document. Scrolling `window`
      // is a no-op (scrollHeight never exceeds clientHeight) and an assertion
      // built on it passes without testing anything. Verified by probe.
      document.body.scrollTop = 240;
      return document.body.scrollTop;
    });
    expect(scrolled, 'the scroll container really moved').toBeGreaterThan(0);

    // A shell in flow would now be painted at y = -240: header gone, and an
    // equal dead band at the bottom. Fixed positioning makes the document's
    // scroll position irrelevant to where the shell lands.
    //
    // Measured with getBoundingClientRect INSIDE the page — that is
    // viewport-relative by definition. Playwright's boundingBox() does not
    // move with document scroll here, so it cannot see this defect at all.
    const shellTop = () => page.evaluate(
      () => document.querySelector('[data-testid="cbo-shell"]')!.getBoundingClientRect().top,
    );
    // Two independent things now have to go wrong for the user to see this:
    // the shell is out of flow, AND a stray document scroll gets reset. Assert
    // the end state — the shell's top edge is the top of the window — rather
    // than either mechanism, so a future change is free to drop one of them
    // as long as the guarantee holds.
    await expect.poll(shellTop, { timeout: 3_000 }).toBe(0);

    await page.evaluate(() => document.getElementById('probe-spacer')?.remove());
  });

  test('⚠️ the shell converges even when NO event ever fires', async ({ page }) => {
    // The self-healing property. Both earlier fixes assumed an event would
    // arrive to trigger a re-measure; the field report is a case where none
    // did. Here the viewport changes completely silently — no resize, no
    // scroll, no focus change — and the shell must still end up right.
    await page.addInitScript(() => {
      const listeners: Record<string, Set<() => void>> = {};
      const vv = {
        width: 390, height: 844, offsetTop: 0, offsetLeft: 0, pageTop: 0, pageLeft: 0, scale: 1,
        addEventListener(t: string, fn: () => void) { (listeners[t] ??= new Set()).add(fn); },
        removeEventListener(t: string, fn: () => void) { listeners[t]?.delete(fn); },
        __setSilently(height: number, offsetTop: number) {
          this.height = height;
          this.offsetTop = offsetTop;
        },
      };
      Object.defineProperty(window, 'visualViewport', { value: vv, configurable: true });
    });

    await page.goto('/cbo-profile');
    const shell = page.getByTestId('cbo-shell');
    await expect(shell).toBeVisible();

    // Focus first, so the focus-based clamp does NOT mask the change — this
    // has to be the heartbeat doing the work, not invariant 5b.
    await page.getByTestId('cbo-chat-input').focus();
    // …and wait out the 400ms post-focus settle re-measure. Without this pause
    // the settle timer picks the change up and the test proves nothing: it
    // passed against the unfixed code until the wait was added.
    await page.waitForTimeout(900);
    await page.evaluate(() => (window.visualViewport as any).__setSilently(500, 300));

    await expect
      .poll(async () => (await shell.boundingBox())!.height, { timeout: 5_000 })
      .toBe(500);
    expect((await shell.boundingBox())!.y).toBe(300);
  });

  test('⚠️ the header is never pushed above the top of the visible window', async ({ page }) => {
    // The symptom the user actually reported: "cant see the top section, cant
    // scroll further up than that". Whatever the viewport claims — including a
    // negative offset — the shell starts at or below the visible top, because
    // there is no recovery from a header the locked document cannot reach.
    await page.addInitScript(() => {
      const listeners: Record<string, Set<() => void>> = {};
      const vv = {
        width: 390, height: 844, offsetTop: 0, offsetLeft: 0, pageTop: 0, pageLeft: 0, scale: 1,
        addEventListener(t: string, fn: () => void) { (listeners[t] ??= new Set()).add(fn); },
        removeEventListener(t: string, fn: () => void) { listeners[t]?.delete(fn); },
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

    await page.getByTestId('cbo-chat-input').focus();
    await page.evaluate(() => (window.visualViewport as any).__set(600, -120));

    await expect
      .poll(async () => (await shell.boundingBox())!.y, { timeout: 3_000 })
      .toBe(0);
  });

  test('the shell stays out of document flow', async ({ page }) => {
    // Structural guard. The behavioural tests above all depend on this, and a
    // future refactor that quietly returns the shell to flow would reopen the
    // exact bug three field reports have now described.
    await page.goto('/cbo-profile');
    await expect(page.getByTestId('cbo-shell')).toBeVisible();
    const position = await page.evaluate(
      () => getComputedStyle(document.querySelector('[data-testid="cbo-shell"]')!).position,
    );
    expect(position).toBe('fixed');
  });
});

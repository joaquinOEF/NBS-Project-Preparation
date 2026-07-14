# Mobile viewport — why the layout breaks, and the invariants that keep it fixed

Audience: WhatsApp-invited community members on phones — **low-end Androids
and iPhones, often inside in-app browsers**. This page exists because the
"empty space at the bottom" bug has now been fixed twice (2026-07 desktop-pass
era: height only; 2026-07-15: scroll offset). Read this before touching any
full-height mobile layout so we never fix it a third time.

## The three viewports (the whole problem in one table)

| Thing | What it is | Keyboard opens → |
|---|---|---|
| **Layout viewport** (`100vh`, `window.innerHeight`-ish) | What CSS lays out against | iOS: UNCHANGED. Android (with `interactive-widget=resizes-content`): shrinks |
| **Visual viewport** (`window.visualViewport`) | What's actually visible | Shrinks on both platforms |
| **Visual-viewport OFFSET** (`visualViewport.offsetTop`) | Where the visible window sits inside the layout viewport | iOS SCROLLS it down to reveal the focused input — and often fails to scroll back on dismiss (long-standing bug, worse on iOS 26) |

`100dvh` tracks browser-chrome show/hide but **does NOT shrink for the
keyboard on iOS**. That's why a pure-CSS layout can't pin a composer above the
iOS keyboard.

## The failure we actually shipped (2026-07-15 field report)

The chat shell height was driven from `visualViewport.height` (correct), but
the shell stayed anchored at the layout-viewport top. iOS opened the keyboard
and scrolled the visual viewport down: the visible window slid past the shell
→ tab bar floated mid-screen, dead space (= `offsetTop`) below it, growing
while typing, and a residual gap after dismiss because iOS didn't restore the
offset. Screenshot in the PR.

## The invariants (all live in `cbo-profile.tsx`'s viewport effect + `client/index.html`)

1. **The chat shell is exactly `visualViewport.height` tall** — via
   `--cbo-vh`, with `100dvh` as the no-JS fallback.
2. **The shell FOLLOWS the visual viewport**: `translateY(var(--cbo-vv-top))`
   where `--cbo-vv-top = visualViewport.offsetTop`. Height without offset is
   half a fix.
3. **The document is scroll-locked while the chat shell shows**
   (`overflow:hidden` on html/body/#root — NOT `position:fixed` on body,
   which makes iOS paint ghost copies of the composer during momentum
   scroll). Only the message list scrolls.
4. **Any window scroll is Safari residue** — nothing legitimate can scroll a
   locked document, so the handler resets `scrollTo(0,0)`. This is what
   clears the post-dismiss gap.
5. **One rAF-coalesced listener** on `visualViewport` `resize`+`scroll` (+
   window `resize`/`orientationchange`, + document `focusin`/`focusout` with a
   400ms settle re-measure). Cheap enough for low-end Androids; the transform
   is GPU-composited. Do not add per-frame work here.
5b. **Keyboard state is inferred from FOCUS, never from the viewport.** After
   a dismissal, iOS keeps reporting the stale keyboard-sized
   `visualViewport.height`/`offsetTop` and often fires no further event
   (iOS 26 regression — this shipped as "fixed" once and came back through
   exactly this hole: fine at session start, short shell after the first
   typed turn). When no editable element is focused, the keyboard cannot be
   open: clamp to `max(vv.height, innerHeight)`, offset 0. Skipped while
   pinch-zoomed (`vv.scale ≠ 1`), where a small vv is legitimate.
6. **`interactive-widget=resizes-content`** in the viewport meta: Android
   Chrome 108+ then resizes the LAYOUT viewport for the keyboard, making
   Android correct with zero JS. iOS ignores the flag — the follower covers it.
7. **Inputs are ≥16px on mobile** (`text-base`, `md:text-sm`) — under 16px
   iOS auto-zooms on focus, which changes `visualViewport.scale` and creates
   a whole second family of offset bugs. Never "fix" a dense layout by
   shrinking input font below 16px.
8. **No `viewport-fit=cover`** — the system then handles safe areas; the tab
   bar keeps only `env(safe-area-inset-bottom)` padding (`.safe-bottom`).
9. **The lock is scoped to the chat shell** — welcome/preamble screens keep
   normal document scroll (a locked welcome stranded the CTA below the fold
   on short desktop viewports).

## Do / Don't

- ✅ New full-height mobile screen → `h-[100dvh]` + inner scroller; if it has
  a keyboard-focused composer, reuse the shell's follower pattern.
- ✅ Fixed-position UI → portal it to `body` (Radix does). The shell has a
  `transform`, so it is the containing block for any `fixed` descendant.
- ❌ Don't read `window.innerHeight` at one moment and cache it into a layout.
- ❌ Don't add `maximum-scale=1` to the meta (accessibility) — the ≥16px rule
  already prevents focus zoom.
- ❌ Don't hand the document scroll back to the chat page "just for one
  screen" — rubber-banding moves the browser chrome and reopens the gap.

## Regression net

- `e2e/cbo-mobile-viewport-follower.spec.ts` stubs `window.visualViewport`
  (height/offsetTop + events) and asserts the shell height, translate, and
  scroll reset react correctly — CI-checkable without real devices.
- 5-minute manual device pass (before cohort-facing demos):
  1. iPhone Safari via a WhatsApp invite link: open chat → focus composer →
     type → send → dismiss keyboard. Tab bar must sit flush at the bottom at
     every step; no dead space below it.
  2. Same on a low-end Android (Chrome + WhatsApp in-app browser).
  3. Rotate to landscape and back.
  4. Background the browser mid-keyboard, return.

import { test, expect } from '@playwright/test';
import { TestApi } from './helpers/testApi';

// ⚠️ CHIP-TAP-LOST.
//
// Traced from a full-suite run where 9 of 23 sessions stalled at DIFFERENT
// steps (ask-hazard-check, await-uploads, ask-photos, mid-worry-loop). The
// server was blameless in every one: each checkpoint served in 0ms with a 200,
// no 5xx, no checkpoint errors, two 409s in the whole run — and then no further
// POST ever arrived for that session. The browser stopped talking while a live
// question card was still on screen.
//
// The shape that allows it: sendMessage opens with
//   `if (!cboId || !text.trim() || isStreaming) return;`
// and both of its chip/map callers cleared the question BEFORE calling it. A tap
// that lands while a turn is in flight therefore erases the question and sends
// nothing — no request, no error, no toast, nothing to tap. Identical to the
// dead end JVP hit on 2026-08-04, reached through a different door.
//
// These specs pin the INVARIANT rather than the race (which I could not pin):
// a tap is never both erased and unsent, and a fast double-tap never turns into
// two answers.

test.describe('CBO — a tap is never lost', () => {
  test.use({ locale: 'pt-BR' });

  test('a fast double-tap answers once and the flow continues', async ({ page, request }) => {
    test.setTimeout(120_000);
    const api = new TestApi(request);
    test.skip(!(await api.ping()).fakeModel, 'needs the fake model');

    await page.goto('/cbo-profile');
    const marker = page.getByTestId('cbo-stream-status');
    await expect(marker).toHaveAttribute('data-cbo-id', /.+/, { timeout: 30_000 });
    const cboId = (await marker.getAttribute('data-cbo-id'))!;

    await api.scriptCbo(cboId, [
      [{ op: 'ask_user', question: 'Vocês atuam em um bairro só?', options: [
        { label: 'Um bairro', description: 'só um' },
        { label: 'Mais de um', description: 'vários' },
      ] } as any],
      // Slow, so the second tap of the double-tap lands mid-turn — the exact
      // window in which a tap used to vanish.
      [{ op: 'wait', ms: 2_500 } as any, { op: 'say', text: 'Beleza, seguimos.' } as any],
      [{ op: 'say', text: 'Terceira resposta.' } as any],
    ]);

    const chat = page.getByTestId('cbo-chat-input');
    await chat.fill('oi');
    await chat.press('Enter');

    const chip = page.locator('[data-testid^="cbo-option-"][data-option-label="Um bairro"]');
    await expect(chip).toBeVisible({ timeout: 30_000 });

    // Two taps as fast as the browser will deliver them.
    await chip.click();
    await chip.click({ force: true, timeout: 2_000 }).catch(() => {});

    // The turn runs, once.
    await expect(page.getByText('Beleza, seguimos')).toBeVisible({ timeout: 40_000 });

    const msgs = await (await request.get(`/api/cbo/${cboId}/messages`)).json();
    const answers = msgs.filter((m: any) =>
      m.role === 'user' && String(m.content ?? '').includes('Um bairro') && m.messageType === 'content');
    expect(answers.length, 'one tap, one answer — a double-tap must not double-answer')
      .toBe(1);

    // …and the session is answerable afterwards, which is the half that used to
    // die: the screen kept the question or moved on, never went blank-and-idle.
    await expect(marker).toHaveAttribute('data-streaming', 'false', { timeout: 20_000 });
    await chat.fill('e agora?');
    await chat.press('Enter');
    await expect(page.getByText('Terceira resposta')).toBeVisible({ timeout: 40_000 });
  });

  test('a tap during a turn keeps the question on screen', async ({ page, request }) => {
    test.setTimeout(120_000);
    const api = new TestApi(request);
    test.skip(!(await api.ping()).fakeModel, 'needs the fake model');

    await page.goto('/cbo-profile');
    const marker = page.getByTestId('cbo-stream-status');
    await expect(marker).toHaveAttribute('data-cbo-id', /.+/, { timeout: 30_000 });
    const cboId = (await marker.getAttribute('data-cbo-id'))!;

    // A turn that asks, and a NEXT turn that is slow — so we can be mid-turn
    // with a question rendered from the persisted composer.
    await api.scriptCbo(cboId, [
      [{ op: 'ask_user', question: 'Continuar?', options: [
        { label: 'Sim', description: 'segue' },
        { label: 'Não', description: 'para' },
      ] } as any],
      [{ op: 'wait', ms: 3_000 } as any, { op: 'say', text: 'Pronto.' } as any],
    ]);

    const chat = page.getByTestId('cbo-chat-input');
    await chat.fill('oi');
    await chat.press('Enter');
    await expect(page.locator('[data-testid^="cbo-option-"][data-option-label="Sim"]'))
      .toBeVisible({ timeout: 30_000 });

    // Start a turn by typing, then tap a chip while it streams.
    await chat.fill('texto qualquer');
    await chat.press('Enter');
    await expect(marker).toHaveAttribute('data-streaming', 'true', { timeout: 10_000 });

    const before = await page.locator('[data-testid^="cbo-option-"]').count();
    await page.locator('[data-testid^="cbo-option-"]').first()
      .click({ force: true, timeout: 2_000 }).catch(() => {});

    // Whatever the tap did, it must not have left the user with fewer options
    // and no turn — the blank-and-idle state. Either it was accepted, or the
    // chips are still there to tap again.
    await page.waitForTimeout(500);
    const after = await page.locator('[data-testid^="cbo-option-"]').count();
    const streaming = await marker.getAttribute('data-streaming');
    expect(after > 0 || streaming === 'true',
      'a dropped tap must leave the question tappable, not a blank screen').toBeTruthy();
    expect(after).toBeGreaterThanOrEqual(Math.min(before, 1));

    // And the session finishes normally.
    await expect(page.getByText('Pronto.')).toBeVisible({ timeout: 40_000 });
    await expect(marker).toHaveAttribute('data-streaming', 'false', { timeout: 20_000 });
  });
});

// The deterministic half of the same defect, and the costliest payload: the map.
//
// Pre-fix, the confirm handler ran `sendMessage(...)` and then closed the map
// unconditionally — so confirming while a turn was in flight dropped the whole
// selection (bairro, site, risk numbers) AND took the map away. Nothing to
// retry, nothing on screen, no error. Unlike the chip race this one is fully
// controllable: start a slow turn by typing, then confirm.
test.describe('CBO — a map confirmation is never lost', () => {
  test.use({ locale: 'pt-BR' });

  test('confirming during a turn keeps the map instead of discarding the selection', async ({ page, request }) => {
    test.setTimeout(120_000);
    const api = new TestApi(request);
    test.skip(!(await api.ping()).fakeModel, 'needs the fake model');

    await page.goto('/cbo-profile');
    const marker = page.getByTestId('cbo-stream-status');
    await expect(marker).toHaveAttribute('data-cbo-id', /.+/, { timeout: 30_000 });
    const cboId = (await marker.getAttribute('data-cbo-id'))!;

    await api.scriptCbo(cboId, [
      [{ op: 'set_phase', phase: 2 } as any,
       { op: 'open_map', params: { preset: 'e2_bairro' } } as any],
      [{ op: 'wait', ms: 3_000 } as any, { op: 'say', text: 'Resposta lenta.' } as any],
    ]);

    const chat = page.getByTestId('cbo-chat-input');
    await chat.fill('mapa');
    await chat.press('Enter');
    await expect(page.locator('.leaflet-container').first()).toBeVisible({ timeout: 30_000 });
    await expect.poll(() => page.$$eval('.leaflet-overlay-pane path', p => p.length),
      { timeout: 20_000 }).toBeGreaterThan(50);

    const tourNext = page.getByTestId('map-tour-next');
    await expect(tourNext).toBeVisible({ timeout: 15_000 });
    for (let i = 0; i < 3; i++) await tourNext.click();
    await expect(tourNext).toHaveCount(0, { timeout: 10_000 });
    await page.waitForTimeout(1200);

    // Pick a bairro — a real one, verified under the cursor.
    const target = await page.evaluate(() => {
      const ps = Array.from(document.querySelectorAll('.leaflet-overlay-pane path.leaflet-interactive')) as SVGPathElement[];
      const ranked = ps.map(p => ({ p, b: p.getBoundingClientRect() }))
        .filter(x => x.b.width > 20 && x.b.height > 20)
        .sort((a, b) => b.b.width * b.b.height - a.b.width * a.b.height);
      for (const { p, b } of ranked) {
        for (const fx of [0.5, 0.35, 0.65]) for (const fy of [0.5, 0.35, 0.65]) {
          const x = b.x + b.width * fx, y = b.y + b.height * fy;
          if (document.elementFromPoint(x, y) === p) return { x, y };
        }
      }
      return null;
    });
    expect(target).not.toBeNull();
    await page.mouse.click(target!.x, target!.y);
    const confirm = page.getByTestId('map-confirm-bairro');
    await expect(confirm).toBeEnabled({ timeout: 10_000 });

    // Now put a turn in flight, and confirm into it.
    await chat.fill('uma pergunta qualquer');
    await chat.press('Enter');
    await expect(marker).toHaveAttribute('data-streaming', 'true', { timeout: 10_000 });
    await confirm.click();

    // THE ASSERTION. Pre-fix the map was closed and the selection thrown away.
    await expect(
      confirm,
      'confirming mid-turn must not discard the selection and close the map',
    ).toBeVisible({ timeout: 5_000 });

    // The turn finishes, and the confirmation still works — the org loses a tap,
    // not their work.
    await expect(page.getByText('Resposta lenta.')).toBeVisible({ timeout: 40_000 });
    await expect(marker).toHaveAttribute('data-streaming', 'false', { timeout: 20_000 });
    await confirm.click();
    await expect
      .poll(async () => {
        const msgs = await (await request.get(`/api/cbo/${cboId}/messages`)).json();
        return msgs.some((m: any) => String(m.content ?? '').includes('Selecionei no mapa')
          || String(m.content ?? '').includes('Map selection'));
      }, { timeout: 30_000 })
      .toBe(true);
  });
});

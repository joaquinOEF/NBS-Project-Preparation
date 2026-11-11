import { test, expect, type Page, type APIRequestContext } from '@playwright/test';
import { TestApi } from './helpers/testApi';
import { chipArmDelay, CHIP_ARM_MS, CHIP_REPEAT_MS } from '../client/src/core/lib/chip-tap-guard';

// ⚠️ A NEW QUESTION'S CHIPS DO NOT TAKE THE TAP MEANT FOR THE LAST ONE.
//
// Prod, Conceito Arte, 11 Nov 2026 09:48:17–09:48:32 UTC: ~40 chip answers
// 0.2–1 s apart, nearly all at the same position (mostly option B). Each next
// question rendered under her finger and its chips accepted the tap at once —
// two of those answers were "Não é pra gente" she most likely never meant.
// See client/src/core/lib/chip-tap-guard.ts.

const Q1 = 'Primeira pergunta?';
const Q2 = 'Segunda pergunta?';

async function twoQuestions(page: Page, request: APIRequestContext) {
  const api = new TestApi(request);
  test.skip(!(await api.ping()).fakeModel, 'needs the fake model');
  await page.goto('/cbo-profile');
  const marker = page.getByTestId('cbo-stream-status');
  await expect(marker).toHaveAttribute('data-cbo-id', /.+/, { timeout: 30_000 });
  const cboId = (await marker.getAttribute('data-cbo-id'))!;
  // Q2 follows the answer to Q1 with no delay — the fake model renders it well
  // inside the guard window, which is the field's shape.
  await api.scriptCbo(cboId, [
    [{ op: 'ask_user', question: Q1, options: [{ label: 'Opção A1' }, { label: 'Opção B1' }, { label: 'Opção C1' }] } as any],
    [{ op: 'ask_user', question: Q2, options: [{ label: 'Opção A2' }, { label: 'Não é pra gente' }, { label: 'Opção C2' }] } as any],
    [{ op: 'say', text: 'Seguimos.' } as any],
  ]);
  const chat = page.getByTestId('cbo-chat-input');
  await chat.fill('oi');
  await chat.press('Enter');
  const answers = async () => {
    const msgs = await (await request.get(`/api/cbo/${cboId}/messages`)).json();
    return msgs.filter((m: any) => m.role === 'user' && m.messageType === 'content' && /Opção|Não é pra gente/.test(String(m.content ?? ''))).map((m: any) => String(m.content));
  };
  return { cboId, marker, answers };
}

test.describe('CBO — the chip guard', () => {
  test.use({ locale: 'pt-BR' });

  test('the arming delay is one constant, and the repeat window extends it', () => {
    expect(chipArmDelay(1000, 1000, 0)).toBe(CHIP_ARM_MS);
    expect(chipArmDelay(1000, 1000, 900)).toBe(900 + CHIP_REPEAT_MS - 1000);
    expect(chipArmDelay(5000, 1000, 900)).toBe(0);
  });

  test('⚠️ two rapid taps on option B across a question change send ONE answer', async ({ page, request }) => {
    test.setTimeout(90_000);
    const { marker, answers } = await twoQuestions(page, request);

    const b1 = page.locator('[data-testid="cbo-option-1"][data-option-label="Opção B1"]');
    await expect(b1).toBeEnabled({ timeout: 30_000 });
    const box = (await b1.boundingBox())!;
    const x = box.x + box.width / 2, y = box.y + box.height / 2;
    await page.mouse.click(x, y);

    // Q2 lands under the finger; the finger taps again at once, at the same spot.
    const b2 = page.locator('[data-testid="cbo-option-1"][data-option-label="Não é pra gente"]');
    await expect(b2).toBeVisible({ timeout: 20_000 });
    await expect(b2, 'a newly shown chip is held while the guard is on').toBeDisabled();
    const box2 = (await b2.boundingBox())!;
    await page.mouse.click(box2.x + box2.width / 2, box2.y + box2.height / 2);
    // …and the keyboard twin: "B" pressed straight away.
    await page.keyboard.press('b');

    await page.waitForTimeout(CHIP_REPEAT_MS + 300);
    expect(await answers(), 'only the deliberate first tap is an answer').toEqual(['Opção B1']);
    await expect(page.getByText(Q2).last()).toBeVisible();
    await expect(marker).toHaveAttribute('data-streaming', 'false');

    // Once armed, the same chip answers normally.
    await expect(b2).toBeEnabled();
    await page.locator('[data-testid="cbo-option-0"][data-option-label="Opção A2"]').click();
    await expect(page.getByText('Seguimos.')).toBeVisible({ timeout: 30_000 });
    expect(await answers()).toEqual(['Opção B1', 'Opção A2']);
  });

  test('a typed answer is never held by the guard', async ({ page, request }) => {
    test.setTimeout(90_000);
    const { answers } = await twoQuestions(page, request);
    await page.locator('[data-testid="cbo-option-0"][data-option-label="Opção A1"]').click();
    await expect(page.locator('[data-testid="cbo-option-0"][data-option-label="Opção A2"]')).toBeVisible({ timeout: 20_000 });
    const chat = page.getByTestId('cbo-chat-input');
    await chat.fill('Opção C2');
    await chat.press('Enter');
    await expect(page.getByText('Seguimos.')).toBeVisible({ timeout: 30_000 });
    expect(await answers()).toEqual(['Opção A1', 'Opção C2']);
  });
});

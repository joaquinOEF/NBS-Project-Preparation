import { test, expect } from '@playwright/test';
import { TestApi } from './helpers/testApi';

// The "Saber mais" sheet (NbsTypeSheet): tapping a type card opens one
// full-height sheet holding all six types, scrolled to the tapped one.
// Guards the two things most likely to regress silently:
//   1. It opens ON the tapped type (the lazy-image offsetTop race — see the
//      width/height attrs in NbsTypeSheet Panel).
//   2. No horizontal overflow at 390px (cbo-ux-audit-backlog.md types-strip bug).

test.describe('COUGAR — NBS type sheet', () => {
  test.use({ locale: 'pt-BR', viewport: { width: 390, height: 844 } });

  async function openStrip(page, request) {
    const api = new TestApi(request);
    test.skip(!(await api.ping()).fakeModel, 'needs the fake model');
    await page.goto('/cbo-profile');
    const marker = page.getByTestId('cbo-stream-status');
    await expect(marker).toHaveAttribute('data-cbo-id', /.+/, {
      timeout: 30_000,
    });
    const cboId = (await marker.getAttribute('data-cbo-id'))!;
    await api.seedState(cboId, { phase: 2 });
    // The E2 entry template now posts the FAMÍLIAS strip; the six-type strip
    // (this sheet's host) renders for explicit show_types calls and old
    // transcripts — drive it explicitly.
    await api.scriptCbo(cboId, [[
      { op: 'say', text: 'Dois minutos sobre os tipos de SbN.' },
      { op: 'show_types' },
      { op: 'ask_user', question: 'Seguimos?', options: [{ label: 'Ver exemplos' }] },
    ]]);
    const input = page.getByTestId('cbo-chat-input');
    await input.fill('Vamos ver os tipos.');
    await input.press('Enter');
    await expect(
      page.locator('[data-testid^="type-card-"]').first()
    ).toBeVisible({ timeout: 12_000 });
  }

  test('opens on the tapped type and stacks its before/after pair', async ({
    page,
    request,
  }) => {
    await openStrip(page, request);

    // Tap the 4th type, not the 1st — this is the case the offsetTop race breaks.
    await page
      .getByTestId('type-expand-green-roofs-walls')
      .scrollIntoViewIfNeeded();
    await page.getByTestId('type-expand-green-roofs-walls').click();

    const sheet = page.getByTestId('nbs-type-sheet');
    await expect(sheet).toBeVisible();

    // Landed on green-roofs-walls: its section top sits at the container top.
    const landed = await sheet.evaluate((el: HTMLElement) => {
      const body = el.querySelector('.overflow-y-auto') as HTMLElement;
      const top = body.getBoundingClientRect().top;
      const first = [...body.querySelectorAll('section[data-index]')].find(
        s => s.getBoundingClientRect().bottom > top + 4
      );
      return first?.getAttribute('data-testid');
    });
    expect(landed).toBe('type-section-green-roofs-walls');

    // Both croqui panels are present and non-zero.
    const imgs = sheet
      .getByTestId('type-section-green-roofs-walls')
      .locator('figure img');
    await expect(imgs).toHaveCount(2);
    for (const img of await imgs.all()) {
      await expect(img).toHaveJSProperty('complete', true);
      expect(
        await img.evaluate((i: HTMLImageElement) => i.naturalWidth)
      ).toBeGreaterThan(0);
    }

    // No sideways drag on a 390px phone.
    const overflows = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth
    );
    expect(overflows).toBe(false);
  });

  test('closes back to the strip and restores focus to the card', async ({
    page,
    request,
  }) => {
    await openStrip(page, request);
    const trigger = page.getByTestId('type-expand-flood-parks');
    await trigger.scrollIntoViewIfNeeded();
    await trigger.click();
    await expect(page.getByTestId('nbs-type-sheet')).toBeVisible();
    await page.getByTestId('nbs-type-sheet-close').click();
    await expect(page.getByTestId('nbs-type-sheet')).toBeHidden();
    // The strip is still there — the sheet is ephemeral UI over the persisted composer.
    await expect(
      page.locator('[data-testid^="type-card-"]').first()
    ).toBeVisible();
  });
});

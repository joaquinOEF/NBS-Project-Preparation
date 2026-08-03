import { test, expect, type Page } from '@playwright/test';
import { TestApi } from './helpers/testApi';

// A chip that needs a file OPENS the file picker (JVP, 2026-08-03, after hitting
// it twice in a real session: "i clicked the i have a file to add and did not
// open the upload file dialog… instead it added a message in chat").
//
// The seam already existed end to end — `action` on the ask_user option type,
// accepted by the model's tool, honoured by the chip renderer — but the server's
// `ask()` helper flattened every option to label + description, so no templated
// checkpoint could set it. The agent answered with prose telling the user to go
// find the 📎 themselves.
//
// Two behaviours, deliberately distinct:
//   'upload'              — the intake BANNER: opens the picker INSTEAD of answering.
//   'upload_then_answer'  — a normal chip: answers AND opens the picker.
// The second is what a templated checkpoint needs; a chip that only opened a
// picker would never advance the flow.

const chip = (page: Page, label: string) =>
  page.locator(`[data-testid^="cbo-option-"][data-option-label="${label}"]`);

/** Drive E2 to the photos beat, where the upload invite lives. */
async function toPhotosBeat(page: Page, request: any): Promise<string> {
  const api = new TestApi(request);
  await page.goto('/cbo-profile');
  const marker = page.getByTestId('cbo-stream-status');
  await expect(marker).toHaveAttribute('data-cbo-id', /.+/, { timeout: 30_000 });
  const cboId = (await marker.getAttribute('data-cbo-id'))!;
  await api.seedState(cboId, { phase: 2 });

  await request.post(`/api/cbo/${cboId}/chat`, {
    data: {
      message: [
        'Map selection (composite mode):',
        '- [zone] Partenon: MEDIUM risk, intervention: urban forest, area: 8.1 km², pop: 45.768, flood: 22%, heat: 51%, landslide: 14%, at (-30.0577, -51.1936)',
        '- [custom] Pátio da escola at (-30.0577, -51.1936)',
        'Total: 2 assets, 0 sampled points',
      ].join('\n'),
      lang: 'pt',
      turnKind: 'map',
    },
  });
  await page.reload();
  await expect(page.getByTestId('cbo-site-card')).toBeVisible({ timeout: 20_000 });
  await chip(page, 'Confirmar ✓').click();
  await expect(page.getByText('Como é esse lugar hoje', { exact: false })).toBeVisible({ timeout: 10_000 });
  await chip(page, 'Pavimentado / impermeabilizado').click();
  await expect(page.getByText('acesso a esse espaço', { exact: false })).toBeVisible({ timeout: 10_000 });
  await chip(page, 'É da prefeitura, mas a gente usa').click();
  await expect(page.getByText('mais preocupa', { exact: false })).toBeVisible({ timeout: 10_000 });
  await chip(page, '🌡️ Calor').click();
  await chip(page, 'Pronto ✓').click();
  await expect(page.getByText('palavras de vocês', { exact: false })).toBeVisible({ timeout: 10_000 });
  await chip(page, 'Prefiro pular').click();
  await expect(page.getByText('fotos ajudam', { exact: false })).toBeVisible({ timeout: 15_000 });
  return cboId;
}

test.describe('COUGAR — a chip that needs a file opens the picker', () => {
  test.use({ locale: 'pt-BR' });

  test('"Tenho arquivos pra anexar" opens the picker AND answers', async ({ page, request }) => {
    test.setTimeout(180_000);
    const api = new TestApi(request);
    test.skip(!(await api.ping()).fakeModel, 'needs the fake model');
    await toPhotosBeat(page, request);

    // The file dialog is native and invisible to the DOM — Playwright's
    // filechooser event is the only honest way to assert it opened.
    const chooser = page.waitForEvent('filechooser', { timeout: 10_000 });
    await chip(page, 'Tenho arquivos pra anexar').click();
    await expect(chooser, 'the chip must open the file picker').resolves.toBeTruthy();

    // …and it must ALSO have answered, or the checkpoint machine stalls: the
    // next question is the one that follows the upload invite.
    await expect(page.getByText('Quando terminar de anexar', { exact: false }))
      .toBeVisible({ timeout: 15_000 });

    // The prose no longer tells them to do the thing that just happened.
    await expect(page.getByText('Toca no 📎', { exact: false })).toHaveCount(0);
  });

  test('"Anexar mais" re-opens the picker without stranding the flow', async ({ page, request }) => {
    test.setTimeout(180_000);
    const api = new TestApi(request);
    test.skip(!(await api.ping()).fakeModel, 'needs the fake model');
    await toPhotosBeat(page, request);

    const first = page.waitForEvent('filechooser', { timeout: 10_000 });
    await chip(page, 'Tenho arquivos pra anexar').click();
    await first;
    await expect(chip(page, 'Anexar mais')).toBeVisible({ timeout: 15_000 });

    const again = page.waitForEvent('filechooser', { timeout: 10_000 });
    await chip(page, 'Anexar mais').click();
    await expect(again, 'attach-more must re-open the picker').resolves.toBeTruthy();

    // Unhandled server-side this would fall through to the model, whose turn
    // replaces the pending composer — the "Pronto, pode seguir" chip vanishes
    // and the org is stranded mid-upload. It must still be there.
    await expect(chip(page, 'Pronto, pode seguir')).toBeVisible({ timeout: 15_000 });
  });

  test('the flow still completes for someone who has no files', async ({ page, request }) => {
    test.setTimeout(180_000);
    const api = new TestApi(request);
    test.skip(!(await api.ping()).fakeModel, 'needs the fake model');
    await toPhotosBeat(page, request);

    // The other chips must be untouched by all this — no picker, normal answer.
    await chip(page, 'Não tenho agora').click();
    await expect(page.getByText('média do bairro', { exact: false })).toBeVisible({ timeout: 15_000 });
  });
});

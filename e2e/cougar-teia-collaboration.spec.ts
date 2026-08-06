import { test, expect } from '@playwright/test';
import { TestApi } from './helpers/testApi';

// Backlog #26, from the COUGAR convening (2026-08-06).
//
// Orgs applied to the Teia Sprint government open call, which makes those
// applications semi-formalised project proposals. W3 refines them into scope,
// partnerships and funding — so the coordination team wants them BEFORE it
// plans W3, and it wants to know who has a cross-org track record before it
// designs partnerships. Both asks land at the close of W2.
//
// Two design decisions worth pinning:
//  · Saying yes OPENS THE PICKER (JVP: "render directly the upload file button
//    if they say yes"). Telling someone who just said yes to go hunt for a
//    paperclip is the dead step already fixed once in backlog #20.
//  · The collaboration question is yes/no + free text, NOT a pick-list of the
//    cohort roster — that would show every org who else is in their hub, days
//    after they told us they were anxious about their data (backlog #31).

/** W2 walked to its last beat: everything before the close already answered.
 *  The checkpoint chain is ordered, so reaching the final question means
 *  satisfying the ones in front of it — far less brittle than walking all of W2
 *  through the UI, and it is the state a real org arrives in. */
const DONE_BEFORE_CLOSE = ([
  ['bairro', 'Sarandi'],
  ['site_name', 'Pátio da EMEI'],
  ['_site_confirmed', 'yes'],
  ['current_use', 'abandoned'],
  ['land_tenure', 'public-informal'],
  ['site_worry', 'alagamento'],
  ['_worry_offered', 'yes'],
  ['_worry_done', 'yes'],
  ['_story_done', 'yes'],
  ['_photos_done', 'yes'],
  ['_check_done', 'yes'],
  ['_interest_offered', 'yes'],
  ['_interest_done', 'yes'],
  ['nbs_interest', 'aguas-pluviais'],
  ['_roles_offered', 'yes'],
  ['_role_done', 'yes'],
  ['role_preference', 'executar'],
] as const).map(([field, value]) => ({ sectionId: 'intervention_site', field, value }));

test.describe('COUGAR — Teia Sprint + prior collaboration', () => {
  test.use({ locale: 'pt-BR' });

  test('the Teia chip opens the file picker, and the file is tagged', async ({ page, request }) => {
    test.setTimeout(120_000);
    const api = new TestApi(request);
    test.skip(!(await api.ping()).fakeModel, 'needs the fake model');

    await page.goto('/cbo-profile');
    const marker = page.getByTestId('cbo-stream-status');
    await expect(marker).toHaveAttribute('data-cbo-id', /.+/, { timeout: 30_000 });
    const cboId = (await marker.getAttribute('data-cbo-id'))!;

    // Straight to the ask: the beat is templated, so it only needs the state
    // that gates it rather than the whole W2 walk.
    await api.seedState(cboId, {
      phase: 2,
      language: 'pt',
      sections: DONE_BEFORE_CLOSE,
    });
    await request.post(`/api/cbo/${cboId}/chat`, { data: { message: 'oi', lang: 'pt', turnKind: 'chip' } });
    await page.reload();

    const chip = (label: string) =>
      page.locator(`[data-testid^="cbo-option-"][data-option-label="${label}"]`);
    await expect(chip('Sim — subir agora')).toBeVisible({ timeout: 30_000 });

    // Tapping it must open the picker itself — that is the whole point.
    const chooser = page.waitForEvent('filechooser', { timeout: 10_000 });
    await chip('Sim — subir agora').click();
    const fc = await chooser;

    await fc.setFiles({
      name: 'teia-sprint-aplicacao.txt',
      mimeType: 'text/plain',
      buffer: Buffer.from('Proposta enviada ao Teia Sprint: horta comunitária no Sarandi.'),
    });

    // The upload arrives TAGGED, so the coordination team can find it among the
    // site photos instead of scrolling for a filename they have to guess.
    await expect.poll(async () => {
      const docs = (await (await request.get(`/api/cbo/${cboId}/documents`)).json())?.documents ?? [];
      return docs.find((d: any) => d.filename?.includes('teia-sprint'))?.purpose ?? null;
    }, { timeout: 40_000 }).toBe('teia_sprint');

    // …and answering advanced the flow rather than parking it on the upload.
    const body = await (await request.get(`/api/cbo/${cboId}`)).json();
    expect(body.state?.sections?.intervention_site?.fields?.teia_sprint?.value).toBe('enviado');
  });

  test('"não mandamos" still moves on, then asks about working together', async ({ page, request }) => {
    test.setTimeout(120_000);
    const api = new TestApi(request);
    test.skip(!(await api.ping()).fakeModel, 'needs the fake model');

    await page.goto('/cbo-profile');
    const marker = page.getByTestId('cbo-stream-status');
    await expect(marker).toHaveAttribute('data-cbo-id', /.+/, { timeout: 30_000 });
    const cboId = (await marker.getAttribute('data-cbo-id'))!;

    await api.seedState(cboId, {
      phase: 2, language: 'pt',
      sections: DONE_BEFORE_CLOSE,
    });
    await request.post(`/api/cbo/${cboId}/chat`, { data: { message: 'oi', lang: 'pt', turnKind: 'chip' } });
    await page.reload();

    const chip = (label: string) =>
      page.locator(`[data-testid^="cbo-option-"][data-option-label="${label}"]`);
    await expect(chip('Não mandamos')).toBeVisible({ timeout: 30_000 });
    await chip('Não mandamos').click();

    // Straight into the collaboration question — no dead end for an org that
    // never applied.
    await expect(page.getByText('outras organizações da rede', { exact: false }))
      .toBeVisible({ timeout: 20_000 });
    await chip('Sim, já fizemos').click();

    // Yes means "tell me who", in their own words. NOT a roster to tick.
    await expect(page.getByText('Com quem?', { exact: false })).toBeVisible({ timeout: 20_000 });
    const input = page.getByTestId('cbo-chat-input');
    await input.fill('Com a Encosta Viva, num mutirão de plantio.');
    await input.press('Enter');

    await expect.poll(async () => {
      const body = await (await request.get(`/api/cbo/${cboId}`)).json();
      const f = body.state?.sections?.intervention_site?.fields ?? {};
      return [f.teia_sprint?.value, f.prior_collaboration?.value, f.prior_collaboration_detail?.value];
    }, { timeout: 30_000 }).toEqual(['nao-enviou', 'sim', 'Com a Encosta Viva, num mutirão de plantio.']);
  });
});

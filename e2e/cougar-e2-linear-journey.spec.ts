import { test, expect } from '@playwright/test';
import { TestApi } from './helpers/testApi';
import { clickCenterZone } from './helpers/mapActions';

// The FULL linear E2 journey (W2 redesign): educational → um-bairro-ou-mais →
// Map 1 (tour + bairro) → tem-um-lugar fork → Map 2 (focused, pin) → site card
// → current use → tenure → photos ask → famílias recommendation → closing.
//
// Every stage boundary is a server-templated checkpoint (serveE2Checkpoint) —
// this whole spec runs WITHOUT a single fake-model script: if any step fell
// through to the model, the fake model's default turn ("Vamos continuar")
// would render instead of the next checkpoint and the assertions would fail.
//
// Runs in BOTH session languages — the templates carry full pt/en copy and a
// drifted label on either side would silently strand that language's cohort.

const LANGS = [
  {
    name: 'pt',
    locale: 'pt-BR',
    entry: 'Vamos começar o Encontro 2.',
    skip: 'Já conheço SbN — pular',
    oneOrMoreText: 'um bairro só ou em mais de um',
    oneBairro: 'Um bairro',
    confirmedText: 'confirmado',
    forkText: 'lugar específico',
    notYet: 'Ainda não',
    askSupport: 'Pedir apoio à coordenação',
    comeBack: 'Vou verificar e volto',
    knowNow: 'Já sei o lugar',
    cardRisk: 'Enchente',
    confirmSite: 'Confirmar ✓',
    currentUseText: 'Como é esse lugar hoje',
    currentUsePick: 'Abandonado / degradado',
    tenureText: 'acesso a esse espaço',
    tenurePick: 'É da prefeitura, mas a gente usa',
    photosText: 'fotos do lugar',
    noPhotos: 'Não tenho agora',
    exampleMark: 'ex.:',
    makesSense: 'Faz sentido',
    interestText: 'famílias vocês teriam interesse',
    interestPick: 'Infraestrutura Verde Urbana',
    roleText: 'vocês gostariam de ter nesses projetos',
    rolePick: 'Executar / implementar',
    doneList: 'Pronto ✓',
    closingText: 'por onde começar a estudar',
  },
  {
    name: 'en',
    locale: 'en-US',
    entry: "Let's start Encontro 2.",
    skip: 'I know NbS — skip',
    oneOrMoreText: 'one neighborhood or more than one',
    oneBairro: 'One neighborhood',
    confirmedText: 'confirmed',
    forkText: 'specific place',
    notYet: 'Not yet',
    askSupport: 'Ask the coordination for help',
    comeBack: "I'll check and come back",
    knowNow: 'I know the place now',
    cardRisk: 'Flood',
    confirmSite: 'Confirm ✓',
    currentUseText: 'What is this place like today',
    currentUsePick: 'Abandoned / degraded',
    tenureText: 'access to this space',
    tenurePick: "It's the city's, but we use it",
    photosText: 'photos of the place',
    noPhotos: "I don't have any right now",
    exampleMark: 'e.g.:',
    makesSense: 'Makes sense',
    interestText: 'famílias would you be interested',
    interestPick: 'Urban Green Infrastructure',
    roleText: 'would you like to play in these projects',
    rolePick: 'Implement on the ground',
    doneList: 'Done ✓',
    closingText: 'where to start studying',
  },
] as const;

for (const L of LANGS) {
  test.describe(`COUGAR — E2 linear journey (all checkpoints, ${L.name})`, () => {
    test.use({ locale: L.locale });

    test('chat → mapa → chat, end to end, then survives reload', async ({ page, request }) => {
      const api = new TestApi(request);
      test.skip(!(await api.ping()).fakeModel, 'needs the fake model env (for seeding)');

      await page.goto('/cbo-profile');
      const marker = page.getByTestId('cbo-stream-status');
      await expect(marker).toHaveAttribute('data-cbo-id', /.+/, { timeout: 30_000 });
      const cboId = (await marker.getAttribute('data-cbo-id'))!;
      await api.seedState(cboId, { phase: 2, language: L.name });

      const chip = (label: string) =>
        page.locator(`[data-testid^="cbo-option-"][data-option-label="${label}"]`);
      const input = page.getByTestId('cbo-chat-input');

      // 1 · Entry template: famílias strip + continue/skip chips.
      await input.fill(L.entry);
      await input.press('Enter');
      await expect(page.locator('[data-testid^="familia-card-"]').first()).toBeVisible({ timeout: 10_000 });
      await expect(chip(L.skip)).toBeVisible();

      // 2 · Skip → the one-or-more-bairros checkpoint (template, instant).
      await chip(L.skip).click();
      await expect(page.getByText(L.oneOrMoreText, { exact: false })).toBeVisible({ timeout: 8_000 });

      // 3 · One bairro → Map 1: hazard tour, then the bairro pick, confirmed
      // at the zone step (no site step in this session).
      await chip(L.oneBairro).click();
      await expect(page.locator('.leaflet-container').first()).toBeVisible({ timeout: 20_000 });
      const tourNext = page.getByTestId('map-tour-next');
      await expect(tourNext).toBeVisible({ timeout: 15_000 });
      await tourNext.click();
      await tourNext.click();
      await tourNext.click();
      await expect(tourNext).toHaveCount(0, { timeout: 10_000 });
      await clickCenterZone(page);
      const confirmBairro = page.getByTestId('map-confirm-bairro');
      await expect(confirmBairro).toBeEnabled({ timeout: 10_000 });
      await confirmBairro.click();

      // 4 · Bairro checkpoint: confirmation + the "tem um lugar?" fork.
      await expect(page.getByText(L.confirmedText, { exact: false })).toBeVisible({ timeout: 10_000 });
      await expect(page.getByText(L.forkText, { exact: false })).toBeVisible();

      // 4b · Detour through the "Ainda não" fork (decision A2: only the two
      // post-it exits) and come back via the parked chip — proves resume.
      await chip(L.notYet).click();
      await expect(chip(L.askSupport)).toBeVisible({ timeout: 8_000 });
      await chip(L.comeBack).click();
      await expect(chip(L.knowNow)).toBeVisible({ timeout: 8_000 });
      await chip(L.knowNow).click();

      // 5 · Map 2: focused site session — chooser overlay → pin path.
      await expect(page.getByTestId('map-simple-chooser')).toBeVisible({ timeout: 20_000 });
      await page.getByTestId('map-simple-pin').click();
      await page.waitForTimeout(500);
      const mapBox2 = (await page.locator('.leaflet-container').first().boundingBox())!;
      await page.mouse.click(mapBox2.x + mapBox2.width / 2, mapBox2.y + mapBox2.height / 2);
      const confirmSite = page.getByTestId('map-confirm-site');
      await expect(confirmSite).toBeEnabled({ timeout: 10_000 });
      await confirmSite.click();

      // 6 · Site card checkpoint: the B1 card + confirm chips.
      const siteCard = page.getByTestId('cbo-site-card');
      await expect(siteCard).toBeVisible({ timeout: 10_000 });
      await expect(siteCard.getByText(L.cardRisk, { exact: false })).toBeVisible();
      await chip(L.confirmSite).click();

      // 7 · Describe stage, all templated: current use → tenure → photos.
      await expect(page.getByText(L.currentUseText, { exact: false })).toBeVisible({ timeout: 8_000 });
      await chip(L.currentUsePick).click();
      await expect(page.getByText(L.tenureText, { exact: false })).toBeVisible({ timeout: 8_000 });
      await chip(L.tenurePick).click();
      await expect(page.getByText(L.photosText, { exact: false })).toBeVisible({ timeout: 8_000 });

      // Tenure landed → the checkpoint scored site_control itself (the model
      // never runs in this path, so the old skill-driven scoring can't happen).
      // public-informal without municipal awareness = 1 per the rubric.
      await expect
        .poll(async () => {
          const body = await (await request.get(`/api/cbo/${cboId}`)).json();
          const s = (body.state?.maturityScores ?? []).find((m: any) => m.metric === 'site_control');
          return s?.score;
        }, { timeout: 8_000 })
        .toBe(1);

      await chip(L.noPhotos).click();

      // 8 · Famílias recommendation: ≥2 famílias, ranked, with example variants.
      const reco = page.getByTestId('cbo-familia-reco');
      await expect(reco).toBeVisible({ timeout: 8_000 });
      expect(await reco.locator('[data-testid^="familia-reco-"]').count()).toBeGreaterThanOrEqual(2);
      await expect(reco.getByText(L.exampleMark, { exact: false }).first()).toBeVisible();

      // 9 · Interest + role loops (the Aug-12 biweekly commitment), then close.
      await chip(L.makesSense).click();
      await expect(page.getByText(L.interestText, { exact: false })).toBeVisible({ timeout: 8_000 });
      await chip(L.interestPick).click();
      await expect(chip(L.doneList)).toBeVisible({ timeout: 8_000 });
      await chip(L.doneList).click();
      await expect(page.getByText(L.roleText, { exact: false })).toBeVisible({ timeout: 8_000 });
      await chip(L.rolePick).click();
      await expect(chip(L.doneList)).toBeVisible({ timeout: 8_000 });
      await chip(L.doneList).click();
      await expect(page.getByText(L.closingText, { exact: false })).toBeVisible({ timeout: 8_000 });

      // 10 · Reload: the site card and the recommendation are composer-persisted.
      await page.reload();
      await expect(page.getByTestId('cbo-site-card')).toBeVisible({ timeout: 20_000 });
      await expect(page.getByTestId('cbo-familia-reco')).toBeVisible();
    });
  });
}

test.describe('COUGAR — E2 linear journey, multi-bairro', () => {
  test.use({ locale: 'pt-BR' });

  test('two bairros → "qual bairro?" picker → focused map on the picked one', async ({ page, request }) => {
    const api = new TestApi(request);
    test.skip(!(await api.ping()).fakeModel, 'needs the fake model');

    await page.goto('/cbo-profile');
    const marker = page.getByTestId('cbo-stream-status');
    await expect(marker).toHaveAttribute('data-cbo-id', /.+/, { timeout: 30_000 });
    const cboId = (await marker.getAttribute('data-cbo-id'))!;
    await api.seedState(cboId, { phase: 2 });

    const chip = (label: string) =>
      page.locator(`[data-testid^="cbo-option-"][data-option-label="${label}"]`);

    // A two-zone map confirmation (same shape formatMapResult emits). Sent via
    // the API — the chat input is single-line, so a typed multiline payload
    // would collapse and never match the parser's ^-anchored zone lines. The
    // reload after rehydrates the served fork from the persisted transcript.
    const twoZones = [
      'Map selection (composite mode):',
      '- [zone] Bela Vista: HIGH risk, intervention: flood parks, area: 1.2 km², pop: 11.128, flood: 78%, heat: 41%, landslide: 12%, at (-30.0327, -51.1898)',
      '- [zone] Santana: MEDIUM risk, intervention: green corridors, area: 1.6 km², pop: 20.000, flood: 35%, heat: 62%, landslide: 8%, at (-30.0450, -51.2050)',
      'Total: 2 assets, 0 sampled points',
    ].join('\n');
    await request.post(`/api/cbo/${cboId}/chat`, { data: { message: twoZones, lang: 'pt', turnKind: 'map' } });
    await page.reload();

    // Fork appears; "Sim" now routes through the bairro picker, one chip each.
    await expect(page.getByText('lugar específico', { exact: false })).toBeVisible({ timeout: 10_000 });
    await chip('Sim, tenho um lugar').click();
    await expect(page.getByText('Em qual bairro fica o lugar?', { exact: false })).toBeVisible({ timeout: 8_000 });
    await expect(chip('Bela Vista')).toBeVisible();
    await expect(chip('Santana')).toBeVisible();

    // Picking one opens the focused site session inside THAT bairro.
    await chip('Santana').click();
    await expect(page.getByTestId('map-simple-chooser')).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText('em Santana', { exact: false })).toBeVisible();
  });
});

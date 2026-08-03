import { test, expect, devices } from '@playwright/test';
import { TestApi } from './helpers/testApi';
import { clickCenterZone } from './helpers/mapActions';

// The W2 diagnostic beats (/refine 2026-07-31): frame → worry → story → photos
// → read-back → famílias. Everything here is server-templated, so a fall-through
// to the model would strand the flow — same contract as the linear-journey spec.
//
// Runs at an iPhone-sized viewport with touch: this cohort is mobile-first, and
// the beats add three new chip screens plus a long templated message, which is
// exactly where vertical density and horizontal overflow go wrong.

const SHOTS = 'test-results/w2-diagnostic-shots';

test.use({ ...devices['iPhone 14 Pro'], locale: 'pt-BR' });

/** Drive a fresh CBO to the point where the diagnostic beats begin. */
async function toTenureAnswered(page: any, request: any) {
  const api = new TestApi(request);
  await page.goto('/cbo-profile');
  const marker = page.getByTestId('cbo-stream-status');
  await expect(marker).toHaveAttribute('data-cbo-id', /.+/, { timeout: 30_000 });
  const cboId = (await marker.getAttribute('data-cbo-id'))!;
  await api.seedState(cboId, { phase: 2, language: 'pt' });

  const chip = (label: string) =>
    page.locator(`[data-testid^="cbo-option-"][data-option-label="${label}"]`);
  const input = page.getByTestId('cbo-chat-input');

  await input.fill('Vamos começar o Encontro 2.');
  await input.press('Enter');
  await expect(chip('Já conheço SbN — pular')).toBeVisible({ timeout: 20_000 });
  await chip('Já conheço SbN — pular').click();
  await chip('Um bairro').click();

  await expect(page.locator('.leaflet-container').first()).toBeVisible({ timeout: 25_000 });
  const tourNext = page.getByTestId('map-tour-next');
  await expect(tourNext).toBeVisible({ timeout: 20_000 });
  for (let i = 0; i < 3; i++) await tourNext.click();
  await expect(tourNext).toHaveCount(0, { timeout: 10_000 });
  // Retry the zone tap: at an iPhone viewport the map is small enough that the
  // centre point can land outside the zone polygon (or before the zone layer
  // paints), leaving the confirm button disabled. The desktop journey spec
  // never sees this — it is specifically a small-viewport flake.
  const confirmBairro = page.getByTestId('map-confirm-bairro');
  await pickAnyZone(page, confirmBairro);
  await expect(confirmBairro).toBeEnabled({ timeout: 10_000 });
  await confirmBairro.click();

  await expect(chip('Sim, tenho um lugar')).toBeVisible({ timeout: 15_000 });
  await chip('Sim, tenho um lugar').click();
  await expect(page.getByTestId('map-simple-chooser')).toBeVisible({ timeout: 25_000 });
  await page.getByTestId('map-simple-pin').click();
  await page.waitForTimeout(500);
  const box = (await page.locator('.leaflet-container').first().boundingBox())!;
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  const confirmSite = page.getByTestId('map-confirm-site');
  await expect(confirmSite).toBeEnabled({ timeout: 10_000 });
  await confirmSite.click();

  await expect(page.getByTestId('cbo-site-card')).toBeVisible({ timeout: 15_000 });
  // Wait for each chip to actually render before tapping: the composer
  // re-renders as the checkpoint streams, and clicking into that gap silently
  // drops the tap, which then times out at the NEXT assertion.
  const tap = async (label: string) => {
    await expect(chip(label)).toBeVisible({ timeout: 15_000 });
    await chip(label).click();
  };
  await tap('Confirmar ✓');
  await expect(page.getByText('Como é esse lugar hoje', { exact: false })).toBeVisible({ timeout: 15_000 });
  await tap('Abandonado / degradado');
  await expect(page.getByText('acesso a esse espaço', { exact: false })).toBeVisible({ timeout: 15_000 });
  await tap('É da prefeitura, mas a gente usa');
  return { cboId, chip, input, tap };
}

/**
 * Select any bairro, jittering the tap position.
 *
 * `clickCenterZone` taps the exact centre of the map. At an iPhone viewport
 * that point regularly lands on water or a gap between polygons, and retrying
 * the SAME coordinate cannot fix a position problem — only a timing one. Walk
 * outwards until something selects.
 */
async function pickAnyZone(page: any, confirmBairro: any) {
  await clickCenterZone(page);
  await page.waitForTimeout(500);
  if (await confirmBairro.isEnabled().catch(() => false)) return;
  const box = (await page.locator('.leaflet-container').first().boundingBox())!;
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  const offsets = [[0, -60], [0, 60], [-60, 0], [60, 0], [-50, -50], [50, 50], [0, -110], [0, 110]];
  for (const [dx, dy] of offsets) {
    await page.mouse.click(cx + dx, cy + dy);
    await page.waitForTimeout(450);
    if (await confirmBairro.isEnabled().catch(() => false)) return;
  }
}

/** No horizontal overflow at 390px — the whole page, not just the viewport. */
async function assertNoHScroll(page: any, where: string) {
  const overflow = await page.evaluate(() => ({
    doc: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    body: document.body.scrollWidth - document.body.clientWidth,
  }));
  expect(overflow.doc, `horizontal overflow at ${where}`).toBeLessThanOrEqual(1);
  expect(overflow.body, `horizontal body overflow at ${where}`).toBeLessThanOrEqual(1);
}

test.describe('COUGAR — W2 diagnostic beats', () => {
  test('happy path: frame → worry → story → photos → read-back → famílias', async ({ page, request }) => {
    const api = new TestApi(request);
    test.skip(!(await api.ping()).fakeModel, 'needs the fake model env');
    const errors: string[] = [];
    page.on('pageerror', e => errors.push(e.message));

    const { cboId, chip, input, tap } = await toTenureAnswered(page, request);

    // Beat 0 + 1 — the frame, then the worry chips ordered by bairro data.
    await expect(page.getByText('nosso mapa é', { exact: false })).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText('mais preocupa', { exact: false })).toBeVisible();
    await assertNoHScroll(page, 'beat 1 worry');
    await page.waitForTimeout(1400);
    await page.screenshot({ path: `${SHOTS}/01-frame-worry.png`, fullPage: false });

    await tap('💧 Alagamento');
    await tap('Pronto ✓');

    // Beat 2 — the story prompt, with the voice-note invitation.
    await expect(page.getByText('palavras de vocês', { exact: false })).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText('gravar um áudio', { exact: false })).toBeVisible();
    await assertNoHScroll(page, 'beat 2 story');
    await page.waitForTimeout(1400);
    await page.screenshot({ path: `${SHOTS}/02-story-prompt.png`, fullPage: false });

    // A free-text answer (this is also how a transcribed voice note arrives).
    await input.fill('A água entra pela rua quando chove forte e fica parada uns dois dias no canto do terreno. O chão vira lama.');
    await input.press('Enter');

    // Beat 3 — photo prompts, routed by the flood answer.
    await expect(page.getByText('fotos ajudam', { exact: false })).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText('Por onde a água entra', { exact: false })).toBeVisible();
    await expect(page.getByText('qualquer outra coisa', { exact: false })).toBeVisible();
    await assertNoHScroll(page, 'beat 3 photos');
    await page.waitForTimeout(1400);
    await page.screenshot({ path: `${SHOTS}/03-photos-routed.png`, fullPage: false });

    await tap('Não tenho agora');

    // Beat 4 — the read-back: our data states a bairro average, they correct it.
    await expect(page.getByText('média do bairro', { exact: false })).toBeVisible({ timeout: 10_000 });
    await assertNoHScroll(page, 'beat 4 read-back');
    await page.waitForTimeout(1400);
    await page.screenshot({ path: `${SHOTS}/04-readback.png`, fullPage: false });
    await tap('Aqui é pior');

    // Beat 5 — famílias, explicitly non-prescriptive.
    const reco = page.getByTestId('cbo-familia-reco');
    await expect(reco).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText('Nada fica descartado', { exact: false })).toBeVisible();
    await assertNoHScroll(page, 'beat 5 famílias');
    await page.waitForTimeout(1400);
    await page.screenshot({ path: `${SHOTS}/05-familias.png`, fullPage: false });

    // Everything the diagnostic captured actually persisted.
    const body = await (await request.get(`/api/cbo/${cboId}`)).json();
    const f = body.state?.sections?.intervention_site?.fields ?? {};
    expect(String(f.site_worry?.value)).toContain('flood');
    expect(String(f.site_story?.value)).toContain('dois dias');
    expect(String(f.site_photo_intent?.value)).toBe('skip');
    expect(JSON.parse(String(f._hazard_check_json?.value))).toMatchObject({ flood: 'worse' });

    expect(errors, `page errors: ${errors.join(' | ')}`).toHaveLength(0);
  });

  test('fail path: skip everything — still reaches famílias, depth reads thin', async ({ page, request }) => {
    const api = new TestApi(request);
    test.skip(!(await api.ping()).fakeModel, 'needs the fake model env');
    const { cboId, tap } = await toTenureAnswered(page, request);

    await expect(page.getByText('mais preocupa', { exact: false })).toBeVisible({ timeout: 10_000 });
    // Worry is the one beat with no skip chip — pick, then close immediately.
    await tap('💧 Alagamento');
    await tap('Pronto ✓');
    await expect(page.getByText('palavras de vocês', { exact: false })).toBeVisible({ timeout: 10_000 });
    await tap('Prefiro pular');
    await expect(page.getByText('fotos ajudam', { exact: false })).toBeVisible({ timeout: 10_000 });
    await tap('Não tenho agora');
    // "Não sei dizer" must widen, never stall.
    await expect(page.getByText('média do bairro', { exact: false })).toBeVisible({ timeout: 10_000 });
    await tap('Não sei dizer');
    await expect(page.getByTestId('cbo-familia-reco')).toBeVisible({ timeout: 15_000 });

    const body = await (await request.get(`/api/cbo/${cboId}`)).json();
    const f = body.state?.sections?.intervention_site?.fields ?? {};
    expect(String(f.site_story?.value ?? '')).toBe('');
    expect(JSON.parse(String(f._hazard_check_json?.value))).toMatchObject({ flood: 'unsure' });

    // The point of this scenario: taps alone must still leave the coordination
    // something to work with, and a depth read must exist even though the org
    // never reached the interest/role loops or the close.
    const depth = JSON.parse(String(f._depth_json?.value ?? '{}'));
    expect(depth.level, 'a depth read must exist mid-session').toBeTruthy();
    expect(String(f.site_worry?.value)).toContain('flood');   // what worries them
    expect(String(f.current_use?.value)).toBeTruthy();        // what the place is
    expect(String(f.land_tenure?.value)).toBeTruthy();        // whether they can use it
    expect(String(f.site_name?.value)).toBeTruthy();          // where it is
    expect(String(f.site_photo_intent?.value)).toBe('skip');  // and that they declined
    // "I can't say" is a real answer and must be legible as a known unknown.
    expect(JSON.stringify(depth.unknowns)).toMatch(/alagamento|flooding/);
  });

  test('fail path: "Outra coisa" free text, and a reload mid-beat resumes', async ({ page, request }) => {
    const api = new TestApi(request);
    test.skip(!(await api.ping()).fakeModel, 'needs the fake model env');
    const { cboId, chip, input, tap } = await toTenureAnswered(page, request);

    await expect(page.getByText('mais preocupa', { exact: false })).toBeVisible({ timeout: 10_000 });
    await chip('Outra coisa').click();
    // "Me conta:" disambiguates the free-text follow-up from the chip question,
    // which shares the rest of its wording.
    await expect(page.getByText('Me conta:', { exact: false })).toBeVisible({ timeout: 10_000 });

    // Reload while the free-text turn is pending — the flow must not lose it.
    await page.reload();
    await expect(page.getByTestId('cbo-stream-status')).toHaveAttribute('data-cbo-id', /.+/, { timeout: 30_000 });
    const input2 = page.getByTestId('cbo-chat-input');
    await input2.fill('Lixo acumulado e falta de sombra no pátio');
    await input2.press('Enter');

    // Free text captured → straight to the story beat.
    await expect(page.getByText('palavras de vocês', { exact: false })).toBeVisible({ timeout: 20_000 });
    const body = await (await request.get(`/api/cbo/${cboId}`)).json();
    const f = body.state?.sections?.intervention_site?.fields ?? {};
    expect(String(f.site_worry?.value)).toContain('Lixo acumulado');
  });

  test('scale honesty fires when the story describes a catastrophic flood', async ({ page, request }) => {
    const api = new TestApi(request);
    test.skip(!(await api.ping()).fakeModel, 'needs the fake model env');
    const { chip, input, tap } = await toTenureAnswered(page, request);

    await expect(page.getByText('mais preocupa', { exact: false })).toBeVisible({ timeout: 10_000 });
    await chip('💧 Alagamento').click();
    await chip('Pronto ✓').click();
    await expect(page.getByText('palavras de vocês', { exact: false })).toBeVisible({ timeout: 10_000 });

    await input.fill('Na enchente de 2024 a água do Guaíba subiu e tomou tudo aqui, o dique não segurou.');
    await input.press('Enter');

    // The honest scale framing, sourced from Conceito Arte's technical note.
    await expect(page.getByText('obras de macrodrenagem', { exact: false })).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText('não diminui o projeto', { exact: false })).toBeVisible();
    await page.waitForTimeout(1400);
    await page.screenshot({ path: `${SHOTS}/06-scale-honesty.png`, fullPage: false });
  });

  test('scale honesty stays silent for an everyday-water story', async ({ page, request }) => {
    const api = new TestApi(request);
    test.skip(!(await api.ping()).fakeModel, 'needs the fake model env');
    const { chip, input, tap } = await toTenureAnswered(page, request);

    await expect(page.getByText('mais preocupa', { exact: false })).toBeVisible({ timeout: 10_000 });
    await chip('💧 Alagamento').click();
    await chip('Pronto ✓').click();
    await expect(page.getByText('palavras de vocês', { exact: false })).toBeVisible({ timeout: 10_000 });

    await input.fill('Quando chove a água empoça no canto e demora pra escoar, mas nada grave.');
    await input.press('Enter');

    await expect(page.getByText('fotos ajudam', { exact: false })).toBeVisible({ timeout: 20_000 });
    // An unprompted lecture about limits is its own kind of discouragement.
    await expect(page.getByText('obras de macrodrenagem', { exact: false })).toHaveCount(0);
  });
});

// ---------------------------------------------------------------------------
// Degraded scenarios (JVP, 2026-07-31): what does W2 still learn when the org
// has no site, disagrees with everything, or shares nothing but taps?
// ---------------------------------------------------------------------------

/** Stop at the bairro confirmation — before the "tem um lugar?" fork. */
async function toBairroConfirmed(page: any, request: any) {
  const api = new TestApi(request);
  await page.goto('/cbo-profile');
  const marker = page.getByTestId('cbo-stream-status');
  await expect(marker).toHaveAttribute('data-cbo-id', /.+/, { timeout: 30_000 });
  const cboId = (await marker.getAttribute('data-cbo-id'))!;
  await api.seedState(cboId, { phase: 2, language: 'pt' });

  const chip = (label: string) =>
    page.locator(`[data-testid^="cbo-option-"][data-option-label="${label}"]`);
  const input = page.getByTestId('cbo-chat-input');
  const tap = async (label: string) => {
    await expect(chip(label)).toBeVisible({ timeout: 15_000 });
    await chip(label).click();
  };

  await input.fill('Vamos começar o Encontro 2.');
  await input.press('Enter');
  await tap('Já conheço SbN — pular');
  await tap('Um bairro');

  await expect(page.locator('.leaflet-container').first()).toBeVisible({ timeout: 25_000 });
  const tourNext = page.getByTestId('map-tour-next');
  await expect(tourNext).toBeVisible({ timeout: 20_000 });
  for (let i = 0; i < 3; i++) await tourNext.click();
  await expect(tourNext).toHaveCount(0, { timeout: 10_000 });
  const confirmBairro = page.getByTestId('map-confirm-bairro');
  await pickAnyZone(page, confirmBairro);
  await expect(confirmBairro).toBeEnabled({ timeout: 10_000 });
  await confirmBairro.click();
  return { cboId, chip, input, tap };
}

test.describe('COUGAR — W2 degraded scenarios', () => {
  test('org has no site: does the diagnostic still run?', async ({ page, request }) => {
    const api = new TestApi(request);
    test.skip(!(await api.ping()).fakeModel, 'needs the fake model env');
    const { cboId, tap } = await toBairroConfirmed(page, request);

    await expect(page.getByText('lugar específico', { exact: false })).toBeVisible({ timeout: 15_000 });
    await tap('Ainda não');
    await tap('Vou verificar e volto');
    // The fork keeps "Já sei o lugar" reachable; take the questions branch.
    await tap('Pode perguntar');

    // The diagnostic must still happen — the bairro IS a place, and an org
    // without a site is exactly the one the coordination most needs read.
    await expect(page.getByText('mais preocupa', { exact: false })).toBeVisible({ timeout: 15_000 });
    await tap('💧 Alagamento');
    await tap('Pronto ✓');
    await expect(page.getByText('palavras de vocês', { exact: false })).toBeVisible({ timeout: 15_000 });
    await tap('Prefiro pular');
    await expect(page.getByText('fotos ajudam', { exact: false })).toBeVisible({ timeout: 15_000 });
    await tap('Não tenho agora');
    await expect(page.getByText('média do bairro', { exact: false })).toBeVisible({ timeout: 15_000 });
    await tap('É mais ou menos isso');
    await expect(page.getByTestId('cbo-familia-reco')).toBeVisible({ timeout: 15_000 });

    const body = await (await request.get(`/api/cbo/${cboId}`)).json();
    const f = body.state?.sections?.intervention_site?.fields ?? {};
    expect(String(f.site_worry?.value)).toContain('flood');
    expect(String(f.bairro?.value ?? '')).not.toBe('');
  });

  test('org disagrees with everything: the disagreement is captured, not lost', async ({ page, request }) => {
    const api = new TestApi(request);
    test.skip(!(await api.ping()).fakeModel, 'needs the fake model env');
    const { cboId, tap, chip } = await toTenureAnswered(page, request);

    await expect(page.getByText('mais preocupa', { exact: false })).toBeVisible({ timeout: 10_000 });
    // Pick the hazard our data ranks LOWEST for this bairro — a direct
    // contradiction of the raster, which must be recorded as a finding.
    await tap('⛰️ O barranco');
    await tap('Pronto ✓');
    await expect(page.getByText('palavras de vocês', { exact: false })).toBeVisible({ timeout: 10_000 });
    await tap('Prefiro pular');
    await expect(page.getByText('fotos ajudam', { exact: false })).toBeVisible({ timeout: 10_000 });
    await tap('Não tenho agora');
    // Contradict the read-back too.
    await expect(page.getByText('média do bairro', { exact: false })).toBeVisible({ timeout: 10_000 });
    await tap('Aqui é pior');
    if (await chip('Aqui é pior').isVisible().catch(() => false)) await tap('Aqui é pior');
    await expect(page.getByTestId('cbo-familia-reco')).toBeVisible({ timeout: 15_000 });

    const body = await (await request.get(`/api/cbo/${cboId}`)).json();
    const f = body.state?.sections?.intervention_site?.fields ?? {};
    const depth = JSON.parse(String(f._depth_json?.value ?? '{}'));
    // Whatever else happens, a total contradiction must reach the coordinator.
    expect(String(f.site_worry?.value)).toContain('landslide');
    expect(JSON.stringify(depth.disagreements ?? [])).toMatch(/deslizamento|bairro/);
  });
});

import { test, expect, type Page } from '@playwright/test';
import { TestApi } from '../helpers/testApi';

// A RECORDING, not a gate. Walks Encontro 3 end to end at a phone viewport,
// paced so a person can read it, and Playwright records the video.
//
//   RECORD_W3=1 E2E_VIDEO=on npx playwright test e2e/quality/w3-walkthrough.spec.ts
//
// Self-skips otherwise: it sleeps on purpose for two minutes, which in the
// normal suite would be two minutes stolen from every other spec's timeout
// budget (see the CBO_SSE_PING_MS note in playwright.config.ts for the same
// reasoning applied the other way).
//
// The org is Raízes do Sarandi with its Encontro 2 already complete — the
// richest real record we have — because the point of the recording is what W3
// does with a good W2, not how it copes with a thin one. docs/w3-test-kit has
// the four scenarios that cover the rest.

const RUN = process.env.RECORD_W3 === '1';

/** Pacing. A test runs as fast as the machine allows; a video has to be read. */
const READ = Number(process.env.W3_READ_MS || 2200);
const beat = (page: Page, ms = READ) => page.waitForTimeout(ms);

const W2_COMPLETE = [
  { sectionId: 'org_profile', field: 'org_name', value: 'Horta Comunitária Raízes do Sarandi' },
  { sectionId: 'org_profile', field: 'contact_name', value: 'Marlene Duarte' },
  { sectionId: 'org_profile', field: 'contact_role', value: 'coordenadora' },
  { sectionId: 'org_profile', field: 'mission_summary', value: 'Cultivo comunitário e segurança alimentar no Sarandi.' },
  { sectionId: 'org_profile', field: 'year_founded', value: '2014' },
  { sectionId: 'org_profile', field: 'team_size', value: '22' },
  { sectionId: 'org_profile', field: 'has_cnpj', value: 'yes' },
  { sectionId: 'org_profile', field: 'biggest_project_budget', value: 'R$ 80.000' },
  { sectionId: 'org_profile', field: 'prior_project_scale', value: 'funded' },
  { sectionId: 'intervention_site', field: 'bairro', value: 'Sarandi' },
  { sectionId: 'intervention_site', field: 'site_name', value: 'Terreno ao lado da horta' },
  { sectionId: 'intervention_site', field: '_site_lat', value: '-30.0906' },
  { sectionId: 'intervention_site', field: '_site_lng', value: '-51.1726' },
  { sectionId: 'intervention_site', field: 'current_use', value: 'abandoned' },
  { sectionId: 'intervention_site', field: 'land_tenure', value: 'public-informal' },
  { sectionId: 'intervention_site', field: 'site_worry', value: 'alagamento' },
  {
    sectionId: 'intervention_site',
    field: 'site_story',
    value: 'Quando chove forte a água entra pelo fundo e fica dias parada.',
  },
  { sectionId: 'intervention_site', field: 'site_knowledge_depth', value: 'strong' },
  { sectionId: 'intervention_site', field: 'nbs_interest', value: 'aguas-pluviais' },
  // Skips Encontro 3's deliberation beats (criteria · who would do it · what is hardest) — this spec
  // is about something else. They are covered by e2e/cougar-e3-deliberation.spec.ts and the fuzzer.
  { sectionId: 'intervention_type', field: '_quick_tests', value: 'yes' },
  // ⚠️ This spec walks the DETAILING TAIL, which the product no longer opens:
  // Encontro 3 ends at the comparison since 2026-09-21 (e2e/cougar-e3-ends-at-comparison.spec.ts).
  // The beats are kept as Encontro 4's raw material, and this per-session switch keeps them tested.
  { sectionId: 'intervention_type', field: '_tail_enabled', value: 'yes' },
  // The territorial context the map already knew and the server used to discard.
  { sectionId: 'intervention_site', field: 'bairro_population', value: '59707' },
  { sectionId: 'intervention_site', field: 'bairro_poverty_pct', value: '23.4' },
  { sectionId: 'intervention_site', field: '_bairro_flood_pct', value: '80' },
];

test.describe('W3 walkthrough — a recording', () => {
  test.skip(!RUN, 'Set RECORD_W3=1 (and E2E_VIDEO=on) to record.');
  // The phone, because that is where the organisations are — and the
  // projector, because on 30 September that is where the room looks.
  const wide = process.env.RECORD_W3_WIDE === '1';
  test.use({ locale: 'pt-BR', viewport: wide ? { width: 1366, height: 768 } : { width: 390, height: 844 } });
  test.setTimeout(300_000);

  test('do lugar marcado ao projeto com preço', async ({ page, request }) => {
    const api = new TestApi(request);
    await page.goto('/cbo-profile');
    const marker = page.getByTestId('cbo-stream-status');
    await expect(marker).toHaveAttribute('data-cbo-id', /.+/, { timeout: 30_000 });
    const cboId = (await marker.getAttribute('data-cbo-id'))!;
    await api.seedState(cboId, { phase: 3, language: 'pt', sections: W2_COMPLETE });
    // Reload so the client picks the seeded phase up. Without this the header
    // reads "Seção 1 de 5 · Quem somos" through the whole of Encontro 3 — the
    // page loaded before the seed landed and never refetched. Harmless in an
    // assertion-driven spec; in a recording it is a lie on screen for 80
    // seconds, in the one frame everyone reads first.
    await page.reload();
    // The status marker is aria-hidden by design — assert the attribute, not
    // visibility.
    await expect(page.getByTestId('cbo-stream-status'))
      .toHaveAttribute('data-phase', '3', { timeout: 20_000 });

    const chip = (label: string) =>
      page.locator(`[data-testid^="cbo-option-"][data-option-label="${label}"]`);
    const input = page.getByTestId('cbo-chat-input');
    // Scope every text assertion to the thread. The right-hand "Perfil" panel
    // renders a field table whose row labels repeat the questions verbatim
    // ("Como é o lugar hoje"), so an unscoped getByText resolves to a hidden
    // table cell and waits forever for it to become visible.
    const thread = page.getByTestId('cbo-chat-thread');
    const inThread = (text: string) => thread.getByText(text, { exact: false }).last();
    /** Type like a person, not like a clipboard. */
    const say = async (text: string) => {
      await input.click();
      await input.type(text, { delay: 22 });
      await beat(page, 700);
      await input.press('Enter');
    };

    // ── 1 · The opening names the place W2 marked ────────────────────────────
    await beat(page, 1200);
    await say('Vamos começar o Encontro 3.');
    await expect(chip('É isso ✓')).toBeVisible({ timeout: 20_000 });
    await beat(page);
    await chip('É isso ✓').click();

    // ── 1b · The door: what is missing, before anything is read ─────────────
    await expect(chip('Já mandamos tudo')).toBeVisible({ timeout: 20_000 });
    await beat(page, READ + 1600);
    await chip('Já mandamos tudo').click();

    // ── 2 · Solutions, not famílias — each with what it will cost in effort ──
    await expect(page.getByTestId('cbo-solution-options')).toBeVisible({ timeout: 15_000 });
    await beat(page, READ + 1500);
    // Open one ficha, because that is what an organisation actually does before
    // committing to a solution.
    await page.getByTestId('solution-option-jardins-de-chuva').click();
    await beat(page, READ + 800);
    await page.mouse.wheel(0, 420);
    await beat(page, READ);
    await page.keyboard.press('Escape');
    await beat(page, 900);
    await chip('Jardins de chuva').click();

    // ── 3 · Who has to say yes, straight from the ficha ──────────────────────
    await expect(chip('Desenhar no mapa')).toBeVisible({ timeout: 15_000 });
    await beat(page, READ + 1800);
    await chip('Desenhar no mapa').click();

    // ── 4 · The footprint: satellite, on their own place, drawing armed ──────
    const map = page.locator('.leaflet-container').first();
    await expect(map).toBeVisible({ timeout: 30_000 });
    // Let the view settle on the site before tracing — it re-centres a couple of
    // times while the panel finishes opening.
    await beat(page, READ + 2200);
    const box = (await map.boundingBox())!;
    const cx = box.x + box.width / 2;
    const cy = box.y + box.height / 2;
    // At projector width the same gesture covers a hectare — a real yard is
    // a few hundred square metres, and a demo that prices a R$ 6M rain garden
    // is a demo about the wrong thing.
    const d = wide ? 25 : Math.min(box.width, box.height) / 5;
    // Trace it slowly — the corners are the point of the shot.
    for (const [x, y] of [[cx - d, cy - d], [cx + d, cy - d], [cx + d, cy + d]] as const) {
      await page.mouse.move(x, y, { steps: 12 });
      await beat(page, 550);
      await page.mouse.click(x, y);
    }
    await page.mouse.move(cx - d, cy + d, { steps: 12 });
    await beat(page, 550);
    await page.mouse.dblclick(cx - d, cy + d);

    const confirm = page.getByTestId('map-confirm-site');
    await expect(confirm).toBeEnabled({ timeout: 15_000 });
    // The button carries the number — hold on it, it is the whole argument for
    // this step existing.
    await beat(page, READ + 1200);
    await confirm.click();

    // ── 5 · The price, off the ficha's own published R$/m² ───────────────────
    await expect(inThread('pedir cotação'))
      .toBeVisible({ timeout: 20_000 });
    await beat(page, READ + 1800);

    // ── 5a · THE TEST CARD. What it needs, what blocks it, what it does, what
    //         it costs — and one reaction, theirs. Hold on it: this is what the
    //         room reads on 30 September.
    const card = page.getByTestId('cbo-solution-test-jardins-de-chuva');
    await expect(card).toBeVisible({ timeout: 20_000 });
    await card.scrollIntoViewIfNeeded();
    await beat(page, READ + 3200);
    await chip('Faz sentido pra gente').click();
    // The ficha's decisive detail for a rain garden: the soil.
    await expect(chip('Mais barro — a água empoça')).toBeVisible({ timeout: 15_000 });
    await beat(page, READ + 900);
    await chip('Mais barro — a água empoça').click();
    // The loop question, and — for the walkthrough — straight to the comparison.
    await expect(chip('Ver a comparação')).toBeVisible({ timeout: 15_000 });
    await beat(page, READ + 600);
    await chip('Ver a comparação').click();
    const cmp = page.getByTestId('cbo-comparison');
    await expect(cmp).toBeVisible({ timeout: 20_000 });
    await cmp.scrollIntoViewIfNeeded();
    await beat(page, READ + 2600);
    await chip('Detalhar agora').click();

    // ── 5b · Who builds it. The answer that moves the cost more than any
    //         other, and the one the original W3 design had and the build lost.
    await expect(chip('Mutirão com apoio técnico')).toBeVisible({ timeout: 15_000 });
    await beat(page, READ + 900);
    await chip('Mutirão com apoio técnico').click();

    // ── 6 · Why here, and what the place is like now ─────────────────────────
    await say('É o único terreno livre do quarteirão e é onde a água toda desce quando chove.');
    await expect(inThread('como é o lugar hoje'))
      .toBeVisible({ timeout: 20_000 });
    await beat(page, READ);
    await say('Terra batida com entulho de obra, sem drenagem nenhuma. Depois da chuva fica poça três dias.');

    // ── 6b · The figure and its scale note were on the test card; the one
    //          reaction there covered the solution and the number both.
    await expect(chip('1 ano')).toBeVisible({ timeout: 15_000 });
    await chip('1 ano').click();
    await expect(chip('Com uma universidade ou parceiro')).toBeVisible({ timeout: 15_000 });
    await beat(page, READ);
    await chip('Com uma universidade ou parceiro').click();

    // ── 7 · Upkeep — and the rule that only shows on public land ─────────────
    await expect(inThread('quem cuida disso no dia a dia'))
      .toBeVisible({ timeout: 20_000 });
    await beat(page, READ);
    await chip('Parceria com a prefeitura').click();
    await expect(chip('A cada três meses')).toBeVisible({ timeout: 15_000 });
    await beat(page, READ - 600);
    await chip('A cada três meses').click();

    // ── 8 · Money — "ainda não sabemos" is a real answer ─────────────────────
    await expect(inThread('dinheiro que volta todo ano'))
      .toBeVisible({ timeout: 20_000 });
    await beat(page, READ + 1000);
    await chip('Ainda não sabemos').click();

    // ── 8b · "We don't know" gets one more road: who pays the bills TODAY ────
    await expect(chip('A prefeitura')).toBeVisible({ timeout: 20_000 });
    await beat(page, READ + 600);
    await chip('A prefeitura').click();

    // ── 10 · The hoja de ruta — read it the way an organisation would ────────
    const roadmap = page.getByTestId('cbo-roadmap');
    await expect(roadmap).toBeVisible({ timeout: 25_000 });
    await beat(page, READ);
    await roadmap.scrollIntoViewIfNeeded();
    await beat(page, READ);
    // Scroll through slowly. This is the deliverable — every block carries where
    // it came from and what would change it, and that only reads if it is on
    // screen long enough to read.
    for (let i = 0; i < 20; i++) {
      await page.mouse.wheel(0, 200);
      await beat(page, 1150);
    }
    await beat(page, READ);

    // ── 11 · The copy that leaves the phone ─────────────────────────────────
    // Opens the printable page — Share → Print → Save as PDF from there. This
    // is the artefact they take into a room, so the recording ends on it.
    const printLink = page.getByTestId('roadmap-print');
    await expect(printLink).toBeVisible({ timeout: 15_000 });
    await printLink.scrollIntoViewIfNeeded();
    await beat(page, READ + 900);
    const printed = await Promise.all([
      page.context().waitForEvent('page'),
      printLink.click(),
    ]).then(([p]) => p);
    await printed.waitForLoadState('domcontentloaded');
    await printed.setViewportSize({ width: 390, height: 844 });
    await beat(page, READ + 1400);
    for (let i = 0; i < 10; i++) {
      await printed.mouse.wheel(0, 260);
      await printed.waitForTimeout(1000);
    }
    await printed.waitForTimeout(READ);
  });
});

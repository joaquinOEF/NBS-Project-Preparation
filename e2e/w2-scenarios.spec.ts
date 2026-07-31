import { test, expect, devices } from '@playwright/test';
import { TestApi } from './helpers/testApi';
import { clickCenterZone } from './helpers/mapActions';
import * as fs from 'fs';
import * as path from 'path';

// Runs the three test-kit scenarios end to end EXACTLY as the roteiros in
// docs/w2-test-kit/ describe them, and dumps the real transcript + captured
// state to test-results/w2-scenarios/ for the written report.
//
// These are observation runs, not gates: they assert only that each scenario
// reaches its end, so that a behaviour we did not predict shows up in the
// transcript instead of failing the run before it is recorded.

const KIT = path.join(process.cwd(), 'docs/w2-test-kit');
const OUT = path.join(process.cwd(), 'test-results/w2-scenarios');

test.use({ ...devices['iPhone 14 Pro'], locale: 'pt-BR' });

type Ctx = Awaited<ReturnType<typeof openSession>>;

async function openSession(page: any, request: any) {
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
    await expect(chip(label)).toBeVisible({ timeout: 20_000 });
    await chip(label).click();
  };
  const type = async (text: string) => {
    await input.fill(text);
    await input.press('Enter');
  };
  const upload = async (files: string[]) => {
    await page.locator('input[type="file"]').setInputFiles(files);
    await page.waitForTimeout(6000); // extraction + the synthetic chat turn
  };
  return { cboId, page, request, chip, input, tap, type, upload };
}

async function pickZone(page: any) {
  const confirmBairro = page.getByTestId('map-confirm-bairro');
  await clickCenterZone(page);
  await page.waitForTimeout(500);
  if (await confirmBairro.isEnabled().catch(() => false)) return confirmBairro;
  const box = (await page.locator('.leaflet-container').first().boundingBox())!;
  const cx = box.x + box.width / 2, cy = box.y + box.height / 2;
  for (const [dx, dy] of [[0, -60], [0, 60], [-60, 0], [60, 0], [-50, -50], [50, 50], [0, -110]]) {
    await page.mouse.click(cx + dx, cy + dy);
    await page.waitForTimeout(450);
    if (await confirmBairro.isEnabled().catch(() => false)) break;
  }
  return confirmBairro;
}

/** Chat up to the bairro confirmation — identical in all three roteiros. */
async function toBairro(c: Ctx) {
  await c.type('Vamos começar o Encontro 2.');
  await c.tap('Já conheço SbN — pular');
  await c.tap('Um bairro');
  await expect(c.page.locator('.leaflet-container').first()).toBeVisible({ timeout: 25_000 });
  const tourNext = c.page.getByTestId('map-tour-next');
  await expect(tourNext).toBeVisible({ timeout: 20_000 });
  for (let i = 0; i < 3; i++) await tourNext.click();
  await expect(tourNext).toHaveCount(0, { timeout: 10_000 });
  const confirm = await pickZone(c.page);
  await expect(confirm).toBeEnabled({ timeout: 10_000 });
  await confirm.click();
}

async function pinSite(c: Ctx) {
  await c.tap('Sim, tenho um lugar');
  await expect(c.page.getByTestId('map-simple-chooser')).toBeVisible({ timeout: 25_000 });
  await c.page.getByTestId('map-simple-pin').click();
  await c.page.waitForTimeout(500);
  const box = (await c.page.locator('.leaflet-container').first().boundingBox())!;
  await c.page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  const confirmSite = c.page.getByTestId('map-confirm-site');
  await expect(confirmSite).toBeEnabled({ timeout: 10_000 });
  await confirmSite.click();
}

/** Everything the run observed, for the written report. */
async function dump(c: Ctx, name: string, notes: Record<string, unknown>) {
  fs.mkdirSync(OUT, { recursive: true });
  const messages = await (await c.request.get(`/api/cbo/${c.cboId}/messages`)).json();
  const state = await (await c.request.get(`/api/cbo/${c.cboId}`)).json();
  const docsRaw = await (await c.request.get(`/api/cbo/${c.cboId}/documents`)).json().catch(() => ({}));
  const docs = (docsRaw?.documents ?? docsRaw ?? []) as any[];
  const fields = state.state?.sections?.intervention_site?.fields ?? {};
  const plain: Record<string, string> = {};
  for (const [k, v] of Object.entries<any>(fields)) plain[k] = String(v?.value ?? '');
  fs.writeFileSync(path.join(OUT, `${name}.json`), JSON.stringify({
    cboId: c.cboId,
    notes,
    fields: plain,
    depth: (() => { try { return JSON.parse(plain._depth_json || '{}'); } catch { return {}; } })(),
    documents: Array.isArray(docs) ? docs.map((d: any) => ({ filename: d.filename, kind: d.kind, summary: (d.summary || '').slice(0, 200) })) : [],
    messages: (messages as any[]).map(m => ({
      role: m.role, type: m.messageType,
      content: String(m.content ?? '').slice(0, 1800),
    })),
  }, null, 1));
}

test.describe('W2 test-kit scenarios', () => {
  test.describe.configure({ timeout: 180_000 });

  test('org 1 · Raízes do Sarandi — conta tudo', async ({ page, request }) => {
    const errors: string[] = [];
    page.on('pageerror', e => errors.push(e.message));
    const c = await openSession(page, request);
    const notes: Record<string, unknown> = {};

    await toBairro(c);
    await pinSite(c);
    await c.tap('Confirmar ✓');
    await c.tap('Abandonado / degradado');
    await c.tap('É da prefeitura, mas a gente usa');

    // Roteiro passo 9 — the worry chips, and the order they arrive in.
    await expect(page.getByText('mais preocupa', { exact: false })).toBeVisible({ timeout: 15_000 });
    notes.worryChipOrder = await page.locator('[data-testid^="cbo-option-"]').allTextContents();
    await c.tap('💧 Alagamento');
    await c.tap('Pronto ✓');

    // Passo 10 — the story that mentions 2024, the Guaíba and the dike.
    await expect(page.getByText('palavras de vocês', { exact: false })).toBeVisible({ timeout: 15_000 });
    await c.type(
      'Na enchente de 2024 a água do Guaíba subiu e tomou tudo aqui, o dique não segurou e a gente perdeu a horta inteira. ' +
      'Mas o que atrapalha todo mês não é isso. Quando chove forte a água desce da rua de cima e entra pelo canto do terreno, ' +
      'junta ali e demora uns dois dias pra ir embora. O chão vira lama e não dá pra pisar. A gente já perdeu muda de alface ' +
      'duas vezes assim. Quem usa o espaço é a gente e umas oito famílias da volta, tem uma composteira nossa no fundo e três ' +
      'bananeiras que sobreviveram.');

    await expect(page.getByText('fotos ajudam', { exact: false })).toBeVisible({ timeout: 25_000 });
    notes.scaleHonestyShown = await page.getByText('obras de macrodrenagem', { exact: false }).count() > 0;
    notes.photoPrompts = await page.locator('text=/📷|Por onde a água|meio do dia|barranco/').allTextContents();

    // Passo 11 — the three photos.
    await c.tap('Tenho arquivos pra anexar');
    const fotos = path.join(KIT, 'org-1-raizes-do-sarandi/fotos');
    try {
      await c.upload(fs.readdirSync(fotos).sort().map(f => path.join(fotos, f)));
      notes.uploadOk = true;
    } catch (e: any) {
      notes.uploadOk = false; notes.uploadError = String(e).slice(0, 300);
    }
    if (await c.chip('Pronto, pode seguir').isVisible().catch(() => false)) {
      await c.tap('Pronto, pode seguir');
    }

    // Passo 12 — the correction.
    await expect(page.getByText('média do bairro', { exact: false })).toBeVisible({ timeout: 25_000 });
    notes.readbackText = await page.locator('text=/Nosso mapa diz/').first().textContent().catch(() => null);
    await c.tap('Aqui é pior');

    // Passo 13 — did the correction reach the recommendation?
    await expect(page.getByTestId('cbo-familia-reco')).toBeVisible({ timeout: 20_000 });
    notes.recoWhys = await page.locator('[data-testid^="familia-reco-"]').allTextContents();
    notes.correctionEchoed = await page.getByText('Vocês disseram', { exact: false }).count() > 0;
    notes.nothingRuledOut = await page.getByText('Nada fica descartado', { exact: false }).count() > 0;
    await c.tap('Faz sentido');

    await c.tap('Gestão de Águas Pluviais');
    await c.tap('Agricultura Urbana');
    await c.tap('Pronto ✓');
    await c.tap('Executar / implementar');
    await c.tap('Articular parceiros');
    await c.tap('Pronto ✓');
    await page.waitForTimeout(2500);

    notes.pageErrors = errors;
    await dump(c, 'org-1', notes);
  });

  test('org 2 · Encosta Viva — discorda e não manda nada', async ({ page, request }) => {
    const errors: string[] = [];
    page.on('pageerror', e => errors.push(e.message));
    const c = await openSession(page, request);
    const notes: Record<string, unknown> = {};
    let taps = 0;
    const tapCount = async (l: string) => { taps++; await c.tap(l); };

    await toBairro(c);
    await pinSite(c);
    await tapCount('Confirmar ✓');
    await tapCount('Vegetação (área verde, mato, árvores)');
    await tapCount('É público mas não temos acesso garantido');

    await expect(page.getByText('mais preocupa', { exact: false })).toBeVisible({ timeout: 15_000 });
    notes.worryChipOrder = await page.locator('[data-testid^="cbo-option-"]').allTextContents();
    // Names the hazard our data ranks lowest almost everywhere in POA.
    await tapCount('⛰️ O barranco');
    await tapCount('Pronto ✓');

    await expect(page.getByText('palavras de vocês', { exact: false })).toBeVisible({ timeout: 15_000 });
    await tapCount('Prefiro pular');

    await expect(page.getByText('fotos ajudam', { exact: false })).toBeVisible({ timeout: 15_000 });
    notes.photoPromptsRoutedToSlope =
      (await page.getByText('barranco', { exact: false }).count()) > 0;
    notes.photoPromptText = await page.locator('text=/cara do barranco|Por onde a água|meio do dia/').allTextContents();
    await tapCount('Não tenho agora');

    // "I can't say" — twice if a second check is offered.
    await expect(page.getByText('média do bairro', { exact: false })).toBeVisible({ timeout: 15_000 });
    notes.readbackText = await page.locator('text=/Nosso mapa diz/').first().textContent().catch(() => null);
    await tapCount('Não sei dizer');
    if (await c.chip('Não sei dizer').isVisible().catch(() => false)) await tapCount('Não sei dizer');

    await expect(page.getByTestId('cbo-familia-reco')).toBeVisible({ timeout: 20_000 });
    notes.recoWhys = await page.locator('[data-testid^="familia-reco-"]').allTextContents();
    await tapCount('Faz sentido');
    await tapCount('Estabilização de Encostas e Solo');
    await tapCount('Pronto ✓');
    await tapCount('Ser consultada (dar opinião)');
    await tapCount('Pronto ✓');
    await page.waitForTimeout(2500);

    notes.tapsFromSiteCard = taps;
    notes.pageErrors = errors;
    await dump(c, 'org-2', notes);
  });

  test('org 3 · Vila Nova — sem lugar, com documento', async ({ page, request }) => {
    const errors: string[] = [];
    page.on('pageerror', e => errors.push(e.message));
    const c = await openSession(page, request);
    const notes: Record<string, unknown> = {};

    // Passo 0 — the PDF goes in BEFORE anything else.
    const pdf = path.join(KIT, 'org-3-vila-nova/nota-area-de-atuacao-vila-nova.pdf');
    try {
      await c.upload([pdf]);
      notes.pdfUploaded = true;
    } catch (e: any) {
      notes.pdfUploaded = false; notes.pdfError = String(e).slice(0, 300);
    }
    const docsAfter = await (await request.get(`/api/cbo/${c.cboId}/documents`)).json().catch(() => ({}));
    const docList = (docsAfter?.documents ?? docsAfter ?? []) as any[];
    notes.docsSeenByPlatform = Array.isArray(docList) ? docList.length : 0;
    notes.pdfTextExtracted = docList?.[0] ? String(docList[0].summary || '').slice(0, 240) : null;

    await toBairro(c);

    // Passo 5-7 — no site, then the fork.
    await expect(page.getByText('lugar específico', { exact: false })).toBeVisible({ timeout: 20_000 });
    await c.tap('Ainda não');
    await c.tap('Vou verificar e volto');
    notes.forkOffered = await c.chip('Pode perguntar').waitFor({ state: 'visible', timeout: 15_000 })
      .then(() => true).catch(() => false);
    notes.escapeStillThere = await c.chip('Já sei o lugar').isVisible().catch(() => false);
    await c.tap('Pode perguntar');

    await expect(page.getByText('mais preocupa', { exact: false })).toBeVisible({ timeout: 15_000 });
    notes.frameMentionsBairro = await page.getByText('dia a dia', { exact: false }).count() > 0;
    await c.tap('🌡️ Calor');
    await c.tap('Outra coisa');
    await expect(page.getByText('Me conta:', { exact: false })).toBeVisible({ timeout: 15_000 });
    await c.type('Lixo e entulho acumulado no terreno fechado');

    // Passo 9 — does it acknowledge the PDF before asking for the story?
    await expect(page.getByText('palavras de vocês', { exact: false })).toBeVisible({ timeout: 20_000 });
    notes.acknowledgedFile = await page.getByText('já mandaram', { exact: false }).count() > 0;
    notes.fileChipOffered = await c.chip('Já está no arquivo').isVisible().catch(() => false);
    if (notes.fileChipOffered) await c.tap('Já está no arquivo');
    else await c.tap('Prefiro pular');

    await expect(page.getByText('fotos ajudam', { exact: false })).toBeVisible({ timeout: 20_000 });
    notes.photoTextUsesBairro = await page.getByText('bairro que preocupa', { exact: false }).count() > 0;
    await c.tap('Mando depois');

    await expect(page.getByText('média do bairro', { exact: false })).toBeVisible({ timeout: 20_000 });
    notes.readbackText = await page.locator('text=/Nosso mapa diz/').first().textContent().catch(() => null);
    notes.readbackUsesDayToDay = await page.getByText('dia a dia de vocês', { exact: false }).count() > 0;
    await c.tap('Aqui é pior');

    await expect(page.getByTestId('cbo-familia-reco')).toBeVisible({ timeout: 20_000 });
    notes.recoWhys = await page.locator('[data-testid^="familia-reco-"]').allTextContents();
    await c.tap('Faz sentido');
    await c.tap('Infraestrutura Verde Urbana');
    await c.tap('Pronto ✓');
    await c.tap('Executar / implementar');
    await c.tap('Escrever o projeto');
    await c.tap('Pronto ✓');
    await page.waitForTimeout(2500);

    notes.closingOffersMapBack = await c.chip('Já sei o lugar').isVisible().catch(() => false);
    notes.pageErrors = errors;
    await dump(c, 'org-3', notes);
  });
});

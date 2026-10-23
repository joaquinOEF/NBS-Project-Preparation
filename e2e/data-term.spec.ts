import { test, expect, type Page } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { TestApi } from './helpers/testApi';
import { DATA_TERM } from '../shared/data-term';

// THE DATA TERM, ACCEPTED IN THE PLATFORM (23 Oct 2026, docs/data-term.md).
// Vila Flores: the organisations won't sign the term; they accept it the next
// time they open their link — full term, name, role, the Section 10 checkbox,
// "Aceitar" — once per organisation per version. The coordination exports who
// accepted, and the term stays linked from "Seus dados são seus".
//
// The suite runs with the gate off (CBO_DATA_TERM_GATE=off); each member here
// turns it back on through /__test/data-term/require.

const PHONE = { width: 390, height: 844 };

async function setup(page: Page, orgs: string[]) {
  const api = new TestApi(page.request);
  const tag = randomUUID().slice(0, 6);
  const cohort = (await api.createCohort(`Termo ${tag}`)).cohort;
  await api.createCoordinator({ email: `termo-${tag}@e2e.test`, password: 'pw-123456', cohortId: cohort.id });
  const members = [];
  for (const orgName of orgs) {
    const r = await api.inviteMember(cohort.id, { orgName, neighborhood: 'Restinga', withSession: true });
    const req = await page.request.post(`/__test/data-term/require/${r.member.id}`);
    expect(req.ok()).toBe(true);
    members.push({ ...r.member, inviteUrl: r.inviteUrl as string });
  }
  return { cohort, members };
}

test.describe('Termo de dados', () => {
  test.use({ locale: 'pt-BR' });

  test('the organisation reads the whole term on a phone, accepts once, and the coordination sees and exports it', async ({ page, browser }) => {
    test.setTimeout(120_000);
    const { cohort, members: [org, other] } = await setup(page, ['Horta da Restinga', 'Cozinha do Morro']);

    // The organisation, on its own phone — no coordinator cookie.
    const phone = await browser.newContext({ viewport: PHONE, locale: 'pt-BR', isMobile: true, hasTouch: true });
    const p = await phone.newPage();
    await p.goto(org.inviteUrl);
    const gate = p.getByTestId('data-term-gate');
    await expect(gate).toBeVisible({ timeout: 30_000 });
    // The whole term, every section, and Section 10's own checkbox wording.
    for (const s of DATA_TERM.sections) await expect(gate.getByRole('heading', { name: s.h })).toBeVisible();
    await expect(gate.getByText(`Versão ${DATA_TERM.version}`)).toBeVisible();
    await expect(p.getByTestId('data-term-form')).toContainText(DATA_TERM.checkbox);
    // Readable on a phone: nothing wider than the screen, body text 16px.
    const overflow = await gate.evaluate(el => el.scrollWidth - el.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
    const fontPx = await p.getByTestId('data-term-text').evaluate(el => parseFloat(getComputedStyle(el).fontSize));
    expect(fontPx).toBeGreaterThanOrEqual(16);

    // Nothing gets past it, and "Aceitar" waits for name, role and the box.
    await expect(p.getByTestId('button-data-notice')).toHaveCount(0);
    const accept = p.getByTestId('data-term-accept');
    await expect(accept).toBeDisabled();
    await p.getByTestId('data-term-jump').click();
    await p.getByTestId('data-term-name').fill('Maria da Silva');
    await p.getByTestId('data-term-role').fill('presidenta');
    await expect(accept).toBeDisabled();
    await p.getByTestId('data-term-checkbox').check();
    await expect(accept).toBeEnabled();
    await accept.click();
    await expect(gate).toBeHidden({ timeout: 15_000 });

    // Back on the same link (or another phone): no gate — it is the organisation's acceptance.
    const again = await (await browser.newContext({ viewport: PHONE, locale: 'pt-BR' })).newPage();
    await again.goto(org.inviteUrl);
    await expect(again.locator('body')).not.toContainText('Li e concordo', { timeout: 10_000 });
    await expect(again.getByTestId('data-term-gate')).toHaveCount(0);

    // The coordination: a mark on each card, the record in the drawer.
    await page.goto(`/orchestrator?cohort=${cohort.coordinatorSlug}`);
    await expect(page.getByTestId(`data-term-ok-${org.id}`)).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId(`data-term-pending-${other.id}`)).toBeVisible();
    await page.getByTestId(`card-orchestrator-project-${org.id}`).click();
    await expect(page.getByTestId('cbo-drawer-data-term')).toContainText('Maria da Silva (presidenta)');

    // The export: one row per organisation, pending included; the history has the evidence.
    const csv = await (await page.request.get(`/api/cohort/${cohort.coordinatorSlug}/data-term.csv`)).text();
    expect(csv).toMatch(/Horta da Restinga,aceito,Maria da Silva,presidenta,\d{4}-\d{2}-\d{2} \d{2}:\d{2},1\.0/);
    expect(csv).toContain(`Cozinha do Morro,pendente,,,,${DATA_TERM.version}`);
    const all = await (await page.request.get(`/api/cohort/${cohort.coordinatorSlug}/data-term.csv?all=1`)).text();
    expect(all).toContain('sessao_coordenacao');
    const row = all.split('\r\n').find(l => l.startsWith('Horta da Restinga'))!;
    expect(row).toMatch(/,[0-9a-f]{64},/);
    expect(row.endsWith(',não'), 'accepted from the organisation\'s phone, not a coordinator session').toBe(true);
    // Coordinator-only, like every /api/cohort route.
    const anon = await (await browser.newContext()).request.get(`/api/cohort/${cohort.coordinatorSlug}/data-term.csv`);
    expect(anon.status()).toBe(401);
    await phone.close();
  });

  test('the term stays readable: linked from "Seus dados são seus", and public at /termo-de-dados', async ({ page, browser }) => {
    test.setTimeout(90_000);
    const { members: [org] } = await setup(page, ['Horta da Lomba']);
    const p = await (await browser.newContext({ locale: 'pt-BR' })).newPage();
    await p.goto(org.inviteUrl);
    await p.getByTestId('data-term-name').fill('João Pereira');
    await p.getByTestId('data-term-role').fill('coordenador');
    await p.getByTestId('data-term-checkbox').check();
    await p.getByTestId('data-term-accept').click();
    await expect(p.getByTestId('data-term-gate')).toBeHidden({ timeout: 15_000 });

    // Past the term, the page goes on as before: the welcome, then the encontro.
    await p.getByTestId('button-cbo-welcome-cta').click({ timeout: 30_000 });
    const notice = p.getByTestId('button-data-notice').first();
    const preamble = p.getByTestId('button-encontro-1-start');
    await expect(notice.or(preamble).first()).toBeVisible({ timeout: 20_000 });
    if (await preamble.isVisible()) await preamble.click();
    await notice.click();
    const dialog = p.getByTestId('cbo-data-notice-dialog');
    // The short text names everyone Section 4 names — it may not say less than the term.
    for (const who of ['Vila Flores', 'Open Earth Foundation', 'Pyxera Global', 'Bankers without Boundaries']) {
      await expect(dialog).toContainText(who);
    }
    await expect(dialog).not.toContainText('está sendo preparado');
    await expect(p.getByTestId('cbo-data-notice-accepted')).toContainText('João Pereira');
    await expect(p.getByTestId('cbo-data-notice-full-term')).toHaveAttribute('href', '/termo-de-dados');

    const pub = await (await browser.newContext({ viewport: PHONE })).newPage();
    await pub.goto('/termo-de-dados');
    await expect(pub.getByTestId('data-term-page')).toBeVisible();
    for (const s of DATA_TERM.sections) await expect(pub.getByRole('heading', { name: s.h })).toBeVisible();
  });

  test('the server refuses an acceptance without the box, a name and role, or for a version not shown', async ({ page }) => {
    const { members: [org] } = await setup(page, ['Horta do Sarandi']);
    const post = (data: Record<string, unknown>) => page.request.post(`/api/cbo-member/${org.memberSlug}/data-term`, { data });
    const ok = { name: 'Ana Souza', role: 'tesoureira', agreed: true, version: DATA_TERM.version };
    expect((await post({ ...ok, agreed: false })).status()).toBe(400);
    expect((await post({ ...ok, role: ' ' })).status()).toBe(400);
    expect((await post({ ...ok, version: '0.9' })).status()).toBe(409);
    const r = await post(ok);
    expect(r.ok()).toBe(true);
    expect((await r.json()).dataTerm.accepted.name).toBe('Ana Souza');
  });

  test('accepted with a coordinator signed in on that browser: same gate, and the record says so', async ({ page }) => {
    test.setTimeout(90_000);
    const { cohort, members: [org] } = await setup(page, ['Horta do Humaitá']);
    await page.goto(org.inviteUrl);
    await page.getByTestId('data-term-name').fill('Carla Dias');
    await page.getByTestId('data-term-role').fill('vice-presidenta');
    await page.getByTestId('data-term-checkbox').check();
    await page.getByTestId('data-term-accept').click();
    await expect(page.getByTestId('data-term-gate')).toBeHidden({ timeout: 15_000 });
    const all = await (await page.request.get(`/api/cohort/${cohort.coordinatorSlug}/data-term.csv?all=1`)).text();
    expect(all.split('\r\n').find(l => l.startsWith('Horta do Humaitá'))!.endsWith(',sim')).toBe(true);
  });
});

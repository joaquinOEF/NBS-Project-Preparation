import { test, expect } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { TestApi } from './helpers/testApi';

// THE ORGANISATION'S DRAWER — the name is readable, whatever else is up there.
//
// The name used to share one row with the actions. Every action added since
// (Exportar, Perfil (PDF), Cópia de teste) took its width from the name, until
// a coordinator on staging was reading "t" (JVP, 2026-09-21). The rule now: the
// name has its own line — two if it needs them — and nothing can squeeze it.

const LONG = 'Associação Comunitária dos Moradores e Amigos da Vila Flores e Arredores do 4º Distrito';

test.describe('the drawer header', () => {
  test.use({ locale: 'pt-BR' });

  for (const vp of [{ name: 'desktop', width: 1280, height: 900 }, { name: 'phone', width: 390, height: 844 }]) {
    test(`${vp.name}: the full name is on screen, the actions sit under it, no tab overlaps another`, async ({ page }) => {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      const api = new TestApi(page.request);
      test.skip(!(await api.ping()).fakeModel, 'needs the fake model');
      const cohort = (await api.createCohort(`Drawer ${randomUUID().slice(0, 6)}`)).cohort;
      await api.createCoordinator({ email: `drawer-${randomUUID()}@e2e.test`, password: 'pw-123456', cohortId: cohort.id });
      const m = (await api.inviteMember(cohort.id, { orgName: LONG, neighborhood: 'Floresta', withSession: true })).member;

      await page.goto(`/orchestrator?cohort=${cohort.coordinatorSlug}`);
      await page.getByTestId(`card-orchestrator-project-${m.id}`).click({ timeout: 30_000 });
      const drawer = page.getByTestId('cbo-files-drawer');
      await expect(drawer).toBeVisible();

      // ⚠️ The drawer SLIDES in. Boxes read one call at a time are read at
      // different moments of that animation and disagree by a few pixels — so:
      // wait until it has stopped moving, then read every box in ONE snapshot.
      await expect.poll(async () => {
        const a = await drawer.boundingBox(); await page.waitForTimeout(120); const b = await drawer.boundingBox();
        return !!a && !!b && Math.abs(a.x - b.x) < 0.5;
      }, { timeout: 5_000 }).toBe(true);
      const ids = ['cbo-drawer-title', 'cbo-drawer-export', 'cbo-drawer-profile', 'cbo-drawer-refresh', 'cbo-tab-convite', 'cbo-tab-arquivos', 'cbo-tab-conversa', 'cbo-tab-perfil', 'cbo-tab-documentos'];
      const box = await page.evaluate((testids) => Object.fromEntries(testids.map(id => {
        const el = document.querySelector(`[data-testid="${id}"]`) as HTMLElement;
        const r = el.getBoundingClientRect();
        return [id, { x: r.x, y: r.y, w: r.width, h: r.height, clippedX: el.scrollWidth > el.clientWidth + 1, clippedY: el.scrollHeight > el.clientHeight + 1 }];
      })), ids) as Record<string, { x: number; y: number; w: number; h: number; clippedX: boolean; clippedY: boolean }>;

      // The name: all of it, not an ellipsis after one letter.
      const title = page.getByTestId('cbo-drawer-title');
      await expect(title).toHaveText(LONG);
      const tb = box['cbo-drawer-title'];
      expect(tb.w, 'the name has (nearly) the drawer\'s width to itself').toBeGreaterThan(Math.min(vp.width, 512) * 0.6);
      expect(tb.clippedX, 'never cut off sideways').toBe(false);
      if (tb.clippedY) expect(await title.getAttribute('title'), 'a name longer than two lines keeps its full text on hover').toBe(LONG);
      await expect(page.getByTestId('cbo-drawer-context')).toContainText('Floresta');

      // The actions are BELOW the name, never beside it.
      for (const id of ['cbo-drawer-export', 'cbo-drawer-profile', 'cbo-drawer-refresh']) {
        expect(box[id].y, `${id} sits under the name`).toBeGreaterThanOrEqual(tb.y + tb.h - 1);
      }

      // No tab's label runs into the next one, and every label fits its tab.
      const tabs = ['convite', 'arquivos', 'conversa', 'perfil', 'documentos'].map(t => `cbo-tab-${t}`);
      for (let i = 1; i < tabs.length; i++) expect(box[tabs[i]].x, `${tabs[i]} starts after ${tabs[i - 1]} ends`).toBeGreaterThanOrEqual(box[tabs[i - 1]].x + box[tabs[i - 1]].w - 0.5);
      for (const t of tabs) expect(box[t].clippedX, `the ${t} label fits its tab`).toBe(false);

      if (process.env.DRAWER_SHOTS) await page.screenshot({ path: `${process.env.DRAWER_SHOTS}/drawer-${vp.name}.png` });
    });
  }
});

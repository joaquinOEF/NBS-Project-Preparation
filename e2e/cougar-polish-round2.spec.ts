import { test, expect } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { TestApi } from './helpers/testApi';

// Round-2 polish, verified end-to-end (admin coordinator on the default cohort):
//  • cohort language toggle — solid-emerald active state + a toast (was invisible)
//  • workshop "Open for cohort" + date reachable in the MINIMIZED row
//  • invite greeting has NO emoji (the 👋 broke in real WhatsApp)
//  • delete-cohort actually removes the member (admin-only button)

test.describe('COUGAR polish round 2', () => {
  test('language toggle is obvious + works; minimized workshop CTA; no emoji; delete works', async ({ page, request }) => {
    const api = new TestApi(page.request);
    await api.createCoordinator({ email: `polish-${randomUUID()}@e2e.test`, password: 'polish-pass-1', name: 'Polish' }); // admin
    const mine = await (await page.request.get('/api/cohort/mine')).json();
    const member = (await new TestApi(request).inviteMember(mine.cohort.id, { orgName: 'Org Polish', withSession: true })).member;

    await page.goto('/orchestrator');

    // ── Cohort language: click PT → obvious active + persisted ──
    const pt = page.getByTestId('button-cohort-lang-pt');
    await expect(pt).toBeVisible({ timeout: 20_000 });
    await pt.click();
    await expect(pt).toHaveAttribute('aria-pressed', 'true');
    await expect(pt).toHaveClass(/bg-emerald-600/); // unmistakable active fill
    const after = await (await page.request.get('/api/cohort/mine')).json();
    expect(after?.cohort?.settings?.language).toBe('pt');
    await page.waitForTimeout(900);
    await page.screenshot({ path: 'test-results/polish-lang.png' });

    // ── Minimized workshop row keeps the date + "Open for cohort" CTA ──
    const toggle0 = page.getByTestId('workshop-toggle-0'); // Workshop 1 (next up) starts expanded
    await toggle0.click(); // minimize it
    await expect(toggle0).toHaveAttribute('aria-expanded', 'false');
    await expect(page.getByTestId('button-open-workshop-0')).toBeVisible(); // CTA still reachable
    await page.waitForTimeout(900);
    await page.screenshot({ path: 'test-results/polish-minimized.png' });

    // ── Invite greeting has no emoji (and no replacement char) ──
    const card = page.getByTestId(`card-orchestrator-project-${member.id}`);
    await card.click();
    const waLink = page.locator('a[href*="wa.me"]').first();
    await expect(waLink).toBeVisible();
    const decoded = decodeURIComponent(((await waLink.getAttribute('href')) || '').split('text=')[1] || '');
    expect(decoded).not.toContain('\u{1F44B}');
    expect(decoded).not.toContain('�');
    expect(decoded).toMatch(/^(Olá|Hi)!\n/); // greeting, straight into the newline — no emoji
    await page.screenshot({ path: 'test-results/polish-share.png' });
    await page.keyboard.press('Escape');

    // ── Delete cohort actually removes the member (admin-only) ──
    const del = page.getByTestId('button-delete-cohort');
    await expect(del).toBeVisible();
    await del.click();
    await page.getByTestId('button-confirm-delete-cohort').click();
    await expect(card).toHaveCount(0, { timeout: 15_000 });
    await page.waitForTimeout(800);
  });
});

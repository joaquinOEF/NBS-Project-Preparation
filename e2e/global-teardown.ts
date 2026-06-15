import { request } from '@playwright/test';

// Runs once after the whole suite. Purges this harness's namespaced data
// (e2e-* cohorts/members, *@e2e.test coordinators) in a single shot, so
// per-test afterAll hooks can't race parallel tests by deleting their data
// mid-flight. Best-effort: if the server is already gone, leftover throwaway
// rows are harmless (every test uses unique ids, so they never collide).
export default async function globalTeardown() {
  const baseURL = process.env.E2E_BASE_URL || `http://localhost:${process.env.E2E_PORT || '5050'}`;
  const ctx = await request.newContext({
    baseURL,
    extraHTTPHeaders: process.env.TEST_API_SECRET ? { 'x-test-secret': process.env.TEST_API_SECRET } : {},
  });
  try {
    const r = await ctx.post('/__test/cleanup');
    if (r.ok()) console.log('[global-teardown] cleanup:', JSON.stringify(await r.json()));
  } catch (e) {
    console.warn('[global-teardown] cleanup skipped (server likely down):', (e as Error).message);
  } finally {
    await ctx.dispose();
  }
}

import type { APIRequestContext } from '@playwright/test';
import type { FakeTurn } from '../../server/services/fakeCboModel';

// Thin wrapper over the gated /__test API (PR 1). Uses Playwright's request
// fixture, so it inherits baseURL + the x-test-secret header from the config.
// Every method throws with the response body on a non-2xx so failures are loud.
export class TestApi {
  constructor(private request: APIRequestContext) {}

  private async post(path: string, data?: unknown): Promise<any> {
    const r = await this.request.post(`/__test${path}`, { data: data ?? {} });
    if (!r.ok()) throw new Error(`POST /__test${path} → ${r.status()} ${await r.text()}`);
    return r.json();
  }

  /** Probe the target before seeding: { ok, fakeModel, secret }. */
  async ping(): Promise<{ ok: boolean; fakeModel: boolean; secret: boolean }> {
    const r = await this.request.get('/__test/ping');
    if (!r.ok()) throw new Error(`GET /__test/ping → ${r.status()} ${await r.text()}`);
    return r.json();
  }

  newSession(city?: string) {
    return this.post('/cbo/session', { city });
  }

  seedState(cboId: string, body: Record<string, unknown>) {
    return this.post(`/cbo/${cboId}/seed-state`, body);
  }

  /** Queue deterministic fake-model turns. Each user message pops one. */
  scriptCbo(cboId: string, turns: FakeTurn[]) {
    return this.post(`/cbo/${cboId}/script`, { turns });
  }

  /** Flush to DB then drop the in-memory maps — simulates a Replit recycle. */
  evictCbo(cboId: string) {
    return this.post(`/cbo/${cboId}/evict`);
  }

  /** The per-org KB documents for the org this session is linked to. */
  async listDocs(cboId: string): Promise<{ orgId: string | null; documents: any[] }> {
    const r = await this.request.get(`/__test/cbo/${cboId}/documents`);
    if (!r.ok()) throw new Error(`GET /__test/cbo/${cboId}/documents → ${r.status()} ${await r.text()}`);
    return r.json();
  }

  createCohort(name?: string) {
    return this.post('/cohort', { name });
  }

  inviteMember(cohortId: string, body: Record<string, unknown> = {}) {
    return this.post(`/cohort/${cohortId}/member`, body);
  }

  /** Create + log in a coordinator. Cookie is set on the request context. */
  createCoordinator(body: Record<string, unknown> = {}) {
    return this.post('/coordinator', body);
  }

  /** Purge this harness's namespaced data (e2e-* cohorts, *@e2e.test coords). */
  cleanup() {
    return this.post('/cleanup');
  }
}

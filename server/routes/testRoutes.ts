// ============================================================================
// TEST-ONLY API — e2e seeding & state hooks
// ============================================================================
//
// Mounted ONLY when ENABLE_TEST_ROUTES==='1' (see registerRoutes in routes.ts —
// conditional *registration*, so in production these routes literally do not
// exist, not merely "return 403"). Defence-in-depth: if TEST_API_SECRET is set,
// every call must carry a matching `x-test-secret` header.
//
// Purpose: let Playwright seed the world without replaying full conversations —
// create throwaway CBO sessions, coordinators, and cohorts; jump a session to
// any phase / tier / language / fill state; script the fake model; tear down.
//
// NEVER set ENABLE_TEST_ROUTES or TEST_API_SECRET on the production Deployment.
// All throwaway resources are namespaced ('e2e-*' slugs, '*@e2e.test' emails)
// so /__test/cleanup can purge exactly this harness's data and nothing else.

import type { Express, Request, Response, RequestHandler, NextFunction } from 'express';
import { eq, like, inArray } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { db } from '../db';
import {
  createEmptyCboState,
  isValidSectionId,
  isValidMaturityMetric,
  type CboState,
  type Confidence,
} from '@shared/cbo-schema';
import {
  getCboState,
  setCboState,
  flushNow,
  loadCboFromDb,
} from '../services/cboAgent';
import { setFakeScript, clearFakeScript, peekFakeScript, type FakeTurn } from '../services/fakeCboModel';
import { createCoordinator, login, COORD_COOKIE } from '../services/coordinatorAuth';
import { createOrganization, linkCboStateToOrg } from '../services/orgPersistence';
import { getOrgIdForCboState, listDocumentsByOrg } from '../services/documentPersistence';
import { cohorts, cohortMembers, DEFAULT_WORKSHOPS } from '@shared/cohort-schema';
import { coordinators, coordinatorSessions } from '@shared/coordinator-schema';

// Namespacing prefixes — cleanup keys off these so we never touch real data.
const E2E_COHORT_PREFIX = 'e2e-';
const E2E_EMAIL_DOMAIN = '@e2e.test';

const wrap = (fn: (req: Request, res: Response) => Promise<unknown>): RequestHandler =>
  async (req, res, next) => {
    try { await fn(req, res); }
    catch (err: any) {
      console.error('[__test] handler error', err);
      if (res.headersSent) return next(err);
      res.status(500).json({ error: err?.message || 'internal error' });
    }
  };

// Shared-secret guard. Enforced only when TEST_API_SECRET is set (so a local
// dev run with just ENABLE_TEST_ROUTES=1 stays frictionless, while a shared
// preview env can require the header).
function secretGuard(): RequestHandler {
  const secret = process.env.TEST_API_SECRET;
  if (!secret) {
    console.warn('[__test] TEST_API_SECRET not set — test routes are open within this env. Fine locally; set a secret on any shared preview.');
  }
  return (req: Request, res: Response, next: NextFunction) => {
    if (!secret) return next();
    if (req.header('x-test-secret') === secret) return next();
    res.status(401).json({ error: 'bad or missing x-test-secret' });
  };
}

async function hydrate(id: string): Promise<CboState | undefined> {
  let state = getCboState(id);
  if (!state) {
    const persisted = await loadCboFromDb(id);
    if (persisted) { setCboState(id, persisted.state); state = persisted.state; }
  }
  return state;
}

export function registerTestRoutes(app: Express): void {
  console.warn('⚠️  [__test] TEST ROUTES ENABLED (ENABLE_TEST_ROUTES=1). This must NEVER be set on the production Deployment.');
  app.use('/__test', secretGuard());

  // Liveness / config probe — lets Playwright global-setup confirm the target
  // really has the test API mounted before it starts seeding.
  app.get('/__test/ping', (_req, res) => {
    res.json({ ok: true, fakeModel: process.env.CBO_FAKE_MODEL === '1', secret: !!process.env.TEST_API_SECRET });
  });

  // ── CBO sessions ──────────────────────────────────────────────────────────

  // Fresh CBO session. Returns the id the chat UI drives (/cbo-profile?...).
  app.post('/__test/cbo/session', wrap(async (req, res) => {
    const city = typeof req.body?.city === 'string' ? req.body.city : 'porto-alegre';
    const state = createEmptyCboState(city);
    setCboState(state.id, state);
    await flushNow(state.id);
    res.json({ cboId: state.id, state });
  }));

  // Seed a session directly into any phase / language / filled state — the
  // high-leverage primitive: jump to a branch without replaying turns.
  // Body (all optional): { phase, language: 'pt'|'en', orgName,
  //   sections: [{ sectionId, field, value, confidence?, source? }],
  //   maturity: [{ metric, score, justification? }],
  //   priorityFlags: [{ flag, met, notes? }] }
  app.post('/__test/cbo/:id/seed-state', wrap(async (req, res) => {
    const state = await hydrate(req.params.id);
    if (!state) { res.status(404).json({ error: 'cbo not found' }); return; }
    const b = req.body ?? {};

    if (typeof b.phase === 'number') state.phase = Math.max(0, Math.min(6, b.phase));
    if (b.language === 'pt' || b.language === 'en') state.metadata.language = b.language;
    if (typeof b.orgName === 'string') state.orgName = b.orgName;

    for (const f of Array.isArray(b.sections) ? b.sections : []) {
      if (!isValidSectionId(f.sectionId)) continue;
      const section = state.sections[f.sectionId as keyof typeof state.sections];
      if (!section) continue;
      section.fields[f.field] = {
        value: String(f.value),
        confidence: (f.confidence ?? 'high') as Confidence,
        source: f.source ?? 'user',
        userEdited: false,
      };
      section.lastUpdatedBy = 'agent';
      if (f.sectionId === 'org_profile' && f.field === 'org_name' && !state.orgName) state.orgName = String(f.value);
    }

    for (const m of Array.isArray(b.maturity) ? b.maturity : []) {
      if (!isValidMaturityMetric(m.metric)) continue;
      state.maturityScores = state.maturityScores.filter(s => s.metric !== m.metric);
      const score = Math.max(0, Math.min(3, Math.round(Number(m.score) || 0))) as 0 | 1 | 2 | 3;
      state.maturityScores.push({ metric: m.metric, score, justification: m.justification ?? 'seed' });
    }
    state.totalMaturityScore = state.maturityScores.reduce((sum, s) => sum + s.score, 0);

    for (const pf of Array.isArray(b.priorityFlags) ? b.priorityFlags : []) {
      state.priorityFlags = state.priorityFlags.filter(f => f.flag !== pf.flag);
      state.priorityFlags.push({ flag: pf.flag, met: !!pf.met, notes: pf.notes });
    }

    setCboState(req.params.id, state);
    await flushNow(req.params.id);
    res.json({ ok: true, state });
  }));

  // ── Fake-model scripting ────────────────────────────────────────────────
  // Body: { turns: FakeTurn[] }. Each user message pops one turn. Requires
  // CBO_FAKE_MODEL=1 to have any effect (otherwise the live SDK runs).
  app.post('/__test/cbo/:id/script', wrap(async (req, res) => {
    const turns = req.body?.turns;
    if (!Array.isArray(turns)) { res.status(400).json({ error: 'turns array required' }); return; }
    setFakeScript(req.params.id, turns as FakeTurn[]);
    res.json({ ok: true, queued: turns.length, fakeModelEnabled: process.env.CBO_FAKE_MODEL === '1' });
  }));

  app.delete('/__test/cbo/:id/script', wrap(async (req, res) => {
    clearFakeScript(req.params.id);
    res.json({ ok: true });
  }));

  app.get('/__test/cbo/:id/script', wrap(async (req, res) => {
    res.json(peekFakeScript(req.params.id));
  }));

  // Per-org KB inspection — the documents filed for the org this session is
  // linked to. Lets a spec assert that an upload landed in the durable store.
  app.get('/__test/cbo/:id/documents', wrap(async (req, res) => {
    const orgId = await getOrgIdForCboState(req.params.id);
    if (!orgId) { res.json({ orgId: null, documents: [] }); return; }
    const documents = await listDocumentsByOrg(orgId);
    res.json({ orgId, documents });
  }));

  // ── Coordinators ──────────────────────────────────────────────────────────
  // Create a throwaway coordinator and (default) mint a session so Playwright is
  // logged in. Sets the httpOnly coord cookie AND returns the token for non-browser
  // API clients. Email is forced into the e2e domain so cleanup can find it.
  app.post('/__test/coordinator', wrap(async (req, res) => {
    const raw = typeof req.body?.email === 'string' ? req.body.email : `coord-${nanoid(8)}`;
    const email = raw.includes('@') ? raw : `${raw}${E2E_EMAIL_DOMAIN}`;
    const password = typeof req.body?.password === 'string' ? req.body.password : nanoid(16);
    const name = typeof req.body?.name === 'string' ? req.body.name : 'E2E Coordinator';
    const cohortId = typeof req.body?.cohortId === 'string' ? req.body.cohortId : null; // null = admin

    await createCoordinator({ email, password, name, cohortId });
    const session = await login(email, password);
    if (!session) { res.status(500).json({ error: 'login failed after create' }); return; }

    res.cookie(COORD_COOKIE, session.token, { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production' });
    res.json({ coordinator: { email, name, cohortId }, password, sessionToken: session.token, cookieName: COORD_COOKIE });
  }));

  // ── Cohorts & members ─────────────────────────────────────────────────────
  // Create a throwaway cohort. coordinatorSlug is namespaced ('e2e-…') for cleanup.
  app.post('/__test/cohort', wrap(async (req, res) => {
    const coordinatorSlug = `${E2E_COHORT_PREFIX}${nanoid(10)}`;
    const name = typeof req.body?.name === 'string' ? req.body.name : 'E2E Cohort';
    const [cohort] = await db.insert(cohorts).values({
      coordinatorSlug, name, settings: { workshops: DEFAULT_WORKSHOPS },
    }).returning();
    res.json({ cohort });
  }));

  // Invite a member directly (bypasses the coordinator gate — this is its own
  // namespace). Mirrors the real invite: creates an org, an unguessable token,
  // and optionally a linked CBO session so the spec can drive immediately.
  // Body: { cohortId, orgName, neighborhood?, role?, unlockedPhases?, withSession? }
  app.post('/__test/cohort/:cohortId/member', wrap(async (req, res) => {
    const cohortId = req.params.cohortId;
    const [cohort] = await db.select().from(cohorts).where(eq(cohorts.id, cohortId)).limit(1);
    if (!cohort) { res.status(404).json({ error: 'cohort not found' }); return; }

    const orgName = typeof req.body?.orgName === 'string' && req.body.orgName.trim() ? req.body.orgName.trim() : `E2E Org ${nanoid(5)}`;
    const neighborhood = typeof req.body?.neighborhood === 'string' ? req.body.neighborhood : null;
    const role = req.body?.role === 'alternate' ? 'alternate' : 'priority';
    const unlockedPhases = Array.isArray(req.body?.unlockedPhases) ? req.body.unlockedPhases : [1];
    // Seedable E1 triage answer — lets specs assert that run-derived member
    // data (path) is cleared on restart without driving a full scripted E1.
    const path = (['has-project', 'has-idea', 'needs-help'] as const).includes(req.body?.path) ? req.body.path : null;

    let orgId: string | null = null;
    try {
      const org = await createOrganization({ name: orgName, city: 'porto-alegre', type: 'community', cohortId });
      orgId = org.id;
    } catch (e: any) {
      console.error('[__test] org creation failed (continuing):', e?.message || e);
    }

    let cboStateId: string | null = null;
    if (req.body?.withSession) {
      const state = createEmptyCboState('porto-alegre');
      if (orgName) state.orgName = orgName;
      setCboState(state.id, state);
      await flushNow(state.id);
      cboStateId = state.id;
      if (orgId) { try { await linkCboStateToOrg(cboStateId, orgId); } catch { /* best-effort */ } }
    }

    const [member] = await db.insert(cohortMembers).values({
      cohortId,
      orgId,
      memberSlug: `${E2E_COHORT_PREFIX}${nanoid(10)}`,
      capabilityToken: nanoid(24),
      orgName,
      neighborhood,
      role,
      origin: 'cohort',
      unlockedPhases,
      path,
      cboStateId,
    }).returning();

    res.json({ member, inviteUrl: `/cbo-profile?t=${member.capabilityToken}` });
  }));

  // ── Teardown ────────────────────────────────────────────────────────────
  // Purge only this harness's namespaced data. Idempotent. Returns counts.
  app.post('/__test/cleanup', wrap(async (_req, res) => {
    const e2eCohorts = await db.select().from(cohorts).where(like(cohorts.coordinatorSlug, `${E2E_COHORT_PREFIX}%`));
    const cohortIds = e2eCohorts.map(c => c.id);
    let members = 0;
    if (cohortIds.length) {
      const m = await db.delete(cohortMembers).where(inArray(cohortMembers.cohortId, cohortIds)).returning();
      members = m.length;
      await db.delete(cohorts).where(inArray(cohorts.id, cohortIds));
    }
    const e2eCoords = await db.select().from(coordinators).where(like(coordinators.email, `%${E2E_EMAIL_DOMAIN}`));
    const coordIds = e2eCoords.map(c => c.id);
    if (coordIds.length) {
      await db.delete(coordinatorSessions).where(inArray(coordinatorSessions.coordinatorId, coordIds));
      await db.delete(coordinators).where(inArray(coordinators.id, coordIds));
    }
    res.json({ ok: true, deleted: { cohorts: cohortIds.length, members, coordinators: coordIds.length } });
  }));
}

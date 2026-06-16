import type { Express, Request, Response, RequestHandler } from 'express';
import { eq } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { db } from '../db';
import {
  cohorts,
  cohortMembers,
  DEFAULT_WORKSHOPS,
  SUPPORT_REQUEST_TYPES,
  type CohortSettings,
  type SupportRequest,
  type SupportRequestType,
  type WorkshopConfig,
} from '@shared/cohort-schema';
import { createOrganization, linkCboStateToOrg } from '../services/orgPersistence';
import { requireCoordinator, type CoordinatorRequest } from '../services/coordinatorAuth';

// Slug-as-secret: 24 chars of url-safe nanoid. Used as a fallback when the
// human-readable slug derivation collides too many times.
const slug = () => nanoid(24);

// Singleton coordinator slug — for the Vila Flores pilot there's exactly one
// cohort, so the orchestrator doesn't need to remember any auth/recovery key.
// /api/cohort/default returns (and creates on first request) this cohort.
const DEFAULT_COORDINATOR_SLUG = 'default';
const DEFAULT_COHORT_NAME = 'Vila Flores';

// Human-readable slug. "Horta Comunitária Cascata" → "horta-comunitaria-cascata".
// Falls back to a short random suffix only on collisions.
function slugify(input: string): string {
  return input
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // strip combining diacritical marks
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 60) // keep URLs sensible
    || 'cbo';
}

async function uniqueMemberSlug(base: string): Promise<string> {
  let candidate = base;
  let n = 2;
  // Cap attempts so a pathological collision storm doesn't loop forever.
  while (n < 100) {
    const [existing] = await db.select().from(cohortMembers).where(eq(cohortMembers.memberSlug, candidate)).limit(1);
    if (!existing) return candidate;
    candidate = `${base}-${n}`;
    n += 1;
  }
  return `${base}-${nanoid(6).toLowerCase()}`;
}

async function getOrCreateDefaultCohort() {
  const existing = await findCohortByCoordinatorSlug(DEFAULT_COORDINATOR_SLUG);
  if (existing) return existing;
  // Race-safe create: concurrent first-callers (cold start, or parallel
  // requests) would otherwise both INSERT and one would hit the unique
  // coordinator_slug constraint → 500. onConflictDoNothing + read-back makes it
  // idempotent.
  const inserted = await db.insert(cohorts).values({
    coordinatorSlug: DEFAULT_COORDINATOR_SLUG,
    name: DEFAULT_COHORT_NAME,
    settings: { workshops: DEFAULT_WORKSHOPS },
  }).onConflictDoNothing().returning();
  if (inserted.length) return inserted[0];
  return (await findCohortByCoordinatorSlug(DEFAULT_COORDINATOR_SLUG))!;
}

// Wrap async handlers so a thrown DB error becomes a 500 response instead of
// an unhandled promise rejection that crashes the Node process. (Node 20
// terminates on unhandled rejections by default; without this, a missing
// table or a transient DB hiccup takes the whole server down.)
const wrap = (fn: (req: Request, res: Response) => Promise<unknown>): RequestHandler => async (req, res, next) => {
  try {
    await fn(req, res);
  } catch (err: any) {
    console.error('[cohort] handler error', err);
    if (res.headersSent) return next(err);
    res.status(500).json({ error: err?.message || 'internal error', code: err?.code });
  }
};

async function findCohortByCoordinatorSlug(coordinatorSlug: string) {
  const [c] = await db.select().from(cohorts).where(eq(cohorts.coordinatorSlug, coordinatorSlug)).limit(1);
  return c;
}

// The coordinator attached by requireCoordinator(). Carries `cohortId`:
// null/undefined ⇒ admin (all cohorts), a value ⇒ scoped to that one cohort.
function reqCoordinator(req: Request) {
  return (req as CoordinatorRequest).coordinator;
}

// Tenancy check: admins may act on any cohort; a scoped coordinator only on
// their own. Used by the literal /default routes (the :coordinatorSlug routes
// are covered by the app.param guard instead).
function mayAccessCohort(req: Request, cohortId: string): boolean {
  const c = reqCoordinator(req);
  return !c?.cohortId || c.cohortId === cohortId;
}

async function findMemberBySlug(memberSlug: string) {
  const [m] = await db.select().from(cohortMembers).where(eq(cohortMembers.memberSlug, memberSlug)).limit(1);
  return m;
}

async function findMemberByToken(token: string) {
  if (!token) return undefined;
  const [m] = await db.select().from(cohortMembers).where(eq(cohortMembers.capabilityToken, token)).limit(1);
  return m;
}

// Shared member-facing payload builder — used by both the legacy by-slug read
// and the new by-token read so they can't drift. Includes memberSlug + (for the
// token path) the token, so the client can keep making slug-based snapshot /
// support calls after resolving via an unguessable token URL.
async function buildMemberPayload(member: typeof cohortMembers.$inferSelect) {
  const [cohort] = await db.select().from(cohorts).where(eq(cohorts.id, member.cohortId)).limit(1);
  const workshops = (cohort?.settings as CohortSettings | null)?.workshops ?? [];

  const unlocked = (member.unlockedPhases as number[] | null) ?? [1];
  const maxUnlocked = Math.max(0, ...unlocked);
  const nextPhase = maxUnlocked + 1;
  const nextWorkshop = workshops.find(w => w.unlocksPhase === nextPhase) ?? null;

  const memberPhase = typeof member.snapshotPhase === 'number' && member.snapshotPhase > 0
    ? member.snapshotPhase
    : 1;
  const focusWorkshop = workshops.find(w => w.unlocksPhase === memberPhase) ?? workshops[0] ?? null;
  const focusWorkshopIsCurrent =
    !!focusWorkshop?.openedAt && typeof member.snapshotPhase === 'number' && member.snapshotPhase > 0;

  const supportRequests = Array.isArray(member.supportRequests) ? (member.supportRequests as SupportRequest[]) : [];
  const supportPending = supportRequests.filter(r => !r.resolvedAt);

  return {
    id: member.id,
    memberSlug: member.memberSlug,
    orgName: member.orgName,
    neighborhood: member.neighborhood,
    path: member.path ?? null,
    unlockedPhases: unlocked,
    cboStateId: member.cboStateId,
    cohort: cohort ? { id: cohort.id, name: cohort.name, language: (cohort.settings as CohortSettings | null)?.language ?? null } : null,
    workshops,
    nextWorkshop,
    focusWorkshop,
    focusWorkshopIsCurrent,
    supportRequests,
    supportPendingCount: supportPending.length,
    inspirationPicks: Array.isArray(member.inspirationPicks) ? member.inspirationPicks : [],
  };
}

export function registerCohortRoutes(app: Express): void {
  // Phase 3c-ii — gate the entire coordinator surface behind a coordinator
  // session. Every /api/cohort/* route is coordinator-facing (the CBO-facing
  // routes live under /api/cbo-member and /api/cbo, which are NOT matched here),
  // so one prefix mount closes the open roster + invite/unlock controls in a
  // single place. Requires a provisioned coordinator (scripts/create-coordinator).
  app.use('/api/cohort', requireCoordinator());

  // ──────────────────────────────────────────────────────────────────────
  // Per-account ownership guard — the multi-tenant isolation boundary. Runs
  // for every cohort route keyed by :coordinatorSlug. A scoped coordinator
  // (cohortId set) may only touch their own cohort; an admin (cohortId null)
  // may touch any. 404 for an unknown slug, 403 for someone else's cohort.
  // Without this the auth gate proves only "a coordinator", not "this
  // coordinator's cohort", so any logged-in coordinator could read any cohort
  // by slug.
  // ──────────────────────────────────────────────────────────────────────
  app.param('coordinatorSlug', async (req, res, next, slugValue) => {
    try {
      const cohort = await findCohortByCoordinatorSlug(String(slugValue));
      if (!cohort) { res.status(404).json({ error: 'cohort not found' }); return; }
      if (!mayAccessCohort(req, cohort.id)) { res.status(403).json({ error: 'forbidden' }); return; }
      (req as any).cohort = cohort;
      next();
    } catch (err) { next(err as any); }
  });

  // Account-resolved cohort — what the orchestrator loads on boot (replacing
  // the hardcoded /default). A scoped coordinator gets their own cohort; an
  // admin opens the default singleton. `isAdmin` lets the UI decide whether to
  // ever show a cohort switcher (deferred until a 2nd cohort exists).
  app.get('/api/cohort/mine', wrap(async (req, res) => {
    const coordinator = reqCoordinator(req);
    let cohort: Awaited<ReturnType<typeof getOrCreateDefaultCohort>> | undefined;
    if (coordinator?.cohortId) {
      const [c] = await db.select().from(cohorts).where(eq(cohorts.id, coordinator.cohortId)).limit(1);
      cohort = c;
    }
    if (!cohort) cohort = await getOrCreateDefaultCohort();
    const members = await db.select().from(cohortMembers).where(eq(cohortMembers.cohortId, cohort.id));
    res.json({ cohort, members, isAdmin: !coordinator?.cohortId });
  }));

  // ──────────────────────────────────────────────────────────────────────
  // Singleton cohort — legacy entry point. Still serves the default cohort,
  // but now ownership-checked so a scoped coordinator can't read/wipe it.
  // ──────────────────────────────────────────────────────────────────────
  app.get('/api/cohort/default', wrap(async (req, res) => {
    const cohort = await getOrCreateDefaultCohort();
    if (!mayAccessCohort(req, cohort.id)) { res.status(403).json({ error: 'forbidden' }); return; }
    const members = await db.select().from(cohortMembers).where(eq(cohortMembers.cohortId, cohort.id));
    res.json({ cohort, members });
  }));

  app.post('/api/cohort/default/reset', wrap(async (req, res) => {
    const cohort = await getOrCreateDefaultCohort();
    if (!mayAccessCohort(req, cohort.id)) { res.status(403).json({ error: 'forbidden' }); return; }
    // Wipe members, restore default workshop cadence. The cohort row itself
    // stays — same singleton, fresh state.
    await db.delete(cohortMembers).where(eq(cohortMembers.cohortId, cohort.id));
    await db.update(cohorts)
      .set({ settings: { workshops: DEFAULT_WORKSHOPS } })
      .where(eq(cohorts.id, cohort.id));
    const refreshed = await getOrCreateDefaultCohort();
    res.json({ cohort: refreshed, members: [] });
  }));

  // Generic reset for a scoped cohort (the :coordinatorSlug app.param guard
  // already enforced ownership). Mirrors /default/reset.
  app.post('/api/cohort/:coordinatorSlug/reset', wrap(async (req, res) => {
    const cohort = (req as any).cohort ?? await findCohortByCoordinatorSlug(req.params.coordinatorSlug);
    if (!cohort) { res.status(404).json({ error: 'cohort not found' }); return; }
    await db.delete(cohortMembers).where(eq(cohortMembers.cohortId, cohort.id));
    await db.update(cohorts)
      .set({ settings: { workshops: DEFAULT_WORKSHOPS } })
      .where(eq(cohorts.id, cohort.id));
    const [refreshed] = await db.select().from(cohorts).where(eq(cohorts.id, cohort.id)).limit(1);
    res.json({ cohort: refreshed, members: [] });
  }));

  // ──────────────────────────────────────────────────────────────────────
  // Create cohort — kept for backward-compat with anything that still calls
  // it. The pilot's UI no longer surfaces this.
  // ──────────────────────────────────────────────────────────────────────
  app.post('/api/cohort', wrap(async (req, res) => {
    // Only an admin (unscoped coordinator) may spin up new cohorts.
    if (reqCoordinator(req)?.cohortId) { res.status(403).json({ error: 'only an admin can create cohorts' }); return; }
    const { name, language: rawLang } = req.body ?? {};
    const language = rawLang === 'pt' || rawLang === 'en' ? rawLang : undefined;
    const coordinatorSlug = slug();
    const [created] = await db.insert(cohorts).values({
      coordinatorSlug,
      name: name || 'Untitled cohort',
      settings: { workshops: DEFAULT_WORKSHOPS, language },
    }).returning();
    res.json({ cohort: created });
  }));

  // Read cohort + members
  app.get('/api/cohort/:coordinatorSlug', wrap(async (req, res) => {
    const cohort = await findCohortByCoordinatorSlug(req.params.coordinatorSlug);
    if (!cohort) { res.status(404).json({ error: 'cohort not found' }); return; }
    const members = await db.select().from(cohortMembers).where(eq(cohortMembers.cohortId, cohort.id));
    res.json({ cohort, members });
  }));

  // Invite a CBO — slugs are human-readable, derived from the org name.
  // "Horta Comunitária Cascata" → /cbo-profile?cbo=horta-comunitaria-cascata
  app.post('/api/cohort/:coordinatorSlug/invite', wrap(async (req, res) => {
    const cohort = await findCohortByCoordinatorSlug(req.params.coordinatorSlug);
    if (!cohort) { res.status(404).json({ error: 'cohort not found' }); return; }

    const { orgName, neighborhood, role, origin } = req.body ?? {};
    if (!orgName) { res.status(400).json({ error: 'orgName required' }); return; }

    const memberSlug = await uniqueMemberSlug(slugify(orgName));

    // Inherit the cohort's already-opened workshops. Previously every new
    // invitee got `[1]` regardless of cohort state — which broke the case
    // where the coordinator had already opened W2 (or beyond) and then
    // invited a new member: the member's CBO page would never show the
    // green "next workshop unlocked" banner because their unlockedPhases
    // didn't include the opened phase. Phase 1 is always included so
    // brand-new cohorts (no openedAt anywhere) still let the first encontro
    // start.
    const workshops = (cohort.settings as CohortSettings | null)?.workshops ?? [];
    const openedPhases = workshops
      .filter(w => !!w.openedAt)
      .map(w => Number(w.unlocksPhase))
      .filter(n => Number.isFinite(n) && n >= 1);
    const unlockedPhases = Array.from(new Set([1, ...openedPhases])).sort((a, b) => a - b);

    // Every invited org now gets a real organization entity (the platform
    // spine). Default type 'community' for cohort invites; the coordinator can
    // reclassify an implementer later. Best-effort — a failure here must not
    // block the invite, so org_id just stays null and the backfill picks it up.
    let orgId: string | null = null;
    try {
      const org = await createOrganization({ name: orgName, city: 'porto-alegre', type: 'community', cohortId: cohort.id });
      orgId = org.id;
    } catch (e: any) {
      console.error('[cohort] org creation failed on invite (continuing, backfill will link):', e?.message || e);
    }

    const [member] = await db.insert(cohortMembers).values({
      cohortId: cohort.id,
      orgId,
      memberSlug,
      // Unguessable invite-link credential (nanoid 24). The link shared via
      // WhatsApp carries this, not the org-name-derived slug.
      capabilityToken: slug(),
      orgName,
      neighborhood: neighborhood || null,
      role: role === 'alternate' ? 'alternate' : 'priority',
      origin: origin === 'external' ? 'external' : 'cohort',
      unlockedPhases,
    }).returning();
    res.json({ member });
  }));

  // Update workshops
  app.patch('/api/cohort/:coordinatorSlug/workshops', wrap(async (req, res) => {
    const cohort = await findCohortByCoordinatorSlug(req.params.coordinatorSlug);
    if (!cohort) { res.status(404).json({ error: 'cohort not found' }); return; }

    const incoming = req.body?.workshops;
    if (!Array.isArray(incoming)) { res.status(400).json({ error: 'workshops must be an array' }); return; }

    const workshops: WorkshopConfig[] = incoming.map((w: any) => ({
      name: String(w.name ?? ''),
      date: w.date ? String(w.date) : null,
      unlocksPhase: Number(w.unlocksPhase) || 1,
      openedAt: w.openedAt ? String(w.openedAt) : null,
    }));
    const settings: CohortSettings = { ...(cohort.settings as CohortSettings), workshops };
    await db.update(cohorts).set({ settings }).where(eq(cohorts.id, cohort.id));
    res.json({ ok: true });
  }));

  // Set the cohort's forced UI language ('pt' | 'en' | null to clear). Forces
  // that language for every org in the cohort, overriding browser detection.
  app.patch('/api/cohort/:coordinatorSlug/language', wrap(async (req, res) => {
    const cohort = await findCohortByCoordinatorSlug(req.params.coordinatorSlug);
    if (!cohort) { res.status(404).json({ error: 'cohort not found' }); return; }

    const raw = req.body?.language;
    const language = raw === 'pt' || raw === 'en' ? raw : undefined;
    const settings: CohortSettings = { ...(cohort.settings as CohortSettings), language };
    await db.update(cohorts).set({ settings }).where(eq(cohorts.id, cohort.id));
    res.json({ ok: true, language: language ?? null });
  }));

  // Unlock a phase — for one member, multiple members, or 'all'
  app.patch('/api/cohort/:coordinatorSlug/unlock', wrap(async (req, res) => {
    const cohort = await findCohortByCoordinatorSlug(req.params.coordinatorSlug);
    if (!cohort) { res.status(404).json({ error: 'cohort not found' }); return; }

    const { memberIds, phase } = req.body ?? {};
    const phaseNum = Number(phase);
    if (!phaseNum || phaseNum < 1 || phaseNum > 7) { res.status(400).json({ error: 'invalid phase' }); return; }

    const members = await db.select().from(cohortMembers).where(eq(cohortMembers.cohortId, cohort.id));
    const targets = memberIds === 'all'
      ? members
      : members.filter(m => Array.isArray(memberIds) && memberIds.includes(m.id));

    for (const m of targets) {
      const current = Array.isArray(m.unlockedPhases) ? m.unlockedPhases : [1];
      if (current.includes(phaseNum)) continue;
      const next = [...current, phaseNum].sort((a, b) => a - b);
      await db.update(cohortMembers).set({ unlockedPhases: next }).where(eq(cohortMembers.id, m.id));
    }
    res.json({ ok: true, updated: targets.length });
  }));

  // Member-facing read by unguessable capability token (the new invite-link
  // credential). Preferred over the legacy by-slug path. Returns memberSlug so
  // the client can keep making slug-based snapshot/support calls during the
  // backward-compatible transition (Phase 3a).
  app.get('/api/cbo-member/by-token/:token', wrap(async (req, res) => {
    const member = await findMemberByToken(req.params.token);
    if (!member) { res.status(404).json({ error: 'member not found' }); return; }
    res.json(await buildMemberPayload(member));
  }));

  // Member-facing read (legacy: no auth beyond knowing the slug). Kept for
  // backward compat with already-issued links; retired in Phase 3b once links
  // are re-issued as capability-token URLs.
  app.get('/api/cbo-member/:memberSlug', wrap(async (req, res) => {
    const member = await findMemberBySlug(req.params.memberSlug);
    if (!member) { res.status(404).json({ error: 'member not found' }); return; }
    res.json(await buildMemberPayload(member));
  }));

  // CBO submits a support request. Returns the created entry (with id).
  app.post('/api/cbo-member/:memberSlug/support-request', wrap(async (req, res) => {
    const member = await findMemberBySlug(req.params.memberSlug);
    if (!member) { res.status(404).json({ error: 'member not found' }); return; }

    const { type, message } = req.body ?? {};
    if (!SUPPORT_REQUEST_TYPES.includes(type as SupportRequestType)) {
      res.status(400).json({ error: 'invalid support request type', allowed: SUPPORT_REQUEST_TYPES });
      return;
    }

    const entry: SupportRequest = {
      id: nanoid(12),
      type: type as SupportRequestType,
      message: typeof message === 'string' && message.trim() ? message.trim().slice(0, 2000) : null,
      createdAt: new Date().toISOString(),
      resolvedAt: null,
      resolvedNote: null,
    };
    const existing = Array.isArray(member.supportRequests) ? (member.supportRequests as SupportRequest[]) : [];
    // Soft rate limit: cap a member's queue at 20. New requests drop the oldest
    // resolved entry first; if no resolved entries, drop the oldest pending.
    let next = [...existing, entry];
    if (next.length > 20) {
      const resolvedIdx = next.findIndex(r => !!r.resolvedAt);
      next.splice(resolvedIdx >= 0 ? resolvedIdx : 0, 1);
    }
    await db.update(cohortMembers).set({ supportRequests: next }).where(eq(cohortMembers.id, member.id));
    res.json({ entry });
  }));

  // Coordinator support inbox — list all support requests across the cohort,
  // newest first. Returns flattened entries with member context so the UI
  // doesn't need to re-correlate. `status=pending` filters to unresolved.
  app.get('/api/cohort/:coordinatorSlug/support-requests', wrap(async (req, res) => {
    const cohort = await findCohortByCoordinatorSlug(req.params.coordinatorSlug);
    if (!cohort) { res.status(404).json({ error: 'cohort not found' }); return; }
    const filter = String(req.query.status ?? 'all');
    const members = await db.select().from(cohortMembers).where(eq(cohortMembers.cohortId, cohort.id));
    const items: Array<{
      requestId: string;
      memberId: string;
      memberSlug: string;
      orgName: string;
      neighborhood: string | null;
      type: SupportRequestType;
      message: string | null;
      createdAt: string;
      resolvedAt: string | null;
      resolvedNote: string | null;
    }> = [];
    for (const m of members) {
      const arr = Array.isArray(m.supportRequests) ? (m.supportRequests as SupportRequest[]) : [];
      for (const r of arr) {
        if (filter === 'pending' && r.resolvedAt) continue;
        if (filter === 'resolved' && !r.resolvedAt) continue;
        items.push({
          requestId: r.id,
          memberId: m.id,
          memberSlug: m.memberSlug,
          orgName: m.orgName,
          neighborhood: m.neighborhood,
          type: r.type,
          message: r.message,
          createdAt: r.createdAt,
          resolvedAt: r.resolvedAt,
          resolvedNote: r.resolvedNote,
        });
      }
    }
    items.sort((a, b) => (b.createdAt > a.createdAt ? 1 : -1));
    res.json({ items, total: items.length });
  }));

  // CBO toggles a NbsShowcaseCard favorite during E2. POST /toggle-on,
  // DELETE /toggle-off. Body: { cardId }. Returns the updated picks array.
  // Soft cap at 5 picks per spec — over that, oldest pick drops.
  app.post('/api/cbo-member/:memberSlug/inspiration-pick', wrap(async (req, res) => {
    const member = await findMemberBySlug(req.params.memberSlug);
    if (!member) { res.status(404).json({ error: 'member not found' }); return; }
    const { cardId, action } = req.body ?? {};
    if (!cardId || typeof cardId !== 'string') { res.status(400).json({ error: 'cardId required' }); return; }
    const current = Array.isArray(member.inspirationPicks) ? (member.inspirationPicks as string[]) : [];
    let next: string[];
    if (action === 'remove') {
      next = current.filter(id => id !== cardId);
    } else {
      // Default = add. Idempotent — already-present is a no-op.
      if (current.includes(cardId)) {
        next = current;
      } else {
        next = [...current, cardId];
        if (next.length > 5) next = next.slice(next.length - 5);
      }
    }
    await db.update(cohortMembers).set({ inspirationPicks: next }).where(eq(cohortMembers.id, member.id));
    res.json({ inspirationPicks: next });
  }));

  // Coordinator marks a request resolved. Optional resolvedNote.
  app.patch('/api/cohort/:coordinatorSlug/support-request/:requestId/resolve', wrap(async (req, res) => {
    const cohort = await findCohortByCoordinatorSlug(req.params.coordinatorSlug);
    if (!cohort) { res.status(404).json({ error: 'cohort not found' }); return; }

    const { resolvedNote } = req.body ?? {};
    const note = typeof resolvedNote === 'string' && resolvedNote.trim() ? resolvedNote.trim().slice(0, 1000) : null;

    const members = await db.select().from(cohortMembers).where(eq(cohortMembers.cohortId, cohort.id));
    for (const m of members) {
      const arr = Array.isArray(m.supportRequests) ? (m.supportRequests as SupportRequest[]) : [];
      const idx = arr.findIndex(r => r.id === req.params.requestId);
      if (idx === -1) continue;
      if (arr[idx].resolvedAt) { res.json({ ok: true, alreadyResolved: true }); return; }
      const next = [...arr];
      next[idx] = { ...next[idx], resolvedAt: new Date().toISOString(), resolvedNote: note };
      await db.update(cohortMembers).set({ supportRequests: next }).where(eq(cohortMembers.id, m.id));
      res.json({ ok: true, request: next[idx] });
      return;
    }
    res.status(404).json({ error: 'request not found' });
  }));

  // CBO pushes a snapshot of its current progress so the orchestrator can show it.
  // Workshop-phased unlock (P-8): clamp `phase` to the member's `unlockedPhases`.
  // Phase 6+ (export/wrap) is always allowed.
  app.patch('/api/cbo-member/:memberSlug/snapshot', wrap(async (req, res) => {
    const member = await findMemberBySlug(req.params.memberSlug);
    if (!member) { res.status(404).json({ error: 'member not found' }); return; }

    const {
      phase, sectionsComplete, maturityScore, flagsMet, intervention, cboStateId,
    } = req.body ?? {};

    let nextPhase = typeof phase === 'number' ? phase : member.snapshotPhase;
    if (typeof phase === 'number' && phase >= 1 && phase <= 5) {
      const unlocked = Array.isArray(member.unlockedPhases) ? (member.unlockedPhases as number[]) : [1];
      if (!unlocked.includes(phase)) {
        const maxAllowed = Math.max(...unlocked);
        nextPhase = maxAllowed;
        res.status(409).json({
          error: 'phase_locked',
          requestedPhase: phase,
          maxAllowedPhase: maxAllowed,
          unlockedPhases: unlocked,
        });
        return;
      }
    }

    const linkedStateId = cboStateId ?? member.cboStateId ?? null;

    await db.update(cohortMembers).set({
      cboStateId: linkedStateId,
      startedAt: member.startedAt ?? new Date(),
      snapshotPhase: nextPhase,
      snapshotSectionsComplete: typeof sectionsComplete === 'number' ? sectionsComplete : member.snapshotSectionsComplete,
      snapshotMaturityScore: typeof maturityScore === 'number' ? maturityScore : member.snapshotMaturityScore,
      snapshotFlagsMet: typeof flagsMet === 'number' ? flagsMet : member.snapshotFlagsMet,
      snapshotIntervention: typeof intervention === 'string' ? intervention : member.snapshotIntervention,
      snapshotUpdatedAt: new Date(),
    }).where(eq(cohortMembers.id, member.id));

    // Propagate the org link onto the working profile so the per-org document
    // store (and anything else scoped by org) works for this CBO. The member
    // got its org_id at invite time; the cbo_state↔org link is established here,
    // when the browser first reports which cboStateId it created.
    if (linkedStateId && member.orgId) {
      await linkCboStateToOrg(linkedStateId, member.orgId).catch(
        (e: any) => console.error('[cohort] link cbo_state→org failed:', e?.message || e));
    }
    res.json({ ok: true });
  }));
}

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
  const [created] = await db.insert(cohorts).values({
    coordinatorSlug: DEFAULT_COORDINATOR_SLUG,
    name: DEFAULT_COHORT_NAME,
    settings: { workshops: DEFAULT_WORKSHOPS },
  }).returning();
  return created;
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

async function findMemberBySlug(memberSlug: string) {
  const [m] = await db.select().from(cohortMembers).where(eq(cohortMembers.memberSlug, memberSlug)).limit(1);
  return m;
}

export function registerCohortRoutes(app: Express): void {
  // ──────────────────────────────────────────────────────────────────────
  // Singleton cohort — for the Vila Flores pilot, the orchestrator opens
  // straight to the one-and-only cohort. No coord slug to remember.
  // ──────────────────────────────────────────────────────────────────────
  app.get('/api/cohort/default', wrap(async (_req, res) => {
    const cohort = await getOrCreateDefaultCohort();
    const members = await db.select().from(cohortMembers).where(eq(cohortMembers.cohortId, cohort.id));
    res.json({ cohort, members });
  }));

  app.post('/api/cohort/default/reset', wrap(async (_req, res) => {
    const cohort = await getOrCreateDefaultCohort();
    // Wipe members, restore default workshop cadence. The cohort row itself
    // stays — same singleton, fresh state.
    await db.delete(cohortMembers).where(eq(cohortMembers.cohortId, cohort.id));
    await db.update(cohorts)
      .set({ settings: { workshops: DEFAULT_WORKSHOPS } })
      .where(eq(cohorts.id, cohort.id));
    const refreshed = await getOrCreateDefaultCohort();
    res.json({ cohort: refreshed, members: [] });
  }));

  // ──────────────────────────────────────────────────────────────────────
  // Create cohort — kept for backward-compat with anything that still calls
  // it. The pilot's UI no longer surfaces this.
  // ──────────────────────────────────────────────────────────────────────
  app.post('/api/cohort', wrap(async (req, res) => {
    const { name } = req.body ?? {};
    const coordinatorSlug = slug();
    const [created] = await db.insert(cohorts).values({
      coordinatorSlug,
      name: name || 'Untitled cohort',
      settings: { workshops: DEFAULT_WORKSHOPS },
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
    const [member] = await db.insert(cohortMembers).values({
      cohortId: cohort.id,
      memberSlug,
      orgName,
      neighborhood: neighborhood || null,
      role: role === 'alternate' ? 'alternate' : 'priority',
      origin: origin === 'external' ? 'external' : 'cohort',
      unlockedPhases: [1],
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

  // Member-facing read (no auth beyond knowing the slug). Also returns the
  // cohort's workshop cadence so the CBO welcome page can show *which*
  // workshop will unlock their next phase, and when.
  app.get('/api/cbo-member/:memberSlug', wrap(async (req, res) => {
    const member = await findMemberBySlug(req.params.memberSlug);
    if (!member) { res.status(404).json({ error: 'member not found' }); return; }

    const [cohort] = await db.select().from(cohorts).where(eq(cohorts.id, member.cohortId)).limit(1);
    const workshops = (cohort?.settings as CohortSettings | null)?.workshops ?? [];

    const unlocked = (member.unlockedPhases as number[] | null) ?? [1];
    const maxUnlocked = Math.max(0, ...unlocked);
    const nextPhase = maxUnlocked + 1;
    const nextWorkshop = workshops.find(w => w.unlocksPhase === nextPhase) ?? null;

    // The "focus workshop" is what the CBO welcome card should highlight —
    // it must reflect THIS member's progress, not the cohort's global state.
    // Workshops are cohort-wide (one `openedAt` per workshop shared by all
    // members), so a late-joining member inherited the most-recently-opened
    // workshop as their "current" — pushing Test Farm to W2 before they'd
    // done W1. Fix: pick the earliest workshop the member hasn't completed
    // (= the workshop whose `unlocksPhase` equals their current snapshot
    // phase). Fall back to the first workshop in the sequence for brand-new
    // members with no snapshot yet.
    const memberPhase = typeof member.snapshotPhase === 'number' && member.snapshotPhase > 0
      ? member.snapshotPhase
      : 1; // brand-new member → start at W1 (unlocks phase 1)
    const focusWorkshop =
      workshops.find(w => w.unlocksPhase === memberPhase) ??
      workshops[0] ??
      null;
    // "Current" if the member has actually started (any opened workshop AND
    // the member has at least passed the welcome screen, i.e. snapshotPhase
    // moved past null). For brand-new invitees, the workshop is "upcoming."
    const focusWorkshopIsCurrent =
      !!focusWorkshop?.openedAt && typeof member.snapshotPhase === 'number' && member.snapshotPhase > 0;

    const supportRequests = Array.isArray(member.supportRequests) ? (member.supportRequests as SupportRequest[]) : [];
    const supportPending = supportRequests.filter(r => !r.resolvedAt);

    res.json({
      id: member.id,
      orgName: member.orgName,
      neighborhood: member.neighborhood,
      path: member.path ?? null,
      unlockedPhases: unlocked,
      cboStateId: member.cboStateId,
      cohort: cohort ? { id: cohort.id, name: cohort.name } : null,
      workshops,
      nextWorkshop,
      focusWorkshop,
      focusWorkshopIsCurrent,
      supportRequests,
      supportPendingCount: supportPending.length,
      inspirationPicks: Array.isArray(member.inspirationPicks) ? member.inspirationPicks : [],
    });
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

    await db.update(cohortMembers).set({
      cboStateId: cboStateId ?? member.cboStateId ?? null,
      startedAt: member.startedAt ?? new Date(),
      snapshotPhase: nextPhase,
      snapshotSectionsComplete: typeof sectionsComplete === 'number' ? sectionsComplete : member.snapshotSectionsComplete,
      snapshotMaturityScore: typeof maturityScore === 'number' ? maturityScore : member.snapshotMaturityScore,
      snapshotFlagsMet: typeof flagsMet === 'number' ? flagsMet : member.snapshotFlagsMet,
      snapshotIntervention: typeof intervention === 'string' ? intervention : member.snapshotIntervention,
      snapshotUpdatedAt: new Date(),
    }).where(eq(cohortMembers.id, member.id));
    res.json({ ok: true });
  }));
}

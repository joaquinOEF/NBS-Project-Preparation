import type { Express, Request, Response, RequestHandler } from 'express';
import { eq } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { db } from '../db';
import {
  cohorts,
  cohortMembers,
  DEFAULT_WORKSHOPS,
  type CohortSettings,
  type WorkshopConfig,
} from '@shared/cohort-schema';

// Slug-as-secret: 24 chars of url-safe nanoid. ~143 bits of entropy; fine for
// a 10-CBO pilot where the only attacker is a coordinator's WhatsApp typo.
const slug = () => nanoid(24);

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
  // Create cohort
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

  // Invite a CBO
  app.post('/api/cohort/:coordinatorSlug/invite', wrap(async (req, res) => {
    const cohort = await findCohortByCoordinatorSlug(req.params.coordinatorSlug);
    if (!cohort) { res.status(404).json({ error: 'cohort not found' }); return; }

    const { orgName, neighborhood, role, origin } = req.body ?? {};
    if (!orgName) { res.status(400).json({ error: 'orgName required' }); return; }

    const memberSlug = slug();
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

    res.json({
      id: member.id,
      orgName: member.orgName,
      neighborhood: member.neighborhood,
      unlockedPhases: unlocked,
      cboStateId: member.cboStateId,
      cohort: cohort ? { id: cohort.id, name: cohort.name } : null,
      workshops,
      nextWorkshop,
    });
  }));

  // CBO pushes a snapshot of its current progress so the orchestrator can show it.
  app.patch('/api/cbo-member/:memberSlug/snapshot', wrap(async (req, res) => {
    const member = await findMemberBySlug(req.params.memberSlug);
    if (!member) { res.status(404).json({ error: 'member not found' }); return; }

    const {
      phase, sectionsComplete, maturityScore, flagsMet, intervention, cboStateId,
    } = req.body ?? {};

    await db.update(cohortMembers).set({
      cboStateId: cboStateId ?? member.cboStateId ?? null,
      startedAt: member.startedAt ?? new Date(),
      snapshotPhase: typeof phase === 'number' ? phase : member.snapshotPhase,
      snapshotSectionsComplete: typeof sectionsComplete === 'number' ? sectionsComplete : member.snapshotSectionsComplete,
      snapshotMaturityScore: typeof maturityScore === 'number' ? maturityScore : member.snapshotMaturityScore,
      snapshotFlagsMet: typeof flagsMet === 'number' ? flagsMet : member.snapshotFlagsMet,
      snapshotIntervention: typeof intervention === 'string' ? intervention : member.snapshotIntervention,
      snapshotUpdatedAt: new Date(),
    }).where(eq(cohortMembers.id, member.id));
    res.json({ ok: true });
  }));
}

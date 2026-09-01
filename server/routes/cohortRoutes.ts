import type { Express, Request, Response, RequestHandler } from 'express';
import { eq, and, inArray, desc } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { db } from '../db';
import {
  listDocumentsForScope,
  getDocumentForScope,
  countDocumentsForMembers,
  docPreviewForMembers,
  toDocumentMeta,
} from '../services/documentPersistence';
import {
  cohorts,
  cohortMembers,
  DEFAULT_WORKSHOPS,
  effectiveUnlockedPhases,
  openPhasesFrom,
  SUPPORT_REQUEST_TYPES,
  type CohortSettings,
  type SupportRequest,
  type SupportRequestType,
  type WorkshopConfig,
  type MemberSite,
} from '@shared/cohort-schema';
import { createOrganization, linkCboStateToOrg, setMaturityTierForCboState } from '../services/orgPersistence';
import { cboStates } from '@shared/cbo-db-schema';
import { cboSectionsFilledCount, type CboState } from '@shared/cbo-schema';
import {
  buildDossier,
  portfolioState,
  studyRequirement,
  type CapacityGrade,
  type VerdictState,
} from '@shared/w3-dossier';
import { getSolutionFicha } from '@shared/nbs-solution-fichas';
import { synergyFactsFrom, type SynergyFacts } from '@shared/w3-synergies';
import { orgHealth, VERDICT_ORDER } from '@shared/cohort-doctor';
import { buildSynergyReport } from '../services/synergyReport';
import { synergyReports } from '@shared/cohort-schema';
import { renderSynergyHtml } from '../services/synergyPrint';
import { getCboMessages, getCboState, setCboState, loadCboFromDb, debouncedPersist } from '../services/cboAgent';
import JSZip from 'jszip';
import { getObject } from '../services/blobStorage';
import { buildContextMarkdown, buildTranscriptMarkdown, type BundleDoc } from '../services/contextBundle';
import { deleteCboState } from '../services/cboPersistence';
import {
  requireCoordinator,
  createCoordinator,
  getCoordinatorByEmail,
  publicCoordinator,
  type CoordinatorRequest,
} from '../services/coordinatorAuth';
import { coordinators } from '@shared/coordinator-schema';
import { organizations } from '@shared/org-schema';

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

  // Union with what the cohort opened — the same rule the gate applies, so the
  // banner an org sees and the phase it is allowed into can never disagree.
  const unlocked = effectiveUnlockedPhases(member.unlockedPhases, cohort?.settings as CohortSettings | null);
  const maxUnlocked = Math.max(0, ...unlocked);
  const nextPhase = maxUnlocked + 1;
  const nextWorkshop = workshops.find(w => w.unlocksPhase === nextPhase) ?? null;

  // The cbo_state is the source of truth for the working phase. member.snapshotPhase
  // is a denormalized cache that can lag — it's only refreshed on a `phase_change`
  // SSE event during a live session, so a phase advanced via /advance-phase or
  // during a cross-device session swap leaves it stale (the welcome screen then
  // shows the wrong encontro). Prefer the live state, and self-heal the cache so
  // the coordinator roster (which reads snapshotPhase directly) stays correct too.
  let statePhase = 0;
  if (member.cboStateId) {
    const live = getCboState(member.cboStateId) ?? (await loadCboFromDb(member.cboStateId))?.state;
    if (live && typeof live.phase === 'number') statePhase = live.phase;
  }
  const snapPhase = typeof member.snapshotPhase === 'number' ? member.snapshotPhase : 0;
  const effectivePhase = Math.max(statePhase, snapPhase);
  if (statePhase > snapPhase) {
    await db.update(cohortMembers).set({ snapshotPhase: statePhase }).where(eq(cohortMembers.id, member.id)).catch(() => {});
  }

  const memberPhase = effectivePhase > 0 ? effectivePhase : 1;
  const focusWorkshop = workshops.find(w => w.unlocksPhase === memberPhase) ?? workshops[0] ?? null;
  const focusWorkshopIsCurrent = !!focusWorkshop?.openedAt && effectivePhase > 0;

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
    site: (member.site as MemberSite | null) ?? null,
    workshops,
    nextWorkshop,
    focusWorkshop,
    focusWorkshopIsCurrent,
    supportRequests,
    supportPendingCount: supportPending.length,
    inspirationPicks: Array.isArray(member.inspirationPicks) ? member.inspirationPicks : [],
  };
}

// Attach each CBO's uploaded-document count to roster rows (one grouped query,
// no N+1) so the orchestrator cards can show a 📎 file-count chip.
async function attachDocCounts<T extends { id: string; orgId: string | null; cboStateId: string | null }>(
  members: T[],
): Promise<(T & { documentCount: number; docPreview: DocPreview })[]> {
  // One query for the whole roster — 10+ orgs load at once and must not fan out.
  const preview = await docPreviewForMembers(
    members.map(m => ({ id: m.id, orgId: m.orgId, cboStateId: m.cboStateId })),
  );
  return members.map(m => {
    const p = preview.get(m.id) ?? { total: 0, imageIds: [], filenames: [], teiaSprint: false };
    return { ...m, documentCount: p.total, docPreview: p };
  });
}

type DocPreview = { total: number; imageIds: string[]; filenames: string[]; teiaSprint: boolean };

/** What the coordinator reads at a glance about an org's Encontro 2 (#25). */
export type MemberW2Signal = {
  /** The mechanism they named first — Alagamento / Inundação / Enxurrada / … */
  worry: string | null;
  worryCount: number;
  depth: 'thin' | 'partial' | 'strong' | null;
  bairro: string | null;
  teiaSprint: string | null;
  priorCollaboration: string | null;
};
const EMPTY_W2: MemberW2Signal = {
  worry: null, worryCount: 0, depth: null, bairro: null,
  teiaSprint: null, priorCollaboration: null,
};

/**
 * What the coordinator reads at a glance about an org's Encontro 3.
 *
 * ⚠️ Four states, not two. The 27 August meeting agreed a two-way split —
 * known-feasible vs requires-expert-study — and four real W2 records broke it:
 * only one of the four was blocked by a technical unknown, one had never chosen
 * a place, one was engineering-trivial and blocked entirely by paperwork, and
 * one was two projects with two different answers. Rounding those to two
 * columns freezes a garden that could take money tomorrow, or sends someone to
 * dig a swale sized by eye at the foot of a slope. See docs/w3-flow.md.
 *
 * `state` is the WORST verdict across the org's chosen solutions, because a
 * list row can only carry one badge and the worst one is the only honest
 * single answer. The per-solution verdicts are on the org's own card.
 */
export type MemberW3Signal = {
  state: VerdictState | null;
  /** The single thing that would move it on, in the coordinator's language. */
  unblockedBy: string | null;
  capacity: CapacityGrade | null;
  solutions: string[];
  areaM2: number | null;
  /** Named gaps — an honest count of what W3 could not produce, never zeroed. */
  gapCount: number;
  /** Items proposed for the COORDINATION rather than the organisation: the
   *  coordinator's actual queue out of this workshop. */
  coordinationItems: number;
};
const EMPTY_W3: MemberW3Signal = {
  state: null, unblockedBy: null, capacity: null,
  solutions: [], areaM2: null, gapCount: 0, coordinationItems: 0,
};

/** The dossier, computed from a member's live state — the same pure function the
 *  org's own closing card renders, so the two can never disagree. */
function w3SignalFrom(sections: CboState['sections']): MemberW3Signal {
  const asRecord = (id: string) =>
    Object.fromEntries(
      Object.entries(((sections as any)?.[id]?.fields ?? {}) as Record<string, { value?: unknown }>)
        .map(([k, v]) => [k, String(v?.value ?? '')]),
    );
  const site = asRecord('intervention_site');
  const type = asRecord('intervention_type');
  const solutions = (type.chosen_solutions ?? '').split(',').map(s => s.trim()).filter(Boolean);
  // Nothing chosen and no place marked = this org has not started W3. Reporting
  // a verdict for it would put a badge on a row that has no project behind it.
  if (!solutions.length && !site._site_lat && !site.site_lat) return EMPTY_W3;

  const areaM2 = Number(site.site_area_m2) || 0;
  const dossier = buildDossier({
    site,
    org: asRecord('org_profile'),
    solutions,
    ...(areaM2 ? { areaM2 } : {}),
    w3: { ...type, ...asRecord('impact_monitoring'), ...asRecord('operations_sustain') },
  }, 'pt');
  const state = portfolioState(dossier.verdicts);
  return {
    state,
    unblockedBy: dossier.verdicts.find(v => v.state === state)?.unblockedBy ?? null,
    capacity: dossier.capacity.grade,
    solutions,
    areaM2: areaM2 || null,
    gapCount: dossier.gaps.length,
    coordinationItems: dossier.items.filter(i => i.owner === 'coordination').length,
  };
}

// Roster progress derived from the LIVE cbo_state, not the pushed snapshot.
// snapshotSectionsComplete is only written by the client PATCH, and no client
// code sends that field — so the coordinator's sections ring and the
// "profiles in progress / complete" KPIs sat at 0 for every member. Derive the
// count server-side with one grouped query (same shape as attachDocCounts).
// A section counts when it has >=1 filled, non-invite field — the same signal
// phaseComplete() in shared/cbo-schema.ts uses, so the coordinator view and
// the CBO's own advance banner can never disagree. Falls back to the snapshot
// for members whose cbo_state hasn't been created yet.
async function attachDerivedSections<
  T extends { cboStateId: string | null; snapshotSectionsComplete: number | null },
>(members: T[]): Promise<(T & { derivedSectionsComplete: number; w2: MemberW2Signal; w3: MemberW3Signal })[]> {
  const ids = Array.from(new Set(members.map(m => m.cboStateId).filter((v): v is string => !!v)));
  const byState = new Map<string, number>();
  const w2ByState = new Map<string, MemberW2Signal>();
  const w3ByState = new Map<string, MemberW3Signal>();
  const synergyByState = new Map<string, SynergyFacts>();
  if (ids.length > 0) {
    const rows = await db
      .select({ id: cboStates.id, sections: cboStates.sections })
      .from(cboStates)
      .where(inArray(cboStates.id, ids));
    for (const row of rows) {
      const sections = (row.sections ?? {}) as CboState['sections'];
      byState.set(row.id, cboSectionsFilledCount({ sections }));
      // The W2 read the convening asked to see on the card (backlog #25): what
      // worries them, how much we actually know, and the two new answers.
      // Derived from the same rows we already fetched — no extra query.
      const f: any = (sections as any)?.intervention_site?.fields ?? {};
      const val = (k: string) => String(f[k]?.value ?? '').trim();
      const worries = val('site_worry').split(',').map(w => w.trim()).filter(Boolean);
      w2ByState.set(row.id, {
        worry: worries[0] ?? null,
        worryCount: worries.length,
        depth: (val('site_knowledge_depth') || null) as MemberW2Signal['depth'],
        bairro: val('bairro') || null,
        teiaSprint: val('teia_sprint') || null,
        priorCollaboration: val('prior_collaboration') || null,
      });
      // Same rows, no extra query. Wrapped because a dossier that throws must
      // not take down the whole roster — a coordinator with no board is worse
      // off than one with a blank column.
      try {
        synergyByState.set(row.id, synergyFactsFrom(sections));
      } catch (err) {
        console.error(`[cohort] synergy facts failed for ${row.id}:`, err);
      }
      try {
        w3ByState.set(row.id, w3SignalFrom(sections));
      } catch (err) {
        console.error(`[cohort] w3 signal failed for ${row.id}:`, err);
      }
    }
  }
  return members.map(m => ({
    ...m,
    synergy: (m.cboStateId && synergyByState.get(m.cboStateId)) || null,
    derivedSectionsComplete:
      m.cboStateId && byState.has(m.cboStateId)
        ? byState.get(m.cboStateId)!
        : (m.snapshotSectionsComplete ?? 0),
    w2: (m.cboStateId && w2ByState.get(m.cboStateId)) || EMPTY_W2,
    w3: (m.cboStateId && w3ByState.get(m.cboStateId)) || EMPTY_W3,
  }));
}

// Org maturity tier per member, one grouped query (EF-5) — drives the
// coordinator's tier chip/override on the roster cards.
async function attachOrgTiers<T extends { orgId: string | null }>(
  members: T[],
): Promise<(T & { maturityTier: string | null })[]> {
  const ids = Array.from(new Set(members.map(m => m.orgId).filter((v): v is string => !!v)));
  const byOrg = new Map<string, string | null>();
  if (ids.length > 0) {
    const rows = await db
      .select({ id: organizations.id, tier: organizations.maturityTier })
      .from(organizations)
      .where(inArray(organizations.id, ids));
    for (const r of rows) byOrg.set(r.id, r.tier ?? null);
  }
  return members.map(m => ({ ...m, maturityTier: (m.orgId && byOrg.get(m.orgId)) || null }));
}

/**
 * A synergy pass that outlives the process that started it is a stuck button.
 * Ten minutes is far longer than the pass can legitimately take (the model call
 * itself is capped at 45s) and short enough that a coordinator who republished
 * mid-meeting can just press the button again.
 */
const STALE_RUN_MS = 10 * 60 * 1000;

/** The newest run for a cohort, with an abandoned one recorded as interrupted. */
async function reapStaleRun(cohortId: string) {
  const [row] = await db
    .select()
    .from(synergyReports)
    .where(eq(synergyReports.cohortId, cohortId))
    .orderBy(desc(synergyReports.startedAt))
    .limit(1);
  if (!row) return null;
  const startedAt = row.startedAt ? new Date(row.startedAt).getTime() : 0;
  if (row.status !== 'running' || Date.now() - startedAt < STALE_RUN_MS) return row;
  const error = 'a análise foi interrompida antes de terminar — pode rodar de novo';
  await db.update(synergyReports)
    .set({ status: 'failed', error, finishedAt: new Date() })
    .where(eq(synergyReports.id, row.id))
    .catch(() => {});
  console.warn(`[synergy] ${cohortId}: run ${row.id} abandoned after ${Math.round((Date.now() - startedAt) / 1000)}s — marked failed`);
  return { ...row, status: 'failed' as const, error };
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
  /**
   * The synergy pass. Ricardo does this by hand today, for ten organisations,
   * and it goes stale the moment anyone answers another question.
   *
   * POST rather than GET because it costs a model call and a coordinator
   * pressing it is an intentional act — and because a re-run after three more
   * sessions should give a different answer, which is the entire point.
   */
  /**
   * The last completed report, opened instantly. Survives a redeploy.
   *
   * Two rules learned from reading what a redeploy does to this row:
   *
   * ⚠️ A `running` row is only believable for so long. The pass itself caps at
   * 45s, but the process holding it does not survive a republish — and a row
   * left `running` forever disables the button forever, with a spinner and no
   * way back. Anything older than STALE_RUN_MS is recorded as interrupted, so
   * the coordinator gets a button instead of a permanent animation.
   *
   * ⚠️ A run in flight must never hide the last good report. Returning only the
   * newest row meant that pressing "Rodar de novo" during the meeting made the
   * current report unreachable until the new one landed — and permanently if it
   * failed. Status comes from the newest run; the payload comes from the newest
   * DONE one.
   */
  app.get('/api/cohort/:cohortId/synergies', wrap(async (req, res) => {
    const latest = await reapStaleRun(req.params.cohortId);
    if (!latest) return res.json({ report: null });
    const done = latest.status === 'done'
      ? latest
      : (await db
          .select()
          .from(synergyReports)
          .where(and(eq(synergyReports.cohortId, req.params.cohortId), eq(synergyReports.status, 'done')))
          .orderBy(desc(synergyReports.startedAt))
          .limit(1))[0];
    res.json({
      id: latest.id,
      status: latest.status,
      error: latest.error,
      startedAt: latest.startedAt,
      finishedAt: done?.finishedAt ?? latest.finishedAt,
      report: done?.payload ?? null,
      /** True when the payload below is an earlier run than the status above. */
      stale: !!done && done.id !== latest.id,
    });
  }));

  /** The same report as a printable document, for the in-person meeting. */
  app.get('/api/cohort/:cohortId/synergies/print', wrap(async (req, res) => {
    const [row] = await db
      .select()
      .from(synergyReports)
      .where(and(eq(synergyReports.cohortId, req.params.cohortId), eq(synergyReports.status, 'done')))
      .orderBy(desc(synergyReports.startedAt))
      .limit(1);
    if (!row?.payload) return res.status(404).send('Nenhum relatório gerado ainda.');
    const [cohort] = await db.select().from(cohorts).where(eq(cohorts.id, req.params.cohortId)).limit(1);
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(renderSynergyHtml(row.payload as any, cohort?.name ?? 'a Rede'));
  }));

  app.post('/api/cohort/:cohortId/synergies', wrap(async (req, res) => {
    // One pass at a time. A double-tap on a slow connection used to start two
    // model calls over the same records and leave the loser `running` forever.
    const inFlight = await reapStaleRun(req.params.cohortId);
    if (inFlight?.status === 'running') {
      res.status(202).json({ id: inFlight.id, status: 'running', alreadyRunning: true });
      return;
    }
    const rows = await db
      .select()
      .from(cohortMembers)
      .where(eq(cohortMembers.cohortId, req.params.cohortId));
    const withDocs = await attachDocCounts(rows as any);
    const enriched = await attachDerivedSections(withDocs as any);

    const members = (enriched as any[])
      // The test organisation stays on the roster and out of the analysis.
      .filter(m => !m.excludeFromPortfolio)
      .map(m => {
        const s = m.synergy ?? {};
        return {
          id: m.id,
          orgName: m.orgName,
          bairro: m.w2?.bairro ?? m.neighborhood ?? null,
          siteName: s.siteName ?? null,
          hasSite: !!s.hasSite,
          tenure: s.tenure ?? null,
          currentUse: s.currentUse ?? null,
          worry: m.w2?.worry ?? null,
          familias: s.familias ?? [],
          solutions: s.solutions ?? [],
          roles: s.roles ?? [],
          priorCollaboration: m.w2?.priorCollaboration ?? null,
          priorCollaborationDetail: s.priorCollaborationDetail ?? null,
          nbsExperience: s.nbsExperience ?? null,
          fundingScale: s.fundingScale ?? null,
          biggestBudget: s.biggestBudget ?? null,
          maturityScore: m.snapshotMaturityScore ?? 0,
          verdict: m.w3?.state ?? null,
          studyNeeds: s.studyNeeds ?? [],
          bodies: s.bodies ?? [],
          docCount: m.documentCount ?? 0,
          ownWords: s.ownWords ?? { story: null, whyHere: null, baseline: null },
          correctionsPt: s.correctionsPt ?? null,
          docs: (m.docPreview?.filenames ?? []).map((filename: string) => ({
            filename, purpose: null, summary: null,
          })),
          // "Started" means a real answer exists, not that a row does. Three of
          // the ten in the hand-written report had an invite and nothing else.
          started: (m.derivedSectionsComplete ?? 0) > 0,
        };
      });

    // A row first, so the coordinator can close the tab. The pass takes tens of
    // seconds over ten organisations' full records, and a button that holds a
    // request open for a minute is a button that fails on the venue wifi.
    const [row] = await db
      .insert(synergyReports)
      .values({ cohortId: req.params.cohortId, status: 'running', requestedBy: (req as any).coordinator?.id ?? null })
      .returning();
    res.status(202).json({ id: row.id, status: 'running' });

    // Deliberately after the response. Nothing waits on it, and a failure is
    // recorded rather than thrown into a closed socket.
    void (async () => {
      try {
        const report = await buildSynergyReport(members);
        await db.update(synergyReports)
          .set({ status: 'done', payload: report as any, finishedAt: new Date() })
          .where(eq(synergyReports.id, row.id));
        console.log(`[synergy] ${req.params.cohortId}: ${report.analysis.groups.length} grouping(s), ${report.narrative?.lines.length ?? 0} line(s)${report.narrativeReason ? ` — ${report.narrativeReason}` : ''}`);
      } catch (err: any) {
        console.error(`[synergy] ${req.params.cohortId} failed:`, err?.message || err);
        await db.update(synergyReports)
          .set({ status: 'failed', error: String(err?.message ?? 'erro desconhecido'), finishedAt: new Date() })
          .where(eq(synergyReports.id, row.id))
          .catch(() => {});
      }
    })();
  }));

  app.get('/api/cohort/mine', wrap(async (req, res) => {
    const coordinator = reqCoordinator(req);
    let cohort: Awaited<ReturnType<typeof getOrCreateDefaultCohort>> | undefined;
    if (coordinator?.cohortId) {
      const [c] = await db.select().from(cohorts).where(eq(cohorts.id, coordinator.cohortId)).limit(1);
      cohort = c;
    }
    if (!cohort) cohort = await getOrCreateDefaultCohort();
    const members = await attachOrgTiers(await attachDerivedSections(await attachDocCounts(await db.select().from(cohortMembers).where(eq(cohortMembers.cohortId, cohort.id)))));
    res.json({ cohort, members, isAdmin: !coordinator?.cohortId });
  }));

  // ──────────────────────────────────────────────────────────────────────
  // Admin cohort directory — every cohort with its coordinator + member count,
  // for the admin's cohort switcher. Admin-only (a scoped coordinator only ever
  // sees their own cohort via /mine). MUST be registered before the
  // `/:coordinatorSlug` param route below, or 'all' is read as a slug.
  // ──────────────────────────────────────────────────────────────────────
  app.get('/api/cohort/all', wrap(async (req, res) => {
    if (reqCoordinator(req)?.cohortId) { res.status(403).json({ error: 'admin only' }); return; }
    const allCohorts = await db.select().from(cohorts);
    const coords = await db.select().from(coordinators);
    const coordByCohort = new Map(coords.filter(c => c.cohortId).map(c => [c.cohortId as string, c]));
    const memberRows = await db.select({ cohortId: cohortMembers.cohortId }).from(cohortMembers);
    const countByCohort = new Map<string, number>();
    for (const m of memberRows) countByCohort.set(m.cohortId, (countByCohort.get(m.cohortId) ?? 0) + 1);
    const items = allCohorts.map(c => ({
      id: c.id,
      name: c.name,
      coordinatorSlug: c.coordinatorSlug,
      language: (c.settings as CohortSettings | null)?.language ?? null,
      memberCount: countByCohort.get(c.id) ?? 0,
      coordinatorName: coordByCohort.get(c.id)?.name ?? null,
      coordinatorEmail: coordByCohort.get(c.id)?.email ?? null,
      isDefault: c.coordinatorSlug === DEFAULT_COORDINATOR_SLUG,
    }));
    // Default cohort first, then alphabetical — a stable order for the switcher.
    items.sort((a, b) =>
      a.isDefault ? -1 : b.isDefault ? 1 : a.name.localeCompare(b.name));
    res.json({ cohorts: items });
  }));

  // ──────────────────────────────────────────────────────────────────────
  // Provision a coordinator AND their cohort in one admin-authed call — the
  // primary creation path (replaces the create-coordinator shell script + the
  // cohort-UUID dance). Admin stays logged in as themselves; the new coordinator
  // gets email + password to log in and is scoped to the freshly-created cohort.
  // MUST be registered before the `/:coordinatorSlug` param routes.
  // ──────────────────────────────────────────────────────────────────────
  app.post('/api/cohort/create-with-coordinator', wrap(async (req, res) => {
    if (reqCoordinator(req)?.cohortId) { res.status(403).json({ error: 'only an admin can create cohorts' }); return; }
    const { coordinatorName, email, password, cohortName, language: rawLang } = req.body ?? {};
    if (!email || !password) { res.status(400).json({ error: 'coordinator email and password are required' }); return; }
    if (!cohortName || !String(cohortName).trim()) { res.status(400).json({ error: 'cohort name is required' }); return; }
    if (String(password).length < 6) { res.status(400).json({ error: 'password must be at least 6 characters' }); return; }

    const existing = await getCoordinatorByEmail(String(email));
    if (existing) { res.status(409).json({ error: 'a coordinator with that email already exists' }); return; }

    const language = rawLang === 'pt' || rawLang === 'en' ? rawLang : undefined;
    const [cohort] = await db.insert(cohorts).values({
      coordinatorSlug: slug(),
      name: String(cohortName).trim(),
      settings: { workshops: DEFAULT_WORKSHOPS, language },
    }).returning();
    const coordinator = await createCoordinator({
      email: String(email),
      password: String(password),
      name: coordinatorName ? String(coordinatorName).trim() : undefined,
      cohortId: cohort.id,
    });
    res.status(201).json({ cohort, coordinator: publicCoordinator(coordinator) });
  }));

  // ──────────────────────────────────────────────────────────────────────
  // Singleton cohort — legacy entry point. Still serves the default cohort,
  // but now ownership-checked so a scoped coordinator can't read/wipe it.
  // ──────────────────────────────────────────────────────────────────────
  app.get('/api/cohort/default', wrap(async (req, res) => {
    const cohort = await getOrCreateDefaultCohort();
    if (!mayAccessCohort(req, cohort.id)) { res.status(403).json({ error: 'forbidden' }); return; }
    const members = await attachOrgTiers(await attachDerivedSections(await attachDocCounts(await db.select().from(cohortMembers).where(eq(cohortMembers.cohortId, cohort.id)))));
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

  // Delete a cohort ENTIRELY — its members + the cohort row (unlike reset, which
  // keeps the cohort). The :coordinatorSlug app.param guard enforces ownership;
  // the default cohort is re-created empty on the next /mine. Cleanup for
  // throwaway/test cohorts.
  app.delete('/api/cohort/:coordinatorSlug', wrap(async (req, res) => {
    const cohort = (req as any).cohort ?? await findCohortByCoordinatorSlug(req.params.coordinatorSlug);
    if (!cohort) { res.status(404).json({ error: 'cohort not found' }); return; }
    await db.delete(cohortMembers).where(eq(cohortMembers.cohortId, cohort.id));
    await db.delete(cohorts).where(eq(cohorts.id, cohort.id));
    res.json({ ok: true, deleted: cohort.id });
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
    const members = await attachOrgTiers(await attachDerivedSections(await attachDocCounts(await db.select().from(cohortMembers).where(eq(cohortMembers.cohortId, cohort.id)))));
    res.json({ cohort, members });
  }));

  // ──────────────────────────────────────────────────────────────────────
  // Evidence locker (coordinator side) — list / read a CBO's uploaded files.
  // Ownership-enforced by the :coordinatorSlug app.param guard above; we also
  // confirm the member belongs to THIS cohort, then scope documents to the
  // member's org so one cohort can't read another's files.
  // ──────────────────────────────────────────────────────────────────────
  async function memberInCohort(req: Request): Promise<typeof cohortMembers.$inferSelect | null> {
    const cohort = (req as any).cohort as { id: string } | undefined;
    if (!cohort) return null;
    const [member] = await db.select().from(cohortMembers)
      .where(and(eq(cohortMembers.id, req.params.memberId), eq(cohortMembers.cohortId, cohort.id)))
      .limit(1);
    return member ?? null;
  }

  app.get('/api/cohort/:coordinatorSlug/member/:memberId/documents', wrap(async (req, res) => {
    const member = await memberInCohort(req);
    if (!member) { res.status(404).json({ error: 'member not found' }); return; }
    const docs = await listDocumentsForScope({ orgId: member.orgId, cboStateId: member.cboStateId });
    res.json({ documents: docs.map(toDocumentMeta) });
  }));

  app.get('/api/cohort/:coordinatorSlug/member/:memberId/documents/:docId/text', wrap(async (req, res) => {
    const member = await memberInCohort(req);
    if (!member) { res.status(404).json({ error: 'member not found' }); return; }
    const doc = await getDocumentForScope(req.params.docId, { orgId: member.orgId, cboStateId: member.cboStateId });
    if (!doc) { res.status(404).json({ error: 'not found' }); return; }
    res.json({ fullText: doc.fullText ?? '', summary: doc.summary ?? null });
  }));

  // The CBO's encontro chat transcript (read-only, coordinator side).
  app.get('/api/cohort/:coordinatorSlug/member/:memberId/chat', wrap(async (req, res) => {
    const member = await memberInCohort(req);
    if (!member) { res.status(404).json({ error: 'member not found' }); return; }
    if (!member.cboStateId) { res.json({ messages: [] }); return; }
    let messages = getCboMessages(member.cboStateId);
    if (messages.length === 0) {
      const persisted = await loadCboFromDb(member.cboStateId);
      if (persisted?.messages?.length) messages = persisted.messages;
    }
    res.json({ messages });
  }));

  // The CBO's profile document being built — sections + maturity scores. Compact
  // read-only snapshot for the coordinator (they see scores; the CBO doesn't).
  app.get('/api/cohort/:coordinatorSlug/member/:memberId/profile', wrap(async (req, res) => {
    const member = await memberInCohort(req);
    if (!member) { res.status(404).json({ error: 'member not found' }); return; }
    if (!member.cboStateId) { res.json({ profile: null }); return; }
    let state = getCboState(member.cboStateId);
    if (!state) state = (await loadCboFromDb(member.cboStateId))?.state;
    if (!state) { res.json({ profile: null }); return; }
    res.json({
      profile: {
        phase: state.phase,
        sections: state.sections,
        maturityScores: state.maturityScores,
        totalMaturityScore: state.totalMaturityScore,
        gaps: state.gaps,
      },
    });
  }));

  // ──────────────────────────────────────────────────────────────────────
  // Context bundle — one org, one zip, readable by a person or an agent.
  // JVP 2026-08-03: "an export button which downloads a folder with all that
  // we have that you or another agent can read to get the full context bundle
  // of that org." Built server-side because it needs the profile, the whole
  // transcript, AND the blob originals — the drawer has none of the last two in
  // full, and reassembling them client-side would mean N+1 fetches over the
  // coordinator's connection.
  //
  // Ownership-gated by the :coordinatorSlug param guard + memberInCohort, like
  // every other member read here.
  // ──────────────────────────────────────────────────────────────────────
  app.get('/api/cohort/:coordinatorSlug/member/:memberId/export', wrap(async (req, res) => {
    const member = await memberInCohort(req);
    if (!member) { res.status(404).json({ error: 'member not found' }); return; }

    let state: CboState | null = null;
    let messages: any[] = [];
    if (member.cboStateId) {
      state = getCboState(member.cboStateId) ?? null;
      messages = getCboMessages(member.cboStateId);
      if (!state || messages.length === 0) {
        const persisted = await loadCboFromDb(member.cboStateId);
        state = state ?? persisted?.state ?? null;
        if (messages.length === 0) messages = persisted?.messages ?? [];
      }
    }

    const rows = await listDocumentsForScope({ orgId: member.orgId, cboStateId: member.cboStateId });
    const docs: BundleDoc[] = [];
    for (const d of rows) {
      // Originals are best-effort: a doc whose blob is gone (or predates blob
      // storage) still appears in context.md with its extracted text, which is
      // the part that carries meaning. Failing the whole export over one
      // missing attachment would be the wrong trade.
      let bytes: Buffer | null = null;
      if (d.storageKey) bytes = await getObject(d.storageKey).catch(() => null);
      docs.push({
        filename: d.filename,
        kind: d.kind,
        droppedInPhase: d.droppedInPhase,
        summary: d.summary,
        fullText: d.fullText,
        bytes,
      });
    }

    const input = {
      orgName: member.orgName || 'organização',
      bairro: member.neighborhood,
      state,
      messages,
      docs,
      generatedAt: new Date().toISOString().slice(0, 16).replace('T', ' '),
    };

    const zip = new JSZip();
    zip.file('context.md', buildContextMarkdown(input));
    zip.file('transcricao.md', buildTranscriptMarkdown(input));
    zip.file('perfil.json', JSON.stringify({
      orgName: member.orgName,
      neighborhood: member.neighborhood,
      phase: state?.phase ?? null,
      unlockedPhases: member.unlockedPhases ?? null,
      sections: state?.sections ?? null,
      maturityScores: state?.maturityScores ?? null,
      totalMaturityScore: state?.totalMaturityScore ?? null,
      gaps: state?.gaps ?? null,
    }, null, 2));
    const files = zip.folder('arquivos')!;
    const used = new Set<string>();
    for (const d of docs) {
      // Two uploads can share a filename ("foto.jpg"); a zip entry collision
      // would silently drop one.
      let name = d.filename || 'arquivo';
      if (used.has(name)) {
        const dot = name.lastIndexOf('.');
        const stem = dot > 0 ? name.slice(0, dot) : name;
        const ext = dot > 0 ? name.slice(dot) : '';
        let n = 2;
        while (used.has(`${stem}-${n}${ext}`)) n++;
        name = `${stem}-${n}${ext}`;
      }
      used.add(name);
      if (d.bytes) files.file(name, d.bytes);
      else if (d.fullText) files.file(`${name}.txt`, d.fullText);
    }

    const buf = await zip.generateAsync({ type: 'nodebuffer' });
    const safe = (member.orgName || 'org').normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-|-$/g, '').toLowerCase() || 'org';
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${safe}-contexto.zip"`);
    res.send(buf);
  }));

  // Invite a CBO — slugs are human-readable, derived from the org name.
  // "Horta Comunitária Cascata" → /cbo-profile?cbo=horta-comunitaria-cascata
  app.post('/api/cohort/:coordinatorSlug/invite', wrap(async (req, res) => {
    const cohort = await findCohortByCoordinatorSlug(req.params.coordinatorSlug);
    if (!cohort) { res.status(404).json({ error: 'cohort not found' }); return; }

    // orgType (EF-5): 'community' (default) or 'implementer'. The hardcoded
    // 'community' was exactly wrong for the August implementer cohort — the
    // agent's tier/type calibration starts from the org row, so the invite is
    // where the coordinator declares it.
    const { orgName, neighborhood, role, origin, orgType } = req.body ?? {};
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
      // Reuse an existing same-name org in this cohort (e.g. a previously
      // removed member being re-invited): its identity, documents, and any
      // profile the platform accumulated come back, instead of minting a
      // duplicate organizations row (name has no unique constraint).
      const [existingOrg] = await db.select().from(organizations)
        .where(and(eq(organizations.name, String(orgName)), eq(organizations.cohortId, cohort.id)))
        .limit(1);
      if (existingOrg) {
        orgId = existingOrg.id;
        // The invite is where the coordinator declares the type (EF-5) — an
        // explicit implementer re-invite upgrades a reused community/unknown row.
        if (orgType === 'implementer' && existingOrg.type !== 'implementer') {
          await db.update(organizations).set({ type: 'implementer' }).where(eq(organizations.id, existingOrg.id));
        }
      } else {
        const org = await createOrganization({ name: orgName, city: 'porto-alegre', type: orgType === 'implementer' ? 'implementer' : 'community', cohortId: cohort.id });
        orgId = org.id;
      }
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

    // `openedAt` is NOT client-writable here. This route exists to edit the
    // cadence — names, dates, which phase a workshop unlocks. It used to accept
    // the whole array verbatim, so any edit from a page whose `cohort` object
    // predated an opening silently cleared `openedAt` for every workshop — and
    // unlike close-workshop it re-locked nobody, leaving the rail showing
    // "closed" while every org still had access. Opening and closing go through
    // their own endpoints, which move the flag and the members together.
    const existingByPhase = new Map(
      ((cohort.settings as CohortSettings | null)?.workshops ?? [])
        .map(w => [Number(w.unlocksPhase), w.openedAt ?? null]),
    );
    const workshops: WorkshopConfig[] = incoming.map((w: any) => {
      const unlocksPhase = Number(w.unlocksPhase) || 1;
      return {
        name: String(w.name ?? ''),
        date: w.date ? String(w.date) : null,
        unlocksPhase,
        openedAt: existingByPhase.get(unlocksPhase) ?? null,
      };
    });
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

  // Rename the cohort. Only the display name changes — id, coordinatorSlug,
  // coordinator scoping, and member invite tokens are untouched, so live
  // invites keep working across a rename.
  app.patch('/api/cohort/:coordinatorSlug/name', wrap(async (req, res) => {
    const cohort = await findCohortByCoordinatorSlug(req.params.coordinatorSlug);
    if (!cohort) { res.status(404).json({ error: 'cohort not found' }); return; }

    const name = String(req.body?.name ?? '').trim();
    if (!name) { res.status(400).json({ error: 'name required' }); return; }
    await db.update(cohorts).set({ name }).where(eq(cohorts.id, cohort.id));
    res.json({ ok: true, name });
  }));

  // Unlock a phase — for one member, multiple members, or 'all'
  app.patch('/api/cohort/:coordinatorSlug/unlock', wrap(async (req, res) => {
    const cohort = await findCohortByCoordinatorSlug(req.params.coordinatorSlug);
    if (!cohort) { res.status(404).json({ error: 'cohort not found' }); return; }

    const { memberIds, phase } = req.body ?? {};
    const phaseNum = Number(phase);
    if (!phaseNum || phaseNum < 1 || phaseNum > 7) { res.status(400).json({ error: 'invalid phase' }); return; }

    const members = await attachOrgTiers(await attachDerivedSections(await attachDocCounts(await db.select().from(cohortMembers).where(eq(cohortMembers.cohortId, cohort.id)))));
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

  // Open a workshop — the exact mirror of close-workshop below, and the reason
  // this endpoint exists at all (JVP, 2026-08-03: "I restarted server for the
  // staging version and the W2 was closed, when I had opened it before").
  //
  // "Open for cohort" used to be TWO client-driven writes to two different
  // tables — PATCH /unlock (cohort_members.unlockedPhases, which actually gates
  // the org) then PATCH /workshops (cohorts.settings.workshops[].openedAt,
  // which the cadence rail displays). Three ways that drifts:
  //
  //   1. Neither call checked `r.ok`, and the success toast fired regardless.
  //      A failed or interrupted second write left the phase unlocked with the
  //      rail showing the workshop as never opened — silently.
  //   2. They are sequential and non-atomic. Navigate away between them and you
  //      get the same split.
  //   3. PATCH /workshops overwrites the whole array from the CLIENT's copy, so
  //      any later edit from a stale page nulls `openedAt` — and unlike this
  //      route's mirror below it re-locks nobody, leaving the rail saying
  //      "closed" while every org still has access.
  //
  // One request, one transaction, server-side merge. The client no longer
  // decides what `openedAt` was.
  app.patch('/api/cohort/:coordinatorSlug/open-workshop', wrap(async (req, res) => {
    const cohort = await findCohortByCoordinatorSlug(req.params.coordinatorSlug);
    if (!cohort) { res.status(404).json({ error: 'cohort not found' }); return; }

    const phaseNum = Number(req.body?.phase);
    if (!phaseNum || phaseNum < 1 || phaseNum > 7) { res.status(400).json({ error: 'invalid phase (1-7)' }); return; }
    // The date is the coordinator's local "today" — the server may be in
    // another timezone, and the cadence rail is a record of when the workshop
    // was actually held. Validated, never trusted raw into settings.
    const openedAt = /^\d{4}-\d{2}-\d{2}$/.test(String(req.body?.openedAt ?? ''))
      ? String(req.body.openedAt)
      : new Date().toISOString().slice(0, 10);

    const settings: CohortSettings = (cohort.settings as CohortSettings | null) ?? ({} as CohortSettings);
    const workshops: WorkshopConfig[] = (settings.workshops ?? []).map(w =>
      // Merge, don't replace: only this workshop's openedAt changes, and only
      // if it wasn't already stamped (re-opening keeps the original date).
      Number(w.unlocksPhase) === phaseNum && !w.openedAt ? { ...w, openedAt } : w);

    const members = await db.select().from(cohortMembers).where(eq(cohortMembers.cohortId, cohort.id));
    let unlocked = 0;

    await db.transaction(async tx => {
      await tx.update(cohorts).set({ settings: { ...settings, workshops } }).where(eq(cohorts.id, cohort.id));
      for (const m of members) {
        const current = Array.isArray(m.unlockedPhases) ? (m.unlockedPhases as number[]) : [1];
        if (current.includes(phaseNum)) continue;
        const next = [...current, phaseNum].sort((a, b) => a - b);
        await tx.update(cohortMembers).set({ unlockedPhases: next }).where(eq(cohortMembers.id, m.id));
        unlocked++;
      }
    });

    console.log(`[cohort] opened workshop phase ${phaseNum} for cohort ${cohort.id}: unlocked=${unlocked}/${members.length}`);
    res.json({ ok: true, phase: phaseNum, openedAt, unlocked, members: members.length });
  }));

  // Close a workshop — the reverse of "Open for cohort" (field ask 2026-07-16:
  // Rede SCbN POA opened W2 by mistake). Three things happen together:
  //   1. the workshop's `openedAt` is cleared in the cohort settings (the
  //      cadence rail shows it as next-up/locked again),
  //   2. the phase leaves every member's unlockedPhases (1 always stays —
  //      it's open-on-invite by design, which is also why phase 1 can't close),
  //   3. sessions already SITTING in the closed phase roll back to the highest
  //      phase still unlocked — gating only clamps entry, so without this an
  //      org that tapped the banner would keep running the closed encontro.
  // Everything the org typed stays: fields persist, and the E2 checkpoints
  // re-derive their position from saved fields, so reopening later resumes
  // exactly where they left off.
  app.patch('/api/cohort/:coordinatorSlug/close-workshop', wrap(async (req, res) => {
    const cohort = await findCohortByCoordinatorSlug(req.params.coordinatorSlug);
    if (!cohort) { res.status(404).json({ error: 'cohort not found' }); return; }

    const phaseNum = Number(req.body?.phase);
    if (!phaseNum || phaseNum < 2 || phaseNum > 7) { res.status(400).json({ error: 'invalid phase (2-7)' }); return; }

    const settings: CohortSettings = (cohort.settings as CohortSettings | null) ?? ({} as CohortSettings);
    const workshops: WorkshopConfig[] = (settings.workshops ?? []).map(w =>
      Number(w.unlocksPhase) === phaseNum ? { ...w, openedAt: null } : w);
    await db.update(cohorts).set({ settings: { ...settings, workshops } }).where(eq(cohorts.id, cohort.id));

    const members = await db.select().from(cohortMembers).where(eq(cohortMembers.cohortId, cohort.id));
    let relocked = 0;
    let rolledBack = 0;
    for (const m of members) {
      const current = Array.isArray(m.unlockedPhases) ? (m.unlockedPhases as number[]) : [1];
      if (!current.includes(phaseNum)) continue;
      const next = current.filter(p => p !== phaseNum);
      if (!next.includes(1)) next.push(1);
      next.sort((a, b) => a - b);
      const maxAllowed = Math.max(...next);
      await db.update(cohortMembers).set({
        unlockedPhases: next,
        // The roster snapshot mirrors the live phase — clamp it too, or the
        // dashboard keeps showing the closed workshop as in progress.
        snapshotPhase: Math.min(Number(m.snapshotPhase ?? 1) || 1, maxAllowed),
      }).where(eq(cohortMembers.id, m.id));
      relocked++;

      if (m.cboStateId) {
        try {
          const state = getCboState(m.cboStateId) ?? (await loadCboFromDb(m.cboStateId))?.state;
          if (state && state.phase === phaseNum) {
            state.phase = maxAllowed;
            setCboState(m.cboStateId, state);
            debouncedPersist(m.cboStateId);
            rolledBack++;
          }
        } catch (e: any) {
          console.error(`[cohort] close-workshop rollback failed for ${m.cboStateId}:`, e?.message || e);
        }
      }
    }
    console.log(`[cohort] closed workshop phase ${phaseNum} for cohort ${cohort.id}: relocked=${relocked} rolledBack=${rolledBack}`);
    res.json({ ok: true, relocked, rolledBack });
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
  // Coordinator override of the org's maturity tier (EF-5). The agent
  // persists its read at E1 close; a persisted-wrong tier is stickier than
  // per-turn inference, so the console MUST be able to correct it. Guarded by
  // the :coordinatorSlug app.param ownership check like every cohort route.
  app.patch('/api/cohort/:coordinatorSlug/member/:memberId/tier', wrap(async (req, res) => {
    const member = await memberInCohort(req);
    if (!member) { res.status(404).json({ error: 'member not found' }); return; }
    const tier = req.body?.tier;
    if (!['emerging', 'developing', 'advanced'].includes(tier)) {
      res.status(400).json({ error: "tier must be 'emerging' | 'developing' | 'advanced'" });
      return;
    }
    if (!member.cboStateId) { res.status(409).json({ error: 'member has no linked session yet' }); return; }
    const orgName = await setMaturityTierForCboState(member.cboStateId, tier);
    if (!orgName) { res.status(409).json({ error: 'member has no linked organization yet' }); return; }
    res.json({ ok: true, tier, orgName });
  }));

  /**
   * ⚠️ THE PROD CHECK. `npm run cohort:doctor` reads whatever database the shell
   * is pointed at — on Replit, the workspace one, never the Deployment's. So the
   * one environment whose answer matters is the one the script cannot reach.
   *
   * Same verdicts, same shared function, behind the coordinator login: open it
   * in the browser and you are reading the database that is actually serving
   * organisations.
   *
   * It also backfills `_e2_closed` on any record that finished before that
   * marker existed, so a close inferred from older markers is recorded once
   * rather than re-derived forever.
   */
  app.get('/api/cohort/:coordinatorSlug/doctor', wrap(async (req, res) => {
    const cohort = (req as any).cohort as typeof cohorts.$inferSelect;
    const settings = cohort.settings as CohortSettings | null;
    const members = await db.select().from(cohortMembers).where(eq(cohortMembers.cohortId, cohort.id));
    const stateIds = members.map(m => m.cboStateId).filter((v): v is string => !!v);
    const rows = stateIds.length
      ? await db.select({ id: cboStates.id, phase: cboStates.phase, sections: cboStates.sections })
          .from(cboStates).where(inArray(cboStates.id, stateIds))
      : [];
    const byId = new Map(rows.map(r => [r.id, r]));

    let backfilled = 0;
    const orgs = [];
    for (const m of members) {
      const row = m.cboStateId ? byId.get(m.cboStateId) : undefined;
      const state = row ? { phase: row.phase ?? 0, sections: (row.sections ?? {}) as CboState['sections'], maturityScores: [] } : null;
      const health = orgHealth(state as any, m.unlockedPhases, settings);

      // Record the close once, where it was only inferable before.
      if (state && health.closed && state.phase === 2) {
        const site: any = (state.sections as any).intervention_site ?? { fields: {} };
        if (String(site.fields?._e2_closed?.value ?? '') !== 'yes') {
          site.fields = { ...(site.fields ?? {}), _e2_closed: { value: 'yes', confidence: 'high', source: 'derived', userEdited: false } };
          await db.update(cboStates)
            .set({ sections: { ...(state.sections as any), intervention_site: site } as any })
            .where(eq(cboStates.id, row!.id))
            .then(() => { backfilled++; })
            .catch(e => console.error('[doctor] backfill failed:', e?.message || e));
        }
      }

      orgs.push({
        id: m.id, orgName: m.orgName, memberSlug: m.memberSlug,
        excludeFromPortfolio: !!m.excludeFromPortfolio, ...health,
      });
    }
    orgs.sort((a, b) => VERDICT_ORDER.indexOf(a.verdict) - VERDICT_ORDER.indexOf(b.verdict));
    const waiting = orgs.filter(o => o.verdict === 'ready-waiting');
    if (backfilled) console.log(`[doctor] ${cohort.id}: recorded _e2_closed on ${backfilled} record(s) that finished before the marker existed`);
    res.json({
      cohort: { id: cohort.id, name: cohort.name },
      openPhases: openPhasesFrom(settings).sort((a, b) => a - b),
      total: orgs.length,
      waiting: waiting.length,
      backfilled,
      orgs,
    });
  }));

  /**
   * Keep a member out of the portfolio analysis — or put it back.
   *
   * ⚠️ The column and the filter shipped without this. Nothing could set the
   * flag, so Vila Flores's own test organisation appeared in the synergy report
   * as a real member of the network: a grouping built partly on an org that
   * does not exist, presented to the room that would be validating it.
   *
   * Deliberately narrow. It hides the member from ANALYSIS and never from the
   * roster — a coordinator who loses sight of their own test org on the board
   * is worse off, not better.
   */
  app.patch('/api/cohort/:coordinatorSlug/member/:memberId/portfolio', wrap(async (req, res) => {
    const member = await memberInCohort(req);
    if (!member) { res.status(404).json({ error: 'member not found' }); return; }
    const exclude = req.body?.exclude;
    if (typeof exclude !== 'boolean') { res.status(400).json({ error: 'exclude must be a boolean' }); return; }
    await db.update(cohortMembers)
      .set({ excludeFromPortfolio: exclude })
      .where(eq(cohortMembers.id, member.id));
    res.json({ ok: true, excludeFromPortfolio: exclude, orgName: member.orgName });
  }));

  // Reset ONE organization's profile (field report 2026-07-08: the console
  // could only wipe the whole cohort at once). Deletes the member's working
  // session (state + transcript, DB and memory) and clears every run-derived
  // member/org column — path, site, inspiration picks, snapshots, maturity
  // tier — so the org's next visit starts a genuinely clean E1. Identity
  // (orgName, neighborhood, invite tokens), coordinator-controlled unlocks,
  // support-request history, and uploaded org documents are deliberately
  // kept. Guarded by the :coordinatorSlug app.param ownership check like
  // every cohort route.
  app.post('/api/cohort/:coordinatorSlug/member/:memberId/reset', wrap(async (req, res) => {
    const member = await memberInCohort(req);
    if (!member) { res.status(404).json({ error: 'member not found' }); return; }

    if (member.cboStateId) {
      await deleteCboState(member.cboStateId);
      setCboState(member.cboStateId, undefined as any);
    }
    if (member.orgId) {
      await db.update(organizations).set({ maturityTier: null }).where(eq(organizations.id, member.orgId));
    }
    await db.update(cohortMembers).set({
      cboStateId: null,
      path: null,
      site: null,
      inspirationPicks: [],
      startedAt: null,
      snapshotPhase: null,
      snapshotSectionsComplete: null,
      snapshotMaturityScore: null,
      snapshotFlagsMet: null,
      snapshotIntervention: null,
      snapshotUpdatedAt: new Date(),
    }).where(eq(cohortMembers.id, member.id));

    res.json({ ok: true, memberId: member.id, orgName: member.orgName });
  }));

  // Remove ONE member from the cohort entirely — the invite link dies and the
  // org disappears from the roster. Deletes the member row and its working
  // session (state + transcript). The organization row and its uploaded
  // documents are deliberately KEPT: re-inviting the same org name relinks to
  // them (the invite endpoint reuses an existing same-name org in the cohort
  // instead of minting a duplicate). Guarded by the :coordinatorSlug app.param
  // ownership check like every cohort route.
  app.delete('/api/cohort/:coordinatorSlug/member/:memberId', wrap(async (req, res) => {
    const member = await memberInCohort(req);
    if (!member) { res.status(404).json({ error: 'member not found' }); return; }

    if (member.cboStateId) {
      await deleteCboState(member.cboStateId);
      setCboState(member.cboStateId, undefined as any);
    }
    // The tier was calibrated from the run being deleted — a future re-invite
    // must not inherit it (same rationale as per-member reset).
    if (member.orgId) {
      await db.update(organizations).set({ maturityTier: null }).where(eq(organizations.id, member.orgId));
    }
    await db.delete(cohortMembers).where(eq(cohortMembers.id, member.id));
    res.json({ ok: true, memberId: member.id, orgName: member.orgName });
  }));

  app.get('/api/cohort/:coordinatorSlug/support-requests', wrap(async (req, res) => {
    const cohort = await findCohortByCoordinatorSlug(req.params.coordinatorSlug);
    if (!cohort) { res.status(404).json({ error: 'cohort not found' }); return; }
    const filter = String(req.query.status ?? 'all');
    const members = await attachOrgTiers(await attachDerivedSections(await attachDocCounts(await db.select().from(cohortMembers).where(eq(cohortMembers.cohortId, cohort.id)))));
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

    const members = await attachOrgTiers(await attachDerivedSections(await attachDocCounts(await db.select().from(cohortMembers).where(eq(cohortMembers.cohortId, cohort.id)))));
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

  // CBO commits its chosen intervention site (E2). Stores the STRUCTURED site —
  // GeoJSON geometry + coordinates + name — instead of letting the drawn shape
  // dissolve into a chat string. Preserves any already-attached photos.
  app.put('/api/cbo-member/:memberSlug/site', wrap(async (req, res) => {
    const member = await findMemberBySlug(req.params.memberSlug);
    if (!member) { res.status(404).json({ error: 'member not found' }); return; }

    const b = req.body ?? {};
    const coords = Array.isArray(b.coordinates) && b.coordinates.length === 2
      ? [Number(b.coordinates[0]), Number(b.coordinates[1])] as [number, number]
      : null;
    if (!b.name || !coords || coords.some((n: number) => !Number.isFinite(n))) {
      res.status(400).json({ error: 'name and [lat,lng] coordinates required' });
      return;
    }
    const prev = (member.site as MemberSite | null) ?? null;
    const site: MemberSite = {
      name: String(b.name),
      kind: b.kind === 'osm' || b.kind === 'zone' ? b.kind : 'custom',
      coordinates: coords,
      geometry: b.geometry && (b.geometry.type === 'Point' || b.geometry.type === 'Polygon')
        ? { type: b.geometry.type, coordinates: b.geometry.coordinates } : null,
      source: typeof b.source === 'string' ? b.source : null,
      areaM2: typeof b.areaM2 === 'number' ? b.areaM2 : null,
      neighborhood: typeof b.neighborhood === 'string' ? b.neighborhood : (member.neighborhood ?? null),
      deferred: b.deferred === true ? true : undefined,
      photos: prev?.photos ?? [], // keep photos attached before the site was (re)saved
      savedAt: new Date().toISOString(),
    };
    await db.update(cohortMembers).set({ site }).where(eq(cohortMembers.id, member.id));
    res.json({ site });
  }));

  // Link an uploaded photo to the chosen site (E2). Appends a file path to
  // member.site.photos so site photos are associated, not just dumped in the
  // flat per-CBO upload list. No-op (409) until a site exists.
  app.post('/api/cbo-member/:memberSlug/site/photo', wrap(async (req, res) => {
    const member = await findMemberBySlug(req.params.memberSlug);
    if (!member) { res.status(404).json({ error: 'member not found' }); return; }
    const path = req.body?.path;
    if (!path || typeof path !== 'string') { res.status(400).json({ error: 'path required' }); return; }
    const site = (member.site as MemberSite | null);
    if (!site) { res.status(409).json({ error: 'no site selected yet' }); return; }
    if (site.photos.includes(path)) { res.json({ site }); return; } // idempotent
    const next: MemberSite = { ...site, photos: [...site.photos, path].slice(-20) };
    await db.update(cohortMembers).set({ site: next }).where(eq(cohortMembers.id, member.id));
    res.json({ site: next });
  }));
}

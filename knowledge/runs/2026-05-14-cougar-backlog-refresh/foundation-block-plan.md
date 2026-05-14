# Plan: Orchestrator Foundation Block (O-14 + O-1 + O-2 + O-4)

Target: ship by 2026-05-20, ahead of Julia (Vila Flores) refinement session.

## Summary

Replace the hardcoded `DEMO_PROJECTS` array with a server-backed cohort that the coordinator can grow (invite CBOs by share-link) and gate (per-CBO + bulk phase unlocks). Workshop cadence is a UI strip driven by a cohort settings blob; the data layer holds only `unlockedPhases: number[]` per CBO. Sample mode keeps working for the May 25 stakeholder demos.

## Decisions

- **Persistence**: Neon/Postgres via Drizzle. New `cohort` + `cohort_member` tables. Slug-as-secret auth (no login).
- **Workshop model**: phase locks at data layer; workshops live in a `cohort.settings.workshops` JSON blob. Schema doesn't change when workshop dates shift.
- **Granularity**: phase-level locks (5 phases). Matches `phase` field already on `CBO_SECTIONS`.
- **CBO profile state**: stays agent-driven for now. CBO page **pushes a snapshot** (phase, sectionsComplete, maturityScore, flagsMet) to the server on each agent event so the orchestrator can read summaries. Profile content itself doesn't move to DB in this block.
- **Sample mode**: when no coordinator slug is present, `useCohort()` returns the existing `DEMO_PROJECTS` in the same shape. No code paths diverge in the page.

## Data model

```ts
// server/schema.ts (additions)

cohort {
  id              uuid PK
  coordinatorSlug text unique (long random)
  name            text
  createdAt       timestamp
  settings        jsonb        // { workshops: [{name, date, unlocksPhase}], ... }
}

cohortMember {
  id              uuid PK
  cohortId        uuid FK → cohort
  memberSlug      text unique  (long random; goes in CBO share link)
  orgName         text
  neighborhood    text
  role            enum('priority','alternate')   // O-5 lives here later
  origin          enum('cohort','external')      // O-6 lives here later
  unlockedPhases  jsonb        // number[] — defaults to [1]
  invitedAt       timestamp
  startedAt       timestamp nullable
  // inlined snapshot (cheap to update; orchestrator reads):
  snapshotPhase            int     nullable
  snapshotSectionsComplete int     nullable
  snapshotMaturityScore    int     nullable
  snapshotFlagsMet         int     nullable
  snapshotIntervention     text    nullable
  snapshotUpdatedAt        timestamp nullable
}
```

No FK to a `user` table — slug-secret only. When Phase-3 auth lands, `coordinatorSlug` is replaced with a real session.

## Endpoints

```
POST   /api/cohort                                  → create cohort, return coordinatorSlug
GET    /api/cohort/:coordinatorSlug                 → cohort + members + snapshots
POST   /api/cohort/:coordinatorSlug/invite          → {orgName, neighborhood, role?} → memberSlug
PATCH  /api/cohort/:coordinatorSlug/workshops       → {workshops: [...]} → settings update
PATCH  /api/cohort/:coordinatorSlug/unlock          → {memberIds: string[]|'all', phase: number}
GET    /api/cbo/:memberSlug                         → { unlockedPhases, identity }
PATCH  /api/cbo/:memberSlug/snapshot                → CBO pushes profile summary
```

6 endpoints. All slug-checked; no other auth.

## Implementation steps

1. [ ] **Schema + migration** — `server/schema.ts`, `npm run db:push`. ~30 min.
2. [ ] **Endpoints** — `server/routes/cohortRoutes.ts` + register in `server/routes.ts`. ~3 h. Slug generation uses `nanoid(24)`. Zod validation on bodies.
3. [ ] **`useCohort()` hook** — `client/src/core/hooks/useCohort.ts`. Reads coordinator slug from localStorage (`oef.cohortSlug`); sample-mode shim returns `DEMO_PROJECTS` shape. React-Query for caching + invalidation. ~1.5 h.
4. [ ] **Orchestrator page rewire** — `orchestrator-landing.tsx`:
   - First-load CTA: "Create cohort" (POST) or "Load existing" (paste slug). After creation, slug stored in localStorage.
   - Replace `DEMO_PROJECTS` source with `useCohort()`.
   - Add "Invite a CBO" button → dialog → POST invite → show share link + "Copy invitation message" (WhatsApp-formatted template).
   - Per-card "Unlock next phase" button → PATCH unlock with single memberId.
   - Workshop cadence strip at the top: renders from `cohort.settings.workshops`; each workshop has its date (editable) and a "Unlock Phase X for cohort" bulk button → PATCH unlock with `memberIds: 'all'`.
   - Sample-mode path: page renders identical UI with seed data; invite/unlock actions show "Sample mode — sign up to enable."
   ~4 h.
5. [ ] **CBO profile gating** — `cbo-profile.tsx`:
   - On mount: if `?cbo=<slug>` in URL, fetch `/api/cbo/:slug` → store `unlockedPhases` in state.
   - Phase-strip (line 471): locked phases render with a lock icon + tooltip ("Your coordinator will unlock this after Workshop 2"). Click is a no-op.
   - `[SKIP TO phase:X]` send: client-side guard refuses if `X` not in `unlockedPhases`.
   - On `phase_change` / `maturity_update`: also `PATCH /api/cbo/:slug/snapshot` with the relevant fields.
   ~2 h.
6. [ ] **Agent-side guard (server)** — `server/services/cboAgent.ts`: when handling a `[SKIP TO phase:X]`, look up the member's `unlockedPhases`; if not unlocked, respond with a polite refusal instead of advancing. Belt-and-suspenders for the client-side check. ~30 min.
7. [ ] **i18n** — add EN/PT keys for: invite dialog, share message template, lock tooltips, workshop strip labels, sample-mode banner. ~30 min.
8. [ ] **Seed a default cohort for sample mode** — `client/src/core/contexts/sample-data-context.tsx` or new `sample-cohort.ts`. Use today's `DEMO_PROJECTS` content, just re-shaped. ~30 min.

**Total estimated effort**: ~12 h focused work. Comfortably fits May 14 → 20.

## Files touched

- New: `server/routes/cohortRoutes.ts`, `client/src/core/hooks/useCohort.ts`, `client/src/core/contexts/sample-cohort.ts`
- Modified: `server/schema.ts`, `server/routes.ts`, `server/services/cboAgent.ts`, `client/src/core/pages/orchestrator-landing.tsx`, `client/src/core/pages/cbo-profile.tsx`, `client/src/core/locales/{en,pt}.json`

## Risks & mitigations

- **Risk**: slug leaks to wrong CBO via shared-screen / WhatsApp forwarding.
  **Mitigation**: pilot scale (10 CBOs, all known to Julia). For Phase 3, real auth.
- **Risk**: server-side `[SKIP TO phase]` enforcement requires touching the agent; might be brittle.
  **Mitigation**: client-side guard is enough for pilot; flag agent-side as P1 follow-up.
- **Risk**: snapshots get out of sync if a CBO clears localStorage mid-flow.
  **Mitigation**: on next agent message, snapshot re-pushes current state; eventual consistency.
- **Risk**: sample mode rots because we forget to update the seed when shapes change.
  **Mitigation**: TypeScript: seed and `useCohort` return the same type. Compiler catches drift.
- **Risk**: coordinator loses their slug if browser localStorage is cleared.
  **Mitigation**: "Copy my coordinator link" button surfaced prominently after cohort creation. JVP records it in the VF Notion page on Julia's behalf.

## Success criteria

- [ ] Coordinator creates a cohort from `/orchestrator` and invites 10 named CBOs via share-link
- [ ] Each CBO opens their link, sees their identity, lands on Phase 1; Phases 2–5 visibly locked with explanation
- [ ] Coordinator clicks "Unlock Phase 2 for cohort" → on a CBO's next agent message, Phase 2 unlocks
- [ ] Orchestrator shows each CBO's current phase, sections complete, maturity score, last-updated time — driven by snapshots, not hardcoded
- [ ] Per-CBO "Unlock next phase" override works for stragglers
- [ ] `/orchestrator` with no slug still renders the DEMO_PROJECTS-equivalent sample view for stakeholder demos
- [ ] Julia can run through the full cohort lifecycle in the May 20 refinement session

## Out of scope for this block (parked)

- Status pill (O-3), external-origin chip (O-6), alternates UX (O-5), territory report action (O-7) — next block.
- Map intelligence (O-8 / O-9 / O-10 / O-11) — separate block.
- Sector tabs (O-12) and public toggle (O-13) — later in the quarter.
- Replacing the agent's in-memory profile state with DB-backed state — not needed for the foundation; only the *summary* moves to DB.
- Multi-coordinator support — single coordinator (Julia) for the pilot.

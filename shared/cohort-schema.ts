// Cohort schema — orchestrator-managed groups of CBOs (Vila Flores pilot).
// Slug-as-secret auth: coordinator has one slug, each invited CBO has another.
// Workshop cadence lives in `cohort.settings` JSON; data layer holds only
// `unlockedPhases` per member. See knowledge/runs/2026-05-14-cougar-backlog-refresh/
// foundation-block-plan.md for the full design.

import { sql } from 'drizzle-orm';
import { pgTable, text, varchar, jsonb, timestamp, integer, boolean } from 'drizzle-orm/pg-core';

export type WorkshopConfig = {
  name: string;       // "Workshop 1"
  date: string | null;     // ISO date — the *scheduled* workshop date (editable by coordinator)
  unlocksPhase: number;    // which CBO phase this workshop unlocks (1..5)
  openedAt?: string | null; // ISO date — set the moment the coordinator clicks "Open for cohort".
                           // Source of truth for state (held vs not). null until opened.
  // Curriculum context — surfaced in the orchestrator workshop rail so the
  // coordinator knows at a glance what each workshop covers and what to
  // expect from CBOs afterward. Optional so legacy cohorts without these
  // fields still render; new cohorts seed them from DEFAULT_WORKSHOPS.
  description?: string;     // 2-sentence summary of what the workshop covers
  expectedOutput?: string;  // What we expect from the CBO after they complete it
};

export type CohortSettings = {
  workshops: WorkshopConfig[];
  // Coordinator-forced UI language for every org in this cohort. When set, it
  // OVERRIDES the org's browser language detection (so a PT phone in an EN
  // cohort still gets EN, and vice-versa). Undefined = fall back to detection.
  language?: 'pt' | 'en';
};

// RequestSupport — async escalation queue. CBO submits via chat-header button;
// coordinator resolves from orchestrator dashboard. See
// knowledge/runs/2026-05-15-encontros-curriculum/_paths/two-path-triage.md
export const SUPPORT_REQUEST_TYPES = [
  'coordinator-chat',  // Conversa com a coordenadora
  'oef-technical',     // Pergunta técnica pra equipe OEF
  'cbo-connection',    // Conexão com outro CBO que já fez algo parecido
  'finance-partners',  // Algo sobre finanças / parceiros
] as const;
export type SupportRequestType = typeof SUPPORT_REQUEST_TYPES[number];

export type SupportRequest = {
  id: string;
  type: SupportRequestType;
  message: string | null;
  createdAt: string;          // ISO timestamp
  resolvedAt: string | null;  // null while pending
  resolvedNote: string | null;
};

// The CBO's chosen intervention site (E2 / Workshop 2). Persisted as STRUCTURED
// data — previously the map selection was flattened into a chat string and the
// drawn geometry was lost. `geometry` is the GeoJSON point/polygon; `photos`
// are file paths of site photos the CBO uploaded (linked here, not just dumped
// in the flat upload list).
export type MemberSite = {
  name: string;
  kind: 'osm' | 'custom' | 'zone';           // how it was chosen
  coordinates: [number, number];             // [lat, lng] centroid
  geometry: { type: 'Point' | 'Polygon'; coordinates: any } | null;
  source?: string | null;                    // e.g. 'osm_parks', 'user-added'
  areaM2?: number | null;                    // for drawn polygons
  neighborhood?: string | null;
  // E2 "usar o bairro todo": the org committed a neighborhood but no specific
  // site yet. When true, kind is 'zone' and coordinates are the bairro centroid;
  // site-specific UI should treat the exact site as TBD.
  deferred?: boolean;
  photos: string[];                          // uploaded site-photo file paths
  savedAt: string;                           // ISO timestamp
};

export const cohorts = pgTable('cohorts', {
  id: varchar('id').primaryKey().default(sql`gen_random_uuid()`),
  coordinatorSlug: text('coordinator_slug').notNull().unique(),
  name: text('name').notNull(),
  settings: jsonb('settings').$type<CohortSettings>().default({ workshops: [] }),
  createdAt: timestamp('created_at').defaultNow(),
});

export const cohortMembers = pgTable('cohort_members', {
  id: varchar('id').primaryKey().default(sql`gen_random_uuid()`),
  cohortId: varchar('cohort_id').notNull(),
  // FK to organizations.id (see shared/org-schema.ts). Nullable during the
  // Phase-1 migration; set at invite time for new members, backfilled for old.
  orgId: varchar('org_id'),
  memberSlug: text('member_slug').notNull().unique(),
  // Opaque, unguessable capability token (the invite link credential — see
  // docs/cbo-platform-architecture.md Phase 3). Replaces the org-name-derived,
  // guessable memberSlug as the shared-URL secret. Nullable during the Phase-3a
  // migration (backfilled), then becomes the only resolution path once slug
  // access is retired (Phase 3b).
  capabilityToken: text('capability_token').unique(),
  // CBO state ID — links to the file-backed CBO profile (`knowledge/runs/cbo-<id>/`)
  cboStateId: text('cbo_state_id'),
  orgName: text('org_name').notNull(),
  neighborhood: text('neighborhood'),
  role: text('role').$type<'priority' | 'alternate'>().default('priority'),
  // ⚠️ NEW COLUMN — needs `npm run db:push`.
  //
  // Keep this member out of the portfolio synergy analysis. Vila Flores has a
  // test organisation on the platform for their own walkthroughs, and it would
  // otherwise appear in the report as a real member of the network — inventing
  // a synergy with an organisation that does not exist (JVP/Ricardo, 31 Aug:
  // "filtramos la de Vilaflores entonces, para que no aparezca ahí").
  //
  // Deliberately narrower than a general "demo" flag: it hides the member from
  // ANALYSIS, never from the roster. A coordinator must still see the test org
  // on their own board, or they lose track of it.
  excludeFromPortfolio: boolean('exclude_from_portfolio').default(false),
  origin: text('origin').$type<'cohort' | 'external'>().default('cohort'),
  // Project-readiness triage captured at E1. Three self-reported buckets that
  // double as a maturity signal:
  //   'has-project' = a selected, scoped project (site + scope) — implementer /
  //                   advanced-tier read; treated downstream like 'has-idea'.
  //   'has-idea'    = a project direction in mind, not yet locked.
  //   'needs-help'  = no project yet; wants help discovering one.
  // Downstream (E2) collapses to two flows: has-project + has-idea are
  // project-forward; needs-help goes to discovery. Null until E1 asks.
  path: text('path').$type<'has-project' | 'has-idea' | 'needs-help'>(),
  // Cross-cutting RequestSupport queue. CBO submits via the chat-header button;
  // coordinator resolves from the orchestrator dashboard. JSONB so we don't need
  // a separate table for what is effectively a small per-member queue.
  supportRequests: jsonb('support_requests').$type<SupportRequest[]>().default([]),
  // E2 favorites: ShowcaseCard IDs the CBO saved during the educational anchor
  // (needs-help path). E3's InterventionSelector pre-filters by typeRefs of
  // these picks. Empty array for has-idea CBOs who skipped saving.
  inspirationPicks: jsonb('inspiration_picks').$type<string[]>().default([]),
  unlockedPhases: jsonb('unlocked_phases').$type<number[]>().default([1]),
  invitedAt: timestamp('invited_at').defaultNow(),
  startedAt: timestamp('started_at'),
  // Inlined snapshot — orchestrator reads from these; CBO page pushes updates.
  snapshotPhase: integer('snapshot_phase'),
  snapshotSectionsComplete: integer('snapshot_sections_complete'),
  snapshotMaturityScore: integer('snapshot_maturity_score'),
  snapshotFlagsMet: integer('snapshot_flags_met'),
  snapshotIntervention: text('snapshot_intervention'),
  snapshotUpdatedAt: timestamp('snapshot_updated_at'),

  // The chosen intervention site (E2). Structured GeoJSON + photos, so the
  // geometry the CBO drew/picked survives instead of being lost to a chat string.
  site: jsonb('site').$type<MemberSite | null>(),
});

export type Cohort = typeof cohorts.$inferSelect;
export type CohortMember = typeof cohortMembers.$inferSelect;

// Default workshops seed — Vila Flores 6-meeting convening series.
// W6 is the wrap-up; doesn't unlock new content (unlocksPhase = 5 = no-op).
export const DEFAULT_WORKSHOPS: WorkshopConfig[] = [
  {
    name: 'Workshop 1 — Who We Are',
    date: null,
    unlocksPhase: 1,
    description: 'The CBO introduces itself: mission, team, structure, prior projects, and the community groups it serves. The agent captures the core organizational identity and scores delivery capacity + technical experience.',
    expectedOutput: 'A complete organizational profile (10 fields) with two maturity scores recorded. The CBO also declares their path — they have a selected NBS project, an idea in mind, or want help discovering one.',
  },
  {
    name: 'Workshop 2 — Where We Work',
    date: null,
    unlocksPhase: 2,
    description: 'Path-aware site selection. The CBO sees Brazilian NBS examples, opens an interactive map of their neighborhood, picks the specific site they want to act on, ranks climate hazards, and describes land tenure and community anchoring.',
    expectedOutput: 'A located project site (coordinates or polygon) with a primary/secondary hazard ranking, land tenure category, and a community engagement breakdown. Two more maturity scores: Site Control + Community Anchoring.',
  },
  {
    name: 'Workshop 3 — What We Build',
    date: null,
    unlocksPhase: 3,
    description: 'The CBO selects an NBS intervention type (urban forest, rain garden, bioswale, green corridor, etc.) from a visual selector calibrated to their hazards, then specifies scale, construction model, expected impact, and operations.',
    expectedOutput: 'A chosen NBS type with sizing, a construction model, an expected-impact narrative, and an operations + sustainability plan. Four maturity scores: Problem Clarity, Solution Clarity, Climate NBS Impact, Financial Thinking.',
  },
  {
    name: 'Workshop 4 — What We Need',
    date: null,
    unlocksPhase: 4,
    description: 'The CBO maps out gaps — technical support, regulatory status, training, financial gap, equipment, and partnerships. The agent connects them to real funding sources appropriate for community-scale NBS in Porto Alegre.',
    expectedOutput: 'A specific needs list (technical / regulatory / financial / partnership), an estimated financial gap, and a regulatory awareness score. CBO is matched to relevant Tier-1 funders (Teia, Fundo Casa RS, Periferias Verdes, GEF SGP).',
  },
  {
    name: 'Workshop 5 — Results & Evidence',
    date: null,
    unlocksPhase: 5,
    description: 'The CBO uploads documents, photos, and links that back up what they\'ve described. The agent consolidates everything into the final maturity scorecard and surfaces the priority flags.',
    expectedOutput: 'A complete maturity scorecard (9 metrics + 6 priority flags) and an evidence package (documents, photos, partnership letters, baseline data). The CBO profile is ready for review.',
  },
  {
    name: 'Workshop 6 — Wrap-up & Review',
    date: null,
    unlocksPhase: 5,
    description: 'Final review of the project profile with the coordinator. The CBO edits anything before export and receives the project concept note that can be shared with funders and partners.',
    expectedOutput: 'An exported project concept note (PDF or markdown) ready to share. A clear next-step plan: which funders to approach, which permissions to seek, which technical partners to bring in.',
  },
];


// ============================================================================
// SYNERGY REPORTS — persisted, because a coordinator must find it again
// ============================================================================
// The pass reads every organisation's record and costs a model call, so it is
// not something to re-run because a page reloaded. It is also the input to an
// in-person meeting: the coordination opens it on the day, and Replit recycles
// its process whenever it feels like it.
//
// So the report is a row, not a response. The last completed one opens
// instantly; a new run is an explicit act with a visible status.
export const synergyReports = pgTable('synergy_reports', {
  id: varchar('id').primaryKey().default(sql`gen_random_uuid()`),
  cohortId: varchar('cohort_id').notNull(),
  /** 'running' while the pass is in flight — the UI polls this. */
  status: text('status').$type<'running' | 'done' | 'failed'>().notNull().default('running'),
  /** The whole SynergyReport, once it lands. */
  payload: jsonb('payload'),
  /** Why it failed, in words a coordinator can act on. */
  error: text('error'),
  /** Who pressed the button. */
  requestedBy: varchar('requested_by'),
  startedAt: timestamp('started_at').defaultNow(),
  finishedAt: timestamp('finished_at'),
});

export type SynergyReportRow = typeof synergyReports.$inferSelect;

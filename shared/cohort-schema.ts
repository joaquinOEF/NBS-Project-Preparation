// Cohort schema — orchestrator-managed groups of CBOs (Vila Flores pilot).
// Slug-as-secret auth: coordinator has one slug, each invited CBO has another.
// Workshop cadence lives in `cohort.settings` JSON; data layer holds only
// `unlockedPhases` per member. See knowledge/runs/2026-05-14-cougar-backlog-refresh/
// foundation-block-plan.md for the full design.

import { sql } from 'drizzle-orm';
import { pgTable, text, varchar, jsonb, timestamp, integer } from 'drizzle-orm/pg-core';

export type WorkshopConfig = {
  name: string;       // "Workshop 1"
  date: string | null;     // ISO date — the *scheduled* workshop date (editable by coordinator)
  unlocksPhase: number;    // which CBO phase this workshop unlocks (1..5)
  openedAt?: string | null; // ISO date — set the moment the coordinator clicks "Open for cohort".
                           // Source of truth for state (held vs not). null until opened.
};

export type CohortSettings = {
  workshops: WorkshopConfig[];
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
  memberSlug: text('member_slug').notNull().unique(),
  // CBO state ID — links to the file-backed CBO profile (`knowledge/runs/cbo-<id>/`)
  cboStateId: text('cbo_state_id'),
  orgName: text('org_name').notNull(),
  neighborhood: text('neighborhood'),
  role: text('role').$type<'priority' | 'alternate'>().default('priority'),
  origin: text('origin').$type<'cohort' | 'external'>().default('cohort'),
  // Two-path triage captured at E1: 'has-idea' = CBO has a specific project in
  // mind; 'needs-help' = CBO wants help discovering one. Null until E1 asks.
  // See knowledge/runs/2026-05-15-encontros-curriculum/_paths/two-path-triage.md
  path: text('path').$type<'has-idea' | 'needs-help'>(),
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
});

export type Cohort = typeof cohorts.$inferSelect;
export type CohortMember = typeof cohortMembers.$inferSelect;

// Default workshops seed — Vila Flores 6-meeting convening series.
// W6 is the wrap-up; doesn't unlock new content (unlocksPhase = 5 = no-op).
export const DEFAULT_WORKSHOPS: WorkshopConfig[] = [
  { name: 'Workshop 1 — Who We Are', date: null, unlocksPhase: 1 },
  { name: 'Workshop 2 — Where We Work', date: null, unlocksPhase: 2 },
  { name: 'Workshop 3 — What We Build', date: null, unlocksPhase: 3 },
  { name: 'Workshop 4 — What We Need', date: null, unlocksPhase: 4 },
  { name: 'Workshop 5 — Results & Evidence', date: null, unlocksPhase: 5 },
  { name: 'Workshop 6 — Wrap-up & Review', date: null, unlocksPhase: 5 },
];

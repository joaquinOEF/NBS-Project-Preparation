// Organization — the platform spine (see docs/cbo-platform-architecture.md).
//
// Today an "org" is just a free-text `orgName` duplicated across cbo_states and
// cohort_members, joined by a cboStateId the browser sets — there's no real
// entity to own a profile, a cohort membership, uploaded documents, or (later)
// the accounts that can access it. This table is that entity. Everything hangs
// off `organizations.id`.
//
// Phase 1 (this file) introduces the table and nullable `org_id` FKs on the
// existing tables, backfilled one org per existing cbo_state/cohort_member pair
// (scripts/backfill-organizations.ts). Nothing reads org_id for gating yet —
// it's pure spine. Later phases scope documents + access control by it.

import { sql } from 'drizzle-orm';
import { pgTable, text, varchar, timestamp } from 'drizzle-orm/pg-core';

// community  = community-based org (Vila Flores Stream A).
// implementer = NbS-capable org that may not be community-based (Stream B —
//   e.g. a landscape studio); community-anchored through the project, not legal form.
// unknown    = not yet classified (e.g. a backfilled row we couldn't infer).
export type OrgType = 'community' | 'implementer' | 'unknown';
export type MaturityTier = 'emerging' | 'developing' | 'advanced';

export const organizations = pgTable('organizations', {
  id: varchar('id').primaryKey().default(sql`gen_random_uuid()`),
  name: text('name').notNull(),
  city: text('city').default('porto-alegre'),
  type: text('type').$type<OrgType>().default('unknown'),
  // Nullable: an NbS-first implementer may be sourced outside any cohort.
  cohortId: varchar('cohort_id'),
  // Coordinator-overridable maturity tier (the adaptive-intake signal). Written
  // by the coordinator dashboard / a future agent tool; null until set.
  maturityTier: text('maturity_tier').$type<MaturityTier>(),
  createdAt: timestamp('created_at').defaultNow(),
});

export type Organization = typeof organizations.$inferSelect;
export type NewOrganization = typeof organizations.$inferInsert;

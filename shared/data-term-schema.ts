// ============================================================================
// DATA TERM ACCEPTANCES — the record Section 10 of the term promises
// ============================================================================
//
// ⚠️ NEW TABLE — needs `npm run db:push` before deploy.
//
// One row per "Aceitar" click. Rows are never updated or deleted: an
// organisation's current status is its latest row for the current version
// (shared/data-term.ts), and the history is the export's "all" option.
//
// The org name is copied at acceptance time — the record must say who
// accepted even if the member is later renamed or leaves the network.

import { sql } from 'drizzle-orm';
import { boolean, index, pgTable, text, timestamp, varchar } from 'drizzle-orm/pg-core';

export const dataTermAcceptances = pgTable('data_term_acceptances', {
  id: varchar('id').primaryKey().default(sql`gen_random_uuid()`),
  memberId: varchar('member_id').notNull(),
  cohortId: varchar('cohort_id').notNull(),
  orgId: varchar('org_id'),
  orgName: text('org_name').notNull(),
  /** As typed: "Seu nome completo". */
  name: text('name').notNull(),
  /** As typed: "Sua função na organização". */
  role: text('role').notNull(),
  termVersion: text('term_version').notNull(),
  /** SHA-256 of dataTermPlainText() for that version — which words were shown. */
  textHash: text('text_hash').notNull(),
  acceptedAt: timestamp('accepted_at').defaultNow().notNull(),
  ip: text('ip'),
  userAgent: text('user_agent'),
  /** A coordinator was signed in on that browser when it was accepted. The
   *  gate is the same for everyone (23 Oct decision), so the record says so
   *  instead of blocking — the export shows it. */
  coordinatorSession: boolean('coordinator_session').default(false).notNull(),
}, (table) => ({
  byMember: index('data_term_acceptances_by_member').on(table.memberId),
  byCohort: index('data_term_acceptances_by_cohort').on(table.cohortId),
}));

export type DataTermAcceptance = typeof dataTermAcceptances.$inferSelect;

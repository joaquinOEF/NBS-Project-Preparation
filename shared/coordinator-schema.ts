// Coordinator accounts — admin-provisioned email + password (see
// docs/cbo-platform-architecture.md Phase 3c). Coordinators are the people who
// manage cohorts (OEF / Pyxera / Vila Flores staff): a small, known set, so we
// create the accounts and hand out the password — no self-signup, no email
// sending. Distinct principal from the CityCatalyst OAuth `users` table.

import { sql } from 'drizzle-orm';
import { pgTable, text, varchar, timestamp } from 'drizzle-orm/pg-core';

export const coordinators = pgTable('coordinators', {
  id: varchar('id').primaryKey().default(sql`gen_random_uuid()`),
  email: text('email').notNull().unique(),
  // scrypt, stored as `salt:hash` hex. Never a plaintext password.
  passwordHash: text('password_hash').notNull(),
  name: text('name'),
  // Which cohort this coordinator manages. Null = all cohorts (e.g. an OEF
  // admin). For the single-cohort pilot this is the Vila Flores cohort id.
  cohortId: varchar('cohort_id'),
  createdAt: timestamp('created_at').defaultNow(),
});

// Opaque session tokens (httpOnly cookie). Separate from the OAuth `sessions`
// table so the two principal types don't entangle.
export const coordinatorSessions = pgTable('coordinator_sessions', {
  token: varchar('token').primaryKey(),
  coordinatorId: varchar('coordinator_id').notNull(),
  expiresAt: timestamp('expires_at').notNull(),
  createdAt: timestamp('created_at').defaultNow(),
});

export type Coordinator = typeof coordinators.$inferSelect;
export type CoordinatorSession = typeof coordinatorSessions.$inferSelect;

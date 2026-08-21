// ============================================================================
// FUNNEL EVENTS — where organizations actually stop
// ============================================================================
//
// W2 (Aug 2026) produced eleven product findings, and not one of them was
// visible until someone read seven transcripts by hand, six weeks late. The
// report generated from the same export surfaced none of them, because it was
// asked a different question. The specific things we could not see:
//
//   - the map failed for two of the three orgs that reached it
//   - two orgs abandoned at the same screen, six weeks apart
//   - four uploaded files were rejected and silently discarded
//
// None of these needed a hypothesis. They needed a count.
//
// Deliberately OUR table, not PostHog. posthog-js is client-only here, and
// these events are mostly server-side; adding posthog-node would mean a new
// dependency, new keys, and an external service between us and a question we
// can answer in SQL. This lives beside the data it describes, and the
// coordinator-facing "who is stuck" view reads the same rows.
//
// Deliberately NOT a parse-failure event either: documents.parseStatus already
// records that outcome per file, so counting it here would be a second source
// of the same truth.

import { sql } from 'drizzle-orm';
import { index, integer, pgTable, text, timestamp, varchar } from 'drizzle-orm/pg-core';

/** What kind of thing happened. Kept small on purpose — a taxonomy nobody can
 *  remember stops being used. */
export type CboEventName =
  /** A server checkpoint served a beat. `step` is the beat's own name. */
  | 'checkpoint'
  /** The client tried to render a map. `outcome` says whether it appeared. */
  | 'map_render';

export type CboEventOutcome = 'ok' | 'failed';

export const cboEvents = pgTable('cbo_events', {
  id: varchar('id').primaryKey().default(sql`gen_random_uuid()`),
  cboStateId: varchar('cbo_state_id').notNull(),
  orgId: varchar('org_id'),
  /** Which encontro the org was in. Drop-off is only readable per phase. */
  phase: integer('phase'),
  name: text('name').$type<CboEventName>().notNull(),
  /** The beat, e.g. 'ask-tenure', 'site-card', 'ask-photos'. For checkpoints
   *  this is the existing `finish(detail)` tag — no new vocabulary invented. */
  step: text('step'),
  outcome: text('outcome').$type<CboEventOutcome>(),
  /** Short free-text context. Never PII, never an org's own words. */
  detail: text('detail'),
  createdAt: timestamp('created_at').defaultNow(),
}, (table) => ({
  byState: index('cbo_events_by_state').on(table.cboStateId),
  byName: index('cbo_events_by_name').on(table.name),
}));

export type CboEventRow = typeof cboEvents.$inferSelect;

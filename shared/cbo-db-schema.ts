// DB tables for CBO state + chat messages.
//
// Previously stored as JSON files at knowledge/runs/cbo-<id>/{state,messages}.json
// which was bad for several reasons: PII in git history, no transactions, not
// queryable, hard to surface in the orchestrator dashboard, vulnerable to
// Replit container recycling.
//
// Design choice: hybrid columns + JSONB.
// - Top-level columns (phase, orgName, totalMaturityScore) are queryable so
//   the orchestrator can filter/aggregate without parsing JSON.
// - JSONB for sections / gaps / maturityScores / priorityFlags / editLog —
//   these are deeply nested + their shape evolves; JSONB absorbs schema
//   changes without migrations.
// - Messages live in a separate table so append is O(1) regardless of length;
//   chat history can grow into the hundreds of rows over the 6-encontro arc.

import { sql } from 'drizzle-orm';
import { pgTable, text, integer, jsonb, timestamp, varchar, index } from 'drizzle-orm/pg-core';
import type {
  CboSectionState,
  CboGapEntry,
  MaturityScore,
  PriorityFlag,
} from './cbo-schema';

export const cboStates = pgTable('cbo_states', {
  id: varchar('id').primaryKey().default(sql`gen_random_uuid()`),
  orgName: text('org_name').default(''),
  city: text('city').default(''),
  phase: integer('phase').default(0),
  totalMaturityScore: integer('total_maturity_score').default(0),
  sections: jsonb('sections').$type<Record<string, CboSectionState>>().default({}),
  gaps: jsonb('gaps').$type<CboGapEntry[]>().default([]),
  maturityScores: jsonb('maturity_scores').$type<MaturityScore[]>().default([]),
  priorityFlags: jsonb('priority_flags').$type<PriorityFlag[]>().default([]),
  editLog: jsonb('edit_log').$type<Array<{
    timestamp: string;
    sectionId: string;
    field: string;
    oldValue: any;
    newValue: any;
    source: 'agent' | 'user';
  }>>().default([]),
  uploadedFiles: jsonb('uploaded_files').$type<Array<{
    name: string;
    path: string;
    parsedAt: string;
    summary: string;
  }>>().default([]),
  metadata: jsonb('metadata').$type<{
    createdAt: string;
    updatedAt: string;
    sessionId?: string;
  }>().default({ createdAt: '', updatedAt: '' }),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

export const cboMessages = pgTable('cbo_messages', {
  id: varchar('id').primaryKey().default(sql`gen_random_uuid()`),
  cboStateId: varchar('cbo_state_id').notNull(),
  // Sequential position within the conversation. Used for deterministic
  // ordering when timestamps collide (debounced flushes can write multiple
  // messages with the same wall-clock time).
  position: integer('position').notNull(),
  role: text('role').notNull(), // 'user' | 'assistant'
  content: text('content').notNull(),
  messageType: text('message_type').notNull(), // 'content' | 'thinking' | 'tool_status'
  timestamp: timestamp('timestamp').defaultNow(),
}, (table) => ({
  byState: index('cbo_messages_by_state').on(table.cboStateId, table.position),
}));

export type CboStateRow = typeof cboStates.$inferSelect;
export type CboMessageRow = typeof cboMessages.$inferSelect;

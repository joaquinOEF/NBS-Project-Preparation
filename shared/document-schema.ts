// Per-org document store — the evidence locker (see docs/cbo-platform-architecture.md
// Layer 3). Promotes uploads from a side effect of a chat turn (truncated text
// buried in the chat log + a 280-char summary on cbo_states.uploadedFiles, with
// the original on ephemeral disk) into a durable, org-scoped record holding the
// FULL extracted text.
//
// Phase 2a (this table): Postgres full-text only — fullText is the whole
// extraction the #223 extractor already produces (doc parse / image vision /
// audio transcription). Durable blob originals (Replit Object Storage) are a
// later add-on; storageKey is reserved for it.

import { sql } from 'drizzle-orm';
import { pgTable, text, varchar, integer, timestamp, index } from 'drizzle-orm/pg-core';

// Mirrors fileExtract's ExtractKind.
export type DocumentKind = 'pdf' | 'pptx' | 'docx' | 'xlsx' | 'text' | 'image' | 'audio' | 'other';

/**
 * WHY a document was uploaded, as opposed to what format it is.
 *
 * `kind` is the file format and always will be — a Teia Sprint application is a
 * `pdf` like any other pdf. COUGAR convening 2026-08-06: orgs applied to the
 * Teia Sprint open call, which makes those applications semi-formalised project
 * proposals that W3 refines into scope, partnerships and funding. The
 * coordination team needs to FIND them among the site photos and permits, so
 * purpose is its own field rather than a naming convention on the filename.
 *
 * null = an ordinary upload, which is almost all of them.
 */
export type DocumentPurpose = 'teia_sprint';

export const documents = pgTable('documents', {
  id: varchar('id').primaryKey().default(sql`gen_random_uuid()`),
  // The owning org — the locker is org-scoped so it accumulates across every
  // session/encontro. Nullable only to survive a row whose org isn't linked yet.
  orgId: varchar('org_id'),
  // Which working profile this upload informed (provenance).
  cboStateId: varchar('cbo_state_id'),
  filename: text('filename').notNull(),
  mimeType: text('mime_type'),
  kind: text('kind').$type<DocumentKind>(),
  // ⚠️ NEW COLUMN — needs `npm run db:push` before this deploys, or every upload
  // 500s on an unknown column.
  purpose: text('purpose').$type<DocumentPurpose>(),
  sizeBytes: integer('size_bytes'),
  // The WHOLE extracted text — not the 8K chat-truncated copy. This is what
  // later sessions read back via read_org_document.
  fullText: text('full_text'),
  summary: text('summary'),
  // Whether extraction succeeded. Null on every pre-existing row, which reads
  // as 'parsed' — those rows only exist because extraction had succeeded.
  // 'failed' means the original is stored and readable but has no text yet:
  // retryable, and surfaced to the coordinator rather than silently dropped.
  // ⚠️ NEW COLUMNS — needs `npm run db:push` before deploy.
  parseStatus: text('parse_status').$type<'parsed' | 'failed'>(),
  parseError: text('parse_error'),
  // Provenance: which phase the upload arrived in, and who added it.
  droppedInPhase: integer('dropped_in_phase'),
  source: text('source').$type<'upload' | 'agent'>().default('upload'),
  // Reserved for Phase 2b (durable blob originals in object storage).
  storageKey: text('storage_key'),
  createdAt: timestamp('created_at').defaultNow(),
}, (table) => ({
  byOrg: index('documents_by_org').on(table.orgId),
}));

export type DocumentRow = typeof documents.$inferSelect;
export type NewDocument = typeof documents.$inferInsert;

// Lightweight, client-facing view of a document — what the evidence viewers
// (coordinator drawer + CBO bottom sheet) list. Deliberately omits `fullText`
// (fetched on demand) and `storageKey` (surfaced only as `hasOriginal`).
export type DocumentMeta = {
  id: string;
  filename: string;
  mimeType: string | null;
  kind: DocumentKind | null;
  purpose: DocumentPurpose | null;
  sizeBytes: number | null;
  droppedInPhase: number | null;
  summary: string | null;
  createdAt: string | null;
  /** Whether a durable original blob exists to preview/open (Phase 2b). */
  hasOriginal: boolean;
};

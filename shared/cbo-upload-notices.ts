// ============================================================================
// UPLOAD NOTICES — the messages the client posts on the org's behalf after a file
// ============================================================================
// When someone attaches a file, the client posts a message into the conversation
// describing what happened to it. Those strings used to live inline in
// cbo-profile.tsx, and the agent had no way to recognise them.
//
// That mattered because of a rule the photo beat already documents for "Anexar
// mais" (server/services/cboAgent.ts):
//
//     "Left unhandled it would fall through to the model, whose turn replaces
//      the pending composer — so the 'Pronto, pode seguir' chip would vanish and
//      the org would be stranded mid-upload."
//
// Exactly that happened to the upload notices themselves. An unreadable photo
// produced a notice the beat did not know, the model answered instead, its turn
// replaced the pending question, and the org lost the only chip that advances
// the step. `_photos_done` was never set, so the read-back never came — three
// photos in, the conversation simply stopped moving.
//
// So the wording lives here once, and the classifier is derived from the same
// constants the builders use. A reworded notice cannot silently stop matching.
// ============================================================================

export type UploadNoticeKind = 'refused' | 'storedUnread' | 'transport' | 'parsed';

/**
 * Stable fragments used BOTH to build the notice and to recognise it. Keep each
 * one inside its builder's output — the round-trip test in
 * e2e/cbo-upload-notice-roundtrip.spec.ts fails if that stops being true.
 */
export const UPLOAD_NOTICE_SIGNATURE: Record<UploadNoticeKind, string> = {
  refused: 'and it was refused',
  storedUnread: 'It is saved and the coordination team can open it',
  transport: 'but it did not reach us',
  parsed: 'Parsed content:',
};

/**
 * ⚠️ WHERE THIS FILE SITS IN ITS SELECTION.
 *
 * The picker takes several files and posts one notice per file, each its own
 * chat turn. A beat that answers every turn with "Recebi ✓" + its "Pronto"
 * chip therefore offers "done" after the FIRST of seven files, while the other
 * six are still arriving — and stacks the same question once per file (JVP on
 * staging, 2026-09-21: "it is confusing because it might think it's already
 * done"; the composer read "Pergunta 1 de 2"). The notice now says "3 of 7",
 * so a beat can acknowledge the early ones quietly and ask once, at the end.
 */
export interface UploadBatch { index: number; total: number }
const BATCH_RE = /\[UPLOAD_BATCH (\d+)\/(\d+)\]\s*$/;
const withBatch = (text: string, b?: UploadBatch): string =>
  b && b.total > 1 ? `${text}\n\n[UPLOAD_BATCH ${b.index}/${b.total}]` : text;

export const uploadNotice = {
  /** Rejected before it was ever read — too large, or a type we do not take. */
  refused: (filename: string, reason?: string, fix?: string, batch?: UploadBatch): string =>
    withBatch(`I tried to upload "${filename}" ${UPLOAD_NOTICE_SIGNATURE.refused}. ${reason ?? ''} ${fix ?? ''} `
      .replace(/\s+/g, ' ')
      .trim() + ' Tell them this plainly and stay on the current question.', batch),

  /** Stored, retrievable by the coordination team, but not machine-readable. */
  storedUnread: (filename: string, batch?: UploadBatch): string =>
    withBatch(`I uploaded "${filename}". ${UPLOAD_NOTICE_SIGNATURE.storedUnread}, but the text could not be read ` +
    `automatically, so nothing was filled in from it. Acknowledge that it arrived and is on file, ` +
    `do NOT ask them to send it again, and stay on the current question.`, batch),

  /** Nothing reached the server at all. */
  transport: (filename: string, batch?: UploadBatch): string =>
    withBatch(`Uploaded "${filename}" ${UPLOAD_NOTICE_SIGNATURE.transport}. Ask them to try again.`, batch),

  /** The happy path: text came back and the model should extract from it. */
  parsed: (filename: string, content: string, batch?: UploadBatch): string =>
    withBatch(`I'm uploading: "${filename}".\n\n${UPLOAD_NOTICE_SIGNATURE.parsed}\n${content}\n\n` +
    `Please extract info, auto-fill sections, and score maturity.`, batch),
};

/** "3 of 7", when the notice came from a multi-file selection. */
export function uploadBatchOf(text: string): UploadBatch | null {
  const m = BATCH_RE.exec(text ?? '');
  if (!m) return null;
  const index = Number(m[1]), total = Number(m[2]);
  return index >= 1 && total >= index ? { index, total } : null;
}

/** More files from the same selection are still on their way. */
export const moreUploadsComing = (text: string): boolean => {
  const b = uploadBatchOf(text);
  return !!b && b.index < b.total;
};

/** The file a notice is about — every builder quotes it first. */
export function uploadedFilename(text: string): string | null {
  return /"([^"\n]{1,200})"/.exec((text ?? '').slice(0, 400))?.[1] ?? null;
}

/**
 * Any upload notice at all — read, unread, refused or lost. A beat that only
 * recognises the happy path hands the other three to the model, whose turn
 * replaces the beat's pending chip and strands the organisation.
 */
export function isUploadNotice(text: string): boolean {
  const t = text ?? '';
  return t.startsWith("I'm uploading:") || t.startsWith('Uploaded "') || classifyUploadNotice(t) !== null;
}

/**
 * Which notice this is, or null if the text is an ordinary message.
 *
 * `parsed` is checked first: a successfully-read file can contain any text at
 * all, including another notice's wording, and its own signature appears before
 * the document body.
 */
export function classifyUploadNotice(text: string): UploadNoticeKind | null {
  if (!text) return null;
  if (text.includes(UPLOAD_NOTICE_SIGNATURE.parsed)) return 'parsed';
  for (const kind of ['storedUnread', 'refused', 'transport'] as const) {
    if (text.includes(UPLOAD_NOTICE_SIGNATURE[kind])) return kind;
  }
  return null;
}

/**
 * True when the notice means "no text came out of this file".
 *
 * These are the ones the photo beat must answer itself. `parsed` is excluded on
 * purpose — that one still goes to the model, which has a document to read.
 */
export function isUnreadableUploadNotice(text: string): boolean {
  const kind = classifyUploadNotice(text);
  return kind === 'storedUnread' || kind === 'refused' || kind === 'transport';
}

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

export const uploadNotice = {
  /** Rejected before it was ever read — too large, or a type we do not take. */
  refused: (filename: string, reason?: string, fix?: string): string =>
    `I tried to upload "${filename}" ${UPLOAD_NOTICE_SIGNATURE.refused}. ${reason ?? ''} ${fix ?? ''} `
      .replace(/\s+/g, ' ')
      .trim() + ' Tell them this plainly and stay on the current question.',

  /** Stored, retrievable by the coordination team, but not machine-readable. */
  storedUnread: (filename: string): string =>
    `I uploaded "${filename}". ${UPLOAD_NOTICE_SIGNATURE.storedUnread}, but the text could not be read ` +
    `automatically, so nothing was filled in from it. Acknowledge that it arrived and is on file, ` +
    `do NOT ask them to send it again, and stay on the current question.`,

  /** Nothing reached the server at all. */
  transport: (filename: string): string =>
    `Uploaded "${filename}" ${UPLOAD_NOTICE_SIGNATURE.transport}. Ask them to try again.`,

  /** The happy path: text came back and the model should extract from it. */
  parsed: (filename: string, content: string): string =>
    `I'm uploading: "${filename}".\n\n${UPLOAD_NOTICE_SIGNATURE.parsed}\n${content}\n\n` +
    `Please extract info, auto-fill sections, and score maturity.`,
};

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

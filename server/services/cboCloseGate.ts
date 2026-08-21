// ============================================================================
// THE CLOSE GATE — one implementation, real tool and fake model
// ============================================================================
//
// Scoring maturity IS the closing signal for E1, so the gate refuses it while
// required questionnaire fields (or the set_path triage) are missing. That is
// what makes "edit an earlier answer near the end → the model jumps to the
// closing and skips the project-status question" structurally impossible
// (field report 2026-07).
//
// It lived only in the real tool. The fake model wrote the score
// unconditionally, so NO spec could trip the gate — the rule that stops an
// encontro closing half-filled had no test at all, and the wording hand-over
// added for the "Ainda não" branch had none either.
//
// Same lesson as askUserGuards: a rule that exists twice is a rule the suite
// cannot see. This is the second mirror found in fakeCboModel; the audit that
// found it is worth repeating for anything else that file re-implements.

import {
  QUESTIONNAIRES,
  missingRequiredForClose,
  askCopyFor,
  type FieldReader,
} from '@shared/cbo-questionnaire';

export interface CloseGateResult {
  /** Field names still missing. Empty means the encontro may close. */
  missing: string[];
  /** The refusal to hand the model, already carrying the exact wording for any
   *  field the manifest owns. Null when nothing is missing. */
  message: string | null;
}

export function checkCloseGate(input: {
  phase: number;
  section: { fields: Record<string, { value: unknown } | undefined> } | undefined;
  /** null = standalone session, path not persistable, so not gated on. */
  hasPath: boolean | null;
  lang: 'pt' | 'en';
}): CloseGateResult {
  const manifest = QUESTIONNAIRES[input.phase];
  if (!manifest || !input.section) return { missing: [], message: null };

  const read: FieldReader = (field: string) => {
    const v = input.section!.fields[field]?.value;
    return v == null ? undefined : String(v);
  };

  const missing = missingRequiredForClose(manifest, read, input.hasPath);
  if (missing.length === 0) return { missing: [], message: null };

  // Hand back the WORDS, not just the field names. nbs_experience_detail is
  // asked as prose, so it never passes through ask_user — and prose is exactly
  // where the branch broke: an org that answered "Ainda não" was asked what
  // kind of NbS they had already worked with.
  const lines = missing.map(field => {
    const copy = askCopyFor(manifest, field, read, input.lang);
    return copy ? `${field} — ask it EXACTLY like this: "${copy}"` : field;
  });

  return {
    missing,
    message:
      `NOT scored — Encontro ${input.phase} can't close yet, these are still missing:\n` +
      lines.map(l => `- ${l}`).join('\n') +
      `\nAsk the user for each of them (chips for enum fields, prose for free-text), store the answers, and only then re-run the closing calls.`,
  };
}

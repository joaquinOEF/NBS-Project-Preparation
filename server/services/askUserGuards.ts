// ============================================================================
// ASK_USER GUARDS — one implementation, used by the real tool AND the fake model
// ============================================================================
//
// These rules used to exist TWICE: once in cboAgent's ask_user tool, and once
// hand-mirrored inside fakeCboModel so the deterministic suite would behave the
// same way. The mirror carried a comment saying it was a mirror, which is the
// honest version of a problem it could not solve: the e2e suite was exercising
// a COPY of the logic, so a guard added to the tool was invisible to every test
// until someone remembered to add it to the mirror too.
//
// That is not a hypothetical. It is why the W2 duplicate-batch bug (Misturaí
// answered the same five questions twice, three seconds apart) had a passing
// test suite either side of it.
//
// So the guards live here, and both callers run them. A rule added once is
// enforced in production and observed by the tests in the same commit.

import {
  enumFieldsMatchingOptions,
} from '@shared/cbo-field-catalog';
import {
  QUESTIONNAIRES,
  filterRuledOptions,
  askCopyForField,
  type FieldReader,
} from '@shared/cbo-questionnaire';

export interface AskOption {
  label: string;
  description?: string;
  recommended?: boolean;
  action?: string;
  [k: string]: unknown;
}

export interface AskQuestion {
  question: string;
  options?: AskOption[];
  multiSelect?: boolean;
  showMap?: boolean;
  showExamples?: boolean;
  allowReask?: boolean;
  relatedSections?: unknown;
  [k: string]: unknown;
}

export interface AskGuardContext {
  phase: number;
  lang: 'pt' | 'en';
  /** Reads the org_profile section the manifest rules are written against. */
  read: FieldReader;
}

export type PreparedAsk =
  | { kind: 'render'; question: string; options: AskOption[]; source: AskQuestion }
  /** A one-option "list" is a free-text question wearing a chip costume —
   *  delivered as plain prose instead. */
  | { kind: 'prose'; question: string; source: AskQuestion }
  | { kind: 'blocked'; note: string; source: AskQuestion };

export interface AskGuardResult {
  items: PreparedAsk[];
  filteredNotes: string[];
  copyNotes: string[];
}

export function prepareAskUser(questions: AskQuestion[], ctx: AskGuardContext): AskGuardResult {
  const items: PreparedAsk[] = [];
  const filteredNotes: string[] = [];
  const copyNotes: string[] = [];
  // Fields already queued in THIS call. The answered-field guard below cannot
  // see these, which is how two identical batches of UNANSWERED questions both
  // rendered (Misturaí, 12 Aug).
  const askedThisCall = new Set<string>();

  for (const q of questions ?? []) {
    if ((q.options?.length ?? 0) === 1) {
      items.push({ kind: 'prose', question: q.question, source: q });
      continue;
    }

    const chipLabels = (q.options ?? []).filter(o => !o.action).map(o => o.label);
    const targetFields = enumFieldsMatchingOptions(chipLabels);

    // Already answered → a re-ask.
    if (!q.allowReask && targetFields.length > 0) {
      const answered = targetFields
        .map(f => ({ field: f, value: ctx.read(f) }))
        .filter(x => (x.value ?? '').trim().length > 0);
      if (answered.length === targetFields.length) {
        items.push({
          kind: 'blocked',
          note: `"${q.question}" — ${answered.map(a => `${a.field} is already answered ("${a.value}")`).join(' and ')}`,
          source: q,
        });
        continue;
      }
    }

    // Already asked earlier in this same call → a duplicate.
    const repeat = targetFields.find(f => askedThisCall.has(f));
    if (repeat && !q.allowReask) {
      items.push({
        kind: 'blocked',
        note: `"${q.question}" — ${repeat} was already asked earlier in this same call`,
        source: q,
      });
      continue;
    }
    targetFields.forEach(f => askedThisCall.add(f));

    // E1 asks FACTS about the org — there is no answer to "recommend", and a
    // ⭐ on "Sim" reads as pressure to self-inflate.
    let options = (q.options ?? []).map(o =>
      ctx.phase <= 1 ? { ...o, recommended: undefined } : o,
    );

    // Manifest rule: drop options the stored dependency answer excludes — a
    // CNPJ-less org must never see "ONG" as a chip.
    for (const m of Object.values(QUESTIONNAIRES)) {
      const filtered = filterRuledOptions(m, options as any, ctx.read);
      if (filtered && filtered.droppedLabels.length > 0 && filtered.kept.length >= 2) {
        options = filtered.kept as AskOption[];
        filteredNotes.push(
          `dropped ${filtered.droppedLabels.length} ${filtered.field} option(s) inconsistent with the stored ${m.optionRules[filtered.field].dependsOn} answer: ${filtered.droppedLabels.join(' · ')}`,
        );
      }
    }

    // Canonical wording, where the manifest declares it. The model still
    // decides WHICH field to ask and when; it no longer decides the words,
    // because the words are where the branch bug lived.
    let question = q.question;
    if (targetFields.length === 1) {
      const canonical = askCopyForField(targetFields[0], ctx.read, ctx.lang);
      if (canonical && canonical !== question) {
        copyNotes.push(`${targetFields[0]} asked with its canonical wording`);
        question = canonical;
      }
    }

    items.push({ kind: 'render', question, options, source: q });
  }

  return { items, filteredNotes, copyNotes };
}

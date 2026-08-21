// ============================================================================
// COMMITTING WHAT THE ORG ALREADY CONFIRMED
// ============================================================================
//
// Doc-extracted free text is STAGED, not stored, until the org confirms it —
// a deliberate design (PR #397): nothing read off a website or PDF enters the
// profile until a human says it is right. That part works.
//
// What does not work is the commit. It happens only if the model remembers to
// call confirm_doc_fields after the org replies. In W2 it did not, and the
// cost was exact:
//
//   14:41  agent  Missão: Misturar distintos grupos da sociedade para promover
//                 desenvolvimento por meio de assistência social, cultura,
//                 educação e sustentabilidade …  Tá tudo certo?
//   14:43  org    ✅ Tá tudo certo
//   14:46  agent  …ainda faltam dois dados importantes — a missão da organização
//
// Adriana retyped it, and gave a different, shorter mission. perfil.json now
// carries the retyped one with source 'user'. The mission we had correctly
// extracted from her own website, and which she had explicitly confirmed, is
// gone.
//
// So the server commits it. The staging gate is untouched — this only fires on
// an affirmative reply to values that were staged on an EARLIER turn, which is
// exactly the condition confirm_doc_fields already enforces. The tool remains
// for partial commits and for anything this does not recognise.

import type { CboState } from '@shared/cbo-schema';

/** Affirmatives an org actually taps. Deliberately a closed list: this commits
 *  data, so an unrecognised reply must fall through to today's behaviour
 *  rather than be guessed at. Corrections ("quero ajustar") are not here, so
 *  they can never match. */
const AFFIRMATIVE = [
  'confere tudo', 'confere', 'ta tudo certo', 'tudo certo', 'esta tudo certo',
  'sim', 'isso mesmo', 'correto', 'confirmar', 'confirmo', 'pode seguir', 'certo',
  'thats right', 'that is right', 'all correct', 'looks right', 'yes', 'confirm', 'correct',
];

function normalize(s: string): string {
  return s
    .normalize('NFD').replace(/[̀-ͯ]/g, '')  // strip accents
    .replace(/[^a-z0-9\s]/gi, ' ')                      // strip ✅ and punctuation
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

/** True when this reply is a chip-sized affirmative and nothing else. Length is
 *  part of the test: prose that merely contains "sim" is not a confirmation. */
export function isAffirmativeReply(message: string): boolean {
  const n = normalize(message.split('\n[LANGUAGE:')[0]);
  if (!n || n.length > 40) return false;
  return AFFIRMATIVE.includes(n);
}

export interface CommitOutcome {
  committed: string[];
  heldBack: number;
}

/**
 * Commit staged doc-sourced values the org has just affirmed.
 *
 * Mirrors confirm_doc_fields' guard exactly: only values staged on an EARLIER
 * user turn are committable, so a recap and its confirmation can never be the
 * same turn. Returns what moved, so the caller can tell the model.
 */
export function commitConfirmedStagedFields(
  state: CboState,
  userContentTurns: number,
): CommitOutcome {
  const staged = Object.values(state.stagedDocFields ?? {});
  if (staged.length === 0) return { committed: [], heldBack: 0 };

  const committable = staged.filter(s => s.stagedAtUserTurns < userContentTurns);
  if (committable.length === 0) return { committed: [], heldBack: staged.length };

  const committed: string[] = [];
  for (const s of committable) {
    const sec = state.sections[s.sectionId as keyof typeof state.sections];
    if (!sec) continue;
    const oldValue = sec.fields[s.field]?.value ?? null;
    sec.fields[s.field] = { value: s.value, confidence: s.confidence, source: 'document', userEdited: false };
    sec.lastUpdatedBy = 'agent';
    if (!sec.sources.includes('document')) sec.sources.push('document');
    state.editLog.push({
      timestamp: new Date().toISOString(),
      sectionId: s.sectionId,
      field: s.field,
      oldValue,
      newValue: s.value,
      source: 'agent',
    });
    state.gaps = state.gaps.filter(g => !(g.sectionId === s.sectionId && g.field === s.field));
    delete state.stagedDocFields![`${s.sectionId}.${s.field}`];
    committed.push(s.field);
  }
  return { committed, heldBack: staged.length - committable.length };
}

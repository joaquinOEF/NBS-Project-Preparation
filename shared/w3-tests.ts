// ============================================================================
// W3 TESTS — the solutions an organisation tried, and what it made of each
// ============================================================================
// Encontro 3 used to ask "qual delas vocês querem levar adiante?" and scope the
// one answer to the end. The 10 September meeting (Vila Flores / PxG / OEF /
// BwB) turned that around, in Robson's words: "qual vocês querem testar
// primeiro?" — try several, see what each needs and does, and leave with a
// comparison the portfolio session can think from.
//
// This is the record of those tries. One JSON field, `solution_tests_json` in
// `intervention_type`, the same shape as the dig (shared/w3-dig.ts): a list the
// beats read live, because it is written mid-session.
//
// ⚠️ `chosen_solutions` is DERIVED from this. Every consumer downstream — the
// dossier, the roadmap, the concept note, the synergy pass, the coordinator's
// badge, the field-destiny probe — reads `chosen_solutions` as "the solutions
// this project is made of", and none of them should learn a second field. So a
// test the organisation marked "faz sentido pra gente" is a chosen solution,
// and one it set aside is not; `likedIds()` is what gets written back.
// ============================================================================

export type TestReaction = 'faz-sentido' | 'nao-e-pra-gente' | 'ainda-nao-sabemos';

export interface SolutionTest {
  solutionId: string;
  /** Null while the card is on screen and nothing has been tapped yet. */
  reaction: TestReaction | null;
  /** How many, for a solution counted rather than measured. Per test — two
   *  per-unit solutions do not share a count. */
  units?: number;
  /** The ficha's decisive-detail question, if this solution has one and it was asked. */
  detailQuestionId?: string;
  detailAnswer?: string;
  testedAt: string;
}

/**
 * The chip is spoken; the page is written. Same value, two registers — see
 * docs/document-register.md and REPORT_LABEL in shared/w3-roadmap.ts.
 */
export const REACTION: Record<TestReaction, { chipPt: string; chipEn: string; pt: string; en: string }> = {
  'faz-sentido': {
    chipPt: 'Faz sentido pra gente', chipEn: 'Makes sense for us',
    pt: 'Faz sentido para a organização', en: 'Makes sense for the organisation',
  },
  'nao-e-pra-gente': {
    chipPt: 'Não é pra gente', chipEn: 'Not for us',
    pt: 'Descartada pela organização', en: 'Set aside by the organisation',
  },
  'ainda-nao-sabemos': {
    chipPt: 'Ainda não sabemos', chipEn: "We don't know yet",
    pt: 'Ainda em aberto para a organização', en: 'Still open for the organisation',
  },
};

export function parseTests(json: string | undefined | null): SolutionTest[] {
  if (!json) return [];
  try {
    const v = JSON.parse(json);
    return Array.isArray(v) ? (v as SolutionTest[]).filter(t => t && typeof t.solutionId === 'string') : [];
  } catch {
    return [];
  }
}

export function serializeTests(tests: SolutionTest[]): string {
  return JSON.stringify(tests);
}

/** Add or update one test, keeping the order they were tried in. */
export function upsertTest(tests: SolutionTest[], patch: Partial<SolutionTest> & { solutionId: string }): SolutionTest[] {
  const i = tests.findIndex(t => t.solutionId === patch.solutionId);
  if (i === -1) {
    return [...tests, { reaction: null, testedAt: new Date().toISOString(), ...patch }];
  }
  const next = tests.slice();
  next[i] = { ...next[i], ...patch };
  return next;
}

export function testedIds(tests: SolutionTest[]): string[] {
  return tests.map(t => t.solutionId);
}

/** The ones that become `chosen_solutions`. */
export function likedIds(tests: SolutionTest[]): string[] {
  return tests.filter(t => t.reaction === 'faz-sentido').map(t => t.solutionId);
}

export function testOf(tests: SolutionTest[], solutionId: string): SolutionTest | undefined {
  return tests.find(t => t.solutionId === solutionId);
}

/**
 * Sessions from before the loop existed hold a `chosen_solutions` and no tests.
 * Seed the tests from it — they chose those, which is the strongest reaction
 * there is — so the comparison and every beat that reads tests see them.
 */
export function seedTestsFromChosen(tests: SolutionTest[], chosen: string[]): SolutionTest[] {
  if (tests.length || !chosen.length) return tests;
  const at = new Date().toISOString();
  return chosen.map(solutionId => ({ solutionId, reaction: 'faz-sentido' as const, testedAt: at }));
}

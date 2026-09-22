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
  /**
   * The size THIS solution was tested over, for one priced per m². Per test for
   * the same reason the count is: a green roof, a strip of earth and a whole
   * patio are different areas of one place. A staging run priced a roof over
   * the 2,900 m² footprint drawn for the site in Encontro 2 (R$ 435 mil–1 mi).
   * `0` = asked, and they could not say — never the site's area by default.
   */
  areaM2?: number;
  /** "Quem faria isso aí?" — a WhoId from shared/w3-criteria.ts. Theirs; it outranks our delivery class. */
  who?: string;
  /** "O que mais pega?" — a HardestId; `hardestNote` holds their own words when it is 'outro'. */
  hardest?: string;
  hardestNote?: string;
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

/**
 * THE SIZE A SOLUTION IS PRICED AT — one rule, for every surface that prices.
 *
 * The card read the test's own size; the dossier, the roadmap and the concept
 * note read the place's footprint and ONE `intervention_units` for the whole
 * project. So the coordinator's board, the hoja de ruta and the Resumo priced a
 * rain garden over the 2,900 m² drawn in Encontro 2 (R$ 1,16–2,03 mi) while the
 * card and the comparison priced it over the 836 m² tested (R$ 334–585 mil);
 * and 25 street trees came out as 2, because escola-verde's "2 pátios" was
 * tested first and filled the single field (staging records `c2a6ab61` and
 * Caldas Junior, 22 Sept). Every function did what it said; they said
 * different things.
 *
 * The rule is the card's:
 *   · a test for this solution → ITS size (`areaM2: 0` = asked and unknown,
 *     never the place's) and ITS count;
 *   · a test with no size field at all (sessions from before sizes were per
 *     test, when the footprint WAS the answer) → the place's footprint;
 *   · no test (a record from before the loop) → the place's footprint and the
 *     project-wide count, as those records were written.
 */
export function sizeOf(
  solutionId: string,
  input: { areaM2?: number; site?: Record<string, string | undefined>; w3?: Record<string, string | undefined> },
  test?: SolutionTest | null,
): { areaM2?: number; units?: number } {
  const place = input.areaM2 || Number(input.site?.site_area_m2) || undefined;
  const t = test ?? testOf(parseTests(input.w3?.solution_tests_json), solutionId);
  if (t) return { areaM2: t.areaM2 !== undefined ? (t.areaM2 || undefined) : place, units: t.units || undefined };
  return { areaM2: place, units: Number(input.w3?.intervention_units) || undefined };
}

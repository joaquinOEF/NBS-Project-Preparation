// ============================================================================
// WHICH SOLUTIONS DOES THIS RECORD HAVE — one reader for every era of record
// ============================================================================
// Real organisations will not walk Encontros 1–3 again, so whatever shape their
// record was written in is the shape the pre-note and the pre-portfolio must
// read. Three eras exist in production:
//
//   · `solution_tests_json` — the loop (a reaction per solution tried);
//   · `chosen_solutions`    — ids, from before the loop;
//   · `solution_types`      — NAMES, from the first Encontro 3 ("Jardins de
//     chuva, Biovaletas, Bacia de retenção, Cisterna de água da chuva"). Read
//     by nothing until 17 Oct 2026, so Conceito Arte — 20 documents and a
//     SINAPI budget — had "no solution" in Encontro 4, the concept note and
//     the pre-portfolio.
//
// Pure.
// ============================================================================

import { NBS_SOLUTIONS } from './nbs-catalog';
import { parseTests, seedTestsFromChosen, type SolutionTest } from './w3-tests';

const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();

/** Words people use for a solution that are not its catalogue name. */
const ALIASES: Array<[RegExp, string]> = [
  [/\bcisternas?\b/, 'captacao-agua-da-chuva'],
  [/\btelhados? verdes?\b/, 'teto-verde'],
  [/\bjardim de chuva\b/, 'jardins-de-chuva'],
  [/\bbiovaleta\b/, 'biovaletas'],
  [/\bhortas? comunitarias?\b/, 'hortas-urbanas'],
];

/**
 * Every catalogue solution named in a piece of text, in the order they
 * appear — "Jardins de chuva com biovaletas, na praça…" → both. Longest names
 * first, so "Parques lineares" is not read as "Parques".
 */
export function solutionsNamedIn(text: string | null | undefined): string[] {
  const t = ` ${norm(text ?? '')} `;
  if (!t.trim()) return [];
  const found: Array<{ id: string; at: number }> = [];
  const taken: Array<[number, number]> = [];
  const free = (a: number, b: number) => !taken.some(([x, y]) => a < y && b > x);
  const names = NBS_SOLUTIONS.flatMap(s => [{ id: s.id, name: norm(s.pt.label) }, { id: s.id, name: norm(s.en.label) }, { id: s.id, name: norm(s.id) }])
    .filter(n => n.name.length >= 4)
    .sort((a, b) => b.name.length - a.name.length);
  for (const { id, name } of names) {
    // The name itself, without the spaces around it — a neighbour's space
    // must not count as taken ("chuva biovaletas").
    const at = t.indexOf(` ${name} `) + 1;
    if (at > 0 && free(at, at + name.length) && !found.some(f => f.id === id)) {
      found.push({ id, at }); taken.push([at, at + name.length]);
    }
  }
  for (const [re, id] of ALIASES) {
    const m = re.exec(t);
    if (m && !found.some(f => f.id === id) && free(m.index, m.index + m[0].length)) found.push({ id, at: m.index });
  }
  return found.sort((a, b) => a.at - b.at).map(f => f.id);
}

/**
 * The tests a record carries, whatever era it is from. Older eras have no
 * reaction on record; they are read as the choice the organisation made then
 * ("faz-sentido"), exactly as `seedTestsFromChosen` already did for ids.
 */
export function testsOf(type: Record<string, string | null | undefined> | null | undefined): SolutionTest[] {
  const t = type ?? {};
  const tests = parseTests(t.solution_tests_json ?? undefined);
  if (tests.length) return tests;
  const chosen = String(t.chosen_solutions ?? '').split(',').map(s => s.trim()).filter(Boolean);
  if (chosen.length) return seedTestsFromChosen([], chosen);
  return seedTestsFromChosen([], solutionsNamedIn(t.solution_types));
}

/**
 * The solutions a record CHOSE, whatever era it is from: `chosen_solutions`
 * (derived from the reactions since the loop), else the ones that made sense
 * in the tests, else the names of the first era. The concept note, the prints
 * and the profile read this — reading `chosen_solutions` alone gave Conceito
 * Arte "skipped: no solution" on every one of them.
 */
export function recordedSolutionIds(type: Record<string, string | null | undefined> | null | undefined): string[] {
  const chosen = String(type?.chosen_solutions ?? '').split(',').map(s => s.trim()).filter(Boolean);
  if (chosen.length) return chosen;
  return testsOf(type).filter(t => t.reaction === 'faz-sentido').map(t => t.solutionId);
}

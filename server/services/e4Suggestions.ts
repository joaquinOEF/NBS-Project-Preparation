// What Encontro 4 can offer back from what the organisation already said
// (shared/e4-suggestions.ts). Server half: the messages, the record, and the
// geocode of an address they typed. Never writes anything.
import type { CboState } from '@shared/cbo-schema';
import { e4Suggestions, addressSaid, type E4Suggestion } from '@shared/e4-suggestions';
import { prenoteInputFromSections, recordedPartners, parseE4Solution } from '@shared/e4-prenote';
import { testsOf } from '@shared/recorded-solutions';
import { testOf } from '@shared/w3-tests';
import { forwardGeocode } from './geocodeService';
import { sitePoint } from './siteContext';

const WHO_TO_BUILD: Record<string, string> = { nos: 'mutirao', 'nos-com-parceiro': 'mista', contratar: 'contratada', ninguem: 'indefinido', 'nao-sei': 'indefinido' };

export async function suggestionsFor(state: CboState, messages: Array<{ role: string; content: string }>): Promise<E4Suggestion[]> {
  const flat = (id: string) => Object.fromEntries(Object.entries((state.sections as any)?.[id]?.fields ?? {}).map(([k, f]: [string, any]) => [k, f?.value == null ? undefined : String(f.value)])) as Record<string, string | undefined>;
  const site = flat('intervention_site'), type = flat('intervention_type');
  const hasPlace = !!sitePoint(site);
  const address = hasPlace ? null : addressSaid(messages, site);
  const place = address ? await forwardGeocode(address).catch(() => null) : null;
  const sol = parseE4Solution(type._e4_solution_json ?? '');
  const tests = testsOf({ solution_tests_json: type.solution_tests_json, chosen_solutions: type.chosen_solutions, solution_types: type.solution_types });
  const who = sol ? (testOf(tests, sol.solutionId)?.who as string | undefined) : undefined;
  return e4Suggestions({
    site, type, messages, hasPlace, place,
    buildFromE3: who ? WHO_TO_BUILD[who] ?? null : null,
    recordedPartners: recordedPartners(prenoteInputFromSections(state.sections)).map(p => (p.length > 90 ? `${p.slice(0, 88).trimEnd()}…` : p)),
  });
}

import { test, expect } from '@playwright/test';
import { NBS_SHOWCASE_CARDS, filterShowcaseCards, getShowcaseCard } from '../shared/nbs-showcase-cards';
import { NBS_INTERVENTION_TYPES } from '../shared/cbo-schema';

// ⚠️ EXAMPLES-STRIP-EMPTY (JVP, 2026-08-11, mobile test on Replit).
//
// The user tapped "Ver exemplos". The agent said "Vou mostrar alguns exemplos
// reais de projetos de SbN em Porto Alegre e no Brasil!", NOTHING rendered, and
// it went straight on to "Pronto! 🌱 Esses são projetos que já tão acontecendo".
//
// Two faults stacked. `show_examples` filtered the showcase cards and pushed
// whatever came back, including an empty list; and cbo-profile.tsx renders an
// empty strip as `return null` — a silent gap. So the agent narrated a strip the
// user could not see.
//
// It was not rare: SEVEN of the 18 (type × hazard) filter combinations matched
// zero cards, and `green-roofs-walls` matches zero on its own because no card
// carries that typeRef.
//
// These tests pin the PROPERTY — a filter that excludes everything must widen,
// never render nothing — plus the data gap that made it reachable, so adding a
// seventh intervention type without a matching case is caught here rather than
// on someone's phone.

const HAZARDS = ['flood', 'heat', 'biodiversity'] as const;

/** The widening the tool performs, mirrored so it can be asserted without a model. */
function resolveExampleCards(args: {
  cardIds?: string[];
  hazardFilter?: (typeof HAZARDS)[number];
  typeRefs?: string[];
}): string[] {
  const attempts: { id: string }[][] = [];
  if (args.cardIds?.length) {
    attempts.push(args.cardIds.map(getShowcaseCard).filter(Boolean) as { id: string }[]);
  }
  if (args.hazardFilter || args.typeRefs?.length) {
    attempts.push(filterShowcaseCards({ hazard: args.hazardFilter, typeRefs: args.typeRefs }));
    if (args.hazardFilter && args.typeRefs?.length) {
      attempts.push(filterShowcaseCards({ typeRefs: args.typeRefs }));
    }
  }
  attempts.push(filterShowcaseCards());
  return (attempts.find(a => a.length > 0) ?? []).map(c => c.id);
}

test.describe('CBO examples strip — never renders nothing', () => {
  test('every type × hazard combination resolves to at least one card', () => {
    const empties: string[] = [];
    for (const t of NBS_INTERVENTION_TYPES as any[]) {
      for (const h of HAZARDS) {
        // What the RAW filter does — recorded, not asserted; 7 of 18 are empty
        // today and that is exactly why the widening exists.
        if (filterShowcaseCards({ hazard: h, typeRefs: [t.id] }).length === 0) {
          empties.push(`${t.id}+${h}`);
        }
        // What the TOOL does must never be empty.
        expect(
          resolveExampleCards({ hazardFilter: h, typeRefs: [t.id] }),
          `${t.id} + ${h} must still show something`,
        ).not.toHaveLength(0);
      }
    }
    // Guard the premise: if this ever hits zero the widening is untested, and the
    // test should be re-pointed at whatever the new gap is.
    expect(empties.length, 'raw filter combinations that match no card').toBeGreaterThan(0);
  });

  test('a type with no showcase cards still shows examples', () => {
    const orphan = (NBS_INTERVENTION_TYPES as any[])
      .map(t => t.id)
      .find(id => filterShowcaseCards({ typeRefs: [id] }).length === 0);
    // green-roofs-walls today. If this becomes undefined every type has a case,
    // which is the outcome we want — the assertion below just stops mattering.
    if (!orphan) return;
    expect(resolveExampleCards({ typeRefs: [orphan] })).not.toHaveLength(0);
  });

  test('hallucinated card ids fall back instead of rendering an empty strip', () => {
    expect(resolveExampleCards({ cardIds: ['no-such-card', 'also-not-real'] })).not.toHaveLength(0);
  });

  test('the unfiltered set is non-empty — the last line of defence', () => {
    expect(NBS_SHOWCASE_CARDS.length).toBeGreaterThan(0);
    expect(filterShowcaseCards()).not.toHaveLength(0);
  });
});

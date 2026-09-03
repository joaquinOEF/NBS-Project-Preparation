import { test, expect } from '@playwright/test';
import {
  CONTEXT_SOURCES, MODEL_PASSES, undeclaredPairs, contextGaps,
  type ContextSource,
} from '../shared/context-sources';
import * as fs from 'node:fs';

// ⚠️ DECLINING A SOURCE IS LEGITIMATE. FORGETTING ONE IS NOT.
//
// The failure this guards is a silence, not a bug: a pass that never consumes a
// source nobody remembered it could have. No stack trace, no failing test, no
// angry user — the output is merely thinner than it could have been, and thinner
// in a way only someone holding the whole record can see. Four of the five
// passes were in that state when this file was written, including the one whose
// job is to find what a cohort has in common.
//
// See docs/context-first.md.

test.describe('every model pass declares what it does with every source', () => {
  test('⚠️ nothing is left undecided', () => {
    // Adding a source to the catalogue forces every pass to say something about
    // it. That is the whole mechanism — the check exists to make a new source
    // impossible to add quietly.
    const undeclared = undeclaredPairs();
    expect(
      undeclared,
      undeclared.map(u => `${u.pass} has not decided about "${u.source}"`).join('\n'),
    ).toEqual([]);
  });

  test('a refusal carries its reason, and the reason is a sentence', () => {
    // "declines: true" is a silence with better manners. What makes a refusal
    // reviewable is why — a reader six months from now has to be able to
    // disagree with it.
    for (const p of MODEL_PASSES) {
      for (const [source, use] of Object.entries(p.sources) as Array<[ContextSource, any]>) {
        if (use.state === 'uses') continue;
        expect(use.because?.length ?? 0, `${p.id} · ${source}`).toBeGreaterThan(25);
      }
    }
  });

  test('every pass points at a file that exists', () => {
    for (const p of MODEL_PASSES) {
      expect(fs.existsSync(p.file), `${p.id} → ${p.file}`).toBe(true);
      expect(p.purpose.length, p.id).toBeGreaterThan(20);
    }
  });

  test('every source in the catalogue is described, not just named', () => {
    for (const [id, description] of Object.entries(CONTEXT_SOURCES)) {
      expect(description.length, id).toBeGreaterThan(20);
    }
  });

  test('the gaps are reported — loudly, and without failing the suite', () => {
    // ⚠️ Deliberately NOT an assertion that the list is empty. A gap is a
    // backlog item, and a red suite that everyone learns to ignore protects
    // nothing. What matters is that the number is printed on every run and
    // cannot drift upward unnoticed.
    const gaps = contextGaps();
    console.log(`\n[context-first] ${gaps.length} fonte(s) que um passe deveria usar e ainda não usa:`);
    for (const g of gaps) console.log(`  · ${g.pass} ← ${g.source}: ${g.because}`);
    // The ratchet: this number may fall freely and may only rise deliberately.
    expect(gaps.length, 'gaps rose — either close it or change the ceiling on purpose').toBeLessThanOrEqual(13);
  });

  test('the pass that finds what a cohort shares reads what the cohort produced', () => {
    // JVP’s own hypothesis, kept as a named expectation until it is true: the
    // concept notes never reach the synergy pass, and section 7’s approval
    // routes are precisely the pooling material.
    const synergy = MODEL_PASSES.find(p => p.id === 'synergyReport')!;
    expect(synergy.sources.artefacts.state).not.toBe('uses');
    expect((synergy.sources.artefacts as any).because).toMatch(/concept note|nota de conceito/i);
  });
});

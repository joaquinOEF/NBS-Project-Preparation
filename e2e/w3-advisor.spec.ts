import { test, expect } from '@playwright/test';
import { verifyQuote, EMPTY_ADVICE, adviseW3 } from '../server/services/w3Advisor';
import { W3_QUESTIONS, eligibleQuestions, getW3Question } from '../shared/w3-questions';
import { mergeShortlist, topShortlist } from '../shared/w3-solutions';

// W3 ADVISOR — the model reads, selects and observes. It never decides.
//
// These pin the guards rather than the intelligence: the intelligence is the
// model's and cannot be asserted, but every way it can be wrong CAN be. Each
// test below is a specific bad answer the advisor must survive without the
// organisation ever seeing it.

test.describe('the quote guard — "we read what you sent" has to be checkable', () => {
  const DOC = `A associação atua no Sarandi desde 2014.
    O terreno ao lado da horta alaga desde que a rua foi asfaltada, e a água
    fica parada por dias.   Queremos transformar esse espaço.`;

  test('a real passage survives extractor whitespace', () => {
    // Extractors introduce line breaks and double spaces no model reproduces.
    // Rejecting a genuine quote over whitespace would make the guard useless in
    // the only direction that matters.
    expect(verifyQuote('O terreno ao lado da horta alaga desde que a rua foi asfaltada', DOC)).toBe(true);
    expect(verifyQuote('a água fica parada por dias', DOC)).toBe(true);
  });

  test('a paraphrase is refused, however good', () => {
    // This is the failure the guard exists for: a competent summary the org
    // would confirm without reading, replacing their own voice with ours.
    expect(verifyQuote('O terreno alaga desde o asfaltamento da rua e a água permanece por vários dias', DOC)).toBe(false);
  });

  test('a fabricated passage is refused', () => {
    expect(verifyQuote('Aproximadamente 40 famílias são afetadas pelo alagamento anualmente', DOC)).toBe(false);
  });

  test('a fragment too short to be a citation is refused', () => {
    // Short strings match by accident, and a two-word "quote" is not evidence
    // that anything was read.
    expect(verifyQuote('o terreno', DOC)).toBe(false);
    expect(verifyQuote('alaga', DOC)).toBe(false);
  });

  test('accents and case are not normalised away', () => {
    // A model that changes them is rewriting, which is the thing being caught.
    expect(verifyQuote('O terreno ao lado da horta alaga desde que a rua foi ASFALTADA', DOC)).toBe(false);
    expect(verifyQuote('a agua fica parada por dias', DOC)).toBe(false);
  });
});

test.describe('the question bank — authored wording, chosen selection', () => {
  test('every chip question offers a way to say "I do not know"', () => {
    // Module load throws otherwise. "Não sei" is a real finding — it tells the
    // coordination what to look at on the next visit — not a skipped field.
    for (const q of W3_QUESTIONS.filter(q => q.kind === 'chips')) {
      expect(q.options!.some(o => /nao-sei|nenhuma|nao-transborda/.test(o.id)), q.id).toBe(true);
    }
  });

  test('eligibility rules exclude what the model must never be able to surface', () => {
    const flatSchoolyard = {
      solutions: ['hortas-urbanas'], familias: ['agricultura-urbana'], tenure: 'public-informal',
      currentUse: 'paved', siteName: 'Pátio da EMEF Nossa Senhora', worry: 'heat',
      areaM2: 300, hasFundingHistory: false, needsStudy: false,
    };
    const ids = eligibleQuestions(flatSchoolyard as any).map(q => q.id);
    // No slope on a schoolyard, no catchment for a raised-bed garden, no flood
    // beneficiary count for a heat problem.
    expect(ids).not.toContain('houses_above');
    expect(ids).not.toContain('contributing_area');
    expect(ids).not.toContain('who_benefits');
    // But the school door and the other users of public land both apply.
    expect(ids).toContain('institution_contact');
    expect(ids).toContain('who_else_uses');
  });

  test('the beneficiary question asks about the place, never about their members', () => {
    // The audit's first disagreement. A platform asking a periphery association
    // to enumerate its own people is doing something other than preparing a
    // project.
    const q = getW3Question('who_benefits')!;
    expect(q.askPt).toMatch(/quantas casas/i);
    expect(q.askPt).not.toMatch(/membros|associad|famílias de vocês/i);
  });

  test('every question says which reviewer gap it closes', () => {
    // So a question nobody needed can be removed by tracing it to a claim.
    for (const q of W3_QUESTIONS) expect(q.from, q.id).toMatch(/Reviewer [ABC]/);
  });
});

test.describe('the advisor never blocks and never decides', () => {
  test('no API key degrades to exactly today behaviour', async () => {
    const key = process.env.OPENAI_API_KEY;
    const alt = process.env.AI_INTEGRATIONS_OPENAI_API_KEY;
    delete process.env.OPENAI_API_KEY;
    delete process.env.AI_INTEGRATIONS_OPENAI_API_KEY;
    try {
      const { advice, reason } = await adviseW3({
        state: { sections: {} } as any, orgName: 'Teste', messages: [], docs: [],
        questionCtx: { solutions: [], familias: [], tenure: '', currentUse: '', siteName: '', worry: '', areaM2: 0, hasFundingHistory: false, needsStudy: false },
        cohort: [],
      });
      expect(advice).toEqual(EMPTY_ADVICE);
      expect(reason).toBe('no API key');
    } finally {
      if (key) process.env.OPENAI_API_KEY = key;
      if (alt) process.env.AI_INTEGRATIONS_OPENAI_API_KEY = alt;
    }
  });

  test('the empty advice is genuinely empty — no half-state', () => {
    // The fallback has to BE the current product, not a degraded one. Anything
    // non-empty here would mean a failed call still changed the session.
    expect(EMPTY_ADVICE.drafts).toEqual([]);
    expect(EMPTY_ADVICE.questionIds).toEqual([]);
    expect(EMPTY_ADVICE.observations).toEqual([]);
  });
});

test.describe('the alignment rule — their Encontro 2 choice leads', () => {
  const base = topShortlist(
    { site: { nbs_interest: 'aguas-pluviais', site_worry: 'alagamento', site_name: 'Pátio' } } as any,
    'pt',
    27,
  );

  test('with no agent picks, the order is exactly what it was', () => {
    // The model is optional, not load-bearing. A session where it never ran
    // must produce the list it produced before any of this existed.
    expect(mergeShortlist(base, [], 'pt').map(e => e.solution.id))
      .toEqual(base.map(e => e.solution.id));
  });

  test('the agent reorders INSIDE their picks, and cites their evidence', () => {
    const merged = mergeShortlist(base, [
      { solutionId: 'biovaletas', reasonPt: 'Na foto do fundo dá pra ver por onde a água entra.', outsideTheirPicks: false },
    ], 'pt');
    expect(merged[0].solution.id).toBe('biovaletas');
    // Its reason is now theirs, not our generic one.
    expect(merged[0].reasonPt).toMatch(/foto do fundo/);
  });

  test('⚠️ an outside solution NEVER outranks one they marked', () => {
    // They chose Águas Pluviais with intention, in a session whose details they
    // may not remember. A platform that quietly reorders that because a photo
    // suggested otherwise has taken the decision while appearing to offer one.
    const merged = mergeShortlist(base, [
      { solutionId: 'grade-viva', reasonPt: 'Na foto 2 dá pra ver o barranco exposto.', outsideTheirPicks: true },
    ], 'pt');
    const ids = merged.map(e => e.solution.id);
    const slope = ids.indexOf('grade-viva');
    const theirs = ids.indexOf('jardins-de-chuva');
    expect(slope).toBeGreaterThan(theirs);
    // And the tension is said out loud rather than left implicit.
    expect(merged[slope].caveatPt).toMatch(/fora dos grupos que vocês marcaram/);
    expect(merged[slope].reasonPt).toMatch(/barranco/);
  });

  test('an invented solution id is dropped rather than rendered', () => {
    const merged = mergeShortlist(base, [
      { solutionId: 'jardim-magico', reasonPt: 'inventado', outsideTheirPicks: false },
    ], 'pt');
    expect(merged.map(e => e.solution.id)).not.toContain('jardim-magico');
    expect(merged).toHaveLength(base.length);
  });

  test('nothing is duplicated or lost in the merge', () => {
    const merged = mergeShortlist(base, [
      { solutionId: 'biovaletas', reasonPt: 'a', outsideTheirPicks: false },
      { solutionId: 'grade-viva', reasonPt: 'b', outsideTheirPicks: true },
    ], 'pt');
    expect(merged).toHaveLength(base.length);
    expect(new Set(merged.map(e => e.solution.id)).size).toBe(base.length);
  });
});

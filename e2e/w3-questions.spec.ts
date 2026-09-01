import { test, expect } from '@playwright/test';
import { W3_QUESTIONS, type QuestionContext } from '../shared/w3-questions';

// ⚠️ A QUESTION THAT WAS ALREADY ANSWERED. The Encontro 2 story prompt asks for
// "quem usa o espaço" in so many words, so `who_else_uses` was a second
// interview about a sentence the organisation had already written. The model is
// also told to drop such questions — but this deployment runs the deterministic
// fallback often enough that a model-only guard is not a guard.

test.describe('a question disqualifies itself when Encontro 2 answered it', () => {
  const q = W3_QUESTIONS.find(x => x.id === 'who_else_uses')!;
  const ctx = (over: Partial<QuestionContext>): QuestionContext => ({
    solutions: [], familias: [], tenure: 'public-informal', currentUse: '', siteName: '',
    worry: '', areaM2: 0, hasFundingHistory: false, needsStudy: false, siteStory: '', ...over,
  });

  test('the story names who uses the place — so it is not asked again', () => {
    expect(q.eligible(ctx({ siteStory: 'É onde as crianças da escola brincam e os moradores passam pra feira.' }))).toBe(false);
  });

  test('a story about the PROBLEM, with no users named, still gets asked', () => {
    // The real record from the context export: it describes heat, paving and
    // flooding, and never says who is there. The question still earns its turn.
    expect(q.eligible(ctx({
      siteStory: 'hace mucho calor porque no hay árboles, pega el sol directo y hay bastante pavimento, cuando llueve se inunda porque no drena el agua',
    }))).toBe(true);
  });

  test('no story at all is a reason to ask, never to skip', () => {
    expect(q.eligible(ctx({ siteStory: '' }))).toBe(true);
  });

  test('the tenure rule still governs — private land never gets it', () => {
    expect(q.eligible(ctx({ tenure: 'private-owned', siteStory: '' }))).toBe(false);
  });
});

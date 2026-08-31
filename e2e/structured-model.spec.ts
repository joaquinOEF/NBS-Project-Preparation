import { test, expect } from '@playwright/test';
import { structuredProvider } from '../server/services/structuredModel';

// ⚠️ PROVIDER-DEFAULT. The conversational agent runs on Anthropic; every
// structured call went through the OpenAI client, because that is where
// createStructuredResponse happened to live. Nobody chose it — the first
// analytical feature set established the pattern and the two after it inherited
// it.
//
// ⚠️ It was not BROKEN — Replit sets AI_INTEGRATIONS_OPENAI_BASE_URL to its own
// gateway with a dummy key, so the OpenAI path resolves there and works. An
// earlier version of this comment claimed otherwise and was wrong.
//
// Preferring Anthropic is a choice: the platform talks to organisations with
// Anthropic, and the analysis of what they said should run on the same provider
// — one bill, one set of behaviours, and no host-specific gateway behind the
// features that decide what an organisation is shown.

test.describe('which provider a structured call uses', () => {
  const saved = {
    a: process.env.ANTHROPIC_API_KEY,
    o: process.env.OPENAI_API_KEY,
    ai: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
  };
  const set = (a?: string, o?: string, ai?: string) => {
    a ? (process.env.ANTHROPIC_API_KEY = a) : delete process.env.ANTHROPIC_API_KEY;
    o ? (process.env.OPENAI_API_KEY = o) : delete process.env.OPENAI_API_KEY;
    ai ? (process.env.AI_INTEGRATIONS_OPENAI_API_KEY = ai) : delete process.env.AI_INTEGRATIONS_OPENAI_API_KEY;
  };
  test.afterAll(() => set(saved.a, saved.o, saved.ai));

  test('Anthropic wins when its key is present — this is the deployment', () => {
    set('sk-ant-x', 'sk-openai-x');
    expect(structuredProvider()).toBe('anthropic');
  });

  test('Anthropic alone is enough — no OpenAI-compatible gateway required', () => {
    set('sk-ant-x');
    expect(structuredProvider()).toBe('anthropic');
  });

  test('OpenAI is used only when it is the only key', () => {
    set(undefined, 'sk-openai-x');
    expect(structuredProvider()).toBe('openai');
    set(undefined, undefined, 'ai-integrations-x');
    expect(structuredProvider()).toBe('openai');
  });

  test('no key is a null, so callers fall back rather than throw', () => {
    set();
    expect(structuredProvider()).toBeNull();
  });

  test('the choice can be forced per environment', () => {
    // Replit's gateway may well be the cheaper path; this is a trade someone
    // should be able to change without editing code.
    set('sk-ant-x', 'sk-openai-x');
    process.env.CBO_STRUCTURED_PROVIDER = 'openai';
    expect(structuredProvider()).toBe('openai');
    process.env.CBO_STRUCTURED_PROVIDER = 'anthropic';
    expect(structuredProvider()).toBe('anthropic');
    delete process.env.CBO_STRUCTURED_PROVIDER;
  });
});

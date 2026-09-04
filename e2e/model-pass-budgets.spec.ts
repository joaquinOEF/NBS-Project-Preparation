import { test, expect } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';
import { PASS_BUDGETS, capFor, passBudget } from '../shared/model-pass-budgets';
import { MODEL_PASSES } from '../shared/context-sources';

// ⚠️ THE THIRD TIME IS WHY THIS FILE EXISTS.
//
// A timeout has quietly disabled a model pass three times here: the concept
// note author (30 s cap, ~46 s real), the synergy report (45 s, ~49 s) and the
// W3 advisor (25 s, ~29 s). Each cap was honest for the prompt it was written
// for and was left behind when the prompt grew. None of them failed: the pass
// resolves with its empty value, the flow continues, and the only symptom is
// output that is thinner than it could have been.
//
// Raising three numbers does not stop a fourth. What stops a fourth is that a
// cap cannot be written anywhere except beside a measurement, and that losing
// the race says so out loud.

const SERVICES = path.join(process.cwd(), 'server', 'services');

test.describe('a cap cannot be written without a measurement', () => {
  test('every budget has 3× headroom over the slowest run actually observed', () => {
    // Three times, not two: the measurement is one machine on one day, and the
    // record that produced it is never the biggest record that exists.
    for (const b of PASS_BUDGETS) {
      expect(b.measuredMs, `${b.id}: measure it, do not estimate`).toBeGreaterThan(1_000);
      if (b.deliberatelyTight) {
        // ⚠️ A blocking pass may sit below 3× — somebody is watching a screen —
        // but never below the measurement itself, which is the state that makes
        // a pass stop existing. And the reason has to name the decision.
        expect(b.blocking, `${b.id}: only a blocking pass may be tight`).toBe(true);
        expect(b.deliberatelyTight.length, b.id).toBeGreaterThan(60);
        expect(b.capMs, `${b.id}: a cap at or under the measurement is a disabled pass`)
          .toBeGreaterThan(b.measuredMs * 1.25);
        continue;
      }
      expect(b.capMs, `${b.id}: cap ${b.capMs}ms against a measured ${b.measuredMs}ms`)
        .toBeGreaterThanOrEqual(b.measuredMs * 3);
    }
  });

  test('every budget says how it was measured, when, and what its firing costs', () => {
    for (const b of PASS_BUDGETS) {
      expect(b.how.length, b.id).toBeGreaterThan(40);
      // ⚠️ The one field that makes the cap reviewable rather than arbitrary.
      // Every one of the three failures was invisible; naming the cost is how a
      // reader knows what to look for when the marker shows up in a log.
      expect(b.costsWhenItFires.length, b.id).toBeGreaterThan(30);
      const when = new Date(b.measuredOn);
      expect(Number.isNaN(when.getTime()), `${b.id}: measuredOn`).toBe(false);
      expect(when.getTime(), `${b.id}: measured in the future`).toBeLessThanOrEqual(Date.now() + 86_400_000);
    }
  });

  test('⚠️ no pass declares a cap of its own', () => {
    // The actual guard. A fourth pass that writes `Number(process.env.X || 45_000)`
    // beside its own Promise.race reproduces the whole defect, and this is the
    // only place that would notice.
    const offenders: string[] = [];
    for (const f of fs.readdirSync(SERVICES).filter(n => n.endsWith('.ts') && n !== 'passBudget.ts')) {
      const src = fs.readFileSync(path.join(SERVICES, f), 'utf8');
      // A setTimeout racing a model call, or a locally-defined timeout constant.
      if (/setTimeout\([^)]*resolve\(null\)/.test(src)) offenders.push(`${f}: races its own timeout`);
      if (/const \w*TIMEOUT_MS\s*=\s*Number\(/.test(src)) offenders.push(`${f}: declares its own cap`);
    }
    expect(offenders, 'use withBudget() and declare the cap in shared/model-pass-budgets.ts').toEqual([]);
  });

  test('every budget names a pass that exists, and every model pass that races has one', () => {
    const declared = new Set(MODEL_PASSES.map(p => p.id));
    for (const b of PASS_BUDGETS) expect(declared, `${b.id} is not a declared model pass`).toContain(b.id);
    // The three that call a provider. familiaRanker races nothing today; if it
    // ever does, `withBudget` will throw for want of a budget, which is the
    // failure mode this whole file prefers.
    for (const id of ['w3Advisor', 'conceptNoteAuthor', 'synergyReport', 'familiaRanker']) {
      expect(passBudget(id), `${id} has no budget`).not.toBeNull();
    }
  });

  test('an operator override wins, and nonsense in the env does not', () => {
    expect(capFor('w3Advisor', {} as any)).toBe(passBudget('w3Advisor')!.capMs);
    expect(capFor('w3Advisor', { CBO_ADVISOR_TIMEOUT_MS: '30000' } as any)).toBe(30_000);
    // ⚠️ An unset or malformed variable must not become a zero-length cap —
    // that would disable the pass instantly and, of course, silently.
    expect(capFor('w3Advisor', { CBO_ADVISOR_TIMEOUT_MS: '' } as any)).toBe(passBudget('w3Advisor')!.capMs);
    expect(capFor('w3Advisor', { CBO_ADVISOR_TIMEOUT_MS: 'nope' } as any)).toBe(passBudget('w3Advisor')!.capMs);
    expect(capFor('w3Advisor', { CBO_ADVISOR_TIMEOUT_MS: '0' } as any)).toBe(passBudget('w3Advisor')!.capMs);
  });

  test('a pass with no budget throws rather than guessing one', () => {
    // ⚠️ Throwing, not defaulting. A default here would be a guessed cap — the
    // exact thing this file exists to make impossible — and it would be a
    // guessed cap arriving silently.
    expect(() => capFor('somePassNobodyDeclared')).toThrow(/no budget declared/);
  });
});

test.describe('losing the race is loud', () => {
  test('⚠️ the marker, the cap, and what was lost', async () => {
    const { withBudget, PASS_TIMEOUT_MARKER } = await import('../server/services/passBudget');
    const lines: string[] = [];
    const warn = console.warn;
    const before = process.env.CBO_ADVISOR_TIMEOUT_MS;
    process.env.CBO_ADVISOR_TIMEOUT_MS = '1000';
    console.warn = (...a: unknown[]) => { lines.push(a.join(' ')); };
    try {
      const out = await withBudget(
        'w3Advisor',
        new Promise(r => setTimeout(() => r('too late'), 5_000)),
      );
      expect(out, 'a cap that fires yields null, never a partial result').toBeNull();
    } finally {
      console.warn = warn;
      if (before === undefined) delete process.env.CBO_ADVISOR_TIMEOUT_MS;
      else process.env.CBO_ADVISOR_TIMEOUT_MS = before;
    }
    const said = lines.join('\n');
    expect(said).toContain(PASS_TIMEOUT_MARKER);
    expect(said).toContain('w3Advisor');
    // The cost, in the words of the registry — so a log line is readable by
    // somebody who has never opened this code.
    expect(said).toContain('no drafts, no chosen questions and no observations');
    expect(said).toMatch(/measure again/);
    expect(said).toMatch(/cap 1000ms/);
  });

  test('a pass that finishes inside its budget is untouched and silent', async () => {
    const { withBudget } = await import('../server/services/passBudget');
    const lines: string[] = [];
    const warn = console.warn;
    console.warn = (...a: unknown[]) => { lines.push(a.join(' ')); };
    try {
      expect(await withBudget('w3Advisor', Promise.resolve({ ok: true }))).toEqual({ ok: true });
    } finally {
      console.warn = warn;
    }
    expect(lines).toEqual([]);
  });
});

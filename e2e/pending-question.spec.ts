import { test, expect } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { TestApi } from './helpers/testApi';
import { canonicaliseAnswer, parsePending, serializePending, PENDING_FIELD, type Pending } from '../shared/pending-question';
import { withPendingQuestion } from '../server/services/pendingQuestion';

// AN ANSWER IS READ — the pending-question contract.
//
// A templated encontro used to have no memory of what it had just asked, so an
// answer counted only when it arrived as the exact chip label, as a tap, with
// the right private flag set. Anything else went to the model, which cannot
// advance a step it does not own — and the organisation's answer was lost
// (JVP, 2026-09-21: "a user responds, agent reads at some point — if not,
// what's the purpose?"). shared/pending-question.ts is the contract; these are
// its checks, and the last one runs the fuzzer that found the holes.

const CONFERE: Pending = { asks: [{ question: 'Confere?', options: [
  { label: 'É isso ✓' }, { label: 'Mudou alguma coisa', handoff: true },
] }] };
const DOOR: Pending = { asks: [{ question: 'Tem mais algum pra mandar?', options: [
  { label: '📎 Mandar mais', action: 'upload' }, { label: 'Pronto, pode seguir' },
] }] };
const REACTION: Pending = { asks: [{ question: 'Vendo isso, o que vocês acham?', options: [
  { label: 'Faz sentido pra gente' }, { label: 'Não é pra gente' }, { label: 'Ainda não sabemos' },
] }] };
const COUNT: Pending = { asks: [{ question: 'Quantas?', forField: 'intervention_units', options: [
  { label: '1' }, { label: '2' }, { label: '5' },
] }] };

test.describe('the message is read against the question that is pending', () => {
  test('tapped, stacked, typed, spoken, by letter and by position — all the same answer', () => {
    expect(canonicaliseAnswer('É isso ✓', CONFERE)).toMatchObject({ text: 'É isso ✓', matched: true, how: 'exact' });
    expect(canonicaliseAnswer('é isso', CONFERE)).toMatchObject({ text: 'É isso ✓', matched: true });
    expect(canonicaliseAnswer('é isso mesmo', CONFERE)).toMatchObject({ text: 'É isso ✓', matched: true, how: 'partial' });
    expect(canonicaliseAnswer('Pronto; Pronto', DOOR)).toMatchObject({ text: 'Pronto, pode seguir', matched: true, how: 'stacked' });
    expect(canonicaliseAnswer('pronto', DOOR)).toMatchObject({ text: 'Pronto, pode seguir', matched: true });
    expect(canonicaliseAnswer('faz sentido', REACTION)).toMatchObject({ text: 'Faz sentido pra gente', matched: true });
    expect(canonicaliseAnswer('letra b', REACTION)).toMatchObject({ text: 'Não é pra gente', how: 'letter' });
    expect(canonicaliseAnswer('a terceira', REACTION)).toMatchObject({ text: 'Ainda não sabemos', how: 'ordinal' });
    expect(canonicaliseAnswer('a última', REACTION)).toMatchObject({ text: 'Ainda não sabemos', how: 'ordinal' });
  });

  test('what is NOT an answer stays what it was', () => {
    // A real question, prose, an ambiguous fragment: the message, untouched.
    for (const raw of ['quanto custa manter isso?', 'A água desce da rua de cima.', 'não']) {
      expect(canonicaliseAnswer(raw, REACTION)).toEqual({ text: raw, matched: false, how: 'none' });
    }
    // "não" fits two options of the reaction — ambiguous is not an answer.
    expect(canonicaliseAnswer('não', REACTION).matched).toBe(false);
    // A count question's labels are one character: "a" / "b" are never letters there.
    expect(canonicaliseAnswer('b', COUNT).matched).toBe(false);
    expect(canonicaliseAnswer('2', COUNT)).toMatchObject({ text: '2', matched: true, how: 'exact' });
    // A chip the client acts on without posting (the picker) is never matched from text.
    expect(canonicaliseAnswer('mandar mais', DOOR).matched).toBe(false);
    // Nothing pending: nothing to match.
    expect(canonicaliseAnswer('É isso ✓', null).matched).toBe(false);
  });

  test('a batch of questions answered together is matched part by part', () => {
    const both: Pending = { asks: [CONFERE.asks[0], REACTION.asks[0]] };
    expect(canonicaliseAnswer('é isso; faz sentido', both)).toMatchObject({ text: 'É isso ✓; Faz sentido pra gente', matched: true });
  });

  test('the record round-trips, keeps the hand-off mark and the field, and refuses junk', () => {
    const back = parsePending(serializePending([{ ...CONFERE.asks[0], forField: 'site_area_rough' }]))!;
    expect(back.asks[0].forField).toBe('site_area_rough');
    expect(back.asks[0].options[1].handoff).toBe(true);
    expect(canonicaliseAnswer('mudou alguma coisa', back)).toMatchObject({ matched: true, handoff: true });
    expect(parsePending('{not json')).toBeNull();
    expect(parsePending('')).toBeNull();
    expect(serializePending([])).toBe('');
  });
});

// ── The wiring, round a checkpoint that is deliberately broken ──────────────
function harness(pending: Pending | null) {
  const fields: Record<string, string> = pending ? { [PENDING_FIELD]: serializePending(pending.asks) } : {};
  const state: any = { sections: { s: { fields: Object.fromEntries(Object.entries(fields).map(([k, v]) => [k, { value: v }])) } } };
  const events: any[] = [];
  const seen: Array<{ msg: string; kind: string | undefined }> = [];
  const run = (userMessage: string, turnKind: string, inner: (m: string, k: string | undefined, push: (e: any) => void) => Promise<boolean>) =>
    withPendingQuestion({
      label: 'spec', cboId: 'spec', state, sectionId: 's', userMessage, turnKind, lang: 'pt',
      pushEvent: e => events.push(e),
      writeFields: (sid, f) => { for (const [k, v] of Object.entries(f)) state.sections[sid].fields[k] = { value: v }; },
      isControlLine: raw => raw === 'Vamos começar o Encontro 3.',
      inner: async (m, k, push) => { seen.push({ msg: m.split('\n[LANGUAGE:')[0], kind: k }); return inner(m, k, push); },
    });
  const recorded = () => parsePending(state.sections.s.fields[PENDING_FIELD]?.value ?? '');
  return { run, events, seen, recorded };
}

test.describe('round a checkpoint', () => {
  test('a typed answer reaches the handlers as the chip, whatever the turn kind said', async () => {
    const h = harness(DOOR);
    await h.run('pronto\n[LANGUAGE: pt]', 'text', async () => true);
    expect(h.seen[0]).toEqual({ msg: 'Pronto, pode seguir', kind: 'chip' });
  });

  test('⚠️ an answer no handler takes NEVER goes to the model — it is said, and the question comes back', async () => {
    const h = harness(REACTION);
    const served = await h.run('Faz sentido pra gente', 'chip', async () => false);
    expect(served, 'the turn is ours — the model must not get it').toBe(true);
    const asks = h.events.filter(e => e.type === 'ask_user');
    expect(asks).toHaveLength(1);
    expect(asks[0].question).toBe('Vendo isso, o que vocês acham?');
    expect(h.events.some(e => e.type === 'chat' && /toca de novo/.test(e.content))).toBe(true);
    expect(h.events[h.events.length - 1].type, 'the turn is closed').toBe('done');
  });

  test('a deliberate hand-off, a real question and prose DO reach the model', async () => {
    for (const [msg, pending] of [['Mudou alguma coisa', CONFERE], ['quanto custa manter isso?', REACTION], ['A água desce da rua.', REACTION]] as const) {
      const h = harness(pending);
      expect(await h.run(msg, 'text', async () => false), msg).toBe(false);
      expect(h.events).toHaveLength(0);
    }
  });

  test('what is on record is what is on screen', async () => {
    const h = harness(CONFERE);
    // A served turn that asks: the new question replaces the old.
    await h.run('É isso ✓', 'chip', async (_m, _k, push) => { push({ type: 'ask_user', question: 'Quantas?', forField: 'intervention_units', options: [{ label: '1' }, { label: '2' }] }); return true; });
    expect(h.recorded()!.asks.map(a => a.question)).toEqual(['Quantas?']);
    expect(h.recorded()!.asks[0].forField).toBe('intervention_units');
    // A file arriving mid-selection asks nothing and leaves the question standing.
    await h.run('I\'m uploading: "ata.pdf".', 'upload', async () => true);
    expect(h.recorded()!.asks.map(a => a.question)).toEqual(['Quantas?']);
    // A served turn that asks nothing (a beat waiting for prose): nothing is pending.
    await h.run('2', 'chip', async () => true);
    expect(h.recorded()).toBeNull();
  });

  test('the entry line, an upload and a map result are never read as answers', async () => {
    // "Encontro 3" once read as 3 units at a count question.
    for (const [msg, kind] of [['Vamos começar o Encontro 3.', 'system'], ['I\'m uploading: "foto 2.jpg".', 'upload'], ['Map selection (composite mode):', 'map']] as const) {
      const h = harness(COUNT);
      await h.run(msg, kind, async () => true);
      expect(h.seen[0], msg).toEqual({ msg, kind });
    }
  });
});

// ── In the browser: said instead of tapped ──────────────────────────────────
const W2_STATE = [
  { sectionId: 'org_profile', field: 'org_name', value: 'Raízes do Sarandi' },
  { sectionId: 'intervention_site', field: 'bairro', value: 'Sarandi' },
  { sectionId: 'intervention_site', field: 'site_name', value: 'Pátio da EMEI Solar' },
  { sectionId: 'intervention_site', field: '_site_lat', value: '-30.0906' },
  { sectionId: 'intervention_site', field: '_site_lng', value: '-51.1726' },
  { sectionId: 'intervention_site', field: 'current_use', value: 'paved' },
  { sectionId: 'intervention_site', field: 'land_tenure', value: 'public-informal' },
  { sectionId: 'intervention_site', field: 'site_worry', value: 'alagamento' },
  { sectionId: 'intervention_site', field: 'site_story', value: 'Quando chove forte a água entra pelo fundo e fica dias.' },
  { sectionId: 'intervention_site', field: 'site_knowledge_depth', value: 'strong' },
  { sectionId: 'intervention_site', field: 'nbs_interest', value: 'aguas-pluviais' },
  // Skips Encontro 3's deliberation beats (criteria · who would do it · what is hardest) — this spec
  // is about something else. They are covered by e2e/cougar-e3-deliberation.spec.ts and the fuzzer.
  { sectionId: 'intervention_type', field: '_quick_tests', value: 'yes' },
];

test.describe('Encontro 3 — answers typed, not tapped', () => {
  test.use({ locale: 'pt-BR' });

  test('"é isso", "seguir sem" and a reload in between: the flow advances and the same question comes back', async ({ page, request }) => {
    const api = new TestApi(request);
    test.skip(!(await api.ping()).fakeModel, 'needs the fake model env (for seeding)');
    await page.goto('/cbo-profile');
    const marker = page.getByTestId('cbo-stream-status');
    await expect(marker).toHaveAttribute('data-cbo-id', /.+/, { timeout: 30_000 });
    const cboId = (await marker.getAttribute('data-cbo-id'))!;
    await api.seedState(cboId, { phase: 3, language: 'pt', sections: W2_STATE });
    const chip = (label: string) => page.locator(`[data-testid^="cbo-option-"][data-option-label="${label}"]`);
    const input = page.getByTestId('cbo-chat-input');
    const say = async (text: string) => { await input.fill(text); await input.press('Enter'); };

    await say('Vamos começar o Encontro 3.');
    await expect(chip('É isso ✓')).toBeVisible({ timeout: 20_000 });
    // Said, lower case, no tick. It used to go to the model and come back silent.
    await say('é isso');
    await expect(chip('📎 Mandar agora')).toBeVisible({ timeout: 20_000 });

    // A reload lands on the SAME question, not a re-derived one.
    await page.reload();
    await expect(chip('📎 Mandar agora')).toBeVisible({ timeout: 30_000 });
    await say('seguir sem');
    await expect(page.getByTestId('cbo-solution-options')).toBeVisible({ timeout: 30_000 });
  });
});

// ── The fuzzer, as a gate ───────────────────────────────────────────────────
test('the hostile-room fuzzer finds no way to lose an answer (scripts/w3-fuzz.ts)', async () => {
  test.setTimeout(240_000);
  const root = process.cwd(); // Playwright runs from the repo root
  let out = '';
  try {
    out = execFileSync('npx', ['tsx', 'scripts/w3-fuzz.ts'], { cwd: root, encoding: 'utf8', env: { ...process.env, W3_FUZZ_WALKS: '250', W3_FUZZ_SEED: '1' }, stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 64 * 1024 * 1024 });
  } catch (e: any) {
    const report = String(e.stdout ?? '').split('\n').filter((l: string) => !l.startsWith('[cbo]') && !l.startsWith('[answer-')).join('\n');
    throw new Error(`w3-fuzz found violations:\n${report.slice(-6000)}`);
  }
  expect(out).toContain('no invariant violated');
});

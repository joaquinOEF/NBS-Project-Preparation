import { test, expect } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { TestApi } from './helpers/testApi';
import { withPendingQuestion, recordingPush } from '../server/services/pendingQuestion';
import { parsePending, serializePending, canonicaliseAnswer, PENDING_FIELD, type Pending } from '../shared/pending-question';

// ENCONTRO 2 BEHIND THE ANSWER CONTRACT (shared/pending-question.ts).
//
// The flaw was written into the checkpoint itself: `if (turnKind !== 'chip')
// return false` — every answer typed or dictated instead of tapped went to the
// model, which cannot advance a step the flow owns. Encontro 3 was wrapped in
// #546; this is Encontro 2, plus the three things wrapping it taught us.

const ZONE = 'Map selection (composite mode):\n- [zone] Partenon: HIGH risk, intervention: flood parks, area: 1.2 km², pop: 11.128, flood: 78%, heat: 41%, landslide: 12%, at (-30.0583, -51.1672)\nTotal: 1 assets, 0 sampled points';

function harness(pending: Pending | null) {
  const state: any = { phase: 2, sections: { s: { fields: pending ? { [PENDING_FIELD]: { value: serializePending(pending.asks) } } : {} } } };
  const events: any[] = [];
  const writeFields = (sid: string, f: Record<string, string>) => { for (const [k, v] of Object.entries(f)) state.sections[sid].fields[k] = { value: v }; };
  const run = (msg: string, inner: () => Promise<boolean>) => withPendingQuestion({ label: 'spec', cboId: 'spec', state, sectionId: 's', userMessage: msg, turnKind: 'chip', lang: 'pt', pushEvent: e => events.push(e), writeFields, inner });
  return { state, events, run, writeFields, recorded: () => parsePending(state.sections.s.fields[PENDING_FIELD]?.value ?? '') };
}
const Q: Pending = { asks: [{ question: 'Esse é o lugar certo?', options: [{ label: 'Confirmar ✓' }, { label: 'É outro tipo de lugar', handoff: true }] }] };

test.describe('what wrapping Encontro 2 added to the contract', () => {
  test('⚠️ never a trap: the same unhandled answer twice releases the turn instead of asking for ever', async () => {
    const h = harness(Q);
    expect(await h.run('Confirmar ✓', async () => false), 'first time: said, and asked again').toBe(true);
    expect(h.events.filter(e => e.type === 'ask_user')).toHaveLength(1);
    expect(await h.run('Confirmar ✓', async () => false), 'second time: released to the model').toBe(false);
    expect(h.recorded(), 'and the question is no longer on record').toBeNull();
    expect(h.state.metadata.health.map((x: any) => x.kind)).toContain('answer-unhandled');
    // A served turn in between resets it: twice means twice IN A ROW.
    const g = harness(Q);
    await g.run('Confirmar ✓', async () => false);
    await g.run('Confirmar ✓', async () => true);
    g.writeFields('s', { [PENDING_FIELD]: serializePending(Q.asks) });
    expect(await g.run('Confirmar ✓', async () => false)).toBe(true);
  });

  test('a question the MODEL asks is on record too — as a hand-off, so an answer to it is never "unhandled"', async () => {
    const h = harness(Q);
    const rec = recordingPush(h.state, 's', h.writeFields, e => h.events.push(e), { handoff: true });
    rec.push({ type: 'chat', content: 'Entendi.' });
    rec.push({ type: 'ask_user', question: 'Seguimos?', options: [{ label: 'Sim' }, { label: 'Confirmar ✓' }] });
    rec.commit();
    expect(h.recorded()!.asks.map(a => a.question)).toEqual(['Seguimos?']);
    expect(h.recorded()!.asks[0].options.every(o => o.handoff)).toBe(true);
    // "Confirmar ✓" spells an option of the OLD templated question; it is the model's now.
    expect(canonicaliseAnswer('confirmar', h.recorded())).toMatchObject({ matched: true, handoff: true });
    expect(await h.run('Confirmar ✓', async () => false)).toBe(false);
    expect(h.events.some(e => /toca de novo/.test(e.content ?? ''))).toBe(false);
    // A model turn that asks nothing leaves the record alone.
    const before = JSON.stringify(h.recorded());
    const quiet = recordingPush(h.state, 's', h.writeFields, () => {}, { handoff: true });
    quiet.push({ type: 'chat', content: 'Só um comentário.' }); quiet.commit();
    expect(JSON.stringify(h.recorded())).toBe(before);
  });
});

test.describe('Encontro 2 — in a session', () => {
  test.use({ locale: 'pt-BR' });

  test('typed answers advance it; a return re-asks the same question; a replayed map result does not reopen the fork', async ({ page, request }) => {
    const api = new TestApi(request);
    test.skip(!(await api.ping()).fakeModel, 'needs the fake model env');
    await page.goto('/cbo-profile');
    const marker = page.getByTestId('cbo-stream-status');
    await expect(marker).toHaveAttribute('data-cbo-id', /.+/, { timeout: 30_000 });
    const cboId = (await marker.getAttribute('data-cbo-id'))!;
    await api.seedState(cboId, { phase: 2, language: 'pt' });
    const chip = (label: string) => page.locator(`[data-testid^="cbo-option-"][data-option-label="${label}"]`);
    const box = page.getByTestId('cbo-chat-input');
    const say = async (t: string) => { await box.fill(t); await box.press('Enter'); };
    const modelRan = page.getByText('Como deseja prosseguir?', { exact: false }); // the fake model's default turn

    await say('Vamos começar o Encontro 2.');
    await expect(chip('Já conheço SbN — pular')).toBeVisible({ timeout: 20_000 });
    // Typed, lower case, no dash — used to go to the model (`turnKind !== 'chip'`).
    await say('já conheço sbn');
    await expect(chip('Um bairro')).toBeVisible({ timeout: 20_000 });
    await expect(modelRan).toHaveCount(0);

    // A return lands on the SAME question.
    await say('Vamos começar o Encontro 2.');
    await expect(chip('Um bairro')).toBeVisible({ timeout: 20_000 });
    await expect(modelRan).toHaveCount(0);

    await say('um bairro');
    await expect(page.locator('.leaflet-container').first()).toBeVisible({ timeout: 30_000 });
    await request.post(`/api/cbo/${cboId}/chat`, { data: { message: ZONE, lang: 'pt', turnKind: 'map' } });
    await page.reload();
    await expect(chip('Sim, tenho um lugar')).toBeVisible({ timeout: 30_000 });

    // The fork, answered by voice: "ainda não".
    await say('ainda não');
    await expect(page.getByText('Como prefere?')).toBeVisible({ timeout: 20_000 });
    await expect(modelRan).toHaveCount(0);

    const state = await (await request.get(`/api/cbo/${cboId}`)).json();
    const health = ((state.state ?? state).metadata?.health ?? []).filter((h: any) => h.kind === 'answer-unhandled');
    expect(health, 'nothing on this path was left unhandled').toEqual([]);
  });

  test('a bairro confirmed AGAIN with a place already saved puts the question on screen back — never the fork', async ({ page, request }) => {
    const api = new TestApi(request);
    test.skip(!(await api.ping()).fakeModel, 'needs the fake model env');
    await page.goto('/cbo-profile');
    const marker = page.getByTestId('cbo-stream-status');
    await expect(marker).toHaveAttribute('data-cbo-id', /.+/, { timeout: 30_000 });
    const cboId = (await marker.getAttribute('data-cbo-id'))!;
    const pending = serializePending([{ question: 'E vocês têm acesso a esse espaço hoje?', options: [{ label: 'Sim, é nosso' }, { label: 'Temos um acordo formal' }] }]);
    await api.seedState(cboId, { phase: 2, language: 'pt', sections: [
      { sectionId: 'intervention_site', field: 'bairro', value: 'Partenon' },
      { sectionId: 'intervention_site', field: 'site_name', value: 'Pátio dos fundos' },
      { sectionId: 'intervention_site', field: '_site_confirmed', value: 'yes' },
      { sectionId: 'intervention_site', field: 'current_use', value: 'paved' },
      { sectionId: 'intervention_site', field: PENDING_FIELD, value: pending },
    ] });
    const r = await request.post(`/api/cbo/${cboId}/chat`, { data: { message: ZONE, lang: 'pt', turnKind: 'map' } });
    const body = await r.text();
    expect(body).toContain('E vocês têm acesso a esse espaço hoje?');
    expect(body, 'the fork is not reopened').not.toContain('lugar específico onde querem atuar');
    expect(body).not.toContain('fake model');
  });
});

// ── The fuzzer, as a gate (needs the running dev server — which this suite has) ──
test('the Encontro 2 hostile-room fuzzer finds no way to lose an answer (scripts/w2-fuzz.ts)', async ({ request, baseURL }) => {
  test.setTimeout(420_000);
  const api = new TestApi(request);
  test.skip(!(await api.ping()).fakeModel, 'needs the fake model env');
  let out = '';
  try {
    out = execFileSync('npx', ['tsx', 'scripts/w2-fuzz.ts'], { cwd: process.cwd(), encoding: 'utf8', env: { ...process.env, W2_FUZZ_WALKS: '16', W2_FUZZ_SEED: '1', W2_FUZZ_BASE: baseURL ?? 'http://localhost:5050' }, stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 64 * 1024 * 1024 });
  } catch (e: any) {
    throw new Error(`w2-fuzz found violations:\n${String(e.stdout ?? '').slice(-6000)}`);
  }
  expect(out).toContain('no invariant violated');
});

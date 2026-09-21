// ============================================================================
// ENCONTRO 2 UNDER A HOSTILE ROOM — the fuzzer, over HTTP
// ============================================================================
// scripts/w3-fuzz.ts drives Encontro 3's checkpoint in-process, because that
// checkpoint is a module with its dependencies passed in. Encontro 2's lives
// inside cboAgent.ts with the database, the geocoder and the hazard lookup
// around it — so this one drives a RUNNING dev server instead: real sessions,
// the real /chat route, the real dispatcher, the fake model behind it. Slower,
// and it sees more: a turn that falls through to the model is observed as one.
//
// Needs the e2e dev server (fake model + test routes). See docs/e2e-testing.md:
//   DATABASE_URL=… CBO_FAKE_MODEL=1 CBO_FAKE_GEOCODE=1 ENABLE_TEST_ROUTES=1 PORT=5050 npm run dev
//   npx tsx scripts/w2-fuzz.ts                       # 60 walks
//   W2_FUZZ_WALKS=300 W2_FUZZ_SEED=7 W2_FUZZ_VERBOSE=1 npx tsx scripts/w2-fuzz.ts
//
// Invariants, checked after every turn:
//   I1  an answer that matches an option of the pending TEMPLATED question never
//       reaches the model (options marked `handoff` are the model's by design)
//   I2  a templated turn ends on something to do (a question, the map, a card)
//   I3  no question is asked twice in one turn
//   I4  nothing a person reads carries "undefined", "NaN", "[object", a raw field id
//   I5  a return (the entry line re-sent) lands on the SAME question
//   I6  no question is asked 5× in a row without the record changing (a stuck beat)
//   I7  the session never reports an unhandled answer (metadata.health)
//   I8  a beat that asked for their own words captures them (never the model's)
// ============================================================================
import { uploadNotice } from '../shared/cbo-upload-notices';
import { parsePending, PENDING_FIELD } from '../shared/pending-question';

const BASE = process.env.W2_FUZZ_BASE || 'http://localhost:5050';
const WALKS = Number(process.env.W2_FUZZ_WALKS || 60);
const SEED0 = Number(process.env.W2_FUZZ_SEED || 1);
const VERBOSE = process.env.W2_FUZZ_VERBOSE === '1';
const MAX_TURNS = 45;
const HEADERS: Record<string, string> = { 'content-type': 'application/json', ...(process.env.TEST_API_SECRET ? { 'x-test-secret': process.env.TEST_API_SECRET } : {}) };

function rng(seed: number) {
  let a = seed >>> 0;
  return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const pick = <T,>(r: () => number, xs: T[]): T => xs[Math.floor(r() * xs.length)];
const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();

type Actor = 'polite' | 'random' | 'hostile';
const ENTRY = { pt: 'Vamos começar o Encontro 2.', en: "Let's start Encontro 2." };
const ZONE = 'Map selection (composite mode):\n- [zone] Partenon: HIGH risk, intervention: flood parks, area: 1.2 km², pop: 11.128, flood: 78%, heat: 41%, landslide: 12%, at (-30.0583, -51.1672)\nTotal: 1 assets, 0 sampled points';
// The focused site session sends the zone again WITH the site — the checkpoint reads both.
const SITE = 'Map selection (composite mode):\n- [zone] Partenon: HIGH risk, intervention: flood parks, area: 1.2 km², pop: 11.128, flood: 78%, heat: 41%, landslide: 12%, at (-30.0583, -51.1672)\n- [custom] Pátio dos fundos at (-30.0583, -51.1672)\nTotal: 2 assets, 0 sampled points';
const FREE = ['não sei', 'ok', 'A água desce da rua de cima e entra pelo portão.', 'pode repetir?', 'depende', 'quanto custa isso?'];

async function post(path: string, body: unknown) {
  const r = await fetch(`${BASE}${path}`, { method: 'POST', headers: HEADERS, body: JSON.stringify(body ?? {}) });
  if (!r.ok) throw new Error(`POST ${path} → ${r.status} ${(await r.text()).slice(0, 200)}`);
  return r;
}
async function chat(cboId: string, message: string, lang: string, turnKind: string): Promise<any[]> {
  const r = await post(`/api/cbo/${cboId}/chat`, { message, lang, turnKind });
  const text = await r.text();
  return text.split('\n\n').map(b => b.trim()).filter(b => b.startsWith('data:')).map(b => { try { return JSON.parse(b.slice(5).trim()); } catch { return null; } }).filter(Boolean);
}
async function stateOf(cboId: string): Promise<any> {
  const r = await fetch(`${BASE}/api/cbo/${cboId}`, { headers: HEADERS });
  const j: any = await r.json();
  return j.state ?? j;
}

const recovered = new Set<string>();
interface Violation { sig: string; detail: string; turns: number; walk: string; transcript: string[] }
const JUNK = /undefined|\bNaN\b|\[object |\*\*\s*\*\*|\{\{|\}\}/;
const ID_LEAK = /\b(site_worry|nbs_interest|land_tenure|role_preference|private-owned|public-informal|formal-agreement|aguas-pluviais|_pending_asks_json)\b/;

async function walk(actor: Actor, seed: number, lang: 'pt' | 'en'): Promise<Violation[]> {
  const r = rng(seed);
  const out: Violation[] = [];
  const transcript: string[] = [];
  const v = (sig: string, detail: string) => { if (!out.some(x => x.sig === sig)) out.push({ sig, detail, turns: transcript.length, walk: `[${actor}] seed ${seed} · ${lang}`, transcript: [...transcript] }); };

  const { cboId } = await (await post('/__test/cbo/session', {})).json() as any;
  await post(`/__test/cbo/${cboId}/seed-state`, { phase: 2, language: lang, sections: [
    { sectionId: 'org_profile', field: 'org_name', value: 'Fuzz Org' }, { sectionId: 'org_profile', field: 'contact_name', value: 'Ana' },
  ] });

  let sent: { msg: string; kind: string; why: string } = { msg: ENTRY[lang], kind: 'text', why: 'entry' };
  let lastAsk: any = null; let lastMap: any = null; const seenOptions: string[] = [];
  let sameAsk = 0; let lastAskKey = ''; let lastRecord = '';

  for (let t = 0; t < MAX_TURNS; t++) {
    const before = await stateOf(cboId);
    if (before.phase !== 2) break;
    const pendingBefore = parsePending(String(before.sections?.intervention_site?.fields?.[PENDING_FIELD]?.value ?? ''));
    const lastPending = pendingBefore?.asks[pendingBefore.asks.length - 1];
    transcript.push(`(${sent.kind}) ${sent.msg.split('\n')[0].slice(0, 90)}   ⟨${sent.why}⟩`);
    const events = await chat(cboId, sent.msg, lang, sent.kind);
    const done = events.filter(e => e.type === 'done').pop();
    const byModel = /fake model/i.test(String(done?.summary ?? ''));
    const asks = events.filter(e => e.type === 'ask_user');
    const texts = events.filter(e => e.type === 'chat' || e.type === 'ask_user').map(e => `${e.content ?? ''} ${e.question ?? ''} ${(e.options ?? []).map((o: any) => `${o.label} ${o.description ?? ''}`).join(' ')}`).join(' ');

    // I1 — what the pending templated question owned went to the model.
    const first = sent.msg.split(';')[0].trim();
    const owned = lastPending?.options.find(o => !o.handoff && !['write', 'record', 'upload'].includes(o.action ?? '') && norm(o.label) === norm(first));
    if (byModel && owned && sent.kind !== 'upload' && sent.kind !== 'map') v(`I1 lost to the model: ${sent.why}`, `pending="${lastPending!.question}" sent="${sent.msg.slice(0, 60)}"`);
    // I8 — a beat that asked for their own words must capture them.
    if (sent.why === 'prose for a free-text beat' && byModel) v('I8 prose for a free-text beat was lost to the model', `after="${transcript[transcript.length - 2] ?? ''}"`);
    // I2 — a served turn with nothing to tap is only right when it is waiting for their words.
    const actionable = events.some(e => ['ask_user', 'open_map', 'ask_priority_rank', 'ask_community_anchoring', 'show_roadmap', 'open_intervention_selector'].includes(e.type));
    const lastLine = String(events.filter(e => e.type === 'chat').pop()?.content ?? '');
    const waitsForProse = !byModel && !actionable && !/E2 checkpoint \((closing|close)/.test(String(done?.summary ?? '')) && /\?|palavras|words|conta|tell me|escreve|write|grava|record/i.test(lastLine);
    const closed = /E2 checkpoint \((closing|close)/.test(String(done?.summary ?? ''));
    if (!byModel && !actionable && !waitsForProse && !closed && before.phase === 2) v('I2 a templated turn ended with nothing to do', `sent="${sent.msg.slice(0, 60)}" done="${done?.summary}"`);
    // I3
    const qs = asks.map(a => a.question); if (new Set(qs).size !== qs.length) v('I3 the same question twice in one turn', qs.join(' | '));
    // I4
    if (JUNK.test(texts)) v('I4 junk in what a person reads', (JUNK.exec(texts) ?? [''])[0] + ' · ' + texts.slice(0, 120));
    if (ID_LEAK.test(texts)) v('I4 a machine id in what a person reads', (ID_LEAK.exec(texts) ?? [''])[0]);
    // I5
    if (sent.why === 'return' && lastPending && asks.length && asks[asks.length - 1].question !== lastPending.question) v('I5 a return landed on a different question', `was="${lastPending.question}" now="${asks[asks.length - 1].question}"`);

    const after = await stateOf(cboId);
    // I7
    // An answer no state-gated handler took is RECOVERED when the flow resumed
    // from the record; it is a violation only when the organisation was left
    // with "toca de novo". Recoveries are counted and printed — each is still a
    // handler worth writing.
    const incidents = (after.metadata?.health ?? []).filter((h: any) => h.kind === 'answer-unhandled');
    for (const h of incidents.filter((h: any) => /resumed from the record/.test(h.detail))) recovered.add(h.detail.replace(/ had no handler.*$/, ''));
    const unhandled = incidents.find((h: any) => !/resumed from the record/.test(h.detail));
    if (unhandled) v('I7 an option of the pending question no handler takes', unhandled.detail);
    // I6
    const record = JSON.stringify(Object.fromEntries(Object.entries(after.sections?.intervention_site?.fields ?? {}).filter(([k]) => k !== PENDING_FIELD).map(([k, f]: any) => [k, f?.value])));
    const askKey = asks.length ? asks[asks.length - 1].question : '';
    if (askKey && askKey === lastAskKey && record === lastRecord) sameAsk++; else sameAsk = 0;
    if (sameAsk >= 4 && actor === 'polite') v('I6 a stuck beat (asked 5× with nothing changing)', askKey);
    lastAskKey = askKey; lastRecord = record;

    if (asks.length) { lastAsk = asks[asks.length - 1]; for (const o of lastAsk.options ?? []) seenOptions.push(o.label); lastMap = null; }
    const map = events.filter(e => e.type === 'open_map').pop();
    if (map) { lastMap = map; lastAsk = null; }
    if (after.phase !== 2) break;
    // The encontro closed: nothing more is the flow's to ask until the coordination opens the next one.
    if (/E2 checkpoint \((closing|close)/.test(String(done?.summary ?? ''))) break;

    // ── the next move ──
    if (waitsForProse) { lastAsk = null; sent = { msg: 'A água desce da rua de cima e entra pelo portão dos fundos quando chove forte.', kind: 'text', why: 'prose for a free-text beat' }; continue; }
    const opts: string[] = (lastAsk?.options ?? []).filter((o: any) => !['write', 'record', 'upload'].includes(o.action)).map((o: any) => o.label);
    const mapReply = () => ({ msg: lastMap?.params?.focusZone ? SITE : ZONE, kind: 'map', why: 'map result' });
    if (lastMap && (actor === 'polite' || r() < 0.7)) { sent = mapReply(); continue; }
    if (!opts.length) {
      const kind = events.find(e => e.type === 'ask_priority_rank') ? 'rank' : events.find(e => e.type === 'ask_community_anchoring') ? 'anchor' : '';
      sent = kind === 'rank' ? { msg: 'Priority ranking: flood (1), heat (2)', kind: 'text', why: 'ranking' }
        : { msg: pick(r, FREE), kind: 'text', why: 'free text (no chips)' };
      continue;
    }
    // Forward-leaning choice for the polite actor: avoid the chips that loop or park.
    const forward = opts.find(o => !/exemplo|example|ainda n[aã]o|not yet|anexar|attach|ajustar|adjust|voltar|back/i.test(o)) ?? opts[0];
    if (actor === 'polite') { sent = { msg: forward, kind: 'chip', why: 'polite' }; continue; }
    const roll = r();
    const hostile = actor === 'hostile';
    if (roll < 0.34) sent = { msg: r() < 0.6 ? forward : pick(r, opts), kind: 'chip', why: 'tap' };
    else if (roll < 0.52) sent = { msg: norm(pick(r, opts)), kind: 'text', why: 'typed/spoken version of a chip' };
    else if (roll < 0.60) sent = { msg: pick(r, opts), kind: 'text', why: 'chip label sent as text (dictated)' };
    else if (roll < 0.68 && hostile) { const o = pick(r, opts); sent = { msg: `${o}; ${o}`, kind: 'chip', why: 'stacked answer' }; }
    else if (roll < 0.76 && hostile && seenOptions.length) sent = { msg: pick(r, seenOptions), kind: 'chip', why: 'stale chip from an earlier question' };
    else if (roll < 0.82 && hostile) sent = { msg: uploadNotice.parsed('foto-do-patio.jpg', 'A paved courtyard with two trees.'), kind: 'upload', why: 'upload' };
    else if (roll < 0.88) sent = { msg: ENTRY[lang], kind: 'text', why: 'return' };
    else if (roll < 0.92 && hostile) sent = { msg: ZONE, kind: 'map', why: 'a map result nobody asked for' };
    else sent = { msg: pick(r, FREE), kind: 'text', why: 'free text' };
  }
  return out;
}

(async () => {
  // A dev server that has just printed "listening" can still refuse the first
  // connection or two — give it a few seconds before calling it absent.
  let lastErr: any = null;
  for (let i = 0; i < 8; i++) {
    try { const p: any = await fetch(`${BASE}/__test/ping`, { headers: HEADERS }).then(r => r.json()); if (!p.fakeModel) throw new Error('the server is not running the fake model'); lastErr = null; break; }
    catch (e) { lastErr = e; await new Promise(r => setTimeout(r, 1500)); }
  }
  try { if (lastErr) throw lastErr; }
  catch (e: any) { console.error(`w2-fuzz needs the e2e dev server at ${BASE} (fake model + test routes): ${e?.message ?? e}`); process.exit(2); }

  const all: Violation[] = [];
  const actors: Actor[] = ['polite', 'random', 'hostile', 'hostile'];
  for (let i = 0; i < WALKS; i++) {
    const seed = SEED0 * 100_000 + i;
    all.push(...await walk(actors[i % actors.length], seed, i % 7 === 0 ? 'en' : 'pt'));
  }
  console.log('═'.repeat(78)); console.log(`ENCONTRO 2 · fuzz over HTTP — ${WALKS} walks · seed ${SEED0} · ${BASE}`); console.log('═'.repeat(78));
  const bySig = new Map<string, Violation[]>();
  for (const x of all) bySig.set(x.sig, [...(bySig.get(x.sig) ?? []), x]);
  if (recovered.size) { console.log(`\nℹ ${recovered.size} answer(s) had no handler for the state they arrived in and were recovered by resuming from the record:`); for (const d of Array.from(recovered).slice(0, 12)) console.log(`     · ${d}`); }
  if (!bySig.size) { console.log('\n✅ no invariant violated'); process.exit(0); }
  for (const [sig, xs] of Array.from(bySig.entries()).sort((a, b) => b[1].length - a[1].length)) {
    const details = new Map<string, number>(); for (const x of xs) details.set(x.detail, (details.get(x.detail) ?? 0) + 1);
    console.log(`\n✗ ${sig}   — ${xs.length} walk(s)`);
    for (const [d, n] of Array.from(details.entries()).sort((a, b) => b[1] - a[1]).slice(0, 6)) console.log(`     ${String(n).padStart(3)}× ${d}`);
    const best = xs.slice().sort((a, b) => a.turns - b.turns)[0];
    console.log(`    shortest repro: ${best.walk} · turn ${best.turns}`);
    for (const line of (VERBOSE ? best.transcript : best.transcript.slice(-4))) console.log(`      → ${line}`);
  }
  console.log(`\n${bySig.size} kind(s) of violation across ${WALKS} walks`);
  process.exit(1);
})();

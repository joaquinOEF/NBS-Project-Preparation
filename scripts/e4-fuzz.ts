// ============================================================================
// ENCONTRO 4 UNDER A HOSTILE ROOM — the fuzzer, over HTTP
// ============================================================================
// Same harness as scripts/w2-fuzz.ts: a RUNNING e2e dev server (fake model +
// test routes), real sessions, the real /chat route. Each walk starts from one
// of the states an organisation really arrives in — visit recorded or not,
// Encontro 3 closed or not, no place, nothing liked, nothing tested, a
// solution counted in units — and an actor (polite, random, hostile) answers.
//
//   DATABASE_URL=… CBO_FAKE_MODEL=1 CBO_FAKE_GEOCODE=1 ENABLE_TEST_ROUTES=1 PORT=5050 npm run dev
//   npx tsx scripts/e4-fuzz.ts                       # 70 walks
//   E4_FUZZ_WALKS=300 E4_FUZZ_SEED=7 E4_FUZZ_VERBOSE=1 npx tsx scripts/e4-fuzz.ts
//
// Invariants, after every turn:
//   I1  an answer matching an option of the pending templated question never
//       reaches the model
//   I2  a templated turn ends on something to do
//   I3  no question twice in one turn
//   I4  nothing a person reads carries "undefined", "NaN", "[object", a raw id
//   I5  a return (the entry line re-sent) lands on the SAME question
//   I6  no question asked 5× with nothing changing (polite)
//   I7  no unhandled answer left the organisation with "toca de novo"
//   I9  the polite actor closes the encontro
//   I10 the server never answers 5xx; the pre-note always prints, clean
// ============================================================================
import { parsePending, PENDING_FIELD } from '../shared/pending-question';
import { uploadNotice } from '../shared/cbo-upload-notices';

const BASE = process.env.E4_FUZZ_BASE || 'http://localhost:5050';
const WALKS = Number(process.env.E4_FUZZ_WALKS || 70);
const SEED0 = Number(process.env.E4_FUZZ_SEED || 1);
const VERBOSE = process.env.E4_FUZZ_VERBOSE === '1';
const MAX_TURNS = 40;
const HEADERS: Record<string, string> = { 'content-type': 'application/json', ...(process.env.TEST_API_SECRET ? { 'x-test-secret': process.env.TEST_API_SECRET } : {}) };

function rng(seed: number) {
  let a = seed >>> 0;
  return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const pick = <T,>(r: () => number, xs: T[]): T => xs[Math.floor(r() * xs.length)];
const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();

type Actor = 'polite' | 'random' | 'hostile';
const ENTRY = { pt: 'Vamos começar o Encontro 4.', en: "Let's start Encontro 4." };
const SITE_MAP = 'Map selection (composite mode):\n- [zone] Floresta: HIGH risk, intervention: flood parks, area: 1.2 km², pop: 11.128, flood: 78%, heat: 41%, landslide: 12%, at (-30.0198, -51.2032)\n- [custom] Pátio dos fundos at (-30.0198, -51.2032) · 140 m²\nTotal: 2 assets, 0 sampled points';
const FREE = ['não sei', 'ok', 'umas 40 famílias da rua de baixo', '10 por 12', 'uns 200 metros quadrados', 'quanto custa isso?', 'jardins de chuva', 'jardim mágico flutuante', 'a escola e a associação', '25', '', '😀', 'pode repetir?', 'Mutirão de 20 pessoas'];
const JUNK = /undefined|\bNaN\b|\[object |\*\*\s*\*\*|\{\{|\}\}/;
// "alagamentos" is an indicator id AND a Portuguese word ("evitando alagamentos"
// in the catalogue's own sentence): only flagged where prose can't put it — a
// list separator or a quote right before it (",alagamentos", "'alagamentos").
const ID_LEAK = /\b(site_worry|land_tenure|construction_model|who_maintains|_e4_\w+|e4_contribution|e4_partners|private-owned|public-informal|jardins-de-chuva|corredores-verdes|_pending_asks_json|familias-atendidas)\b|[,'"]alagamentos\b/;

const TESTS = (over: any[] = []) => JSON.stringify(over);
const base = (extra: Array<{ sectionId: string; field: string; value: string }>) => [
  { sectionId: 'org_profile', field: 'org_name', value: 'Fuzz Org' },
  { sectionId: 'org_profile', field: 'contact_name', value: 'Ana' },
  { sectionId: 'intervention_site', field: 'bairro', value: 'Floresta' },
  { sectionId: 'intervention_site', field: 'site_name', value: 'Pátio dos fundos' },
  { sectionId: 'intervention_site', field: 'site_worry', value: 'alagamento' },
  { sectionId: 'intervention_site', field: 'site_story', value: 'Quando chove forte a água entra pelo portão.' },
  { sectionId: 'intervention_site', field: 'land_tenure', value: 'private-owned' },
  { sectionId: 'intervention_site', field: 'prior_collaboration_detail', value: 'COOP20' },
  { sectionId: 'org_profile', field: 'team_size', value: '6-15' },
  ...extra,
];
const PLACE = [{ sectionId: 'intervention_site', field: '_site_lat', value: '-30.0198' }, { sectionId: 'intervention_site', field: '_site_lng', value: '-51.2032' }];
const CLOSED = [{ sectionId: 'intervention_type', field: '_e3_closed', value: 'yes' }];
const LIKED = [{ sectionId: 'intervention_type', field: 'solution_tests_json', value: TESTS([{ solutionId: 'jardins-de-chuva', reaction: 'faz-sentido', areaM2: 120, who: 'nos', hardest: 'custo', testedAt: 'x' }, { solutionId: 'teto-verde', reaction: 'ainda-nao-sabemos', testedAt: 'x' }]) }];
const VISIT = [{ sectionId: 'intervention_type', field: '_visit_json', value: JSON.stringify({ solutionId: 'jardins-de-chuva', areaM2: 140, recordedAt: 'x' }) }];
const STATES: Record<string, Array<{ sectionId: string; field: string; value: string }>> = {
  'visit+place': base([...PLACE, ...CLOSED, ...LIKED, ...VISIT]),
  'no-visit': base([...PLACE, ...CLOSED, ...LIKED]),
  'e3-open': base([...PLACE, ...LIKED]),
  'no-place': base([...CLOSED, ...LIKED]),
  'nothing-liked': base([...PLACE, ...CLOSED, { sectionId: 'intervention_type', field: 'solution_tests_json', value: TESTS([{ solutionId: 'teto-verde', reaction: 'nao-e-pra-gente', testedAt: 'x' }]) }]),
  'nothing-tested': base([...PLACE, ...CLOSED]),
  'units': base([...PLACE, ...CLOSED, { sectionId: 'intervention_type', field: 'solution_tests_json', value: TESTS([{ solutionId: 'corredores-verdes', reaction: 'faz-sentido', units: 25, who: 'contratar', testedAt: 'x' }]) }]),
  'no-area-anywhere': base([...PLACE, ...CLOSED, { sectionId: 'intervention_type', field: 'solution_tests_json', value: TESTS([{ solutionId: 'biovaletas', reaction: 'faz-sentido', testedAt: 'x' }]) }]),
};

async function post(path: string, body: unknown) {
  const r = await fetch(`${BASE}${path}`, { method: 'POST', headers: HEADERS, body: JSON.stringify(body ?? {}) });
  if (!r.ok) throw new Error(`POST ${path} → ${r.status} ${(await r.text()).slice(0, 200)}`);
  return r;
}
async function chat(cboId: string, message: string, lang: string, turnKind: string): Promise<{ events: any[]; status: number }> {
  const r = await fetch(`${BASE}/api/cbo/${cboId}/chat`, { method: 'POST', headers: HEADERS, body: JSON.stringify({ message, lang, turnKind }) });
  const text = await r.text();
  return { status: r.status, events: text.split('\n\n').map(b => b.trim()).filter(b => b.startsWith('data:')).map(b => { try { return JSON.parse(b.slice(5).trim()); } catch { return null; } }).filter(Boolean) };
}
async function stateOf(cboId: string): Promise<any> {
  const j: any = await (await fetch(`${BASE}/api/cbo/${cboId}`, { headers: HEADERS })).json();
  return j.state ?? j;
}

interface Violation { sig: string; detail: string; turns: number; walk: string; transcript: string[] }
const recovered = new Set<string>();

async function walk(actor: Actor, seed: number, lang: 'pt' | 'en', stateName: string): Promise<Violation[]> {
  const r = rng(seed);
  const out: Violation[] = [];
  const transcript: string[] = [];
  const v = (sig: string, detail: string) => { if (!out.some(x => x.sig === sig)) out.push({ sig, detail, turns: transcript.length, walk: `[${actor}] ${stateName} · seed ${seed} · ${lang}`, transcript: [...transcript] }); };

  const { cboId } = await (await post('/__test/cbo/session', {})).json() as any;
  await post(`/__test/cbo/${cboId}/seed-state`, { phase: 4, language: lang, sections: STATES[stateName] });

  let sent = { msg: ENTRY[lang], kind: 'text', why: 'entry' };
  let lastAsk: any = null; let lastMap: any = null; const seenOptions: string[] = [];
  let sameAsk = 0; let lastAskKey = ''; let lastRecord = ''; let closedAt = -1;

  for (let t = 0; t < MAX_TURNS; t++) {
    const before = await stateOf(cboId);
    const pendingBefore = parsePending(String(before.sections?.intervention_type?.fields?.[PENDING_FIELD]?.value ?? ''));
    const lastPending = pendingBefore?.asks[pendingBefore.asks.length - 1];
    transcript.push(`(${sent.kind}) ${sent.msg.split('\n')[0].slice(0, 90)}   ⟨${sent.why}⟩`);
    const { events, status } = await chat(cboId, sent.msg, lang, sent.kind);
    if (status >= 500) { v('I10 the server answered 5xx', `status ${status} on "${sent.msg.slice(0, 60)}"`); break; }
    const done = events.filter(e => e.type === 'done').pop();
    const byModel = !/E4 checkpoint/.test(String(done?.summary ?? ''));
    const asks = events.filter(e => e.type === 'ask_user');
    const texts = events.filter(e => ['chat', 'ask_user'].includes(e.type)).map(e => `${e.content ?? ''} ${e.question ?? ''} ${(e.options ?? []).map((o: any) => `${o.label} ${o.description ?? ''}`).join(' ')}`).join(' ')
      + ' ' + events.filter(e => e.type === 'show_prenote').map(e => JSON.stringify(e.prenote?.sections?.map((s: any) => s.lines.map((l: any) => l.text)))).join(' ');

    // I1
    const owned = lastPending?.options.find(o => !o.handoff && !['write', 'record', 'upload'].includes(o.action ?? '') && norm(o.label) === norm(sent.msg.split(';')[0]));
    if (byModel && owned && sent.kind !== 'upload' && sent.kind !== 'map') v(`I1 lost to the model: ${sent.why}`, `pending="${lastPending!.question}" sent="${sent.msg.slice(0, 60)}"`);
    // I2 — the model's turns are followed by the encontro's own question (reask); judge the whole turn.
    const actionable = events.some(e => ['ask_user', 'open_map'].includes(e.type));
    if (!actionable) v('I2 a turn ended with nothing to do', `sent="${sent.msg.slice(0, 60)}" done="${done?.summary}"`);
    // I3
    const qs = asks.map(a => a.question); if (new Set(qs).size !== qs.length) v('I3 the same question twice in one turn', qs.join(' | '));
    // I4
    if (JUNK.test(texts)) v('I4 junk in what a person reads', (JUNK.exec(texts) ?? [''])[0] + ' · ' + texts.slice(0, 140));
    if (ID_LEAK.test(texts)) v('I4 a machine id in what a person reads', (ID_LEAK.exec(texts) ?? [''])[0]);
    // I5
    if (sent.why === 'return' && lastPending && asks.length && asks[asks.length - 1].question !== lastPending.question) v('I5 a return landed on a different question', `was="${lastPending.question}" now="${asks[asks.length - 1].question}"`);

    const after = await stateOf(cboId);
    // I7
    const incidents = (after.metadata?.health ?? []).filter((h: any) => h.kind === 'answer-unhandled');
    for (const h of incidents.filter((h: any) => /resumed from the record/.test(h.detail))) recovered.add(h.detail);
    const unhandled = incidents.find((h: any) => !/resumed from the record/.test(h.detail));
    if (unhandled) v('I7 an option of the pending question no handler takes', unhandled.detail);
    // I6
    const record = JSON.stringify([after.sections?.intervention_type?.fields, after.sections?.intervention_site?.fields, after.sections?.operations_sustain?.fields].map(f => Object.fromEntries(Object.entries(f ?? {}).filter(([k]) => k !== PENDING_FIELD && k !== '_e4_step').map(([k, x]: any) => [k, x?.value]))));
    const askKey = asks.length ? asks[asks.length - 1].question : '';
    if (askKey && askKey === lastAskKey && record === lastRecord) sameAsk++; else sameAsk = 0;
    if (sameAsk >= 4 && actor === 'polite') v('I6 a stuck beat (asked 5× with nothing changing)', askKey);
    lastAskKey = askKey; lastRecord = record;

    if (asks.length) { lastAsk = asks[asks.length - 1]; for (const o of lastAsk.options ?? []) seenOptions.push(o.label); lastMap = null; }
    const map = events.filter(e => e.type === 'open_map').pop();
    if (map) { lastMap = map; lastAsk = null; }
    const closed = String(after.sections?.intervention_type?.fields?._e4_closed?.value ?? '') === 'yes';
    if (closed && closedAt < 0) closedAt = t;
    if (closed && (actor === 'polite' || t - closedAt >= 4)) break;

    // ── the next move ──
    const opts: string[] = (lastAsk?.options ?? []).map((o: any) => o.label);
    if (lastMap && (actor === 'polite' || r() < 0.8)) { sent = { msg: SITE_MAP, kind: 'map', why: 'map result' }; continue; }
    const prose = /quem sofre mais|o que mudou|qual solução\? escreve|de que tamanho|quantas|colocar no projeto|já conversaram|who suffers|what changed|which solution\? write|what size|how many|put into|talked to/i.test(lastAsk?.question ?? '');
    if (actor === 'polite') {
      if (prose && r() < 0.7) {
        const q = lastAsk.question;
        const ans = /qual solução|which solution/i.test(q) ? 'jardins de chuva' : /tamanho|size|quantas|how many/i.test(q) ? '10 por 12' : /colocar|put into/i.test(q) ? 'Mutirão de 20 pessoas' : /conversaram|talked/i.test(q) ? 'a escola e a associação' : 'umas 40 famílias da rua de baixo';
        sent = { msg: ans, kind: 'text', why: 'prose for a free-text beat' }; continue;
      }
      const forward = opts.find(o => !/mudar|change|outra|another|mudou|changed|ver a|see the|pular|skip|marcar|mark/i.test(o)) ?? opts[0];
      sent = { msg: forward ?? 'ok', kind: 'chip', why: 'polite' }; continue;
    }
    const roll = r();
    const hostile = actor === 'hostile';
    if (!opts.length) { sent = { msg: pick(r, FREE) || 'ok', kind: 'text', why: 'free text (no chips)' }; continue; }
    if (roll < 0.3) sent = { msg: pick(r, opts), kind: 'chip', why: 'tap' };
    else if (roll < 0.45) sent = { msg: norm(pick(r, opts)), kind: 'text', why: 'typed/spoken version of a chip' };
    else if (roll < 0.52) sent = { msg: pick(r, opts), kind: 'text', why: 'chip label sent as text (dictated)' };
    else if (roll < 0.58 && hostile) { const o = pick(r, opts); sent = { msg: `${o}; ${o}`, kind: 'chip', why: 'stacked answer' }; }
    else if (roll < 0.66 && hostile && seenOptions.length) sent = { msg: pick(r, seenOptions), kind: 'chip', why: 'stale chip from an earlier question' };
    else if (roll < 0.70 && hostile) sent = { msg: uploadNotice.parsed('foto.jpg', 'A paved courtyard.'), kind: 'upload', why: 'upload' };
    else if (roll < 0.78) sent = { msg: ENTRY[lang], kind: 'text', why: 'return' };
    else if (roll < 0.82 && hostile) sent = { msg: SITE_MAP, kind: 'map', why: 'a map result nobody asked for' };
    else if (roll < 0.86 && hostile) sent = { msg: 'Continuar da Fase 4', kind: 'text', why: 'resume chip' };
    else sent = { msg: pick(r, FREE) || '...', kind: 'text', why: 'free text' };
  }

  const final = await stateOf(cboId);
  if (actor === 'polite' && String(final.sections?.intervention_type?.fields?._e4_closed?.value ?? '') !== 'yes') v('I9 the polite actor never closed the encontro', transcript.slice(-2).join(' / '));
  // I10 — the page prints, whatever state the walk left.
  const page = await fetch(`${BASE}/api/cbo/${cboId}/prenote`, { headers: HEADERS });
  const html = await page.text();
  if (page.status >= 400) v('I10 the pre-note did not print', `status ${page.status}`);
  else if (JUNK.test(html.replace(/<style[\s\S]*?<\/style>/, ''))) v('I10 junk on the printed pre-note', (JUNK.exec(html) ?? [''])[0]);
  return out;
}

(async () => {
  let lastErr: any = null;
  for (let i = 0; i < 8; i++) {
    try { const p: any = await fetch(`${BASE}/__test/ping`, { headers: HEADERS }).then(r => r.json()); if (!p.fakeModel) throw new Error('the server is not running the fake model'); lastErr = null; break; }
    catch (e) { lastErr = e; await new Promise(r => setTimeout(r, 1500)); }
  }
  if (lastErr) { console.error(`e4-fuzz needs the e2e dev server at ${BASE}: ${lastErr?.message ?? lastErr}`); process.exit(2); }

  const all: Violation[] = [];
  const actors: Actor[] = ['polite', 'random', 'hostile', 'hostile'];
  const names = Object.keys(STATES);
  for (let i = 0; i < WALKS; i++) {
    const seed = SEED0 * 100_000 + i;
    all.push(...await walk(actors[i % actors.length], seed, i % 9 === 0 ? 'en' : 'pt', names[Math.floor(i / actors.length) % names.length]));
  }
  console.log('═'.repeat(78)); console.log(`ENCONTRO 4 · fuzz over HTTP — ${WALKS} walks · seed ${SEED0} · ${BASE}`); console.log('═'.repeat(78));
  const bySig = new Map<string, Violation[]>();
  for (const x of all) bySig.set(x.sig, [...(bySig.get(x.sig) ?? []), x]);
  if (recovered.size) { console.log(`\nℹ ${recovered.size} answer(s) recovered by resuming from the record`); for (const d of Array.from(recovered).slice(0, 8)) console.log(`     · ${d}`); }
  if (!bySig.size) { console.log('\n✅ no invariant violated'); process.exit(0); }
  for (const [sig, xs] of Array.from(bySig.entries()).sort((a, b) => b[1].length - a[1].length)) {
    const details = new Map<string, number>(); for (const x of xs) details.set(x.detail, (details.get(x.detail) ?? 0) + 1);
    console.log(`\n✗ ${sig}   — ${xs.length} walk(s)`);
    for (const [d, n] of Array.from(details.entries()).sort((a, b) => b[1] - a[1]).slice(0, 6)) console.log(`     ${String(n).padStart(3)}× ${d}`);
    const best = xs.slice().sort((a, b) => a.turns - b.turns)[0];
    console.log(`    shortest repro: ${best.walk} · turn ${best.turns}`);
    for (const line of (VERBOSE ? best.transcript : best.transcript.slice(-5))) console.log(`      → ${line}`);
  }
  console.log(`\n${bySig.size} kind(s) of violation across ${WALKS} walks`);
  process.exit(1);
})();

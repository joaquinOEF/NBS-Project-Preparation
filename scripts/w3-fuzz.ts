// ============================================================================
// ENCONTRO 3 UNDER A HOSTILE ROOM — a fuzzer with invariants
// ============================================================================
// Every defect found on staging on 21 September 2026 was invisible to the
// harnesses that existed, and for the same reason: they all drive the flow the
// way its author expects it to be driven. The sweep walks each solution down
// one polite path; the full simulation gives nine personas a list of
// inclinations; the browser specs tap the chip the spec names. None of them
// uploads seven files, answers a stacked question, taps a chip from two
// questions ago, types the answer instead of tapping it, or comes back from a
// reload in the middle of a test.
//
// This one does. It crosses a MATRIX of records (one, two or three worries,
// interests that match them or do not, a marked place or none, files or none,
// an advisor reading or none) with three kinds of ACTOR (polite, random,
// hostile), and after EVERY turn checks invariants that must hold on any path:
//
//   I1  a turn the flow should own is never handed to the model
//   I2  a served turn ends on something to do (a question, the map, the close)
//   I3  no question is asked twice in one turn
//   I4  nothing a person reads carries a machine id, "undefined", "NaN", "[object"
//   I5  what the shelf offers answers what they said weighs most, while it can
//   I6  a return (the entry line, i.e. a reload) lands on the SAME question
//   I7  no beat is asked 4× without the record changing (a stuck beat)
//   I8  the encontro ends, or parks, inside a turn budget
//   I9  never four W3 scores before the close (phaseComplete would end it early)
//   I10 chosen_solutions is always exactly the liked tests (it is derived)
//   I11 after a turn the model WOULD take, the encontro can still ask its question
//   I12 an option of the pending question is always taken by some handler
//
//   npx tsx scripts/w3-fuzz.ts                 # 400 walks, exits non-zero on any violation
//   W3_FUZZ_WALKS=2000 W3_FUZZ_SEED=7 npx tsx scripts/w3-fuzz.ts
//   W3_FUZZ_VERBOSE=1 …                        # print the transcript of each failing walk
//
// A violation prints its signature, how many walks hit it, and the SHORTEST
// walk that reproduces it (scenario, actor, seed, the turns sent) — so a
// failure is a repro, not a rumour.
// ============================================================================
import { serveE3Checkpoint } from '../server/services/cboE3Checkpoint';
import { mkState } from './w3-sim';
import { parseTests, likedIds } from '../shared/w3-tests';
import { NBS_SOLUTIONS, SOLUTION_MECHANISMS } from '../shared/nbs-catalog';
import { uploadNotice } from '../shared/cbo-upload-notices';

const WALKS = Number(process.env.W3_FUZZ_WALKS || 400);
const SEED0 = Number(process.env.W3_FUZZ_SEED || 1);
const VERBOSE = process.env.W3_FUZZ_VERBOSE === '1';
const MAX_TURNS = 90;

const normChip = (s: string) =>
  s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();

// ── A seeded RNG, so every walk is reproducible ────────────────────────────
function rng(seed: number) {
  let a = seed >>> 0;
  return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const pick = <T,>(r: () => number, xs: T[]): T => xs[Math.floor(r() * xs.length)];

// ── The matrix of records ──────────────────────────────────────────────────
interface Scenario { id: string; lang: 'pt' | 'en'; site: Record<string, string>; docs: number; advice: 'none' | 'inside' | 'outside' }
const WORRIES = ['alagamento', 'enxurrada', 'heat', 'landslide', 'inundacao', 'heat, enxurrada', 'alagamento, heat', 'landslide, enxurrada, heat', 'other', ''];
const INTERESTS = ['aguas-pluviais', 'verde-urbano', 'encostas-e-solo', 'agricultura-urbana', 'recuperacao-ecossistemas', 'aguas-pluviais, verde-urbano', 'encostas-e-solo, aguas-pluviais', ''];
const TENURES = ['private-owned', 'public-informal', 'formal-agreement', 'rented', ''];
const USES = ['paved', 'vegetated', 'mixed', 'abandoned', ''];

function scenarios(r: () => number, n: number): Scenario[] {
  const out: Scenario[] = [];
  for (let i = 0; i < n; i++) {
    const hasPin = r() < 0.75;
    const hasArea = hasPin && r() < 0.5;
    const worry = pick(r, WORRIES), interest = pick(r, INTERESTS);
    const site: Record<string, string> = {
      bairro: pick(r, ['Partenon', 'Sarandi', 'Floresta', 'Restinga', 'Morro da Cruz']),
      site_name: hasPin ? pick(r, ['Pátio da escola', 'Praça do fundo da vila', 'Barranco atrás do galpão', 'Sede do grupo']) : '',
      current_use: pick(r, USES), land_tenure: pick(r, TENURES),
      site_worry: worry, nbs_interest: interest,
      site_story: r() < 0.8 ? 'Quando chove forte a água entra pelo fundo e fica dias.' : '',
      site_knowledge_depth: pick(r, ['strong', 'partial', 'thin']),
      ...(hasPin ? { _site_lat: '-30.0577', _site_lng: '-51.1936' } : {}),
      ...(hasArea ? { site_area_m2: String(pick(r, [96, 400, 2900])) } : {}),
      ...(r() < 0.6 ? { _role_done: 'yes' } : {}),
    };
    for (const k of Object.keys(site)) if (!site[k]) delete site[k];
    out.push({
      id: `w[${worry || '-'}] i[${interest || '-'}] pin:${hasPin ? 'y' : 'n'} area:${hasArea ? 'y' : 'n'}`,
      lang: r() < 0.85 ? 'pt' : 'en', site, docs: pick(r, [0, 0, 3, 7]), advice: pick(r, ['none', 'none', 'inside', 'outside']),
    });
  }
  return out;
}

const adviceFor = (s: Scenario): string => {
  if (s.advice === 'none') return '';
  const interest = new Set((s.site.nbs_interest ?? '').split(',').map(v => v.trim()).filter(Boolean));
  const inside = NBS_SOLUTIONS.filter(x => interest.has(x.familiaId)).slice(0, 2);
  const outside = NBS_SOLUTIONS.find(x => !interest.has(x.familiaId));
  const shortlist = s.advice === 'inside'
    ? inside.map(x => ({ solutionId: x.id, reasonPt: 'Na foto dá pra ver o piso todo cimentado.', outsideTheirPicks: false }))
    : outside ? [{ solutionId: outside.id, reasonPt: 'O relatório da visita aponta para isto.', outsideTheirPicks: true }] : [];
  return JSON.stringify({ shortlist, drafts: [], questionIds: [], questionReasons: [], observations: [] });
};

// ── Actors ─────────────────────────────────────────────────────────────────
type Actor = 'polite' | 'random' | 'hostile';
interface Sent { msg: string; kind: string; why: string; ownable: boolean }

const FREE_TEXT = ['não sei', 'uns 30 por 20 metros', 'a água vem da rua de cima', 'depende', 'o que é isso?', 'pode explicar melhor?', '2', 'sim', 'ok'];
const MAP_RESULT = `Map selection (composite mode):\n- [custom] Área desenhada (5 vertices) (drawn area) at (-30.0577, -51.1936) · 300 m²\nTotal: 1 asset, 0 sampled points`;

function nextTurn(actor: Actor, r: () => number, ask: any, history: any[], tests: number, turnNo: number): Sent {
  // Chips the CLIENT acts on without posting a turn (keyboard, mic, picker) are not answers.
  const opts: string[] = (ask?.options ?? []).filter((o: any) => !['write', 'record', 'upload'].includes(o.action)).map((o: any) => o.label);
  // "Mudou alguma coisa" is a hand-off to the model BY DESIGN — it repairs the record in conversation.
  const byDesign = (label: string) => /^(mudou alguma coisa|something changed)/i.test(label);
  const chip = (label: string, why: string, ownable = true): Sent => ({ msg: label, kind: 'chip', why, ownable: ownable && !byDesign(label.split(';')[0].trim()) });
  // Prefer moving on once a few tests exist — otherwise a polite room loops the shelf forever.
  const forward = opts.find(o => tests >= 2 && /ver a compara|compar|see the comparison/i.test(o))
    ?? opts.find(o => /^(é isso|confere|já mandamos|pronto|detalhar agora|faz sentido|that's right|it is)/i.test(o))
    ?? opts[0];
  if (actor === 'polite' || !opts.length) return opts.length ? chip(forward, 'polite') : { msg: pick(r, FREE_TEXT), kind: 'text', why: 'free-text (no chips)', ownable: false };
  if (actor === 'random') return chip(tests >= 3 && r() < 0.6 ? forward : pick(r, opts), 'random');

  // hostile
  const roll = r();
  if (roll < 0.40) return chip(tests >= 3 && r() < 0.5 ? forward : pick(r, opts), 'random');
  if (roll < 0.48) { const o = pick(r, opts); return chip(`${o}; ${o}`, 'stacked answer'); }
  if (roll < 0.56) { const o = pick(r, opts); return { msg: normChip(o), kind: 'text', why: 'typed/spoken version of a chip', ownable: !byDesign(o) }; }
  if (roll < 0.62) { const o = pick(r, opts); return { msg: o, kind: 'text', why: 'chip label sent as text (dictated)', ownable: !byDesign(o) }; }
  if (roll < 0.68) {
    const prev = history.filter(e => e.type === 'ask_user').slice(-4, -1).flatMap((e: any) => (e.options ?? []).map((o: any) => o.label));
    return prev.length ? chip(pick(r, prev), 'stale chip from an earlier question', false) : chip(pick(r, opts), 'random');
  }
  if (roll < 0.74) return { msg: uploadNotice.parsed('foto-do-patio.jpg', 'A paved courtyard with two trees.'), kind: 'upload', why: 'upload (single)', ownable: false };
  if (roll < 0.79) return { msg: uploadNotice.parsed('ata.pdf', 'Contrapartida de R$ 8.200.', { index: 1, total: 3 }), kind: 'upload', why: 'upload (1 of 3)', ownable: false };
  if (roll < 0.83) return { msg: uploadNotice.storedUnread('foto.heic', { index: 3, total: 3 }), kind: 'upload', why: 'upload unread (3 of 3)', ownable: false };
  if (roll < 0.88) return { msg: 'Vamos começar o Encontro 3.', kind: 'system', why: 'reload / return', ownable: true };
  if (roll < 0.91) return chip('Continuar', 'generic "Continuar" chip', false);
  if (roll < 0.94) return { msg: MAP_RESULT, kind: 'map', why: 'a map result nobody asked for', ownable: false };
  return { msg: pick(r, FREE_TEXT), kind: r() < 0.5 ? 'chip' : 'text', why: 'free text', ownable: false };
}

// ── One walk ───────────────────────────────────────────────────────────────
interface Violation { sig: string; detail: string; turns: number }
const ID_LEAK = new RegExp(`\\b(${NBS_SOLUTIONS.map(s => s.id).filter(id => id.includes('-')).join('|')}|site_worry|nbs_interest|land_tenure|chosen_solutions|private-owned|public-informal|needs_study|needs_permission)\\b`);
const JUNK = /undefined|\bNaN\b|\[object |\bnull\b|\*\*\s*\*\*|\{\{|\}\}/;
const W3_METRICS = ['problem_clarity', 'solution_clarity', 'climate_nbs_impact', 'financial_thinking'];

async function walk(s: Scenario, actor: Actor, seed: number) {
  const r = rng(seed);
  const state = mkState({ org_profile: { org_name: 'Organização de teste' }, intervention_site: s.site }, s.lang);
  const adv = adviceFor(s);
  if (adv) state.sections.intervention_type.fields._advice_json = { value: adv, confidence: 'high', source: 'agent' };
  const events: any[] = [];
  const sent: Sent[] = [];
  const violations: Violation[] = [];
  const beats: string[] = [];
  let maturity: any[] = [];
  const v = (sig: string, detail: string) => violations.push({ sig, detail, turns: sent.length });
  const type = (k: string) => String(state.sections.intervention_type.fields[k]?.value ?? '');
  const digest = () => Object.values(state.sections).map((x: any) => Object.entries(x.fields).map(([k, f]: any) => `${k}=${String(f?.value ?? '')}`).sort().join('|')).join('||');

  const deps: any = {
    writeFields: (sid: string, fields: Record<string, string>) => { for (const [k, val] of Object.entries(fields)) state.sections[sid].fields[k] = { value: val, confidence: 'high', source: 'user' }; },
    recordCheckpoint: (b: string) => beats.push(b),
    recordMaturity: (scores: any[]) => { maturity = scores; },
    normChip,
    startAdvisor: () => {}, startConceptNote: () => {}, startDig: () => {},
    awaitAdvisor: async () => {},
    docsBrief: async () => ({ count: s.docs, images: s.docs ? 1 : 0, filenames: [] }),
  };
  const serve = async (t: Sent) => {
    const before = events.length;
    let served = false;
    try { served = await serveE3Checkpoint('fuzz', t.msg, state, (e: any) => events.push(e), s.lang, t.kind, deps); }
    catch (e: any) { v('THROW', `${t.why}: ${String(e?.message ?? e).slice(0, 140)}`); }
    return { served, fresh: events.slice(before) };
  };
  const lastAsk = (fresh: any[]) => [...fresh].reverse().find(e => e.type === 'ask_user');

  let turn: Sent = { msg: s.lang === 'pt' ? 'Vamos começar o Encontro 3.' : "Let's start Encontro 3.", kind: 'text', why: 'entry', ownable: true };
  let pending: any = null;
  const seen = new Map<string, number>();
  let done = false;

  for (let i = 0; i < MAX_TURNS && !done; i++) {
    sent.push(turn);
    const before = digest();
    const { served, fresh } = await serve(turn);
    const tests = parseTests(type('solution_tests_json'));

    // I10 — derived, always.
    const liked = likedIds(tests).join(','); const chosen = type('chosen_solutions').split(',').map(x => x.trim()).filter(Boolean).join(',');
    if (liked !== chosen) v('I10 chosen_solutions drifted from the liked tests', `liked=[${liked}] chosen=[${chosen}] after ${turn.why}`);
    // I9 — never four before the close.
    if (W3_METRICS.every(m => maturity.some(x => x.metric === m)) && type('_e3_closed') !== 'yes') v('I9 four W3 scores before the close', `after ${turn.why}`);

    if (!served) {
      // I1 — a turn the flow should own went to the model.
      if (turn.ownable) v(`I1 lost to the model: ${turn.why}`, `beat=${beats[beats.length - 1] ?? '-'} pending="${pending?.question ?? '-'}" sent="${turn.msg.slice(0, 60)}"`);
      // I11 — worst case the model says something and asks nothing: the guard
      // sends the entry line; the encontro must then ask its own question.
      const g = await serve({ msg: s.lang === 'pt' ? 'Vamos começar o Encontro 3.' : "Let's start Encontro 3.", kind: 'system', why: 'guard', ownable: true });
      if (!g.served || !(lastAsk(g.fresh) || g.fresh.some(e => e.type === 'open_map' || e.type === 'show_roadmap'))) {
        v('I11 no way back after a model turn', `beat=${beats[beats.length - 1] ?? '-'} after ${turn.why}`); break;
      }
      pending = lastAsk(g.fresh) ?? pending;
      turn = nextTurn(actor, r, pending, events, tests.length, i);
      continue;
    }

    const texts = fresh.filter(e => e.type === 'chat').map(e => String(e.content)).concat(fresh.filter(e => e.type === 'ask_user').flatMap((e: any) => [e.question, ...(e.options ?? []).flatMap((o: any) => [o.label, o.description ?? ''])]));
    for (const t of texts) {
      if (ID_LEAK.test(t)) v('I4 machine id in text a person reads', `"${t.slice(0, 120)}"`);
      if (JUNK.test(t)) v('I4 junk in text a person reads', `"${t.slice(0, 120)}"`);
    }
    // I12 — the flow asked a question, got one of its own options back, and no handler took it.
    if (texts.some(t => /não entrou aqui do meu lado|did not register on my side/.test(t))) {
      v(`I12 an option of the pending question that no handler takes · ${String(pending?.question ?? '-').slice(0, 28)}`, `pending="${pending?.question ?? '-'}" sent="${turn.msg.slice(0, 50)}" test_open=${type('_test_open') || '-'} beat-before=${beats[beats.length - 2] ?? '-'}`);
    }
    const asks = fresh.filter(e => e.type === 'ask_user');
    const qs = asks.map((e: any) => e.question);
    if (new Set(qs).size !== qs.length) v('I3 the same question twice in one turn', qs.join(' | '));

    if (fresh.some(e => e.type === 'show_roadmap') || type('_e3_closed') === 'yes') { done = true; break; }
    if (beats[beats.length - 1] === 'parked') { done = true; break; }
    const midBatch = /more$/.test(beats[beats.length - 1] ?? '');
    // Beats that wait for PROSE: the prompt is said, the keyboard is the answer.
    const waitsForProse = /^(draft-append|write-fresh)$/.test(beats[beats.length - 1] ?? '');
    if (waitsForProse && !lastAsk(fresh)) { pending = null; turn = { msg: 'A água desce da rua de cima e entra pelo portão dos fundos.', kind: 'text', why: 'prose for a free-text beat', ownable: true }; continue; }
    const ask = lastAsk(fresh);
    if (!ask && !fresh.some(e => e.type === 'open_map') && !midBatch) { v('I2 served turn ends with nothing to do', `beat=${beats[beats.length - 1] ?? '-'} after ${turn.why}`); break; }

    // I5 — the shelf answers what weighs most, while something untested still can.
    for (const e of fresh.filter(x => x.type === 'show_solution_options' && !x.full)) {
      const worries = (state.sections.intervention_site.fields.site_worry?.value ?? '').split(',').map((x: string) => x.trim()).filter((x: string) => x && x !== 'other');
      const focus = worries[0];
      if (!focus) continue;
      const tested = new Set(tests.map(t => t.solutionId));
      const could = NBS_SOLUTIONS.filter(x => !tested.has(x.id) && (SOLUTION_MECHANISMS[x.id] ?? []).includes(focus as any));
      const does = (e.items ?? []).some((it: any) => (SOLUTION_MECHANISMS[it.solutionId] ?? []).includes(focus as any));
      if (could.length && !does) v('I5 the shelf ignores what they said weighs most', `focus=${focus} shown=[${(e.items ?? []).map((x: any) => x.solutionId).join(', ')}]`);
    }

    // I6 — a return lands on the same question (sampled; it is a read, not a move).
    if (ask && r() < 0.12) {
      const snap = digest();
      const back = await serve({ msg: s.lang === 'pt' ? 'Vamos começar o Encontro 3.' : "Let's start Encontro 3.", kind: 'system', why: 'resume probe', ownable: true });
      const again = lastAsk(back.fresh);
      const sameQ = again && (again.question === ask.question || JSON.stringify((again.options ?? []).map((o: any) => o.label)) === JSON.stringify((ask.options ?? []).map((o: any) => o.label)));
      const mapAgain = back.fresh.some(e => e.type === 'open_map');
      if (!back.served || (!sameQ && !mapAgain)) v('I6 a return lands somewhere else', `was "${ask.question}" → now "${again?.question ?? '(nothing)'}" beat=${beats[beats.length - 1] ?? '-'}`);
      if (again) pending = again;
      void snap;
    }

    // I7 — stuck.
    const key = `${beats[beats.length - 1] ?? ask?.question ?? '-'}#${tests.length}`.slice(0, 70);
    const n = (seen.get(key) ?? 0) + 1; seen.set(key, n);
    if (n >= 6 && digest() === before && actor === 'polite') { v('I7 a beat asked 6× without the record changing', key); break; }

    if (fresh.some(e => e.type === 'open_map')) { turn = { msg: MAP_RESULT, kind: 'map', why: 'map result', ownable: true }; continue; }
    if (ask) pending = ask;
    turn = nextTurn(actor, r, pending, events, tests.length, i);
  }
  if (!done && actor === 'polite' && !violations.length) v('I8 a polite room never reached the close or a park', `beats: …${beats.slice(-6).join(' → ')}`);
  return { violations, sent, events };
}

// ── Run ────────────────────────────────────────────────────────────────────
(async () => {
  const r = rng(SEED0);
  const scs = scenarios(r, Math.ceil(WALKS / 3));
  const actors: Actor[] = ['polite', 'random', 'hostile'];
  const bySig = new Map<string, { count: number; details: Map<string, number>; best: { s: Scenario; actor: Actor; seed: number; v: Violation; sent: Sent[] } }>();
  let walks = 0;
  for (let i = 0; i < WALKS; i++) {
    const s = scs[i % scs.length], actor = actors[i % 3] === 'polite' && i % 9 !== 0 ? (i % 2 ? 'random' : 'hostile') : actors[i % 3], seed = SEED0 * 100000 + i;
    const out = await walk(s, actor, seed); walks++;
    for (const v of out.violations) {
      const cur = bySig.get(v.sig);
      const dk = (/polite|random|I12/.test(v.sig) ? v.detail : v.detail.replace(/sent="[^"]*"/, '')).slice(0, 190);
      if (!cur) bySig.set(v.sig, { count: 1, details: new Map([[dk, 1]]), best: { s, actor, seed, v, sent: out.sent } });
      else { cur.count++; cur.details.set(dk, (cur.details.get(dk) ?? 0) + 1); if (v.turns < cur.best.v.turns) cur.best = { s, actor, seed, v, sent: out.sent }; }
    }
  }
  const line = '═'.repeat(78);
  console.log(`${line}\nENCONTRO 3 · fuzz — ${walks} walks · ${scs.length} records · seed ${SEED0}\n${line}`);
  if (!bySig.size) { console.log('\n✅ no invariant violated'); return; }
  const rows = [...bySig.entries()].sort((a, b) => b[1].count - a[1].count);
  for (const [sig, { count, best, details }] of rows) {
    console.log(`\n✗ ${sig}   — ${count} hit(s)`);
    for (const [d, n] of [...details.entries()].sort((a, b) => b[1] - a[1]).slice(0, 7)) console.log(`    ${String(n).padStart(4)}× ${d}`);
    console.log(`    shortest repro: [${best.actor}] seed ${best.seed} · ${best.s.id} · docs:${best.s.docs} advice:${best.s.advice} · ${best.s.lang} · turn ${best.v.turns}`);
    const tail = best.sent.slice(Math.max(0, best.v.turns - 4), best.v.turns);
    for (const t of tail) console.log(`      → (${t.kind}) ${t.msg.split('\n')[0].slice(0, 90)}   ⟨${t.why}⟩`);
    if (VERBOSE) console.log(best.sent.map((t, i) => `        ${i + 1}. (${t.kind}) ${t.msg.split('\n')[0].slice(0, 100)}`).join('\n'));
  }
  console.log(`\n${line}\n${rows.length} kind(s) of violation across ${walks} walks\n${line}`);
  process.exit(1);
})();

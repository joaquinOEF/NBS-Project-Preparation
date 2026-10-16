// ============================================================================
// THE SIMULATED ENCONTRO 3, LIVE — measure the player, read what it wrote
// ============================================================================
// Packs some of w3-fullsim's organisations (as Encontro 2 left them) into a
// cohort file, imports it through the real admin route, simulates Encontro 3
// for all of them through the real chat route, and prints how each one went:
// turns, wall time, the slowest player call, and the transcript.
//
// Needs a server running WITHOUT the fake model and WITH test routes (for the
// admin login), against a scratch database:
//
//   createdb nbs_sim && DATABASE_URL=postgresql://localhost:5432/nbs_sim npm run db:push
//   set -a; . ./.env; set +a
//   DATABASE_URL=postgresql://localhost:5432/nbs_sim ENABLE_TEST_ROUTES=1 PORT=5091 npm run dev > /tmp/sim-server.log 2>&1 &
//   E3_SIM_BASE=http://localhost:5091 npx tsx scripts/e3-sim-live.ts [persona-id …]
//
// The player's per-call timings are in the server log (`[e3-sim] player NNNms`)
// — that is the number shared/model-pass-budgets.ts → e3SimPlayer records.
// ============================================================================
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { PERSONAS } from './w3-fullsim';
import { buildSnapshot, trimToEndOfE2 } from '../shared/state-snapshot';
import { buildBundle } from '../shared/cohort-bundle';

const BASE = process.env.E3_SIM_BASE || 'http://localhost:5091';
const OUT = process.env.E3_SIM_OUT || fs.mkdtempSync(path.join(os.tmpdir(), 'e3-sim-'));
const wanted = process.argv.slice(2);

async function main() {
  const personas = PERSONAS.filter(p => (wanted.length ? wanted.includes(p.id) : ['humaita-rede', 'santa-teresa', 'escola-partenon'].includes(p.id)));
  const bundle = buildBundle({
    cohortName: 'Simulação ao vivo',
    settings: { workshops: [], language: 'pt' },
    members: personas.map(p => {
      const state = structuredClone(p.state);
      state.sections.intervention_site.fields._role_done = { value: 'yes', confidence: 'high', source: 'user' };
      return {
        snapshot: trimToEndOfE2(buildSnapshot({ state, orgName: p.name, neighborhood: state.sections.intervention_site.fields.bairro?.value ?? null })),
        role: 'priority', path: 'has-idea', inspirationPicks: [], unlockedPhases: [1, 2], excludeFromPortfolio: false, site: null,
      };
    }),
  });

  // An admin, logged in by the test route — the cookie rides on every call below.
  const login = await fetch(`${BASE}/__test/coordinator`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({}) });
  if (!login.ok) throw new Error(`login → ${login.status} (is ENABLE_TEST_ROUTES=1 set on the server?)`);
  const cookie = (login.headers.get('set-cookie') ?? '').split(';')[0];
  const H = { 'content-type': 'application/json', cookie };

  const im = await fetch(`${BASE}/api/cohort/import`, { method: 'POST', headers: H, body: JSON.stringify({ bundle }) });
  if (!im.ok) throw new Error(`import → ${im.status} ${await im.text()}`);
  const { cohort } = await im.json() as any;
  console.log(`cohort "${cohort.name}" (${cohort.coordinatorSlug}) — ${personas.length} organisations`);

  const started = Date.now();
  const q = await (await fetch(`${BASE}/api/cohort/${cohort.coordinatorSlug}/simulate-e3`, { method: 'POST', headers: H, body: '{}' })).json() as any;
  console.log(`queued ${q.queued}`);

  let runs: any[] = [];
  for (;;) {
    await new Promise(r => setTimeout(r, 5000));
    const s = await (await fetch(`${BASE}/api/cohort/${cohort.coordinatorSlug}/simulations`, { headers: H })).json() as any;
    runs = s.runs;
    const line = runs.map((r: any) => `${r.orgName.slice(0, 22)}: ${r.status} t${r.turns}`).join(' · ');
    console.log(`${Math.round((Date.now() - started) / 1000)}s  ${line}`);
    if (runs.length && runs.every((r: any) => r.status === 'done' || r.status === 'failed')) break;
  }

  const members = (await (await fetch(`${BASE}/api/cohort/${cohort.coordinatorSlug}`, { headers: H })).json() as any).members;
  for (const r of runs) {
    const m = members.find((x: any) => x.id === r.memberId);
    const msgs = await (await fetch(`${BASE}/api/cbo/${m.cboStateId}/messages`)).json() as any[];
    const st = (await (await fetch(`${BASE}/api/cbo/${m.cboStateId}`)).json() as any).state;
    const tests = JSON.parse(st.sections.intervention_type.fields.solution_tests_json?.value ?? '[]');
    const secs = r.endedAt ? Math.round((Date.parse(r.endedAt) - Date.parse(r.startedAt)) / 1000) : null;
    console.log(`\n${r.orgName}: ${r.status} in ${r.turns} turns, ${secs}s — tested ${tests.map((t: any) => `${t.solutionId} (${t.reaction})`).join(', ') || 'nothing'}${r.error ? ` — ${r.error}` : ''}`);
    const transcript = msgs
      .filter(x => x.messageType === 'content' || x.messageType === 'composer')
      .map(x => x.messageType === 'composer'
        ? (() => { try { const c = JSON.parse(x.content); return c.question ? `   ❓ ${c.question} [${(c.options ?? []).map((o: any) => o.label).join(' | ')}]` : ''; } catch { return ''; } })()
        : `${x.role === 'user' ? '👤' : '🌱'} ${String(x.content).split('\n[LANGUAGE:')[0]}`)
      .filter(Boolean).join('\n\n');
    fs.writeFileSync(path.join(OUT, `${m.memberSlug}.md`), transcript);
  }
  console.log(`\ntranscripts: ${OUT}`);
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });

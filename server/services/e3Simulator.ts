// ============================================================================
// SIMULATED ENCONTRO 3 — a real record walked through the real workshop
// (docs/test-orgs.md → "Simulating Encontro 3")
// ============================================================================
// Staging only. A cohort copied from production (shared/cohort-bundle.ts) has
// organisations that stopped at the end of Encontro 2. The pre-note and the
// pre-portfolio read what Encontro 3 produced, so testing them on those
// organisations needs an Encontro 3 they never had.
//
// This walks it for them, through the SAME path a phone takes: every turn is a
// POST to this server's own /api/cbo/:id/chat, so the turn queue, the language
// directive, the checkpoints, the advisor, the dig and the document reader all
// run exactly as they do for a person. Nothing is written behind the engine's
// back.
//
// What answers is a PLAYER: a model that reads the organisation's own record
// (its fields and the end of its transcript) and answers the question on screen
// as that organisation would — a chip it was actually offered, or a sentence
// in the first person. With no key (or the fake model, in the e2e suite) a
// fixed policy answers instead, so the path is testable without a provider.
//
// ⚠️ A simulated session is marked (`metadata.simulated.e3`) and the roster
// says so. What it wrote are NOT the organisation's words, and nothing printed
// from it should be read as if they were.
// ============================================================================

import { z } from 'zod';
import { db } from '../db';
import { eq } from 'drizzle-orm';
import { cohortMembers } from '@shared/cohort-schema';
import { encontroClosed, type CboState } from '@shared/cbo-schema';
import { parseTests } from '@shared/w3-tests';
import { createStructured, structuredProvider } from './structuredModel';
import { withBudget } from './passBudget';
import { isReplitDeployment } from './runtimeEnv';
import { isFakeModelEnabled } from './fakeCboModel';
import { getCboState, setCboState, getCboMessages, loadCboFromDb, addCboMessage, debouncedPersist } from './cboAgent';

/** Never on a deployment — production organisations are never simulated. `COUGAR_SIMULATION=off` turns it off anywhere. */
export function simulationEnabled(): boolean {
  return !isReplitDeployment() && process.env.COUGAR_SIMULATION !== 'off';
}

const PLAYER_MODEL = process.env.E3_SIM_MODEL || 'claude-sonnet-5-5';
const MAX_TURNS = 60;
const ENTRY: Record<3 | 4, { pt: string; en: string }> = {
  3: { pt: 'Vamos começar o Encontro 3.', en: "Let's start Encontro 3." },
  4: { pt: 'Vamos começar o Encontro 4.', en: "Let's start Encontro 4." },
};
/** Two solutions tried, then the comparison — what a real room does in an afternoon. */
const TESTS_WANTED = 2;

/**
 * What a walk would do for this organisation: the encontros still missing up
 * to Encontro 4 — the pre-note the pre-portfolio is built from. Encontro 2 is
 * never simulated: it is where they mark their own place, and a model drawing
 * someone's site would invent the one thing the rest of the flow stands on.
 */
export type Eligibility =
  | { ok: true; encontros: Array<3 | 4> }
  | { ok: false; reason: 'no-session' | 'e2-open' | 'e4-closed' | 'project' };

export function simEligibility(state: CboState | null | undefined): Eligibility {
  if (!state) return { ok: false, reason: 'no-session' };
  if (state.metadata?.project) return { ok: false, reason: 'project' };
  const phase = state.phase ?? 1;
  if (phase < 2 || (phase === 2 && !encontroClosed(state, 2))) return { ok: false, reason: 'e2-open' };
  if (phase >= 4 && e4Closed(state)) return { ok: false, reason: 'e4-closed' };
  const e3done = phase >= 4 || encontroClosed(state, 3);
  return { ok: true, encontros: e3done ? [4] : [3, 4] };
}

/**
 * ⚠️ Encontro 4's OWN marker. `encontroClosed(state, 4)` falls back to "every
 * phase-4 section has a field", which an older record meets without E4 ever
 * opening — two organisations "closed" Encontro 4 in one turn that way.
 */
function e4Closed(state: CboState): boolean {
  const f = (state.sections as any)?.intervention_type?.fields ?? {};
  return String(f._e4_closed?.value ?? '') === 'yes' && String(f._e4_reopened?.value ?? '') !== 'yes';
}
function closedNow(state: CboState, n: 3 | 4): boolean {
  return n === 4 ? (state.phase ?? 0) >= 4 && e4Closed(state) : encontroClosed(state, 3);
}

/** Which encontros a model walked for this organisation (staging). */
export function simulatedEncontros(state: CboState | null | undefined): Array<3 | 4> {
  const sim = (state?.metadata as any)?.simulated ?? {};
  return ([3, 4] as const).filter(n => !!sim[`e${n}`]);
}

// ── Progress, in memory — a run lives as long as this process ───────────────

export interface SimRun {
  memberId: string;
  orgName: string;
  status: 'queued' | 'running' | 'done' | 'failed';
  /** The encontro being walked now. */
  encontro?: 3 | 4;
  turns: number;
  /** The last thing the workshop asked, for the roster's progress line. */
  step: string;
  error?: string;
  startedAt: string;
  endedAt?: string;
}
const runs = new Map<string, SimRun>();
const queue: Array<() => Promise<void>> = [];
let active = 0;
const PARALLEL = Number(process.env.E3_SIM_PARALLEL || 3);

export function simulationRuns(memberIds: string[]): SimRun[] {
  return memberIds.map(id => runs.get(id)).filter((r): r is SimRun => !!r);
}

function pump() {
  while (active < PARALLEL && queue.length) {
    const job = queue.shift()!;
    active++;
    void job().finally(() => { active--; pump(); });
  }
}

/** Queue one organisation. Returns false when it is already queued or running. */
export function enqueueSimulation(member: { id: string; orgName: string; cboStateId: string }, baseUrl: string): boolean {
  const cur = runs.get(member.id);
  if (cur && (cur.status === 'queued' || cur.status === 'running')) return false;
  const run: SimRun = { memberId: member.id, orgName: member.orgName, status: 'queued', turns: 0, step: '', startedAt: new Date().toISOString() };
  runs.set(member.id, run);
  queue.push(async () => {
    run.status = 'running';
    try {
      await simulate(member.id, member.cboStateId, baseUrl, run);
      run.status = 'done';
    } catch (e: any) {
      run.status = 'failed';
      run.error = String(e?.message ?? e).slice(0, 300);
      console.error(`[e3-sim] ${member.orgName} failed:`, run.error);
    } finally {
      run.endedAt = new Date().toISOString();
    }
  });
  pump();
  return true;
}

// ── The walk ────────────────────────────────────────────────────────────────

async function loadState(cboId: string): Promise<CboState | null> {
  const live = getCboState(cboId);
  if (live) return live;
  const persisted = await loadCboFromDb(cboId);
  if (!persisted) return null;
  setCboState(cboId, persisted.state);
  if (getCboMessages(cboId).length === 0) for (const m of persisted.messages) addCboMessage(cboId, m);
  return persisted.state;
}

async function chat(baseUrl: string, cboId: string, body: Record<string, unknown>): Promise<any[]> {
  for (let attempt = 0; attempt < 20; attempt++) {
    const r = await fetch(`${baseUrl}/api/cbo/${cboId}/chat`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
    });
    if (r.status === 409) { await new Promise(res => setTimeout(res, 1500)); continue; } // a turn in flight
    if (!r.ok) throw new Error(`chat → ${r.status} ${(await r.text()).slice(0, 160)}`);
    const text = await r.text();
    return text.split('\n\n').map(b => b.trim()).filter(b => b.startsWith('data:'))
      .map(b => { try { return JSON.parse(b.slice(5).trim()); } catch { return null; } }).filter(Boolean);
  }
  throw new Error('chat → the session stayed busy');
}

const field = (state: CboState, section: string, key: string) =>
  String((state.sections as any)?.[section]?.fields?.[key]?.value ?? '').trim();

/** What the client posts after a shape is traced — the place they marked in Encontro 2, at the size it has. */
function mapPayload(state: CboState): string {
  const lat = field(state, 'intervention_site', '_site_lat') || field(state, 'intervention_site', 'site_lat') || '-30.03';
  const lng = field(state, 'intervention_site', '_site_lng') || field(state, 'intervention_site', 'site_lng') || '-51.20';
  const m2 = Math.round(Number(field(state, 'intervention_site', 'site_area_m2')) || 300);
  return `Map selection (composite mode):\n- [custom] Área desenhada (5 vertices) (drawn area) at (${lat}, ${lng}) · ${m2} m²\nTotal: 1 asset, 0 sampled points`;
}

async function simulate(memberId: string, cboId: string, baseUrl: string, run: SimRun): Promise<void> {
  const state0 = await loadState(cboId);
  const gate = simEligibility(state0);
  if (!gate.ok) throw new Error(`not eligible: ${gate.reason}`);

  // The coordinator's own doors, opened for this one organisation.
  const [member] = await db.select().from(cohortMembers).where(eq(cohortMembers.id, memberId)).limit(1);
  const unlocked = (member?.unlockedPhases as number[] | null) ?? [1];
  if (!unlocked.includes(4)) {
    await db.update(cohortMembers).set({ unlockedPhases: Array.from(new Set([...unlocked, 1, 2, 3, 4])).sort((a, b) => a - b) }).where(eq(cohortMembers.id, memberId));
  }
  const lang: 'pt' | 'en' = state0!.metadata?.language === 'en' ? 'en' : 'pt';
  const useModel = !isFakeModelEnabled() && structuredProvider() !== null;
  for (const n of gate.encontros) await walk(n, cboId, baseUrl, run, lang, useModel);
}

/** One encontro, turn by turn over the real chat route, until it closes. */
async function walk(n: 3 | 4, cboId: string, baseUrl: string, run: SimRun, lang: 'pt' | 'en', useModel: boolean): Promise<void> {
  run.encontro = n;
  let state = (await loadState(cboId))!;
  let turn: { message: string; turnKind: string; chipAnswers?: Array<{ question: string; answer: string }> } =
    { message: ENTRY[n][lang], turnKind: 'chip' };
  let silent = 0;
  let turns = 0;

  for (let i = 0; i < MAX_TURNS; i++) {
    turns++; run.turns++;
    const events = await chat(baseUrl, cboId, { ...turn, lang });
    state = (await loadState(cboId))!;
    if (closedNow(state, n)) break;

    if (events.some(e => e.type === 'open_map')) {
      turn = { message: mapPayload(state), turnKind: 'map' };
      continue;
    }
    const ask = [...events].reverse().find(e => e.type === 'ask_user');
    if (!ask) {
      // A turn that ended with nothing to answer: ask the workshop where it is,
      // the way a return to the page does. Twice in a row is a dead end.
      if (++silent > 2) throw new Error(`Encontro ${n} stopped asking after "${String(turn.message).slice(0, 60)}"`);
      turn = { message: ENTRY[n][lang], turnKind: 'chip' };
      continue;
    }
    silent = 0;
    run.step = String(ask.question ?? '').slice(0, 120);
    const lastSaid = String([...events].filter(e => e.type === 'chat').pop()?.content ?? '');
    const answer = await answerFor(n, state, cboId, ask, lastSaid, lang, useModel);
    turn = answer.kind === 'chip'
      ? { message: answer.label, turnKind: 'chip', chipAnswers: [{ question: String(ask.question ?? ''), answer: answer.label }] }
      : { message: answer.text, turnKind: 'text' };
  }

  state = (await loadState(cboId))!;
  if (!closedNow(state, n)) throw new Error(`Encontro ${n} did not close in ${MAX_TURNS} turns (last: "${run.step}")`);
  (state.metadata as any).simulated = {
    ...((state.metadata as any).simulated ?? {}),
    [`e${n}`]: { at: new Date().toISOString(), turns, player: useModel ? PLAYER_MODEL : 'policy' },
  };
  setCboState(cboId, state);
  debouncedPersist(cboId);
  console.log(`[e3-sim] ${run.orgName}: Encontro ${n} closed in ${turns} turns (${useModel ? PLAYER_MODEL : 'policy'})`);
}

// ── The player ──────────────────────────────────────────────────────────────

type Answer = { kind: 'chip'; label: string } | { kind: 'text'; text: string };
interface Option { label: string; description?: string; action?: string }

const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
/** Options that open a file picker or a camera — nobody is holding a phone. */
const DEVICE = /upload|photo|camera|file|foto|arquivo|enviar/i;
/** Options that stop the workshop short of the comparison. */
const STOPS = /deixar (pra|para) depois|parar aqui|later|stop here/i;

function testsSoFar(state: CboState): number {
  return parseTests(field(state, 'intervention_type', 'solution_tests_json')).length;
}

/** The fixed policy: no model, same goal. Also the fallback when the model's reply is not one of the options. */
/** Encontro 4's way forward: confirm what the record already says, close. Never reopen. */
const E4_FORWARD = /^(é essa|isso ✓|isso$|isso, e mais|pode fechar|todas essas|só isso|seguir sem|that's it|yes ✓|close)/i;
const E4_BACK = /mudar algo|queremos outra|outra solução|não é bem isso|mudou|change something/i;

function policyAnswer(n: 3 | 4, state: CboState, opts: Option[], composes: boolean, lang: 'pt' | 'en'): Answer {
  const usable = opts.filter(o => !DEVICE.test(o.action ?? '') && !STOPS.test(o.label) && !(n === 4 && E4_BACK.test(o.label)));
  if (n === 4) {
    const fwd = usable.find(o => !o.action && E4_FORWARD.test(o.label.trim()));
    if (fwd && !composes) return { kind: 'chip', label: fwd.label };
  }
  const tests = testsSoFar(state);
  if (tests >= TESTS_WANTED) { const c = usable.find(o => /compara/i.test(o.label)); if (c) return { kind: 'chip', label: c.label }; }
  else { const t = usable.find(o => /testar outr|try another/i.test(o.label)); if (t) return { kind: 'chip', label: t.label }; }
  const plain = usable.filter(o => !o.action);
  if (!composes && plain.length) return { kind: 'chip', label: plain[0].label };
  // An honest "we don't know" — echoing the site story answered "how many
  // houses?" with a description of the square.
  return { kind: 'text', text: lang === 'en'
    ? "We can't say for sure right now — it's what we see day to day, we never measured it."
    : 'Não sabemos dizer com certeza agora — é o que a gente vê no dia a dia, nunca medimos.' };
}

/** The record as the player reads it: every public field, then the last words of the transcript. */
function recordDigest(state: CboState, cboId: string): string {
  const lines: string[] = [];
  for (const [sid, sec] of Object.entries(state.sections ?? {})) {
    const fields = Object.entries((sec as any)?.fields ?? {})
      .filter(([k, f]: any) => !k.startsWith('_') && String(f?.value ?? '').trim())
      .map(([k, f]: any) => `  ${k}: ${String(f.value).replace(/\s+/g, ' ').slice(0, 280)}`);
    if (fields.length) lines.push(`[${sid}]`, ...fields);
  }
  const said = getCboMessages(cboId)
    .filter(m => m.messageType === 'content' && (m.role === 'user' || m.role === 'assistant'))
    .slice(-14)
    .map(m => `${m.role === 'user' ? 'ORGANIZAÇÃO' : 'FACILITADOR'}: ${String(m.content).split('\n[LANGUAGE:')[0].replace(/\s+/g, ' ').slice(0, 300)}`);
  return `${lines.join('\n').slice(0, 9000)}\n\nÚLTIMAS FALAS:\n${said.join('\n')}`;
}

// Both optional: a model that leaves a key out instead of writing null is
// saying the same thing, and failing the turn over it sent the walk to the
// policy's answer on a question that deserved a real one (live, 2026-10-16).
const PlayerReply = z.object({
  choice: z.string().nullable().optional().describe('the EXACT label of one option, or null when answering in words'),
  text: z.string().nullable().optional().describe('the answer in words, first person plural, when no option fits or the question asks for words'),
});

async function answerFor(n: 3 | 4, state: CboState, cboId: string, ask: any, lastSaid: string, lang: 'pt' | 'en', useModel: boolean): Promise<Answer> {
  const opts: Option[] = (ask.options ?? []).map((o: any) => ({ label: String(o.label), description: o.description, action: o.action }));
  const composes = opts.some(o => o.action === 'write' || o.action === 'record') || !opts.length;
  if (!useModel) return policyAnswer(n, state, opts, composes, lang);

  const tests = testsSoFar(state);
  const offered = opts
    .filter(o => !DEVICE.test(o.action ?? ''))
    .map(o => `- "${o.label}"${o.description ? ` — ${o.description}` : ''}${o.action === 'write' || o.action === 'record' ? ' (abre a caixa de texto: responda em palavras)' : ''}`)
    .join('\n');
  const system = [
    n === 3
      ? `Você faz o papel de uma organização comunitária de Porto Alegre num encontro do COUGAR (Encontro 3: testar soluções baseadas na natureza para o lugar que ela marcou no Encontro 2).`
      : `Você faz o papel de uma organização comunitária de Porto Alegre num encontro do COUGAR (Encontro 4: a pré-nota de uma página — a solução escolhida, quem é atingido, o que querem ver mudar, quem faz e quem cuida, o que a organização coloca, os parceiros).`,
    `Responda como ESTA organização responderia, a partir do registro dela abaixo: as palavras, o lugar, os problemas e o jeito dela. Não invente números grandes nem fatos que contradigam o registro; quando não souber, diga isso como uma pessoa diria.`,
    n === 3
      ? `Objetivo do encontro: testar ${TESTS_WANTED} soluções, uma de cada vez, e então ver a comparação. Já foram testadas ${tests}. ${tests >= TESTS_WANTED ? 'Agora vá para a comparação quando ela for oferecida.' : 'Quando oferecerem testar outra, aceite.'} Nunca escolha parar ou deixar para depois.`
      : `Objetivo do encontro: confirmar o que o registro já diz e responder com poucas palavras só o que falta, até fechar a pré-nota ("Pode fechar ✓"). Confirme a solução proposta. Não peça para mudar nada nem reabrir depois de fechar. Se perguntarem algo que o registro não responde, diga com honestidade que ainda não sabem.`,
    `Se a pergunta pede um arquivo, foto ou documento, diga que não tem agora e siga.`,
    `Responda ${lang === 'en' ? 'in English' : 'em português do Brasil, coloquial'}. Em palavras: 1 a 3 frases, primeira pessoa do plural, sem listas.`,
    `REGISTRO DA ORGANIZAÇÃO:\n${recordDigest(state, cboId)}`,
  ].join('\n\n');
  const user = `O facilitador disse: ${lastSaid.slice(0, 900)}\n\nPergunta na tela: ${String(ask.question ?? '')}\n\nOpções:\n${offered || '(nenhuma — responda em palavras)'}`;

  // ⚠️ The catch sits OUTSIDE withBudget: a rejection turned into null inside
  // it reads as a timeout and logs a [pass-timeout] that never happened.
  // One retry on a malformed reply, then the policy.
  let reply: z.infer<typeof PlayerReply> | null = null;
  for (let attempt = 0; attempt < 2 && !reply; attempt++) {
    const t0 = Date.now();
    reply = await withBudget('e3SimPlayer', createStructured({
      input: [{ role: 'system', content: system }, { role: 'user', content: user }],
      config: { model: PLAYER_MODEL, maxCompletionTokens: 400 },
    }, PlayerReply, 'answer')).catch(e => { console.warn(`[e3-sim] player reply unusable (attempt ${attempt + 1}):`, String(e?.message ?? e).slice(0, 160)); return null; });
    console.log(`[e3-sim] player ${Date.now() - t0}ms · "${String(ask.question ?? '').slice(0, 50)}"`);
  }
  const answer = pickAnswer(n, reply, opts, state, composes, lang);
  console.log(`[e3-sim]   → ${answer.kind === 'chip' ? `chip "${answer.label}"` : `"${answer.text.slice(0, 90)}"`}${reply ? '' : ' (policy)'}`);
  return answer;
}

function pickAnswer(n: 3 | 4, reply: z.infer<typeof PlayerReply> | null, opts: Option[], state: CboState, composes: boolean, lang: 'pt' | 'en'): Answer {
  if (reply?.choice) {
    const hit = opts.find(o => norm(o.label) === norm(reply.choice!)) ?? opts.find(o => norm(o.label).startsWith(norm(reply.choice!)));
    if (hit && !DEVICE.test(hit.action ?? '') && !STOPS.test(hit.label) && !(n === 4 && E4_BACK.test(hit.label))) {
      if (hit.action === 'write' || hit.action === 'record') { if (reply.text?.trim()) return { kind: 'text', text: reply.text.trim() }; }
      else return { kind: 'chip', label: hit.label };
    }
  }
  if (reply?.text?.trim()) return { kind: 'text', text: reply.text.trim().slice(0, 600) };
  return policyAnswer(n, state, opts, composes, lang);
}

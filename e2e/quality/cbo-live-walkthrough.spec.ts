import { test, expect } from '@playwright/test';
import { UserSim, matchChip } from '../helpers/userSim';

// FULL test (non-gating): the REAL Claude agent, driven by an LLM-simulated user
// through a complete Phase-1 org-profile intake. Point at a real deployment:
//
//   E2E_BASE_URL=https://<your-app> ANTHROPIC_API_KEY=sk-ant-... npm run test:e2e:full
//
// Self-skips without RUN_LIVE_WALKTHROUGH=1. Non-deterministic and slow (real
// model on both sides) — a quality/health check, never a per-PR gate. Uses only
// public endpoints + already-shipped testids, so it needs no /__test hooks and
// no redeploy.

const RUN = process.env.RUN_LIVE_WALKTHROUGH === '1';
// The real agent's Phase-1 intake is long (name, role, focus, legal form,
// founding, team size, paid/volunteer split, funding, NBS experience,
// communities served, …) — give it plenty of turns to finish + score + advance.
const MAX_TURNS = Number(process.env.E2E_MAX_TURNS || 28);
// Open via a coordinator-issued invite link (?t=token) so the org lands in a
// real cohort, or a bare session if not provided.
const START_PATH = process.env.E2E_CBO_PATH || '/cbo-profile';
// The agent's "Phase-1 profile is complete" signal (PT/EN). Detecting this is
// how we stop — the real flow saves the profile and waits for the coordinator
// rather than auto-advancing to Phase 2.
const PROFILE_DONE = /profile complete|perfil completo|encontro 1 (is )?(complete|conclu)|all sections.*(complete|filled)|todas as seções/i;

test.describe('CBO live walkthrough (real agent + simulated user) @live', () => {
  test.skip(!RUN, 'Set RUN_LIVE_WALKTHROUGH=1 + E2E_BASE_URL + ANTHROPIC_API_KEY to run.');
  // Run as a Brazilian browser so the page detects Portuguese (like a real CBO)
  // instead of Playwright's en-US default, which forced the agent into English.
  test.use({ locale: 'pt-BR' });
  // Real LLMs on both sides — give it room.
  test.setTimeout(10 * 60 * 1000);

  test('a simulated user completes Phase 1 and the agent advances to Phase 2', async ({ page, request }) => {
    const sim = new UserSim();

    await page.goto(START_PATH);

    // Invite-link flow (?t=token) shows a welcome screen (rendered after the
    // member resolves — so WAIT for it, don't race), then a one-time encontro
    // preamble, before the chat. The standalone /cbo-profile flow has neither.
    const isInvite = /[?&]t=/.test(START_PATH);
    if (isInvite) {
      await page.getByTestId('button-cbo-welcome-cta').click({ timeout: 30_000 });
      const preambleCta = page.getByTestId('button-encontro-1-start');
      if (await preambleCta.isVisible({ timeout: 8_000 }).catch(() => false)) await preambleCta.click();
    }

    const marker = page.getByTestId('cbo-stream-status');
    await expect(marker).toHaveAttribute('data-cbo-id', /.+/, { timeout: 30_000 });
    const cboId = (await marker.getAttribute('data-cbo-id'))!;
    const input = page.getByTestId('cbo-chat-input');

    const waitTurn = async (n: number) => {
      await expect(marker).toHaveAttribute('data-turns', String(n), { timeout: 120_000 });
      await expect(marker).toHaveAttribute('data-streaming', 'false');
    };
    const visibleChips = async (): Promise<string[]> => {
      if (!(await page.getByTestId('cbo-question-card').isVisible().catch(() => false))) return [];
      return page.locator('[data-option-label]').evaluateAll(els =>
        els.map(e => (e as HTMLElement).getAttribute('data-option-label') || '').filter(Boolean));
    };
    const lastAgentMessage = async (): Promise<string> => {
      const msgs = await (await request.get(`/api/cbo/${cboId}/messages`)).json();
      const agent = (Array.isArray(msgs) ? msgs : []).filter((m: any) => m.role === 'assistant' && m.messageType === 'content');
      return agent.length ? agent[agent.length - 1].content : '';
    };
    // What the user is actually being asked RIGHT NOW. `ask_user` questions
    // render in the on-screen card but are NOT chat messages — so reading only
    // /messages gives a stale question. Prefer the live card, fall back to chat.
    const currentQuestion = async (): Promise<string> => {
      const card = page.getByTestId('cbo-question-card');
      if (await card.isVisible().catch(() => false)) {
        const t = (await card.innerText().catch(() => '')).trim();
        if (t) return t;
      }
      return lastAgentMessage();
    };

    // Who speaks first? The invite flow auto-opens (kickoff) — the agent greets
    // on its own. The standalone flow doesn't, so the human opens. Wait briefly
    // for an agent-initiated turn; if none comes, send the opener ourselves.
    let turns = 1;
    try {
      await expect(marker).toHaveAttribute('data-turns', '1', { timeout: 60_000 });
      await expect(marker).toHaveAttribute('data-streaming', 'false');
    } catch {
      await input.fill(sim.opener());
      await input.press('Enter');
      await waitTurn(1);
    }

    let reachedPhase2 = false;
    for (let i = 0; i < MAX_TURNS; i++) {
      // Done in two real-world ways: the phase advanced (only happens if a
      // coordinator unlocked the next workshop), OR — the normal single-session
      // case — the agent declares the Phase-1 profile complete. The real flow
      // does NOT auto-jump to Phase 2; it saves the profile and waits for the
      // coordinator, so we must detect completion, not a phase bump (otherwise
      // the conversation spins in a goodbye loop).
      const phase = await marker.getAttribute('data-phase');
      if (phase && Number(phase) >= 2) { reachedPhase2 = true; break; }

      // Completion is signalled in a chat message; the live question is on-screen.
      if (PROFILE_DONE.test(await lastAgentMessage())) break;

      // A single model turn may be a BATCH of several questions (the redesign):
      // answering one chip just advances to the next sub-question — the message
      // is sent (and the turn completes) only after the whole batch is answered.
      // So keep answering sub-questions until data-turns actually increments.
      const before = Number(await marker.getAttribute('data-turns'));
      let sub = 0;
      while (Number(await marker.getAttribute('data-turns')) === before && sub++ < 12) {
        const cardVisible = await page.getByTestId('cbo-question-card').isVisible().catch(() => false);
        const q = cardVisible ? (await page.getByTestId('cbo-question-card').innerText().catch(() => '')).trim() : await lastAgentMessage();
        const chips = await visibleChips();
        const reply = await sim.reply(q, chips);
        const chip = matchChip(reply, chips);
        // eslint-disable-next-line no-console
        console.log(`  turn ${before}.${sub} · ${q.slice(0, 60).replace(/\n/g, ' ')}… · ${chip ? `[chip] ${chip}` : reply.slice(0, 40)}`);
        if (chip) {
          await page.locator(`[data-option-label="${chip}"]`).first().click();
          const confirm = page.getByRole('button', { name: /confirm/i });
          if (await confirm.isVisible({ timeout: 1500 }).catch(() => false)) await confirm.click();
        } else if (await input.isEnabled().catch(() => false)) {
          await input.fill(reply);
          await input.press('Enter');
        } else {
          await page.waitForTimeout(1500); // streaming/transition — let it settle
        }
        await page.waitForTimeout(900); // let the card advance or the send begin
      }
      await waitTurn(before + 1);
      turns = before + 1;
    }

    // Authoritative check on what the real agent actually persisted (public
    // read endpoint). The profile is the deliverable — a well-filled org_profile
    // with the org name. (Maturity scoring + phase advance are coordinator-gated
    // in the real flow, so they're informational, not hard assertions.)
    const state = (await (await request.get(`/api/cbo/${cboId}`)).json()).state;
    const orgFields = Object.keys(state.sections.org_profile.fields);
    // eslint-disable-next-line no-console
    console.log(`  result: phase ${state.phase} · ${orgFields.length} org fields · ${state.maturityScores.length} maturity scores · reachedPhase2=${reachedPhase2}`);
    expect(orgFields.length, `org_profile should be well filled, got: ${orgFields.join(', ')}`).toBeGreaterThanOrEqual(5);
    expect(state.sections.org_profile.fields.org_name?.value, 'org name should be set').toBeTruthy();
  });
});

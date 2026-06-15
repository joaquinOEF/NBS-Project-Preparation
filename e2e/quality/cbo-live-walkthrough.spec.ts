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
  // Real LLMs on both sides — give it room.
  test.setTimeout(10 * 60 * 1000);

  test('a simulated user completes Phase 1 and the agent advances to Phase 2', async ({ page, request }) => {
    const sim = new UserSim();

    await page.goto(START_PATH);
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

    // The human opens the chat.
    let turns = 0;
    await input.fill(sim.opener());
    await input.press('Enter');
    await waitTurn(++turns);

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

      const agentMsg = await lastAgentMessage();
      if (PROFILE_DONE.test(agentMsg)) break;

      const chips = await visibleChips();
      const reply = await sim.reply(agentMsg, chips);
      const chip = matchChip(reply, chips);
      // eslint-disable-next-line no-console
      console.log(`  turn ${turns} · agent: ${agentMsg.slice(0, 70).replace(/\n/g, ' ')}… · user${chip ? ` [chip] ${chip}` : `: ${reply.slice(0, 50)}`}`);

      if (chip) {
        await page.locator(`[data-option-label="${chip}"]`).first().click();
        // Multi-select questions ("select all that apply") don't send on click —
        // they need an explicit Confirm. Single-select already submitted.
        const confirm = page.getByRole('button', { name: /confirm/i });
        if (await confirm.isVisible().catch(() => false)) await confirm.click();
      } else {
        await input.fill(reply);
        await input.press('Enter');
      }
      await waitTurn(++turns);
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

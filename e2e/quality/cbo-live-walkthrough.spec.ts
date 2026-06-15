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
const MAX_TURNS = 14;

test.describe('CBO live walkthrough (real agent + simulated user) @live', () => {
  test.skip(!RUN, 'Set RUN_LIVE_WALKTHROUGH=1 + E2E_BASE_URL + ANTHROPIC_API_KEY to run.');
  // Real LLMs on both sides — give it room.
  test.setTimeout(10 * 60 * 1000);

  test('a simulated user completes Phase 1 and the agent advances to Phase 2', async ({ page, request }) => {
    const sim = new UserSim();

    await page.goto('/cbo-profile');
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
      const phase = await marker.getAttribute('data-phase');
      if (phase && Number(phase) >= 2) { reachedPhase2 = true; break; }

      const agentMsg = await lastAgentMessage();
      const chips = await visibleChips();
      const reply = await sim.reply(agentMsg, chips);
      const chip = matchChip(reply, chips);
      // eslint-disable-next-line no-console
      console.log(`  turn ${turns} · agent: ${agentMsg.slice(0, 70).replace(/\n/g, ' ')}… · user${chip ? ` [chip] ${chip}` : `: ${reply.slice(0, 50)}`}`);

      if (chip) {
        await page.locator(`[data-option-label="${chip}"]`).first().click();
      } else {
        await input.fill(reply);
        await input.press('Enter');
      }
      await waitTurn(++turns);
    }

    // The agent advanced to Phase 2 after building the profile.
    expect(reachedPhase2, `agent should reach Phase 2 within ${MAX_TURNS} turns`).toBeTruthy();
    await expect(marker).toHaveAttribute('data-phase', /[2-9]/);

    // The real persisted profile got built (public read endpoint).
    const state = (await (await request.get(`/api/cbo/${cboId}`)).json()).state;
    const orgFields = Object.keys(state.sections.org_profile.fields);
    expect(orgFields.length, `org_profile should have several fields, got: ${orgFields.join(', ')}`).toBeGreaterThanOrEqual(3);
    expect(state.sections.org_profile.fields.org_name?.value).toBeTruthy();
    expect(state.maturityScores.length, 'at least one Phase-1 metric scored').toBeGreaterThanOrEqual(1);
  });
});

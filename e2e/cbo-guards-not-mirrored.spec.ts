import { test, expect } from '@playwright/test';
import { TestApi } from './helpers/testApi';

// Mirror audit of fakeCboModel, after ask_user turned out to be a hand-written
// copy of the real tool's guards (so specs passed against a duplicate).
//
// Two more were found, and both were WORSE than ask_user: the rule was absent
// from the fake model entirely, so no spec could ever trip it.
//
//   1. score_maturity — the real tool refuses to score while requiredToClose
//      fields are missing. Scoring IS the close for E1, so this is the rule
//      that stops an encontro closing half-filled. The fake model wrote the
//      score unconditionally.
//
//   2. confirm_doc_fields — the real tool refuses to commit values staged in
//      the CURRENT turn, which is the whole point of staging: a recap and its
//      confirmation can never be the same turn. The fake model committed
//      everything, and stamped stagedAtUserTurns: 0 so the guard could not
//      have bitten anyway.
//
// Both now run the shared implementation. These specs exist to prove the guards
// are reachable from the suite at all.
test.describe('CBO — guards are shared with the fake model, not mirrored', () => {
  const boot = async (page: any) => {
    await page.goto('/cbo-profile');
    const marker = page.getByTestId('cbo-stream-status');
    await expect(marker).toHaveAttribute('data-cbo-id', /.+/, { timeout: 30_000 });
    await expect(marker).toHaveAttribute('data-streaming', 'false', { timeout: 30_000 });
    return { cboId: (await marker.getAttribute('data-cbo-id'))!, marker };
  };

  test('E1 cannot be scored while required fields are missing', async ({ page, request }) => {
    const api = new TestApi(request);
    test.skip(!(await api.ping()).fakeModel, 'needs the fake model');
    const { cboId, marker } = await boot(page);

    // A near-empty profile tries to close.
    await api.scriptCbo(cboId, [[
      { op: 'score_maturity', metric: 'org_delivery_capacity', score: 3, justification: 'closing early' },
    ]]);
    const input = page.getByTestId('cbo-chat-input');
    await input.fill('oi');
    await input.press('Enter');
    await expect(marker).toHaveAttribute('data-streaming', 'false');

    const state = await (await request.get(`/api/cbo/${cboId}`)).json();
    expect(
      (state.state?.maturityScores ?? []).length,
      'the gate refuses the score — this is what stops E1 closing half-filled',
    ).toBe(0);
  });

  test('a full profile CAN be scored — the gate opens', async ({ page, request }) => {
    const api = new TestApi(request);
    test.skip(!(await api.ping()).fakeModel, 'needs the fake model');
    const { cboId, marker } = await boot(page);

    // Fill everything requiredToClose asks for, then score.
    const fill = (field: string, value: string) =>
      ({ op: 'update_section' as const, sectionId: 'org_profile', field, value });
    await api.scriptCbo(cboId, [[
      fill('org_name', 'Horta do Beco'),
      fill('contact_name', 'Paula'),
      fill('contact_role', 'Presidente'),
      fill('mission_summary', 'Transformação social e ambiental na comunidade.'),
      fill('main_activities', 'Hortas e segurança alimentar'),
      fill('has_cnpj', 'Sim, temos CNPJ'),
      fill('legal_form', 'ONG / Associação'),
      fill('year_founded', '5 a 10 anos'),
      fill('team_size', '6–15'),
      fill('paid_vs_volunteer', 'Todas voluntárias'),
      fill('nbs_experience', 'Ainda não'),
      fill('groups_served', 'Mulheres, Jovens'),
      fill('funding_history', 'Sim, já recebemos'),
      fill('funded_project_count', '2 a 5 projetos'),
      fill('biggest_project_budget', 'R$ 10 a 50 mil'),
      { op: 'set_path', path: 'has-idea' },
      { op: 'score_maturity', metric: 'org_delivery_capacity', score: 2, justification: 'ok' },
    ]]);
    const input = page.getByTestId('cbo-chat-input');
    await input.fill('oi');
    await input.press('Enter');
    await expect(marker).toHaveAttribute('data-streaming', 'false');

    const state = await (await request.get(`/api/cbo/${cboId}`)).json();
    expect(
      (state.state?.maturityScores ?? []).length,
      'with everything answered the gate opens',
    ).toBeGreaterThan(0);
  });

  test('a doc value staged this turn cannot be confirmed in the same turn', async ({ page, request }) => {
    const api = new TestApi(request);
    test.skip(!(await api.ping()).fakeModel, 'needs the fake model');
    const { cboId, marker } = await boot(page);

    // Stage and confirm in one breath — the org has not seen the recap yet.
    await api.scriptCbo(cboId, [[
      {
        op: 'update_section',
        sectionId: 'org_profile',
        field: 'mission_summary',
        value: 'Missão lida do site da organização.',
        source: 'document',
      },
      { op: 'confirm_doc_fields' },
    ]]);
    const input = page.getByTestId('cbo-chat-input');
    await input.fill('https://exemplo.org/');
    await input.press('Enter');
    await expect(marker).toHaveAttribute('data-streaming', 'false');

    const state = await (await request.get(`/api/cbo/${cboId}`)).json();
    expect(
      String(state.state?.sections?.org_profile?.fields?.mission_summary?.value ?? ''),
      'staging exists so a human sees the value first — same-turn confirm must not commit',
    ).toBe('');
  });
});

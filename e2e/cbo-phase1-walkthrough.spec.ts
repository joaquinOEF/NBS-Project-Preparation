import { test, expect } from '@playwright/test';
import { TestApi } from './helpers/testApi';

// Full Phase-1 walkthrough — drives a complete "Who We Are" org-profile intake
// end to end: the user answers a multi-turn conversation (typed answers + chip
// picks), the document panel fills in, both Phase-1 maturity metrics get scored,
// and the flow advances to Phase 2. Deterministic via the fake model so it's
// repeatable and recordable; run with E2E_VIDEO=on to capture the whole thing.
//
//   bash scripts/e2e-local.sh cbo-phase1-walkthrough   # records the video
//   npm run test:e2e:report                            # watch it

// The agent's side of the conversation, one entry per user message. Mirrors a
// real Phase-1 intake: name → mission → legal form → team size → years → score.
const PHASE1_SCRIPT = [
  // Turn 1 — greet + ask the org name (free text).
  [
    { op: 'say', text: 'Oi! Eu ajudo a montar o perfil da sua organização. Para começar — qual é o nome da organização?' },
  ],
  // Turn 2 — record the name, ask the mission (free text).
  [
    { op: 'update_section', sectionId: 'org_profile', field: 'org_name', value: 'Horta Comunitária Cascata' },
    { op: 'say', text: 'Prazer! Em uma frase, qual é a missão de vocês?' },
  ],
  // Turn 3 — record the mission, ask legal form (chips).
  [
    { op: 'update_section', sectionId: 'org_profile', field: 'mission', value: 'Cultivar alimento e reduzir alagamentos no bairro Cascata.' },
    { op: 'ask_user', question: 'Qual é a forma jurídica da organização?', options: [
      { label: 'Associação comunitária' },
      { label: 'Coletivo informal' },
      { label: 'Estúdio / empresa' },
      { label: 'Escola' },
    ] },
  ],
  // Turn 4 — record legal form, ask team size (chips).
  [
    { op: 'update_section', sectionId: 'org_profile', field: 'legal_form', value: 'Associação comunitária' },
    { op: 'ask_user', question: 'Quantas pessoas fazem parte da equipe?', options: [
      { label: '1–5' }, { label: '6–20' }, { label: 'Mais de 20' },
    ] },
  ],
  // Turn 5 — record team size, ask years active (free text).
  [
    { op: 'update_section', sectionId: 'org_profile', field: 'team_size', value: '6–20' },
    { op: 'say', text: 'Há quantos anos a organização existe?' },
  ],
  // Turn 6 — record years, score the two Phase-1 metrics, advance to Phase 2.
  [
    { op: 'update_section', sectionId: 'org_profile', field: 'years_active', value: '8 anos' },
    { op: 'say', text: 'Perfeito — já tenho um bom retrato de vocês. Vou registrar a maturidade da Fase 1.' },
    { op: 'score_maturity', metric: 'org_delivery_capacity', score: 2, justification: 'Equipe estabelecida, 8 anos de atuação.' },
    { op: 'score_maturity', metric: 'team_technical_experience', score: 2, justification: 'Experiência prática em horta comunitária.' },
    { op: 'set_phase', phase: 2 },
    { op: 'say', text: '✅ Fase 1 concluída! O perfil "Quem Somos" está pronto. Podemos seguir para a Fase 2.' },
  ],
] as const;

test('Phase 1 walkthrough: a full org profile is built and advances to Phase 2', async ({ page, request }) => {
  const api = new TestApi(request);
  const ping = await api.ping();
  test.skip(!ping.fakeModel, 'CBO_FAKE_MODEL not enabled on the target.');

  await page.goto('/cbo-profile');
  const marker = page.getByTestId('cbo-stream-status');
  await expect(marker).toHaveAttribute('data-cbo-id', /.+/);
  const cboId = (await marker.getAttribute('data-cbo-id'))!;

  await api.scriptCbo(cboId, PHASE1_SCRIPT as any);

  const input = page.getByTestId('cbo-chat-input');
  const sendText = async (text: string, expectTurns: number) => {
    await input.fill(text);
    await expect(input).toHaveValue(text);
    await input.press('Enter');
    await expect(marker).toHaveAttribute('data-turns', String(expectTurns));
  };
  const clickChip = async (label: string, expectTurns: number) => {
    await expect(page.getByTestId('cbo-question-card')).toBeVisible();
    await page.locator(`[data-option-label="${label}"]`).first().click();
    await expect(marker).toHaveAttribute('data-turns', String(expectTurns));
  };

  // Drive the conversation.
  await sendText('Olá, queremos criar o perfil da nossa organização.', 1); // → asks name
  await sendText('Horta Comunitária Cascata', 2);                            // → name recorded, asks mission
  await expect(marker).toHaveAttribute('data-org-name', 'Horta Comunitária Cascata');
  await sendText('Cultivar alimento e reduzir alagamentos no bairro Cascata.', 3); // → mission, asks legal form
  await clickChip('Associação comunitária', 4);                              // → legal form, asks team size
  await clickChip('6–20', 5);                                                // → team size, asks years
  await sendText('8 anos', 6);                                               // → years, scores, advances

  // The flow advanced to Phase 2 and the document panel shows the org name.
  await expect(marker).toHaveAttribute('data-phase', '2');
  await expect(page.getByText('Fase 1 concluída', { exact: false })).toBeVisible();
  await expect(page.getByText('Horta Comunitária Cascata', { exact: false }).first()).toBeVisible();

  // Authoritative check against the persisted state: full org profile + both
  // Phase-1 metrics scored + phase advanced.
  const state = await (await request.get(`/api/cbo/${cboId}`)).json();
  const fields = state.state.sections.org_profile.fields;
  for (const f of ['org_name', 'mission', 'legal_form', 'team_size', 'years_active']) {
    expect(fields[f]?.value, `org_profile.${f} should be filled`).toBeTruthy();
  }
  expect(state.state.maturityScores.length).toBe(2);
  expect(state.state.totalMaturityScore).toBe(4);
  expect(state.state.phase).toBe(2);
});

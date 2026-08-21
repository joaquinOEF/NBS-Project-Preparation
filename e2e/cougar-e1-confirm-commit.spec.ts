import { test, expect } from '@playwright/test';
import { TestApi } from './helpers/testApi';

// W2 (Aug 2026). Adriana pasted misturai.com; the crawl extracted her mission
// correctly; she confirmed it with "✅ Tá tudo certo" — and five minutes later
// the agent asked for the mission as a missing field. She retyped a shorter,
// different one, and that is what perfil.json carries. The website mission she
// had explicitly confirmed is gone.
//
// Staging is right. Relying on the model to finish the transaction is not.
test.describe('COUGAR — E1 commits what the org confirmed', () => {
  const stageMission = async (api: TestApi, request: any, cboId: string) => {
    await api.scriptCbo(cboId, [[
      {
        op: 'update_section',
        sectionId: 'org_profile',
        field: 'mission_summary',
        value: 'Misturar distintos grupos da sociedade para promover desenvolvimento.',
        source: 'document',
      },
      { op: 'say', text: 'Li o site de vocês. Tá tudo certo?' },
    ]]);
  };

  test('an affirmative reply commits the staged value, without the model', async ({ page, request }) => {
    const api = new TestApi(request);
    const ping = await api.ping();
    test.skip(!ping.fakeModel, 'CBO_FAKE_MODEL is not enabled — skipping deterministic spec.');

    await page.goto('/cbo-profile');
    const marker = page.getByTestId('cbo-stream-status');
    await expect(marker).toHaveAttribute('data-cbo-id', /.+/, { timeout: 30_000 });
    await expect(marker).toHaveAttribute('data-streaming', 'false', { timeout: 30_000 });
    const cboId = (await marker.getAttribute('data-cbo-id'))!;

    await stageMission(api, request, cboId);
    const input = page.getByTestId('cbo-chat-input');
    await input.fill('https://misturai.com/');
    await input.press('Enter');
    await expect(marker).toHaveAttribute('data-streaming', 'false');

    // Staged, not stored — the design that is working.
    let state = await (await request.get(`/api/cbo/${cboId}`)).json();
    expect(String(state.state?.sections?.org_profile?.fields?.mission_summary?.value ?? ''), 'still staged')
      .toBe('');

    // The org confirms. No script for this turn: the model does nothing useful,
    // exactly as it did for Adriana.
    await api.scriptCbo(cboId, [[{ op: 'say', text: 'Show!' }]]);
    await input.fill('✅ Tá tudo certo');
    await input.press('Enter');
    await expect(marker).toHaveAttribute('data-streaming', 'false');

    state = await (await request.get(`/api/cbo/${cboId}`)).json();
    expect(
      String(state.state?.sections?.org_profile?.fields?.mission_summary?.value ?? ''),
      'the confirmed value is committed by the server, not by the model remembering',
    ).toContain('Misturar distintos grupos');
  });

  test('a correction does not commit — the staging gate still holds', async ({ page, request }) => {
    const api = new TestApi(request);
    const ping = await api.ping();
    test.skip(!ping.fakeModel, 'CBO_FAKE_MODEL is not enabled — skipping deterministic spec.');

    await page.goto('/cbo-profile');
    const marker = page.getByTestId('cbo-stream-status');
    await expect(marker).toHaveAttribute('data-cbo-id', /.+/, { timeout: 30_000 });
    await expect(marker).toHaveAttribute('data-streaming', 'false', { timeout: 30_000 });
    const cboId = (await marker.getAttribute('data-cbo-id'))!;

    await stageMission(api, request, cboId);
    const input = page.getByTestId('cbo-chat-input');
    await input.fill('https://misturai.com/');
    await input.press('Enter');
    await expect(marker).toHaveAttribute('data-streaming', 'false');

    await api.scriptCbo(cboId, [[{ op: 'say', text: 'Claro, me conta.' }]]);
    await input.fill('Quero ajustar');
    await input.press('Enter');
    await expect(marker).toHaveAttribute('data-streaming', 'false');

    const state = await (await request.get(`/api/cbo/${cboId}`)).json();
    expect(
      String(state.state?.sections?.org_profile?.fields?.mission_summary?.value ?? ''),
      'a correction must never commit the extracted value',
    ).toBe('');
  });

  test('an affirmative in the SAME turn as staging does not commit', async ({ page, request }) => {
    const api = new TestApi(request);
    const ping = await api.ping();
    test.skip(!ping.fakeModel, 'CBO_FAKE_MODEL is not enabled — skipping deterministic spec.');

    await page.goto('/cbo-profile');
    const marker = page.getByTestId('cbo-stream-status');
    await expect(marker).toHaveAttribute('data-cbo-id', /.+/, { timeout: 30_000 });
    await expect(marker).toHaveAttribute('data-streaming', 'false', { timeout: 30_000 });
    const cboId = (await marker.getAttribute('data-cbo-id'))!;

    // Stage and "confirm" in one breath — the org has not seen the recap yet.
    await stageMission(api, request, cboId);
    const input = page.getByTestId('cbo-chat-input');
    await input.fill('Sim');
    await input.press('Enter');
    await expect(marker).toHaveAttribute('data-streaming', 'false');

    const state = await (await request.get(`/api/cbo/${cboId}`)).json();
    expect(
      String(state.state?.sections?.org_profile?.fields?.mission_summary?.value ?? ''),
      'a recap and its confirmation can never be the same turn',
    ).toBe('');
  });
});

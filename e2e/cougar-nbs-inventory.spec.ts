import { test, expect } from '@playwright/test';
import { TestApi } from './helpers/testApi';

// W2, SDV Reciclando. Asked the free-text NbS-experience question, Paula pasted
// ~4,000 characters — not an answer, but a filled 27-row grid running through
// our own catalog, solution by solution, with locations and years. The richest
// structured data anyone in the cohort produced, and it landed in one paragraph
// that nothing could read.
//
// Not a workshop step and it asks the org for nothing. If it arrives, we keep
// it as rows so it can inform the conversation.
test.describe('COUGAR — absorbing the 27-solution checklist', () => {
  const boot = async (page: any) => {
    await page.goto('/cbo-profile');
    const marker = page.getByTestId('cbo-stream-status');
    await expect(marker).toHaveAttribute('data-cbo-id', /.+/, { timeout: 30_000 });
    await expect(marker).toHaveAttribute('data-streaming', 'false', { timeout: 30_000 });
    return { cboId: (await marker.getAttribute('data-cbo-id'))!, marker };
  };

  const GRID = [
    'Jardins de chuva\tNão\t—\t—\tSim. Consideramos importante implantar próximo ao galpão.',
    'Biovaletas\tNão\t—\t—\tSim. Poderiam ajudar na drenagem das ruas.',
    'Hortas urbanas\tSim\tNa SDV Reciclando, através da Horta Sustentável Comunitária.\t2025\tPretendemos ampliar.',
    'Compostagem\tParcialmente\tAções educativas junto à horta.\t2025\tQueremos estruturar um sistema permanente.',
  ].join('\n');

  test('a pasted grid is kept as rows, not as a paragraph', async ({ page, request }) => {
    const api = new TestApi(request);
    const ping = await api.ping();
    test.skip(!ping.fakeModel, 'CBO_FAKE_MODEL is not enabled — skipping deterministic spec.');
    const { cboId, marker } = await boot(page);
    await api.seedState(cboId, { phase: 2 });

    await api.scriptCbo(cboId, [[{ op: 'say', text: 'Obrigado, anotei.' }]]);
    await request.post(`/api/cbo/${cboId}/chat`, { data: { message: GRID, lang: 'pt' } });

    const state = await (await request.get(`/api/cbo/${cboId}`)).json();
    const raw = state.state?.sections?.intervention_site?.fields?._nbs_inventory_json?.value;
    expect(raw, 'the grid was recognised').toBeTruthy();

    const rows = JSON.parse(String(raw));
    expect(rows).toHaveLength(4);

    const horta = rows.find((r: any) => r.solutionId === 'hortas-urbanas');
    expect(horta.present, 'presence is captured per solution').toBe('yes');
    expect(horta.year, 'and the year they gave').toBe('2025');
    expect(String(horta.where)).toContain('Horta Sustentável');

    const compost = rows.find((r: any) => r.solutionId === 'compostagem');
    expect(compost.present, '"Parcialmente" is its own answer, not a yes').toBe('partial');

    const jardins = rows.find((r: any) => r.solutionId === 'jardins-de-chuva');
    expect(jardins.present).toBe('no');
    expect(String(jardins.plans), 'what they plan is kept too').toContain('galpão');
  });

  test('ordinary prose that mentions solutions is not an inventory', async ({ page, request }) => {
    const api = new TestApi(request);
    const ping = await api.ping();
    test.skip(!ping.fakeModel, 'CBO_FAKE_MODEL is not enabled — skipping deterministic spec.');
    const { cboId } = await boot(page);
    await api.seedState(cboId, { phase: 2 });

    await api.scriptCbo(cboId, [[{ op: 'say', text: 'Que legal!' }]]);
    await request.post(`/api/cbo/${cboId}/chat`, {
      data: {
        message:
          'Nós temos uma horta comunitária há uns dois anos, fazemos compostagem no quintal e já plantamos algumas árvores na rua junto com os vizinhos.',
        lang: 'pt',
      },
    });

    const state = await (await request.get(`/api/cbo/${cboId}`)).json();
    expect(
      state.state?.sections?.intervention_site?.fields?._nbs_inventory_json?.value ?? null,
      'a conversation that mentions solutions must not be stored as an inventory',
    ).toBeFalsy();
  });

  test('the blank template is not data', async ({ page, request }) => {
    const api = new TestApi(request);
    const ping = await api.ping();
    test.skip(!ping.fakeModel, 'CBO_FAKE_MODEL is not enabled — skipping deterministic spec.');
    const { cboId } = await boot(page);
    await api.seedState(cboId, { phase: 2 });

    await api.scriptCbo(cboId, [[{ op: 'say', text: 'Recebi.' }]]);
    await request.post(`/api/cbo/${cboId}/chat`, {
      data: {
        message: 'JARDINS DE CHUVA\nBACIA DE RETENÇÃO\nBIOVALETAS\nCANTEIRO PLUVIAL\nWETLAND\nHORTAS URBANAS\nCOMPOSTAGEM',
        lang: 'pt',
      },
    });

    const state = await (await request.get(`/api/cbo/${cboId}`)).json();
    expect(
      state.state?.sections?.intervention_site?.fields?._nbs_inventory_json?.value ?? null,
      'a list of names with no answers is the empty form, not an inventory',
    ).toBeFalsy();
  });
});

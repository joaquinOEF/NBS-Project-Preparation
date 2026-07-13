import { test, expect } from '@playwright/test';
import { TestApi } from './helpers/testApi';

// Questionnaire manifest (shared/cbo-questionnaire.ts), Ana 2026-07: "is kinda
// weird to say they have a CNPJ and then have 'Coletivo informal' as an
// option" — the org-type list must follow the CNPJ answer, and a value the
// answer excludes must never be stored. The fake model shares the same
// checkOptionRule call as the real update_section, so this exercises the real
// write-path rule deterministically.

test.describe('COUGAR — org type is conditional on the CNPJ answer', () => {
  test.use({ locale: 'pt-BR' });

  test('a legal_form the CNPJ answer excludes is rejected; an allowed one stores', async ({ page, request }) => {
    const api = new TestApi(request);
    const ping = await api.ping();
    test.skip(!ping.fakeModel, 'CBO_FAKE_MODEL is not enabled on the target — skipping deterministic spec.');

    await page.goto('/cbo-profile');
    const marker = page.getByTestId('cbo-stream-status');
    await expect(marker).toHaveAttribute('data-cbo-id', /.+/);
    const cboId = (await marker.getAttribute('data-cbo-id'))!;

    // Turn 1 — the org has NO CNPJ, and the (misbehaving) agent then tries to
    // store "ONG / Associação": the rule must reject it, and the batch order
    // must not matter (has_cnpj is written first even when sent together in
    // the real tool; here they arrive as sequential ops).
    await api.scriptCbo(cboId, [
      [
        { op: 'update_section', sectionId: 'org_profile', field: 'has_cnpj', value: 'Ainda não' },
        { op: 'update_section', sectionId: 'org_profile', field: 'legal_form', value: 'ONG / Associação' },
        { op: 'say', text: 'Anotei sobre o CNPJ.' },
        { op: 'ask_user', question: 'Seguimos?', options: [{ label: 'Sim' }, { label: 'Quero ajustar' }] },
      ],
      // Turn 2 — the allowed option for a CNPJ-less org stores normally.
      [
        { op: 'update_section', sectionId: 'org_profile', field: 'legal_form', value: 'Coletivo informal' },
        { op: 'say', text: 'Fechou.' },
        { op: 'ask_user', question: 'Seguimos?', options: [{ label: 'Sim' }, { label: 'Quero ajustar' }] },
      ],
    ]);

    const input = page.getByTestId('cbo-chat-input');
    await input.fill('não temos cnpj ainda');
    await input.press('Enter');
    await expect(marker).toHaveAttribute('data-streaming', 'false');

    // The excluded value never reached the state.
    const stateAfterReject = await (await page.request.get(`/api/cbo/${cboId}`)).json();
    const fields1 = stateAfterReject.state?.sections?.org_profile?.fields ?? stateAfterReject.sections?.org_profile?.fields;
    expect(fields1.has_cnpj?.value).toBe('Ainda não');
    expect(fields1.legal_form, 'legal_form "ONG" must be rejected for a CNPJ-less org').toBeUndefined();

    // Turn 2: the consistent value stores.
    await input.fill('somos um coletivo');
    await input.press('Enter');
    await expect(marker).toHaveAttribute('data-turns', '2');
    const stateAfterAccept = await (await page.request.get(`/api/cbo/${cboId}`)).json();
    const fields2 = stateAfterAccept.state?.sections?.org_profile?.fields ?? stateAfterAccept.sections?.org_profile?.fields;
    expect(fields2.legal_form?.value).toBe('Coletivo informal');
  });
});

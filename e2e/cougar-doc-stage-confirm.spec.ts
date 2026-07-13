import { test, expect } from '@playwright/test';
import { TestApi } from './helpers/testApi';

// Crawl-trust gate (field report 2026-07: extracted values were filled with
// no validation — "sometimes asks for validation sometimes doesn't"). Doc-
// sourced FREE-TEXT values are STAGED by update_section and only land in the
// document after confirm_doc_fields — i.e. after the user confirmed the
// recap. Enum fields keep committing directly through their exact-label
// guard. The fake model mirrors both halves, so this exercises the real
// staging semantics deterministically.

test.describe('COUGAR — doc-sourced free-text stages until the user confirms', () => {
  test.use({ locale: 'pt-BR' });

  test('mission stays out of the panel until confirm_doc_fields; enums commit directly', async ({ page, request }) => {
    const api = new TestApi(request);
    test.skip(!(await api.ping()).fakeModel, 'CBO_FAKE_MODEL not enabled on target.');

    await page.goto('/cbo-profile');
    const marker = page.getByTestId('cbo-stream-status');
    await expect(marker).toHaveAttribute('data-cbo-id', /.+/);
    const cboId = (await marker.getAttribute('data-cbo-id'))!;

    await api.scriptCbo(cboId, [
      // Turn 1 — the agent read a website: an enum (commits directly through
      // the exact-label guard) and a free-text mission (must stage).
      [
        { op: 'update_section', sectionId: 'org_profile', field: 'legal_form', value: 'ONG / Associação', source: 'document' },
        { op: 'update_section', sectionId: 'org_profile', field: 'mission_summary', value: 'Missão extraída do site sobre hortas comunitárias', source: 'document' },
        { op: 'say', text: 'Li na página Sobre nós: vocês são uma associação com missão de hortas comunitárias. Confere?' },
        { op: 'ask_user', question: 'Confere?', options: [{ label: 'Confere tudo' }, { label: 'Quero ajustar' }] },
      ],
      // Turn 2 — the user confirmed: commit the staged value.
      [
        { op: 'confirm_doc_fields' },
        { op: 'say', text: 'Fechado, missão anotada!' },
        { op: 'ask_user', question: 'Seguimos?', options: [{ label: 'Sim' }, { label: 'Quero ajustar' }] },
      ],
    ]);

    const input = page.getByTestId('cbo-chat-input');
    await input.fill('https://exemplo.org');
    await input.press('Enter');
    await expect(marker).toHaveAttribute('data-streaming', 'false');

    // Enum committed; free-text staged — in state terms, not just pixels.
    const stateStaged = (await (await page.request.get(`/api/cbo/${cboId}`)).json()).state;
    expect(stateStaged.sections.org_profile.fields.legal_form?.value).toBe('ONG / Associação');
    expect(stateStaged.sections.org_profile.fields.mission_summary, 'mission must NOT be written before confirmation').toBeUndefined();
    expect(Object.keys(stateStaged.stagedDocFields ?? {})).toContain('org_profile.mission_summary');

    // The user confirms → the staged value commits and reaches the panel.
    await page.getByTestId('cbo-option-0').click(); // "Confere tudo"
    await expect(page.getByText('Fechado, missão anotada!')).toBeVisible({ timeout: 15_000 });
    const stateDone = (await (await page.request.get(`/api/cbo/${cboId}`)).json()).state;
    expect(stateDone.sections.org_profile.fields.mission_summary?.value).toBe('Missão extraída do site sobre hortas comunitárias');
    expect(stateDone.sections.org_profile.fields.mission_summary?.source).toBe('document');
    expect(Object.keys(stateDone.stagedDocFields ?? {})).toHaveLength(0);
  });
});

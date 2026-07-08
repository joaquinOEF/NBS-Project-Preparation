import { test, expect } from '@playwright/test';
import { TestApi } from './helpers/testApi';

// CBO-ENUM-LABELS (Ana, 2026-07-07): the doc-extraction path stored the E1
// skill's machine enum ids ("funded", "gardens-and-greening") and the Documento
// panel rendered them raw, in English. update_section now canonicalizes
// org_profile enum values to the human chip label (shared/cbo-field-catalog),
// and the panel maps any legacy id on render. The fake model shares the same
// canonicalize call, so this exercises the real write path deterministically.

test.describe('COUGAR — E1 enum fields render human labels, never machine ids', () => {
  // Ana's real scenario is a pt session — pin the browser locale so the
  // session language (and therefore the canonical labels) is Portuguese.
  test.use({ locale: 'pt-BR' });

  test('machine ids written by the agent surface as Portuguese chip labels', async ({ page, request }) => {
    const api = new TestApi(request);
    const ping = await api.ping();
    test.skip(!ping.fakeModel, 'CBO_FAKE_MODEL is not enabled on the target — skipping deterministic spec.');

    await page.goto('/cbo-profile');
    const marker = page.getByTestId('cbo-stream-status');
    await expect(marker).toHaveAttribute('data-cbo-id', /.+/);
    const cboId = (await marker.getAttribute('data-cbo-id'))!;

    // The bug scenario: agent extracts a news article and stores the raw enum
    // ids from the skill spec instead of the chip labels.
    await api.scriptCbo(cboId, [
      [
        { op: 'update_section', sectionId: 'org_profile', field: 'prior_project_scale', value: 'funded', source: 'document' },
        { op: 'update_section', sectionId: 'org_profile', field: 'nbs_experience', value: 'gardens-and-greening', source: 'document' },
        { op: 'update_section', sectionId: 'org_profile', field: 'groups_served', value: 'women, jovens', source: 'document' },
        { op: 'say', text: 'Li o artigo e preenchi o histórico de vocês.' },
        { op: 'ask_user', question: 'Tá tudo certo?', options: [{ label: 'Sim' }, { label: 'Quero ajustar' }] },
      ],
    ]);

    const input = page.getByTestId('cbo-chat-input');
    await input.fill('https://exemplo.com/artigo-sobre-nos');
    await input.press('Enter');
    await expect(marker).toHaveAttribute('data-streaming', 'false');

    // Histórico card shows the Portuguese chip labels…
    await expect(page.getByText('Projeto com financiamento', { exact: false })).toBeVisible();
    await expect(page.getByText('Hortas / arborização', { exact: false })).toBeVisible();
    // …multi-select items map per-item (mixed en id + pt id)…
    await expect(page.getByText('Mulheres, Jovens', { exact: false })).toBeVisible();
    // …and the raw machine ids never reach the user.
    await expect(page.getByText('gardens-and-greening', { exact: false })).toHaveCount(0);
    await expect(page.getByText(/\bfunded\b/)).toHaveCount(0);
  });

  test('document paraphrases fuzzy-map to a chip label; off-list document values are NOT stored', async ({ page, request }) => {
    const api = new TestApi(request);
    const ping = await api.ping();
    test.skip(!ping.fakeModel, 'CBO_FAKE_MODEL is not enabled on the target — skipping deterministic spec.');

    await page.goto('/cbo-profile');
    const marker = page.getByTestId('cbo-stream-status');
    await expect(marker).toHaveAttribute('data-cbo-id', /.+/);
    const cboId = (await marker.getAttribute('data-cbo-id'))!;

    // Field report 2026-07-08: a link produced "categories related to ours but
    // not exactly them". Containment: exactly one option's tokens inside the
    // paraphrase → that chip label. No containable option → rejected, field
    // stays empty (the agent is told to ask with chips instead).
    await api.scriptCbo(cboId, [
      [
        { op: 'update_section', sectionId: 'org_profile', field: 'legal_form', value: 'Associação comunitária de moradores', source: 'document' },
        { op: 'update_section', sectionId: 'org_profile', field: 'nbs_experience', value: 'Oficinas de reciclagem e compostagem', source: 'document' },
        { op: 'say', text: 'Li o material que vocês mandaram.' },
        { op: 'ask_user', question: 'Tá tudo certo?', options: [{ label: 'Sim' }] },
      ],
    ]);

    const input = page.getByTestId('cbo-chat-input');
    await input.fill('https://exemplo.com/quem-somos');
    await input.press('Enter');
    await expect(marker).toHaveAttribute('data-streaming', 'false');

    // Fuzzy hit: the paraphrase landed on the canonical chip label.
    await expect(page.getByText('ONG / Associação', { exact: false }).first()).toBeVisible();
    await expect(page.getByText('Associação comunitária de moradores', { exact: false })).toHaveCount(0);
    // Off-list value: never stored, never rendered.
    await expect(page.getByText('Oficinas de reciclagem', { exact: false })).toHaveCount(0);
  });

  test('a free-text value that matches no option passes through untouched', async ({ page, request }) => {
    const api = new TestApi(request);
    const ping = await api.ping();
    test.skip(!ping.fakeModel, 'CBO_FAKE_MODEL is not enabled on the target — skipping deterministic spec.');

    await page.goto('/cbo-profile');
    const marker = page.getByTestId('cbo-stream-status');
    await expect(marker).toHaveAttribute('data-cbo-id', /.+/);
    const cboId = (await marker.getAttribute('data-cbo-id'))!;

    // The richer chip label (with the R$ bracket) is NOT a catalog option — it
    // must be stored and rendered exactly as tapped, not squashed to the
    // generic label.
    await api.scriptCbo(cboId, [
      [
        { op: 'update_section', sectionId: 'org_profile', field: 'prior_project_scale', value: 'Projeto financiado (R$ 50k+)' },
        { op: 'say', text: 'Anotei o porte do maior projeto.' },
        { op: 'ask_user', question: 'Seguimos?', options: [{ label: 'Sim' }] },
      ],
    ]);

    const input = page.getByTestId('cbo-chat-input');
    await input.fill('Projeto financiado (R$ 50k+)');
    await input.press('Enter');
    await expect(marker).toHaveAttribute('data-streaming', 'false');

    await expect(page.getByText('Projeto financiado (R$ 50k+)', { exact: false }).first()).toBeVisible();
  });
});

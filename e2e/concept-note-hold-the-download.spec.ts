import { test, expect } from '@playwright/test';
import { TestApi } from './helpers/testApi';
import { buildRoadmap } from '../shared/w3-roadmap';

// ⚠️ THE SAME URL SERVED TWO DIFFERENT DOCUMENTS AND SAID NOTHING.
//
// The Resumo do Projeto is assembled with no model in the path, so it is always
// downloadable. Three of its sections are then WRITTEN, once, in the background,
// while the organisation reads the closing card — and the download button beside
// that card is live from the first millisecond. Tap immediately and you get the
// assembled version; tap a minute later and the same link gives you a fuller
// one. Neither state was visible to anyone (JVP, CEA Bom Jesus, 2026-09-07).
//
// The wait must be honest in both directions: visible while a pass is genuinely
// running, and ABSENT when there is nothing coming — a deployment with no key
// must never sit behind a spinner for a document that is already complete.

const W3_STATE = [
  { sectionId: 'org_profile', field: 'org_name', value: 'CEA Bom Jesus' },
  { sectionId: 'intervention_site', field: 'bairro', value: 'Partenon' },
  { sectionId: 'intervention_site', field: 'site_name', value: 'Colégio Caldas Junior' },
  { sectionId: 'intervention_site', field: 'site_worry', value: 'enxurrada' },
  { sectionId: 'intervention_site', field: 'site_area_m2', value: '2900' },
  { sectionId: 'intervention_type', field: 'chosen_solutions', value: 'biovaletas' },
];

test.describe('the download waits for the writing — and never for anything else', () => {
  test.use({ locale: 'pt-BR' });

  test('the status route answers for every exit of the pass', async ({ page, request }) => {
    const api = new TestApi(request);
    test.skip(!(await api.ping()).fakeModel, 'needs the fake model env (for seeding)');

    await page.goto('/cbo-profile');
    const marker = page.getByTestId('cbo-stream-status');
    await expect(marker).toHaveAttribute('data-cbo-id', /.+/, { timeout: 30_000 });
    const cboId = (await marker.getAttribute('data-cbo-id'))!;
    await api.seedState(cboId, { phase: 3, language: 'pt', sections: W3_STATE });

    const status = async () =>
      (await (await request.get(`/api/cbo/${cboId}/concept-note/status`)).json()) as any;

    // Never run: nothing to wait for. An older session has no flag at all and
    // must not be held either.
    expect((await status()).status).toBe('unknown');

    // Running.
    await api.seedState(cboId, {
      sections: [{ sectionId: 'intervention_type', field: '_concept_note_authoring', value: `writing:${Date.now()}` }],
    });
    expect((await status()).status).toBe('writing');

    // ⚠️ A flag left behind by a process that restarted mid-pass. The card must
    // stop waiting on its own — a spinner that never resolves is worse than the
    // thinner document it was trying to spare anyone.
    await api.seedState(cboId, {
      sections: [{ sectionId: 'intervention_type', field: '_concept_note_authoring', value: `writing:${Date.now() - 5 * 60_000}` }],
    });
    expect((await status()).status).toBe('skipped');

    // Ran and produced nothing — the commonest case, a deployment with no key.
    await api.seedState(cboId, {
      sections: [{ sectionId: 'intervention_type', field: '_concept_note_authoring', value: 'skipped:no API key' }],
    });
    const skipped = await status();
    expect(skipped.status).toBe('skipped');
    expect(skipped.reason).toBe('no API key');

    // Wrote prose.
    await api.seedState(cboId, {
      sections: [{ sectionId: 'intervention_type', field: '_concept_note_authoring', value: 'done' }],
    });
    expect((await status()).status).toBe('done');
  });

  test('the card waits while it is writing, and offers the download otherwise', async ({ page, request }) => {
    const api = new TestApi(request);
    test.skip(!(await api.ping()).fakeModel, 'needs the fake model env (for seeding)');

    await page.goto('/cbo-profile');
    const marker = page.getByTestId('cbo-stream-status');
    await expect(marker).toHaveAttribute('data-cbo-id', /.+/, { timeout: 30_000 });
    const cboId = (await marker.getAttribute('data-cbo-id'))!;
    await api.seedState(cboId, { phase: 3, language: 'pt', sections: W3_STATE });

    // WRITING — the card holds, visibly, and says why.
    await page.route(`**/api/cbo/*/concept-note/status`, r =>
      r.fulfill({ contentType: 'application/json', body: JSON.stringify({ status: 'writing', sinceMs: 1000 }) }));
    // A real roadmap, built the way the checkpoint builds it — the card under
    // test is the one an organisation actually sees.
    const roadmap = buildRoadmap({
      site: { bairro: 'Partenon', site_name: 'Colégio Caldas Junior', site_worry: 'enxurrada', site_area_m2: '2900' },
      org: { org_name: 'CEA Bom Jesus' },
      solutions: ['biovaletas'],
      areaM2: 2900,
      w3: { chosen_solutions: 'biovaletas' },
    } as any, 'pt');
    await api.scriptCbo(cboId, [[{ op: 'say', text: 'Fechando.' }, { op: 'show_roadmap', roadmap } as any]]);
    const input = page.getByTestId('cbo-chat-input');
    await input.fill('Fechar');
    await input.press('Enter');

    await expect(page.getByTestId('cbo-roadmap')).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId('concept-note-writing')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByTestId('concept-note-writing')).toContainText('Escrevendo');
    await expect(page.getByTestId('concept-note-print')).toHaveCount(0);

    // SETTLED — the document is offered, with no wait at all. This is what a
    // deployment without a key sees, and it must never be a spinner.
    await page.unroute(`**/api/cbo/*/concept-note/status`);
    await page.route(`**/api/cbo/*/concept-note/status`, r =>
      r.fulfill({ contentType: 'application/json', body: JSON.stringify({ status: 'skipped', reason: 'no API key' }) }));
    await page.reload();
    await expect(page.getByTestId('cbo-roadmap')).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId('concept-note-print')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByTestId('concept-note-writing')).toHaveCount(0);
  });

  // ⚠️ AND THE MERGE ITSELF, which nothing exercised. The whole point of waiting
  // is that the written version reaches the page — but the document is served
  // by a route that re-validates stored prose against the facts as they stand,
  // and a merge that silently dropped everything would look exactly like a pass
  // that never ran. `?plain=1` serves the assembled document, so the two can be
  // compared without a model in the loop.
  test('stored prose reaches the served document, and plain=1 shows what it replaced', async ({ page, request }) => {
    const api = new TestApi(request);
    test.skip(!(await api.ping()).fakeModel, 'needs the fake model env (for seeding)');

    await page.goto('/cbo-profile');
    const marker = page.getByTestId('cbo-stream-status');
    await expect(marker).toHaveAttribute('data-cbo-id', /.+/, { timeout: 30_000 });
    const cboId = (await marker.getAttribute('data-cbo-id'))!;
    await api.seedState(cboId, { phase: 3, language: 'pt', sections: W3_STATE });

    // A paragraph with no numeral in it: the guard drops any authored sentence
    // carrying a figure the facts do not contain, which is the defence that
    // keeps an invented number out of a document nobody can fact-check.
    const SENTENCE = 'A organização propõe uma vala vegetada no pátio da escola, no caminho que a água já faz.';
    await api.seedState(cboId, {
      sections: [{
        sectionId: 'intervention_type',
        field: '_concept_note_json',
        value: JSON.stringify([
          { section: 'resumo', paragraphs: [{ text: SENTENCE, kind: 'written', sources: ['Encontros 2 e 3'], authored: true }] },
        ]),
      }],
    });

    const authored = await (await request.get(`/api/cbo/${cboId}/concept-note?lang=pt`)).text();
    expect(authored).toContain(SENTENCE);

    const plain = await (await request.get(`/api/cbo/${cboId}/concept-note?lang=pt&plain=1`)).text();
    expect(plain).not.toContain(SENTENCE);
    // Both are complete documents — the assembled one is the floor, never a
    // degraded version of the other.
    expect(plain).toContain('Resumo do Projeto');
    expect(authored).toContain('Resumo do Projeto');
  });
});

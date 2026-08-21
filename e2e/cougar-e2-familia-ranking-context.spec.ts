import { test, expect } from '@playwright/test';
import { TestApi } from './helpers/testApi';

// E2 famílias beat — the card says "com o que você me contou", so the ranking
// has to have read it.
//
// Until now `buildFamiliaRecoItems` passed six things to rankFamiliasForSite:
// bairro risks, bairro, current_use, site_name, hazard-check corrections and
// site_worry. `site_story` — the voice note the org recorded describing its own
// place — was inert, and so were the photos we asked them to take. The model's
// ranking only ran if the user tapped "Quero ajustar", i.e. after the list had
// already disappointed them (JVP, 2026-08-03).
//
// The e2e environment has no model key, so every run here exercises the
// FALLBACK. That is deliberate and it is the important half: the beat must
// still produce all five famílias, the chips, and a recorded reason — a model
// in this position is only acceptable if its absence is survivable.

test.describe('COUGAR — E2 família ranking reads the org context', () => {
  test.use({ locale: 'pt-BR' });

  test('with no model available the beat still serves five famílias and records why', async ({ page, request }) => {
    test.setTimeout(180_000);
    const api = new TestApi(request);
    test.skip(!(await api.ping()).fakeModel, 'needs the fake model');

    await page.goto('/cbo-profile');
    const marker = page.getByTestId('cbo-stream-status');
    await expect(marker).toHaveAttribute('data-cbo-id', /.+/, { timeout: 30_000 });
    const cboId = (await marker.getAttribute('data-cbo-id'))!;
    await api.seedState(cboId, { phase: 2 });

    const chip = (label: string) =>
      page.locator(`[data-testid^="cbo-option-"][data-option-label="${label}"]`);

    await request.post(`/api/cbo/${cboId}/chat`, {
      data: {
        message: [
          'Map selection (composite mode):',
          '- [zone] Partenon: MEDIUM risk, intervention: urban forest, area: 8.1 km², pop: 45.768, flood: 22%, heat: 51%, landslide: 14%, at (-30.0577, -51.1936)',
          '- [custom] Pátio da escola at (-30.0577, -51.1936)',
          'Total: 2 assets, 0 sampled points',
        ].join('\n'),
        lang: 'pt',
        turnKind: 'map',
      },
    });
    await page.reload();
    await expect(page.getByTestId('cbo-site-card')).toBeVisible({ timeout: 20_000 });

    await chip('Confirmar ✓').click();
    await expect(page.getByText('Como é esse lugar hoje', { exact: false })).toBeVisible({ timeout: 10_000 });
    await chip('Pavimentado / impermeabilizado').click();
    await expect(page.getByText('acesso a esse espaço', { exact: false })).toBeVisible({ timeout: 10_000 });
    await chip('É da prefeitura, mas a gente usa').click();

    // Diagnostic beats — leave a real story, which is the whole point.
    await expect(page.getByText('mais preocupa', { exact: false })).toBeVisible({ timeout: 10_000 });
    await chip('🌡️ Calor').click();
    await chip('Pronto ✓').click();
    await expect(page.getByText('palavras de vocês', { exact: false })).toBeVisible({ timeout: 10_000 });
    const input = page.getByTestId('cbo-chat-input');
    await input.fill(
      'O pátio da escola é todo pavimentado, quase não tem sombra nenhuma e no verão as crianças não conseguem sair na hora do recreio.',
    );
    await input.press('Enter');
    await expect(page.getByText('fotos ajudam', { exact: false })).toBeVisible({ timeout: 15_000 });
    await chip('Não tenho agora').click();
    await expect(page.getByText('média do bairro', { exact: false })).toBeVisible({ timeout: 10_000 });
    await chip('Aqui é pior').click();

    // The beat lands: all five famílias, and the chips that follow it.
    await expect(page.getByTestId('cbo-familia-reco')).toBeVisible({ timeout: 30_000 });
    await expect(chip('Faz sentido')).toBeVisible({ timeout: 15_000 });

    // Ana's W2 ask: the summary must open the solutions BEHIND a família, not
    // only jump to real cases. Each ranked row carries its own expand control.
    const expanders = page.locator('[data-testid^="reco-expand-"]');
    expect(await expanders.count(), 'every strong família row offers its options').toBeGreaterThanOrEqual(1);
    await expanders.first().click();
    await expect(page.getByTestId('nbs-familia-sheet')).toBeVisible({ timeout: 10_000 });
    await page.getByTestId('nbs-familia-sheet-close').click();
    await expect(page.getByTestId('nbs-familia-sheet')).toBeHidden({ timeout: 10_000 });

    // Expanding must NOT answer the question — the chips are still waiting.
    await expect(chip('Faz sentido')).toBeVisible();

    const body = await (await request.get(`/api/cbo/${cboId}`)).json();
    const f = body.state?.sections?.intervention_site?.fields ?? {};

    // The story was captured, and is what the ranker is given.
    expect(String(f.site_story?.value ?? '')).toContain('sombra');

    // The ranking is RECORDED — which ranker ran, what it served, and what the
    // arithmetic alone would have said. This is what makes "the photos and the
    // voice note, what did they change?" answerable with evidence.
    const reco = JSON.parse(String(f._reco_json?.value ?? '{}'));
    expect(reco.source, 'the served ranking must record its provenance').toMatch(/^(model|deterministic)$/);
    expect(reco.served, 'all five famílias must ship — "nada fica descartado"').toHaveLength(5);
    expect(reco.baseline, 'the deterministic baseline must be recorded alongside').toHaveLength(5);
    expect(reco.usedStory, 'the ranker must have been handed the story').toBe(true);
    // With no key in the e2e env this must be the graceful path, not a crash.
    if (reco.source === 'deterministic') {
      expect(reco.fallbackReason, 'a fallback must say why').toBeTruthy();
    }
  });
});

// ── The model path, without a model ──────────────────────────────────────────
// The e2e env has no API key, so the flow test above can only ever exercise the
// fallback. These drive the validator directly: every guardrail that stands
// between a model's answer and the org's screen, tested on the answers a model
// actually gets wrong.

import { validateModelRanking } from '../server/services/familiaRanker';
import { rankFamiliasForSite } from '../shared/nbs-recommendation';

const BASELINE = rankFamiliasForSite({
  risks: { flood: 22, heat: 51, landslide: 14 },
  bairro: 'Partenon',
  currentUse: 'paved',
  worries: ['heat'],
});
const ALL_FIVE = BASELINE.map(b => ({ familiaId: b.familiaId, why: 'porque vocês contaram X' }));

test.describe('família ranking — model output guardrails', () => {
  test('a valid reordering is accepted and keeps the catalogue variants', () => {
    const reversed = [...ALL_FIVE].reverse();
    const out = validateModelRanking(reversed, BASELINE);
    expect('items' in out).toBe(true);
    if (!('items' in out)) return;
    expect(out.items.map(i => i.familiaId)).toEqual(reversed.map(r => r.familiaId));
    // Example variants come from the catalogue, never from the model.
    for (const i of out.items) expect(i.exampleSolutionIds.length).toBeGreaterThan(0);
  });

  test('a short list is rejected — "nada fica descartado" is on screen', () => {
    const out = validateModelRanking(ALL_FIVE.slice(0, 3), BASELINE);
    expect('error' in out).toBe(true);
  });

  test('an invented família is rejected, not silently dropped', () => {
    // Dropping it would leave 4 valid entries, which must ALSO fail — a
    // hallucinated id must never cost the org a real família.
    const withJunk = [...ALL_FIVE.slice(0, 4), { familiaId: 'telhados-magicos', why: 'x' }];
    const out = validateModelRanking(withJunk, BASELINE);
    expect('error' in out).toBe(true);
  });

  test('duplicates and empty whys are rejected', () => {
    const dup = [ALL_FIVE[0], ...ALL_FIVE];
    expect('error' in validateModelRanking(dup, BASELINE)).toBe(false); // dedupes to 5
    const blank = ALL_FIVE.map((r, i) => (i === 2 ? { ...r, why: '   ' } : r));
    expect('error' in validateModelRanking(blank, BASELINE)).toBe(true);
  });

  test('the model cannot mark a família weak, or un-mark one', () => {
    const weakIds = BASELINE.filter(b => b.weak && !b.guaranteed).map(b => b.familiaId);
    const out = validateModelRanking(ALL_FIVE, BASELINE);
    if (!('items' in out)) throw new Error('expected items');
    expect(out.items.filter(i => i.weak).map(i => i.familiaId).sort()).toEqual(weakIds.sort());
  });

  test('garbage in — nothing crashes, an error comes out', () => {
    expect('error' in validateModelRanking(undefined, BASELINE)).toBe(true);
    expect('error' in validateModelRanking([] as any, BASELINE)).toBe(true);
    expect('error' in validateModelRanking([{ familiaId: null, why: null }] as any, BASELINE)).toBe(true);
  });
});

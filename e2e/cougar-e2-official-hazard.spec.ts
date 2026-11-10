import { test, expect } from '@playwright/test';
import { TestApi } from './helpers/testApi';
import { hazardCheckQuestion } from '../shared/site-knowledge';
import type { OfficialHazardFact } from '../shared/official-hazard-facts';
import { rankFamiliasForSite } from '../shared/nbs-recommendation';

// What an organisation SEES about climate hazard rests on OFFICIAL data — the
// Prefeitura's PLAC/ARVC ameaça, SMAMUS's Guaíba cotas, SGB sectors — so the
// accountability is the municipality's (JVP, first set 11 Aug 2026 in PR #470,
// restated 10 Nov 2026).
//
// Our `_bairro_*_pct` numbers are within-city percentile ranks of the ARVC
// RISCO composite. They may still ORDER things (família ranking, which hazard
// the read-back asks about) but must never be SAID. Before this change a
// Floresta organisation read "No bairro, em média — Enchente Alto" on its site
// card and "Nosso mapa diz que o risco de enchente é **alto** no Floresta — mas
// isso é a média do bairro" in the read-back.
//
// The pin sits inside the SMAMUS 2,90 m Guaíba contour, so the card carries the
// Guaíba line and the read-back anchors on the cota.

const FLORESTA = { lat: -30.02, lng: -51.212 };
const SITE_PAYLOAD = [
  'Map selection (composite mode):',
  // flood 91% — high enough that the old copy would have said "alto".
  `- [zone] Floresta: HIGH risk, intervention: flood parks, area: 1.6 km², pop: 15.214, flood: 91%, heat: 62%, landslide: 8%, at (${FLORESTA.lat}, ${FLORESTA.lng})`,
  `- [custom] Pátio da associação at (${FLORESTA.lat}, ${FLORESTA.lng})`,
  'Total: 2 assets, 0 sampled points',
].join('\n');

/** Every way our bairro index used to reach the screen. */
const BAIRRO_INDEX = [
  /em média/i,
  /média do bairro/i,
  /average over the whole/i,
  /\d+\s*%/,
  /Nosso mapa diz/i,
  /risco de \w+ é/i,
  /\b(Baixo|Médio|Alto)\b/, // the old bar labels (capitalised)
];

test.describe('COUGAR — E2 hazard copy rests on official data', () => {
  test.use({ locale: 'pt-BR' });

  test('site card and read-back carry no bairro-percentile wording (seeded Floresta site)', async ({ page, request }) => {
    test.setTimeout(150_000);
    const api = new TestApi(request);
    test.skip(!(await api.ping()).fakeModel, 'needs the fake model');

    await page.goto('/cbo-profile');
    const marker = page.getByTestId('cbo-stream-status');
    await expect(marker).toHaveAttribute('data-cbo-id', /.+/, { timeout: 30_000 });
    const cboId = (await marker.getAttribute('data-cbo-id'))!;
    await api.seedState(cboId, { phase: 2, language: 'pt' });
    await request.post(`/api/cbo/${cboId}/chat`, { data: { message: SITE_PAYLOAD, lang: 'pt', turnKind: 'map' } });
    await page.reload();

    // ── The site card ──────────────────────────────────────────────────────
    const card = page.getByTestId('cbo-site-card');
    await expect(card).toBeVisible({ timeout: 20_000 });
    await expect(card).toContainText('Ameaça no ponto (PLAC)');
    await expect(card).toContainText('PLAC/ARVC, cenário 2050');
    await expect(page.getByTestId('cbo-site-card-guaiba')).toContainText(/Dentro da área atingida com o Guaíba a 2,90 m/);
    const cardText = (await card.innerText()).replace(/\s+/g, ' ');
    for (const re of BAIRRO_INDEX) expect(cardText, `site card: ${re}`).not.toMatch(re);

    // ── Walk to the read-back ──────────────────────────────────────────────
    const chip = (label: string) => page.locator(`[data-testid^="cbo-option-"][data-option-label="${label}"]`);
    const tap = async (label: string) => {
      await expect(chip(label)).toBeVisible({ timeout: 15_000 });
      await chip(label).click();
    };
    await tap('Confirmar ✓');
    await tap('Abandonado / degradado');
    await tap('É da prefeitura, mas a gente usa');
    await expect(page.getByText('mais preocupa', { exact: false })).toBeVisible({ timeout: 15_000 });
    await tap('💧 Alagamento');
    await tap('Pronto ✓');
    await tap('Prefiro pular');
    await tap('Não tenho agora');

    const readBack = page.getByText(/é mais ou menos isso, ou é mais tranquilo/).last();
    await expect(readBack).toBeVisible({ timeout: 15_000 });
    // The whole assistant bubble, official-facts paragraph included.
    const bubble = (await page.locator('[data-testid="cbo-chat-thread"]').innerText()).split('Por onde a água entra').pop()!;
    const readBackText = bubble.slice(0, bubble.indexOf('mais tranquilo') + 'mais tranquilo'.length).replace(/\s+/g, ' ');
    expect(readBackText).toMatch(/Comparando com o resto do Floresta/);
    // Anchored on the official cota at the pin, with its source.
    expect(readBackText).toMatch(/cota de 2,90 m do Guaíba/);
    expect(readBackText).toMatch(/SMAMUS/);
    for (const re of BAIRRO_INDEX) expect(readBackText, `read-back: ${re}`).not.toMatch(re);
    // The answer contract is unchanged: the same four options.
    for (const o of ['Aqui é pior', 'É mais ou menos isso', 'Aqui é mais tranquilo', 'Não sei dizer']) {
      await expect(chip(o).last()).toBeVisible();
    }
  });

  test('without an official fact the read-back asks with no data claim at all', () => {
    for (const lang of ['pt', 'en'] as const) {
      for (const hasSite of [true, false]) {
        const q = hazardCheckQuestion('flood', 'Floresta', lang, hasSite, []);
        for (const re of BAIRRO_INDEX) expect(q, `${lang}/${hasSite}: ${re}`).not.toMatch(re);
        expect(q).not.toMatch(/nosso mapa|our map|alto|high/i);
      }
    }
    // A fact for ANOTHER hazard is not said for this one.
    const erosion: OfficialHazardFact = { hazard: 'landslide', kind: 'erosao', pt: 'a Prefeitura classifica a suscetibilidade à erosão ali como baixa', en: 'the city rates erosion susceptibility there as low', source: 'SMAMUS, suscetibilidade à erosão' };
    expect(hazardCheckQuestion('flood', 'Floresta', 'pt', true, [erosion])).not.toMatch(/erosão/);
    expect(hazardCheckQuestion('landslide', 'Floresta', 'pt', true, [erosion])).toMatch(/erosão ali como baixa \(SMAMUS/);
  });

  test('família why lines never state a bairro hazard level', () => {
    const ranked = rankFamiliasForSite({
      risks: { flood: 91, heat: 62, landslide: 8 },
      bairro: 'Floresta',
      worries: [],
    });
    for (const r of ranked) {
      for (const why of [r.why.pt, r.why.en]) {
        expect(why).not.toMatch(/é alta no|é alto no|O dado do bairro|risk is (high|low|medium) in|bairro data/i);
        expect(why.trim().length).toBeGreaterThan(0);
      }
    }
    // The ranking itself still follows the internal index: flood leads.
    const withWorry = rankFamiliasForSite({ risks: { flood: 91, heat: 62, landslide: 8 }, bairro: 'Floresta', worries: ['alagamento'] });
    expect(withWorry[0].why.pt).toMatch(/Vocês disseram que enchente preocupa aqui|preocupações que vocês apontaram|preocupação nesse lugar/);
  });
});

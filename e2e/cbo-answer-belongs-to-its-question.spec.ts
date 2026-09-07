import { test, expect } from '@playwright/test';
import { TestApi } from './helpers/testApi';

// ⚠️ SIX E3 BEATS ASK WITH THE SAME WORDS: "Quando quiser:" — por que aqui, a
// linha de base, o detalhe, as duas rodadas do dig, o banco. The transcript
// paired answers to questions by that STRING, so answering two of them in a row
// did two wrong things at once (JVP, CEA Bom Jesus, 2026-09-07):
//
//   • the second answer overwrote the first in the lookup, and the card under
//     "Por que aqui?" displayed the answer to "como é o lugar hoje";
//   • while the second beat was live, the first — already answered — matched the
//     pending set and rendered as nothing, so the paragraph the organisation had
//     just dictated left no trace in the chat.
//
// The record had it the whole time. That is what makes this class dangerous:
// nothing fails, and the only person who can see it is the one who typed.

const W2_STATE = [
  { sectionId: 'org_profile', field: 'org_name', value: 'CEA Bom Jesus' },
  { sectionId: 'intervention_site', field: 'bairro', value: 'Partenon' },
  { sectionId: 'intervention_site', field: 'site_name', value: 'Colégio Caldas Junior' },
  { sectionId: 'intervention_site', field: '_site_lat', value: '-30.0721' },
  { sectionId: 'intervention_site', field: '_site_lng', value: '-51.1789' },
  { sectionId: 'intervention_site', field: 'current_use', value: 'paved' },
  { sectionId: 'intervention_site', field: 'site_worry', value: 'alagamento' },
  { sectionId: 'intervention_site', field: 'site_area_m2', value: '2900' },
  { sectionId: 'intervention_site', field: 'nbs_interest', value: 'aguas-pluviais' },
];

const WHY = 'Porque é para onde a água vai: a enxurrada desce a rua de cima e o pátio inteiro vira um lago.';
const BASELINE = 'Hoje é tudo concreto, dois ralos que entopem e nenhuma árvore dentro do terreno.';

test.describe('COUGAR — the transcript', () => {
  test.use({ locale: 'pt-BR' });

  test('each answer stays under the question it answered', async ({ page, request }) => {
    const api = new TestApi(request);
    test.skip(!(await api.ping()).fakeModel, 'needs the fake model env (for seeding)');

    await page.goto('/cbo-profile');
    const marker = page.getByTestId('cbo-stream-status');
    await expect(marker).toHaveAttribute('data-cbo-id', /.+/, { timeout: 30_000 });
    const cboId = (await marker.getAttribute('data-cbo-id'))!;
    await api.seedState(cboId, { phase: 3, language: 'pt', sections: W2_STATE });

    const chip = (label: string) =>
      page.locator(`[data-testid^="cbo-option-"][data-option-label="${label}"]`);
    const input = page.getByTestId('cbo-chat-input');

    await input.fill('Vamos começar o Encontro 3.');
    await input.press('Enter');
    await chip('É isso ✓').click();
    await expect(page.getByTestId('cbo-solution-options')).toBeVisible({ timeout: 15_000 });
    await chip('Biovaletas').click();
    // Size is already on the record, so this only has to be confirmed.
    await expect(chip('Confere ✓')).toBeVisible({ timeout: 15_000 });
    await chip('Confere ✓').click();
    await expect(chip('Parceria com universidade ou ONG')).toBeVisible({ timeout: 15_000 });
    await chip('Parceria com universidade ou ONG').click();

    // Beat 1 — "Por que aqui?", answered by typing.
    await expect(page.getByText('Por que', { exact: false }).last()).toBeVisible({ timeout: 15_000 });
    await input.fill(WHY);
    await input.press('Enter');

    // Beat 2 — "como é o lugar hoje", which asks with THE SAME WORDS.
    await expect(page.getByText('como é o lugar hoje', { exact: false })).toBeVisible({ timeout: 15_000 });
    // While it is live, the answer above must still be on screen. This is the
    // assertion the shipped code failed: the paragraph vanished entirely.
    const cardWith = (text: string) =>
      page.getByTestId('cbo-answered-card').filter({ hasText: text });
    await expect(cardWith(WHY)).toHaveCount(1);

    await input.fill(BASELINE);
    await input.press('Enter');
    await expect(page.getByText('Anotado', { exact: false }).last()).toBeVisible({ timeout: 15_000 });

    // Each answer sits in exactly ONE answered card — the failure mode was one
    // answer appearing in two of them, which is how the baseline paragraph came
    // to sit under "Por que aqui?".
    await expect(cardWith(WHY)).toHaveCount(1);
    await expect(cardWith(BASELINE)).toHaveCount(1);

    // And in the order they were given: why-here above the baseline.
    const tops = await page.getByTestId('cbo-answered-card').evaluateAll(
      (els, [why, baseline]) => {
        const topOf = (needle: string) =>
          els.filter(el => (el.textContent ?? '').includes(needle))
             .map(el => el.getBoundingClientRect().top)[0] ?? -1;
        return [topOf(why), topOf(baseline)];
      },
      [WHY, BASELINE],
    );
    expect(tops[0]).toBeGreaterThan(0);
    expect(tops[1]).toBeGreaterThan(tops[0]);
  });
});

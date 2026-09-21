import { test, expect } from '@playwright/test';
import { TestApi } from '../helpers/testApi';

// LOOK AT IT. Drives the loop at phone width and at projector width and
// leaves screenshots in $W3_SHOTS — the test card, the comparison, the parked
// state, the printed comparison. Not an assertion suite: the assertions live
// in cougar-e3-test-loop.spec.ts. This exists because three of the five
// defects the first fullsim found were only visible by looking at the page.
//
//   W3_SHOTS=/tmp/shots RUN_SHOTS=1 npx playwright test e2e/quality/w3-loop-shots.spec.ts

const OUT = process.env.W3_SHOTS || '';
const RUN = process.env.RUN_SHOTS === '1';

const W2_STATE = [
  { sectionId: 'org_profile', field: 'org_name', value: 'Raízes do Sarandi' },
  { sectionId: 'org_profile', field: 'contact_name', value: 'Marlene Souza' },
  { sectionId: 'intervention_site', field: 'bairro', value: 'Sarandi' },
  { sectionId: 'intervention_site', field: 'site_name', value: 'Pátio da EMEI Solar' },
  { sectionId: 'intervention_site', field: '_site_lat', value: '-30.0906' },
  { sectionId: 'intervention_site', field: '_site_lng', value: '-51.1726' },
  { sectionId: 'intervention_site', field: 'current_use', value: 'paved' },
  { sectionId: 'intervention_site', field: 'land_tenure', value: 'public-informal' },
  { sectionId: 'intervention_site', field: 'site_worry', value: 'alagamento' },
  { sectionId: 'intervention_site', field: 'site_story', value: 'Quando chove forte a água entra pelo fundo e fica dias.' },
  { sectionId: 'intervention_site', field: 'site_knowledge_depth', value: 'strong' },
  { sectionId: 'intervention_site', field: 'nbs_interest', value: 'aguas-pluviais' },
  // ⚠️ This spec walks the DETAILING TAIL, which the product no longer opens:
  // Encontro 3 ends at the comparison since 2026-09-21 (e2e/cougar-e3-ends-at-comparison.spec.ts).
  // The beats are kept as Encontro 4's raw material, and this per-session switch keeps them tested.
  { sectionId: 'intervention_type', field: '_tail_enabled', value: 'yes' },
  { sectionId: 'intervention_type', field: 'technical_note', value: 'Visita de 28/09: o pátio drena para a Rua Dona Alzira; a boca de lobo da esquina está assoreada. Um jardim de chuva no canto baixo faz sentido; a cisterna não, o telhado é pequeno.' },
];

test.use({ locale: 'pt-BR' });

for (const vp of [{ name: 'phone', width: 390, height: 844 }, { name: 'projector', width: 1366, height: 768 }]) {
  test(`the loop, seen at ${vp.name} width`, async ({ page, request }) => {
    test.skip(!RUN || !OUT, 'opt-in: RUN_SHOTS=1 W3_SHOTS=<dir>');
    await page.setViewportSize({ width: vp.width, height: vp.height });
    const api = new TestApi(request);
    test.skip(!(await api.ping()).fakeModel, 'needs the fake model');
    await page.goto('/cbo-profile');
    const marker = page.getByTestId('cbo-stream-status');
    await expect(marker).toHaveAttribute('data-cbo-id', /.+/, { timeout: 30_000 });
    const cboId = (await marker.getAttribute('data-cbo-id'))!;
    await api.seedState(cboId, { phase: 3, language: 'pt', sections: W2_STATE });
    const chip = (label: string) => page.locator(`[data-testid^="cbo-option-"][data-option-label="${label}"]`);
    const shot = async (name: string) => { await page.waitForTimeout(900); await page.screenshot({ path: `${OUT}/${vp.name}-${name}.png`, fullPage: false }); };
    const input = page.getByTestId('cbo-chat-input');

    await input.fill('Vamos começar o Encontro 3.');
    await input.press('Enter');
    await chip('É isso ✓').click();
    // The door (PR #539): what is missing, before the shelf.
    await expect(chip('Já mandamos tudo')).toBeVisible({ timeout: 15_000 });
    await shot('0-porta');
    await chip('Já mandamos tudo').click();
    await expect(page.getByTestId('cbo-solution-options')).toBeVisible({ timeout: 15_000 });
    await shot('1-prateleira');
    await chip('Jardins de chuva').click();
    await expect(chip('Desenhar no mapa')).toBeVisible({ timeout: 15_000 });
    await chip('✍️ Escrever o tamanho').click();
    await input.fill('uns 30 por 20 metros');
    await input.press('Enter');
    const card = page.getByTestId('cbo-solution-test-jardins-de-chuva');
    await expect(card).toBeVisible({ timeout: 20_000 });
    await card.scrollIntoViewIfNeeded();
    await shot('2-card-jardins');
    await chip('Faz sentido pra gente').click();
    await expect(chip('Mais barro — a água empoça')).toBeVisible({ timeout: 15_000 });
    await chip('Mais barro — a água empoça').click();
    await expect(chip('Testar outra solução')).toBeVisible({ timeout: 15_000 });
    await chip('Testar outra solução').click();
    await expect(chip('Ver todas as soluções')).toBeVisible({ timeout: 15_000 });
    await chip('Ver todas as soluções').click();
    await page.getByTestId('solution-option-captacao-agua-da-chuva').last().click();
    await page.waitForTimeout(900);
    await shot('3-ficha-captacao');
    await page.getByTestId('solution-choose-captacao-agua-da-chuva').click();
    await chip('2').click();
    const card2 = page.getByTestId('cbo-solution-test-captacao-agua-da-chuva');
    await expect(card2).toBeVisible({ timeout: 20_000 });
    await card2.scrollIntoViewIfNeeded();
    await shot('4-card-captacao');
    await chip('Não é pra gente').click();
    await expect(chip('Ver a comparação')).toBeVisible({ timeout: 15_000 });
    await chip('Ver a comparação').click();
    const cmp = page.getByTestId('cbo-comparison');
    await expect(cmp).toBeVisible({ timeout: 20_000 });
    await cmp.scrollIntoViewIfNeeded();
    await shot('5-comparacao');
    await chip('Deixar pra depois').click();
    await expect(chip('Detalhar agora')).toBeVisible({ timeout: 15_000 });
    await shot('6-parado');
    await page.reload();
    await expect(chip('Detalhar agora')).toBeVisible({ timeout: 30_000 });
    await shot('7-voltou');

    // The printed comparison, as a page.
    await page.goto(`/api/cbo/${cboId}/comparison?lang=pt`);
    await page.waitForTimeout(800);
    await page.screenshot({ path: `${OUT}/${vp.name}-8-comparacao-impressa.png`, fullPage: true });
  });
}

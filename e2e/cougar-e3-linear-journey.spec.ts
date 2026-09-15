import { test, expect } from '@playwright/test';
import { TestApi } from './helpers/testApi';

// The FULL linear E3 journey: recap → a prateleira → o teste (tamanho → card →
// reação → detalhe) → a comparação → detalhar (por que aqui → linha de base →
// quem cuida → frequência → dinheiro) → dossiê.
//
// Same contract as the E2 journey spec: every stage boundary is a
// server-templated checkpoint (serveE3Checkpoint), so this runs WITHOUT a
// single fake-model script. If any step fell through to the model, the fake
// model's default turn ("Vamos continuar") would render instead of the next
// checkpoint and these assertions would fail.
//
// Both session languages, because the templates carry full pt/en copy and a
// drifted label on either side silently strands that language's cohort.

/** A completed W2, in the shape the E2 checkpoints actually store. */
const W2_STATE = [
  { sectionId: 'org_profile', field: 'org_name', value: 'Raízes do Sarandi' },
  { sectionId: 'org_profile', field: 'contact_name', value: 'Marlene Souza' },
  { sectionId: 'org_profile', field: 'prior_project_scale', value: 'funded' },
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
];

const LANGS = [
  {
    name: 'pt',
    locale: 'pt-BR',
    entry: 'Vamos começar o Encontro 3.',
    recapText: 'Bem-vindas ao Encontro 3',
    confirm: 'É isso ✓',
    shortlistText: 'grupos que vocês marcaram',
    solution: 'Jardins de chuva',
    shelfQuestion: 'Qual vocês querem testar primeiro?',
    reaction: 'Faz sentido pra gente',
    seeComparison: 'Ver a comparação',
    detailNow: 'Detalhar agora',
    sizeText: 'Contorne no mapa',
    deferSize: 'Ainda não sei o tamanho',
    sizeByComparison: 'Do tamanho de uma quadra de vôlei',
    detailPick: 'Mais barro — a água empoça',
    whyText: 'Por que **aqui**',
    whyPlain: 'Por que',
    why: 'É o único pátio do bairro e alaga em toda chuva forte.',
    baselineText: 'como é o lugar hoje',
    baseline: 'Piso de cimento inteiro, sem uma árvore.',
    maintainsText: 'quem cuida disso no dia a dia',
    maintains: 'Parceria com a prefeitura',
    ownLandOnly: 'Empresa contratada',
    freqText: 'frequência',
    freq: 'A cada três meses',
    moneyText: 'dinheiro que volta todo ano',
    money: 'Ainda não sabemos', // E3_SUSTAINABILITY.indefinido
    moneyRetryText: 'quem paga as contas desse lugar',
    moneyRetry: 'A prefeitura',
    build: 'Mutirão com apoio técnico',
    // ⚠️ Was 'por metro quadrado' — the RATE, which is what an organisation with
    // no area gets. It gave one by comparison at 4a, so the beat now states a
    // volume for its own site. That is the retry paying off, end to end.
    timeframe: '1 ano',
    monitor: 'Com uma universidade ou parceiro',
    closingText: 'Pronto',
  },
  {
    name: 'en',
    locale: 'en-US',
    entry: "Let's start Encontro 3.",
    recapText: 'Welcome to Encontro 3',
    confirm: "That's it ✓",
    shortlistText: 'grupos you marked',
    solution: 'Rain gardens',
    shelfQuestion: 'Which one do you want to test first?',
    reaction: 'Makes sense for us',
    seeComparison: 'See the comparison',
    detailNow: 'Go into detail now',
    sizeText: 'Trace the area',
    deferSize: "I don't know the size yet",
    sizeByComparison: 'About the size of a volleyball court',
    detailPick: 'More clay — water pools',
    whyText: 'Why **here**',
    whyPlain: 'Why',
    why: 'It is the only yard in the neighbourhood and it floods in every heavy rain.',
    baselineText: 'what is the place like today',
    baseline: 'Solid concrete, not one tree.',
    maintainsText: 'who looks after this day to day',
    maintains: 'City partnership',
    ownLandOnly: 'Hired contractor',
    freqText: 'How often',
    freq: 'Quarterly',
    moneyText: 'money that comes back every year',
    money: 'Not decided yet', // E3_SUSTAINABILITY.indefinido
    moneyRetryText: 'who pays for that place',
    moneyRetry: 'The city',
    build: 'Mutirão with technical support',
    timeframe: '1 year',
    monitor: 'With a university or partner',
    closingText: 'Done',
  },
] as const;

for (const L of LANGS) {
  test.describe(`COUGAR — E3 linear journey (${L.name})`, () => {
    test.use({ locale: L.locale });

    test('W2 record → scoped project, every beat templated', async ({ page, request }) => {
      const api = new TestApi(request);
      test.skip(!(await api.ping()).fakeModel, 'needs the fake model env (for seeding)');

      await page.goto('/cbo-profile');
      const marker = page.getByTestId('cbo-stream-status');
      await expect(marker).toHaveAttribute('data-cbo-id', /.+/, { timeout: 30_000 });
      const cboId = (await marker.getAttribute('data-cbo-id'))!;
      await api.seedState(cboId, { phase: 3, language: L.name, sections: W2_STATE });

      const chip = (label: string) =>
        page.locator(`[data-testid^="cbo-option-"][data-option-label="${label}"]`);
      const input = page.getByTestId('cbo-chat-input');
      const inThreadJ = (text: string) =>
        page.getByTestId('cbo-chat-thread').getByText(text, { exact: false }).last();

      // 1 · The opening recap names the place W2 marked, rather than asking
      //     for it again — the clearest "we weren't listening" signal there is.
      await input.fill(L.entry);
      await input.press('Enter');
      await expect(page.getByText(L.recapText, { exact: false }).first()).toBeVisible({ timeout: 15_000 });
      await expect(page.getByText('Pátio da EMEI Solar', { exact: false }).first()).toBeVisible();
      await chip(L.confirm).click();

      // 2 · The shelf: solutions, not famílias. Ordered by the mechanism
      //     they named (alagamento) inside the família they marked — and it
      //     asks to TEST, in Robson's words, not to commit.
      const options = page.getByTestId('cbo-solution-options');
      await expect(options).toBeVisible({ timeout: 10_000 });
      await expect(page.getByTestId('solution-option-jardins-de-chuva')).toBeVisible();
      await expect(inThreadJ(L.shelfQuestion)).toBeVisible();
      await chip(L.solution).click();

      // 4 · Size. Deferring is a first-class answer: it becomes a named gap
      //     with the ficha's per-m² rate attached, not an empty field.
      await expect(page.getByText(L.sizeText, { exact: false }).last()).toBeVisible({ timeout: 10_000 });
      await chip(L.deferSize).click();

      // 4a · ⚠️ The gap asks once more, by another road. "I don't know the size"
      //      is an honest answer to "how many square metres", and the area is the
      //      one number that decides whether this session produces a total at
      //      all — so it is offered a comparison instead of a measurement, once.
      //      shared/w3-gap-questions.ts.
      await expect(chip(L.sizeByComparison)).toBeVisible({ timeout: 15_000 });
      await chip(L.sizeByComparison).click();

      // 3 · The test card: who has to say yes (read out of the ficha and the
      //     tenure, not summarised by a model), what blocks it, the effect, the
      //     price — and one reaction.
      const card = page.getByTestId('cbo-solution-test-jardins-de-chuva');
      await expect(card).toBeVisible({ timeout: 15_000 });
      await expect(card.getByText('SMAMUS', { exact: false }).first()).toBeVisible();
      await expect(card.getByTestId('solution-test-verdict-needs_study')).toBeVisible();
      await chip(L.reaction).click();

      // 4c · The one detail this solution's ficha says decides whether it works
      //      here. Specific and one tap, instead of an open question at minute
      //      forty. shared/w3-detail-questions.ts.
      await expect(chip(L.detailPick)).toBeVisible({ timeout: 15_000 });
      await chip(L.detailPick).click();

      // 4d · The loop question → the comparison → into the tail.
      await expect(chip(L.seeComparison)).toBeVisible({ timeout: 15_000 });
      await chip(L.seeComparison).click();
      await expect(page.getByTestId('cbo-comparison')).toBeVisible({ timeout: 15_000 });
      await expect(chip(L.detailNow)).toBeVisible({ timeout: 10_000 });
      await chip(L.detailNow).click();

      // 4b · Who builds it — the answer that moves the cost more than any other.
      await expect(chip(L.build)).toBeVisible({ timeout: 15_000 });
      await chip(L.build).click();

      // 5 · Why here (free text) → baseline (free text).
      await expect(page.getByText(L.whyPlain, { exact: false }).first()).toBeVisible({ timeout: 10_000 });
      await input.fill(L.why);
      await input.press('Enter');
      await expect(page.getByText(L.baselineText, { exact: false }).last()).toBeVisible({ timeout: 10_000 });
      await input.fill(L.baseline);
      await input.press('Enter');

      // 5b · The figure was on the test card, with its scale note — one
      //      reaction covered the solution and the number both. Straight on.
      await expect(chip(L.timeframe)).toBeVisible({ timeout: 15_000 });
      await chip(L.timeframe).click();
      await expect(chip(L.monitor)).toBeVisible({ timeout: 15_000 });
      await chip(L.monitor).click();

      // 6 · Upkeep. ⚠️ The land is public-informal, so "Parceria com a
      //     prefeitura" IS offered here — on private land the manifest rule
      //     removes it, which the cross-section spec pins directly.
      await expect(page.getByText(L.maintainsText, { exact: false }).last()).toBeVisible({ timeout: 10_000 });
      await expect(chip(L.maintains)).toBeVisible();
      await chip(L.maintains).click();

      await expect(page.getByText(L.freqText, { exact: false }).first()).toBeVisible({ timeout: 10_000 });
      await chip(L.freq).click();

      // 7 · Money. "Ainda não sabemos" is a real answer and must not block the
      //     close — it is the gap the portfolio carries to the municipality.
      await expect(page.getByText(L.moneyText, { exact: false }).last()).toBeVisible({ timeout: 10_000 });
      await chip(L.money).click();

      // 7a · ⚠️ "We don't know yet" is a real answer, and it is also the one
      //      answer worth asking a second time by another road — not "where
      //      will the money come from" again, but who pays the water and the
      //      mowing TODAY, which is a fact they hold. Asked once. The answer
      //      is stored on its own field: what the city pays for now is a fact
      //      about the present, not a funding model anybody committed to, and
      //      the money gap stays open on the record either way.
      await expect(page.getByText(L.moneyRetryText, { exact: false }).last()).toBeVisible({ timeout: 10_000 });
      await chip(L.moneyRetry).click();

      // 8 · The dossier. (More than one solution is the loop's job now — a
      //     second test, not a last-beat offer.) Public-informal tenure with no technical marker on
      //     this solution… except the rain garden ficha DOES name a soil
      //     infiltration test, so the verdict is needs_study, not
      //     needs_permission: a technical unknown outranks a paperwork one,
      //     because asking permission for something that cannot yet be
      //     designed is asking for the wrong thing.
      const dossier = page.getByTestId('cbo-roadmap');
      await expect(dossier).toBeVisible({ timeout: 15_000 });
      await expect(dossier).toContainText(L.name === 'pt' ? 'precisa de um estudo' : 'needs a study');
      // The benefit range, over the footprint — the half W3 supplies.
      await expect(dossier.getByTestId('roadmap-open')).toBeVisible();
      await expect(dossier.getByTestId('roadmap-steps')).toBeVisible();
      // The school is on public land, so its direction has to be approached —
      // a rule the ficha cannot know and the site record does.
      await expect(dossier.getByText('EMEI', { exact: false }).first()).toBeVisible();

      // 9 · It survives a reload: the dossier is a persisted composer, not a
      //     one-shot render.
      await page.reload();
      await expect(page.getByTestId('cbo-roadmap')).toBeVisible({ timeout: 20_000 });

      // 10 · And it is on the record, not only on the screen.
      const body = await (await request.get(`/api/cbo/${cboId}`)).json();
      const f = (s: string, k: string) => body.state?.sections?.[s]?.fields?.[k]?.value;
      expect(f('intervention_type', 'chosen_solutions')).toBe('jardins-de-chuva');
      expect(f('intervention_type', 'project_verdict')).toBe('needs_study');
      expect(f('operations_sustain', 'who_maintains')).toBe('parceria-prefeitura');
      expect(f('operations_sustain', 'sustainability_model')).toBe('indefinido');
      // ⚠️ The retry's answer lands on its OWN field. If it ever appears as a
      // sustainability_model, a concept note will name a funder nobody
      // committed to — "a prefeitura paga a roçada hoje" is not "a prefeitura
      // financia o projeto".
      expect(f('operations_sustain', 'who_pays_today')).toBe(L.moneyRetry);
      // And the site got a size from the comparison, so the impact figure the
      // page stated was about this place.
      expect(Number(f('intervention_site', 'site_area_m2'))).toBeGreaterThan(0);
      expect(String(f('intervention_type', 'justification_why_here'))).toContain(
        L.name === 'pt' ? 'único pátio' : 'only yard',
      );
    });
  });
}

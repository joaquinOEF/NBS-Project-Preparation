import { test, expect } from '@playwright/test';
import { TestApi } from './helpers/testApi';

// E2 interest + role step (2026-07-16 biweekly commitment): after the famílias
// recommendation, "Faz sentido" no longer closes — it opens two templated chip
// loops (which famílias the org would run a project on, then which role they
// want to play), and only then the closing fires. All server-templated: any
// leak to the model would render the fake model's default turn instead.
//
// The map stages are skipped via a synthetic composite payload posted through
// the API (the chat input is single-line; a typed multiline payload would
// collapse and never match the parser's ^-anchored lines).

test.describe('COUGAR — E2 interest + role loops', () => {
  test.use({ locale: 'pt-BR' });

  test('Faz sentido → famílias interest → role picks (incl. outro papel) → closing, fields persisted', async ({ page, request }) => {
    const api = new TestApi(request);
    test.skip(!(await api.ping()).fakeModel, 'needs the fake model env (for seeding)');

    await page.goto('/cbo-profile');
    const marker = page.getByTestId('cbo-stream-status');
    await expect(marker).toHaveAttribute('data-cbo-id', /.+/, { timeout: 30_000 });
    const cboId = (await marker.getAttribute('data-cbo-id'))!;
    await api.seedState(cboId, { phase: 2 });

    const chip = (label: string) =>
      page.locator(`[data-testid^="cbo-option-"][data-option-label="${label}"]`);
    const input = page.getByTestId('cbo-chat-input');

    // Fast-forward to the site card: one zone + one custom site in a single
    // composite payload, then reload to rehydrate the served checkpoint.
    await request.post(`/api/cbo/${cboId}/chat`, {
      data: {
        message: [
          'Map selection (composite mode):',
          '- [zone] Bela Vista: HIGH risk, intervention: flood parks, area: 1.2 km², pop: 11.128, flood: 78%, heat: 41%, landslide: 12%, at (-30.0327, -51.1898)',
          '- [custom] Terreno da associação at (-30.0330, -51.1900)',
          'Total: 2 assets, 0 sampled points',
        ].join('\n'),
        lang: 'pt',
        turnKind: 'map',
      },
    });
    await page.reload();
    await expect(page.getByTestId('cbo-site-card')).toBeVisible({ timeout: 15_000 });

    // Describe stage (templated) up to the recommendation.
    await chip('Confirmar ✓').click();
    await expect(page.getByText('Como é esse lugar hoje', { exact: false })).toBeVisible({ timeout: 8_000 });
    await chip('Abandonado / degradado').click();
    await expect(page.getByText('acesso a esse espaço', { exact: false })).toBeVisible({ timeout: 8_000 });
    await chip('É da prefeitura, mas a gente usa').click();

    // Tenure now opens the DIAGNOSTIC beats (worry → story → photos → hazard
    // check) rather than the old single "quer anexar fotos do lugar?" step this
    // spec used to expect — see startDiagnostic() in cboAgent.ts. Skip through
    // them the cheapest legitimate way; what this test is actually about starts
    // at the recommendation. The beats themselves are covered in
    // cougar-e2-diagnostic.spec.ts.
    await expect(page.getByText('mais preocupa', { exact: false })).toBeVisible({ timeout: 8_000 });
    await chip('💧 Alagamento').click();          // worry has no skip chip
    await chip('Pronto ✓').click();
    await expect(page.getByText('palavras de vocês', { exact: false })).toBeVisible({ timeout: 8_000 });
    await chip('Prefiro pular').click();
    await expect(page.getByText('fotos ajudam', { exact: false })).toBeVisible({ timeout: 8_000 });
    await chip('Não tenho agora').click();
    await expect(page.getByText('média do bairro', { exact: false })).toBeVisible({ timeout: 8_000 });
    await chip('Não sei dizer').click();

    await expect(page.getByTestId('cbo-familia-reco')).toBeVisible({ timeout: 15_000 });

    // "Faz sentido" now opens the interest question instead of closing.
    await chip('Faz sentido').click();
    await expect(page.getByText('grupos vocês teriam interesse', { exact: false })).toBeVisible({ timeout: 8_000 });
    await expect(page.getByText('por onde começar a estudar', { exact: false })).toHaveCount(0);

    // Interest loop: two picks, then Pronto — each pick re-offers what's left.
    await chip('Gestão de Águas Pluviais').click();
    await expect(page.getByText('Mais alguma?', { exact: false })).toBeVisible({ timeout: 8_000 });
    await expect(chip('Gestão de Águas Pluviais')).toHaveCount(0); // picked → no longer offered
    await chip('Agricultura Urbana').click();
    await expect(chip('Pronto ✓')).toBeVisible({ timeout: 8_000 });
    await chip('Pronto ✓').click();

    // Role loop: one catalog role + the "Outro papel" free-text turn.
    // The intro line renders twice (streamed turn + persisted transcript row).
    await expect(page.getByText('papel a organização', { exact: false }).first()).toBeVisible({ timeout: 8_000 });
    await chip('Escrever o projeto').click();
    await expect(page.getByText('Mais algum papel?', { exact: false })).toBeVisible({ timeout: 8_000 });
    await chip('Outro papel').click();
    await expect(page.getByText('Me conta: que papel', { exact: false })).toBeVisible({ timeout: 8_000 });
    await input.fill('Mobilizar as famílias do entorno');
    await input.press('Enter');
    await expect(chip('Pronto ✓')).toBeVisible({ timeout: 8_000 });
    await chip('Pronto ✓').click();

    // Two convening questions stand between the roles and the closing now
    // (backlog #26): the Teia Sprint application, then whether they have worked
    // with other orgs in the network.
    await expect(chip('Não mandamos')).toBeVisible({ timeout: 8_000 });
    await chip('Não mandamos').click();
    await expect(chip('Ainda não')).toBeVisible({ timeout: 8_000 });
    await chip('Ainda não').click();

    // Closing only now.
    await expect(page.getByText('por onde começar a estudar', { exact: false })).toBeVisible({ timeout: 8_000 });

    // Both fields persisted with canonical ids (+ the free-text role verbatim).
    const body = await (await request.get(`/api/cbo/${cboId}`)).json();
    const fields = body.state?.sections?.intervention_site?.fields ?? {};
    expect(String(fields.nbs_interest?.value)).toBe('aguas-pluviais, agricultura-urbana');
    expect(String(fields.role_preference?.value)).toContain('escrever-projeto');
    expect(String(fields.role_preference?.value)).toContain('outro: Mobilizar as famílias do entorno');

    // Reload: the loops are over; the transcript still ends at the closing.
    await page.reload();
    await expect(page.getByText('por onde começar a estudar', { exact: false })).toBeVisible({ timeout: 20_000 });
  });
});

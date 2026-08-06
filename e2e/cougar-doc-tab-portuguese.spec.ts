import { test, expect } from '@playwright/test';
import { TestApi } from './helpers/testApi';

// ⚠️ CBO-DOC-TAB-ENGLISH (JVP, 2026-08-06: "some fields in the doc (titles etc)
// in the tab of the CBO are written in english, can you review?").
//
// Two mechanisms, both invisible to every existing spec because they only show
// up once a section past `org_profile` has real values in it:
//
//  1. LABELS — the panel does `t('cbo.fields.' + key, key.replace(/_/g,' '))`,
//     and i18n is configured pt→pt (never pt→en), so a key missing from pt.json
//     renders that English `defaultValue` verbatim. 37 of the 39 fields the
//     agent writes had no key: "site worry", "current use", "nbs interest".
//  2. VALUES — `orgProfileDisplayValue` was applied ONLY to org_profile, so
//     every other section printed the raw machine id: `private-owned`,
//     `aguas-pluviais`, `under-construction`.
//
// The Portuguese existed the whole time — the chips the org tapped are built
// from the same tables. So this asserts the property that was actually false:
// on a pt document, nothing reaches the screen in English.

const SEEDED = [
  // [section, field, stored value, what a pt reader must see]
  ['intervention_site', 'bairro', 'Sarandi', null],
  ['intervention_site', 'current_use', 'abandoned', 'Abandonado / degradado'],
  ['intervention_site', 'land_tenure', 'public-informal', 'É da prefeitura, mas a gente usa'],
  ['intervention_site', 'site_worry', 'flood,heat', 'Alagamento'],
  ['intervention_site', 'nbs_interest', 'aguas-pluviais,agricultura-urbana', 'Gestão de Águas Pluviais'],
  ['intervention_site', 'role_preference', 'executar', 'Executar / implementar'],
  ['intervention_site', 'site_photo_intent', 'sent', 'Enviou fotos'],
  ['intervention_site', 'site_knowledge_depth', 'strong', 'Bem detalhado'],
  ['intervention_site', 'primary_hazard', 'landslide', 'Deslizamento'],
  ['intervention_site', 'community_anchoring_lead', 'Dona Marlene', null],
  ['intervention_site', 'community_engagement_methods', 'mutirão mensal', null],
  ['intervention_site', 'site_story', 'Quando chove forte a água entra pelo fundo.', null],
] as const;

/** Humanized keys — exactly what the panel printed before, and must not now. */
const ENGLISH_LABELS = [
  'site worry', 'current use', 'nbs interest', 'role preference', 'site story',
  'site photo intent', 'site knowledge depth', 'primary hazard',
  'community anchoring lead', 'community engagement methods',
];

/** Raw machine ids that were reaching the screen as values. */
const RAW_IDS = ['public-informal', 'aguas-pluviais', 'agricultura-urbana', 'abandoned', 'strong', 'landslide'];

test.describe('CBO document tab — a pt-BR org reads Portuguese', () => {
  test.use({ locale: 'pt-BR', viewport: { width: 1512, height: 900 } });

  test('no English labels, no raw enum ids', async ({ page, request }) => {
    test.setTimeout(120_000);
    const api = new TestApi(request);
    test.skip(!(await api.ping()).fakeModel, 'needs the fake model');

    await page.goto('/cbo-profile');
    const marker = page.getByTestId('cbo-stream-status');
    await expect(marker).toHaveAttribute('data-cbo-id', /.+/, { timeout: 30_000 });
    const cboId = (await marker.getAttribute('data-cbo-id'))!;

    await api.seedState(cboId, {
      phase: 2,
      language: 'pt',
      orgName: 'Horta Comunitária Raízes do Sarandi',
      sections: SEEDED.map(([sectionId, field, value]) => ({ sectionId, field, value })),
      maturity: [{ metric: 'site_control', score: 2 }],
    });

    await page.reload();
    await expect(marker).toHaveAttribute('data-cbo-id', /.+/, { timeout: 30_000 });
    // The panel starts closed on desktop — the edge strip opens it.
    await page.getByTestId('cbo-strip-document').click();
    await expect(page.getByTestId('cbo-tab-document')).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText('Onde Atuamos', { exact: false })).toBeVisible({ timeout: 15_000 });

    const panel = await page.evaluate(() => document.body.innerText);

    for (const bad of ENGLISH_LABELS) {
      expect(panel.toLowerCase(), `"${bad}" is an untranslated field key on a pt document`)
        .not.toContain(bad);
    }
    for (const id of RAW_IDS) {
      expect(panel, `"${id}" is a machine id, not something a person reads`).not.toContain(id);
    }

    // …and the Portuguese the org already saw on the chips is what it now reads
    // back on its own document.
    for (const [, , , expected] of SEEDED) {
      if (expected) expect(panel, `expected the pt label "${expected}"`).toContain(expected);
    }

    await page.screenshot({ path: 'test-results/doc-tab-pt.png', fullPage: true });
  });

  test('the downloaded profile is Portuguese too, and carries no internals', async ({ page, request }) => {
    test.setTimeout(120_000);
    const api = new TestApi(request);
    test.skip(!(await api.ping()).fakeModel, 'needs the fake model');

    await page.goto('/cbo-profile');
    const marker = page.getByTestId('cbo-stream-status');
    await expect(marker).toHaveAttribute('data-cbo-id', /.+/, { timeout: 30_000 });
    const cboId = (await marker.getAttribute('data-cbo-id'))!;

    await api.seedState(cboId, {
      phase: 2,
      language: 'pt',
      orgName: 'Horta Comunitária Raízes do Sarandi',
      sections: [
        ...SEEDED.map(([sectionId, field, value]) => ({ sectionId, field, value })),
        // Machinery: hidden in the panel by isInternalCboField, but the export
        // dumped it into the middle of the org's own document as raw JSON.
        { sectionId: 'intervention_site', field: '_depth_json', value: '{"level":"strong","score":7}' },
      ],
      maturity: [{ metric: 'site_control', score: 2 }],
    });

    const md = await (await request.get(`/api/cbo/${cboId}/export`)).text();

    expect(md, 'the heading was "CBO Intervention Profile"').toContain('Perfil de Intervenção Comunitária');
    expect(md, 'section titles came from the English CBO_SECTIONS literals').toContain('2. Onde Atuamos');
    expect(md).not.toContain('Where We Work');
    expect(md).not.toContain('Not yet filled');
    expect(md, 'field keys were humanized English here too').not.toContain('site worry');
    expect(md, 'values were raw ids here too').not.toContain('public-informal');
    expect(md).toContain('É da prefeitura, mas a gente usa');
    expect(md, 'the maturity table header').toContain('| Métrica |');
    expect(md, 'internal machinery must not be in the org-facing document').not.toContain('_depth_json');
  });
});

// The round trip the localization opens up: the panel shows a label, so a
// manual edit sends that label back — and intervention_site stores IDS, which
// the E2 checkpoint loops compare against.
test.describe('editing a localized value keeps the stored form', () => {
  test.use({ locale: 'pt-BR' });

  test('a label edited in the panel is stored as the id again', async ({ page, request }) => {
    test.setTimeout(120_000);
    const api = new TestApi(request);
    test.skip(!(await api.ping()).fakeModel, 'needs the fake model');

    await page.goto('/cbo-profile');
    const marker = page.getByTestId('cbo-stream-status');
    await expect(marker).toHaveAttribute('data-cbo-id', /.+/, { timeout: 30_000 });
    const cboId = (await marker.getAttribute('data-cbo-id'))!;

    await api.seedState(cboId, {
      phase: 2, language: 'pt',
      sections: [{ sectionId: 'intervention_site', field: 'nbs_interest', value: 'aguas-pluviais' }],
    });

    // Exactly what the panel renders — a person editing this field is editing
    // labels, because that is now all they can see.
    await request.post(`/api/cbo/${cboId}/edit`, {
      data: {
        sectionId: 'intervention_site',
        field: 'nbs_interest',
        value: 'Gestão de Águas Pluviais, Agricultura Urbana',
      },
    });

    const state = (await (await request.get(`/api/cbo/${cboId}`)).json()).state;
    const stored = String(state.sections.intervention_site.fields.nbs_interest.value);
    expect(stored, 'the checkpoint loops compare against ids, not labels')
      .toBe('aguas-pluviais,agricultura-urbana');
  });
});

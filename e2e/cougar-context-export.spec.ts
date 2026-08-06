import { test, expect } from '@playwright/test';
import JSZip from 'jszip';
import { randomUUID } from 'node:crypto';
import { TestApi } from './helpers/testApi';

// Context bundle — one org, one zip (JVP, 2026-08-03: "an export button which
// downloads a folder with all that we have that you or another agent can read
// to get the full context bundle of that org").
//
// The interesting assertions are not "a file exists". They are the two honesty
// rules the format exists to enforce, both of which a plausible-looking export
// would quietly break:
//
//  1. Risk figures are neighbourhood means. A bundle that prints them next to a
//     street address, unqualified, undoes the entire W2 diagnostic.
//  2. The recommendation says where it came from. When the model ranker didn't
//     run, the bundle must SAY that what the org shared changed nothing — that
//     is exactly the question the export was asked for.

async function seedOrgWithSession(request: any) {
  const api = new TestApi(request);
  // Own throwaway cohort + a coordinator scoped to it — the export route is
  // ownership-gated, so the spec has to hold a real coordinator session (which
  // createCoordinator sets as a cookie on this `request` fixture).
  const cohort = (await api.createCohort(`Export ${randomUUID().slice(0, 8)}`)).cohort;
  await api.createCoordinator({
    email: `export-${randomUUID()}@e2e.test`,
    password: 'pw-123456',
    cohortId: cohort.id,
  });
  const created = await request.post(`/__test/cohort/${cohort.id}/member`, {
    data: { orgName: `Export Test ${Date.now()}`, neighborhood: 'Partenon', unlockedPhases: [1, 2], withSession: true },
  });
  const body = await created.json();
  return { api, slug: cohort.coordinatorSlug, member: body.member, inviteUrl: body.inviteUrl as string };
}

/** The invite flow gates the chat behind a welcome screen and an encontro
 *  preamble, and a reload puts both back. Idempotent — each click is optional. */
async function enterChat(page: any) {
  await page.getByTestId('button-cbo-welcome-cta').click({ timeout: 15_000 }).catch(() => {});
  await page.getByTestId('button-encontro-2-start').click({ timeout: 15_000 }).catch(() => {});
  await expect(page.getByTestId('cbo-stream-status')).toHaveAttribute('data-cbo-id', /.+/, { timeout: 30_000 });
}

test.describe('COUGAR — per-org context bundle export', () => {
  test('the zip carries a readable context.md, the transcript, the profile and the files', async ({ page, request }) => {
    test.setTimeout(180_000);
    const api = new TestApi(request);
    test.skip(!(await api.ping()).fakeModel, 'needs the fake model');

    const { slug, member, inviteUrl } = await seedOrgWithSession(request);

    // Give the org a real W2 session: a site, a story, corrections, famílias.
    const cboId = member.cboStateId as string;
    expect(cboId, 'the seeded member must have a session').toBeTruthy();
    await api.seedState(cboId, { phase: 2 });
    // The invite token is how a real org reaches its own session; it lands on
    // the welcome screen, and the CTA is what opens the chat shell.
    await page.goto(inviteUrl);
    await enterChat(page);

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
    await enterChat(page);
    await expect(page.getByTestId('cbo-site-card')).toBeVisible({ timeout: 20_000 });
    await chip('Confirmar ✓').click();
    await expect(page.getByText('Como é esse lugar hoje', { exact: false })).toBeVisible({ timeout: 10_000 });
    await chip('Pavimentado / impermeabilizado').click();
    await expect(page.getByText('acesso a esse espaço', { exact: false })).toBeVisible({ timeout: 10_000 });
    await chip('É da prefeitura, mas a gente usa').click();
    await expect(page.getByText('mais preocupa', { exact: false })).toBeVisible({ timeout: 10_000 });
    await chip('🌡️ Calor').click();
    await chip('Pronto ✓').click();
    await expect(page.getByText('palavras de vocês', { exact: false })).toBeVisible({ timeout: 10_000 });
    const input = page.getByTestId('cbo-chat-input');
    await input.fill('O pátio é todo pavimentado e não tem sombra nenhuma no verão.');
    await input.press('Enter');
    await expect(page.getByText('fotos ajudam', { exact: false })).toBeVisible({ timeout: 15_000 });
    await chip('Não tenho agora').click();
    await expect(page.getByText('média do bairro', { exact: false })).toBeVisible({ timeout: 10_000 });
    await chip('Aqui é pior').click();
    await expect(page.getByTestId('cbo-familia-reco')).toBeVisible({ timeout: 30_000 });

    // ── Export ────────────────────────────────────────────────────────────
    const res = await request.get(`/api/cohort/${slug}/member/${member.id}/export`);
    expect(res.status()).toBe(200);
    expect(res.headers()['content-type']).toContain('zip');
    expect(res.headers()['content-disposition']).toMatch(/attachment; filename=".*-contexto\.zip"/);

    const zip = await JSZip.loadAsync(await res.body());
    const names = Object.keys(zip.files);
    expect(names).toEqual(expect.arrayContaining(['context.md', 'transcricao.md', 'perfil.json']));

    const context = await zip.file('context.md')!.async('string');

    // Their own words come FIRST — before any of our numbers.
    expect(context).toMatch(/Nas palavras da organização/);
    expect(context).toContain('não tem sombra nenhuma');
    expect(context.indexOf('Nas palavras da organização')).toBeLessThan(context.indexOf('## O lugar'));

    // RULE 1 — no risk figure is presented as measured at the site.
    expect(context).toMatch(/médias? do BAIRRO INTEIRO/i);
    for (const line of context.split('\n')) {
      if (/^- (Enchente|Calor|Deslizamento): \*\*\d+/.test(line)) {
        expect(line, 'a risk line without its bairro caveat').toContain('média do bairro');
      }
    }

    // The correction the org made must survive into the bundle — it is the most
    // valuable thing W2 produces and the easiest for a summary to flatten.
    expect(context).toMatch(/corrigiu nos nossos dados/);
    expect(context).toMatch(/PIOR do que o nosso número/);

    // RULE 2 — the recommendation states its provenance. With no model key in
    // the e2e env this is the fallback, which must say so plainly rather than
    // implying the story shaped the list.
    // NOTE: the "Famílias recomendadas" provenance block needs `_reco_json`,
    // which is written by the context-aware ranker in #436 (open, not merged).
    // The bundle omits the section when it is absent, so this asserts the shape
    // conditionally; the rendering itself is covered directly below.
    const profileRaw = await zip.file('perfil.json')!.async('string');
    if (profileRaw.includes('_reco_json')) {
      expect(context).toMatch(/Famílias recomendadas/);
    }

    // ⚠️ The bundle is a PORTUGUESE document — every heading in it is pt — and
    // "readable by you or another agent" was the whole ask. It was still
    // printing the raw field key and the raw stored id: `- **site_worry**:
    // heat`, under `### 2. Where We Work`. Missed in the first doc-tab pass
    // (2026-08-06) because this is the fourth surface that renders a profile,
    // and the other three had specs.
    expect(context, 'the English section literal from CBO_SECTIONS').not.toContain('Where We Work');
    expect(context).toContain('2. Onde Atuamos');
    expect(context, 'raw field keys are not readable prose').not.toMatch(/\*\*(site_worry|current_use|land_tenure|site_story)\*\*/);
    expect(context, 'raw enum ids are not readable prose').not.toMatch(/\*\*[^*]+\*\*: (public-informal|paved|heat)\b/);
    expect(context).toContain('É da prefeitura, mas a gente usa');
    expect(context).toContain('Pavimentado / impermeabilizado');

    // Internal checkpoint machinery stays out of the readable summary…
    expect(context).not.toMatch(/_worry_done|_photos_done|_reco_json/);
    // …but survives in the raw profile, which is the point of shipping both.
    const profile = JSON.parse(profileRaw);
    expect(profile.sections.intervention_site.fields.site_story?.value).toContain('sombra');
    expect(profile.phase).toBe(2);

    const transcript = await zip.file('transcricao.md')!.async('string');
    expect(transcript).toContain('não tem sombra nenhuma');
  });

  test('export is ownership-gated and 404s for a member of another cohort', async ({ request }) => {
    const api = new TestApi(request);
    test.skip(!(await api.ping()).fakeModel, 'needs the fake model');
    const { slug } = await seedOrgWithSession(request);
    // Authenticated, but the member isn't in this cohort → 404, never a bundle.
    const unknown = await request.get(`/api/cohort/${slug}/member/does-not-exist/export`);
    expect(unknown.status()).toBe(404);
  });
});

// ── The provenance block, rendered directly ──────────────────────────────────
// This is the reason the export was asked for: "the photos and the voice note —
// how did that impact the famílias recommended?" The bundle must answer it
// honestly in BOTH directions, including the uncomfortable one where nothing
// the org shared reached the ranking. Driven against buildContextMarkdown so it
// is covered without a model key and without the flow that writes `_reco_json`.

import { buildContextMarkdown } from '../server/services/contextBundle';

function stateWithReco(reco: Record<string, unknown>) {
  const field = (value: string) => ({ value, confidence: 'high', source: 'user', userEdited: false });
  return {
    sections: {
      intervention_site: {
        fields: {
          site_name: field('Pátio da escola'),
          bairro: field('Partenon'),
          _bairro_flood_pct: field('22'),
          _bairro_heat_pct: field('51'),
          _reco_json: field(JSON.stringify(reco)),
        },
      },
    },
    maturityScores: [],
  } as any;
}

const BASE = { orgName: 'Org', messages: [], docs: [], generatedAt: '2026-08-03 12:00' };

test.describe('context bundle — the recommendation states its provenance', () => {
  test('when the model read the story, it shows what our data alone would have said', () => {
    const md = buildContextMarkdown({
      ...BASE,
      state: stateWithReco({
        source: 'model',
        usedStory: true,
        served: ['verde-urbano', 'aguas-pluviais'],
        baseline: ['aguas-pluviais', 'verde-urbano'],
      }),
    } as any);
    expect(md).toMatch(/Como esta lista foi feita/);
    expect(md).toMatch(/O que só os nossos dados diriam/);
    // The labels are human, not ids — this is read by coordinators and partners.
    expect(md).toContain('Infraestrutura Verde Urbana');
    expect(md).not.toMatch(/^\d+\. verde-urbano$/m);
  });

  test('when it fell back, it says plainly that the story changed nothing', () => {
    const md = buildContextMarkdown({
      ...BASE,
      state: stateWithReco({
        source: 'deterministic',
        fallbackReason: 'no API key',
        usedStory: true,
        served: ['aguas-pluviais'],
        baseline: ['aguas-pluviais'],
      }),
    } as any);
    expect(md).toMatch(/Esta lista saiu apenas dos nossos dados/);
    expect(md).toMatch(/não\*\* influenciou esta ordem/);
    expect(md).toContain('no API key');
  });

  test('risk lines always carry the bairro caveat, and internals stay out', () => {
    const md = buildContextMarkdown({ ...BASE, state: stateWithReco({ source: 'model', served: [], baseline: [] }) } as any);
    for (const line of md.split('\n')) {
      if (/^- (Enchente|Calor|Deslizamento): \*\*\d+/.test(line)) expect(line).toContain('média do bairro');
    }
    expect(md).not.toMatch(/_bairro_flood_pct|_reco_json/);
  });
});

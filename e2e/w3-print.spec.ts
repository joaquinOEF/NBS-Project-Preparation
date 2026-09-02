import { test, expect } from '@playwright/test';
import { TestApi } from './helpers/testApi';

// The printed hoja de ruta — the copy that goes into a room.
//
// These pin what has to survive the trip from screen to paper. The organisation
// will read this in front of neighbours who did not sit through the workshop,
// and the failure that costs most is a draft mistaken for a decision.

const W2_W3 = [
  { sectionId: 'org_profile', field: 'org_name', value: 'Horta Raízes do Sarandi' },
  { sectionId: 'org_profile', field: 'contact_name', value: 'Marlene Duarte' },
  { sectionId: 'org_profile', field: 'contact_role', value: 'coordenadora' },
  { sectionId: 'org_profile', field: 'year_founded', value: '2014' },
  { sectionId: 'org_profile', field: 'team_size', value: '22' },
  { sectionId: 'org_profile', field: 'has_cnpj', value: 'yes' },
  { sectionId: 'org_profile', field: 'prior_project_scale', value: 'funded' },
  { sectionId: 'intervention_site', field: 'bairro', value: 'Sarandi' },
  { sectionId: 'intervention_site', field: 'site_name', value: 'Terreno ao lado da horta' },
  { sectionId: 'intervention_site', field: '_site_lat', value: '-30.0906' },
  { sectionId: 'intervention_site', field: '_site_lng', value: '-51.1726' },
  { sectionId: 'intervention_site', field: 'land_tenure', value: 'public-informal' },
  { sectionId: 'intervention_site', field: 'site_worry', value: 'alagamento' },
  { sectionId: 'intervention_site', field: 'site_story', value: 'Quando chove forte a água entra pelo fundo.' },
  { sectionId: 'intervention_site', field: 'site_area_m2', value: '500' },
  { sectionId: 'intervention_site', field: 'bairro_population', value: '59707' },
  { sectionId: 'intervention_site', field: '_bairro_flood_pct', value: '80' },
  { sectionId: 'intervention_type', field: 'chosen_solutions', value: 'jardins-de-chuva' },
  { sectionId: 'intervention_type', field: 'construction_model', value: 'mista' },
  { sectionId: 'intervention_type', field: 'justification_why_here', value: 'É o único terreno livre do quarteirão.' },
  { sectionId: 'impact_monitoring', field: 'baseline_condition', value: 'Terra batida com entulho.' },
  { sectionId: 'operations_sustain', field: 'who_maintains', value: 'parceria-prefeitura' },
  { sectionId: 'operations_sustain', field: 'sustainability_model', value: 'indefinido' },
];

// ⚠️ ZONE-LINE-TWO-FORMATS. The zone line the map sends carries two different
// number formats, and conflating them documents a neighbourhood as 234% poor.
//
//   pop      → toLocaleString() — locale separators. "59.707" (pt-BR) and
//              "59,707" (en-US) both mean 59707.
//   poverty  → toFixed(1) — a plain decimal point, always. "23.4".
//   priority → toFixed(2) — likewise. "0.91".
//
// The first version stripped every dot, which is right for the first and
// destroys the other two. These are pure-string tests because the parser lives
// inside a checkpoint and this is the part that has to be right.
test.describe('the zone line carries two number formats', () => {
  const parse = (rest: string) => {
    const int = (re: RegExp) => { const h = re.exec(rest); return h ? Number(h[1].replace(/[.,\s]/g, '')) : undefined; };
    const dec = (re: RegExp) => { const h = re.exec(rest); return h ? Number(h[1]) : undefined; };
    return {
      flood: dec(/flood: (\d+)%/) ?? 0,
      population: int(/pop: ([\d.,]+)/),
      povertyPct: dec(/poverty: ([\d.]+)%/),
      priority: dec(/priority: ([\d.]+)/),
    };
  };
  const REST = 'FLOOD risk, area: 12.4 km², pop: {POP}, poverty: 23.4%, priority: 0.91, flood: 80%, heat: 40%, landslide: 5%';

  test('a decimal is never mistaken for a thousands separator', () => {
    const r = parse(REST.replace('{POP}', '59.707'));
    expect(r.povertyPct, '23.4% must not become 234').toBe(23.4);
    expect(r.priority, '0.91 must not become 91').toBe(0.91);
    expect(r.population).toBe(59707);
  });

  test('population survives either locale', () => {
    expect(parse(REST.replace('{POP}', '59.707')).population).toBe(59707);
    expect(parse(REST.replace('{POP}', '59,707')).population).toBe(59707);
  });

  test('a zone line without the optional fields still parses', () => {
    const r = parse('risk, area: 3.1 km², flood: 12%, heat: 55%, landslide: 91%');
    expect(r.flood).toBe(12);
    expect(r.population).toBeUndefined();
    expect(r.povertyPct).toBeUndefined();
  });
});

test.describe('the printed hoja de ruta', () => {
  test('it is a document, and it says RASCUNHO before anything else', async ({ page, request }) => {
    const api = new TestApi(request);
    test.skip(!(await api.ping()).fakeModel, 'needs the fake model (for seeding)');

    await page.goto('/cbo-profile');
    const marker = page.getByTestId('cbo-stream-status');
    await expect(marker).toHaveAttribute('data-cbo-id', /.+/, { timeout: 30_000 });
    const cboId = (await marker.getAttribute('data-cbo-id'))!;
    await api.seedState(cboId, { phase: 3, language: 'pt', sections: W2_W3 });

    const res = await request.get(`/api/cbo/${cboId}/roadmap`);
    expect(res.ok()).toBe(true);
    expect(res.headers()['content-type']).toContain('text/html');
    const html = await res.text();

    // ⚠️ A draft mistaken for a decision is the failure that costs most here,
    // so the word comes before the project name — in the BODY, which is what
    // prints. (The <title> legitimately leads with the solution: that is the
    // browser tab and the default PDF filename, where the project name is what
    // you want to see.)
    const body = html.slice(html.indexOf('<body'));
    expect(body.indexOf('RASCUNHO')).toBeGreaterThan(-1);
    expect(body.indexOf('RASCUNHO')).toBeLessThan(body.indexOf('Jardins de chuva'));

    // The money disclaimer travels with the figure, not as a footnote.
    expect(html).toContain('R$ 200.000');
    expect(html).toContain('não representa recurso disponível');

    // The five things Encontros 1 and 2 captured and the card never showed.
    expect(html, 'proponent').toContain('Marlene Duarte');
    expect(html, 'proponent facts').toContain('atua desde 2014');
    expect(html, 'territorial context').toContain('59.707');
    expect(html, 'counterpart contribution').toContain('anos de presença no território');
    // A person carries the org's steps, not an institution.
    expect(html).toMatch(/→ Marlene Duarte \(coordenadora\)/);

    // Provenance survives onto paper — it is what makes a line arguable.
    // ⚠️ Spelled out, not glyphed: `←` and `↻` were our own shorthand, legible
    // to whoever built the page and to nobody reading it in an assembly.
    expect(html).toContain('Fonte:');
    expect(html).toContain('Revisar com:');

    // Self-contained: it has to render on an old phone with no data left.
    expect(html).not.toMatch(/<link[^>]+stylesheet/);
    expect(html).not.toMatch(/<script[^>]*src=/);
  });

  test('it rebuilds from live state, so paper and screen cannot disagree', async ({ page, request }) => {
    const api = new TestApi(request);
    test.skip(!(await api.ping()).fakeModel, 'needs the fake model (for seeding)');

    await page.goto('/cbo-profile');
    const marker = page.getByTestId('cbo-stream-status');
    await expect(marker).toHaveAttribute('data-cbo-id', /.+/, { timeout: 30_000 });
    const cboId = (await marker.getAttribute('data-cbo-id'))!;
    await api.seedState(cboId, { phase: 3, language: 'pt', sections: W2_W3 });

    expect(await (await request.get(`/api/cbo/${cboId}/roadmap`)).text()).toContain('Jardins de chuva');

    // Correct an answer after the session closed — the printed copy must follow.
    await api.seedState(cboId, {
      phase: 3, language: 'pt',
      sections: [{ sectionId: 'intervention_type', field: 'chosen_solutions', value: 'hortas-urbanas' }],
    });
    const after = await (await request.get(`/api/cbo/${cboId}/roadmap`)).text();
    expect(after).toContain('Hortas urbanas');
    expect(after).not.toContain('Jardins de chuva');
  });

  test('English renders too', async ({ page, request }) => {
    const api = new TestApi(request);
    test.skip(!(await api.ping()).fakeModel, 'needs the fake model (for seeding)');
    await page.goto('/cbo-profile');
    const marker = page.getByTestId('cbo-stream-status');
    await expect(marker).toHaveAttribute('data-cbo-id', /.+/, { timeout: 30_000 });
    const cboId = (await marker.getAttribute('data-cbo-id'))!;
    await api.seedState(cboId, { phase: 3, language: 'pt', sections: W2_W3 });

    const html = await (await request.get(`/api/cbo/${cboId}/roadmap?lang=en`)).text();
    expect(html).toContain('DRAFT');
    expect(html).toContain('Rain gardens');
    expect(html).toContain('does not represent available funds');
  });
});

import { test, expect } from '@playwright/test';
import { TestApi } from './helpers/testApi';

// W2 (Aug 2026): the map failed for two of the three orgs that reached it. Ksa
// Rosa reported "não abre o mapa" three times; COOP20 marked and rejected four
// pins ~20m apart over thirteen minutes. Both gave up and typed the address,
// and both were understood — but only as prose. The site checkpoint fires on
// MAP output, so a typed address produced no coordinates at all: Ksa Rosa
// finished E2 with a site_address and no _site_lat/_site_lng.
//
// An address now renders into the map's own text protocol and runs the SAME
// checkpoint, so the site card, the risk pinning and the coordinates are
// identical either way.
test.describe('COUGAR — E2 site placed from a typed address', () => {
  test('an address yields coordinates and the normal site card', async ({ request }) => {
    const api = new TestApi(request);
    const ping = await api.ping();
    test.skip(!ping.fakeModel, 'CBO_FAKE_MODEL is not enabled — skipping deterministic spec.');

    const cohort = (await api.createCohort('Address cohort')).cohort;
    const { member } = await api.inviteMember(cohort.id, { orgName: 'Ksa Test', withSession: true });
    const cboId = member.cboStateId as string;
    await api.seedState(cboId, { phase: 2 });

    // The bairro checkpoint runs first and writes _bairros_json — exactly the
    // state Ksa Rosa was in when her map then refused to open.
    await request.post(`/api/cbo/${cboId}/chat`, {
      data: {
        message: [
          'Map selection (composite mode):',
          '- [zone] Floresta: FLOOD_HEAT risk, intervention: cooling network, area: 1.9 km², pop: 14.972, flood: 93%, heat: 94%, landslide: 63%, at (-30.0198, -51.2115)',
          'Total: 1 assets, 0 sampled points',
        ].join('\n'),
        lang: 'pt',
        turnKind: 'map',
      },
    });

    const res = await request.post(`/__test/cbo/${cboId}/locate-by-address`, {
      data: { address: 'Voluntários da Pátria 1039' },
    });
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(body.ok, 'the address was placed').toBe(true);
    expect(
      body.events.some((e: any) => e.type === 'show_site_card'),
      'the org gets the same site card a pin would have produced',
    ).toBe(true);

    // The point of the whole change: coordinates exist without a working map.
    const state = await (await request.get(`/api/cbo/${cboId}`)).json();
    const f = state.state?.sections?.intervention_site?.fields ?? {};
    expect(f._site_lat?.value, 'latitude written from the address').toBeTruthy();
    expect(f._site_lng?.value, 'longitude written from the address').toBeTruthy();
    expect(String(f.site_name?.value ?? '')).toContain('Voluntários da Pátria');
    // And the bairro risk numbers are pinned exactly as the map path pins them.
    expect(String(f._bairro_flood_pct?.value)).toBe('93');
  });

  test('with no bairro confirmed it refuses rather than inventing a location', async ({ request }) => {
    const api = new TestApi(request);
    const ping = await api.ping();
    test.skip(!ping.fakeModel, 'CBO_FAKE_MODEL is not enabled — skipping deterministic spec.');

    const cohort = (await api.createCohort('Address cohort')).cohort;
    const { member } = await api.inviteMember(cohort.id, { orgName: 'Ksa Test', withSession: true });
    const cboId = member.cboStateId as string;
    await api.seedState(cboId, { phase: 2 });

    const res = await request.post(`/__test/cbo/${cboId}/locate-by-address`, {
      data: { address: 'Rua Qualquer 123' },
    });
    const body = await res.json();
    expect(body.ok, 'no bairro yet → no placement').toBe(false);
    expect(body.agentMessage, 'and the model is told not to fabricate one').toContain('Do NOT invent coordinates');

    const state = await (await request.get(`/api/cbo/${cboId}`)).json();
    const f = state.state?.sections?.intervention_site?.fields ?? {};
    expect(f._site_lat?.value ?? null, 'nothing was written').toBeFalsy();
  });
});

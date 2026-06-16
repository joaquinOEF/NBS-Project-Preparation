import { test, expect } from '@playwright/test';
import { TestApi } from './helpers/testApi';

// E2 site persistence (gaps 1 & 4) — the chosen intervention site is stored as
// STRUCTURED data (GeoJSON geometry + coordinates) instead of dissolving into a
// chat string, and uploaded photos link to that site.

test.describe('COUGAR — E2 persist the chosen site + link photos', () => {
  test('site routes: PUT a polygon site, link a photo, and 409 before any site', async ({ request }) => {
    const api = new TestApi(request);
    const { cohort } = await api.createCohort('e2e site api');
    const { member } = await api.inviteMember(cohort.id, { orgName: 'Org Poly' });
    const slug: string = member.memberSlug;

    // No site yet → linking a photo is a no-op 409.
    const early = await request.post(`/api/cbo-member/${slug}/site/photo`, { data: { path: '/x/early.jpg' } });
    expect(early.status()).toBe(409);

    // PUT a drawn-polygon site.
    const put = await request.put(`/api/cbo-member/${slug}/site`, {
      data: {
        name: 'Praça da Horta', kind: 'custom', coordinates: [-30.05, -51.21],
        geometry: { type: 'Polygon', coordinates: [[[-51.21, -30.05], [-51.20, -30.05], [-51.20, -30.04], [-51.21, -30.05]]] },
        source: 'user-added', neighborhood: 'Cascata',
      },
    });
    expect(put.ok()).toBeTruthy();
    const saved = (await put.json()).site;
    expect(saved.geometry.type).toBe('Polygon');
    expect(saved.neighborhood).toBe('Cascata');

    // Now linking a photo appends it to the site.
    const link = await request.post(`/api/cbo-member/${slug}/site/photo`, { data: { path: '/uploads/site1.jpg' } });
    expect(link.ok()).toBeTruthy();
    expect((await link.json()).site.photos).toContain('/uploads/site1.jpg');

    // It surfaces on the member payload.
    const payload = await (await request.get(`/api/cbo-member/${slug}`)).json();
    expect(payload.site.name).toBe('Praça da Horta');
    expect(payload.site.photos).toContain('/uploads/site1.jpg');
  });
});

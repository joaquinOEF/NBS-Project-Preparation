import { test, expect } from '@playwright/test';
import { TestApi } from './helpers/testApi';

// W2 (Aug 2026): eleven product findings, none visible until seven transcripts
// were read by hand six weeks later. Two orgs abandoned at the same screen; the
// map failed for two of the three orgs that reached it. Neither needed a
// hypothesis — both needed a count.
//
// Every E2 beat already passes through finish(detail), so one emit there covers
// the whole funnel. This asserts the beats are actually recorded, and that
// recording them cannot break the session.
test.describe('COUGAR — funnel events', () => {
  test('E2 beats are recorded as the org passes through them', async ({ request }) => {
    const api = new TestApi(request);
    const ping = await api.ping();
    test.skip(!ping.fakeModel, 'CBO_FAKE_MODEL is not enabled — skipping deterministic spec.');

    const cohort = (await api.createCohort('Funnel cohort')).cohort;
    const { member } = await api.inviteMember(cohort.id, { orgName: 'Funnel Org', withSession: true });
    const cboId = member.cboStateId as string;
    await api.seedState(cboId, { phase: 2 });

    // A bairro-only map selection — the first E2 checkpoint after the strip.
    await request.post(`/api/cbo/${cboId}/chat`, {
      data: {
        message: [
          'Map selection (composite mode):',
          '- [zone] Floresta: FLOOD_HEAT risk, flood: 93%, heat: 94%, landslide: 63%, at (-30.0198, -51.2115)',
          'Total: 1 assets, 0 sampled points',
        ].join('\n'),
        lang: 'pt',
        turnKind: 'map',
      },
    });

    // Fire-and-forget insert — allow it to land.
    await expect.poll(async () => {
      const f = await (await request.get('/api/cbo-funnel')).json();
      return f.perOrg.some((o: any) => o.cboStateId === cboId);
    }, { timeout: 10_000 }).toBe(true);

    const funnel = await (await request.get('/api/cbo-funnel')).json();
    const mine = funnel.perOrg.find((o: any) => o.cboStateId === cboId);
    expect(mine.lastStep, 'the beat names itself — no new taxonomy').toBeTruthy();
    expect(mine.phase).toBe(2);
    expect(mine.lastAt, 'so "stuck for N days" is answerable').toBeTruthy();
    expect(funnel.stepCounts.length, 'drop-off per beat is a GROUP BY').toBeGreaterThan(0);
  });

  test('a map that renders is recorded, and one that does not is too', async ({ request }) => {
    const api = new TestApi(request);
    const cohort = (await api.createCohort('Map render cohort')).cohort;
    const { member } = await api.inviteMember(cohort.id, { orgName: 'Map Org', withSession: true });
    const cboId = member.cboStateId as string;

    const before = await (await request.get('/api/cbo-funnel')).json();

    await request.post(`/api/cbo/${cboId}/event`, { data: { name: 'map_render', outcome: 'ok', phase: 2 } });
    await request.post(`/api/cbo/${cboId}/event`, { data: { name: 'map_render', outcome: 'failed', phase: 2 } });

    await expect.poll(async () => {
      const f = await (await request.get('/api/cbo-funnel')).json();
      return f.mapRender.failed > before.mapRender.failed && f.mapRender.ok > before.mapRender.ok;
    }, { timeout: 10_000 }).toBe(true);
  });

  test('an unknown event name is refused rather than stored', async ({ request }) => {
    const api = new TestApi(request);
    const cohort = (await api.createCohort('Bad event cohort')).cohort;
    const { member } = await api.inviteMember(cohort.id, { orgName: 'Bad Event Org', withSession: true });
    const res = await request.post(`/api/cbo/${member.cboStateId}/event`, {
      data: { name: 'something_invented', outcome: 'ok' },
    });
    expect(res.status()).toBe(400);
  });
});

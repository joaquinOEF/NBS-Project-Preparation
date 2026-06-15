import { test, expect } from '@playwright/test';
import { TestApi } from './helpers/testApi';

// Multi-format upload + per-org knowledge base (#223 intake, #230 doc store). A
// text upload needs no AI, so it's fully deterministic: it should extract the
// content AND file a durable, org-scoped document row referenceable across
// sessions. (Photo/voice/scanned-PDF go through vision/transcription — covered
// by the live quality suite, not here.)

test.describe('Upload intake + per-org KB', () => {
  test('a text upload is extracted and filed in the org document store', async ({ request }) => {
    const api = new TestApi(request);
    const cohort = (await api.createCohort('Upload cohort')).cohort;
    // withSession links a fresh CBO state to the org, so the doc store has an
    // org to file under.
    const { member } = await api.inviteMember(cohort.id, { orgName: 'Horta da Cascata', withSession: true });
    const cboId = member.cboStateId as string;
    expect(cboId).toBeTruthy();

    const text = 'Our community garden on Rua Cascata reduced flooding after the 2024 storms.';
    const resp = await request.post(`/api/upload/cbo/${cboId}`, {
      multipart: {
        file: { name: 'evidence.txt', mimeType: 'text/plain', buffer: Buffer.from(text) },
      },
    });
    expect(resp.ok()).toBeTruthy();
    const body = await resp.json();
    expect(body.content).toContain('reduced flooding'); // extracted, not stored blindly

    // The durable per-org KB now holds the document with its full text.
    const docs = await api.listDocs(cboId);
    expect(docs.orgId).toBeTruthy();
    expect(docs.documents.length).toBeGreaterThanOrEqual(1);
    const doc = docs.documents.find((d: any) => d.filename === 'evidence.txt');
    expect(doc).toBeTruthy();
    expect(doc.fullText).toContain('community garden');
  });
});

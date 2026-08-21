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

  // W2 (Aug 2026): four files were lost this way. saveAndParseUpload wrote the
  // file to disk and THEN threw on extraction, so the caller never learned a
  // file existed — no doc row, no blob, no manifest entry, and the org was told
  // "could not parse" as if nothing had arrived. Ksa Rosa re-sent the same PDF,
  // tried another, then left the session.
  test('a file whose text cannot be read is still stored, and says so', async ({ request }) => {
    const api = new TestApi(request);
    const cohort = (await api.createCohort('Unparseable cohort')).cohort;
    const { member } = await api.inviteMember(cohort.id, { orgName: 'Ksa Test', withSession: true });
    const cboId = member.cboStateId as string;
    expect(cboId).toBeTruthy();

    // A .pdf with no extractable text layer — the scanned-document case, and
    // the one that yields ok:true with an empty string rather than an error.
    const resp = await request.post(`/api/upload/cbo/${cboId}`, {
      multipart: {
        file: {
          name: 'estatuto.pdf',
          mimeType: 'application/pdf',
          buffer: Buffer.from('%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF'),
        },
      },
    });

    // It must NOT 500 — a file we cannot read is still a file we kept.
    expect(resp.status(), 'an unreadable file is not a server error').toBe(200);
    const body = await resp.json();
    expect(body.parsed, 'the response tells the client extraction failed').toBe(false);
    expect(body.parseError, 'and why').toBeTruthy();
    expect(body.savedPath, 'the original was written').toBeTruthy();

    // The durable record exists, marked failed and retryable — this is the
    // whole point: the coordinator can still open it.
    const docs = await api.listDocs(cboId);
    const doc = docs.documents.find((d: any) => d.filename === 'estatuto.pdf');
    expect(doc, 'an unreadable upload still files a document row').toBeTruthy();
    expect(doc.parseStatus).toBe('failed');
    expect(doc.parseError).toBeTruthy();
    expect(doc.fullText ?? null, 'no text, because there is none — not a fake empty string').toBeNull();
  });

  // Regression guard: the success path must keep reporting parsed === true, so
  // the client does not start announcing every good upload as unreadable.
  test('a readable upload still reports parsed', async ({ request }) => {
    const api = new TestApi(request);
    const cohort = (await api.createCohort('Parsed cohort')).cohort;
    const { member } = await api.inviteMember(cohort.id, { orgName: 'Parsed Org', withSession: true });
    const cboId = member.cboStateId as string;

    const resp = await request.post(`/api/upload/cbo/${cboId}`, {
      multipart: { file: { name: 'ok.txt', mimeType: 'text/plain', buffer: Buffer.from('horta comunitária') } },
    });
    const body = await resp.json();
    expect(body.parsed).toBe(true);
    expect(body.parseError).toBeNull();

    const docs = await api.listDocs(cboId);
    const doc = docs.documents.find((d: any) => d.filename === 'ok.txt');
    expect(doc.parseStatus).toBe('parsed');
  });

  test('a file refused before reading says why, and does not read as a parse failure', async ({ request }) => {
    const api = new TestApi(request);
    const cohort = (await api.createCohort('Oversize cohort')).cohort;
    const { member } = await api.inviteMember(cohort.id, { orgName: 'Oversize Org', withSession: true });
    const cboId = member.cboStateId as string;

    // 26MB — over the 25MB ceiling. Multer refuses it before the route body.
    const resp = await request.post(`/api/upload/cbo/${cboId}`, {
      multipart: {
        file: { name: 'portfolio.pdf', mimeType: 'application/pdf', buffer: Buffer.alloc(26 * 1024 * 1024, 1) },
      },
    });
    expect(resp.status(), 'too large is 413, not a generic 500').toBe(413);
    const body = await resp.json();
    expect(body.reason, 'the org is told the real reason').toContain('25MB');
    expect(body.fix, 'and what to do about it').toBeTruthy();
  });
});

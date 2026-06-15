import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

// Doc-first intake (LIVE, real agent): a participant drops a project PDF at the
// start. The batched skill's Step 1 should EXTRACT the fields from it and
// bulk-confirm them — not ask them one by one. Asserts loosely (real agent):
// several org_profile fields get filled from the doc, and the agent acknowledges
// what it filled / offers a confirm. Self-skips unless RUN_LIVE_WALKTHROUGH=1.
//
// Generate the PDF fixture first:  node e2e/fixtures/generate-fixtures.mjs

const RUN = process.env.RUN_LIVE_WALKTHROUGH === '1';
const pdfPath = join(dirname(fileURLToPath(import.meta.url)), '..', 'fixtures', 'horta-cascata-proposal.pdf');

test.describe('CBO doc-first intake (real agent) @live', () => {
  test.skip(!RUN, 'Set RUN_LIVE_WALKTHROUGH=1 + a real (non-fake) target + ANTHROPIC_API_KEY.');
  test.use({ locale: 'pt-BR' });
  test.setTimeout(8 * 60 * 1000);

  test('a shared PDF pre-fills the profile and the agent confirms instead of re-asking', async ({ page, request }) => {
    await page.goto('/cbo-profile');
    const marker = page.getByTestId('cbo-stream-status');
    await expect(marker).toHaveAttribute('data-cbo-id', /.+/, { timeout: 30_000 });
    const cboId = (await marker.getAttribute('data-cbo-id'))!;

    // Upload the proposal PDF through the same endpoint the paperclip uses.
    const pdf = readFileSync(pdfPath);
    const up = await request.post(`/api/upload/cbo/${cboId}`, {
      multipart: { file: { name: 'proposta-horta-cascata.pdf', mimeType: 'application/pdf', buffer: pdf } },
    });
    expect(up.ok(), 'upload should succeed').toBeTruthy();
    const parsed = (await up.json()).content as string;
    expect(parsed, 'PDF text should extract').toMatch(/Horta Comunitária Cascata/i);

    // The file-drop UI follows the upload with a chat message carrying the parsed
    // content; replicate that so the agent processes the document.
    const dropMsg = `Enviei um documento: "proposta-horta-cascata.pdf".\n\nConteúdo:\n${parsed.slice(0, 8000)}`;
    await page.getByTestId('cbo-chat-input').fill(dropMsg);
    await page.getByTestId('cbo-chat-input').press('Enter');
    await expect(marker).toHaveAttribute('data-turns', '1', { timeout: 150_000 });
    await expect(marker).toHaveAttribute('data-streaming', 'false', { timeout: 60_000 });

    // The agent extracted several fields from the doc (didn't ask them fresh).
    const state = (await (await request.get(`/api/cbo/${cboId}`)).json()).state;
    const fields = state.sections.org_profile.fields as Record<string, { value: string }>;
    const filled = Object.keys(fields);
    // eslint-disable-next-line no-console
    console.log(`  doc-first → ${filled.length} fields pre-filled: ${filled.join(', ')}`);
    expect(filled.length, `expected several fields from the doc, got: ${filled.join(', ')}`).toBeGreaterThanOrEqual(3);
    expect(fields.org_name?.value).toBeTruthy();

    // And it bulk-confirms rather than silently moving on (PT/EN tolerant).
    const msgs = await (await request.get(`/api/cbo/${cboId}/messages`)).json();
    const agentText = (Array.isArray(msgs) ? msgs : [])
      .filter((m: any) => m.role === 'assistant' && m.messageType === 'content')
      .map((m: any) => m.content).join('\n');
    expect(/tá tudo certo|conferindo|preenchi|ajustar|confir|filled|correct/i.test(agentText),
      'agent should bulk-confirm what it filled').toBeTruthy();
  });
});

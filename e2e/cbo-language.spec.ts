import { test, expect } from '@playwright/test';
import { TestApi } from './helpers/testApi';

// Sticky session language (#226). Once a session's language is set, the server
// must keep using it — it must NOT re-detect per message (the bug that produced
// half-EN/half-PT documents). We verify the server's language resolution
// directly: seed the sticky language, send a chat with NO `lang` override and a
// message in the OTHER language, and confirm the fake model's (language-aware)
// default turn comes back in the sticky language, not the message's.
//
// Driven at the API layer because the chat composer always sends the UI `lang`;
// omitting it is what exercises the sticky fallback (cboRoutes resolves
// lang ?? state.metadata.language ?? detect(message)).

test.describe('Sticky session language', () => {
  test('PT stays PT even when the message is English', async ({ request }) => {
    const api = new TestApi(request);
    const { cboId } = await api.newSession();
    await api.seedState(cboId, { language: 'pt' });

    const resp = await request.post(`/api/cbo/${cboId}/chat`, { data: { message: 'hello there' } });
    expect(resp.ok()).toBeTruthy();
    const body = await resp.text();
    expect(body).toContain('Vamos continuar'); // PT default turn
    expect(body).not.toContain('Got it');       // not the EN one
  });

  test('EN stays EN even when the message has Portuguese accents', async ({ request }) => {
    const api = new TestApi(request);
    const { cboId } = await api.newSession();
    await api.seedState(cboId, { language: 'en' });

    // Accented, clearly-Portuguese message — the OLD per-message detector would
    // have flipped to PT. Sticky EN must win.
    const resp = await request.post(`/api/cbo/${cboId}/chat`, { data: { message: 'olá, somos uma organização da comunidade' } });
    expect(resp.ok()).toBeTruthy();
    const body = await resp.text();
    expect(body).toContain('Got it');            // EN default turn
    expect(body).not.toContain('Vamos continuar'); // not the PT one
  });
});

import { defineConfig, devices } from '@playwright/test';

// Target: a remote preview URL when E2E_BASE_URL is set (e.g. the Replit
// preview), otherwise a locally-managed dev server. We never host the browser
// on Replit — Playwright runs on your machine / CI and points at a URL.
// Local hermetic server port. Defaults to 5050 to dodge macOS's AirPlay
// Receiver, which squats on :5000 and answers 403 (override via E2E_PORT).
const PORT = process.env.E2E_PORT || '5050';
const baseURL = process.env.E2E_BASE_URL || `http://localhost:${PORT}`;
const isRemote = !!process.env.E2E_BASE_URL;

export default defineConfig({
  testDir: './e2e',
  // One-shot purge of namespaced e2e data after the whole run (not per-describe,
  // which would race parallel tests). Runs while the webServer is still up.
  globalTeardown: './e2e/global-teardown.ts',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 2 : undefined,
  // HTML report (open with `npm run test:e2e:report`) + concise console list.
  reporter: [['html', { open: 'never' }], ['list']],
  timeout: 30_000,
  expect: { timeout: 10_000 },
  use: {
    baseURL,
    // trace = a scrubbable DOM/network timeline of the run; viewable in the
    // HTML report. Cheap default (first retry only); E2E_TRACE=on records every
    // test. Video likewise: failures only by default, every test with
    // E2E_VIDEO=on (the `test:e2e:video` script / scripts/e2e-local.sh). There
    // is no Playwright CLI flag for these, so we toggle via env.
    trace: process.env.E2E_TRACE === 'on' ? 'on' : 'on-first-retry',
    screenshot: 'only-on-failure',
    video: process.env.E2E_VIDEO === 'on' ? 'on' : 'retain-on-failure',
    // If the target enforces TEST_API_SECRET, send it on every request
    // (harmless on app routes; required by /__test/*). The `request` fixture
    // inherits these headers too, so the test-API helper needs no extra wiring.
    extraHTTPHeaders: process.env.TEST_API_SECRET ? { 'x-test-secret': process.env.TEST_API_SECRET } : {},
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
  // Manage a local server ONLY when not pointed at a remote preview. The flags
  // turn on the test API + deterministic fake model for this process; a
  // DATABASE_URL must be present in the environment for DB-backed endpoints.
  webServer: isRemote
    ? undefined
    : {
        command: 'npm run dev',
        url: baseURL,
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
        // Dummy OAUTH_* just satisfy import-time checks in authService; the e2e
        // suite never exercises the OAuth flow.
        env: {
          ENABLE_TEST_ROUTES: '1',
          CBO_FAKE_MODEL: '1',
          NODE_ENV: 'development',
          PORT,
          OAUTH_CLIENT_ID: 'e2e-dummy',
          OAUTH_REDIRECT_URI: `${baseURL}/api/auth/oauth/callback`,
          // Module-level OpenAI clients require a non-empty key at import. Dummy
          // values — the deterministic suite never calls a model provider.
          OPENAI_API_KEY: 'sk-e2e-dummy',
          AI_INTEGRATIONS_OPENAI_API_KEY: 'e2e-dummy',
        },
      },
});

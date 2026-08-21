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
    // ── @smoke: the inner-loop tier ────────────────────────────────────────
    // The full suite is 4.2 minutes. Running it after every small change cost
    // ~30 minutes in a single session, most of it re-proving things that could
    // not have broken. This tier is what runs WHILE iterating; the full suite
    // runs once before a PR.
    //
    // The list is explicit and lives in one place rather than as @smoke tags
    // scattered across 90 files — so it can be read, argued with, and pruned.
    // What earns a place:
    //   · the turn spine (golden path, batching, transcript parity)
    //   · guards that fail SILENTLY (prompt persistence, re-ask, duplicate text,
    //     stream retry) — the ones whose breakage looks like nothing happening
    //   · the tenancy / auth boundary
    //   · pure-function guardrails, which cost ~1ms and pin real logic
    //   · a regression test for every bug that actually reached JVP
    // What does not: multi-org scenario walkthroughs, catalog/tile fetches,
    // layout polish, anything @live.
    //
    // RULE: when a bug reaches JVP and smoke was green, its regression test
    // joins this list. That is the only thing keeping the tier honest.
    {
      name: 'smoke',
      use: { ...devices['Desktop Chrome'] },
      testMatch: [
        // the spine
        /cbo-golden-path/, /cbo-batched-questions/, /cbo-phase1-walkthrough/,
        /cbo-transcript-parity/, /cbo-language/,
        // silent-failure guards
        /cbo-prompt-persist/, /cbo-reask-guard/, /cbo-duplicate-text-guard/,
        /cbo-stream-retry/, /cbo-sse-heartbeat/, /cbo-upload/,
        /cougar-inline-options/, /cougar-doc-stage-confirm/,
        /cougar-map-overlay-stacking/,
        // boundaries
        /cohort-isolation/, /coordinator-auth/,
        // regressions for bugs that reached the field
        /cougar-e2-bairro-selectable/,      // clicks swallowed by pointer drift
        /cougar-chip-opens-file-picker/,    // chip that needed a file didn't open it
        /cougar-workshop-open-atomic/,      // opening a workshop was two writes
        /cougar-cohort-selection-persist/,  // reload dropped the chosen cohort
        /cougar-e2-site-card-clarity/,      // the card asked two questions at once
        // ranking guardrails (pure functions — milliseconds, real coverage)
        /cougar-e2-familia-ranking-context/,
        /cougar-e2-risk-summary/, /cougar-e2-one-encoding-per-step/,
      ],
    },
    // Default deterministic suite — desktop Chromium. Skips the mobile-layout
    // spec (which needs the WebKit/iPhone project below).
    { name: 'chromium', use: { ...devices['Desktop Chrome'] }, testIgnore: /cbo-mobile-layout/ },
    // Mobile layout harness — WebKit (Safari's engine) at an iPhone viewport, the
    // closest headless approximation of the real iOS Safari the CBOs use. Only
    // runs the mobile-layout spec. Catches structural breakage (doubled bars,
    // horizontal overflow, unpinned bottom bar, page-level scroll); the purely
    // dynamic iOS chrome (address-bar collapse) still needs a real device.
    { name: 'webkit-mobile', use: { ...devices['iPhone 14 Pro'] }, testMatch: /cbo-mobile-layout/ },
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
          // Scale the SSE heartbeat down for tests. The behaviour under test —
          // "pings arrive during a silent gap, and the drop card never fires" —
          // is scale-free, but at the production 15s cadence the spec had to
          // script 17-second waits and sit through them: 35s, 7% of the whole
          // suite, spent sleeping on purpose.
          CBO_SSE_PING_MS: '400',
          // Same reasoning for the turn queue (CBO-TURN-QUEUE): the behaviour
          // under test is "a queued answer runs, and giving up never freezes the
          // UI", which is scale-free. At the production 20s the give-up spec
          // would have to hold a session — and a worker — for 20+ seconds, and
          // this suite runs 4 workers on one box: sleeping specs are paid for by
          // every other spec's timeout budget.
          CBO_TURN_QUEUE_WAIT_MS: '3000',
          CBO_FAKE_MODEL: '1',
          CBO_FAKE_GEOCODE: '1',
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

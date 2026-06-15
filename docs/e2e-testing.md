# E2E testing harness — backend seam (PR 1)

This is the foundation for driving the CBO workshop flow end-to-end in tests without
manual setup or replaying full conversations. It ships two test-only seams, both
**off by default** and safe to leave in the codebase:

| Seam | Env flag | What it does |
|---|---|---|
| Gated test API (`/__test/*`) | `ENABLE_TEST_ROUTES=1` | Seed sessions, coordinators, cohorts, mid-conversation state; script the fake model; tear down. |
| Fake CBO model | `CBO_FAKE_MODEL=1` | Replaces the live Claude Agent SDK in the CBO chat with a deterministic scripted driver. |

> ⚠️ **Never set `ENABLE_TEST_ROUTES` or `CBO_FAKE_MODEL` on the production Deployment.**
> When `ENABLE_TEST_ROUTES` is unset, the `/__test` routes are **not even registered**
> (conditional registration in `server/routes.ts`) — they don't exist, they don't 403.
> Set both flags (and a `TEST_API_SECRET`) only in the test/preview environment.

## Why this shape

The CBO chat is normally driven by the Claude Agent SDK — non-deterministic, slow, and
billed. That can't gate every fix. So:

- **Fake model** (`CBO_FAKE_MODEL=1`) makes a turn deterministic: it emits the *exact same*
  SSE events the real path emits (`chat`, `field_update`, `ask_user`, `phase_change`,
  `maturity_update`, `open_map`, `done`) from a script you provide. The real SDK path in
  `cboAgent.ts` is byte-for-byte untouched — the fake is a separate, gated branch.
- **State-seeding** (`/__test/cbo/:id/seed-state`) is the high-leverage primitive: jump a
  session straight to any phase / tier / language / filled state and assert one transition,
  instead of replaying 30 turns.

Live-model behaviour (does the agent ask sensible questions?) is a *separate, non-gating*
quality suite — out of scope for this PR.

## Env flags

```bash
ENABLE_TEST_ROUTES=1     # mount /__test/*
CBO_FAKE_MODEL=1         # deterministic chat turns
TEST_API_SECRET=<secret> # optional; if set, every /__test call needs header x-test-secret
NODE_ENV=development
```

## Test API

All under `/__test`. If `TEST_API_SECRET` is set, send header `x-test-secret: <secret>`.

| Method | Path | Body | Returns |
|---|---|---|---|
| `GET`  | `/__test/ping` | — | `{ ok, fakeModel, secret }` — probe before seeding |
| `POST` | `/__test/cbo/session` | `{ city? }` | `{ cboId, state }` |
| `POST` | `/__test/cbo/:id/seed-state` | see below | `{ ok, state }` |
| `POST` | `/__test/cbo/:id/script` | `{ turns: FakeTurn[] }` | `{ ok, queued, fakeModelEnabled }` |
| `GET`  | `/__test/cbo/:id/script` | — | `{ remainingTurns }` |
| `DELETE` | `/__test/cbo/:id/script` | — | `{ ok }` |
| `POST` | `/__test/coordinator` | `{ email?, password?, name?, cohortId? }` | sets `coord_session` cookie; `{ coordinator, password, sessionToken }` |
| `POST` | `/__test/cohort` | `{ name? }` | `{ cohort }` (slug namespaced `e2e-…`) |
| `POST` | `/__test/cohort/:cohortId/member` | `{ orgName?, neighborhood?, role?, unlockedPhases?, withSession? }` | `{ member, inviteUrl }` |
| `POST` | `/__test/cleanup` | — | `{ ok, deleted }` — purges only `e2e-*` cohorts/members and `*@e2e.test` coordinators |

`cohortId` omitted on `/__test/coordinator` ⇒ an **admin** account (sees all cohorts).
Pass a cohort id to scope it.

### `seed-state` body (all fields optional)

```json
{
  "phase": 3,
  "language": "pt",
  "orgName": "Horta Comunitária Cascata",
  "sections": [
    { "sectionId": "org_profile", "field": "org_name", "value": "Horta Cascata", "confidence": "high", "source": "user" }
  ],
  "maturity": [ { "metric": "org_delivery_capacity", "score": 2, "justification": "…" } ],
  "priorityFlags": [ { "flag": "Land tenure secure or likely secure", "met": true } ]
}
```

Valid section ids and maturity metrics are validated against `shared/cbo-schema.ts`
(`isValidSectionId` / `isValidMaturityMetric`); unknown ones are silently skipped.

## Fake-model script format

A script is a **queue of turns**; each user message pops the next turn and runs its ops in
order, then a `done` event is emitted. When the queue is empty, every turn falls back to a
generic ack + two-option `ask_user` (PT/EN aware) so the chat stays driveable forever.

```ts
type FakeOp =
  | { op: 'say'; text: string }
  | { op: 'update_section'; sectionId: string; field: string; value: string; confidence?; source? }
  | { op: 'ask_user'; question: string; options: { label: string; description?: string; recommended?: boolean }[]; multiSelect?; showMap? }
  | { op: 'score_maturity'; metric: string; score: number; justification? }
  | { op: 'set_phase'; phase: number }
  | { op: 'priority_flag'; flag: string; met: boolean; notes? }
  | { op: 'open_map'; params? };
type FakeTurn = FakeOp[];
```

Example — script one CBO turn, then drive it:

```bash
curl -s localhost:5000/__test/cbo/$ID/script -H 'content-type: application/json' -d '{
  "turns": [[
    { "op": "say", "text": "Qual é o nome da sua organização?" },
    { "op": "ask_user", "question": "Tipo de organização?",
      "options": [{ "label": "Associação comunitária" }, { "label": "Estúdio de paisagismo" }] }
  ]]
}'
# Then the UI's next POST /api/cbo/$ID/chat plays that turn deterministically.
```

## Quick manual check (with a DB configured)

```bash
ENABLE_TEST_ROUTES=1 CBO_FAKE_MODEL=1 npm run dev
curl -s localhost:5000/__test/ping
ID=$(curl -s -XPOST localhost:5000/__test/cbo/session | jq -r .cboId)
curl -s -XPOST localhost:5000/__test/cbo/$ID/seed-state -H 'content-type: application/json' \
  -d '{"phase":1,"language":"pt","orgName":"Horta Cascata"}'
```

## Running the suites

```bash
# Deterministic gate (fake model). Needs a DATABASE_URL; the config boots a local
# dev server on :5050 with the test flags, or set E2E_BASE_URL for a remote target.
npm run test:e2e
npm run test:e2e:ui        # interactive runner (watch it run live, time-travel)
npm run test:e2e:video     # record a video + full trace for EVERY test
npm run test:e2e:report    # open the HTML report (videos + traces)

# One-command "test it and share the video": sets up a throwaway Postgres DB,
# pushes the schema, runs the whole suite with video + trace, leaves the report
# ready. Then `npm run test:e2e:report` to watch.
bash scripts/e2e-local.sh                  # whole suite
bash scripts/e2e-local.sh cbo-golden-path  # one spec
```

> Video is captured only for tests that drive a **browser page** (golden path,
> login UI, orchestrator redirect, live smoke). The HTTP-layer tests (auth-API
> boundary, cross-cohort isolation, sticky language) have nothing visual to
> film, but they still record a **trace** you can scrub in the report. Toggles:
> `E2E_VIDEO=on` / `E2E_TRACE=on` (default: failures only).

```bash
# Non-gating live-model quality smoke — real agent, loose assertions. Point at a
# real (non-fake) deployment; self-skips otherwise.
E2E_BASE_URL=https://<preview> TEST_API_SECRET=<secret> npm run test:quality
```

## Test tiers (fast vs full)

| Tier | Agent | User | Speed | Use |
|---|---|---|---|---|
| **fast** (`test:e2e:fast`) | fake (scripted) | scripted | ~seconds, deterministic | the PR gate — runs in CI |
| **full** (`test:e2e:full`) | **real Claude agent** | **LLM-simulated** | minutes, non-deterministic | on-demand health check |

The **full** tier is agent *self-play*: the real agent generates its own questions
and maturity reasoning, and a small Claude (haiku) plays a community-org member
from a fixed persona (`e2e/helpers/userSim.ts`) — reading the agent's questions
(from the public `/api/cbo/:id/messages`) and picking chips / typing answers until
the agent advances to Phase 2. It drives only public endpoints + already-shipped
testids, so it needs no `/__test` hooks and no redeploy.

```bash
# Full walkthrough against your deployment. Needs ANTHROPIC_API_KEY for the
# simulated user (separate from the deployment's own agent). Records video.
E2E_BASE_URL=https://<your-app> ANTHROPIC_API_KEY=sk-ant-… npm run test:e2e:full
npm run test:e2e:report   # watch the real agent + simulated user
```

> Live tiers are tagged `@live`; `test:e2e:fast` excludes them. Both self-skip
> without their `RUN_LIVE_*` env flag, so they never run (or need a key) in CI.

CI: `.github/workflows/e2e.yml` runs the deterministic suite on every PR + push to
main against a Postgres service container, and uploads the HTML report (trace +
video) as an artifact. The live smoke self-skips in CI (no API key needed).

## Status

- ✅ **PR 1 (#235):** fake-model seam + gated `/__test` API + docs.
- ✅ **PR 2 (#236):** `@playwright/test`, config (local server / remote `E2E_BASE_URL`),
  the `cbo-stream-status` SSE-complete contract, golden-path spec.
- ✅ **PR 3 (#237):** coordinator auth-gate specs + one-shot global teardown.
- ✅ **PR 4 (#238):** GitHub Actions gate + non-gating live-model quality smoke.
- ✅ **PR 5 (#239):** cross-cohort ownership guard (`/api/cohort/mine` + `app.param`
  owner check) + isolation spec. **Closes the isolation gap below.**
- ✅ **PR 6 (#240):** sticky-language (#226) + upload/per-org-KB (#230) specs.
- ✅ **PR 7 (this):** video/trace toggles + `scripts/e2e-local.sh` one-command runner.

Coverage of the deterministic gate: golden path · stream-complete contract · auth
gate boundary · cross-cohort isolation · sticky language · upload + per-org KB.

### Deferred (by decision / live-only)
- Admin cohort-switcher UI — `isAdmin` is surfaced; build when a 2nd cohort exists.
- Stream A vs B *behavioural* differences + photo/voice/scanned-PDF vision — live
  quality smoke, not the deterministic gate.

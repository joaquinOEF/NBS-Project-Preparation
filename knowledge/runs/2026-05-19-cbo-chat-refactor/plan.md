# CBO chat refactor — fold cboAgent into the CT (concept-note) pattern

**Date:** 2026-05-19
**Goal:** Stop the CBO chat from being "stupid" before the June 8 Vila Flores convening series.
**Owner:** JVP + Claude

---

## Why this exists

The CBO chat used to be a chip-driven, MCQ-first conversation modeled on the CityCatalyst (CT) concept-note agent. Over the last several weeks of iteration it has degraded: the agent asks open-text questions where chips exist, re-asks things it already knows, ends turns without a follow-up (stranding the user behind a "Continue from Phase X" button), and has no graceful state for "you finished this workshop, the next isn't open yet."

We diagnosed the root causes against the working `server/services/conceptNoteAgent.ts` (the CT pattern) and decided on a **structural refactor** (not symptom patches) plus **Playwright E2E coverage**.

This document is the per-encontro plan: what the refactor means for E1 now, what changes for E2 (next), and the placeholders for E3+ (we'll fill these as we get there).

---

## Diagnostic — five root causes

| # | Cause | Location | Effect |
|---|---|---|---|
| 1 | No `model:` passed to `sdkQuery` — SDK picks default | `server/services/cboAgent.ts:710-732` | Drifty model = unreliable tool-following |
| 2 | Skill cache is process-lifetime, no mtime check | `server/services/encontroSkills.ts:24-35` | Skill edits don't reach the running server until restart |
| 3 | Skill markdown stuffed into the user-side prompt | `server/services/cboAgent.ts:705` | Weaker steering than a system prompt or tool-description |
| 4 | "Continue from Phase X" button fires whenever the agent ends a turn without text | `client/src/core/pages/cbo-profile.tsx:1107` | Skill-violating turn → hand-grenade button mid-conversation |
| 5 | No UI branch for "finished current workshop, next not yet unlocked" | `client/src/core/pages/cbo-profile.tsx:1043` (returns `null`) | Blank screen, no "waiting for coordinator" cue |

Cross-cutting: **no automated tests.** Every regression is caught live by JVP.

---

## Target architecture (CT pattern)

The `conceptNoteAgent.ts` codifies what we want:

- **Explicit model per call** (`claude-opus-4-6` / `claude-sonnet-4-20250514`) — `conceptNoteAgent.ts:374`, `:543`
- **System prompt separated from user message** — proper SDK shape, not a concatenated string
- **Batching encoded in the `ask_user` tool description**, not just in the skill: *"ALWAYS batch ALL questions for the current phase in a SINGLE call"* — `conceptNoteAgent.ts:191`, `:532`
- **Tool catalog appears in the system prompt** so the model treats tools as first-class

The cboAgent will adopt all four.

---

## Refactor — five PRs

Each is its own branch off fresh `origin/main`, its own PR. Per JVP standing rule: never push to an existing PR branch.

### PR A — Pin model + system-prompt separation

**Scope:**
- `server/services/cboAgent.ts:710` — add `model:` to `sdkQuery` options
- Split the assembled prompt at `cboAgent.ts:705` into `system` (`sysCtx` + state + skill + tool catalog) and `user` (just the user message + decision log)
- `server/services/encontroSkills.ts` — parse YAML frontmatter and return `{ markdown, model }`
- Default model: `claude-sonnet-4-6` for E1/E2 (matches CT's working choice), `claude-opus-4-6` for E3+ (more complex multi-tool turns); both overridable per skill via frontmatter

**Acceptance:**
- Server log on every turn shows the model used
- Skill frontmatter `model:` overrides default
- No regressions: a full E1 walk still completes

### PR B — Encode MCQ + turn-ender rules in the tool layer

**Scope:**
- `server/services/cboAgent.ts:342-356` (the `askUser` SDK tool) — rewrite description to mirror `conceptNoteAgent.ts:191`:
  > *"Present multiple-choice questions to the user. The UI renders interactive buttons. ALWAYS use this for any question with 2-7 natural buckets. Pair every `update_section` call with an `ask_user` in the same turn unless ending the encontro (the closing tool calls handle that case)."*
- Add a **post-turn guard** in `streamWithSdk`: after the SDK loop exits, if no `ask_user` / `open_map` / `ask_priority_rank` / `ask_community_anchoring` / `score_maturity` (closing) tool fired AND `state.phase < 6`, log a counter event + emit a fallback `chat` event telling the user to re-prompt
- The post-turn guard is the structural defense against the silent-turn → Continue-button class of bug

**Acceptance:**
- The Playwright E2E (PR E) never sees the Continue button mid-flow
- Server logs the `silent_turn_fallback` counter; baseline should be < 5% of turns

### PR C — mtime-based skill cache

**Scope:**
- `server/services/encontroSkills.ts:24-35` — replace process-lifetime `Map<number, string|null>` with `Map<number, { mtimeMs: number; content: string | null }>`
- On each call, stat the file; reload if `mtimeMs` changed
- Drop the now-lying comment that says "restart to pick up edits"

**Acceptance:**
- Edit `knowledge/_skills/encontro-1.md`, hit the chat, see the new instruction take effect within one turn — no Replit restart

### PR D — Waiting-for-coordinator UI + hardened Continue gate

**Scope:**
- `client/src/core/pages/cbo-profile.tsx:1043` — replace the `return null` (when no next phase is unlocked) with a "Próximo encontro ainda não foi aberto — sua coordenadora vai te avisar quando estiver pronta" card, parallel to the unlocked-next card above it
- `client/src/core/pages/cbo-profile.tsx:1104-1108` — tighten the Continue button gate: require **(a)** the last user message timestamp to be > 30 min old, OR **(b)** the page to have been freshly loaded with no in-flight stream this session. Drops the case where the agent simply violated its turn-ender rule

**Acceptance:**
- After finishing E1 with no E2 unlocked, the CBO sees the waiting card (not a blank space, not a Continue button)
- Continue button appears on a fresh page load after a real session loss — but not after a same-session agent silent-turn

### PR E — Playwright E2E for Encontro 1

**Scope:**
- `npm i -D @playwright/test`
- `playwright.config.ts` pointed at `localhost:5000`
- `tests/e2e/encontro-1.spec.ts`:
  - Creates a coordinator + cohort via the test endpoint (or seeds via API)
  - Invites a CBO, opens `/cbo/:memberSlug`
  - Walks the 10-question E1 flow: click chip / type free-text / submit, for each question
  - **Asserts:**
    - Every non-unique question presents chips (`[data-testid^="chip-"]` present)
    - Continue button (`[data-testid="continue-phase"]`) never appears between questions
    - On completion, the E2-unlocked banner is visible
    - Total turn count is within `[10, 14]` (allowing for one or two clarification turns; if higher, the agent is re-asking)
- Add `npm run test:e2e` script
- GH Action: `npm run dev &; wait-on http://localhost:5000; npm run test:e2e`

**Acceptance:**
- Test runs locally and in CI, passes deterministically across 5 consecutive runs

---

## Per-encontro impact

### E1 — Quem Somos (refactor target — first to ship)

**What changes for E1 specifically:**

| Aspect | Before | After |
|---|---|---|
| Model | SDK default (drifty) | Pinned `claude-sonnet-4-6` via skill frontmatter |
| Skill delivery | Embedded in user-side prompt string | System prompt + tool catalog |
| `ask_user` enforcement | Skill says "use chips" | Skill says it AND tool description says it AND post-turn guard catches violations |
| Pre-filled values | Skill says "check CURRENT STATE first" | Skill prescription unchanged, but better-followed because the state appears in the **system** prompt |
| Closing turn (after Q10) | Skill says "fire `score_maturity` × 2 + `set_path`" | Same — but the post-turn guard recognises closing-tool calls as a valid turn-ender |
| Continue button | Appears any time agent ends silently | Only appears on legitimate session-loss (PR D) |
| Test coverage | None | Playwright walks all 10 questions, asserts chip presence and no Continue button |

**E1 question shape after refactor** (from `knowledge/_skills/encontro-1.md`):

1. Confirm org name (free-text — unique input)
2. Contact name (free-text)
3. Contact role (free-text)
4. Mission summary (free-text — unique)
5. Legal form (chips: ONG/Coop/Coletivo/Empresa social/Outra)
6. Year founded (free-text — number)
7. Team size (chips: 1-2 / 3-5 / 6-15 / 16+)
8. Paid vs volunteer (chips: 5 buckets)
9. Prior project scale (chips: 5 buckets)
10. NBS experience (chips: 4 buckets)
11. Bairro of operation (chips: POA bairros, or pre-filled)
12. Groups served (multi-select chips)
13. Path triage (chips: has-idea / needs-help) — **most important**
14. Proud moment (optional free-text)

**Closing:** `score_maturity('org_delivery_capacity')` + `score_maturity('team_technical_experience')` + `set_path` + closing chat.

### E2 — Onde Atuamos (next encontro to migrate after E1 lands)

**Scheduled to migrate:** week of 2026-05-26 (assuming E1 refactor ships clean by 2026-05-22).

**What's different vs E1:**
- Adds **micro-app turns**: `open_map`, `ask_priority_rank`, `ask_community_anchoring`, `show_examples`
- Path-aware: `has-idea` CBOs skip the educational anchor (`show_examples`); `needs-help` CBOs go through it
- Closing scores: `site_control` + `community_anchoring`

**Refactor delta from E1 plan:**
- The post-turn guard in PR B must already recognise `open_map`, `ask_priority_rank`, `ask_community_anchoring`, `show_examples` as valid turn-enders — landing this in PR B (not PR E1-only) avoids re-touching the file
- Playwright test for E2 (`tests/e2e/encontro-2.spec.ts`) needs to mock or auto-dismiss the map micro-app — write a thin Playwright helper `dismissMap()` that closes the map after a fake site selection so the E2E doesn't depend on real OSM/tile fetches
- Skill model pin: `claude-sonnet-4-6` (same as E1 — E2 is still mostly chip-driven)

**Risks specific to E2:**
- Map micro-app currently posts coordinates back via a side channel — verify it still works under the system/user prompt split. Likely fine but worth a manual run before declaring done.
- Path-aware branching: ensure the path field (set in E1) is in the system-prompt state summary so the agent reliably branches without re-asking

### E3+ — What We Build / What We Need / Results & Evidence (placeholder)

**To be filled when we get there.** Targets:
- **E3 (week of 2026-06-02)** — Intervention selection. Adds `open_intervention_selector`. Probably needs `claude-opus-4-6` (more complex multi-tool reasoning across hazards × types × sizing). Add an "intervention selector dismiss helper" to the Playwright suite.
- **E4 (week of 2026-06-09)** — Needs assessment + funder matching. Refactor pattern should hold; verify `read_knowledge` works under system-prompt split (it reads from `_financing-sources/`).
- **E5 (week of 2026-06-16)** — Results & evidence. Lots of file upload turns; verify `ask_user` post-turn guard doesn't false-positive on upload-driven turns (an upload usually arrives mid-turn; the guard should already handle this because uploads go through the user message path, not the agent tool path — confirm).
- **E6 (week of 2026-06-23)** — Wrap-up & review. Read-mostly; consider whether `set_phase(6)` should automatically suppress the Continue button entirely.

For each, write a section here mirroring the E2 structure (delta vs E1, micro-app considerations, Playwright helper needs, model pin) **before** opening the PR for that encontro.

---

## Risks (cross-cutting)

- **Model pin breaks `update_section` quality on cheaper models** → mitigated by per-phase override in skill frontmatter
- **Post-turn guard masks real bugs by always firing a fallback** → log every fallback to a counter; if it fires in >10% of turns, the skill or model is wrong (treat as P0)
- **Playwright nondeterminism from LLM variance** → assertions are structural (event types, chip presence), not semantic (exact wording)
- **Refactor lands too close to June 8** → land PRs A + B + D by 2026-05-26, leaving 13 days of soak time; PR E (tests) can land in parallel; PR C is independent and low-risk

---

## Success criteria

- [ ] An agent turn that fills a section never ends without an `ask_user` (asserted in test)
- [ ] "Continue from Phase X" button does not appear while a CBO is mid-conversation in their unlocked workshop
- [ ] After finishing the unlocked workshop with no next unlocked, the CBO sees a "waiting for coordinator" card
- [ ] Skill edits to `knowledge/_skills/encontro-*.md` are picked up without a Replit restart
- [ ] `npm run test:e2e` runs the full E1 walk-through and passes deterministically across 5 consecutive runs
- [ ] By 2026-06-01: PRs A, B, C, D, E merged. E2 refactored. E3+ plan sections drafted but not necessarily shipped.

---

## Open questions

1. Does the Agent SDK currently honor a `model:` override, or do we need to call the Anthropic API directly (like `conceptNoteAgent.ts:543`'s fallback)? Verify in PR A.
2. Should the "waiting for coordinator" card include a "request to open early" button that posts to a coordinator inbox? Out of scope for now; revisit if Ana asks.
3. The skill currently includes hardcoded language ("Brazilian Portuguese, warm, second-person") — should this move to a shared `voice.md` that every encontro skill imports? Defer.

# CBO Session 1 (Org Profile) — Hardening + Adaptive Intake

Status: proposal for review (JVP, June 2026). Targets the COUGAR launch — Vila Flores
Meeting #3 (15/07) and the fast-track Encounter 0 (late June / early July) both open with
the *same* "create full org profile" homework. This doc covers two goals:

1. **Bulletproof the engine** behind Session 1 so there are almost no failure modes.
2. **One adaptive intake** that captures a clean org profile from both an NbS-naïve
   community group and an NbS-mature implementer, without forking the script.

Companion docs: `ROLE-ARCHITECTURE.md` (role is a parameter, not a fork) and
`modular-agent-architecture.md` (skills are parameterized, not duplicated). The tier work
below follows the same rule — **maturity tier is a cross-cutting parameter, not a code fork.**

---

## Why this exists

The CBO flow is a prototype that has been demoed to Vila Flores and got candid "that's
broken" feedback (slow, untranslated strings, unclear progress, mixed languages, "does my
profile even save?"). Underneath the UX polish there is a structural problem: **the engine
makes no guarantees per turn.** It can write garbage to state, end a turn with a blank
screen, lose progress on a restart, and flip language mid-session. For a phone-first,
Portuguese-first, low-digital-literacy audience reached via a one-shot WhatsApp link, any
one of those is a dead end with no recovery path.

Session 1 is the first thing every org in both cohorts touches. It has to be the most solid
part of the product, not the roughest.

---

## Goal 1 — The engine: a turn contract + a single phase machine

The audit found ~29 distinct failure points. They are not 29 bugs; they collapse into **six
root causes**, and the whole thing hangs on one spine: **every turn must satisfy a contract
— load state, validate every tool call, end in an interactive-or-recoverable state, durably
persist completed work — and phase only ever advances through one state machine.** Today
none of those four guarantees holds.

### Root cause 1 — Unvalidated free-string tool args  → data-integrity class

`score_maturity`, `update_section`, `set_phase` all accept free strings with zero validation
(`cboAgent.ts:201`, `:432`, `:228`). Consequences:

- A misspelled metric (`org_capacity` vs `org_delivery_capacity`) is stored silently. The
  client's "next workshop" banner only renders when **every** metric in
  `PHASE_COMPLETION_METRICS[phase]` is present (`cbo-profile.tsx:1058-1070`), so **the org
  dead-ends at the end of Session 1 with no way forward.** This is the single worst failure.
- A hallucinated `field` name silently creates a junk field that surfaces in the document
  panel and the markdown export.
- `totalMaturityScore` can exceed /27 because misspelled duplicates aren't de-duped
  (`cboAgent.ts:435-437`).

**Fix (one change):** derive enums once from `cbo-schema.ts` — `ALL_CBO_SECTION_IDS`,
`MATURITY_METRICS`, the per-section field whitelist, `PRIORITY_FLAG_DEFINITIONS` — and
validate every tool call server-side against them. A bad arg returns a corrective
`isError` the agent must retry, instead of writing garbage. Kills the dead-end, junk fields,
and the /27 overflow in one stroke. Also collapses the duplicated `PHASE_COMPLETION_METRICS`
(client) and the "Score:" lines (skill) into a single derived source so they can't drift.

### Root cause 2 — Four phase-transition mechanisms + a 0-vs-1 disagreement → drift

Phase advances via (a) the agent calling `set_phase`, (b) the client `/advance-phase`
endpoint, (c) a server regex on "vamos começar o encontro N" (`cboRoutes.ts:82-98`), and
(d) `createEmptyCboState` starts at `phase: 0` (`cbo-schema.ts:236`) while the client assumes
fresh orgs are phase 1 (`cbo-profile.tsx:713`). Four writers, no single source of truth.

**Fix:** one authoritative `advancePhase(state, target)` state machine with an explicit gate
(required metrics for the current phase are scored *and valid* — now guaranteed by fix 1).
The agent never sets phase directly; it signals a `complete_phase` intent the machine
validates. The client banner and the regex shortcut both route through the same machine.
Resolve `createEmptyCboState` to phase 1 to match the client. One writer, one truth.

### Root cause 3 — Turns can end in a dead state → "it froze"

Two ways a turn strands the user:
- **Silent turn:** the agent calls `update_section` and stops without a user-prompting tool.
  The post-turn guard (`cboAgent.ts:800-823`) only emits a fallback when there was *also* no
  text. If the agent emitted any prose but forgot the `ask_user` chip, the user gets a blank
  screen + a "Continue" button the code itself admits "derails the agent."
- **SSE drop:** no `AbortController`, no reconnect, no heartbeat, no `res.on('close')`. A
  phone losing signal mid-stream leaves a dead state with no chip and a dangling server write
  to a closed socket.

**Fix:** a turn-completion invariant enforced server-side — every turn ends with a
user-prompting tool, an explicit `complete_phase`, or a recoverable fallback chip,
*regardless of whether text was emitted*. Plus SSE hardening: `res.on('close')` to stop
writing to dead sockets, a heartbeat, and client abort+resume. Resume is cheap because state
is server-side — on reconnect, re-fetch state and replay the last `ask_user`. This is what
makes Session 1 survive a flaky mobile connection.

### Root cause 4 — Best-effort persistence that loses data silently → "my progress vanished"

- If `db:push` wasn't run, every persistence call no-ops with a log warning
  (`cboPersistence.ts:22-33`); a Replit autoscale restart wipes all in-memory progress and
  the agent cold-loads empty state and re-asks everything.
- State and messages flush in separate non-transactional writes — a half-flush leaves state
  without the messages that produced it, degrading the decision log.
- `uploadedFiles` and `editLog` are in the schema but **never written** — no upload audit
  trail; re-hydration loses all upload history.
- 2s debounce window: a crash right after the closing `score_maturity` loses the completed
  profile.

**Fix:** fail loud, not silent — a boot guard that refuses to start CBO sessions if the
tables are missing. Make the state+messages flush transactional. **Flush on phase boundaries**
(and on `complete_phase`) so a finished Session 1 is never lost to the debounce window.
Actually populate `uploadedFiles`/`editLog`.

### Root cause 5 — Language re-derived every turn → mixed EN/PT documents

`lang` is auto-detected per turn via an accent/keyword regex (`cboRoutes.ts:101-104`) that
can flip to EN on a short accent-free reply, and even the EN prompt force-pins
`update_section` content to Portuguese (`cboAgent.ts:919`) — producing half-English docs.

**Fix:** language becomes a session property, set once from the invite link or the first
explicit pick, stored in state, never auto-flipped. Drop the accent-regex fallback.
`update_section` content follows the session language.

### Root cause 6 — Two divergent file paths + dead file types → "I dropped a photo and nothing happened"

Session 1 explicitly invites photo/doc drops (`encontro-1.md:247`), but images and CSV are
accepted by the uploader and return `[Unsupported file type]` as literal text fed to the
agent (`fileParser.ts:11-27`). The paperclip path (server parse) and the drag-drop path
(client `file.text()`) handle types differently.

**Fix:** one parse path; every accepted type is handled or cleanly rejected with a graceful
agent message; every upload recorded in `state.uploadedFiles`. Images get an honest "I see
you uploaded a photo — tell me what it shows" rather than a fake error string.

### The spine, stated once

> **Turn contract:** load state → validate every tool call against the schema → end the turn
> in an interactive-or-recoverable state → persist completed work durably at phase
> boundaries. **Phase machine:** one `advancePhase` writer, gated on valid scores.

Fixes 1–6 are just the six places that contract is violated today. Mobile + WhatsApp
survivability falls out of 3 and 4; the "stuck forever" and "mixed language" complaints fall
out of 1 and 5.

---

## Goal 2 — One adaptive intake for both cohorts

### The cohort reality (from the 29 May fast-track doc + the VF learning journey)

It is **one funnel, not two flows.** Stream A (Vila Flores, community-first) and Stream B
(NbS expert, NbS-first, *including non-community-led implementers*) both feed the same
fast-track cohort, and both begin with the identical first homework: "create full org
profile + upload current documents." The difference is **pacing and depth, not script:**

| | Community cohort (Stream A) | Fast-track cohort (Streams A+B) |
|---|---|---|
| First session | Meeting #3 (15/07): org profile only | Encounter 0 (late Jun/early Jul): org profile **+ map + site + NbS solutions** |
| Org type | Community-based orgs | Community orgs **and** implementers (e.g. a landscape firm working with a school) |
| Pace | Slow, hand-held, concepts hidden | Fast, lighter touch, deeper probes |
| 2026 outcome | Capacity-building; not bankable this cycle | Tier A → bankability assessment (Sep–Oct) |

### Decision: adaptive tier, with manual override

The agent infers a `maturity_tier` from early signals and dials depth accordingly; the
coordinator can override. This is the model JVP picked, and the fast-track doc confirms it —
the org profile is the same intake, the unlock depth is a per-cohort parameter.

**Tier is a parameter, not a fork.** It lives on `cohort_members` (alongside `path`) and/or
session metadata, read the same way `ROLE_CONFIGS` is. No `encontro-1-mature.md` /
`encontro-1-community.md` split — one skill with tier-conditional blocks.

### The tier signal is grounded, not guessed

The fast-track doc hands us the actual rubric. Fast-track eligibility = **Gate 2**: a minimum
total **plus level 2+ on Site Control, Org Delivery Capacity, Financial Thinking, Solution
Clarity**, with **Community Anchoring as a universal gate for all projects.** Those are
exactly the metrics already in `cbo-schema.ts:MATURITY_METRICS`. So the tier the agent infers
is computed from the same rubric the NbS expert will use to map projects — not an ad-hoc
guess.

Session 1 produces two of the gate metrics directly — `org_delivery_capacity` and
`team_technical_experience` — plus self-reported signals (`prior_project_scale`,
`nbs_experience`, whether a real project doc was uploaded). That's enough for an **early tier
read** in Session 1; the full Gate-2 determination completes as later sections score the rest.

```
tier (early read, Session 1):
  advanced    → org_delivery_capacity ≥ 2 AND team_technical_experience ≥ 2
                AND (prior_project_scale ∈ {funded, partnership} OR project doc uploaded)
  developing  → one of the above but not both
  emerging    → neither
override: coordinator sets cohort_members.maturity_tier; agent always honors it over inference
low-confidence: agent leaves tier at the coordinator default rather than guessing
```

### What tier changes in the Session-1 script

1. **Unlock depth.** Emerging → org profile only (matches VF Meeting #3). Advanced → the same
   profile plus the Encounter-0 unlocks (map overview, site selection, explore NbS solutions)
   in one session. This is a `RoleConfig`-style `unlockedSteps` parameter, not new code paths.
2. **Concept exposure.** Emerging → hide technical concepts (hotspots, raw risk layers); "just
   tell me what it is." Advanced → surface the geospatial/risk detail and deeper probes
   (governance, regulatory status, funding mechanism) that feed the bankability gate earlier.
3. **Voice/pace.** Emerging → warm facilitator, more reassurance for score-0 fears. Advanced →
   crisper, assumes fluency.

### The org-type assumption must break

`encontro-1.md:63-67` hard-forbids asking org type and assumes a community org ("This
platform is for community-based organizations by construction"). The fast-track doc
explicitly makes **non-community-led implementers eligible**, judged on the *project's*
community-anchoring, NbS capability, and impact — not on being a nonprofit.

Changes:
- **Org type is inferred from the invite stream when available** (Stream A = community,
  Stream B may be an implementer), and only *asked* when unknown — framed neutrally
  ("organização comunitária" vs "empresa/estúdio que trabalha com a comunidade"), never the
  redundant "are you a CBO?" chip.
- **`legal_form` enum gains an implementer/for-profit option** (e.g. `empresa`, `estúdio de
  arquitetura/paisagismo`) so a landscape firm isn't forced into "Coletivo informal."
- **Community Anchoring is scored on the project, not the org's legal form** — a for-profit
  implementer with a community-maintenance design and accountability to the neighborhood can
  score 2–3. (Community Anchoring lands in Phase 2 today; Session 1 just must not *exclude*
  non-community orgs at intake.) This also requires loosening the mapping-criteria "Identifiable
  Org" gate that currently excludes for-profits outright (`nbs-mapping-criteria.md:13`).
- **Path triage** (`has-idea` / `needs-help`) stays for the community cohort; fast-track orgs
  are sourced *because* they have a project, so for `advanced` tier the triage defaults to
  `has-idea` and is skipped or confirmed, not asked cold.

### Net: one skill, two readers

The refined `encontro-1` skill captures the same org profile for both cohorts. Tier and
stream are parameters that gate depth, concept exposure, voice, the org-type framing, and how
many steps unlock — exactly the `ROLE_CONFIGS` discipline, applied to maturity instead of
audience.

---

## Sequencing

Engine fixes are the bedrock and are cohort-agnostic — land them first, then the intake
refinement on top of a solid base.

1. **Fix 1 (validation layer)** — highest bite, stops the dead-end. Server-side schema
   validation for `score_maturity` / `update_section` / `set_phase`; single derived source for
   phase-completion metrics.
2. **Fix 2 + 3 (phase machine + turn invariant)** — one `advancePhase`, enforced
   turn-completion, SSE `on('close')` + heartbeat + client resume.
3. **Fix 4 (persistence)** — boot guard, transactional flush, flush-on-phase-boundary,
   populate `uploadedFiles`/`editLog`.
4. **Fix 5 + 6 (language + file intake)** — session-level language, unified parser, graceful
   image handling.
5. **Goal 2** — tier parameter on `cohort_members`, refined `encontro-1` skill (org-type break,
   tier-conditional depth, grounded tier inference), `legal_form` enum + mapping-criteria gate
   update.

Each step is independently shippable and PR'd against `main`.

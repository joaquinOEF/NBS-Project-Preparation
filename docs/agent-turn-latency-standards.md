# Agent turn latency — strategy & standards for encontro skills

How we got W1 from ~90s of total user waiting to ~half, measured with the real
agent (2026-07-07, three timed rounds). **Apply this checklist to every new
encontro (E3+) and to any new agent flow.** The goal is not "fast turns" — it
is that the user only ever waits when the agent genuinely has something to
think about.

## The turn anatomy (why a "simple" turn costs 6-17s)

Every turn is a stateless run: SDK process spawn + full system-prompt prefill
(~8.5K tokens) + N inference rounds. Measured floor: **~3.5s** before the first
event (spawn + prefill + first token). Every inference round after the first
adds ~1.5-5s. The model emits **exactly one tool call per round** no matter
what the prompt says — we measured this directly; parallel-call instructions
do not change it. So latency is governed by two numbers you control:

- **turns**: how many times the user waits at all
- **rounds per turn**: how many tool calls the turn's design forces

## The five standards

### 1. Deterministic turns are templates, not model turns
If a turn's content is fully scripted by the skill (fixed text + fixed
tools + fixed chips), serve it server-side with zero model time:
- E1 kickoff → `POST /api/cbo/:id/kickoff` (was 11.8s, now ~4ms)
- E2 entry (types strip + continue/skip) → `serveEncontro2Entry` in
  `cboAgent.ts` (was 10-17s, now ~0)

Rules for a template: copy mirrors the skill **verbatim** (they must not
drift); events flow through the normal `pushEvent` (persistence and reload
identical to an agent turn); gate on a virgin condition and **fall through to
the model** on anything unexpected; the skill gets a "usually already posted
for you — don't repeat it" note. Deliberately NOT templated: any turn that the
doc-mining rule personalizes (E2's map open framed on the org's own proposal)
— personalization beats the seconds there.

### 2. One user answer = one write
`update_section` takes `fields: { name: value, … }` — ALL of a turn's captured
fields in one call, plus the next `ask_user`. Target shape:
`update_section | ask_user` = **rounds=2**. One call per field is a bug
(measured: it turns 2 rounds into 5-8).

### 3. Batch the questions, never the waits
Grouped `ask_user` (several questions, one call) renders as a tap-through —
zero model time between taps, one turn per batch. E1 = 2 batches. Sizing rule:
if two questions have no dependency between them, they belong in the same
batch. Free-text one-offs (name) ride the opening or a batch edge, and
optional fields (`contact_role`) are captured when volunteered, never chased
with their own turn.

### 4. Actions are never confirmation questions
If the next step is a tool the agent can call (`open_map`, `show_examples`,
`show_types`, …), it calls the tool in the same response as its message. A
chip whose only effect is triggering a tool call costs two waits for one
action. Chips are for **answers**. (Client-side: the right-panel registry
keeps map/selector always reachable with no model at all.)

### 5. Route turns by weight — and let the classifier see new turn kinds
`resolveTurnModel` sends chips + short text (phase ≤2) to the light model;
uploads, map results, phase starts, and everything phase ≥3 stay heavy. When a
new workshop adds a turn type, decide its class explicitly and tag it from the
client (`turnKind`). Genuine reasoning turns (scoring, triage, doc extraction)
KEEP the heavy model — one visibly thoughtful turn reads as quality; five slow
chip-acks read as broken.

## Measurement (never assume — grep)

Every turn logs one line:

    [cbo] timing for <id>: model=… rounds=N first_event=Xms total=Yms kind=… detail=tool|tool|…

- `rounds` — standard 2 for capture turns; >3 means the turn design forces
  sequential tool calls (fix the tool or the skill, not the prose)
- `first_event` ≈ spawn + prefill (the structural floor)
- `detail` — the actual tool sequence, for attribution
- templates log `model=template rounds=0`

Real-agent measurement locally: `ANTHROPIC_API_KEY=… bash
scripts/e2e-real-local.sh` (self-play E1; scrubs `CLAUDE*` env vars or the SDK
subprocess hangs). On the Repl: `grep "\[cbo\] timing"`. Always measure a
baseline before and after a latency change — run-to-run variance is ±20%, so
compare turn SHAPES (rounds, kickoff cost) not single totals.

## Turn budget for a new encontro (the W1 yardstick)

| Turn type | Budget | How |
|---|---|---|
| Entry/scripted turns | ~0s | template (std. 1) |
| Chip/batch capture | ≤8s, rounds=2 | std. 2+3, light model |
| Free-text capture | ≤8s | light model, std. 2 |
| Doc/upload extraction | ≤20s | heavy, legit |
| Scoring/closing | ≤25s, once per encontro | heavy, legit — the ONE thinking moment |

A no-doc encontro should have **≤5 model turns** and exactly one of them may
feel like thinking.

## What we deliberately did NOT do (yet)

Persistent SDK session / prompt caching (kills the ~3.5s spawn+prefill floor)
and slimming the 29KB skill files. Both are real engineering with real risk;
revisit only if the budgets above stop being met — measure first.

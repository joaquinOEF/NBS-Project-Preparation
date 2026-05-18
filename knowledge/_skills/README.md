# Encontro Skills — Authoring Guide

Skills in this folder drive the CBO agent's behavior for each encontro (workshop) in the COUGAR/Vila Flores curriculum. One file per phase: `encontro-1.md` through `encontro-6.md`.

When `state.phase = N`, `cboAgent.ts` loads `encontro-N.md` via `loadEncontroSkill(N)` and injects the markdown as the **CURRENT PHASE INSTRUCTIONS** block of the system prompt. If the file is missing, the agent falls back to the hardcoded `buildPhaseInstructions(N)` block in `cboAgent.ts` (less prescriptive — only use as a stopgap).

## File format

Every skill file MUST start with YAML frontmatter declaring the compute budget:

```yaml
---
model: claude-haiku-4-5
thinking_budget: 0
---

# /encontro-N-<slug> — Agent skill

[rest of the skill markdown...]
```

### Fields

| Field | Type | Values | Default |
|---|---|---|---|
| `model` | string | `claude-haiku-4-5`, `claude-sonnet-4-6`, `claude-opus-4-7` | SDK default (Sonnet) |
| `thinking_budget` | int | `0` (off) or thinking-token budget (typically `1000`-`8000`) | `0` |

Parsed by `server/services/encontroSkills.ts`. Cached for the process lifetime — restart the server to pick up edits.

## Choosing the budget

The right budget depends on what kind of work the encontro does turn-to-turn. Three archetypes:

### Chip-heavy (Haiku, 0 thinking)

> User picked a chip → call `update_section` → fire next `ask_user`. Repeat.

Most turns are pure data capture with prescriptive chip lists declared in the skill. The agent doesn't need to reason about anything — it copies the chips from the skill, calls one or two tools, moves on.

```yaml
model: claude-haiku-4-5
thinking_budget: 0
```

Expect ~1-1.5s turn latency, ~10× cheaper than Sonnet. **Use for E1, E2, E4.**

### Synthesis-medium (Sonnet, ~4000 thinking)

> Agent must reason about hazards/site/intervention combinations, read knowledge files, and propose with-vs-without confidence ranges.

```yaml
model: claude-sonnet-4-6
thinking_budget: 4000
```

Expect ~4-8s turn latency. **Use for E3 (NBS selector reasoning), E6 (pitch composition).**

### Synthesis-heavy (Sonnet, ~8000 thinking)

> Final maturity scorecard — agent must score 9 metrics + 6 flags consistently across everything captured in E1-E4, justify each score, surface inconsistencies.

```yaml
model: claude-sonnet-4-6
thinking_budget: 8000
```

Expect ~10-15s turn latency. **Use for E5.**

### Per-encontro recommendation (May 2026)

| Encontro | Profile | Suggested config |
|---|---|---|
| E1 — Who we are | Chips + a few free-text confirmations | `haiku-4-5`, `0` |
| E2 — Where we work | Chips + map UI + small risk-rank synthesis | `haiku-4-5`, `0` |
| E3 — What we build | Selector reasoning, hazard→NBS mapping | `sonnet-4-6`, `4000` |
| E4 — What we need | Chips + free-text needs list | `haiku-4-5`, `0` |
| E5 — Results | Full maturity scorecard synthesis | `sonnet-4-6`, `8000` |
| E6 — Portfolio | Pitch composition, narrative weaving | `sonnet-4-6`, `4000` |

## Automatic escalation

The agent server overrides the skill's budget in one case: **file uploads** (user message starts with `"I'm uploading:"` or `"Estou enviando:"`). These contain parsed document content (up to 8KB) that needs real reasoning to map into sections. Forced to `sonnet-4-6` + `4000` thinking regardless of the encontro's default.

See `streamWithSdk` in `server/services/cboAgent.ts` for the override.

## How to tell if you picked wrong

After running an encontro live, check `[cbo] Turn for ...` log lines:

- **Too cheap (Haiku where Sonnet was needed):** agent drops tools, fails to call `update_section` after free-text answers, gives generic chip labels instead of the prescriptive ones declared in the skill, or hallucinates Brazilian context. → Bump to Sonnet.
- **Too expensive (Sonnet where Haiku was enough):** turns regularly take >5s on chip selections that should be instant; agent over-explains in long paragraphs when the user expected to just see chips. → Drop to Haiku.
- **Thinking wasted:** the assistant's text response is a one-liner ("Got it, next:") but thinking_budget was 4000 — the budget is being burned with no visible quality bump. → Drop thinking_budget toward 0.

## Per-tool overrides (future)

Not yet implemented. The current model is "skill declares default for the whole encontro." If we find we need targeted escalation inside a Haiku-default encontro (e.g. when `score_maturity` is called mid-E2), we'll add a tool-level override map in the agent. Don't put it in skill frontmatter — the skill author shouldn't have to think about tool internals.

## When authoring a new encontro

1. Pick the archetype above. Write frontmatter first.
2. Copy the structure of `encontro-1.md` (most prescriptive existing skill): Identity → Voice → Read state → First action → Beat-by-beat instructions → Closing.
3. **Be prescriptive about chips.** Spell out every `ask_user` chip list inline in the skill — don't expect the agent to invent them, especially on Haiku.
4. Add an "Anti-patterns to AVOID" section near the bottom listing the specific failure modes you've seen the agent slip into (re-introducing, asking for exact numbers via free-text, bundling questions, etc.).
5. After shipping, do a manual run-through and watch the logs. Adjust frontmatter once based on actual latency vs. quality.

## Related files

- `server/services/encontroSkills.ts` — frontmatter parser, skill cache
- `server/services/cboAgent.ts` — `streamWithSdk`, budget application, file-upload escalation
- `server/services/cboAgent.ts:buildPhaseInstructions` — hardcoded fallback when skill file is missing

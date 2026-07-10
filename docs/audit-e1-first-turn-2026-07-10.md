# Audit — the CBO's first interaction (E1, turn 1)

**Date:** 2026-07-10
**Trigger:** A fresh CBO ("Comunidad feliz") opened in an incognito window. The agent asked for the
contact's name **a second time**, immediately after the user had answered it — and a green
"Começar Encontro 2" banner appeared after the very first exchange, with 1 of 7 sections filled.

**Status: AUDIT ONLY. Nothing in this document has been fixed.**

Every claim below is backed by a command that was actually run. Where something is inferred rather
than measured, it says so.

---

## 1. What happened, from the log

```
12:44:31  POST /api/cbo                       → new CBO 20aee8ba…
12:44:31  POST /api/cbo/…/prefill             → org_name = "Comunidad feliz", source:'invite'
12:45:28  POST /api/cbo/…/kickoff       200   → templated greeting, ZERO model time
          (user types "Eu seu Joaquim, Dietor")
12:45:47  POST /api/cbo/…/chat
          [cbo] turn routing …: light (short-text) kind=text model=claude-haiku-4-5
          [cbo] timing …: rounds=3 … detail=text | update_section | text
          [cbo] silent_turn_fallback … phase=1 tools=update_section text=true
12:45:57  POST /api/cbo/…/chat          200 in 10034ms
```

The turn's shape — `text | update_section | text` — is the whole story: the model **asked the
question first, and persisted the answer second.**

---

## 2. Root cause of the double-ask

### 2.1 The greeting's question is truncated out of the prompt

`buildDecisionLog()` (`server/services/cboAgent.ts:1516-1541`) builds the `## RECENT CONVERSATION`
block and truncates **every message to 300 characters**:

```ts
return `- ${who}: ${m.content.slice(0, 300)}`;
```

The templated kickoff greeting (`server/routes/cboRoutes.ts:221-226`) is **404 characters**, and the
name/role question is the **last sentence**. Measured across every variant the template can produce:

| greeting variant | length | is the name/role question visible to the model? |
|---|---:|---|
| PT, invite org, no bairro | 404 | **NO** |
| PT, invite org + bairro | 424 | **NO** |
| PT, no org (standalone) | 385 | **NO** |
| EN, invite org | 394 | **NO** |
| EN, no org (standalone) | 364 | **NO** |

**This fires on 100% of first turns, in both languages.** What the model actually sees of its own
greeting ends mid-word:

```
- You (agent): Oi! 👋 Eu vou te ajudar a montar o perfil da Comunidad feliz — leva uns 20
  minutinhos, no seu ritmo. … Senão a gente conversa rapidinho.  Conferindo: vocês são a **C
```

Cut off: `omunidad feliz**, certo? Me corrige se eu errei. E com quem eu tô falando — seu nome e seu
papel por aí?`

So the model can see *that* it greeted, but not that it **asked for the name**, and not the org name
it was confirming. (It also sees a dangling `**` from the mid-token cut.)

### 2.2 The skill's rule is correct — it is being starved of the evidence it needs

`knowledge/_skills/encontro-1.md:140` already says exactly the right thing:

> **The opening greeting is usually already posted for you.** … If RECENT CONVERSATION starts with
> that assistant greeting: do NOT re-greet or re-ask — the user's first message IS the answer to it.

The rule is sound. The prompt just doesn't contain the fact it keys on.

Meanwhile two other instructions actively push toward re-asking, because at prompt-build time
`contact_name` **is** genuinely empty (the user's answer has not been persisted yet):

- `encontro-1.md:147` — "In the same opening, ask the one human thing as plain prose: *E com quem eu
  tô falando…*"
- `encontro-1.md:175` — "if `contact_name` is still empty, ask it now in prose … this question must
  not be dropped." (Scoped to the document/link path, but a weak model over-applies it.)

The model therefore did precisely what the visible evidence supported: asked, then persisted.

### 2.3 …and it was running on the fast model, which it should not have been

`resolveTurnModel()` (`cboAgent.ts:1250`) protects the first turn:

```ts
// First user message of the session = the intro turn (set_phase + framing).
if (getCboMessages(cboId).filter(m => m.messageType === 'content').length < 2) return heavy('first-turn');
```

But the instant-kickoff route persists **one assistant `content` message** before the user ever
speaks (`cboRoutes.ts:233-234`). Simulated against the real `addCboMessage`/`getCboMessages`:

```
after POST /api/cbo                    : content=0  guard(<2) fires heavy? true
after POST /kickoff (template greeting) : content=1  guard(<2) fires heavy? true
after user's FIRST real message         : content=2  guard(<2) fires heavy? false
```

The guard never fires. The next matching rule is `turnKind === 'text' && raw.length <= 200 →
light('short-text')`, so the single most important turn of the session runs on **claude-haiku-4-5**.
The production log confirms it verbatim.

**This is a regression, not an original oversight.** The guard landed first:

| commit | date | |
|---|---|---|
| `c9a00d5e` | 2026-07-02 | `feat(cbo): adaptive turn routing — trivial turns run on the fast model` |
| `fa647505` | 2026-07-07 | `feat(cbo): instant templated kickoff — turn 1 with zero model time (P2)` |

Two latency optimisations. Each correct alone; the second silently disabled the first's protection.

### 2.4 Ruled out

- **`silent_turn_fallback` did not inject the duplicate question.** It logged, but the recovery chip
  is gated on `if (!emittedText)` (`cboAgent.ts:1454`) and the log shows `text=true`. The duplicate
  came from the model.
- **The prefill is not at fault.** `org_name` is written with `source:'invite'`, which
  `phaseComplete` explicitly ignores.

---

## 3. Root cause of the premature "Começar Encontro 2" banner

The banner is gated (`cbo-profile.tsx:1885`) on `phaseComplete(state, state.phase)`.

`phaseComplete` (`shared/cbo-schema.ts:58-79`) falls back to a **section-fill** test:

```ts
return sections.every(sec => {
  const fields = state.sections?.[sec.id]?.fields ?? {};
  return Object.values(fields).some(f => cboFieldIsFilled(f) && f?.source !== 'invite');
});
```

Phase 1 contains **exactly one section**, `org_profile` (`cbo-schema.ts` `CBO_SECTIONS`). So
`every()` over one section reduces to `some()` over its fields: **a single non-invite field marks the
whole of Encontro 1 complete.**

Executed against the real predicate with the state from the screenshot:

```
phase-1 sections: org_profile
maturityScores  : [] (none yet)

phaseComplete(state, 1) = true      <-- gates the "Começar Encontro 2" banner

only invite-prefilled org_name      -> false
+ ONE model-written field (contact) -> true
```

So the model's `update_section('org_profile', { contact_name: 'Joaquim', contact_role: 'Diretor' })`
— the very write that ended the first exchange — flipped Encontro 1 to "complete".

The `source !== 'invite'` guard was added to fix *this same banner* for prefilled orgs (see the
comment at `cbo-schema.ts:73-76`). It closed the invite hole and left the general one open.

The unlock itself is **not** the bug: cohort members default to `unlockedPhases = [1]`
(`cohortRoutes.ts:141`), and the coordinator had genuinely opened Encontro 2.

---

## 4. Secondary findings (real, lower severity)

**4.1 The two progress surfaces contradict each other.**
`filledCount` (`cbo-profile.tsx:1337`) counts sections that merely *have field keys*:
`Object.keys(s.fields).length > 0` — not even that the values are filled. So the header reads
`1/7 seções preenchidas` while the banner simultaneously declares Encontro 1 finished. Both
predicates are weak, in different ways, and they tell the user opposite stories on the same screen.

**4.2 `unlockedPhases` fails open for standalone CBOs.**
`cbo-profile.tsx:556` defaults to `[1, 2, 3, 4, 5]` ("ungated by default") and only narrows it if the
member payload supplies a value (`:625`). A CBO with no cohort member record therefore has every
encontro unlocked. Cohort members are safe (`cohortRoutes.ts:141` → `?? [1]`).

**4.3 The turn violated the "pairing is non-negotiable" prompt rule.**
`cboAgent.ts:506` states every `update_section` turn must also call a user-prompting tool. This turn
called `update_section` and no `ask_user` — hence `silent_turn_fallback`. It was benign here (prose
questions were emitted), but it means the rule is not actually enforced, only logged.

**4.4 `buildDecisionLog`'s 300-char truncation is a systemic hazard, not a kickoff quirk.**
Agent messages put their question **last**. Any assistant message over 300 characters therefore loses
its question from the agent's own memory of the conversation. The kickoff is simply the one message
guaranteed to exceed it on every single session.

---

## 5. Reproduction

1. Coordinator invites an org (sets `org_name`, `source:'invite'`) and opens Encontro 2.
2. Open the invite link in a clean/incognito profile.
3. Click through to the chat; the templated greeting posts (`POST /kickoff`).
4. Reply with name and role in one short sentence (< 200 chars).
5. Observe: the agent re-asks name/role; the right panel fills `contact_name`/`contact_role`; the
   "Começar Encontro 2" banner appears; the header still reads `1/7`.

---

## 6. Options to consider (NOT applied)

Listed with costs, not as recommendations.

**For the double-ask**

| option | cost |
|---|---|
| Don't truncate the **first** assistant message, or raise the cap to ~600 chars | grows the prompt (~11.7k tokens today); other long messages still truncate |
| Truncate from the **middle**, preserving the tail (`head 150 … tail 150`) | questions survive for every message; slightly odd-looking prompt |
| Give the kickoff its own `messageType` and render it verbatim in RECENT CONVERSATION | most explicit; a new messageType must be audited against `resolveTurnModel` (`:1250`) and `buildDecisionLog` (`:1517`) — they filter on `'content'` |
| Have `/kickoff` write `contact_name`'s *asked* state into `CURRENT STATE` | fixes the `contact_name is empty → ask it` rule at its root, independent of truncation |

**For the model routing**

| option | cost |
|---|---|
| Count only **user** `content` messages in the first-turn guard | one-line; correct because the guard means "the user's first message" |
| Have `/kickoff` mark the state so `resolveTurnModel` still routes heavy for the next turn | more explicit, more state |

**For the banner**

| option | cost |
|---|---|
| Require the section's **required** fields, not `some()` | needs a required-field list per section (`shared/cbo-field-catalog.ts`) |
| Require a minimum fraction of fields (e.g. ≥ 60%) | arbitrary threshold, but no new schema |
| Require the phase's `maturityMetrics` to be scored, dropping the section-fill fallback | Encontro 2 intentionally defers its scores — would dead-end it (that's *why* the fallback exists) |

**Ordering note.** The routing fix (2.3) is one line and independent. The truncation fix (2.1) is what
actually stops the double-ask. The banner (3) is a separate bug that merely became visible on turn 1
because the agent wrote a field there.

---

## 7. Severity

| # | finding | severity | why |
|---|---|---|---|
| 2.1 | Kickoff's question truncated out of RECENT CONVERSATION | **HIGH** | fires on 100% of first turns, both languages |
| 2.3 | First-turn heavy-model guard defeated by kickoff | **HIGH** | most important turn of the session runs on the fast model |
| 3 | One field completes Encontro 1 → premature banner | **HIGH** | invites the user to abandon E1 after one answer |
| 4.4 | 300-char truncation drops trailing questions generally | MED | latent; same class as 2.1 |
| 4.2 | `unlockedPhases` fails open for standalone CBOs | MED | no cohort record ⇒ every encontro unlocked |
| 4.1 | `1/7` vs "Encontro 1 complete" on the same screen | LOW | confusing, not harmful |
| 4.3 | `update_section` + `ask_user` pairing only logged, not enforced | LOW | benign in this trace |

---

*All figures reproduced on 2026-07-10 against `main`. The greeting-length table, the routing
simulation, and the `phaseComplete` evaluation were each executed, not reasoned about.*

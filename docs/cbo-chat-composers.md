# CBO chat composers (inline widgets)

Hard-won rules for the interactive widgets that render **inside the CBO chat
stream** (`client/src/core/pages/cbo-profile.tsx`) — NBS **type** strip, NBS
**example** showcase, risk-priority chips, community-anchoring composer. (The map
and intervention selector render in the **right rail**, not the chat — different
lifecycle, see `cbo-platform-architecture.md`.)

Each rule below cost a bug. Apply them when adding or hardening any in-chat widget.

---

## Rule 1 — Persist a composer as a transcript message, or it vanishes on reload

A composer driven **only** by ephemeral React state (a `useState` set from an SSE
event) disappears when the page reloads: `/api/cbo/:id/messages` returns only the
**persisted chat messages**, and the composer *events* are never replayed. The
transcript then shows the agent's text ("dois minutinhos sobre os tipos…") but not
the widget it points at.

**Pattern (reference impl: NBS type/example strips, PR #302):**

- Add the variant to `CboChatMessage.messageType` (`shared/cbo-schema.ts`). We use
  `'composer'`; `content` is a JSON payload: `{ kind, ...args }`
  (e.g. `{kind:'types', typeIds}` / `{kind:'examples', cardIds, mode, intro}`).
- **Server** — persist it in `pushEvent` (`server/services/cboAgent.ts`) when the
  composer event fires, right next to where `chat` events are saved with
  `addCboMessage`. This is what makes it survive reload.
- **Client** — on the live event, **append the same composer message** to
  `messages` (don't keep separate bottom-of-chat state) and render it **inline**
  in `messages.map`, switching on `kind`. Live and reloaded render are then
  identical and in-position.
- Keep composer messages **out of text-based message logic** — they're excluded by
  their `messageType` (the "last content message" finders filter on `'content'`).

> ✅ **Hardened (PERSIST-PROMPTS).** `ask_user`, `ask_priority_rank`, and
> `ask_community_anchoring` are now persisted as composer messages in `pushEvent`
> (`{kind:'ask_user'|'priority'|'anchoring', ...}`) and **rehydrated on load** by
> `hydrateMessages()` in `cbo-profile.tsx`: if the *trailing* transcript message
> is one of these (the user never answered), the live prompt state is rebuilt so
> a reload lands back on the exact question. Answered `ask_user` composers render
> as a plain question bubble so the transcript reads Q→A. They also feed
> `buildDecisionLog` as readable annotations ("You (agent) asked: …") — the agent
> now *remembers* questions it asked, including ones synthesized by the
> inline-options converter. The map is covered separately by the persisted
> `state.activeTool` + right-panel-tool registry (Rule 6).

## Rule 2 — Only a **terminal** composer may `setIsStreaming(false)`

If the agent pairs a composer with a following tool call **in the same turn**
(e.g. a read-only strip followed by `ask_user`), the composer's event handler must
**not** call `setIsStreaming(false)`. Doing so opens a gap — widget rendered, next
event not yet arrived — where banners/inputs flash (the "Começar Encontro N" banner
flicker, PR #301). `isStreaming` resets on the `done` event / stream close anyway
(`sendMessage`'s reader loop). Terminal composers (`ask_user`, map) that end the
turn may end streaming eagerly.

## Rule 3 — A read-only strip needs a paired affordance, or the user is stranded

A strip renders cards with **no buttons**. The turn that shows it **must also call
`ask_user` in the same turn** — those chips are the only continue/skip control
(PR #300). The strip's tool return text should say so; never let a turn end on a
strip alone. (The map composer used to provide "next"; once it was deferred, the
strips had no affordance.)

## Rule 4 — Phase source of truth is `cbo_state.phase`, not `member.snapshotPhase`

`member.snapshotPhase` is a **denormalized cache** refreshed only on a live
`phase_change` SSE event. A phase advanced via `/advance-phase` or during a
cross-device session swap leaves it stale → the welcome screen and coordinator
roster show the wrong encontro. Derive the displayed phase from the **live
`cbo_state`** (`buildMemberPayload` in `server/routes/cohortRoutes.ts`) and
self-heal the cache when it's behind (PR #301).

## Rule 5 — CBO session identity is the **server binding**, not localStorage

A token link's working session is `member.cboStateId`, resolved server-side
(`resolveSession` in `cbo-profile.tsx`). It must be read back on load so the link
resumes the same conversation on **any** device; localStorage is only a same-device
cache (PR #297). Don't key the session on the browser.

## Rule 6 — Right-panel tools go through the registry, not ad-hoc gating

The **right-panel** tools (the Mapa interactive map, the Tipos de SbN selector,
future ones) are NOT the same as inline chat composers — they live in the panel
tabs and must be **always reachable**, never gated behind a one-shot agent button
(a reload would strand the user with no way back into a pending task).

One structural pattern, in `cbo-profile.tsx`:

- **Persist which tool is open.** When the agent calls `open_map` /
  `open_intervention_selector`, the server sets `cbo_state.activeTool = { kind }`
  (in `pushEvent`). It survives reload, so the panel is re-enterable. (Don't gate
  on the ephemeral `openMapParams` event — that's lost on reload.)
- **Persist where the user is INSIDE the tool, next to `{kind}`.** The E2 hazard
  tour's position rides on `activeTool.tourIdx` (0-2 = that hazard, 3 = done),
  written by `POST /api/cbo/:id/tour-progress`. Advancing a tour is a UI gesture,
  not a chat turn — the agent must not hear about it — but it still has to
  survive a reload and a cross-device resume (Rule 5).
- **Re-entry restores the agent's ACTUAL params, from the persisted `open_map`
  composer row.** `hydrateMessages` scans the whole transcript backwards for the
  last one. The trailing-assistant-run rule applies to *questions* ("pending"
  means nothing followed it), never to an opened tool: one chat turn after the
  map opened used to push the row out of the window. And leaving a tool
  (`onCancel`) is navigation — only *completion* (`onConfirm`) may clear
  `openMapParams`.
- **Declare each tool in `RIGHT_PANEL_TOOLS`.** Each entry gives its `tab`, a
  `defaultParams(state)` — a **legacy fallback only**, for transcripts written
  before composer persistence — an `isDone(state)` check (reads the captured
  section field), a `nudge` label, and an `icon`. ⚠️ `defaultParams` must never
  become a second definition of the step: its divergence from the agent's real
  params (`hazardTour: false`, a different prompt) is what made "Abrir o mapa"
  silently open a different map.
- **The plumbing is generic over the registry.** `pendingTool(state)` (open +
  not done) drives a persistent chat **nudge chip** and the **tab pulse**;
  `toolReached(state, kind)` makes the tab render the live tool (`openMapParams ??
  defaultParams(state)`) instead of the "not yet" placeholder. The agent's
  `open_*` just sets the live params + focuses the tab — it never *gates* access.

Adding a tool for a future phase = **one declarative entry** in the registry +
wiring that tab's component render, not a new pile of conditionals. (PR for the
map established this; `interventions` is registered as a stub for E3.)

---

### TL;DR for a new in-chat widget

1. Persist it as a `composer` transcript message (server + client), render inline. (R1)
2. Don't end streaming if it's mid-turn. (R2)
3. If it's read-only, pair it with an `ask_user`. (R3)
4. Read phase/identity from the authoritative server state, not a cache. (R4, R5)

### TL;DR for a new right-panel tool

5. Persist `activeTool` server-side on `open_*`; add a `RIGHT_PANEL_TOOLS` entry
   (`tab`, `defaultParams`, `isDone`, `nudge`, `icon`); the nudge/pulse/always-on
   are generic. Never gate the tool behind a one-shot button. (R6)

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

> ⚠️ **Known gap.** `RiskPriorityChips`, the community-anchoring composer, and the
> map's `openMapParams` are **still ephemeral** — they will not survive a reload.
> When you harden them, apply this pattern. (The map was deliberately made
> session-live-only in PR #298; revisit if reload-resilience is wanted.)

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

---

### TL;DR for a new in-chat widget

1. Persist it as a `composer` transcript message (server + client), render inline. (R1)
2. Don't end streaming if it's mid-turn. (R2)
3. If it's read-only, pair it with an `ask_user`. (R3)
4. Read phase/identity from the authoritative server state, not a cache. (R4, R5)

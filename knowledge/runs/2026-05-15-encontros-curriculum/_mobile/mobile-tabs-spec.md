# Mobile layout — tab navigation with agent-driven focus

**Date**: 2026-05-15 · **Scope**: cross-cutting layout used by every encontro on mobile (`<md` breakpoint, < 768px)

## In one sentence

On mobile, the CBO surface becomes a single-pane app with bottom tabs. The agent drives which tab is in focus — when it invokes a microapp, the UI switches. The user can always tap back. Chat input only exists on the Chat tab.

## Tab model

Two permanent tabs + up to two contextual tabs:

| Tab | Icon | When visible | Has input? |
|---|---|---|---|
| **Chat** | 💬 | Always | Yes |
| **Perfil** | 📋 | Always | No (read-only summary) |
| **Mapa** | 🗺️ | When the agent has `openMapParams` set | No (microapp action button) |
| **Intervenções** | 🌿 | When the agent has `interventionSelectorParams` set | No (selector cards) |

Maximum 4 tabs visible at once. When more microapps appear, the oldest contextual tab is replaced. (For E1–E6 we never have more than 2 contextual tabs at once.)

## Agent-driven focus rules

The agent already drives `rightTab` on desktop. Same state machine on mobile, different presentation.

| Agent event | What happens on mobile |
|---|---|
| `open_map` (e.g. for site selection) | Mapa tab becomes visible · auto-switches to Mapa · agent's current prompt renders as a banner above the map |
| `open_intervention_selector` | Intervenções tab becomes visible · auto-switches · agent's prompt as banner |
| `ask_user` with map relevance | Same as `open_map` |
| Map / Selector returns a result | UI switches back to Chat · the selection is posted as a chat message · contextual tab stays available |
| `phase_change` (forward) | No tab switch; preamble screen for the new encontro shows instead |
| `done` (agent finished a turn) | If user is on a non-chat tab and a content message arrived, show a 🔴 dot on the Chat tab |

## Back-to-chat affordances

Three ways the user gets back to chat:

1. **Auto**: after confirming a microapp action — the selection is sent back to the agent and UI switches automatically
2. **Tab tap**: 💬 Chat tab at the bottom
3. **Banner**: each microapp tab has a "← Voltar ao chat" link in the banner header

## What each tab renders

### Chat tab
- Mobile-first chat layout (we already have this on the chat panel)
- Chat input bar at the bottom (above the tab bar)
- Welcome banner if `memberInfo` present, then messages, then `ask_user` chips when active
- Unread state: when a content message arrives while the user is on another tab, the message stays unread until they return; on the Chat tab, the first unread message gets a subtle "Nova" pill

### Mapa tab
- Top banner: agent's current prompt (e.g. *"Selecione seu bairro e marque seu local"*) + small "← Voltar ao chat" link
- Full-bleed `MapMicroapp` component
- Bottom action button: "Confirmar seleção" (enabled when the user has made a selection that satisfies the agent's parameters)
- "Limpar" link beside the action button for undo

### Intervenções tab
- Top banner: agent's prompt (e.g. *"Escolha o tipo de intervenção"*)
- Full-bleed `InterventionSelector` component (card grid)
- Bottom action: "Confirmar escolha" (enabled when 1+ intervention selected)

### Perfil tab
- Read-only version of the doc panel — same 4-card layout the desktop right rail shows
- An "Editar" button per card → opens an inline editor (existing `EditableField` pattern)
- Scrollable; no chrome
- No "phases" or "scores" — the friendly summary view (see E1 mockup screen 5 right side)

## Badging + unread state

When user is on Map / Intervenções / Perfil and the agent posts a new content message:

- 🔴 dot appears on the Chat tab
- Tab counter stays simple (`💬¹` style) — no detailed count, just a single indicator

When the user taps back to Chat, the badge clears.

## The chat input bar

- **Chat tab**: input visible at the bottom, above the tab bar (existing pattern, full-width)
- **All other tabs**: input is hidden. To message the agent, the user taps the Chat tab. The chat draft (anything typed but not sent) is retained across tab switches — switching to Mapa and back leaves your unsent text intact.

This decision means **microapp tabs have a single concern**: making a selection. They don't double as "type a question to the agent." If the user has a question about the map, they go back to chat and type — and the map is still in the same state when they return.

## Edge cases

| Case | Behavior |
|---|---|
| User is mid-typing in Chat when agent invokes `open_map` | Chat input preserves draft; UI auto-switches to Map; their text is still there when they return to Chat |
| Agent invokes a microapp twice in a row (e.g. updates map params after a selection) | Stay on the same contextual tab; banner updates with the new prompt |
| User dismisses a microapp tab (no built-in dismiss; only by switching to Chat) | Microapp tab remains available; user can return any time; agent state unchanged |
| Streaming agent response while user is on Map | Banner doesn't update mid-stream; updates after `done` event. Chat tab gets the 🔴 dot as soon as the first content message lands |
| User taps Perfil tab during an agent turn | Allowed; Perfil shows current state; agent's response still streams to Chat in the background; 🔴 badge appears on Chat |
| Two microapps active simultaneously (map + selector) | Both tabs visible; auto-focus on the one most recently invoked; user can switch between them via tabs |
| Screen rotation to landscape on phone | Same layout; tab bar moves to the side if width > 640px (basically becomes the desktop pattern) |

## Desktop unchanged

Above the `md` breakpoint (≥768px), keep the current split-screen: chat left, microapp/doc tabs right, no mobile tab bar. The `rightTab` state powers both presentations; no agent-side changes needed.

## Implementation strategy (when we build it)

This is **layout work in `cbo-profile.tsx`**, not new components. The microapps themselves don't change.

1. Add `useMediaQuery('(max-width: 767px)')` hook (or equivalent Tailwind-detection)
2. On mobile, render a single full-height panel based on `mobileActiveTab` state (separate from `rightTab` since they have different semantics — `rightTab` is "what right-rail shows on desktop"; `mobileActiveTab` is "what fills the whole screen on mobile")
3. Sync `mobileActiveTab` with agent events:
   - `open_map` event → `setMobileActiveTab('map')`
   - `open_intervention_selector` → `setMobileActiveTab('interventions')`
   - Selection confirm → `setMobileActiveTab('chat')`
4. Add `mobileChatUnread: boolean` for the badge state
5. Bottom tab bar component — sticky, 56px, with active-tab underline + badges
6. Each tab's content is a wrapper around existing components

Estimated effort: ~3-4 hours when we get to building.

## Out of scope for this spec

- Landscape-specific layout (assume rotation just hits the desktop breakpoint)
- Inline microapps in chat (we considered this and rejected it — map + selector too big for inline)
- Multi-microapp dashboards on the same tab (one microapp per tab)
- Persistence of `mobileActiveTab` across page reloads (always reset to Chat on reload)

## Why not full-screen modals instead

We considered the modal pattern (microapp opens as a takeover, "Done" closes). Rejected because:
- Loses the persistent chat context above the microapp
- Modal dismissal is one more concept to teach the user
- Tabs match what we already do on desktop — single mental model

## Why not inline cards in chat

Considered. Rejected because:
- Map at any usable size is taller than the chat viewport
- The intervention selector's card grid doesn't fit a 375px width inline
- The chat thread becomes hard to scroll past once you have a microapp embedded

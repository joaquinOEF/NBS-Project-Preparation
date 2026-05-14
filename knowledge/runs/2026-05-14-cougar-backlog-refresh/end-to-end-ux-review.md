# End-to-end UX review — Vila Flores pilot (2026-05-14)

Walking the platform from the eyes of the two real users for the June 8 convening:
- **Julia / Antônia** (coordinators) on a laptop, mid-workshop
- **Sandra** (composite: a CBO leader at e.g. Horta Cascata) on her **phone**, between workshops, on patchy mobile data

Goal: catch what's too technical, what's friction-heavy, what'll embarrass us in front of stakeholders on May 25, before we keep shipping features.

## Critical issues

### 1. The CBO page does not work on a phone
**Severity: blocker for June 8.**

`client/src/core/pages/cbo-profile.tsx` hardcodes `w-1/2 border-r` on both the chat panel (line 502) and the document panel (line 696). On a 375px-wide iPhone viewport that's two 180-pixel columns side-by-side — the chat is unusable, the document is unreadable. Julia said April 16: *"the technological tools sometimes are a problem for the communities — we have to think about something accessible for them."* Sandra opens her WhatsApp link, sees this, closes the tab.

**Fix**: collapse to single-column on `sm` and below; surface a "see my profile" sheet/drawer for the right panel. ~2h.

### 2. CBO sees a developer's progress UI, not their own
The chat header (line 519+) shows `1 · 2 · 3a · 3b · 3c · 4 · 5 · 0/7` plus a maturity score chip `0/27`. This is the schema. For Sandra it's gibberish.

**Fix**: replace the strip with a friendly progress chunk — *"You're 30% done. 3 sections complete. Next up: where you work."* Keep the schema strip behind a developer-mode toggle (or just remove from prod). The 🔒 we added means "locked" but adjacent to `3a · 3b · 3c · 4 · 5` is more confusing, not less. ~2h.

### 3. Tooltips don't exist on touchscreens
The locked-phase 🔒 button uses `<Tooltip>` (TooltipContent) to explain *"Your coordinator will unlock this after the next workshop."* That tooltip only fires on hover, which doesn't exist on phones. Sandra taps the lock and nothing happens.

**Fix**: tap on locked phase opens a small bottom sheet / popover explaining the lock + showing the next workshop date pulled from the cohort settings. ~1h.

## Significant friction

### 4. The invite loop is 10× manual
Julia has to: open dialog → type name → type bairro → submit → share dialog → click "Copy WhatsApp message" → switch to WhatsApp → find the CBO contact → paste → send → return to platform → open dialog → … × 10. On a workshop day with limited time this becomes the bottleneck.

**Fixes** (small to large):
- **Bulk invite** — paste a list, one per line (`Org name, Bairro`), creates all at once, shows a copyable summary block
- **`wa.me` deep-link** — instead of copy-to-clipboard, open `https://wa.me/?text=<encoded>` directly. WhatsApp opens with the message pre-filled; pick the contact, send.
- **QR code** at the top of the workshop deck — CBOs scan it with their phone; lands on a self-service "enter your org name" screen → no per-CBO invite at all

The QR route is the most aligned to how Vila Flores actually runs workshops (people in a room, projector behind Antônia). Worth prototyping for the June 8 first workshop.

### 5. Cohort recovery is fragile
"My link" + localStorage is the only path back. If Julia clears cookies, switches laptops, or her browser nukes localStorage, the cohort is unreachable. The slug is a 24-char random string — not memorable, not shareable verbally.

**Fixes**:
- On cohort creation, **email** the coordinator link to a Julia-provided address. Stick a tiny "send to email" button next to "My link".
- Alternatively: generate a 3-word slug (`forest-river-bairro`) instead of nanoid — easier to type, easier to write on a sticky note. Slightly less entropy, fine for pilot scale.

### 6. The CBO has no idea when the next workshop is
The coordinator sees the cadence strip on `/orchestrator`. The CBO sees nothing. *"Coordinator will unlock this after the next workshop"* (tooltip text) — but **when**? Sandra doesn't know if that's tomorrow, next month, or never.

**Fix**: pull `cohort.settings.workshops` into the welcome banner. *"Phase 2 opens after Workshop 2 — Wed June 11."* The CBO page already fetches the member; one extra field (cohort settings) on the `/api/cbo-member/:slug` response. ~30 min.

### 7. The agent throws the user into the deep end
The CBO welcome screen says *"Start your community profile"* and the agent immediately asks structured questions. Sandra hasn't been told *what NBS is*, *why this matters*, or *how long it will take*. Julia at the demo: *"the communities are completely apart from this process — they're used to dealing with food, recycling, not NBS."*

**Fix**: a 3-screen intro before the chat (skippable): (1) "Why we're doing this" — one paragraph + one image, (2) "What we'll ask" — 5 phase pills with one line each, (3) "How long" — *"about 20 min across the workshops, save and come back anytime."* Buttons: **Get started** / **I've done this before, skip**. ~3h.

### 8. The role-picker at `/` is a footgun
Julia visits `/orchestrator/?coord=…` — fine. Antônia (a coordinator herself, but not the cohort owner) visits `/` accidentally — sees City / CBO / Orchestrator cards. Picks CBO → starts a *new, standalone* CBO profile not tied to any cohort. Now she's in two parallel sessions.

**Fix**: when the URL has `?cbo=<slug>` or `?coord=<slug>`, bypass the role gate entirely (already done). But add a fallback: if there's a coordinatorSlug in localStorage but no URL param, the "Orchestrator" card auto-resumes. Same for memberSlug → CBO card. ~30 min.

## Cosmetic but visible

### 9. Sample mode is sparse
4 hardcoded CBOs, all roughly stuck in early phases except `bosque-humaita` which is at phase 5. For a Secretary-of-Planning stakeholder demo this looks toy-like. The cadence shows future dates (`2026-06-11` etc.) which is fine but the unlock buttons in sample mode just toast "Create a cohort to enable" — that's an explicit dead-end.

**Fix**: add 6 more sample CBOs (10 total, matching the priority cohort scale), distribute them across all 5 phases with realistic maturity scores. Make the unlock buttons in sample mode visually *open* the next phase in the sample data temporarily (no server call) so the demo flow shows the unlock animation. ~2h.

### 10. "Switch role" on the orchestrator header
Top-right corner has `← Back to role selection`. For Julia, this is a permanent footgun — one wrong click and she's at the role picker losing context.

**Fix**: when in live mode (coordinator slug present), replace "Switch role" with a small avatar / cohort-name pill that opens a popover with *Sign out of this cohort* + *Open a different cohort* (which routes through the LoadCohortDialog). ~1h.

### 11. PT-default for the Brazilian audience
The role-selection page, the headers, the orchestrator chrome — all default to English until the user clicks the language picker. The audience is Portuguese-first.

**Fix**: detect `navigator.language` on first load. If `pt-*` → set i18n to `pt`. Persist the choice. ~30 min.

### 12. "Phase" is engineering language
Throughout: *Phase 1*, *Phase 2*, *Phases unlocked*. The Portuguese term *Fase* works but in Vila Flores' workshop framing these are *workshops* (Encontros). Better: *Encontro 1 — Quem Somos*, *Encontro 2 — Onde Trabalhamos*. Pull from `cohort.settings.workshops` so the data already knows the names. Coordinator's user-facing labels match her workshop deck. ~1h once the data is plumbed.

## Suggested priority order before June 8

| When | What | Why |
|---|---|---|
| **This week** | (1) CBO page mobile layout, (2) friendly progress chunk, (3) tap-popover on locked phases | Without these the CBO experience is broken on phones, period |
| **Next week** | (4) `wa.me` deep-link + bulk invite, (6) next-workshop date in welcome banner, (7) 3-screen intro | The CBO-side friction that costs us drop-offs in week 1 of convening |
| **Before May 25 demo** | (9) richer sample mode, (10) less footgun-y header, (11) PT default, (12) "Encontro" naming | These ship the stakeholder-tour polish |
| **Nice to have** | (5) email cohort link / 3-word slug, QR code workshop flow | If time permits |

**Total estimated**: ~15–20h of focused work. Realistic for the May 14–June 8 window.

## What I'm not suggesting

- Reworking the chat / agent flow itself — that's content + agent-prompt work, not UX
- Adding new platform features (territory report, status pill, sector tabs) — already on the backlog, lower priority than fixing what we have
- Real auth — defer to Phase 3 per the existing scope
- Multi-coordinator support — single Julia for the pilot is fine

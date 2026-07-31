# Building CBO chat flows — traps, and how to test them

Written 2026-07-31 after adding the W2 diagnostic beats (frame → worry → story →
photos → read-back). Every item below cost real debugging time in that one
change. Read this before adding a beat to `serveE2Checkpoint` or writing an e2e
spec for one.

Related: `docs/cbo-chat-composers.md` (composer persistence rules),
`docs/cbo-ux-audit-backlog.md`, `knowledge/_skills/encontro-2.md`.

---

## 1 · `turnKind` does not mean "how the user answered"

**The trap.** A beat that ends with `ask_user` and also wants free text cannot
key off `turnKind !== 'chip'`.

`cbo-profile.tsx` routes a typed message through `handleSelectOption` **whenever
a question is pending** — so typing into an open question posts as
`turnKind: 'chip'`. Dictation does not: `useVoiceRecorder`'s `onTranscript`
always posts `turnKind: 'text'`.

So the naive guard captures *spoken* answers and silently drops *typed* ones —
and the turn falls through to the model, which replies with something generic
while your field stays empty. It looks like the model "ignored" the user.

**The rule.** For a beat that accepts free text *and* offers chips:

```ts
if (val('_story_pending') === 'yes' && raw && !raw.startsWith('Map selection (')) {
  const n = normChip(raw);
  const isBeatChip = n === normChip('Prefiro pular') || n === normChip('Já está no arquivo');
  if (!isBeatChip) { /* treat as free text */ }
}
```

Accept either kind, and exclude the beat's own chip labels by name. With one
pending question the posted message is the typed text verbatim, so this is safe.
(With *two* pending questions `handleSelectOption` joins answers with `'; '` —
don't offer a free-text beat alongside a batched question.)

**Alternative:** end the beat with `say()` and no `ask_user`, like the
"Outro papel" turn. Then typing posts as `text`. You lose the skip chip.

---

## 2 · Free-text handlers must sit above the chip gate

`serveE2Checkpoint` has `if (turnKind !== 'chip') return false;` partway down.
Anything consuming free text goes **above** it, next to the other
`_*_pending` handlers. Below it, the handler is unreachable for text turns.

## 3 · The pending-flag pattern

Deterministic free-text capture is a two-turn handshake, and it is the only
pattern that survives reload and park/resume:

1. Beat N writes `_thing_pending: 'yes'` and asks.
2. The next turn checks that flag, consumes `raw`, clears the flag, sets
   `_thing_done: 'yes'`, and serves beat N+1.

Never use a counter or "how many messages so far". State lives in saved fields
so a reload mid-beat resumes exactly where it was (there is a spec for this).

## 4 · `_`-prefixed fields are hidden from humans, not from the export

`isInternalCboField` filters `_*` out of the profile panel and summary — but
`cboRoutes.ts`'s markdown export dumps every field. Don't put anything in an
internal field you would not want a coordinator to read.

## 5 · Ship a bridge for sessions parked mid-flow

Orgs sit in a half-finished E2 for days. If you insert beats after step X,
sessions already parked at step X will tap a chip that no longer routes
anywhere and fall through to the model. Add an explicit bridge:

```ts
if (tenure && !val('_worry_offered') && (is(E2C.temArquivos) || is(E2C.semArquivos))) {
  writeE2Fields(cboId, state, { _worry_offered: 'yes' }, pushEvent);
  askWorry([]); return finish('ask-worry-bridged');
}
```

## 6 · If you ask for a correction, the correction has to change something

The read-back tells the org their answer counts for more than our number. The
first build stored `_hazard_check_json` and the ranking still read the raw
bairro means — so an org could say "it floods worse here" and watch the
recommendation repeat the old reasoning back at them. That is worse than not
asking.

Wire the correction into `rankFamiliasForSite` (`corrections`) **and** into the
why-line copy. Quoting our own number back at someone who just corrected it is
the fastest way to look like we weren't listening.

## 7 · Watch for accidental copy duplication across beats

Beat 0 said "o nosso mapa é grosso, cada quadradinho cobre uns quarteirões".
Beat 4 opened with the same sentence four turns later, and the question itself
said it a third time. The skill's voice rules ban connective filler; templated
beats make it easy to violate them without noticing. Read the whole beat
sequence as one transcript before shipping.

## 8 · Don't let a deterministic "why" become a claim you can't support

Two famílias printed the identical why-line because both had the same
top-contributing hazard. Adding the família's own strongest hazard fixed the
duplication — but the first phrasing, *"a que mais dá conta de calor"*, read as
a superlative across famílias and was false for Agricultura Urbana. Deterministic
copy states what a thing *works on*, never where it ranks.

## 9 · Degraded paths are the common case — design them first

Three scenarios worth running against any new beat, because each one exposed a
real gap the happy path hid:

**The org has no site.** The "Ainda não" fork used to park the session with
nothing captured but a bairro name — no worry, no story, no depth read — which
meant the orgs the coordination most needs to understand produced the *least*
information. A bairro is a place: run the diagnostic at bairro level, adapt the
copy (`hasSite` → "bairro" not "lugar"; the read-back validates the bairro
figure against their day to day), and keep the "Já sei o lugar" escape one tap
away via a fork, not buried behind the whole questionnaire.

**The org contradicts the data.** Disagreement must be recorded as a finding,
never treated as an error — it is the clearest signal the bairro average doesn't
describe their corner. Compare **relatively**, not against an absolute cutoff:
in a bairro where every hazard reads low (common — the landslide ramp never
leaves green city-wide) an absolute gate never fires, and the disagreement is
silently lost.

**The org shares nothing but taps.** No voice note, no photo, no document. This
must still yield: what worries them, what the place is, whether they can use it,
where it is, their read on our figure, and the fact that they declined. Assert
that explicitly in a spec — "it didn't crash" is not the same as "we learned
something".

## 10 · Don't gate the deliverable on completing the flow

The depth read was originally written only in `closeE2`, which runs after the
interest and role loops. Orgs routinely stop once they've seen the famílias, so
the artefact W2 exists to produce was missing for exactly the half-finished
sessions that most needed it. Recompute after every beat; it is a pure function
over saved fields plus one cheap query.

General form: **if a flow produces something for someone downstream, persist it
incrementally, not at the end.**

---

## Leaflet: unmounting during an animation throws

`Cannot read properties of undefined (reading '_leaflet_pos')`, stack ending in
`_onZoomTransitionEnd → _move → _getMapPanePos → getPosition`.

Leaflet 1.9.4's `_animateZoom` schedules `setTimeout(_onZoomTransitionEnd, 250)`
as a workaround for WebKit not firing `transitionend`. **`remove()` cancels
neither that timer nor the `_animatingZoom` flag the handler guards on.** So
closing a map panel mid-zoom — which confirming a site does every time — fires
the orphan timer against a detached `_mapPane`.

It throws from a timer, so no `try/catch` at the call site sees it. In dev the
Vite runtime-error overlay then covers the page and **swallows every subsequent
click**, which reads as "the app froze" and makes any e2e run mysteriously time
out with `element is not stable`.

```ts
return () => {
  try { (map as any)._animatingZoom = false; } catch {}
  try { map.remove(); } catch {}
  mapRef.current = null;
};
```

`map.stop()` is **not** a substitute — it calls `setZoom()` and can start a
fresh animation.

Same class of bug: any `setTimeout` that touches the map must be cleared on
unmount *and* guarded with `if (mapRef.current !== map) return;`. The staggered
`fitToBairro` refits (350 ms, 1000 ms) had neither.

---

## Writing e2e specs for these flows

**Always wait for a chip before tapping it.**

```ts
const tap = async (label: string) => {
  await expect(chip(label)).toBeVisible({ timeout: 15_000 });
  await chip(label).click();
};
```

The composer re-renders as the checkpoint streams; clicking into that gap drops
the tap silently and the test then times out at the *next* assertion, pointing
at the wrong line. This was the single biggest source of false failures.

**Retry the map zone tap at mobile viewports.** At an iPhone size the map is
small enough that the centre point can land outside the zone polygon, leaving
`map-confirm-bairro` disabled. Desktop specs never see it.

```ts
for (let i = 0; i < 5; i++) {
  await clickCenterZone(page);
  await page.waitForTimeout(600);
  if (await confirmBairro.isEnabled().catch(() => false)) break;
}
```

**Let the scroll settle before screenshotting.** The chat follower animates for
~900 ms. Screenshots taken the instant an assertion passes catch it mid-scroll
and look like "the question is below the fold" — a false UX bug. `waitForTimeout(1400)`
before `page.screenshot`.

**Assert no page errors.** Cheap, and it is how the Leaflet bug surfaced:

```ts
const errors: string[] = [];
page.on('pageerror', e => errors.push(e.message));
// …
expect(errors, `page errors: ${errors.join(' | ')}`).toHaveLength(0);
```

**Check horizontal overflow on the document, not the viewport** —
`document.documentElement.scrollWidth - clientWidth <= 1`, and the same on
`body`.

**Distinguish a product bug from a seeding artifact.** The header read
"Seção 1 de 5 · Quem somos" through all of E2 — but only because the spec seeds
`phase: 2` *after* the page has loaded, and the client doesn't refetch its
phase. After a reload it correctly reads "Seção 2 de 5 · Onde trabalhamos".
Reload before reporting anything that looks like stale UI.

**Ambiguous `getByText` matches.** `'o que mais preocupa vocês'` matched both
the chip question and the free-text follow-up → strict-mode violation. Anchor on
a fragment unique to the turn you mean (`'Me conta:'`).

**Update the sibling spec.** `cougar-e2-linear-journey.spec.ts` asserts the
whole templated chain in **both languages**. Any new beat must be added there
too, with pt *and* en labels, or it fails on the language you didn't test.

## Running it

```bash
export DATABASE_URL="postgresql://localhost:5432/nbs_e2e"
npx playwright test --project=chromium e2e/cougar-e2-diagnostic.spec.ts --workers=1
E2E_VIDEO=on npx playwright test …        # records video.webm per test
```

The `webServer` block in `playwright.config.ts` supplies the dummy
`OAUTH_*` / `OPENAI_API_KEY` that `authService` and the module-level OpenAI
clients demand at import. Starting `npm run dev` by hand without them crashes on
boot — copy the env from that block.

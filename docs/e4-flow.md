# Encontro 4 — the pre-note

Decided 13–14 Oct 2026 (JVP, Ana, Vila Flores). After the technical visit,
each organisation turns ONE solution into a one-page pre-note: problem,
solution, expected impact with 2–4 indicators, a basic budget, partners, open
items. Organisations are not NBS specialists, so the page is **computed**;
the encontro asks only what is missing.

## The flow (`server/services/cboE4Checkpoint.ts`)

Templated like every encontro, behind the pending-question contract; the step
is derived from saved fields (`_e4_*` in `intervention_type`), so a reload or a
return lands on the same question. Nothing waits on a person.

0. Encontro 3 not closed → "Fechar o Encontro 3 e seguir" (never a lock).
1. **Input**, one tap each: the solution (the visit's, "É essa?" — else one of
   theirs, marked "sem visita"), its size ("10 por 12" understood; dimensions
   keep their exact m²), the place (map only if none, skippable), the problem.
2. **Prefill** — `show_prenote`: the page at once, gaps in orange.
3. **Gaps**, only the open ones: quem é atingido · o que querem ver mudar
   (chips = indicators) · quem faz (a confirmation when E3's "quem faria?"
   answered it) · quem cuida · o que a organização coloca · com quem já
   conversaram. "Não sei" closes a question and never prints as information.
4. **One check** → `_e4_closed`. "Mudar algo" reopens one part only.

A free question goes to the model (`knowledge/_skills/encontro-4.md`); the
encontro then puts its own question back.

### The coordination can answer some of it (22 Oct)

"Levar ao Encontro 4" is a two-step view in the drawer: confirm, then **"O que
ainda falta"** (`E4AnswersPanel`) — every question above, each marked optional,
plus a context box and files. The same form sits in Documentos for any
organisation in Encontro 4, so it can be filled after a call.
`POST …/member/:id/e4-answers` writes the **same fields** the chat writes, so
the chat never asks an answered question; blanks are asked there. Options live
once, in `shared/e4-options.ts`, for both.

What the coordination wrote is remembered as values (`_coord_answers_json`); an
answer counts as the coordination's only while the record still holds that
value (`answeredByCoordination`). The page says so on each line ("registrado
pela coordenação") and per section; the one check becomes "A coordenação já
adiantou N respostas… Confere tudo?" — "Corrigir uma" opens the change menu,
which now also covers the place and the main problem. The organisation's
correction replaces the value, and the mark goes with it (latest wins; the
edit log keeps the earlier one).

## The page (`shared/e4-prenote.ts`)

`buildPrenote()` — no model. One solution: E4's confirmation → the visit
(`_visit_json`, recorded in the drawer, `shared/e4-visit.ts`) → the first test
that made sense, and the page says which. Budget = works (ficha band at the
size) · studies (only a figure that buys the study enters the total — the ART
row is a fee) · first-year upkeep · contribution. Indicators from the fixed
menu (`shared/e4-indicators.ts`, reviewed once by Robson via
`docs/e4-indicators-review.md`). Same object renders the chat card
(`CboPrenoteCard`), the drawer (`PrenotePanel`: one optional review stamp,
per-section rewrites pinned to their inputs) and the print
(`/api/cbo/:id/prenote`, `…/member/:id/document/prenota`).

Walk it: `e2e/e4-encontro.spec.ts`; film it: `E4_VIDEO=1 npx playwright test e2e/quality/e4-walkthrough-video.spec.ts`.

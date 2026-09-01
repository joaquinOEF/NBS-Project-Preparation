# What Encontro 3 asks that Encontro 2 already answered

Field-by-field, from the engines themselves (`serveE2Checkpoint` in
`cboAgent.ts`, `cboE3Checkpoint.ts`, `w3-questions.ts`) and checked against a
real record — the context export of `test aug 4 456`, Azenha, which finished
Encontro 2 on 4 August.

## The finding in one line

**One hard duplicate, one conditional one, and two soft ones — and none of them
is a badly written question.** The redundancy is structural: neither the draft
source nor the question filter looks at what Encontro 2 captured. Fixing the
questions one at a time would be patching a class of problem at its leaves.

## The comparison

| Encontro 2 captured | Encontro 3 asks | verdict |
|---|---|---|
| `site_story` — prompted with *"o que acontece quando chove forte, quem usa o espaço, o que já tem plantado ou construído ali"* | `baseline_condition` — *"Antes de qualquer obra: como é o lugar hoje?"* | **⚠️ duplicate** |
| `site_story` (same prompt names *quem usa o espaço*) | custom question *"Quem mais usa esse lugar hoje, além de vocês?"* | **⚠️ conditional duplicate** — only when the story did not cover it |
| `role_preference` — *"que papel a organização quer ter na execução"* | `construction_model` — *"E quem constrói isso?"*, and `who_maintains` | **soft** — different answer sets, but the W2 answer strongly predicts the W3 one |
| 3 photos of the place | `baseline_condition` copy asks for *"uma foto com data"* | **partial** — they already sent photos; what is missing is the date, not the photo |
| `site_name` + pin | opening *"Confere?"* | fine — a one-tap confirmation after weeks, not a re-ask |
| `site_area_m2` (when drawn in W2) | *"Ainda é esse o tamanho?"* | fine — same reason |
| `site_worry` | not re-asked; drives the shortlist | ✅ |
| `nbs_interest` (família) | `chosen_solutions` (a specific solution) | ✅ narrowing, which is the point of Encontro 3 |
| `land_tenure` | not re-asked; gates the `who_maintains` options through the manifest | ✅ |
| `current_use`, `prior_collaboration`, `teia_sprint` | not re-asked | ✅ |

The eight custom questions in `w3-questions.ts` are otherwise clean: where the
water goes when it overflows, what a year of upkeep costs, whether there are
houses above or below the slope, whether the funded project covered maintenance,
who runs the place. None of those is in the Encontro 2 record — and the last two
are *conditioned* on Encontro 1 answers, which is the pattern the rest should
follow.

## The evidence for the hard one

Encontro 2, in their own words:

> *"El problema en esta plaza es que no solo hace mucho calor porque no hay
> árboles, sino que pega el sol directo y hay bastante pavimento, sino que
> también cuando llueve se inunda porque no drena el agua y se llena de agua de
> barro y a los días aparecen muchos mosquitos."*

That is the baseline: no canopy, direct sun, paved, no drainage, standing water,
mosquitoes. Asking *"como é o lugar hoje?"* one beat later is asking someone to
repeat a paragraph they wrote three weeks ago, and it reads as not listening.

By contrast *"por que aqui?"* is genuinely new, and the same organisation's
answer proves it — community already gathers there, it is near where they can
act, they know it well, planting would have a large effect. Encontro 2 asked
what *worries* them, never why *this* place. Keep it.

## Why it is structural, not per-question

Two places decide what Encontro 3 asks, and neither reads the Encontro 2 record:

1. **Drafts come only from uploaded files.** The advisor is told: *"Se algum
   arquivo que ELES enviaram já responde uma delas…"*. An answer they typed in
   Encontro 2 is not a draft source, so `site_story` can never pre-fill
   `baseline_condition` no matter how exactly it answers it.
2. **Question selection is not told to skip what is already answered.** The
   instruction says *"Escolha pelo que falta para ESTE projeto"* and *"Se duas
   perguntam quase a mesma coisa, escolha uma"* — both about the question bank,
   neither about the record.

So the fix is three small changes at the source rather than edits to individual
questions:

- let a draft quote an **Encontro 2 answer**, with its provenance shown
  (*"vocês contaram isso no Encontro 2"*) and the same confirm / rewrite / skip
  chips the file drafts already use;
- tell question selection to **drop any question the Encontro 2 record already
  answers**;
- offer `construction_model` a **default derived from `role_preference`** rather
  than asking blind.

The first one also shortens Encontro 3 by a beat for every organisation that did
Encontro 2 properly, which is most of them.

## What this audit does not cover

Encontro 1 against Encontro 3 — only E2↔E3 was asked for. `w3-questions.ts`
already conditions two of its eight on E1 answers, which suggests that pairing is
in better shape, but it has not been checked.

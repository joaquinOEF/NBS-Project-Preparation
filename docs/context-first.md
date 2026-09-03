# Use everything they gave us

⚠️ **Read this before writing any pass that sends something to a model.** It is
a design rule with a test behind it: `shared/context-sources.ts` +
`e2e/context-first.spec.ts`.

## The ask

> "every time we are either creating a concept note or creating the synergy
> report or trying to parse what the community has shared in order to process it
> with an LM, we should always try to use as much context as possible. They have
> shared it — images, files, data, all the fields. The main idea is not just to
> get verbatim what they share. It's to help them process what they know into
> something useful, as a consultant."
> — JVP, 2026-09-03

An organisation walks its own site, photographs the drain, uploads the proposal
it already wrote, types a paragraph about where the water goes, and taps through
sixty fields across three workshops. What it gets back should be worth all of
that. A pass that reads a tenth of the record and writes fluently from it
produces something the organisation could have written itself — which is exactly
the failure this whole document set was written against.

## Why it keeps happening

**The failure is a silence, not a bug.** A pass that never consumes a source
nobody remembered it could have leaves no stack trace, no failing test and no
complaint. The output is merely thinner than it could have been, and thinner in
a way only someone holding the whole record can see.

That is why the rule is not "use all the context". It is:

> **Declining a source is legitimate. Forgetting one is not.**

## The audit that produced this (2026-09-03)

Five model-facing passes. One shared context builder —
[`server/services/contextBundle.ts`](../server/services/contextBundle.ts), whose
own header says it is written for *"a coordinator preparing Workshop 3, a partner
org being handed a project, **or an agent given the folder as context**"*. It was
built for the coordinator's export button, and **one pass used it.**

| pass | bundle | photos | doc full text | transcript | cohort | prior artefacts |
|---|---|---|---|---|---|---|
| `w3Advisor` | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ |
| `familiaRanker` | ❌ | ✅ | ❌ | ❌ | — | ❌ |
| `conceptNoteAuthor` | ❌ | ❌ | ❌ | ❌ | ❌ | facts only |
| `synergyReport` | ❌ | ❌ | ❌ *summary only* | ❌ | ✅ | ❌ |
| `impactModelService` | ❌ | ❌ | ❌ | ❌ | — | ❌ |

Three findings worth naming:

1. **The cohort pass cannot see what the cohort produced.** `SynergyMember`
   carries no concept note and no authored prose, so section 7's approval routes
   and section 5's argument — the two most poolable things a cohort has — never
   reach the pass whose entire job is pooling.
2. **It reads summaries where the advisor reads documents.** The synergy pass
   gets a 280-character précis of an uploaded Teia Sprint proposal. That proposal
   is exactly the artefact that shows two organisations proposing the same thing.
3. **The photographs inform one ranking and nothing else.** They walked out and
   took them. They reach the W2 família ranking and stop there.

## The two mechanisms

### 1 · Every pass declares every source

`shared/context-sources.ts` holds a catalogue of the twelve sources and, per
pass, one of three states for each:

| | |
|---|---|
| `uses` | consumed today |
| `declines` + **because** | a design decision, with the reason, so a reader can disagree with it |
| `missing` + **because** | should be consumed and is not — a named backlog item rather than a silence |

The test fails on any pair carrying none of the three. **Adding a source to the
catalogue therefore forces every pass to say something about it**, which is the
whole point: a new source cannot be added quietly.

The gap count is printed on every run and ratcheted — it may fall freely and may
only rise deliberately. It is not asserted to zero: a red suite everyone learns
to ignore protects nothing.

⚠️ The first version of the registry wrote `'same'` as the reason five times and
the test rejected it. A reason repeated by reference is a silence with better
manners.

### 2 · Images and documents arrive pre-digested, with a source

The concept note's authoring pass receives the **fact base and nothing else** —
that is what stops an invented figure in a funder document. "Use all the context"
and "facts only" look like opposites. They are not: the fix is to put more
sources **into the fact base**, not to hand the model raw material.

```
foto 02  ──▶ [reading pass] ──▶ «o chão é cimento liso, sem ralo visível»
proposta ──▶                    observation · source: "foto 02"
             ──────────────────▶ conceptNoteFacts() ──▶ [authoring pass]
                                                        sees only facts
```

An observation is a fact with a provenance string, and it passes through the same
guards as every other: source per paragraph, and no numeral absent from the fact
base. The reach widens; the guarantee does not move.

⚠️ **Why not just hand the photos to the writer.** The number guard cannot catch
an invented noun. "O pátio tem um ralo entupido", read off an ambiguous
photograph, is not a figure — and nobody reading the page can tell it from an
observed one. Pre-digesting puts the claim in the record, where it is checkable,
before it is written from.

## The rule, for the next pass anyone writes

1. Start from the catalogue, not from the fields you happen to have to hand.
2. Take `uses` for anything the pass can honestly act on.
3. Write a real sentence for anything you decline. If you cannot write one, you
   are forgetting rather than declining.
4. A source you want and cannot reach yet is `missing`, with the reason — and it
   shows up in the count until someone closes it.

## Worked example: the funding workshop (2026-09-03)

The 26 August deck — *"Como Desbloquear Financiamento para SbN em Nível Local"*,
PxG ↔ OEF ↔ BwB — told eighteen organisations, once, in a room, what the funding
landscape actually looks like. That is the shape this rule is about: knowledge
the organisation does not have and cannot assemble, sitting outside the product.

It now lives in `shared/funding-sources.ts` and reaches two places:

- **The concept note**, as section 9 — *Caminhos de financiamento*. Not a list.
  The record already holds what decides eligibility for most of these: whether
  there is a CNPJ, whether they have run a funded project before, how big this
  one is. The section matches one against the other and **names the barrier**
  where there is one — "⚠️ exige histórico comprovado, e o registro não mostra
  projeto financiado anterior" — because that is the part the organisation
  cannot do alone.
- **The context bundle**, under *Base de conhecimento do programa*, explicitly
  marked as not being that organisation's record. An agent handed only one
  organisation's answers can summarise them; it cannot advise.

Three rules the example fixed in place:

1. ⚠️ **A closed call is never presented as an option.** The deck's own caveat
   travels with every path, and every non-open status carries "confirmar antes de
   preparar candidatura". Sending an organisation to a door that is not there is
   worse than naming no door.
2. **The vocabulary is the deck's.** Financiamento filantrópico (não
   reembolsável) versus comercial, edital, Termo de Fomento, contrapartida,
   histórico comprovado, agregação. One string for the philanthropic/commercial
   distinction, shared by the note and the bundle, so nobody has to translate
   between the room and the page. A test checks the word FORMS — "edital"
   pluralises to "editais", and the first version of that check failed against a
   document using the word correctly.
3. **The aggregation argument belongs in the document.** A note asking for
   R$ 20–40k reads as too small to process until the reader knows it is one of
   eighteen in a pipeline. That is the programme's own reason for existing, and
   it was only ever said out loud in a workshop.

## The first gap closed (2026-09-03)

The synergy pass now reads what the cohort produced. Four sources moved from
`missing` to `uses`, and the gap count fell from 13 to 10:

- **`artefacts`** — the approval instrument each project goes through, and the
  funding paths each organisation is eligible for or blocked from.
- **`knowledge`** — the funding landscape, as eligibility rather than as a list.
- **`docFullText`** — ⚠️ the route was passing `docPreview.filenames`. Not the
  full text, not even the summary: **a list of names**, to a pass whose own
  prompt asks it to notice two organisations proposing the same thing.

What that produces is the thing no organisation can reach alone. Across five
simulated organisations: **three blocked by the same "histórico comprovado"** on
the same call, and **two needing the same ART**. Both are now deterministic
outputs — `pooledInstruments` and `sharedFundingBarriers` — printed in the
report and on the coordinator's page:

> **Mesma barreira de financiamento.** O argumento da agregação, em números:
> nenhuma dessas organizações resolve isto sozinha, e juntas viram uma proposta
> que um financiador consegue processar.

That sentence is the funding workshop's central argument, computed from the
cohort's own records rather than asserted in a slide.

## The second gap closed: the photographs (2026-09-03)

They walked their own site and photographed the ground. Those images informed
the W2 família ranking and nothing else.

⚠️ **And the fix was not to build a second vision pass.** The advisor already
reads the images and the full text of what was uploaded, and already emits
one-sentence observations carrying `basedOn` — what each was based on. That is
exactly the pre-digested shape this document prescribes, and it was already
being produced and thrown away by everything downstream of the roadmap.

So the concept note reads the observations, not the images:

```
foto 02 ─▶ [advisor, already running] ─▶ «O piso do pátio é cimento liso e não
                                          há ralo visível em nenhuma das fotos.»
                                          basedOn: "foto 02-onde-a-agua…jpg"
                                       ─▶ conceptNoteFacts().observations
                                       ─▶ [authoring pass] — still facts only
```

Three properties make this the architecture rather than a shortcut:

- **An observation is a fact with a source**, so it passes every guard the rest
  of the fact base does — and a figure inside one becomes quotable by the
  writing pass, which is the whole reason to pre-digest rather than hand over
  the image.
- **One with no provenance is dropped.** A claim read off a photograph, with no
  photograph named, is indistinguishable from an invented one.
- **It is attributed as ours.** "…_(leitura nossa — foto 02)_" sits beside their
  quoted sentences and is never blended into them. Their words are quoted; this
  is inferred from material they sent.

Gap ratchet: 13 → 10 → **7**.

## The third gap closed: the cohort (2026-09-03)

The last one the advisor held back on purpose. `cohort: []` was passed
deliberately, because it is **the only input that leaves an organisation's own
record**. The question was never whether to pass it, but what.

⚠️ **An allowlist, never a spread.** Every line is a COUNT — how many
organisations share a need, an instrument, a barrier, a bairro. No names, no
quotes, no peer's site, no peer's verdict. The last time a peer-facing view was
built as a denylist over a member object, a `review` field and its reviewer's
name reached an external partner; a spread leaks whatever is added to the type
next, and this type is added to often. `peerFrom()` carries six fields and a
test asserts it carries exactly those.

The counts are what carry the advice anyway:

> *3 outras organizações do grupo precisam do mesmo estudo: um teste de
> infiltração do solo. Isso é contratável em conjunto.*
> *2 outras organizações esbarram na mesma barreira de financiamento (Teia de
> Soluções). É exatamente o caso que a agregação num portfólio resolve.*

An organisation does not need to know **who** else needs the infiltration test —
the coordination does, and it has the synergy report for that. It needs to know
it is not alone in needing it, because that is what makes pooling worth asking
for. And only what THIS organisation shares is reported: a study nobody else
needs says nothing useful to it, and listing the group's every need would be the
spread this avoids, in prose.

Gap ratchet: 13 → 10 → 7 → **6**.

## The fourth gap closed: the cohort, on the page (2026-09-03)

The advisor had the counts. The **document a funder reads** did not — and that
is where the programme's argument belongs. Eighteen small requests that each
need the same soil test, pass through the same secretariat and are blocked at
the same funder are one portfolio; the same eighteen, read one at a time, are
eighteen reasons to say no.

So `conceptNoteFacts()` now carries `cohort: string[]`, passed through untouched
from the same `cohortLines()` the advisor uses, and section 9 states the counts
as bullets under a citation that says what they are:

> *grupo COUGAR — contagens do próprio grupo, sem identificação das organizações*

Three things had to be got right, and two of them were only found by printing
the page and reading it.

1. **The lines had to learn English.** They were advisor-only context before,
   where Portuguese in and English out is fine because the advisor rewrites.
   A concept note printed in English cannot carry a Portuguese sentence, and
   the reader of the English document is the funder.

2. **Agreement.** The first printed run said *"1 outra organização precisam do
   mesmo estudo"*. No test failed: every guard here is about what may leak, none
   about whether the sentence is grammatical.

3. **⚠️ The pass added the counts up.** Handed 7 on one line and 6 on another,
   it wrote *"outras oito organizações do mesmo grupo esbarram nas mesmas
   barreiras"* — in a cohort of eight, where seven others is the ceiling. Every
   digit check passed it, because *oito* has no digits. It is now a guard of its
   own: a count of ORGANISATIONS, in words or digits, must be one the cohort
   lines actually state, or the paragraph is dropped. Deliberately narrow —
   "as duas soluções combinadas" is a true sentence and a blanket word-number
   rule would throw it away — because what cannot be loose is a count of other
   people, in a document that goes to a funder.

The prompt rule that fixed (3) then leaked into the prose: one note explained on
the page that the counts were *"não somáveis entre si"*. Our rules are ours;
the reader wants the right number, not the rule that produced it — the same
lesson as `docs/document-register.md`, in a new place.

Gap ratchet: 13 → 10 → 7 → 6 → **5**.

## The fifth gap closed: what an approval and a funder actually require (2026-09-03)

The advisor's fourth task is to name what a funder or the municipality will ask
and nobody can answer yet. It was doing that from general knowledge, which
produces *plausible* gaps rather than this cohort's real ones — "seria bom ter
mais informação" instead of "a SMP analisa em 30 dias e ninguém começou o
pedido".

Both approval routes and all eight funding paths now reach it, handed over
whole. Pre-filtering them would be this file deciding which question matters,
which is the model's job with the record in front of it. The funding side *is*
matched against the organisation, because eligibility is a fact about it — a
CNPJ it does or does not have, a funded project it has or has not run.

What it wrote on the first live run, for an organisation with no CNPJ:

> *A organização não tem CNPJ, o que bloqueia hoje o BNDES Periferias Verdes
> (exige organização sem fins lucrativos formalizada) e pode complicar a adoção
> formal do espaço via SMP, que analisa propostas em 30 dias mas formaliza com a
> entidade proponente.*

> *Nenhum dos caminhos de financiamento mapeados está aberto agora… o momento
> certo para adiantar a formalização e o pedido de adoção do espaço na SMP, que
> tem prazo de análise de 30 dias e ainda não foi iniciado.*

Two rules came with it, both about the distance between knowing and promising:
the pass may state what a funder requires and how long a body takes, and may not
say the project will receive or be approved; and a published deadline is the
**body's** deadline, never a commitment to this organisation.

⚠️ **And the cap was already too tight.** The first live run returned
`reason: timeout`. Measured twice, 26.8 s and 29.3 s, against a 25 s default —
so the advisor was being cut off before it finished and the session carried on
with no drafts, no chosen questions and no observations, saying nothing.
**That is the third cap in this repo to have quietly disabled the pass behind
it** (the concept note author at 30 s, the synergy report at 45 s). Now 90 s,
and nothing waits on it: the cap bounds a hang, not a wait.

Gap ratchet: 13 → 10 → 7 → 6 → 5 → **4**.

## What this becomes

The workshops ahead ask more of this, not less. An organisation that has told us
where the water goes, shown us the ground, and sent the proposal it already wrote
should get back a reading it could not have assembled — what its neighbours are
about to ask the same secretariat for, what the evidence base says its solution
does at its scale, what the ficha says will fail in year two. Every one of those
is a source it already gave us, joined to one it never had.

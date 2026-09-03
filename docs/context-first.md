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

## What this becomes

The workshops ahead ask more of this, not less. An organisation that has told us
where the water goes, shown us the ground, and sent the proposal it already wrote
should get back a reading it could not have assembled — what its neighbours are
about to ask the same secretariat for, what the evidence base says its solution
does at its scale, what the ficha says will fail in year two. Every one of those
is a source it already gave us, joined to one it never had.

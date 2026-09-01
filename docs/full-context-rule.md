# The full-context rule

**From Encontro 3 onwards, every step reads everything the organisation has
shared. So does the synergy report. This is not a feature of one beat; it is the
default, and a step that does not do it is a bug.**

Written down because it was violated three times in a row by people (me)
who each thought they were building the sensible thing.

## Why it needs saying

By W3 an organisation has spent two workshops telling us about itself. It has
named the place, corrected our risk figures, described in its own words what
happens when it rains, photographed the yard, and in some cases uploaded a
proposal it already wrote. Every one of those was asked for. Every one of them
cost the organisation something to give.

The failure mode is never a decision to ignore it. It is that each new step gets
built against the two or three fields it obviously needs, and the rest of the
record is simply not thought about. Three examples, all real:

- The **W3 shortlist** read five fields. The photographs, the corrections, the
  uploaded proposal and six other artefacts were sitting in the same state
  object.
- The **advisor** — the thing whose entire job is reading their material — fired
  at the footprint map, several beats *after* the choice it was meant to inform.
- The **synergy report** first sent one summary line per organisation, and none
  of the sentences they wrote. The hand-written report it replaces quotes those
  sentences throughout, because that is where the signal is.

Each was locally reasonable. Together they meant the platform asked for far more
than it used.

## What "full context" means concretely

Anything the organisation gave, plus what we derived from it and told them we
had:

| | |
|---|---|
| **Their words** | `site_story`, `justification_why_here`, `baseline_condition`, and any free text — verbatim, not summarised |
| **Their photographs** | passed to the model, not counted. `sitePhotosForRanking` exists |
| **Their documents** | full text, Teia Sprint proposals included |
| **Their corrections** | `_hazard_check_json`. ⚠️ W2 tells them their word counts for more than our number. A later step that ignores it makes that a lie |
| **Their choices** | `nbs_interest`, `role_preference`, `site_worry` — and see the alignment rule below |
| **What we told them** | the depth read, the W2 recommendation actually served, the bairro figures shown on their site card |
| **Who they are** | the E1 profile: founded, team, funding history, prior collaboration |

`buildContextMarkdown()` assembles most of this already. It was written for
"an agent given the folder as context" and spent months being used only as a
coordinator download.

## Three rules that come with it

**1 · Read before the decision, not after.** Context that arrives after the beat
it should inform is worse than useless: it costs a model call and changes
nothing. If a step needs a reading pass, start it early enough to land.

**2 · Their choices lead.** Full context does not license overriding what an
organisation decided. See `mergeShortlist` — the agent may reorder inside their
picks and append below them with the tension named, and may never promote its
own reading above a choice they made. A platform that quietly reorders a
deliberate decision because a photo suggested otherwise has taken that decision
while appearing to offer one.

**3 · Reading is not deciding.** The model reads, selects and observes; pure
functions decide and compute. Everything the reading produces is a proposal the
organisation confirms, or a note for the coordination.

## And the provider

Structured calls go through `server/services/structuredModel.ts`, which uses
**Anthropic when `ANTHROPIC_API_KEY` is set** and OpenAI only when that is the
only key present.

The conversational agent runs on Anthropic; every structured call went through
the OpenAI client because that is where `createStructuredResponse` happened to
live — a pattern the first analytical feature set and the two after it inherited
without anyone choosing it.

⚠️ **It was not broken.** An earlier version of this note said the deployment
had no OpenAI key and that the reading passes were silently falling back to
deterministic in production. That was wrong. Replit sets
`AI_INTEGRATIONS_OPENAI_BASE_URL` to its own gateway
(`http://localhost:1106/modelfarm/openai`) with a dummy key, and
`openaiClient.ts` passes both through — so the OpenAI path resolves to the
gateway and works.

Preferring Anthropic is therefore a **choice**, not a repair: the platform talks
to organisations with Anthropic, and the analysis of what they said should run
on the same provider — one bill, one set of model behaviours, and no dependency
on a host-specific gateway for the features that decide what an organisation is
shown. `CBO_STRUCTURED_PROVIDER` forces either one if that trade ever needs
revisiting per environment.

## ⚠️ And the rule that was missing: never ASK what an earlier encontro answered

Reading the record is half of it. The other half is what you do with what you
read — and until September this file said the first without the second, so
Encontro 3 asked *"Antes de qualquer obra: como é o lugar hoje?"* of an
organisation whose Encontro 2 answer was:

> *"no hay árboles… pega el sol directo y hay bastante pavimento… cuando llueve
> se inunda porque no drena el agua y se llena de agua de barro y a los días
> aparecen muchos mosquitos."*

Three weeks earlier, at more length, with photos attached.

**The rule.** An encontro may confirm what an earlier one captured. It may not
ask for it again. Quoting someone's own sentence back and offering to keep,
change or skip it is recognition; asking the same question cold is telling them
nobody read the answer.

**Why it kept happening, stated plainly.** This document already said "read the
whole record", and the bug shipped anyway — twice, by the same author. A
principle with no check is a reminder, and reminders lose to the next feature.
The two places that decide what Encontro 3 asks both had a narrower frame than
the rule:

- drafts could only quote **uploaded files**, because the feature was scoped as
  "read the files they sent" — so an answer typed in the chat could never
  pre-fill the question it answered, however exactly it answered it;
- question selection was told to pick *"pelo que falta para ESTE projeto"* —
  about the question bank, never about the record.

**So the rule now fails a run.** `npm run w3:sweep` carries
`asks-what-w2-answered`: it drives an organisation with a full Encontro 2 record
through every solution and flags any beat that asks for something the record
already holds — unless the same beat quotes it back, which is the distinction
that matters. Removing the fix makes it report 27 violations; restoring it goes
silent. That is the difference between this page and a check.

**When adding a beat to any encontro**, the question to answer first is not
"what do I need to ask" but "what has already been answered, and by whom" —
and if the answer exists, the beat's job is to confirm it and spend the turn on
something the record does not have. `docs/w2-w3-overlap-audit.md` is the
field-by-field comparison for E2↔E3; E1↔E3 has not been done.

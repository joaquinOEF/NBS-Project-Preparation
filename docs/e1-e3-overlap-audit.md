# Encontro 1 ↔ Encontro 3 — what is asked twice, and what is never used

_2026-09-03. The counterpart of [`w2-w3-overlap-audit.md`](w2-w3-overlap-audit.md), which found four questions Encontro 3 asked cold that Encontro 2 had already answered._

## The finding is the inverse

**Encontro 3 asks almost nothing Encontro 1 already answered.** The eight custom
W3 questions were checked one by one against the eighteen fields E1 captures,
and the closest pair is not a duplicate:

| W3 asks | E1 already holds | verdict |
|---|---|---|
| `last_budget_covered` — *"o dinheiro cobria manutenção depois da obra, ou só a obra?"* | `funding_history`, `funded_project_count`, `biggest_project_budget` | **not a duplicate** — E1 records *that* they were funded and how much; this asks what the money covered, which is the question the recurring-money gap turns on |
| `institution_contact` — *"vocês já falam com alguém da direção desse lugar?"* | nothing | new |
| `who_else_uses` | `site_story` (E2, not E1) | already guarded — the beat is skipped when the story names who uses the place |

So the repetition problem this audit was written to look for **is not there.**

## What is there is silence

The document that argues *for* the organisation ignored eleven of the eighteen
facts Encontro 1 spends an hour collecting. Measured, not guessed — every E1
field was seeded with a marker and the fact base searched for it:

| reached the concept note | never left the database |
|---|---|
| `org_name`, `contact_name`, `contact_role`, `team_size`, `year_founded` (as years present), `funding_history` (as a boolean), `biggest_project_budget` | `mission_summary`, `main_activities`, `has_cnpj`, `legal_form`, `paid_vs_volunteer`, `nbs_experience`, `nbs_experience_detail`, `groups_served`, `funded_project_count`, `bairro_of_operation`, `proud_moment` |

⚠️ **`has_cnpj` and `legal_form` are the ones that matter most.** Most editais
open by asking whether the organisation has a CNPJ; it decides eligibility
before anything else on the page is worth reading. A concept note that does not
answer it makes a funder stop and go and ask — and the answer had been sitting
in the record since the first workshop.

`mission_summary` is the next: a sentence the organisation wrote about what it
is for, in a document about what it wants to do, and the document did not quote
it.

## What changed

Section 2 now opens with the legal status, then quotes the mission, then states
what the organisation works on and who it serves, then its prior NBS experience.
An all-volunteer team joins the counterpart contribution — where a funder reads
it as one — but only when the organisation is actually building.

One thing surfaced on the way, and it is the same defect in a new place: the
chip reads *"Sim, temos CNPJ"*, so the first version printed **"CNPJ: Sim, temos
CNPJ"**. A chip is an answer; a document states a fact. It now reads "com CNPJ".
See [`document-register.md`](document-register.md).

## What is still unused, on purpose

`proud_moment` and `funded_project_count` are held back: the first is a story
that belongs in a section this document does not have, and the second says
little that `biggest_project_budget` does not. `bairro_of_operation` is
superseded by the site's own bairro, which is more specific and is what every
figure is computed against.

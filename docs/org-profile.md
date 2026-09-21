# The organisation's profile — "Perfil (PDF)"

Everything an organisation has shared so far, laid out for a person. Asked for
by Vila Flores (Sept 2026): printed for each organisation at the 30 Sept
convening, carried on the technical visits of 30 Sept–1 Oct as the preliminary
diagnosis of each territory, and a basis for the portfolio afterwards.

It is **not** the context bundle (written for a model) and **not** the Resumo
do Projeto (an argument built from Encontro 3). It is the record.

## Where

| | |
|---|---|
| One organisation | the org's drawer on the orchestrator → **Perfil (PDF)** · `GET /api/cohort/:slug/member/:id/profile/print` |
| The whole cohort | **Todos os perfis (PDF)** above the roster · `GET /api/cohort/:slug/profiles` — alphabetical, one organisation per page break |
| Language | the cohort's language; `?lang=pt` / `?lang=en` overrides. Every label and option value comes from the bilingual catalog (`shared/cbo-field-catalog.ts`), so a third language is a catalog column plus the `T` table in `orgProfilePrint.ts` |

Coordinator-only, like every `/api/cohort/*` route. "Imprimir ou salvar em
PDF" on the page is the PDF — the browser's own print, A4.

⚠️ `…/member/:id/profile` (no `/print`) is the drawer's Perfil tab and returns
JSON. The printed page is its own path on purpose.

## What is on it (`shared/org-profile.ts`, pure)

Stage-aware: a section with nothing in it is **absent**, never an empty
heading. The three pills in the masthead say which encontros the page draws on.

- **Quem somos** (Encontro 1) — the mission as the lead, what it does, a facts
  grid (founded, legal form, CNPJ, team, NbS experience, funding), the longer
  answers under their labels.
- **O lugar** (Encontro 2) — a static satellite tile map with the pin
  (`staticMapTiles`: an `<img>` grid, because a JS map may not have drawn when
  the print dialog opens), the place's facts, **their own words as a pull
  quote**, the bairro risk means — labelled as means of the whole bairro, not
  measurements of this place.
- **Fotografias enviadas** — up to four uploaded images with the pre-digested
  observation as caption (`…/documents/:docId/file`; a missing original removes
  its own figure).
- **Soluções testadas no Encontro 3** — solution · their reaction · what blocks
  it · the cost **band** (first sentence only; the caveats live on the
  comparison, which is the document about cost).
- **Leitura técnica da coordenação** — prints on the organisation's copy
  (JVP, 21 Sept).
- **Também registrado** — every public answer the layout does not place,
  under its catalog label, grouped by section. This is what makes the page
  trustworthy: a field added to an encontro next month prints here without
  anybody remembering it.
- **Anotações da visita** — ruled lines; nine when the page has the room, six
  when Encontro 3 already fills the second sheet.
- A stage-aware **Fonte** line and the date.

### What never prints
- the maturity scores and priority flags (coordinator-only);
- the contact's email and phone (the name and role do);
- private `_` fields, machine JSON, and **our own readings stored as fields**
  (`site_knowledge_depth` — it is not something the organisation said).

## Register

`docs/document-register.md` applies: third person, a source line, no design
rationale on the page. Print-first: A4, system fonts, nothing external but the
map tiles and the organisation's own photographs, cards and table rows that
never split across pages, risk bars that survive a greyscale printer (length
and number carry them; colour does not).

## Checks

`e2e/org-profile.spec.ts`: right at each stage (E1 · E1+E2 · E1+E2+E3 · empty);
an unplaced answer still prints and a placed one is not printed twice; contacts,
private flags, JSON and scores never reach the page; **every field the design
places has a real label in both languages** (the failure that shipped
"YEAR FOUNDED" on a Portuguese page in the first render); the page in pt and
en, the batch, the two buttons, and a 401/403 without the coordinator's cookie.

## Not built yet

- The same document on the organisation's own chat (today: coordinator only).
- A project-level profile (`docs/projects.md` has the brief and the note).
- The risk layer drawn on the map (today: the three bairro means as bars).

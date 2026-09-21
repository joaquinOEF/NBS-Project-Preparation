# Test organisations from real records

Testing an encontro realistically means starting where a real organisation
stands when it opens. Encontro 3 reads everything Encontros 1 and 2 collected —
their words, their place, their documents, the transcript — so a test that
starts on sample data tests a different product. (The `[SKIP TO phase:N]`
button still exists for a quick look; its sample pack predates the current
questionnaire and should not be trusted for anything the advisor reads.)

A **snapshot** is one organisation's record as JSON
(`shared/state-snapshot.ts`): every section's fields, the maturity scores, the
flags, the transcript, and the documents **as text** (no originals). Three
things can be done with it, all from the orchestrator, all coordinator-only:

| | Where | What it does |
|---|---|---|
| **Cópia de teste** | the organisation's drawer, beside Export | clones the org in place, **as it stood at the end of Encontro 2**, and opens the share dialog with the copy's own link |
| **Importar org** | beside "Convidar CBO" | creates a new organisation from a pasted/uploaded snapshot — from this environment or another one |
| snapshot download | `GET /api/cohort/:slug/member/:id/snapshot[?asOf=end-of-e2]` | the JSON, to carry somewhere else |

## What "end of Encontro 2" means (`trimToEndOfE2`)

- sections from phase 3 on are emptied (what we build · impact · operations ·
  needs · results);
- Encontro 3's four maturity scores go; E1/E2's stay;
- Encontro 3's private flags on the site section go (`_area_*`,
  `_worry_focus_*`); the footprint (`site_area_m2`) stays — Encontro 2 draws it too;
- the transcript is cut at the line that opened Encontro 3; documents dropped
  from Encontro 3 on are left behind;
- phase = 2 with Encontro 2 marked closed, and phases 1–3 unlocked — so the
  copy sees the same **"Começar Encontro 3"** a real organisation sees on the day.

## Guarantees

- The original is never written to. A copy is a new `cohort_members` row, a
  new `organizations` row, a new `cbo_state`, its own capability link.
- Copies are `excludeFromPortfolio` by default — on the roster, out of the
  synergy analysis (flip it on the card if a copy should count).
- **Import strips contact details** (`stripContacts`) unless told otherwise: a
  copy is for testing a flow, not for reaching a person. A same-cohort clone
  keeps them (same coordinator, same data).
- Originals of documents do not travel; their extracted text and summaries
  do, which is what the advisor and the project context read.

## Production → staging, today

Production and staging are different databases, and that is the point: a copy
on staging cannot affect the live cohort.

Once production runs a build with these routes: open the organisation's
drawer in production → download `…/snapshot?asOf=end-of-e2` → on staging,
**Importar org** → paste.

Before that (production on an older build), the record can be read straight
from the production database (Replit → Database → production → SQL):

```sql
select json_build_object(
  'version', 1,
  'orgName', m.org_name,
  'neighborhood', m.neighborhood,
  'phase', s.phase,
  'language', s.metadata->>'language',
  'sections', (select json_object_agg(sec.key, (
      select json_object_agg(f.key, json_build_object('value', f.value->>'value'))
      from jsonb_each(sec.value->'fields') f where coalesce(f.value->>'value','') <> ''))
    from jsonb_each(s.sections) sec),
  'maturityScores', s.maturity_scores,
  'priorityFlags', s.priority_flags
)
from cohort_members m join cbo_states s on s.id = m.cbo_state_id
where m.org_name ilike '%ksa rosa%';
```

Copy the one JSON cell it returns and paste it into **Importar org**. This
route carries no transcript and no documents (they live in other tables); the
fields, their own words and the place all come through, which is what
Encontro 3's beats read. For the transcript too:

```sql
select json_agg(json_build_object('role', role, 'content', content, 'messageType', message_type, 'timestamp', "timestamp") order by position)
from cbo_messages where cbo_state_id = (select cbo_state_id from cohort_members where org_name ilike '%ksa rosa%');
```

and add it to the pasted JSON as `"messages": [...]` next to `"sections"`.

## Checks

`e2e/test-orgs.spec.ts`: the trim rules; a bare state is accepted; contacts do
not travel; a clone of an organisation that finished Encontro 3 opens on
"Começar Encontro 3" and the door names ITS place; the original is unchanged;
the drawer button ends on the copy's link.

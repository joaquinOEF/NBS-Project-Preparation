# CBO Platform Architecture — org identity, accounts, per-org knowledge base

Status: proposal for review (JVP, June 2026). Companion to
`cbo-session1-hardening.md` (which hardens the *flow*); this doc is about the
*platform underneath it* — who an org is, who can see its data, and where its
shared files and history durably live.

Decisions already taken (this session):
- **Auth = hybrid** — community orgs keep a login-free capability link; coordinators
  (and implementers who want a dashboard) get real accounts.
- **Build the doc first**, then pick the slice to implement.

---

## Why this exists

The hardening work made a single org's Session-1 flow reliable. But the moment you
ask "keep everything an org shares so we can reference it in Session 4," or "let a
coordinator run two cohorts," or even "make sure org A can't read org B's profile,"
you hit the fact that **the platform has no spine.** This doc defines that spine.

---

## The as-is (audited June 2026)

There are **two disconnected worlds** sharing one Postgres DB:

| | City / CityCatalyst world | CBO / cohort world |
|---|---|---|
| Auth | Real — OAuth + DB sessions + `requireAuth` on every route (`server/routes.ts:345`) | **None** — open-by-id |
| Identity | `users` table (OAuth tokens) | No user, no org — just `orgName` strings |
| Isolation | City access checked against the token (`routes.ts:420`) | **None** — any UUID/slug = full access |

Specifics that matter:
- **No `organizations` entity.** An org is a free-text `orgName` duplicated on
  `cbo_states.orgName` and `cohort_members.orgName`, joined by a `cboStateId` that
  the *browser* writes (`cbo-profile.tsx:302`). There is no org id, no ownership.
- **Slug-as-secret.** A member is reached at `/cbo-profile?cbo=<memberSlug>` where
  the slug is derived from the org name (`cohortRoutes.ts:142`) — guessable, no token,
  no expiry. `GET /api/cbo-member/:slug` literally comments "no auth beyond knowing
  the slug." The orchestrator dashboard runs on a hardcoded `default` cohort,
  unauthenticated.
- **Documents are ephemeral and unscoped.** Uploads write to
  `knowledge/runs/cbo-<id>/uploads/` on local Replit disk (`uploadRoutes.ts:7`) —
  lost on container recycle. `cbo_states.uploadedFiles` keeps only `{name, path,
  parsedAt, 280-char summary}`; the full extracted text survives only inside the
  chat log (truncated to 8K), and the original binary is gone on restart.
- **DB is already Replit-managed Postgres** (`pg.Pool`, `DATABASE_URL` injected by
  Replit). So "should we use a Postgres DB" is moot — we have one. The work is
  schema + storage + auth on top of it. (Note: `CLAUDE.md` says "Neon serverless";
  the runtime driver is plain node-postgres against Replit PG.)
- **No object/blob storage** is used anywhere; S3 is read-only for geospatial tiles.

Net: there is nothing durable to hang a per-org knowledge base on, and nothing
stopping one org from reading another's data.

---

## The to-be — three layers

### Layer 1 — Org identity (the spine)

Introduce an **`organizations`** table. Everything hangs off it.

```
organizations
  id            uuid pk
  name          text
  city          text            -- 'porto-alegre' for now
  type          text            -- community | implementer | (future)
  cohort_id     uuid -> cohorts (nullable; an implementer may be cohort-less)
  maturity_tier text            -- emerging | developing | advanced (coordinator-overridable)
  created_at    timestamptz
```

Then add `org_id` FKs to the existing tables and backfill one org per existing
`cbo_states` ↔ `cohort_members` pair:
- `cbo_states.org_id` — the org's working profile (still one continuous profile/row).
- `cohort_members.org_id` — collapses the duplicated `orgName` into a real join.
- `documents.org_id` (new table, Layer 3).

This is what makes "one org → its profile + its cohort membership + its documents +
(later) its accounts" a real, queryable thing instead of a string match. It also
gives the adaptive **maturity tier** a home (it's an org property, not a session one).

### Layer 2 — Auth (hybrid) + isolation

Two principal types, matched to the two audiences:

**A. Community orgs → capability link (no login).** Replace the guessable name-slug
with an **opaque, unguessable capability token** (a random 128-bit id, or a signed
token) that maps to exactly one org and its scope (which profile, which unlocked
phases). The WhatsApp invite carries it: `/cbo-profile?t=<token>`. Properties:
- Unguessable (closes the "anyone can read any org" hole) — the single biggest gap today.
- Login-free — preserves the phone-first, low-literacy flow. The link *is* the credential.
- Revocable / rotatable, optional expiry, and re-issuable by a coordinator if a link leaks.
- Server-side enforced: a new `requireOrgCapability` gate on the **entire**
  `/api/cbo*`, `/api/cbo-member*` surface (which has zero auth today) resolves the
  token → org → scopes every query by `org_id`. This is the CBO-side equivalent of
  the City side's `requireAuth`.

**B. Coordinators / implementers → real accounts (magic-link email).** People who
see *cross-org* data (a cohort roster, multiple projects, the support inbox) need a
real identity. Magic-link (passwordless email) is the least-friction real auth and
fits the audience better than passwords. A coordinator account is scoped to its
cohort(s); the orchestrator dashboard stops running on a hardcoded `default` and
starts running on "the cohorts this account coordinates." The City side already has
OAuth + sessions — coordinator accounts can reuse that session machinery
(`routes.ts:345` pattern) rather than inventing a parallel one.

**Isolation rule (new, enforced everywhere):** every CBO/cohort/document query is
scoped by `org_id` (capability principal) or by cohort ownership (coordinator
principal). No more open-by-id. This is the security fix and the multi-tenancy
foundation in one.

### Layer 3 — Per-org knowledge base (the evidence locker)

Promote uploads from "a side effect of a chat turn" to a durable, org-scoped store.

```
documents
  id              uuid pk
  org_id          uuid -> organizations
  cbo_state_id    uuid -> cbo_states (nullable; which profile it informed)
  filename        text
  mime_type       text
  kind            text            -- pdf | image | audio | docx | xlsx | text
  storage_key     text            -- object-storage key (durable)
  size_bytes      integer
  full_text       text            -- the WHOLE extracted text (not a 280-char teaser)
  summary         text            -- 1-2 line, for list views + prompt injection
  dropped_in_phase integer        -- provenance: where in the journey it arrived
  source          text            -- upload | agent
  created_at      timestamptz
```

- **Durable blobs**: store the original in **Replit Object Storage**
  (`@replit/object-storage`, GCS-backed, native to the deploy — least friction, no
  AWS creds) at an org-scoped key `orgs/<org_id>/documents/<doc_id>-<name>`. (S3 is
  an option if you'd rather keep everything in AWS alongside the geo data, but it
  needs write credentials; Object Storage is the lower-friction default.)
- **Full text, kept**: store the entire extracted text (the unified extractor from
  #223 already produces it — image vision, audio transcription, doc parse) so later
  sessions can reference it verbatim, not the 8K chat-truncated copy.
- **Retrieval the agent can use across sessions**, two layers:
  - Inject a compact "documents on file" list (name · kind · summary) into the agent
    state summary every turn — so it always knows what exists.
  - Add `list_org_documents` + `read_org_document(id)` agent tools (mirroring the
    existing `read_knowledge` tool) so in the funding session it can pull the full
    budget uploaded in Session 1 on demand. Both scoped to the session's org.
  - No vector DB yet — a handful of docs per org doesn't need it; list+read is plenty.
    Add embeddings later if orgs accumulate dozens.
- **Migration**: backfill `documents` from existing `cbo_states.uploadedFiles`
  (text we still have lives in the chat log; new uploads get full text immediately).
  `uploadedFiles` becomes a deprecated mirror, then removed.

Why it matters: this is the org's evidence base across the whole 6-month journey,
feeding the maturity scorecard *and* the eventual bankability/diligence assessment —
the COUGAR "upload current documents about the project" homework literally wants this
to accumulate. It's auditable, durable, and isolated.

---

## How it ties together at full scope

- **Multi-cohort**: coordinator accounts + `cohorts.coordinator → account` replaces
  the `default` singleton, so Vila Flores and the fast-track NbS-expert each run their
  own cohort(s) under their own login.
- **Two cohorts, one funnel** (from the hardening doc): `organizations.type` +
  `maturity_tier` carry the community-vs-implementer and emerging/developing/advanced
  distinctions as data — the same intake, parameterized, now with a real home.
- **Bankability / Tier A**: the per-org `documents` + maturity scorecard *are* the
  Pipeline Diligence inputs; portfolio selection reads across orgs in a cohort
  (coordinator-scoped), exactly the Gate-2 review the fast-track doc describes.
- **Parallels the multi-tenant KB-MCP**: same instinct (per-tenant durable store +
  scoped retrieval) — worth keeping the document schema close so tooling can converge.

---

## Migration path — smallest-first, non-breaking

Each phase ships independently; dual-read during transitions so nothing breaks.

1. **Foundation** — `organizations` table + backfill one org per existing
   cbo_state/member pair + add `org_id` FKs (nullable first, populated, then
   enforced). No behavior change; pure spine. *Unblocks everything below.*
2. **Durable docs + KB** — Replit Object Storage + `documents` table + the
   `list/read_org_document` tools + state-summary injection. Migrate `uploadedFiles`.
   *This is the per-org knowledge base you asked for; it does not require auth to land.*
3. **Capability tokens + isolation** — opaque tokens replace guessable slugs;
   `requireOrgCapability` gate on the CBO/cohort surface; scope every query by org.
   *Closes the data-leak hole.*
4. **Coordinator accounts** — magic-link auth; orchestrator dashboard moves off the
   `default` singleton to per-account cohorts; multi-cohort.

Phases 2 and 3 are independent — KB can land before auth (the audience is a closed
pilot today), or auth first if data isolation is the priority. Foundation (1) comes
first either way.

---

## Open questions for JVP

- **Capability-token delivery & lifecycle** — coordinator generates the link in the
  orchestrator UI (already the invite flow, just swap slug→token); expiry policy;
  what happens when a community member loses the WhatsApp link (coordinator re-issues).
- **Do implementers (Stream B) get accounts or capability links?** They're more
  digitally capable and may want a dashboard — likely accounts, but confirm.
- **Object Storage vs S3** — defaulting to Replit Object Storage for least friction;
  switch to S3 only if you want everything in AWS alongside the geo pipeline.
- **Dev/prod DB split** — Replit usually gives the deployment its own DB; confirm so a
  migration is run against both, and so the pilot's real data isn't on the dev DB.

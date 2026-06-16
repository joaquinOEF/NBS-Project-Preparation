# COUGAR / Vila Flores — Coordinator Runbook

How to provision a coordinator, set up a cohort, invite community orgs (CBOs),
re-issue links, and clean up. For the platform at `https://nbs-project-preparation.replit.app`.

> **Roles in one line.** *Coordinators* log in and manage a cohort. *CBOs never
> log in* — their invite link (`?t=<token>`) is their sole credential.

---

## 1. Provision a coordinator

Coordinators are **admin-provisioned** (no self-signup).

### a) In-app admin panel (the normal way) ⭐
Once you have **one admin coordinator** (use the bootstrap endpoint below for the
very first one), everything else is in-app. Log in as the admin → `/orchestrator`:

- **"New cohort"** (header button) → one form: **cohort name, coordinator name,
  login email, password, language**. Submitting creates the coordinator **and**
  their cohort, linked, and switches the board to it. Hand the coordinator their
  email + password — they log in scoped to that cohort.
- **Cohort switcher** (top-left dropdown): every cohort with its coordinator and
  member count. Click to load any of them. Scoped coordinators only ever see
  their own.

No shell, no cohort UUID. The admin stays logged in as themselves throughout.

### b) Bootstrap endpoint (first admin / prod without shell access)
A secret-gated endpoint creates + (optionally) scopes a coordinator. Set
`BOOTSTRAP_COORDINATOR_SECRET` in **both** the Replit Workspace and Deployment
secrets, republish, then:

```bash
# scripts/bootstrap-coordinator.sh wraps this:
curl -sS -X POST "$BASE/api/coordinator/bootstrap" \
  -H "x-bootstrap-secret: $BOOTSTRAP_COORDINATOR_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"email":"coord@org.org","password":"<strong>","name":"Coord","cohortId":null}'
```

- `cohortId: null` → an **admin** (can create/delete cohorts, sees the default).
- `cohortId: "<id>"` → a **scoped** coordinator (only their cohort).
- Idempotent. Unset the secret again after provisioning if you like.

> **DEV vs PROD.** Replit's shell `DATABASE_URL` points at the **dev** DB; the
> deployment has its own. The bootstrap call hits whichever URL you point at —
> use the **prod** URL to create a prod coordinator.

### c) Shell script (local / dev fallback)
```bash
npx tsx scripts/create-coordinator.ts <email> <password> "<Name>" [cohortId]
```
The 4th arg is the **cohort UUID** (not a slug); omit it for an admin. Prefer the
in-app panel (a) for everyday work.

Log in at **`/coordinator-login`** → lands on **`/orchestrator`**.

---

## 2. Create / configure a cohort

- A **default cohort** ("Vila Flores") exists out of the box; an admin sees it
  automatically on `/orchestrator` (created on first load).
- **More cohorts:** use **"New cohort"** (§1a) to add a coordinator + cohort, then
  hop between them with the cohort switcher. Each scoped coordinator manages only
  their own.
- **Language:** set the cohort's forced UI language with the **Auto / PT / EN**
  toggle in the cohort header. PT/EN *overrides* each org's phone language
  (Auto = let the phone decide).
- **Workshops:** the cadence rail shows the 6 workshops as collapsible rows.
  Schedule a date, and click **Open for cohort** on the next-up workshop to
  unlock that phase for every org.

---

## 3. Invite CBOs

- **Invite** (single or bulk) from the orchestrator → each org gets an
  unguessable link **`/cbo-profile?t=<token>`** and a ready-to-send WhatsApp
  message (the preview shows it).
- Each invite carries its **own token**. Opening a new invite on a phone that
  already used another invite starts a **fresh** session (sessions are scoped
  per token) — it won't resume the previous org's conversation.
- **Re-issue a link:** re-open the share dialog for that org and copy the link
  again (same token), or reset/re-invite for a brand-new token.

---

## 4. Clean up

| Action | What it does | Where |
|---|---|---|
| **Reset cohort** | Removes every invited CBO + clears workshop progress. The cohort row **stays** (same singleton, fresh state). | Header → **Reset** |
| **Delete cohort** *(admin)* | Removes the cohort **and** its members entirely. The default cohort is re-created empty on next load. | Header → **Delete cohort** |
| **Namespaced test data** | The e2e harness namespaces its data (`e2e-*` cohorts, `*@e2e.test` coordinators) and purges it via `POST /__test/cleanup` (gated by `ENABLE_TEST_ROUTES`). | test only |

> **Never** set `ENABLE_TEST_ROUTES` / `CBO_FAKE_MODEL` / `TEST_API_SECRET` on
> the prod Deployment.

---

## 5. After a deploy

The Repl serves the compiled `build/` — **rebuild + republish** after merging
anything that changes app behavior (skills, server, client). Skill changes
(`knowledge/_skills/encontro-*.md`) only reach prod after a republish.

# The data term — accepted in the platform

Decided 23 Oct 2026 (Vila Flores, JVP). The Rede organisations do not sign the
Portuguese *Termo de Dados e Privacidade da Plataforma*; they accept it in
COUGAR. Organisations have no accounts — they open their own link — so the
acceptance is a typed name and role, the Section 10 checkbox and "Aceitar".
The term's own Section 10 defines exactly that, and what the platform keeps.

## What happens

- **The gate** (`DataTermGate`): the next time an organisation opens its link,
  and on the first visit for a new one, the page shows the whole term (16px,
  one column, phone first), then *Seu nome completo*, *Sua função na
  organização*, the checkbox *"Li e concordo com o Termo de Dados e Privacidade
  da Plataforma"* and **Aceitar** (disabled until all three). Nothing else on
  the page is reachable until then. It comes before the welcome.
- **Once per organisation, per version.** The person accepts on the
  organisation's behalf (Section 10), so later visitors from the same link see
  nothing. A new version shows the gate to everyone again.
- **Same gate for everyone.** A coordinator opening an org's link sees it too;
  if they accept, the record is marked `sessao_coordenacao = sim`.
- **No way out but the term itself** (decision G2) — and no offline acceptance
  recorded by the coordination yet (G4).

## The record

`data_term_acceptances` (⚠️ new table — `npm run db:push` before deploy).
Append-only, one row per click: member, cohort, org (name copied at the time),
name, role, term version, SHA-256 of the exact text shown, time, IP (first
`x-forwarded-for` hop), browser, coordinator session.

- **Board:** "Termo ✓" / "Termo pendente" on each card; the drawer shows
  *Termo v1.0 aceito em … por Nome (função)*.
- **Export:** Ferramentas avançadas → **Aceites do termo (CSV)** — one row per
  organisation on the board, pending ones included, times in Brasília time.
  **histórico** (`?all=1`) is every acceptance with the evidence columns.

## Staying readable

- `/termo-de-dados` — public, the current version, earlier ones below.
- "Seus dados são seus" (`CboDataNoticeDialog`) is the short version: it now
  matches the term (Bankers without Boundaries, 31 Dec 2026, Vila Flores for
  corrections) and links the full term with the org's acceptance line.

## Changing the term

The text lives in `shared/data-term.ts`. **Never edit a published version** —
the stored hash would stop matching what was shown. Add a new version at the
top of `DATA_TERM_VERSIONS`, re-read the short dialog against it, and every
organisation is asked again. Portuguese only. No contact details (public repo).

## Tests

`e2e/data-term.spec.ts`. The suite runs with `CBO_DATA_TERM_GATE=off` so the
~100 specs that open the org page aren't stopped; the term's spec turns the
gate back on per member (`/__test/data-term/require/:memberId`). A deployment
ignores the flag.

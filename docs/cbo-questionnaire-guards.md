# CBO questionnaire guards — the deterministic net under the encontro skills

The encontro skills (`knowledge/_skills/encontro-N.md`) are prose the model
follows — and prose rules leak, especially on the light (haiku) turns that
answer chip taps. Every guard below exists because a rule leaked **live**.
This doc is the inventory, and — because Encontros 2–6 will hit the same
failure classes — the recipe for extending each guard beyond E1.

The principle: **the skill teaches, the server enforces.** Any behavior that
would embarrass the platform when the model ignores it needs a code chokepoint,
not another ALL-CAPS prompt line. The fake model (`fakeCboModel.ts`) mirrors
every guard through the same shared helpers, so each one is e2e-testable
without a live model.

## Guard inventory

| Guard | Where | Live incident it answers |
|---|---|---|
| Enum canonicalization (any label/alias/id → canonical label) | `shared/cbo-field-catalog.ts` → `update_section` | Machine ids stored raw, English labels in a PT doc (2026-07-07) |
| Off-list doc values rejected (exact match, fuzzy only for docs) | same | Crawler stored "categories related to ours but not exactly them" (2026-07-08) |
| Conditional option rules (`optionRules`, by stable option id) | `shared/cbo-questionnaire.ts` → ask_user filter + update_section | CNPJ-less org offered "ONG" (2026-07) |
| Required-to-close (`requiredToClose`, `requiresPath`) | same → score_maturity close gate | E1 closed without the project-status triage |
| Crawl-trust staging (doc free-text staged until user confirms; `confirm_doc_fields` refuses until the user has replied) | `cboAgent.ts` + `staged_doc_fields` column | Doc extractions silently overwrote profile fields (2026-07-13) |
| **Re-ask guard** (chip question whose labels resolve to already-answered enum field(s) is dropped; `allowReask: true` = deliberate change flow) | `enumFieldsMatchingOptions` in the catalog → ask_user (real + fake) | "How is your team structured?" asked twice in a row (Perfect Demo, 2026-07-14) |
| Single-option ask_user → prose conversion | `cboAgent.ts` ask_user | One-chip "lists" forcing tap-then-type (2026-07) |
| Per-turn near-duplicate chat-text guard (normalized prefix match, 40-char floor) | `cboAgent.ts` pushEvent wrapper | Model re-emitted its question in the final round (2026-07-13) |
| Silent-turn fallback (turn may not end without a user prompt) | `cboAgent.ts` | Users stranded on a blank screen |

## What's generic vs E1-only today

Generic already (nothing to do per encontro): staging/confirm, single-option
conversion, duplicate chat-text guard, silent-turn fallback.

E1-only today, because they read `ORG_PROFILE_ENUMS` / `QUESTIONNAIRES` and
both currently only describe `org_profile`:

- canonicalization + off-list rejection
- conditional option rules + required-to-close
- **the re-ask guard**

## Recipe — giving Encontro N the same net

When an encontro starts capturing structured fields (E2 site fields, E3
intervention fields…), do these in order:

1. **Catalog the enums.** Add the section's closed-list fields to the field
   catalog with stable ids + pt/en labels + aliases (today that means either a
   new `SECTION_ENUMS[sectionId]` map generalizing `ORG_PROFILE_ENUMS`, or a
   sibling per-section catalog — prefer generalizing so `matchOption`,
   `canonicalizeOrgProfileValue` and `enumFieldsMatchingOptions` become
   section-aware instead of forked). Every downstream guard keys off this.
2. **Declare the manifest.** Add a `QUESTIONNAIRES` entry for the section:
   `optionRules` for any option list that depends on an earlier answer,
   `requiredToClose` for what must exist before the encontro's closing scores,
   `requiresPath` where relevant. Rules use option **ids**, never labels. The
   three chokepoints (ask_user filter, update_section reject, close gate) pick
   the manifest up with no new code.
3. **Point the re-ask guard at the section.** `enumFieldsMatchingOptions` +
   the "every candidate field already filled" check in ask_user must read the
   new section's fields (today they read `sections.org_profile` — generalize
   the lookup to iterate the sections that have catalogs).
4. **Skill prose stays.** Keep the "never re-ask, check CURRENT STATE"
   paragraph in the encontro skill (E1 + E2 both carry it) — the guard is the
   net, not the flow. Mention `allowReask: true` as the user-requested-change
   escape hatch.
5. **Fake model = free.** If steps 1–3 live in shared helpers, the fake model
   mirrors automatically. Verify its `ask_user` / `update_section` ops route
   through the same functions.
6. **One spec per guard.** Copy the shape of `e2e/cbo-reask-guard.spec.ts` /
   `e2e/cougar-e1-conditional-org-type.spec.ts`: script the misbehaving turn,
   assert the guard ate it, assert the legit path still works.

## Design constraints worth keeping

- **Stable option ids in rules, labels only at the edges.** Copy edits and
  language switching must never break a rule.
- **Ambiguity is resolved toward showing the question.** Generic chip sets
  ("Sim" / "Ainda não") match several fields; the re-ask guard only blocks
  when *every* candidate field is answered. False negatives (a duplicate slips
  through) are recoverable; false positives (a needed question suppressed) are
  not.
- **Guards teach, not just block.** Every rejection returns a tool message
  naming the field, the stored value, and what to do instead — the model's
  next round should succeed, invisibly to the user.

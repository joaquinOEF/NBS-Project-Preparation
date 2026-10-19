# The pre-portfolio on real records — what broke, and what is still open

Found 17 Oct 2026 by copying the production cohort "Rede SCbN POA" (13
organisations) to staging and to a local database (`shared/cohort-bundle.ts`),
walking every organisation through what it was missing with the simulator
(`server/services/e3Simulator.ts`: Encontro 3, then Encontro 4, played by a
model from each organisation's own record), and pressing **Gerar** on the
pre-portfolio with the real model.

**The constraint that decides every fix below:** real organisations will not
walk Encontros 1–3 again. Whatever shape their record was written in is the
shape the pre-note and the pre-portfolio must read. Fixes are read-time
adapters, never "ask them again", and never a rewrite of their records.

## Fixed

| # | What | Who it hit | Fix |
|---|------|-----------|-----|
| 1 | Encontro 4, "Mais ou menos quantas cisternas?" → **"Não sei ainda"** was read as a size, answered "Não consegui ler um tamanho", and asked again — forever. The chip never reached its own handler. | Ksa Rosa (4 times, then out of turns). Anyone counted in units who does not know the count. | `cboE4Checkpoint.ts`: the size reader skips the chip. Test: `e4-encontro.spec.ts` "Não sei ainda leaves the count question". |
| 2 | A solution **typed** at "Qual vira a pré-nota?" went to the model (only "Outra solução" opened the name reader). The model chose nothing; the question returned — 47 turns, ~15 s each. | Conceito Arte. Anyone who types instead of tapping. | Typed text at the pick is read for catalogue names (`solutionsNamedIn`); one name picks it, several ask "Qual delas?". |
| 3 | **First-era Encontro 3 records** wrote solution names into `solution_types`, which nothing read: Encontro 4 said "nenhuma solução foi testada", the pre-note had no solution, the organisation was missing from the pre-portfolio. | **Conceito Arte** — 20 documents, a SINAPI budget of R$ 31.273. | `shared/recorded-solutions.ts` → `testsOf()`: tests, else `chosen_solutions`, else the names in `solution_types`. Used by Encontro 4 and the pre-note. |
| 4 | `encontroClosed(state, 4)` fell back to "every phase-4 section has a field" — an older record read as **Encontro 4 closed before it opened**. Drives the next-encontro gate, the cohort doctor and the organisation's own banner. | Sementes da Vida Nova and Conceito Arte "closed" E4 in one turn. | `shared/cbo-schema.ts`: Encontro 4 closes on its own marker only (`_e4_closed`, not reopened). |
| 5 | **Gerar** reported done when the group narratives finished; the plan readings ran beside them uncounted, so three organisations showed "0 conexões com planos" for ~20 s more. | Periferia Feminista, Cooperativa Habitacional, Sementes da Vida Nova. | `cohortRoutes.ts` `runPasses`: the readings count in the progress, and "running" ends when the last one lands. |

## Fixed by the journey card (`client/src/core/components/orchestrator/JourneyCard.tsx`)

- **A verdict before Encontro 3.** Misturaí (still in Encontro 2) shows
  *precisa de autorização*; Instituto de Estudos Culturais (Encontro 2) shows
  **pronto pra orçar**. The verdict is computed from Encontro 2's tenure.
- **"0/27 · Inicial"** on 9 of 13 organisations — maturity not scored yet,
  read as a failing grade.
- **"FASE 3A — O QUE CONSTRUÍMOS"** — an old section name; the calendar says
  *Encontro 3*.
- **"Intervenção ainda não escolhida"** on organisations that tested 3–5
  solutions (it reads `snapshotIntervention`, which nothing writes since the loop).

All four are gone from the face of the card: the verdict is computed only once
Encontro 3 closes (`w3SignalFrom`), maturity shows only when scored, the dots say
*Encontro N*, and "Testou:" lists what they tried with each reaction.

## Open — needs a decision or a closer look

- **"Evapotranspiração"** was named by Conceito Arte and is not in the
  catalogue — dropped silently by the reader. Either a catalogue entry or a
  note on the pre-note saying it was named.
- **Four organisations are still in Encontro 2** (Misturaí, CEA Bom Jesus,
  SDV Reciclando — Centro SAMA, Instituto de Estudos Culturais). They cannot
  reach the pre-portfolio until they mark their place and test. A coordination
  decision, not a code one: the simulator deliberately does not invent a site.
- **Vila Flores is out of the analysis** in production (`excludeFromPortfolio`)
  — by design, and carried to the copy.

## How to repeat this

1. Prod → *Ferramentas avançadas → Exportar coorte* (or `GET /api/cohort/:slug/export`).
2. Staging, as admin → *Importar org* with the file (or `POST /api/cohort/import`).
3. *Simular até o Encontro 4* — about 2½ minutes for nine organisations.
4. *Projetos → Gerar pré-portfólio*, and read the server log for
   `silent_turn_fallback`, `[pass-timeout]`, `[answer-unhandled]`,
   `prenote-author … nada escrito`.

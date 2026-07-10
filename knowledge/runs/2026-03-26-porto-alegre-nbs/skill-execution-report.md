# /concept-note Skill Execution Report

> **Run**: 2026-03-26-porto-alegre-nbs
> **City**: Porto Alegre, RS, Brazil
> **Arguments**: `/concept-note porto-alegre`
> **Duration**: Single session (~30 min user interaction)

---

## Purpose

This document captures the full execution of the `/concept-note` skill for review and improvement. It covers: what the skill did, what it asked, what the user answered, what it produced, and where friction or gaps appeared.

## Skill Definition

The skill lives at: **Skill invoked via `/concept-note` slash command** (defined in project prompt configuration).

It follows a 10-phase flow to generate a BPJP/C40-format "Nota Conceitual de Projeto" for NBS projects, grounded in a curated knowledge base under `knowledge/`.

---

## Phase 0: Setup

### What happened
1. Read the concept note template (`knowledge/_templates/concept-note-template.md`)
2. City was pre-specified via argument (`porto-alegre`), so city selection was skipped
3. Read ALL 7 files in `knowledge/porto-alegre/`:
   - `city-profile.md`, `climate-risks.md`, `existing-plans.md`, `stakeholders.md`, `local-precedents.md`, `baseline-data.md`, `regulatory-context.md`
4. Read ALL intervention, co-benefit, financing, evidence, success-case, and inclusive-action files (19 files total via parallel reads + subagent)
5. Created run folder: `knowledge/runs/2026-03-26-porto-alegre-nbs/`
6. Saved initial context to `interview-responses.md`

### Observations
- **Heavy upfront loading**: All 26+ knowledge files were read before asking the first question. This consumed significant context window but ensured all auto-fill was grounded.
- **Subagent used**: An Explore subagent was dispatched to read 19 files in parallel. It returned summaries of only 5 of 19 files — the remaining 14 had to be read directly in the main context. This was inefficient.
- **No user interaction in Phase 0** — pure setup.

### Potential improvements
- Stream knowledge loading across phases (only load what's needed per phase)
- Better subagent prompt to ensure ALL files are fully summarized
- Show a progress indicator to the user during loading

---

## Phase 1: Project Identification (Template §1-2)

### Questions asked (1 AskUserQuestion call with 3 questions)

**Q1: Sector** (single-select, 4 options)
- Options: NBS (recommended context noted), Infraestrutura urbana resiliente, Resíduos, Mobilidade
- **Answer**: Soluções Baseadas na Natureza (NBS)
- Notes: The "recommended" framing was implicit in the description, not in the label

**Q2: Adaptation/Mitigation** (single-select, 3 options)
- Options: Adaptação (Recommended), Ambos, Mitigação
- **Answer**: Ambos (adaptation + mitigation)
- Notes: "(Recommended)" was in the label for Adaptação

**Q3: Proponent** (single-select, 3 options)
- Options: Prefeitura de Porto Alegre, Governo do Estado do RS, Consórcio Intermunicipal
- **Answer**: Prefeitura de Porto Alegre

### Then a 2nd AskUserQuestion call (1 question)

**Q4: Project name** (single-select, 4 options)
- Options: POA Resiliente Verde, Regenera POA, POA Natureza Urbana, Guaíba Vivo
- **Answer**: POA Resiliente Verde

### Auto-filled from knowledge
- Municipality: Porto Alegre (from city-profile.md)
- State: Rio Grande do Sul (from city-profile.md)

### Observations
- Q1-Q3 were batched in one AskUserQuestion (good — reduces round-trips)
- Q4 (project name) was a separate call because it depended on Q1 answers (sector context for name suggestions)
- All questions had clear descriptions grounding options in city data
- **No "Other" custom input was needed** — all options were accepted as-is

### Potential improvements
- Could batch Q4 with Q1-Q3 since name suggestions don't truly depend on sector (they could all be pre-generated)
- The proponent question could auto-fill as Prefeitura and only ask if ambiguous

---

## Phase 2: Context & Diagnosis (Template §3-5)

### Pre-question context presented
The skill presented a summary of climate vulnerabilities from the knowledge base (2024 floods, heat island, landslide risks, baseline emissions). This gave the user context before asking questions.

### Questions asked (1 AskUserQuestion call with 2 questions)

**Q5: Territorial scope** (single-select, 4 options)
- Options: Arroio Dilúvio corridor, Humaitá-Navegantes + Centro, Multi-zone portfolio, Guaíba islands + delta
- **Answer**: Multi-zone portfolio
- Notes: Each option had specific neighborhood/zone context from knowledge files

**Q6: Problem diagnosis** (single-select, 3 options)
- Options: Approve as drafted, Refine — add specifics, Explore risk scenarios
- Auto-drafted diagnosis was embedded in the "Approve" option description
- **Answer**: Approve as drafted

### Then a 2nd AskUserQuestion call (2 questions)

**Q7: Strategic objective** (single-select, 3 options)
- Options: Resilience + sequestration (Recommended), Ecosystem restoration, Flood risk primary
- **Answer**: Resilience + sequestration (Recommended)
- Notes: Full Portuguese objective text was in the descriptions

**Q8: Expected results** (single-select, 3 options)
- Options: Approve results package, Adjust — more conservative, Adjust — more ambitious
- Auto-calculated results (R1-R5 with KPI ranges) embedded in "Approve" description
- **Answer**: Approve results package

### Auto-filled from knowledge
- Territorial context narrative (from city-profile.md, climate-risks.md)
- Problem diagnosis (from climate-risks.md, baseline-data.md)
- Expected results with KPI ranges (from intervention files)

### Observations
- **Auto-fill-then-validate pattern worked well** — user approved both the diagnosis and results without modification
- The "Explore risk scenarios" option was offered but not selected — it's unclear what would have happened if chosen (no branching logic defined)
- Two AskUserQuestion calls where one might have sufficed (Q5-Q8 could potentially batch)

### Potential improvements
- Batch all 4 questions (Q5-Q8) in a single AskUserQuestion call (max 4 questions)
- The auto-drafted diagnosis was crammed into an option description — hard to read. Consider presenting the draft as text BEFORE the question, then asking just "Approve / Refine / Explore"
- Define what "Explore risk scenarios" actually does if selected

---

## Phase 3: Solution Design (Template §6-8)

### Questions asked (1 AskUserQuestion call with 2 questions)

**Q9: Interventions** (MULTI-SELECT, 4 options)
- Options: Green corridors + riparian, Flood parks + bioswales, Urban forests + tree canopy, Wetland restoration
- Each option had cost ranges and KPIs from intervention files
- **Answer**: All four selected

**Q10: Scale** (single-select, 3 options)
- Options: Medium (100-300 ha, R$50-150M), Large (300-1000 ha, R$150-400M), Small pilot (30-100 ha, R$15-50M)
- Comparable projects referenced for each
- **Answer**: Large (300-1000 ha, R$150-400M)

### Then a 2nd AskUserQuestion call (2 questions)

**Q11: Maturity stage** (single-select, 4 options)
- Options: Ideação, Estudo, Análise de viabilidade, Projeto básico
- **Answer**: Estudo

**Q12: Prior history** (single-select, 3 options)
- Options: Confirm known precedents, Add more context, Minimal prior work
- Known precedents listed in description (Regenera Dilúvio, WB P178072, Dutch assessment, etc.)
- **Answer**: Confirm known precedents

### Auto-filled from knowledge
- Intervention descriptions, costs, KPIs (from _interventions/*.md)
- Comparable project scales (from _evidence/funded-projects-brazil.md)
- Prior history items (from local-precedents.md)

### Observations
- Q9 was correctly multi-select — the only multi-select question in the entire flow
- User selected ALL four interventions, which maximizes scope but also complexity
- The skill did NOT ask follow-up questions about specific intervention sizing per zone — it auto-calculated later in Phase 6
- Prior history validation was a good "confirm what I know" pattern

### Potential improvements
- When all interventions are selected, could ask a follow-up about priority/phasing
- Could present a zone-to-intervention mapping for the user to validate

---

## Phase 4: Benefits (Template §9-11)

### Pre-question context presented
Auto-calculated benefit table with 8 rows (CO₂, flood, stormwater, temperature, heat mortality, green jobs, property values, water quality), each with estimate range, source method, and confidence level.

### Questions asked (1 AskUserQuestion call with 2 questions)

**Q13: Benefits validation** (single-select, 3 options)
- Options: Approve estimates, More conservative, Adjust specific items
- **Answer**: Approve estimates

**Q14: Vulnerable communities** (single-select, 4 options)
- Options: Flood-displaced communities, Hillside informal settlements, Both + broader groups, Needs assessment first
- **Answer**: Flood-displaced communities

### Auto-filled from knowledge
- All 8 benefit estimates (from _co-benefits/*.md × project scale)
- Vulnerability data (from climate-risks.md — 47% of families earning <2 min wages lost homes)

### Observations
- The benefit table was presented as markdown text BEFORE the question — much better readability than cramming into option descriptions
- User chose "Flood-displaced" over "Both + broader groups" — the concept note still included broader groups in Section 11.4 (the skill auto-expanded). This might be unexpected.
- Confidence levels were shown per estimate — good transparency

### Potential improvements
- If user selects a narrower community focus, the concept note should reflect that choice rather than auto-expanding
- Could ask about participatory processes planned (currently auto-assumed based on OP tradition)

---

## Phase 5: Institutional & Political (Template §12-15)

### Questions asked (1 AskUserQuestion call with 3 questions)

**Q15: Institutional arrangement** (single-select, 3 options)
- Options: SMAMUS-led with DMAE co-execution, DMAE-led, New dedicated PMO
- **Answer**: SMAMUS-led with DMAE co-execution

**Q16: Political support** (single-select, 3 options)
- Options: Strong post-flood momentum, Moderate — competing priorities, I have specific information
- **Answer**: Strong post-flood momentum

**Q17: Plan alignment** (single-select, 2 options)
- Options: Approve full alignment list, Select specific plans
- Full list embedded in "Approve" description
- **Answer**: Approve full alignment list

### Auto-filled from knowledge
- Stakeholder roles (from stakeholders.md)
- Plan alignment (from existing-plans.md)

### Observations
- Good batching — 3 questions in one call
- Q16 "I have specific information" option would have allowed user to add formal instruments — but user didn't need it
- Plan alignment auto-fill was comprehensive (8 plans + 2 multilateral projects)

### Potential improvements
- Explicitly ask about formal political instruments (ofícios, decretos) — this was flagged as a HIGH gap later. The skill should probe harder here.

---

## Phase 6: Costs & Financing (Template §16-18)

### Pre-question context presented
Detailed CAPEX breakdown table showing 6 components with area/scale, unit costs, and subtotals. Mid-range estimate highlighted.

### Questions asked (1 AskUserQuestion call with 2 questions)

**Q18: Cost validation** (single-select, 3 options)
- Options: Approve mid-range (~R$250M), Target higher (~R$350-400M), Target lower (~R$150M)
- **Answer**: Approve mid-range (~R$250M)

**Q19: Budget availability** (single-select, 3 options)
- Options: Yes — limited (10-20%), Yes — moderate (20-40%), Unknown / needs assessment
- **Answer**: Yes — limited (10-20%)

### Auto-filled from knowledge
- Unit costs per intervention (from _interventions/*.md)
- Financing source matching (from _financing-sources/*.md)
- Comparable project budgets (from _evidence/*.md)

### Observations
- Cost table was well-structured with clear assumptions
- Financing source matching was auto-generated — 5 sources identified with terms
- No question about financing preferences or prior credit experience — this became a gap

### Potential improvements
- Ask about CAPAG rating explicitly (it's a blocker — should not be deferred to gap analysis)
- Ask about prior financing experience (section 18.3)
- Present financing structure options (% reimbursable vs grant vs counterpart)

---

## Phase 7: Risks & Replicability (Template §19-20)

### Pre-question context presented
Auto-generated 6-risk matrix table with type and mitigation strategy.

### Questions asked (1 AskUserQuestion call with 2 questions)

**Q20: Risk validation** (single-select, 3 options)
- Options: Approve risk matrix, Add more risks, Simplify to top 3
- **Answer**: Approve risk matrix

**Q21: Land tenure** (single-select, 3 options)
- Options: Mostly public land, Mixed public + private, Needs assessment
- **Answer**: Mostly public land

### Auto-filled from knowledge
- Risk factors (from climate-risks.md, regulatory-context.md, intervention files)
- Mitigation strategies (from local-precedents.md, stakeholders.md)

### Observations
- Risk matrix was auto-generated and accepted without modification — good auto-fill
- Replicability section was NOT asked about — fully auto-generated in the concept note

### Potential improvements
- Could ask about replicability vision (geographic expansion? methodological dissemination?)

---

## Phase 8: Technical Assistance & Contacts (Template §21-22)

### Questions asked (1 AskUserQuestion call with 3 questions)

**Q22: TA needs** (single-select, 3 options)
- Options: Full TA package (Recommended), Technical studies only, Financial structuring priority
- **Answer**: Full TA package

**Q23: Timeline** (single-select, 3 options)
- Options: 3-year prep + 5-year implementation, 2-year fast-track + 4-year, Pilot first then scale
- **Answer**: 3-year preparation + 5-year implementation

**Q24: Focal point** (single-select, 2 options)
- Options: Leave placeholders, Use SMAMUS as institutional contact
- **Answer**: Use SMAMUS as institutional contact

### Observations
- Good batching — 3 questions
- Timeline options were well-differentiated with clear trade-offs
- Focal point question was pragmatic — placeholder vs institutional

---

## Phase 9: Gap Analysis

### What happened
1. Auto-generated gap analysis saved to `gap-analysis.md`
2. Presented gaps as a single AskUserQuestion with 3 options: Generate now with assumptions, Address CAPAG + political support, Review all gaps first
3. User chose "Review all gaps first"
4. Full gap analysis presented as markdown text
5. User said to fill with assumptions
6. 16 assumptions documented in `assumptions.md`

### Observations
- **This was the weakest phase UX-wise.** The flow was:
  1. Generate gap analysis → 2. Ask if they want to review → 3. User says yes → 4. Present as text → 5. User says fill with assumptions
  - This was 3 round-trips for what could have been 1
- User explicitly requested improvement: **"when asking to fill in gaps, use AskUserQuestion by type of gap"** — saved as feedback memory

### Potential improvements (user-requested)
- Present gaps grouped by category using AskUserQuestion:
  - Q1: "Empty/Weak sections" — options per section (fill assumption / I have data / skip)
  - Q2: "Low-confidence data" — options (accept ranges / use conservative / I can provide)
  - Q3: "Funder blockers" — options (fill assumption / I have info on CAPAG / defer)
- This lets user selectively fill gaps rather than all-or-nothing

---

## Phase 10: Output

### What happened
1. Generated full concept note (375 lines) saved to `concept-note.md`
2. Confidence scores per section embedded throughout
3. Assumptions tagged with `[ASSUMPTION]` markers
4. Evidence citations referencing knowledge files
5. Financing sources table populated
6. Success cases table populated
7. Metadata section with source counts, gap counts, assumption counts

### Output files produced

| File | Lines | Description |
|---|---|---|
| `concept-note.md` | ~375 | Full BPJP-format concept note with 22 sections + 2 tables + metadata |
| `interview-responses.md` | ~80 | All Q&A responses by phase |
| `gap-analysis.md` | ~70 | 8 gaps, 6 low-confidence items, 5 missing evidence, 6 funder checks |
| `assumptions.md` | ~60 | 16 validated assumptions |
| `skill-execution-report.md` | This file | Execution report for skill review |

### Observations
- The concept note is comprehensive but LONG — 375 lines is a lot for a concept note
- Portuguese language output (correct per BPJP template)
- Every section has a confidence tag — good transparency
- The financing table and success cases table are well-structured

---

## Overall Metrics

| Metric | Value |
|---|---|
| Total AskUserQuestion calls | 9 |
| Total questions asked | 24 (Q1-Q24) |
| Multi-select questions | 1 (Q9: interventions) |
| Questions where user accepted auto-fill | 7 (Q6, Q8, Q12, Q13, Q17, Q18, Q20) |
| Questions where user chose non-default | 3 (Q2: Ambos vs Adaptação, Q14: flood-displaced vs broader, Q10: Large vs Medium) |
| Knowledge files read | 26+ |
| Auto-filled sections | ~80% of concept note content |
| User-provided unique information | ~20% (sector, scale, institutional preference, community focus) |

---

## Summary of Improvement Opportunities

### High Priority
1. **Phase 9 gap review**: Use AskUserQuestion grouped by gap type (user-requested feedback)
2. **Ask about CAPAG explicitly** in Phase 6 — it's a financing blocker, shouldn't be deferred
3. **Ask about formal political instruments** in Phase 5 — HIGH gap that could have been caught
4. **Reduce round-trips**: Some phases used 2 AskUserQuestion calls where 1 would suffice (Phase 1, Phase 2, Phase 3)

### Medium Priority
5. **Stream knowledge loading**: Don't read all 26 files upfront — load per phase
6. **Present auto-drafted text before questions**, not crammed into option descriptions (Phase 2 diagnosis was hard to read in an option)
7. **Respect user's community scope**: User said "flood-displaced" but concept note auto-expanded to broader groups
8. **Ask about financing structure preferences** in Phase 6
9. **Define branching logic** for options like "Explore risk scenarios" (Phase 2) — what happens if chosen?

### Low Priority
10. **Concept note length**: 375 lines may be too long — consider a "summary vs full" output option
11. **Subagent efficiency**: Explore agent only returned 5/19 file summaries — prompt needs improvement
12. **Progress indicators**: User doesn't see progress during heavy loading phases
13. **Ask about replicability vision** rather than fully auto-generating
14. **Zone-to-intervention mapping**: When all interventions selected, ask user to map them to specific zones

---

## File References

- **Skill definition**: Loaded via `/concept-note` slash command (inline prompt in project configuration)
- **Knowledge base root**: `knowledge/`
- **Template**: `knowledge/_templates/concept-note-template.md`
- **City data**: `knowledge/porto-alegre/` (7 files)
- **Intervention data**: `knowledge/_interventions/` (6 files)
- **Co-benefits data**: `knowledge/_co-benefits/` (6 files)
- **Financing data**: `knowledge/_financing-sources/` (3 files)
- **Evidence data**: `knowledge/_evidence/` (2 files)
- **Success cases**: `knowledge/_success-cases/` (1 file)
- **Inclusive action**: `knowledge/_inclusive-action/` (1 file)
- **Run output**: `knowledge/runs/2026-03-26-porto-alegre-nbs/` (5 files)

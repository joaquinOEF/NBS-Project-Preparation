# NBS Concept Note Knowledge Base

Curated research data used by the `/concept-note` skill to ground concept note generation in evidence, reducing hallucinations and improving funder alignment.

## Folder Structure

```
knowledge/
├── _templates/              # Output templates and city folder scaffolds
│   ├── concept-note-template.md   # BPJP/C40-aligned output template
│   └── city-folder-template/      # Clone for each new city
├── _funders/                # Funder requirements, criteria, scoring
│   ├── gcf.md               # Green Climate Fund
│   ├── world-bank.md        # World Bank
│   └── bilateral/           # BNDES, AFD, KfW, etc.
├── _financing-sources/      # Brazilian financing programs and eligibility
├── _interventions/          # NBS intervention types with evidence, costs, KPIs
├── _co-benefits/            # Quantified co-benefit ranges with sources
├── _evidence/               # Funded project comparables, impact benchmarks
├── _success-cases/          # Brazilian municipal success stories
├── _inclusive-action/       # Participatory processes, vulnerable group frameworks
├── porto-alegre/            # City-specific research (first city)
└── runs/                    # Skill run outputs (one folder per session)
```

## How It Works

The `/concept-note` skill:
1. Reads city-specific data from `{city}/` folders
2. Cross-references `_interventions/`, `_co-benefits/`, `_evidence/` for grounding
3. Matches funder requirements from `_funders/` and `_financing-sources/`
4. Interviews the user only for genuine gaps
5. Outputs a complete concept note to `runs/{date}-{name}/`

## Adding a New City

1. Copy `_templates/city-folder-template/` to `{city-name}/`
2. Fill in the markdown files with city-specific research
3. Run `/concept-note` — it will detect the city folder

## File Conventions

- All files use markdown with YAML frontmatter
- `last_updated` and `source` fields in frontmatter for staleness tracking
- Quantified data includes confidence level and source citation

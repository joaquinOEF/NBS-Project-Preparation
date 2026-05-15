# E3 — Desenhando sua intervenção — Spec

**Status**: draft for review · **Builds on**: `research.md` in this folder · **Date**: 2026-05-15

## In one sentence

In ~50 min, the CBO picks 1-2 NBS interventions, sketches the area on their site, and articulates *why* — generating two more maturity scores (Problem Clarity, Solution Clarity) along the way.

## Flow — 3 beats, paths unified

By E3 both paths converge. Same flow for `has-idea` (validating their plan) and `needs-help` (making first choice).

| Beat | What happens | Time | Microapp |
|---|---|---|---|
| 1. **Escolha** — type selection | Agent invokes `InterventionSelector` pre-filtered by E2's primary_hazard. Multi-select default (1-2 types typical). "I don't know" guides via help mode. | ~20 min | `InterventionSelector` (existing, improved) |
| 2. **Desenho + tamanho** — sketch + size | Agent invokes `SiteSketcher` (extends `MapMicroapp`). Pre-seeded polygon over E2 site pin. User drags corners. After confirm, `InterventionSizingHelper` shows where their size lands on small/medium/large bands. | ~20 min | `SiteSketcher` (new) + `InterventionSizingHelper` (new inline) |
| 3. **Por quê** — justification | `JustificationComposer` inline: 3 short fields capturing "why this fits, what it changes, how you'd build it." | ~10 min | `JustificationComposer` (new inline) |

## Data captured — every field justified

| Field | Type | Why | Skipping cost |
|---|---|---|---|
| `intervention_types[]` | `NbsInterventionTypeId[]` (1-3, multi-select) | The core choice; feeds E4 impact + E5 funding need | Required |
| `intervention_combination_rationale` | string (optional) | If multi-select, why these together | Optional but anchors Solution Clarity scoring |
| `intervention_area_geojson` | GeoJSON Polygon | The drawn area on the site | Required (auto-computed from sketch) |
| `intervention_area_m2` | int | Derived from geojson | Required (auto) |
| `intervention_scale_band` | enum: `small`/`medium`/`large` | Bucket for sizing comms | Auto-derived from area_m2 |
| `justification_why_here` | string (free text, 1-2 sentences) | **Solution Clarity** input — why this type, this site | High |
| `justification_what_changes` | string (free text) | **Problem Clarity** input — what shifts for the community | Medium |
| `construction_model` | multi-chip: `mutirão` / `empreiteira` / `parceria universidade` / `outro` | Implementation logic — feeds E4 ops planning | Medium |
| `secondary_intervention_consideration` | string (optional) | If agent suggested combo and user declined, capture why | Optional |

**Total: 9 fields** (5 substantive + 2 free-text + 1 multi-chip + 1 optional). Mostly auto-computed from sketch + selector; user types 2-3 short paragraphs total.

## Maturity scoring (silent, coordinator-side)

```
PROBLEM_CLARITY (0-3)
  Inputs: E2's hazard_priority_rationale + this encontro's justification_what_changes

  0  No problem articulated
  1  Generic ("enchente é ruim", "tá quente demais")
  2  Local + specific ("alaga na Rua X toda chuva forte, atinge ~12 famílias")
  3  Local + specific + quantification or evidence (photos, frequency data)

SOLUTION_CLARITY (0-3)
  Inputs: intervention_types + intervention_area_m2 + justification_why_here + construction_model

  0  No intervention chosen
  1  Type chosen but no clear logic
  2  Type + clear connection to the problem + a vague plan ("vamos fazer mutirão")
  3  Type + sized + plan with steps + named partners or roles
```

## Microapps & improvements proposed by this research

### IMPROVEMENT · `InterventionSelector` — three changes

1. **Pre-filter by E2's primary_hazard.** The agent invokes the selector with `recommendedTypes` already filtered. Currently the param exists but isn't used in flow; the E3 skill must pass it.
2. **Community tone for card content.** Today the selector reads from `_interventions/*.md` which is funder-grade. New `tone` param: `'community' | 'funder'`. When `community`, fetch from `_interventions/_community/*.md` (new content to author). Default: community.
3. **Verified photos** (blocked on `docs/photo-curation.md` action items). Until photos land, gradient + emoji placeholders.

Effort: ~30 lines of params changes + KB content authoring.

### NEW · `SiteSketcher` (extends `MapMicroapp`)
A new `selectionMode: 'sketch-intervention-area'` on `MapMicroapp`. Reuses the existing custom-draw polygon infrastructure. Differences:

- Pre-seeds a small editable rectangle (50 m × 30 m default) centered on the E2 site pin
- Drag-corner editing (existing draw tools support this)
- Locks the map to the bairro of operation (no panning out)
- Shows the existing E2 site pin as a reference layer (can't move it)
- Auto-computes area in m² and displays at the top of the map ("Sua área: 320 m²")
- "Confirmar" sends the GeoJSON polygon + area to the agent

Effort: ~80 lines added to `MapMicroapp.tsx`.

### NEW · `InterventionSizingHelper` (inline composer)
Renders inline in chat after polygon confirm. Three horizontal bands with the user's polygon area highlighted:

```
PEQUENO          MÉDIO              GRANDE
50-200 m²        200-1,000 m²       1,000+ m²
R$ 10-40k        R$ 40-300k         R$ 300k+
                 ✦ Você está aqui
                  (320 m²)
                  ~R$ 50-110k
                  capta ~2.500 m²
```

The bands + cost ranges + impact estimates come from a new `_sizing/intervention-rules.yaml`. Different bands per intervention type.

Effort: ~60 lines React + the YAML data file.

### NEW · `JustificationComposer` (inline form)
Three labeled free-text fields (1-2 sentences each) + a chip multi-select for construction model. Pattern identical to E2's `CommunityAnchoringComposer`.

Effort: ~50 lines React.

## KB content to author

1. **`knowledge/_interventions/_community/*.md`** — 6 community-friendly companion docs. Tone: less USD/m² tables, more "this is what it looks like + how it changes daily life." Each ~300-500 words. Photos referenced from the verified manifest.

2. **`knowledge/_sizing/intervention-rules.yaml`** — structured sizing bands. Example:

```yaml
bioswales-rain-gardens:
  small:    { min_m2: 50,    max_m2: 200,    cost_brl_per_m2: [120, 280],  impact: "captures ~500 m² of stormwater runoff" }
  medium:   { min_m2: 200,   max_m2: 1000,   cost_brl_per_m2: [100, 220],  impact: "captures ~2,500 m² runoff" }
  large:    { min_m2: 1000,  max_m2: null,   cost_brl_per_m2: [80, 180],   impact: "captures 5,000+ m² runoff" }

urban-forests:
  small:    { min_m2: 50,    max_m2: 500,    cost_brl_per_m2: [80, 200],   impact: "shade for ~20-50 m² ground surface" }
  medium:   { min_m2: 500,   max_m2: 5000,   cost_brl_per_m2: [60, 150],   impact: "1-1.5°C cooling within 50m radius" }
  large:    { min_m2: 5000,  max_m2: null,   cost_brl_per_m2: [50, 120],   impact: "2°C cooling at neighborhood scale" }
# ... 4 more types
```

3. **Verified photos for the 6 intervention types** (blocked on photo curation work).

## Doc panel layout for E3

Adds two cards after E2's layout:

```
┌─ Quem somos ──────────────────────┐  ← E1, ✓
└───────────────────────────────────┘
┌─ Equipe · Histórico · Caminho ────┐  ← E1, ✓
└───────────────────────────────────┘
┌─ Seu território ──────────────────┐  ← E2, ✓
└───────────────────────────────────┘
┌─ Comunidade envolvida ────────────┐  ← E2, ✓
└───────────────────────────────────┘
┌─ Sua intervenção ─────────────────┐  ← NEW (E3)
│ Tipo:         Jardim de chuva     │
│ + opcional:   Floresta urbana     │
│ Área:         ~320 m² (médio)     │
│ Por quê:      "Pra capturar a     │
│               água que alaga      │
│               a rua todo verão"   │
│ Como fazer:   Mutirão comunitário │
│               + parceria UFRGS    │
└───────────────────────────────────┘
```

## Preamble screen

```
ENCONTRO 3 — Desenhando sua intervenção
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Hoje a gente vai:

  · Escolher o tipo de SbN para sua área
  · Desenhar onde vai e quanto vai ocupar
  · Falar do "por quê" — que muda na
    comunidade

Você vai usar:
  · A biblioteca de intervenções
  · O mapa pra desenhar a área

Tempo estimado: 45–60 min · Salva sozinho

                    [ Começar  → ]
```

## What ships when we build E3

**New components**
- `SiteSketcher` (extends `MapMicroapp`)
- `InterventionSizingHelper` (inline)
- `JustificationComposer` (inline)
- `encontro-3-desenhando.md` agent skill

**Modified components**
- `InterventionSelector` — `tone` param + recommended-types passthrough
- `MapMicroapp` — new `'sketch-intervention-area'` selection mode
- `cbo-profile.tsx` — register new agent events (`open_sketch`, `ask_sizing`, `ask_justification`)
- `cbo-schema.ts` — extend `intervention_type` section with the new fields

**KB content**
- `_interventions/_community/*.md` (6 files)
- `_sizing/intervention-rules.yaml`
- Verified photos (blocked on curation)

## Out of scope for E3

- Impact computation in detail → E4
- Operations / financial model → E4
- Funding amount + breakdown → E5
- Permits / regulatory → E5
- Project pitch → E6

## Open decisions before building

1. **Combinable interventions limit** — cap at 2 types or allow 3? Recommended: cap at 2 for the pilot. Easier to scope, easier for CBOs to talk about.
2. **Sketch UX on mobile** — drag-corner editing on a 375px touchscreen is fiddly. Alternative: pre-seed a circle, let the user drag the radius. Simpler but less expressive. Test with Antônia first.
3. **"Help me decide" workflow** — when invoked, should the agent ask 3 short questions (problem / site type / budget hint) then recommend, or just show all 6 with hazard-weighted ordering? Lit suggests guided question is better; existing selector has both.
4. **Construction model chips list** — `mutirão` / `empreiteira` / `parceria universidade` / `outro` covers most cases. Should we add `assistência técnica do estado` or `mão de obra da prefeitura`? Probably yes — flag for review with Vila Flores.

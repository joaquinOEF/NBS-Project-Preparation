# E2 — Seu território · o que é NBS — Spec

**Status**: draft for review · **Builds on**: `research.md` in this folder · **Date**: 2026-05-15

## In one sentence

In ~45 min of platform time, the CBO learns what NBS *is* through Brazilian examples, marks **where** they want to act on their bairro map, and ranks the hazards they care about — generating two coordinator-side maturity scores along the way.

## Path-aware flow

E2 is the first encontro where the two paths diverge meaningfully (re-converge at beat 3).

| Beat | `has-idea` path | `needs-help` path | Time |
|---|---|---|---|
| 1. Educational anchor | NbsShowcaseCard rendered inline at start; CBO can skim while reading agent's opening message | Same showcase, but agent explicitly says *"Vamos olhar exemplos antes de abrir o mapa"* and pauses for the user to tap through | ~5 min |
| 2. Map + site | Agent: *"Conta sobre seu projeto atual"* → upload offer → opens Map (`selectionMode: 'site'`) → CBO drops pin → agent overlays risk for that site | Agent: *"Conta o que você vive nesse bairro"* → opens Map (`selectionMode: 'browse-only'`) with 3 hazard layers → agent narrates the colors → then reopens Map (`selectionMode: 'site'`) → CBO picks site | ~25 min |
| 3. Priority + tenure + anchoring | RiskPriorityChips → land tenure chip → community anchoring composer | Identical | ~10 min |

Both paths end with the same "Próximo encontro" closing pattern from E1.

## Data captured — every field justified

| Field | Type | Why | Skipping cost |
|---|---|---|---|
| `bairro` | string (POA bairro slug) | Geocoding context; agent uses for risk lookup | High — required for risk overlay |
| `site_lat`, `site_lng` | float, float | Specific intervention site | Required |
| `site_geometry` | GeoJSON (point or polygon) | If user drew an area, persist it | Optional — falls back to point |
| `site_area_m2` | int (rough estimate) | Feeds E3 sizing + E4 impact | Medium — auto-computed if polygon drawn |
| `site_name` | string | What they call this place (Pracinha do Bairro, Lote do Lourival, etc.) | Optional but humanizes |
| `current_use` | enum: `paved`/`vegetated`/`mixed`/`abandoned`/`under-construction` | E3 sizing context; E4 baseline | Medium |
| `land_tenure` | enum: `public`/`private`/`mixed`/`informal` | **Site Control** maturity primary input | High |
| `community_anchoring_lead` | string (free text) | Who's anchored | Medium |
| `community_engagement_methods` | multi-chip: `assembleias`/`oficinas`/`mutirões`/`conversas`/`outras` | **Community Anchoring** maturity input | Medium |
| `primary_hazard` | enum: `flood`/`heat`/`landslide` | Drives E3 intervention recommendations | High |
| `secondary_hazard` | enum (same), optional | E3 secondary recommendations | Medium |
| `hazard_priority_rationale` | string (1 sentence, optional) | Qualitative why-it-matters | Optional |
| `nbs_familiarity` | enum: `none`/`some`/`a lot`, inferred | Calibrates agent's depth of explanation in E3 | Optional |

**Total: 13 fields** (12 substantive + 1 inferred). Most are chip-driven or auto-derived from map clicks. Site name + community anchoring lead are the only required free-text fields.

## Maturity scoring (silent, written to `state.maturityScores`)

```
SITE_CONTROL (0-3)
  0  land_tenure unanswered OR no site identified
  1  land_tenure = 'informal' AND no permissions mentioned
  2  land_tenure = 'mixed' OR 'public with informal permission' OR municipal awareness implied
  3  land_tenure = 'private with org ownership' OR formal agreement uploaded as evidence

COMMUNITY_ANCHORING (0-3)
  0  no community_anchoring_lead provided
  1  beneficiaries named but no engagement methods
  2  community_engagement_methods includes ≥1 active method (oficinas / mutirões)
  3  evidence of community governance (assembleias regulares) OR cooperative ownership
```

## Microapps & improvements proposed by this research

### NEW · `NbsShowcaseCard` (inline in chat)
Horizontal scroll of 3 photographed Brazilian NBS cases. Card shape: 220px wide, photo on top, 1-line story below, tap-to-expand for a 4-line detail. Data from `knowledge/_success-cases/_cards.yaml` (new — to be authored).

Default seed (3 cards):
- **Curitiba · Parques do Barigui** · 1996 · enchente · "Parques que viram retenção de água quando chove forte"
- **São Paulo · Parque do Tietê** · 1976 · enchente + biodiversidade · "1.400 hectares de área verde com função ecológica"
- **Porto Alegre · Várzea Lab · Vila Flores** · 2026 · adaptação · "Hortas + jardins de chuva no 4º Distrito pós-enchente"

Agent invokes via new event `show_examples` with `{tag: 'nbs-intro'}`.

**Photo curation** — every showcase photo must be sourced from Wikimedia Commons, a Brazilian prefeitura/government gallery, Agência Brasil, a vetted NGO publication, or directly from a partner org. **No stock photography, no AI-generated images, no unattributed sources.** Sourced URLs + licenses for the 3 seed cards live in [`docs/photo-curation.md`](../../../../docs/photo-curation.md). Cards render as gradient + emoji placeholders until verified-source photos are downloaded and registered in the manifest.

### NEW · `RiskPriorityChips` (inline)
3 drag-rankable chips appearing as a single agent turn. Output: ordered array of `{hazard, rank}`. Drag for desktop; tap-in-order for mobile. The first-ranked chip becomes `primary_hazard`, second is `secondary_hazard`.

Agent invokes via new event `ask_priority_rank` with `{question, items: ['flood','heat','landslide']}`.

### NEW · Inline `CommunityAnchoringComposer` (lightweight structured form)
Three labeled free-text fields (Líderes / Voluntários / Moradores diretamente) + a chip multi-select for engagement methods. ~60 lines of React, rendered as one chat message.

### IMPROVEMENT · `MapMicroapp` simplification modes
Existing component, new params:
- `selectionMode: 'site'` — single-pin or small-polygon draw, no zone stepper
- `selectionMode: 'browse-only'` — read-only, exploration mode
- `hazardFilter: ('flood' | 'heat' | 'landslide')[]` — visible hazard layers
- `showLegendSimple: boolean` — collapsed 3-chip legend instead of 48-layer toolkit
- `centerBairro: string` — opens centered on a named POA bairro polygon

These all default to backwards-compatible behavior. The cboAgent passes them when invoking `open_map` for E2.

### IMPROVEMENT · Persist drafts on map exit
Currently if a CBO opens the map, drops a pin, and switches tabs without confirming, the pin is lost. Persist `openMapParams.draftSelection` to localStorage so resuming the encontro keeps their pin.

## Doc panel layout for E2

Adds two cards to the existing E1 layout:

```
┌─ Quem somos ──────────────────────┐  ← from E1, ✓
└───────────────────────────────────┘
┌─ Equipe ──────────────────────────┐  ← from E1, ✓
└───────────────────────────────────┘
┌─ Histórico ───────────────────────┐  ← from E1, ✓
└───────────────────────────────────┘
┌─ Caminho ─────────────────────────┐  ← from E1, ✓
└───────────────────────────────────┘
┌─ Seu território ──────────────────┐  ← NEW
│ Bairro:       Cascata             │
│ Local:        Pracinha do bairro  │
│ Área:         ~320 m²             │
│ Uso atual:    Misto (pavimentado +│
│               canteiros)          │
│ Domínio:      Público (informal)  │
│ Riscos:       Enchente (1º) ·     │
│               Calor (2º)          │
└───────────────────────────────────┘
┌─ Comunidade envolvida ────────────┐  ← NEW
│ Lideranças:   Sandra, D. Maria    │
│ Voluntários:  8 pessoas           │
│ Forma:        Oficinas · Mutirões │
└───────────────────────────────────┘
```

## Preamble screen (CBO entry)

```
ENCONTRO 2 — Seu território
━━━━━━━━━━━━━━━━━━━━━━━━━━

Hoje a gente vai:

  · Ver exemplos de SbN no Brasil
  · Olhar o mapa do seu bairro
  · Marcar onde você quer atuar
  · Falar dos riscos que mais importam

Você vai usar:
  · Exemplos visuais
  · O mapa do bairro

Tempo estimado: 30–45 min · Salva sozinho

                  [ Começar  → ]
```

## What ships when we build E2

**New components:**
- `NbsShowcaseCard.tsx` (inline chat card) + companion `_cards.yaml` data
- `RiskPriorityChips.tsx` (inline chat composer)
- `CommunityAnchoringComposer.tsx` (inline chat form)
- `encontro-2-seu-territorio.md` agent skill (path-aware)

**Modified components:**
- `MapMicroapp.tsx` — add the new selection modes + simplified legend
- `cbo-profile.tsx` — register the new agent events (`show_examples`, `ask_priority_rank`)
- `cbo-schema.ts` — extend `intervention_site` section with the new fields
- `cboAgent.ts` — load `encontro-2-seu-territorio.md` when phase = 2

**KB content to author:**
- `knowledge/_success-cases/_cards.yaml` (3 seed cards, structured data)
- `knowledge/_glossary/o-que-e-nbs-comunidade.md` (community-friendly NBS explainer, ~250 words PT)
- `knowledge/_interventions/_community/*.md` — community-friendly versions of the 6 intervention docs (deferred to E3)

## Out of scope for E2

- Specific intervention type selection → E3
- Sizing the intervention → E3
- Impact computation → E4
- Operations design → E4
- Funding need / permits → E5

## Open decisions before building

1. **NbsShowcaseCard photos** — do we have rights-cleared photos of the 3 seed cases? If not, ship with placeholder illustrations (emoji + tinted gradient) for v1; swap to photos when sourced.
2. **Drag-to-rank on mobile** — touch drag-and-drop is finicky. Fallback: tap chips in priority order (first tap = 1st, second = 2nd, third = 3rd). Probably better default behavior on mobile regardless.
3. **`browse-only` map mode** — should it have a "I've seen enough, let's pick a spot" CTA at the bottom that transitions to `site` selection mode? Yes — saves the user from waiting for the agent's prompt.

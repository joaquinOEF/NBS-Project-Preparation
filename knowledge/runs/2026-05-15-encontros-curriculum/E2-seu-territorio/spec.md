# E2 — Seu território · o que é NBS — Spec

**Status**: draft for review · **Builds on**: `research.md` in this folder · **Date**: 2026-05-15

## In one sentence

In ~45 min of platform time, the CBO learns what NBS *is* through Brazilian examples, marks **where** they want to act on their bairro map, and ranks the hazards they care about — generating two coordinator-side maturity scores along the way.

## Path-aware flow

E2 is where the two paths diverge most. See [`_paths/two-path-triage.md`](../_paths/two-path-triage.md) for the cross-cutting design — this section spells out the E2-specific implementation.

### `has-idea` flow (~25 min, linear)

| Beat | What happens | Time | Microapp |
|---|---|---|---|
| 1. Educational anchor | NbsShowcaseCard inline, horizontal scroll. CBO can skim or skip. Agent: *"Antes do mapa, dois exemplos rápidos."* | ~3 min | `NbsShowcaseCard` |
| 2. Site selection | Agent: *"Conta sobre seu projeto — onde fica?"* → upload offer → opens Map (`selectionMode: 'site'`) centered on E1 bairro → CBO drops pin or draws polygon → agent overlays risk for that site | ~12 min | `MapMicroapp` |
| 3. Priority + tenure + anchoring | RiskPriorityChips → land tenure chip → `CommunityAnchoringComposer` | ~10 min | inline composers |

### `needs-help` flow (~30-45 min, discovery — may pause and resume)

| Beat | What happens | Time | Microapp |
|---|---|---|---|
| 1. Extended educational anchor | NbsShowcaseCards as the *first action*, not skimmable. Agent: *"Vamos criar repertório antes do mapa."* User taps through 3-5 cards, picks 1-2 that resonate → saved as `inspiration_picks[]` (used by E3 to pre-filter) | ~10 min | `NbsShowcaseCard` (favoriting added) |
| 2a. Hazard browse | Agent: *"Vamos ver onde os perigos estão no seu bairro."* Opens Map (`selectionMode: 'browse-only'`) with 3 hazard layers visible. **No site commitment.** Agent narrates colors. User asks questions. | ~10 min | `MapMicroapp` browse-only |
| 2b. Save-the-spot prompt | Agent: *"Algum lugar te chama atenção?"* → 3 options:<br>· **Já sei onde** → transitions to `selectionMode: 'site'` (joins has-idea Beat 2)<br>· **Quero ver mais** → continues browse (loop back to 2a)<br>· **Quero conversar com a coordenadora** → triggers `RequestSupport` and pauses E2 in state `awaiting-support` | ~5 min | `MapMicroapp` site mode OR `RequestSupport` |
| 3. Priority + tenure + anchoring | Identical to has-idea Beat 3 — runs once a site is selected. If user paused at 2b without site, Beat 3 doesn't run this session. | ~10 min | inline composers |

**Key design choice (needs-help)**: E2 **must allow exit without a site selection**. A `needs-help` CBO can leave the encontro in state `path: 'needs-help' · awaiting-support` after Beat 2b and resume next session with the same accumulated context (inspiration picks, hazard awareness, pending support request).

Both paths end with the same "Próximo encontro" closing pattern from E1, modulo the paused-state branch above.

### Cross-cutting: `RequestSupport` button

Visible in chat header on both paths. More prominent for `needs-help` (header sticky, has a subtle pulse). On tap, opens the form defined in [`_paths/two-path-triage.md`](../_paths/two-path-triage.md). Submission writes `support_requests[]` to `member_state` and notifies the orchestrator dashboard.

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
| `inspiration_picks` | `NbsShowcaseCardId[]` (0-3, needs-help path only) | E3 pre-filters InterventionSelector with these | Optional but accelerates E3 |
| `support_requests` | `SupportRequest[]` | Async coordinator escalation across both paths | Optional |

**Total: 13 fields** (12 substantive + 1 inferred) plus 2 path/support fields. Most are chip-driven or auto-derived from map clicks. Site name + community anchoring lead are the only required free-text fields.

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
Horizontal scroll of 3-5 photographed Brazilian NBS cases. Card shape: 220px wide, photo on top, 1-line story below, tap-to-expand for a 4-line detail. Data from `knowledge/_success-cases/_cards.yaml` (new — to be authored).

**Favorites mode (needs-help path)**: each card has a "Salvar" toggle. The agent's chat message above the cards changes from *"Olha esses exemplos"* (has-idea) to *"Salve os que te chamam atenção — 1 ou 2 que parecem que poderiam funcionar no seu bairro"* (needs-help). Saved cards persist as `inspiration_picks[]` and E3's InterventionSelector pre-filters by them.

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
- `selectionMode: 'browse-only'` — read-only, exploration mode (needs-help Beat 2a). No bottom CTA forcing a selection — only a "voltar ao chat" link.
- `hazardFilter: ('flood' | 'heat' | 'landslide')[]` — visible hazard layers
- `showLegendSimple: boolean` — collapsed 3-chip legend instead of 48-layer toolkit
- `centerBairro: string` — opens centered on a named POA bairro polygon
- `narrationOverlay: string` — agent-supplied caption rendered as a translucent banner over the map ("Os tons mais escuros são onde a água acumula mais"). Needs-help path only.

These all default to backwards-compatible behavior. The cboAgent passes them when invoking `open_map` for E2.

### NEW · `RequestSupport` (cross-cutting, but lives in E2's surface for the first time)
Form + dialog defined in [`_paths/two-path-triage.md`](../_paths/two-path-triage.md). Surfaces as a button in the chat header. On the needs-help path, the agent can also offer it inline at Beat 2b. Both paths can invoke at any time.

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
- `NbsShowcaseCard.tsx` (inline chat card with optional favoriting) + companion `_cards.yaml` data
- `RiskPriorityChips.tsx` (inline chat composer)
- `CommunityAnchoringComposer.tsx` (inline chat form)
- `RequestSupport.tsx` (cross-cutting; header button + dialog form)
- `encontro-2-seu-territorio.md` agent skill (explicit two-path branching)

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

# Risk Catalog Migration Playbook

**Purpose:** the repeatable procedure for moving each climate hazard (flood, heat, landslide)
from the app's locally-computed risk scores to the **validated catalog composites**
(`poa_<hazard>_risk`, an H×E×V geometric mean published in `geospatial-data`).

**Guiding principle — _catalog leads, app shows._** The app no longer computes Hazard,
Exposure, Vulnerability, or composite risk. It **ingests** catalog rasters, **aggregates**
them to zones for display, and **narrates** them. Every app-side risk formula is retired as
each hazard migrates. The only remaining app-side math is spatial aggregation (cell → zone),
which is presentation, not modeling.

**Status (2026-06-08):**
- ✅ **Phase 1 — Flood map layers** (PR #213): flood risk card repointed to catalog
  `poa_flood_risk` (H×E×V), new "Flood Indices" row (hazard / exposure / vulnerability).
- ✅ **Phase 2 — Flood downstream**: ingestion (`scripts/sample-catalog-risk.ts`), rank-based
  zone priority, schemas, spatial-query thresholds, agent/microapp breakdown, hotspots.
  Deferred follow-ups: swap the agent `open_map` flood overlay (`oef_fri_2024` → catalog) and
  the CBO E2 ranking prompt text; i18n component labels.
- 🔜 **Heat & landslide**: drop-in via the §4 checklist once `poa_heat_*` / `poa_landslide_*`
  datasets are published.

### Two findings that shaped the flood implementation (read before migrating heat/landslide)
1. **Coverage is sparse and that's correct.** The catalog hazard (and therefore risk, which
   needs all three components) is masked to fluvial-prone areas — **~14% of cells** for flood
   (covered cells have HAND≈3.4 m vs ≈16.5 m for null cells). We **coalesce null→0** (non-fluvial
   = 0 risk, not missing data) in the grid `*_score`, keeping raw components for tooltips. The
   map's risk *card* still shows only the true ~14% footprint (it renders S3 tiles directly).
   Expect heat/landslide to be similarly masked — landslide already is.
2. **Percentile-rank, not raw magnitude (resolves §5).** Sparse 14% coverage collapses a bairro's
   *mean* flood, and the catalog scale (avg≈0.03) is far below old-scale heat (avg≈0.55), so a raw
   `max()` ranked flood primary in **0/94** zones. We now **percentile-rank each hazard across
   zones** and classify/prioritize on ranks → flood primary in ~31/94, balanced interventions.
   This is the normalization §5 anticipated; it is now implemented (not deferred). Side effect:
   `multi_benefit`/LOW → 0 (every bairro has a relatively-dominant hazard); tune rank `T_ACTIVE`
   to reintroduce a LOW band if desired.

---

## 1. The catalog datasets

Per hazard, the catalog (`Open-Earth-Foundation/geospatial-data`, `catalog/datasets.yaml`)
publishes four `poa_<hazard>_*` datasets. Flood (live today):

| dataset_id | Meaning | Formula / source |
|---|---|---|
| `poa_flood_hazard` | Hazard susceptibility 0–1 | Ensemble: JRC GLOFLO v2.1 + Global Flood DB + WRI Aqueduct + GFPLAIN250m |
| `poa_flood_exposure` | Exposure 0–1 | IBGE population per barrio, min–max normalized |
| `poa_flood_vulnerability` | Vulnerability 0–1 | IBGE poverty + vulnerable-age, geometric mean |
| `poa_flood_risk` | **Risk 0–1 = (H·E·V)^(1/3)** | geometric mean where all three finite |

All: POA, ~250 m, EPSG:3857, S3 `internal_storage`, value tiles **24-bit RGB, scale 10000**
→ `value = (R + 256·G + 65536·B) / 10000`. Heat/landslide will mirror this exactly
(`poa_heat_*`, `poa_landslide_*` under `.../climate_hazards/{heat,landslide}/...`).

> **Why this matters (Mau's audit, `flood-risk-scoring-methodology-audit.md` §2.6):** the old
> `flood_score` was *hazard mislabeled as risk* — no exposure or vulnerability, plus a
> non-portable May-2024 event-depth term and hardcoded POA lake/delta masks. The catalog
> `poa_flood_risk` is the audit's recommended fix: true IPCC-style H×E×V.

---

## 2. Data flow (who reads what)

```
catalog S3 tiles  ──(visual)──►  map raster overlays (site-explorer, microapps)   [DIRECT, via proxy]
  poa_<haz>_*      ──(value)───►  hover value decode                               [DIRECT, via proxy]
       │
       │  INGESTION (offline script — the only place catalog → grid)
       ▼
client/public/sample-data/porto-alegre-grid-250m.json   (cell.metrics.<haz>_score)
       │
       │  AGGREGATION (generate-neighborhood-zones.ts — cell → bairro)
       ▼
client/public/sample-data/porto-alegre-neighborhood-zones.json
   (meanFlood/Heat/Landslide, vulnerabilityFactor, priorityScore, typology, interventionType)
       │
       ├──► server/services/agentService.ts:1058   → concept-note agent context (riskScores)
       ├──► client .../concept-note/MapMicroapp.tsx       → zone polygons + tooltips
       ├──► client .../concept-note/ConceptNoteMap.tsx    → zone polygons + tooltips
       └──► cboAgent open_map(zoneSource:"neighborhood_zones")  → CBO zone selection

scripts/generate-risk-tiles.ts  reads grid cell scores → bakes local PNG hotspot tiles
   client/public/tiles/composite_hotspot/{z}/{x}/{y}.png   (risk_composite_hotspot)
```

### Key consequence — the microapps do **not** read the catalog directly
Both `MapMicroapp.tsx` (`:125-131`) and `ConceptNoteMap.tsx` (`:126`) fetch the **static**
`porto-alegre-neighborhood-zones.json` for the zone polygons and the risk numbers in tooltips.
The server agent context (`agentService.ts:1058`) reads the **same file** off disk. That JSON is
built offline from `grid-250m.json`'s `<haz>_score` fields.

**Therefore the catalog only reaches the agents after two things happen:**
1. **Ingestion + aggregation are re-run** so the JSON carries catalog-sourced numbers.
2. **The `tileLayers` the agents pass to `open_map` are updated** to the catalog layers.
   Today the CBO flow overlays the *old* `oef_fri_2024` (5.5 km FRI), not `poa_flood_risk`
   (`cboAgent.ts:1004,1009`).

The map's **raster tile overlays** are the only part already catalog-connected (any
`tileLayerId` registered in `tileProxyRoutes.ts` is fetched live from S3 via the proxy).

---

## 3. Phase 2 — Flood downstream (do now)

Locked decisions (from the /refine):
- **Flood priority = `poa_flood_risk`** (already H×E×V). **Drop the app's `vulnerabilityFactor`
  for flood** — E and V are already in the score; multiplying again double-counts.
- **Store the full breakdown** `{hazard, exposure, vulnerability, risk}` per cell and per zone.
- **Cross-hazard dominance: surface, don't solve** (see §5).

### 3A. Ingestion replaces computation
- [ ] **New `scripts/sample-catalog-risk.ts`** — sample `poa_flood_{hazard,exposure,vulnerability,risk}`
  value tiles (24-bit, /10000) at each 250 m grid-cell centroid; write
  `flood_hazard / flood_exposure / flood_vulnerability / flood_risk`; set
  `flood_score = flood_risk` (back-compat for any reader still keyed on `flood_score`).
  Parameterize by a hazard list so heat/landslide are one-line additions.
- [ ] **Deprecate the flood path in `scripts/recalc-scores-v3.ts`** — stop computing `flood_score`
  from HAND/FRI/event-depth/POA masks; archive the block. Heat/landslide stay until migrated.
- [ ] **Mark `gridService.computeCompositeScores` (`server/services/gridService.ts:429-448`)
  deprecated** — new-city grids will read the catalog, not the live formula. (Note: that
  formula also has a bug — `flood_score = 0.45·A + … + 0.15·R` with `A` and `R` both
  `river_prox_pct`. Moot once retired.)
- [ ] **Regenerate** `porto-alegre-grid-250m.json`.

### 3B. Zone aggregation + priority (the one remaining app calc)
- [ ] **`scripts/generate-neighborhood-zones.ts`**: aggregate the new cell fields to
  `meanFloodHazard/Exposure/Vulnerability/Risk` per bairro. For flood,
  **`effectiveFlood = meanFloodRisk`** (no `×(1+vulnerabilityFactor)`).
- [ ] Keep `vulnerabilityFactor` only for not-yet-migrated hazards; mark **INTERIM**.
- [ ] Regenerate `porto-alegre-neighborhood-zones.json`.
- See §6 for the exact current vs target formula.

### 3C. Schemas & types
- [ ] `shared/block-schemas.ts:300-303` — add `meanFloodHazard/Exposure/Vulnerability/Risk`
  (keep `meanFlood` = risk for back-compat).
- [ ] `server/services/impactModelService.ts:58` Zone type + `agentService.ts:1142-1146`
  context — carry the component breakdown.

### 3D. Spatial queries (`shared/geospatial-layers.ts` SPATIAL_QUERIES)
- [ ] `sq_parks_flood_250m`, `sq_hospitals_flood_250m`: `rasterLayerId → poa_flood_risk`,
  `valueKey → flood_risk`.
- [ ] **Recalibrate the `0.4` threshold** — an H×E×V geometric mean of three 0–1 layers sits
  *lower* than the old hazard score. Inspect the new distribution and re-pick. (Applies to every
  hardcoded cutoff: spatial queries, `impact-model.tsx:497` tiers, zone opacity.)

### 3E. Concept-note agent + map
- [ ] `conceptNoteAgent.ts:243`, `agentService.ts:1142`, `impactModelService.ts:177/1016/1688`
  — expose `{hazard, exposure, vulnerability, risk}`; update narrative so the agent explains
  priority as catalog H×E×V and can say *why* a zone ranks (e.g. "high exposure, moderate hazard").
- [ ] `MapMicroapp.tsx` / `ConceptNoteMap.tsx:413,731` tooltips — add hazard/exposure/vulnerability
  lines (auto-fed once the JSON + schema carry them).
- [ ] Update agent `open_map` calls to overlay `poa_flood_risk` (and optionally the indices)
  instead of `oef_fri_2024`.

### 3F. CBO flow
- [ ] `cboAgent.ts:310-400` (E2 Beat 3a risk ranking) + `:1004,1009` `open_map` tileLayers +
  `encontroSkills.ts` + `knowledge/_skills/encontro-*.md` — rank on catalog risk; reference the
  H/E/V breakdown; swap `oef_fri_2024` → `poa_flood_risk` in the map calls.

### 3G. Risk Hotspots (`scripts/generate-risk-tiles.ts`)
- [ ] No code change needed for the swap itself — it reads `flood_score` from the grid, which 3A
  now sources from the catalog. **Re-run after 3A** to rebake `composite_hotspot/`.
- [ ] It already **percentile-normalizes each hazard to its top ~25%** (`:241-298`), so each gets
  equal visual weight — a built-in partial answer to "when one risk dominates." **Interim:** the
  hotspot blends catalog-flood + old-heat/landslide until those migrate.
- [ ] The old per-hazard local flood tiles (`client/public/tiles/flood_risk/`,
  `tiles_values/flood_risk/`) are now **dead** (the flood card points at S3). Stop generating them;
  remove the `flood_risk` entry from the `RISK_LAYERS` loop (`:80`). Keep `composite_hotspot`.

### 3H. i18n, docs, validation
- [ ] `en.json` / `pt.json` — add hazard/exposure/vulnerability component labels.
- [ ] Update `docs/flood-risk-scoring-methodology.md`; note the audit §2.6 fix is now implemented.
- [ ] Old `in_flood_2024` F1 validation against `flood_score` is now **stale** — re-point at
  `poa_flood_hazard` or retire the console.

---

## 4. Per-hazard migration checklist (heat & landslide)

Run this verbatim each time a new `poa_<hazard>_*` dataset is published. `<hazard>` ∈
{`heat`, `landslide`}; `<H>` = display name.

**Catalog plumbing**
- [ ] Confirm the 4 datasets resolve: `curl -o /dev/null -w "%{http_code}"` on
  `.../climate_hazards/<hazard>/{risk,hazard,exposure,vulnerability}/{tiles_visual,tiles_values}/13/2930/4813.png`
  → expect 8× `200`.
- [ ] `server/routes/tileProxyRoutes.ts` — add 4 `poa_<hazard>_*` entries (visual-tile S3 URLs).
- [ ] `shared/geospatial-layers.ts` —
  - repoint the `risk_<hazard>_250m` card: `tileLayerId → poa_<hazard>_risk`, name `<H> Risk (H×E×V)`,
    `valueEncoding.scale = 10000`, S3 value-tiles `urlTemplate`;
  - add a `<hazard>_indices` group to `LayerGroup`;
  - add a `<HAZARD>_INDEX_LAYERS` array (hazard/exposure/vulnerability), mirroring `FLOOD_INDEX_LAYERS`.
- [ ] `client/src/core/pages/site-explorer.tsx` — add `<hazard>_indices` to `LayerGroupId`, map the
  new array into `evidenceLayers`, add a `{ id:'<hazard>_indices', label:'<H> Indices' }` row to
  `LAYER_GROUPS`.

**Ingestion + downstream**
- [ ] Add `<hazard>` to the `sample-catalog-risk.ts` hazard list; re-run → grid gets
  `<hazard>_{hazard,exposure,vulnerability,risk}`, `<hazard>_score = <hazard>_risk`.
- [ ] Delete the `<hazard>` block from `recalc-scores-v3.ts`.
- [ ] `generate-neighborhood-zones.ts`: `effective<H> = mean<H>Risk`; **remove `<hazard>` from the
  `vulnerabilityFactor` multiplier path** (now redundant). Regenerate the zones JSON.
- [ ] Re-run `generate-risk-tiles.ts` (hotspot); remove the dead local `<hazard>_risk` tiles.
- [ ] Schemas: add `mean<H>Hazard/Exposure/Vulnerability/Risk` (`block-schemas.ts`, Zone types).
- [ ] Spatial queries for `<hazard>`: repoint `rasterLayerId`/`valueKey`; recalibrate thresholds.
- [ ] Agents/CBO: expose `<hazard>` breakdown; swap any old overlay
  (`oef_hwm_2024` for heat, etc.) → `poa_<hazard>_risk` in `open_map` calls.
- [ ] i18n labels; methodology doc; retire `<hazard>` validation if event-specific.

**Verify**
- [ ] `npm run check` (no new errors in touched files) + `npm run build`.
- [ ] Toggle all four `<hazard>` cards in the map; confirm tiles render + hover decodes 0–1.
- [ ] Open the concept-note + CBO microapp; confirm tooltips show the breakdown and priorities
  reflect the catalog risk.

**When all three hazards are catalog-backed**, do the final cleanup: delete
`recalc-scores-v3.ts` and the `vulnerabilityFactor` path entirely, retire
`gridService.computeCompositeScores`, and revisit §5 normalization for real.

---

## 5. Cross-hazard dominance / normalization (IMPLEMENTED — percentile-rank)

The naive `priorityScore = max(flood, heat, landslide)` over **raw means** is apples-to-oranges:
flood on the catalog H×E×V scale (avg≈0.03, sparse) vs heat on the old hazard scale (avg≈0.55)
ranked flood primary in **0/94** zones.

**Resolution (implemented in `generate-neighborhood-zones.ts`):** percentile-rank each hazard
across all zones (`pctRanker`), then **classify and prioritize on the ranks**, not raw means:
- `floodRank/heatRank/landslideRank` = fraction of zones strictly below this zone's mean (zeros→0).
- `classifyHazards(floodRank, heatRank, landslideRank)` — scale-free, so flood can be primary
  where it's relatively extreme. Flood primary ≈ 31/94.
- Priority: flood = `floodRank`; heat/landslide = `rank × (1+vulnerabilityFactor)` [INTERIM].
- All `{hazard, exposure, vulnerability, risk}` components + the three ranks are stored per zone
  and surfaced in tooltips and agent context.

Ranks are also dilution-robust — flood's sparse 14% coverage collapses its raw mean, but the
relative ordering across bairros survives. Same approach the hotspot layer uses per-hazard (§3G).

**When all three are catalog:** drop the heat/landslide `vulnerabilityFactor` multiplier and
re-rank uniformly. **Side effect today:** `multi_benefit`/LOW → 0 (rank-based, every bairro has a
relatively-dominant hazard); raise the rank `T_ACTIVE` to reintroduce a LOW band if wanted.

---

## 6. Reference — exact zone-priority formula

**Current** (`scripts/generate-neighborhood-zones.ts`):
```
meanFlood/Heat/Landslide = average of cell <haz>_score within the bairro
classifyHazards()        = sort hazards by mean; LOW if top < T_ACTIVE;
                           combo if (top − 2nd) ≤ T_COMBO and 2nd ≥ T_ACTIVE; else single dominant
dominantScore            = primary hazard's mean   (or max if no dominant)
vulnerabilityFactor      = clamp01( 0.50·poverty_rate
                                  + 0.30·(1 − pct_formal_sewage)
                                  + 0.20·(pop_density / maxPopDensity) )
priorityScore            = dominantScore × (1 + vulnerabilityFactor)
interventionType         = typology → sponge_network | cooling_network | slope_stabilization | multi_benefit
```

**Implemented (catalog-led, rank-based — see §5):**
```
mean<H>          = average of cell <haz>_score within the bairro (null→0)
rank<H>          = pctRank(mean<H>) across all zones        (scale-free, dilution-robust)
classifyHazards(rankFlood, rankHeat, rankLandslide) → typology + primary  (T_ACTIVE/T_COMBO on ranks)
effectiveFlood       = floodRank                            (E,V already inside catalog risk)
effectiveHeat/Lndsl  = rank × (1 + vulnerabilityFactor)     [INTERIM until migrated]
priorityScore        = effective value of the primary hazard (or max if none dominant)
interventionType     = typology → sponge_network | cooling_network | slope_stabilization | multi_benefit
```
`interventionType` / typology logic is unchanged in shape — it just consumes ranks now. When
heat/landslide migrate, drop their `vulnerabilityFactor` term so all three are pure ranks.

---

## 7. File index (every touch-point)

| Area | File | Note |
|---|---|---|
| Tile proxy | `server/routes/tileProxyRoutes.ts` | add `poa_<haz>_*` visual entries |
| Layer registry | `shared/geospatial-layers.ts` | risk card + `<haz>_indices` group + `*_INDEX_LAYERS` |
| Map panel | `client/src/core/pages/site-explorer.tsx` | `LayerGroupId`, `evidenceLayers`, `LAYER_GROUPS` |
| Value decode | `client/src/lib/valueTileUtils.ts` | already 24-bit (`decodePixelNumeric:90`) — no change |
| Ingestion | `scripts/sample-catalog-risk.ts` *(new)* | catalog tiles → grid cell fields |
| Retired calc | `scripts/recalc-scores-v3.ts`, `server/services/gridService.ts:429` | deprecate per hazard |
| Zone aggregation | `scripts/generate-neighborhood-zones.ts` | drop vulnFactor for migrated hazards |
| Hotspots | `scripts/generate-risk-tiles.ts` | re-run; drop dead local `<haz>_risk` tiles |
| Sample data | `client/public/sample-data/porto-alegre-grid-250m.json`, `…-neighborhood-zones.json` | regenerate |
| Schemas | `shared/block-schemas.ts:300`, `server/services/impactModelService.ts:58` | add component fields |
| Spatial queries | `shared/geospatial-layers.ts` SPATIAL_QUERIES | repoint + recalibrate thresholds |
| Concept-note agent | `server/services/conceptNoteAgent.ts`, `agentService.ts:1058-1146` | breakdown + `open_map` layers |
| Concept-note map | `client/src/core/components/concept-note/{MapMicroapp,ConceptNoteMap}.tsx` | tooltips |
| CBO | `server/services/cboAgent.ts:310,1004`, `encontroSkills.ts`, `knowledge/_skills/encontro-*.md` | ranking + map layers |
| i18n | `client/src/locales/{en,pt}.json` | component labels |
| Docs/validation | `docs/flood-risk-scoring-methodology.md`, `data-risk-audit.md` | reconcile with audit; F1 stale |

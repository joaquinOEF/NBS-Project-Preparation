# Flood Risk Score Methodology (Porto Alegre)

## 1) Purpose and scope

This document describes how **`flood_risk_score`** is computed for Porto Alegre (POA) in `projects/cougar/floods/flood_risk_score.ipynb`.

The product combines:

- **Hazard (H)** — fluvial flood hazard screening index from `flood_hazard_score_v2.ipynb` (documented in `flood_hazard_score_methodology.md`),
- **Exposure (E)** — neighborhood population from **Censo Demográfico 2022** bairro aggregates,
- **Vulnerability (V)** — neighborhood **age-vulnerability share only** (population under 5 or 60+), from the same 2022 sources.

The implementation follows a simplified risk framing aligned with audit guidance (`NBS-Project-Preparation/docs/flood-risk-scoring-methodology-audit.md`):

```text
R = f(H, E, V)
```

with `f` implemented as a **geometric mean** on a common 0–1 scale.

This is a **screening-level composite index** for prioritization and communication. It is **not** a full IPCC-style risk metric (no explicit coping capacity, no loss modeling, no return-period loss exceedance).

**Design note (vulnerability):** An earlier draft combined poverty (`poverty_percentage`) and age with a geometric mean. The operational workflow uses **age only** because Censo 2022 bairro aggregates do not publish household poverty at neighborhood level (see §3.4).

---

## 2) Conceptual model

| Component | Symbol | Spatial unit | Meaning in this workflow |
|-----------|--------|--------------|-------------------------|
| Hazard | `H` | Raster (~250 m, hazard grid) | Relative fluvial flood susceptibility (ensemble of global hazard products) |
| Exposure | `E` | Neighborhood → rasterized | Relative population presence (proxy for people/assets in harm's way) |
| Vulnerability | `V` | Neighborhood → rasterized | Relative age-related social susceptibility (share of population 0–4 or 60+) |
| Risk | `R` | Raster (hazard grid) | Combined screening score where H, E, and V are all defined |

**Key design choice:** E and V are **administrative neighborhood attributes** (constant within each barrio polygon), while H varies **within** the barrio where the hazard grid has valid pixels. Risk therefore varies spatially mainly through H, with step changes at barrio borders for E and V.

---

## 3) Input datasets

### 3.1 Hazard (upstream product)

| Item | Path / source |
|------|----------------|
| Operational raster | `projects/cougar/floods/data/output/flood_hazard_score_poa.tif` |
| Methodology | `projects/cougar/floods/docs/flood_hazard_score_methodology.md` |
| Notebook | `projects/cougar/floods/flood_hazard_score_v2.ipynb` |

`H` uses the **partial coverage** score (>=3 of 4 predictor layers + at least one fluvial layer), not the strict 4/4 sensitivity raster.

### 3.2 Neighborhood boundaries

| Item | Source |
|------|--------|
| Geometries | `CCRADiscovery/sectors/data/brazil_neighbourhood_geometries.gpkg` |
| Filter | `NM_MUN == 'Porto Alegre'` |
| Join key | `CD_BAIRRO` (IBGE-style neighborhood code, 2022 delineation) |

The municipal boundary layer contains **99** neighborhood polygons. This count reflects IBGE 2022 bairro geometries, not the 2010 census neighborhood list.

### 3.3 Exposure and vulnerability (Censo 2022 CSVs, POA filter)

All operational tables are filtered with `location_name` containing `'Porto Alegre'`. Join key: `location_id` (= `CD_BAIRRO`).

| Dataset | File | Variables used | Role in risk score |
|---------|------|----------------|-------------------|
| Population | `neighbourhood_population_2022.csv` | `total_population` | **E** (exposure) |
| Age structure | `neighbourhood_age_2022.csv` | `vulnerable_percentage` | **V** (vulnerability) |
| Income / poverty | `neighbourhood_income_2022.csv` | — | **Not used** (see §3.4) |

Missing population values are filled with the **POA median** before normalization (implementation choice for complete E coverage when a census row exists but `total_population` is null).

### 3.4 Censo 2022 data pipeline and poverty exclusion

**Source:** IBGE *Agregados por bairros* (Censo Demográfico 2022), downloaded from the IBGE FTP:

- `Agregados_por_bairros_basico_BR` — population (`v0001`), households (`v0007`)
- `Agregados_por_bairros_demografia_BR` — age/sex cross-tabulation for vulnerable-age sums

**Build script:** `CCRADiscovery/sectors/scripts/build_neighbourhood_census_2022.py`  
**Cache:** `CCRADiscovery/sectors/data/cache/censo_2022/`  
**Probe / QA:** `CCRADiscovery/sectors/ibge_analysis.ipynb` §4 (SIDRA 2022 availability) and §5 (regenerate CSVs)

**`vulnerable_percentage` definition** (in `neighbourhood_age_2022.csv`):

```text
vulnerable_population = sum(ages 0–4 and 60+ by sex from demografia table)
vulnerable_percentage = 100 × vulnerable_population / total_population
```

**Why poverty is excluded from V:**

| Issue | Detail |
|-------|--------|
| Censo 2022 bairro aggregates | Publish `total_households` but **not** `poor_households` / `poverty_percentage` at N102 level |
| Legacy Censo 2010 CSVs | Had poverty for older barrios, but **19 neighborhoods** (`4314902080`–`4314902098`) returned NaN totals because those barrios did not exist in the 2010 census |
| Operational choice | Use **age-only V** for consistent POA coverage with 2022 geometries and demographics |

`neighbourhood_income_2022.csv` is generated with `poor_households` and `poverty_percentage` columns reserved as NaN for future use if IBGE publishes compatible tables.

### 3.5 Legacy Censo 2010 files (superseded)

| File | Status |
|------|--------|
| `neighbourhood_population.csv` | Superseded by `_2022` for this workflow |
| `neighbourhood_age.csv` | Superseded by `_2022` for this workflow |
| `neighbourhood_income.csv` | Superseded; was used for poverty in earlier draft of V |

---

## 4) Normalization (neighborhood level)

All normalization is **min–max within the POA neighborhood sample** that has valid input values:

```text
x_norm = (x - min_POA) / (max_POA - min_POA)
```

If `min == max`, the normalized series is set to 0.

### 4.1 Exposure (`exposure_score`)

```text
population_density = total_population / area_km²   (SIRGAS 2000 / UTM 22S polygon area)
exposure_score     = minmax_norm(population_density)
```

**Population density is used instead of total population** to avoid a systematic size bias: larger bairros tend to have more absolute inhabitants simply because they cover more area, not because they are more intensely occupied. Density better reflects the number of people present per unit of hazard area — which is what matters when each 250 m hazard pixel is paired with a bairro exposure value.

Higher score = higher population density relative to other POA neighborhoods.

**Known limitation — area denominator:** The polygon area used in the denominator includes **all land use types**: parks, water bodies, industrial zones, and uninhabited green belts. This can underestimate real residential density in bairros with large non-residential areas (e.g., a bairro containing a major park will appear less dense than its actual residential fabric would suggest).

**Planned improvement:** Replace total polygon area with **built-up or residential footprint area** (e.g., Global Human Settlement Layer, OpenStreetMap building footprints, or IBGE urban area polygons) to obtain a net residential density that excludes non-inhabited land from the denominator. This would provide a more accurate representation of where people actually live within each bairro.

### 4.2 Vulnerability (`vulnerability_score`)

Only the vulnerable-age share enters V. It is min–max normalized within POA; **no geometric mean with poverty**:

```text
vulnerable_percentage_norm = minmax_norm(vulnerable_percentage)

vulnerability_score = vulnerable_percentage_norm
```

Range: [0, 1] when `vulnerable_percentage` is defined.

**Interpretation:** Higher `vulnerability_score` = higher share of very young or elderly residents relative to other POA barrios in the census sample. This is a **single-dimension** social susceptibility proxy, not a composite poverty–age index.

---

## 5) Joining attributes to polygons

1. `location_id` is cast to string in CSVs and matched to `CD_BAIRRO` on neighborhood polygons.
2. Left join: all POA neighborhood polygons + E/V attributes from `neighbourhood_population_2022.csv` and `neighbourhood_age_2022.csv`.
3. **Rasterization subset:** only neighborhoods with **both** `exposure_score` and `vulnerability_score` non-null are used (`neigh_ev`, after `dropna`).

### Coverage (reference run with Censo 2022)

| Count | Description |
|-------|-------------|
| 99 | Neighborhood polygons in IBGE 2022 municipal boundaries |
| 94 | POA rows in `neighbourhood_{population,age}_2022.csv` with complete E and V inputs |
| ~94 | Neighborhoods used for E/V rasterization after `dropna` |

**Improvement vs Censo 2010:** All **19** barrios with codes `4314902080`–`4314902098` now have valid population and age statistics in the 2022 tables (they were NaN in the 2010 CSVs).

**Residual gap:** Up to **5** boundary polygons (e.g. `4314902017`, `4314902020`, `4314902053`, `4314902064`) appear in the 2022 geometry layer but have **no matching row** in the published bairro aggregate CSVs. These barrios are excluded from rasterization and neighborhood risk summaries until census rows exist or an alternative source is adopted.

Barrios without age or population rows are excluded from rasterization and neighborhood risk summaries.

---

## 6) Rasterization of E and V onto the hazard grid

### 6.1 Reference grid

E and V are burned onto the **same grid** as `flood_hazard_score_poa.tif`:

- CRS, transform, width, and height taken from the hazard GeoTIFF,
- ensures pixel-wise alignment for `R = f(H, E, V)`.

### 6.2 Method: polygon burn (`rasterio.features.rasterize`)

- Each neighborhood polygon carries a single `exposure_score` and `vulnerability_score`.
- `all_touched=True`: any grid cell touched by a polygon receives that barrio's value.
- Polygons are sorted by **ascending area** before burning; **larger barrios overwrite smaller** at borders (approximate dominant-barrio rule discussed with stakeholders).

E and V are **constant within** each barrio; they do not vary at sub-neighborhood resolution.

### 6.3 Coverage interaction with H

| Layer | Typical spatial extent on hazard grid |
|-------|--------------------------------------|
| `exposure_grid`, `vulnerability_grid` | All cells overlapping barrio polygons in the raster extent |
| `hazard` (`H`) | Valid only where the partial hazard rule yields a score (often river-corridor focused) |
| `risk_grid` (`R`) | **Intersection:** finite H **and** finite E **and** finite V |

Therefore, **risk pixels are usually a subset of hazard pixels**, not the full municipal land area. This is expected: risk is only computed where the fluvial hazard index is defined.

---

## 7) Risk score formula (grid)

```text
risk = clip( (H * E * V)^(1/3), 0, 1 )
```

Implemented only where `isfinite(H) & isfinite(E) & isfinite(V)`.

The geometric mean:

- keeps H, E, V on comparable 0–1 footing,
- avoids one component dominating by magnitude alone,
- yields 0 if any component is 0.

**Note:** This is an index construction choice, not a calibrated loss or annual damage function.

---

## 8) Neighborhood-level aggregation (reporting)

For each `location_id` with at least one valid risk pixel (using `dom_ids` cell–barrio assignment from the burn step), the notebook computes:

| Metric | Definition |
|--------|------------|
| `risk_mean` | Mean of `risk_grid` over barrio cells |
| `risk_median` | Median of `risk_grid` over barrio cells |
| `risk_p90` | 90th percentile of `risk_grid` over barrio cells |
| `risk_max` | Maximum of `risk_grid` over barrio cells |
| `high_risk_share` | Share of barrio cells with `risk >= 0.45` |
| `n_grid_cells` | Count of valid risk cells assigned to the barrio |

Output table: `data/output/flood_risk_by_neighbourhood.csv`.

**Interpretation:** `risk_mean` is the primary choropleth metric for barrio maps; `risk_p90` / `risk_max` highlight hotspots within the river-adjacent mask; `high_risk_share` supports threshold-based screening narratives.

Barrios with **no** valid hazard pixels in the grid receive **no** row in the aggregation (they are not assigned zero risk by default).

---

## 9) Outputs

| File | Description |
|------|-------------|
| `data/output/flood_risk_score_poa.tif` | `R` on hazard grid |
| `data/output/flood_risk_score_poa.gpkg` | Barrio-level summary (H mean, E, V, R) |

**Shared E/V outputs** (generated once by `shared/compute_ev.ipynb`, not per-hazard):

| File | Description |
|------|-------------|
| `shared/output/poa_ev_normalized.gpkg` | Canonical bairro-level E (density) and V scores |
| `shared/output/poa_exposure_250m.tif` | E rasterized on canonical 250 m grid |
| `shared/output/poa_vulnerability_250m.tif` | V rasterized on canonical 250 m grid |
| `shared/output/exposure/` | COG + XYZ tiles for E |
| `shared/output/vulnerability/` | COG + XYZ tiles for V |

---

## 10) Assumptions

1. **Censo 2022 bairro aggregates** represent the current neighborhood structure for POA and are comparable across barrios after min–max scaling.
2. **Population is an adequate exposure proxy** for screening (no building value, critical infrastructure, or nighttime population).
3. **Vulnerable age share (0–4 and 60+)** is an acceptable single-dimension vulnerability proxy for a first-order index (no poverty, health, housing quality, or social protection depth in the current V).
4. **Geometric mean** is an acceptable combiner for H, E, V on [0, 1] scales.
5. **Hazard score validity** is inherited from the upstream hazard methodology (fluvial ensemble, partial coverage rule).
6. **Neighborhood constant E/V** is acceptable for stakeholder communication when documented; intra-barrio variation in risk comes primarily from H.
7. **Join integrity:** `location_id` in CSVs matches `CD_BAIRRO` in IBGE 2022 neighborhood geometries where census rows exist.
8. **Raster alignment:** hazard grid georeferencing is correct and stable between hazard and risk notebooks.
9. **Median imputation** for missing `total_population` within a census row is acceptable for screening-level E (rare; logged in notebook audit).

---

## 11) Key considerations and limitations

1. **Not full IPCC risk:** no separate adaptive capacity term; vulnerability is a simplified **age-only** social index.
2. **Poverty omitted from V:** household poverty is not available in Censo 2022 bairro aggregates; reintroducing it would require a different IBGE table, SIDRA micro-aggregation, or an external socioeconomic layer — and would reintroduce coverage gaps for newer barrios if 2010 poverty were used.
3. **Area denominator in E:** Population density uses total polygon area, which includes parks, water bodies, and industrial zones. Bairros with large non-residential areas may have underestimated density scores. Planned improvement: use built-up or residential footprint area as denominator.
3. **Hazard limits spatial extent of R:** where `H` is nodata (outside partial hazard mask), `R` is undefined even if E/V exist on land cells.
4. **Fluvial hazard bias:** `H` emphasizes river flood products; pluvial-only or drainage-driven flooding is not explicitly modeled (see hazard methodology §9.6).
5. **Expected mismatch with event footprints:** May 2024 observed inundation can extend beyond fluvial hazard corridors; 100% agreement with event maps is not expected.
6. **Neighborhood data gaps:** barrios in the 99-polygon boundary layer without census rows are dropped from `neigh_ev`; analyzed barrio count (~94) can be lower than municipal polygon count.
7. **Border effects:** polygon burn with area-based overwrite is an approximation of “largest share of cell area,” not a rigorous zonal dominant-fraction rule.
8. **Threshold sensitivity:** `high_risk_share` at 0.45 is arbitrary; reporting should include sensitivity or alternative cutoffs.
9. **Temporal mismatch:** hazard layers mix historical catalogs, RP100 models, and 2024 validation context; E/V from **Censo 2022** may not align in time with a specific flood event or with hazard product vintages.
10. **No uncertainty propagation:** components are point estimates; no confidence bands on `R`.
11. **Transferability:** weights and normalization are POA-specific; other cities require recalibration and new local CSVs (the build script also exports Manaus for reuse).

---

## 12) Relationship to hazard-only validation

Hazard validation (SkySat footprint, EMSN194 depth) is documented in `flood_hazard_score_methodology.md` §10. **Risk validation was not run as a separate exercise** in the current notebook: validating `R` would require independent checks on E and V as well as combined behavior. For screening claims, cite **hazard validation** for `H` and treat `R` as a **transparent combination** with local E/V.

---

## 13) Recommended use

**Appropriate uses:**

- neighborhood and corridor prioritization for further study,
- communicating relative population exposure and age-related vulnerability alongside fluvial hazard,
- internal dashboards (grid + barrio views),
- NBS / adaptation screening when framed as index-based triage.

**Not appropriate alone for:**

- regulatory flood-risk zoning,
- insurance or damage estimation,
- event-specific inundation mapping without additional hydrologic or pluvial analysis,
- claims of validated probabilistic risk without independent calibration,
- socioeconomic prioritization that requires income or poverty — **V does not include those dimensions** in the current version.

---

## 14) Traceability

| Step | Notebook / document |
|------|---------------------|
| Hazard `H` | `flood_hazard_score_v2.ipynb`, `flood_hazard_score_methodology.md` |
| Risk `R`, E, V | `flood_risk_score.ipynb` |
| Audit context | `NBS-Project-Preparation/docs/flood-risk-scoring-methodology-audit.md` |
| Neighborhood geometries | `CCRADiscovery/sectors/data/brazil_neighbourhood_geometries.gpkg` |
| Censo 2022 E/V CSVs | `CCRADiscovery/sectors/data/neighbourhood_{population,age}_2022.csv` |
| Censo 2022 build | `CCRADiscovery/sectors/scripts/build_neighbourhood_census_2022.py` |
| Censo 2022 probe / regen | `CCRADiscovery/sectors/ibge_analysis.ipynb` §4–§5 |
| Legacy Censo 2010 CSVs | `CCRADiscovery/sectors/data/neighbourhood_{income,age,population}.csv` (not used in current V) |

---

## 15) Workflow summary (implementation order)

1. Run `shared/compute_ev.ipynb` *(once, or when CSVs/boundaries change)*:
   - Compute polygon area (km²) from IBGE 2022 boundaries
   - Compute population density = total_population / area_km²
   - Normalize E (density) and V (vulnerable age %) across POA
   - Save `poa_ev_normalized.gpkg`, canonical rasters, and tiles
2. Run `flood_hazard_score_v2.ipynb` → `flood_hazard_score_idw_poa.tif`
3. Run `flood_risk_score.ipynb`:
   - Load E/V from `poa_ev_normalized.gpkg`
   - Rasterize onto flood hazard grid (in memory)
   - Compute `R = (H×E×V)^(1/3)` on valid pixels
   - Save risk raster and bairro GeoPackage
   - Publish COG + tiles for risk score

---

## 16) Planned improvements

| Component | Current approach | Planned improvement |
|-----------|-----------------|---------------------|
| Exposure (E) | Population density using total polygon area | Replace area denominator with built-up / residential footprint (GHSL, OSM buildings, IBGE urban area) to get net residential density |
| Vulnerability (V) | Age-only (0–4 and 60+) | Add socioeconomic dimension when household-level poverty data becomes available at bairro level from IBGE |
| Hazard (H) | Fluvial ensemble (global products) | Incorporate local hydrological modeling and pluvial flood data |

---

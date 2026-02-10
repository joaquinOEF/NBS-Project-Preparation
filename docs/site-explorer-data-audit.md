# Site Explorer Data Audit

## Table of Contents

1. [Overview](#overview)
2. [Sample Data Pipeline — The Reference Implementation](#sample-data-pipeline--the-reference-implementation)
3. [Evidence Layer Data Sources](#evidence-layer-data-sources)
4. [Composite Hazard Scoring](#composite-hazard-scoring)
5. [Intervention Zone Creation](#intervention-zone-creation)
6. [Zone Priority and Classification](#zone-priority-and-classification)
7. [Live Code vs. Sample Pipeline Comparison](#live-code-vs-sample-pipeline-comparison)
8. [Known Risks and Limitations](#known-risks-and-limitations)

---

## Overview

The Site Explorer is the geospatial analysis module of the NBS Project Builder. It overlays multiple environmental data layers on a city map, computes hazard risk scores per grid cell, clusters those cells into intervention zones, and lets users assign Nature-Based Solution (NBS) interventions to each zone. The output feeds into the Impact Model and Business Model modules downstream.

There are two code paths that produce grid data:

| Path | Scripts / Code | Data Sources | Quality |
|------|---------------|--------------|---------|
| **Sample data pipeline** | 3-script offline process (`generate-sample-grid.ts` → `recalc-scores.ts` → `generate-intervention-zones.ts`) | Copernicus DEM + OSM + WorldPop + GHSL | **Most sophisticated** — 20+ metrics, real satellite data, hydrological modeling |
| **Live grid service** | `server/services/gridService.ts` runtime | OSM + Copernicus DEM | Simpler — 11 metrics, no hydrological modeling, no satellite population/buildings |

The sample data for Porto Alegre is generated from **real geospatial data**, not synthetic/fake data. The word "sample" refers to it being a pre-computed demonstration dataset, not to the quality of the data itself.

---

## Sample Data Pipeline — The Reference Implementation

The sample data pipeline is a 3-step offline process that produces the richest, most accurate analysis available in the system. Each script builds on the previous one's output.

### Pipeline Architecture

```
┌─────────────────────────────┐
│  Step 1: generate-sample-grid.ts                │
│  Input:  Pre-fetched evidence layers (elevation, │
│          rivers, landcover, water, forest, pop,  │
│          WorldPop raster, GHSL built-up raster)  │
│  Output: porto-alegre-grid.json                  │
│          (1km² grid with 20+ metrics per cell)   │
└──────────────────┬──────────┘
                   │
┌──────────────────▼──────────┐
│  Step 2: recalc-scores.ts                        │
│  Input:  porto-alegre-grid.json                  │
│  Process: Adds Porto Alegre-specific geographic  │
│           knowledge (Guaíba lake, delta region), │
│           recalculates all composite scores with │
│           improved formulas                      │
│  Output: porto-alegre-grid.json (overwritten)    │
└──────────────────┬──────────┘
                   │
┌──────────────────▼──────────┐
│  Step 3: generate-intervention-zones.ts          │
│  Input:  porto-alegre-grid.json                  │
│  Process: Classifies cells by hazard typology,   │
│           clusters into contiguous zones,        │
│           merges small zones, limits to target   │
│  Output: porto-alegre-zones.json                 │
└─────────────────────────────┘
```

### Step 1: Grid Generation (`scripts/generate-sample-grid.ts`)

Creates a 1km × 1km square grid over Porto Alegre's bounding box (−51.27 to −51.01 E, −30.27 to −29.93 N) and populates every cell with metrics from 8 real data sources.

**Grid construction:**
- Uses `@turf/turf` `squareGrid()` to create cell polygons
- Each cell gets a unique ID (`cell_0`, `cell_1`, ...), centroid coordinates, and 20+ metric slots initialized to `null`

**Data sources loaded:**
The script loads pre-fetched JSON files from `client/public/sample-data/` — these files were originally produced by the live evidence layer services (OSM, Copernicus) and saved locally.

#### Layer 1: Elevation & Hydrological Modeling

**Source**: Copernicus DEM GLO-30 (real 30m satellite elevation data)

Computes per cell:

| Metric | Method | What It Captures |
|--------|--------|-----------------|
| `elevation_mean` | Average of contour line elevations intersecting the cell | Terrain height |
| `elevation_min` | Minimum contour elevation in cell | Lowest point |
| `elevation_max` | Maximum contour elevation in cell | Highest point |
| `slope_mean` | `atan(elevRange / 1000m) × 180/π` — slope in degrees from the elevation range across a 1km cell | Terrain steepness |
| `flow_accum` | Raw flow accumulation value from DEM-derived hydrological grid | Where water concentrates |
| `flow_accum_pct` | Cell's flow accumulation ÷ max flow accumulation across all cells | Relative drainage intensity |
| `is_depression` | Boolean from DEM depression detection grid | Ponding/pooling risk |
| `depression_pct` | 1 if depression, 0 if not | Used in flood scoring |
| `low_lying_pct` | `1 − (rank / totalCells)` — inverse percentile of elevation | Lower cells score higher |

The flow accumulation and depression grids are derived from the Copernicus DEM using hydrological algorithms (D8 flow direction). This is the key differentiator from the live code — it models where water actually *flows* rather than just measuring proximity to mapped rivers.

#### Layer 2: Rivers & Waterways

**Source**: OpenStreetMap Overpass API (real mapped waterways)

| Metric | Method |
|--------|--------|
| `dist_river_m` | `turf.pointToLineDistance(centroid, riverLine, {units: 'meters'})` — minimum distance from cell center to any OSM waterway |
| `river_prox_pct` | `1 − (rank / totalDistances)` — inverse percentile rank of river distance (closer = higher) |

Only LineString geometries are used (filters out riverbanks/polygons). Maximum distance cutoff: 50km.

#### Layer 3: Land Cover Classification

**Source**: OpenStreetMap (real tagged polygons)

Classifies OSM features into 4 categories using tag matching:

| Category | OSM Tags Matched |
|----------|-----------------|
| **Built-up** | `landuse=residential/commercial/industrial/retail`, `building=*`, `highway=*`, `landcover_class=built_up` |
| **Green** | `natural=wood/scrub/grassland`, `landuse=forest/grass`, `leisure=park`, `landcover_class=tree_cover/shrubland/grassland` |
| **Cropland** | `landuse=farmland/orchard/vineyard`, `landcover_class=cropland` |
| **Wetland** | `natural=wetland/marsh`, `landcover_class=wetland` |

Per-cell metrics:
- `imperv_pct`: Set to 0.8 if cell centroid falls inside a built-up polygon
- `green_pct`: Set to 0.7 if inside green area, 0.3 if inside cropland

#### Layer 4: Surface Water Bodies

**Source**: OpenStreetMap (real water body polygons)

| Metric | Method |
|--------|--------|
| `dist_water_m` | Distance from centroid to nearest water body boundary (handles polygon-to-line conversion for both single and multi-polygons). 0 if centroid is inside water. |
| `floodplain_adj_pct` | Inverse percentile rank of water body distance |

#### Layer 5: Forest / Canopy Cover

**Source**: OpenStreetMap (real forest polygons)

| Metric | Method |
|--------|--------|
| `canopy_pct` | 1.0 if centroid inside any forest polygon, 0.0 otherwise |

This is binary (inside forest or not) — not a continuous canopy density measure.

#### Layer 6: Population (OSM Proxy)

**Source**: OpenStreetMap (residential land use)

| Metric | Method |
|--------|--------|
| `built_pct` | Set to 0.7 if centroid falls inside any residential polygon |

#### Layer 7: Population (WorldPop Raster)

**Source**: WorldPop 100m population count raster (real satellite-modeled data)

| Metric | Method |
|--------|--------|
| `pop_density_raw` | Average of all WorldPop raster cells that overlap the 1km grid cell (people per pixel) |
| `pop_density` | `min(1, pop_density_raw / maxPop)` — normalized 0–1 against city maximum |

This is the only place where real satellite-modeled population data is used. The live code does not use WorldPop at all.

#### Layer 8: Building Density (GHSL)

**Source**: GHSL (Global Human Settlement Layer) built-up surface raster (real satellite data)

| Metric | Method |
|--------|--------|
| `building_density` | Average of GHSL raster cells overlapping the grid cell, divided by 100 |
| `imperv_pct` | `max(existing_imperv, building_density)` — GHSL updates imperv_pct if higher than OSM-derived value |

This layer uses actual satellite-derived built-up surface data, unlike the live code which only uses OSM.

#### Coverage Flags

Each cell tracks which data sources successfully contributed data:

```typescript
coverage: {
  elevation: boolean,   // Copernicus DEM contours intersected
  flow: boolean,        // Hydrological grid data available
  landcover: boolean,   // OSM land use features found
  surface_water: boolean, // OSM water bodies found
  rivers: boolean,      // OSM waterways found
  forest: boolean,      // OSM forest features checked
  population: boolean,  // OSM residential or WorldPop data
  buildings: boolean,   // GHSL built-up data available
}
```

### Step 2: Score Recalculation (`scripts/recalc-scores.ts`)

This script takes the raw grid and recalculates all composite scores using **improved formulas** and **Porto Alegre-specific geographic knowledge**.

#### Geographic Knowledge Encoded

Porto Alegre has specific geographic features that affect flood risk:

```typescript
const LAKE_WEST_BOUNDARY = -51.23;  // Guaíba lake western edge
const DELTA_CENTER_LAT = -30.05;    // Delta confluence center
const DELTA_CENTER_LNG = -51.22;
```

Three new location-based flood factors are computed:

| Factor | Formula | What It Models |
|--------|---------|---------------|
| `lakeside_risk` | `max(0, 1 − (lng − LAKE_WEST_BOUNDARY) / 0.10)` | Proximity to Guaíba Lake (1.0 at lake, 0 at ~11km away) |
| `delta_risk` | `max(0, 1 − euclideanDistKm / 20)` | Proximity to the 4-river delta confluence (1.0 at delta, 0 at 20km) |
| `low_elev_risk` | For cells below 40m: `max(0, 1 − (elevation − 20) / 30)` | Low-elevation flood exposure independent of relative ranking |

These are stored as intermediate metrics for debugging and also feed into the flood score.

#### Improved Composite Score Formulas

**Flood Score** (two-component with synergy):

```
physicalFlood = 0.25 × flow_accum_pct
              + 0.20 × depression_pct
              + 0.20 × river_prox_pct
              + 0.15 × low_lying_pct
              + 0.10 × floodplain_adj_pct
              + 0.10 × flatness

locationFlood = 0.40 × lakeside_risk
              + 0.35 × low_elev_risk
              + 0.25 × delta_risk

flood_score   = min(1, max(physicalFlood, locationFlood × 0.8) + physicalFlood × locationFlood × 0.3)
```

The synergy bonus (`physicalFlood × locationFlood × 0.3`) means cells that score high on BOTH physical drainage AND geographic location get boosted beyond either alone. This captures the real-world phenomenon where drainage problems near the lake/delta are far worse than either factor alone.

**Heat Score:**

```
heat_score = 0.40 × building_density
           + 0.30 × pop_density
           + 0.20 × (1 − vegetation_pct)
           + 0.10 × (1 − water_cooling)
```

Where `vegetation_pct = max(canopy_pct, green_pct)` and `water_cooling` is derived from water body distance or river/water proximity percentiles.

**Landslide Score** (slope-gated):

```
slopeRisk = slope ≥ 5° ? min(1, (slope − 3) / 12) : 0

landslide_score = 0.70 × slopeRisk
                + 0.15 × (1 − vegetation_pct) × slopeRisk
                + 0.15 × (1 − low_lying_pct) × slopeRisk
```

The slope-gating means landslide risk is ZERO for flat terrain (slope < 5°), and vegetation and elevation only contribute when there's actual slope. This is a much more realistic model than the live code.

### Step 3: Zone Generation (`scripts/generate-intervention-zones.ts`)

Takes the scored grid and clusters cells into intervention zones. See [Intervention Zone Creation](#intervention-zone-creation) section below for the full algorithm.

---

## Evidence Layer Data Sources

These are the data sources used by **both** the sample pipeline and the live code. The sample pipeline consumes pre-fetched files from these same services.

### 1. City Boundary

| Attribute | Detail |
|-----------|--------|
| **Source** | OpenStreetMap Nominatim / Overpass API |
| **Resolution** | Vector polygons (admin boundary level) |
| **Service** | `server/services/osmService.ts` → `getCityBoundary()` |
| **Caching** | In-memory storage layer |
| **What it provides** | City boundary GeoJSON polygon, centroid coordinates, bounding box |

**Known risks:**
- OSM boundary completeness varies by city; some municipalities have incomplete or disputed admin boundaries.
- The bounding box derived from the boundary is used to scope all subsequent data fetches, so a wrong boundary cascades errors to every layer.

---

### 2. Elevation / Terrain

| Attribute | Detail |
|-----------|--------|
| **Source** | Copernicus DEM GLO-30 (30m resolution Digital Surface Model) |
| **Access** | Public S3 bucket: `copernicus-dem-30m.s3.eu-central-1.amazonaws.com` |
| **Format** | Cloud-Optimized GeoTIFF tiles (1° x 1°) |
| **Service** | `server/services/copernicusService.ts` → `getElevationData()` |
| **Caching** | Local filesystem (`./dem_cache/*.tif`) + storage layer for processed contours |
| **Processing** | Downloads required tiles, resamples to target resolution (default 90m), generates contour lines using marching-squares algorithm |

**What it provides:**
- Elevation grid (width x height array)
- Contour line GeoJSON (auto-interval: 2m–50m depending on terrain range)
- Per-cell metrics: `elevation_mean`, `elevation_min`, `elevation_max`
- **Sample pipeline only**: Also provides flow accumulation grid, depression detection grid, and slope calculations

**Known risks:**
- Copernicus DEM is a Digital Surface Model (DSM), not a Digital Terrain Model (DTM). It includes buildings, trees, and structures. In dense urban areas, "elevation" includes building heights, inflating slope estimates and distorting low-lying detection.
- Missing tiles are marked as `.missing` and skipped silently. Coastal or island cities may have gaps (ocean tiles return 404).
- The resampling grid is capped at 500×500 cells (`Math.min(..., 500)` in code, line 310-311 of `copernicusService.ts`), which reduces effective resolution for large cities.
- Elevation values of exactly 0 are treated as no-data (`if (value !== 0)` check on line 343). This is incorrect for cities genuinely at sea level (e.g., Amsterdam, Venice, New Orleans).
- The no-data sentinel `-9999` from the GeoTIFF is converted to 0 (line 340), which then gets excluded from elevation statistics, meaning voids are silently ignored.
- The contour generation algorithm processes cell-by-cell crossings, producing individual line segments rather than connected contour rings, resulting in visual fragmentation at the rendering stage.

---

### 3. Land Cover

| Attribute | Detail |
|-----------|--------|
| **Declared source** | ESA WorldCover 10m (in schema metadata) |
| **Actual source** | OpenStreetMap Overpass API (`landuse=*`, `natural=*` tags) |
| **Resolution** | OSM feature-level (variable) |
| **Service** | `server/services/worldcoverService.ts` → `getLandcoverDataFromOSM()` |
| **Overpass query** | All `way["landuse"]`, `way["natural"]`, `relation["landuse"]`, `relation["natural"]` within bbox |

**What it provides:**
- Land use polygons classified into: residential, commercial, industrial, forest, grassland, water, wetland, etc.
- Per-cell metrics: `imperv_pct` (impervious surface fraction), `green_pct` (vegetation fraction)

**Known risks:**
- **Source mismatch**: The schema/UI declares the source as "ESA WorldCover 10m" but the actual implementation fetches from OpenStreetMap. OSM land use tagging is crowd-sourced, inconsistent across regions, and often incomplete — especially in developing countries.
- OSM does not distinguish actual impervious surface from zoned land use. A `landuse=residential` area may contain gardens and parks, but is counted as fully impervious.
- Large queries in dense cities can timeout (60s Overpass timeout).
- No temporal dimension — OSM shows current state, not historical trends.

---

### 4. Surface Water Bodies

| Attribute | Detail |
|-----------|--------|
| **Declared source** | JRC Global Surface Water (in schema metadata) |
| **Actual source** | OpenStreetMap Overpass API |
| **Service** | `server/services/surfaceWaterService.ts` → `getSurfaceWaterFromOSM()` |
| **Overpass query** | `natural=water`, `water=*`, `waterway=riverbank` |

**What it provides:**
- Water body polygons (lakes, reservoirs, ponds)
- Classification: permanent, seasonal, ephemeral (based on OSM `intermittent` and `seasonal` tags)
- Per-cell metrics: `dist_water_m` (distance to nearest water body), `floodplain_adj_pct` (proximity percentile)

**Known risks:**
- **Source mismatch**: Declared as JRC Global Surface Water but actually sourced from OSM. JRC provides satellite-derived water occurrence statistics (1984–present); OSM provides manually mapped features. These are fundamentally different datasets.
- OSM water body mapping is incomplete in rural/peri-urban areas.
- Seasonal/intermittent classification depends on OSM contributors adding correct tags, which is rare.
- No historical flooding extent data is used — only static water body positions.

---

### 5. Rivers and Waterways

| Attribute | Detail |
|-----------|--------|
| **Source** | OpenStreetMap Overpass API |
| **Declared source** | "HydroSHEDS / OSM" (in schema metadata) |
| **Service** | `server/services/riversService.ts` → `getRiversFromOSM()` |
| **Overpass query** | `waterway=river`, `stream`, `canal`, `drain`, `ditch` |

**What it provides:**
- River/stream LineString geometries
- Total waterway length (km), major river names
- Per-cell metrics: `dist_river_m` (distance to nearest waterway), `river_prox_pct` (proximity percentile)

**Known risks:**
- **Source mismatch**: Declared as "HydroSHEDS / OSM" but only OSM is used. HydroSHEDS provides hydrologically-conditioned drainage networks; OSM provides mapped waterways. HydroSHEDS would be more scientifically rigorous for flood modeling.
- Distance-to-river is calculated from cell centroid, not cell boundary. A cell touching a river but with centroid 200m away gets a 200m distance reading.
- All waterway types (river, stream, ditch) are treated equally. A major river and a roadside ditch produce the same proximity signal.
- The percentile-based normalization (`river_prox_pct`) is relative to the city — a cell far from rivers in a river-poor city scores the same as a cell far from rivers in a river-rich city.

---

### 6. Forest / Canopy Cover

| Attribute | Detail |
|-----------|--------|
| **Declared source** | Hansen Global Forest (in schema metadata) |
| **Actual source** | OpenStreetMap Overpass API |
| **Service** | `server/services/forestService.ts` → `getForestCanopyFromOSM()` |
| **Overpass query** | `natural=wood`, `landuse=forest`, `natural=tree_row` |

**What it provides:**
- Forest/woodland polygon geometries
- Per-cell metrics: `canopy_pct` (fraction of cell covered by forest features)

**Known risks:**
- **Source mismatch**: Declared as "Hansen Global Forest" (satellite-derived 30m resolution tree cover) but actually uses OSM. Hansen provides pixel-level tree cover percentage derived from Landsat imagery; OSM provides manually-drawn forest boundaries. OSM often misses individual trees, street trees, small green patches, and private gardens.
- `canopy_pct` in the live code is computed as the area fraction of forest polygons overlapping each grid cell (via `turf.intersect` + `turf.area`). In the sample pipeline, it is binary (1.0 if centroid inside forest, 0.0 otherwise). Both approaches only count areas mapped as `natural=wood` or `landuse=forest` in OSM.
- The name "canopy cover" implies a continuous vegetation density measure (as Hansen provides), but this is really an OSM forest-boundary measure — street trees, private gardens, small parks with tree cover, and scattered trees are absent.

---

### 7. Population Density

| Attribute | Detail |
|-----------|--------|
| **Declared source** | WorldPop 100m raster (shown in UI tooltip) |
| **Actual live source** | OpenStreetMap Overpass API (residential proxy) |
| **Sample pipeline source** | OpenStreetMap (Layer 6) + WorldPop raster (Layer 7) + GHSL built-up (Layer 8) |

**Live code provides:**
- Residential area polygons and building footprints
- Estimated population: `(houses × 3) + (apartment buildings × 30)`
- Per-cell metrics: `pop_density` (built-area fraction as proxy), `built_pct`

**Sample pipeline additionally provides:**
- `pop_density_raw` — real satellite-modeled population count from WorldPop 100m raster
- `pop_density` — normalized against city maximum population density
- `building_density` — GHSL satellite-derived built-up surface fraction

**Known risks:**
- **Source mismatch in live code**: UI shows "WorldPop 100m raster" as the source, but live code uses OSM building/residential queries. Only the sample pipeline actually uses WorldPop data.
- The live population estimate formula (`houses × 3 + apartments × 30`) is extremely crude. Actual household sizes, building heights, and occupancy rates vary enormously.
- OSM building coverage varies dramatically by city.

---

## Composite Hazard Scoring

### Sample Pipeline Scores (Reference — Most Accurate)

The sample pipeline's `recalc-scores.ts` computes all three hazard scores using the full set of 20+ metrics, geographic context, and corrected formulas. See [Step 2: Score Recalculation](#step-2-score-recalculation-scriptsrecalc-scorests) above for the complete formulas.

Key design principles in the sample scoring:
- **7-factor flood score** with location-specific knowledge and synergy bonuses
- **4-factor heat score** using satellite building density and water cooling proximity
- **Slope-gated landslide score** that correctly produces zero risk for flat terrain
- **All scores rounded to 2 decimal places** for consistency

### Live Code Scores (Simplified — Has Known Bugs)

The live code in `computeCompositeScores()` (gridService.ts, lines 429–448) uses a simpler set of formulas:

```typescript
const A = m.river_prox_pct ?? 0;     // river proximity percentile
const E = m.low_lying_pct ?? 0;      // low-lying elevation percentile
const I = m.imperv_pct ?? 0;         // impervious surface fraction
const R = m.river_prox_pct ?? 0;     // BUG: duplicate of A (river proximity again)
const C = m.canopy_pct ?? 0;         // forest canopy fraction
const P = m.pop_density ?? 0;        // population density proxy (built area fraction)
const S = 0;                         // slope — HARDCODED TO ZERO
const U = 0;                         // soil instability — HARDCODED TO ZERO

flood_score     = 0.45 × A + 0.20 × E + 0.20 × I + 0.15 × R
heat_score      = 0.45 × I + 0.35 × P + 0.20 × (1 − C)
landslide_score = 0.55 × S + 0.30 × U + 0.15 × (1 − C)
```

Since `A` and `R` are both assigned `m.river_prox_pct`, and `S` and `U` are both 0, the effective formulas simplify to:

```
flood_score     = 0.60 × river_prox_pct + 0.20 × low_lying_pct + 0.20 × imperv_pct
heat_score      = 0.45 × imperv_pct + 0.35 × pop_density + 0.20 × (1 − canopy_pct)
landslide_score = 0.15 × (1 − canopy_pct)
```

### Critical Issues in Live Code Scoring

1. **Flood score double-counts river proximity**: `river_prox_pct` appears in both the A term (weight 0.45) and the R term (weight 0.15), giving it a combined weight of 0.60 out of 1.0. This was likely a copy-paste error (variable `A` and `R` are both assigned `river_prox_pct`).

2. **Landslide score is effectively non-functional**: Both `S` (slope) and `U` (soil instability) are hardcoded to 0, making the formula reduce to `0.15 × (1 − canopy_pct)`. Maximum possible landslide score is 0.15. The score only reflects absence of forest — not actual slope, geology, or soil conditions.

3. **No flow accumulation or depression data**: The live code has no hydrological modeling. It cannot detect where water concentrates or pools.

4. **No geographic context**: The live code applies identical generic formulas regardless of city-specific features (lakes, river deltas, coastal exposure).

5. **All metrics are relative, not absolute**: Percentile-based normalization means scores are relative to the specific city. Cross-city comparison is meaningless.

6. **No climate data**: No precipitation, temperature, or historical event data. Scores are purely based on geographic proxies.

---

## Intervention Zone Creation

### Algorithm (`scripts/generate-intervention-zones.ts`)

The zone generation uses these tuning parameters:

| Parameter | Value | Meaning |
|-----------|-------|---------|
| `T_ACTIVE` | 0.30 | Minimum hazard score threshold — cells below this are classified as LOW risk |
| `T_COMBO` | 0.10 | If gap between top two hazard scores ≤ 0.10, create a combined typology (e.g., FLOOD_HEAT) |
| `MIN_CELLS` | 8 | Minimum contiguous cells required to form a zone (prevents tiny zones) |
| `TARGET_ZONES` | 15 | Maximum number of output zones (controls clustering granularity) |

### Pipeline Steps

**1. Cell Classification** — Each cell is classified based on its hazard scores:

```
Sort hazard scores: [h1, v1], [h2, v2], [h3, v3] (descending)
dominanceGap = v1 − v2

If v1 < T_ACTIVE (0.30):
    typologyLabel = 'LOW'
Else if dominanceGap ≤ T_COMBO (0.10):
    typologyLabel = sorted(h1, h2).join('_')  // e.g., 'FLOOD_HEAT'
    primaryHazard = h1, secondaryHazard = h2
Else:
    typologyLabel = h1  // e.g., 'FLOOD'
    primaryHazard = h1
    if v2 ≥ T_ACTIVE × 0.8:
        secondaryHazard = h2
```

**2. Spatial Clustering** — Flood-fill (BFS) groups adjacent cells with the same typology label into contiguous regions. Uses 8-connected neighbors (including diagonals).

**3. Small Region Merging** — Regions with fewer than `MIN_CELLS` (8) cells are merged into their nearest neighbor based on hazard distance (Euclidean distance in 3D flood-heat-landslide space).

**4. Target Zone Reduction** — If more than `TARGET_ZONES` (15) zones remain, the smallest zone is repeatedly merged with the zone that has the most similar hazard profile until the target count is reached.

**5. Zone Property Computation** — Each final zone gets:

| Property | Computation |
|----------|-------------|
| `zoneId` | `zone_1`, `zone_2`, ... (numbered by descending max risk) |
| `typologyLabel` | Re-classified from zone mean scores using same threshold logic |
| `primaryHazard` / `secondaryHazard` | From zone-level classification |
| `interventionType` | Mapped from typology (see below) |
| `meanFlood/Heat/Landslide` | Arithmetic mean of all cell scores in zone |
| `maxFlood/Heat/Landslide` | Maximum cell scores in zone |
| `populationSum` | Sum of `pop_density_raw` across cells |
| `areaKm2` | Cell count × (cellSize/1000)² |
| `cellCount` | Number of grid cells |

**6. Geometry Construction** — Cell polygons within each zone are merged via iterative `turf.union()`. Falls back to bounding box if union fails.

**7. Output Sorting** — Zones sorted by `max(meanFlood, meanHeat, meanLandslide)` descending.

---

## Zone Priority and Classification

### Typology → Intervention Type Mapping

| Typology | Assigned Intervention Type | Description |
|----------|---------------------------|-------------|
| `FLOOD` | `sponge_network` | Flood storage & delay solutions |
| `FLOOD_HEAT` | `sponge_network` | Prioritizes flood over heat |
| `FLOOD_LANDSLIDE` | `sponge_network` | Prioritizes flood over landslide |
| `HEAT` | `cooling_network` | Urban cooling & shade solutions |
| `HEAT_LANDSLIDE` | `slope_stabilization` | Prioritizes slope stabilization |
| `LANDSLIDE` | `slope_stabilization` | Slope stabilization solutions |
| `LOW` | `multi_benefit` | Hybrid/multi-benefit solutions |

### Intervention Categories and Eligible NBS Types

| Category | Applicable Typologies | Example Interventions |
|----------|----------------------|----------------------|
| **Flood Storage & Delay** | FLOOD, FLOOD_HEAT, FLOOD_LANDSLIDE | Floodable parks, sponge squares, bioswales, retention fields |
| **Urban Cooling & Shade** | HEAT, FLOOD_HEAT, HEAT_LANDSLIDE | Street trees, cool roofs, pocket forests, shade structures |
| **Slope Stabilization** | LANDSLIDE, FLOOD_LANDSLIDE, HEAT_LANDSLIDE | Terracing, vetiver grass, retaining walls, slope forests |
| **Multi-Benefit** | FLOOD_HEAT, FLOOD_LANDSLIDE, HEAT_LANDSLIDE, LOW | Constructed wetlands, green corridors, urban forests |

### Porto Alegre Sample Zones Summary

| Zone | Typology | Intervention | Flood | Heat | Landslide | Cells | Area |
|------|----------|-------------|-------|------|-----------|-------|------|
| zone_12 | HEAT | cooling_network | 0.43 | **0.62** | 0.03 | 103 | 103 km² |
| zone_8 | FLOOD_HEAT | sponge_network | **0.60** | 0.60 | 0.01 | 30 | 30 km² |
| zone_14 | FLOOD | sponge_network | **0.56** | 0.26 | 0.00 | 173 | 173 km² |
| zone_1 | LANDSLIDE | slope_stabilization | 0.35 | 0.28 | **0.48** | 14 | 14 km² |
| zone_9 | FLOOD_HEAT | sponge_network | **0.45** | 0.48 | 0.05 | 39 | 39 km² |
| zone_15 | FLOOD | sponge_network | **0.46** | 0.23 | 0.02 | 303 | 303 km² |

---

## Live Code vs. Sample Pipeline Comparison

### Metrics Available

| Metric | Sample Pipeline | Live Code | Impact |
|--------|----------------|-----------|--------|
| `elevation_mean/min/max` | Yes (from Copernicus DEM) | Yes (from Copernicus DEM) | Same |
| `slope_mean` | Yes (computed from DEM) | No (never computed) | Landslide score broken in live |
| `flow_accum` / `flow_accum_pct` | Yes (DEM hydrological grid) | No | Flood risk underestimated in live |
| `is_depression` / `depression_pct` | Yes (DEM depression detection) | No | Ponding risk missed in live |
| `low_lying_pct` | Yes | Yes | Same |
| `dist_river_m` / `river_prox_pct` | Yes | Yes | Same |
| `dist_water_m` / `floodplain_adj_pct` | Yes | Yes | Same |
| `imperv_pct` | Yes (OSM + GHSL) | Yes (OSM only) | Less accurate in live |
| `green_pct` | Yes | Yes | Same |
| `canopy_pct` | Yes | Yes | Same |
| `pop_density` | Yes (WorldPop raster) | Yes (OSM proxy only) | Much less accurate in live |
| `pop_density_raw` | Yes (absolute people/pixel) | No | Missing absolute population in live |
| `building_density` | Yes (GHSL satellite data) | No | Missing built environment detail in live |
| `built_pct` | Yes | Yes | Same |
| `vegetation_pct` | Yes (max of canopy, green) | No | Computed but not stored in live |
| `water_cooling` | Yes (water body distance decay) | No | Missing cooling factor in live |
| `lakeside_risk` | Yes (Porto Alegre specific) | No | City-specific factor |
| `delta_risk` | Yes (Porto Alegre specific) | No | City-specific factor |
| `low_elev_risk` | Yes (absolute elevation) | No | Absolute flood exposure missing in live |

### Coverage Flags

| Flag | Sample Pipeline | Live Code |
|------|----------------|-----------|
| `elevation` | Yes | Yes |
| `flow` | Yes | No |
| `landcover` | Yes | Yes |
| `surface_water` | Yes | Yes |
| `rivers` | Yes | Yes |
| `forest` | Yes | Yes |
| `population` | Yes | Yes |
| `buildings` | Yes | No |

### Score Formula Comparison

| Hazard | Sample Pipeline Factors | Live Code Factors |
|--------|------------------------|-------------------|
| **Flood** | 7 factors (flow accum, depression, river prox, water prox, low lying, imperv, flatness) + 3 location factors (lake, delta, low elev) with synergy bonus | 3 effective factors (river prox ×0.60 due to bug, low lying, imperv) |
| **Heat** | 4 factors (building density, pop density, vegetation, water cooling) using satellite data | 3 factors (imperv, pop density as OSM proxy, canopy) |
| **Landslide** | 3 slope-gated factors (slope risk, vegetation × slope, elevation × slope) — zero for flat terrain | 1 factor (absence of canopy) — max score 0.15 regardless of terrain |

---

## Known Risks and Limitations

### Data Quality Risks

| Risk | Severity | Description |
|------|----------|-------------|
| **Source attribution mismatch** | High | UI and metadata declare authoritative sources (WorldPop, Hansen Forest, JRC Water, HydroSHEDS, ESA WorldCover, GHSL) but all live layers except elevation actually use OpenStreetMap. The sample pipeline does use WorldPop and GHSL. |
| **OSM coverage variability** | High | OSM data completeness varies enormously by region. Cities in sub-Saharan Africa, South Asia, or Central America may have minimal building, land use, or water mapping. |
| **No actual climate data** | High | No precipitation, temperature, or historical event data is used. Risk scores are based entirely on geographic proxies. |
| **Sample data is far more accurate than live** | Medium | The sample pipeline uses 7+ additional metrics from satellite sources and improved formulas. Live users get a simpler, less accurate analysis than the demo suggests. |
| **Elevation = DSM not DTM** | Medium | Copernicus DEM includes structures, inflating elevation in urban areas and distorting slope/low-lying calculations. |

### Algorithmic Risks (Live Code Only)

| Risk | Severity | Description |
|------|----------|-------------|
| **Flood score double-counts river proximity** | High | River proximity has 60% weight instead of intended ~45% due to duplicate variable assignment (`A` and `R` both = `river_prox_pct`). |
| **Landslide score is non-functional** | Critical | Slope and soil instability are hardcoded to 0. The score only reflects absence of forest (max 0.15). Cities with genuine landslide risk will not see it reflected. |
| **No hydrological modeling** | High | Flow accumulation and depression detection are absent in live code. Flood risk cannot identify where water concentrates. |
| **Relative normalization prevents comparison** | Medium | All percentile-based metrics are city-relative. Cross-city comparison is meaningless. |
| **No uncertainty quantification** | Medium | Scores are presented as precise percentages with no confidence intervals or data quality indicators. |

### Operational Risks

| Risk | Severity | Description |
|------|----------|-------------|
| **Overpass API rate limiting** | Medium | Multiple concurrent layer fetches can trigger rate limits (HTTP 429) from the public Overpass API. |
| **Overpass API timeout** | Medium | Large cities with dense OSM data may timeout on the 60-second query limit. |
| **No data freshness tracking** | Low | Cached data has no automatic expiry (except OSM assets at 7 days). Elevation tiles persist indefinitely. |
| **No validation of input bounds** | Low | Extremely large bounding boxes (e.g., entire countries) are not rejected, potentially causing out-of-memory errors. |

### Recommendations for Improvement

1. **Port sample pipeline scoring to live code**: The `recalc-scores.ts` formulas are strictly better than the live `computeCompositeScores()`. Porting the 7-factor flood score, slope-gated landslide score, and satellite-backed heat score would close the quality gap.
2. **Fix flood score formula**: Replace duplicate `A` and `R` variables — use `flow_accum_pct` or `floodplain_adj_pct` for the second term.
3. **Implement slope calculation in live code**: Derive slope from the Copernicus DEM grid (the data is already downloaded) to make landslide scores functional.
4. **Align source attribution**: Either update metadata/UI to truthfully say "OpenStreetMap" or implement actual connections to declared sources (WorldPop, Hansen, JRC, GHSL).
5. **Add data quality indicators**: Show coverage percentages per layer and warn users when coverage is below thresholds.
6. **Add climate data integration**: Incorporate precipitation return periods, historical flood events, or climate projection data for scientifically grounded risk assessment.

---

*Generated: February 2026*
*Codebase version: Current main branch*

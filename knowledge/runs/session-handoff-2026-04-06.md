# Session Handoff — 2026-04-06

## What Was Built This Session

### Risk Scores v3 (250m grid)
- **16,576 cells** at 250m resolution
- **MERIT HAND** integrated as primary flood predictor (F1=70% vs 2024 floods)
- **SoilGrids 250m** for soil permeability
- **Copernicus 2024 flood depth** decoded (B-channel encoding)
- **Landslide threshold** raised from 5° to 15° (geotechnical best practice)
- Validated against May 2024 Planet SkySat flood extent (197 polygons)

### Tile System
- Pre-rendered PNG tile pyramids (z10-14): flood, heat, landslide, composite hotspot
- Value tiles for programmatic decode (scale=1000)
- Composite hotspot: percentile-normalized, exponential falloff, water excluded
- Gap fix: +2px overlap + CSS blur

### Map Microapp
- Neighborhood picker (IBGE census blocks, 99 bairros)
- Composite stepper (zone → assets)
- Zones toggle fixed (cleanup on re-mount)

### CBO UX
- Portuguese i18n (tabs, buttons, field labels, maturity metrics)
- Language picker → agent language
- Multi-select keyboard navigation
- Chat button hidden on agent pages

### New Layers
- Census/Poverty by Neighborhood (IBGE indicators)
- Informal Settlements (125 polygons)
- 2024 Flood Extent (197 polygons)
- Reference Data group in sidebar

## Open Items (for next session)

### Immediate Fixes
1. ~~**Census layer color gradient**~~ — ✅ Done (PR #81)
2. ~~**Loading spinner on layer dots**~~ — ✅ Done (PR #82)
3. ~~**MERIT HAND/UPA/ELV value tile encodings**~~ — ✅ Done (PR #82)
4. ~~**Documentation update**~~ — ✅ Done (PR #82)

### Backlog
- **Rethink intervention zones using census neighborhoods** — Replace synthetic zone_1..zone_N with IBGE bairros (99 neighborhoods). Each bairro gets an intervention type based on v3 risk scores (HAND flood, UHI heat, slope landslide) + census vulnerability data. Benefits: real place names, aligns with city admin boundaries, census data is per-neighborhood, easier for CBO communication. Consider: aggregate 250m grid scores per bairro, assign dominant hazard + intervention type, use neighborhood name as zone label.
- Issue #61: v4 roadmap (Landsat LST, CPRM risk zones, ALOS PALSAR DEM)
- Issue #62: Map performance (canvas renderer for 16K cells if needed)
- More Bike-lanes layers to port: transit routes/stops, sports/social/vacant sites, solar potential

## Key File Locations

### Risk Scoring Pipeline
- `scripts/tile-sampler.ts` — S3 value tile decoder (HAND, FRI, HWM, CHIRPS, DW, flood depth)
- `scripts/generate-grid-250m.ts` — 250m grid generator
- `scripts/recalc-scores-v3.ts` — scoring with HAND + validation
- `scripts/generate-risk-tiles.ts` — tile pyramid generator
- `scripts/render-risk-maps-250m.ts` — PNG validation maps

### Components
- `client/src/core/components/concept-note/ConceptNoteMap.tsx` — main map with sidebar
- `client/src/core/components/concept-note/MapMicroapp.tsx` — agent-invokable map
- `shared/geospatial-layers.ts` — all layer definitions

### Data
- `client/public/sample-data/porto-alegre-grid-250m.json` — 250m grid (generated, gitignored)
- `client/public/tiles/` — visual tile pyramids
- `client/public/tiles_values/` — value tile pyramids
- `scripts/data/soilgrids-poa.json` — SoilGrids clay/sand

## PR History This Session
#59-#80 (22 PRs covering risk scoring, tile system, CBO UX, map microapp, layer organization)

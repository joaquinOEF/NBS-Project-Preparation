# Recommended Datasets for NBS Design

This document inventories geospatial datasets that support early-stage Nature-based Solution (NBS) design screening. Each entry links a dataset to the design decision it helps unlock, following the methodology in `docs/nbs_dataset_identification_methodology.md`.

Hazard-specific dataset lenses (for example, flood) expand on this inventory with additional context and NBS-specific needs.

---

## Flood NBS solution design datasets

This section builds on the project flood hazard and flood risk score methodologies. Those scores identify where flooding is a priority. The datasets below help determine which flood-related NBS types may be plausible in those priority areas.

| Decision area | Dataset | Source | Coverage / resolution | Proxy represented | NBS decision unlocked | Relevant NBS | Gaps / caveats |
|---|---|---|---|---|---|---|---|
| Priority input | Flood hazard/risk scores | project methodology | project-specific | flood priority areas | identifies where NBS screening should begin | all flood NBS | does not determine NBS suitability by itself |
| Diagnose flood mechanism | Flow accumulation / drainage network | HydroSHEDS, MERIT Hydro, OSM, local drainage | Global/local | drainage convergence and river network | identifies where water naturally concentrates and where riparian, wetland, floodplain, or storage NBS may be plausible | riparian buffers, wetlands, floodplain restoration, retention basins | global hydrography misses urban drainage and stormwater infrastructure |
| Diagnose flood mechanism | Low-lying terrain | Copernicus DEM, SRTM, FABDEM, local LiDAR | Global/local | low elevation, depressions, slope | identifies possible storage zones and terrain constraints | floodable parks, retention basins, wetlands | global DEMs are too coarse for urban design |
| Diagnose flood mechanism | Surface water history | JRC Global Surface Water, Dynamic World, ESA WorldCover | Global | permanent/seasonal water occurrence | identifies wetland/floodplain restoration potential and unsuitable permanent water areas | wetland restoration, floodplain restoration | does not indicate land availability or legal feasibility |
| Diagnose flood mechanism | Rainfall intensity | CHIRPS, IMERG, ERA5-Land, local gauges/IDF | Global/local | extreme rainfall/runoff driver | helps prioritize distributed runoff control versus river/floodplain approaches | rain gardens, bioswales, basins | IDF/local hydrology needed for sizing |
| Diagnose flood mechanism | Impervious/built-up surface | GHSL, ESA WorldCover, Dynamic World, OSM, local imperviousness | Global/local | runoff-generating surfaces | identifies areas for runoff-reducing urban NBS | bioswales, rain gardens, permeable surfaces, green streets | built-up is only a proxy for imperviousness |
| NBS suitability | Soil texture/infiltration proxy | SoilGrids, national soil maps, hydrologic soil groups | Global/local | infiltration potential and soil drainage | screens where infiltration-based NBS may be plausible | rain gardens, bioswales, permeable pavements | field infiltration tests needed before design |
| NBS suitability | Groundwater depth | global groundwater products, hydrogeological maps, monitoring wells | Global/local | infiltration constraint | identifies where shallow groundwater may limit infiltration NBS | rain gardens, bioswales, infiltration basins | often unavailable or too coarse globally |
| NBS suitability | Open/public land | OSM, cadastre, municipal land use, parks, schools | Local/global proxy | physical and governance space | identifies where larger storage/restoration NBS may be feasible | floodable parks, wetlands, retention basins | land cover does not equal land availability |
| NBS suitability | Existing green space | NDVI, ESA WorldCover, Dynamic World, OSM parks | Global/local | existing vegetation/open space | identifies restoration, expansion, and connectivity opportunities | blue-green corridors, riparian restoration, parks | green space may be private, degraded, or ecologically unsuitable |
| NBS ecological needs | Wetland/riparian species data | GBIF, national biodiversity portals, herbaria, local experts | Global/local | native/ecologically suitable species | supports native planting/restoration screening | wetlands, riparian buffers, floodplain restoration | species data requires expert validation |

See also: `docs/flood_nbs_dataset_lens.md` for the full flood NBS dataset lens, including NBS-specific requirements and interpretation guidance.

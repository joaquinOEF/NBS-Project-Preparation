# NBS site query — flood E2E (Porto Alegre)

**Notebook (COUGAR monorepo):** `projects/cougar/nbs_e2e/scripts/nbs_site_query_flood_e2e.ipynb`  
**Rules (this repo):** [`scripts/screening/nbs_rules.py`](../scripts/screening/nbs_rules.py)  
**Lens:** [`flood_nbs_dataset_lens.md`](flood_nbs_dataset_lens.md)  
**Default site:** Humaitá

---

## Structure

| Section | Unit | Purpose |
|---------|------|---------|
| **Bairro** | Bairro polygon | Step 0 priority + Step 1 mechanism + Step 2 flood NBS |
| **Grid** | 250 m COUGAR cell | Per-cell mechanism flags + dominant NBS; bairro % rollup |

Grid cell = primary unit for intra-bairro differentiation; bairro polygon is only a spatial filter. Grid orchestration lives in COUGAR: `projects/cougar/nbs_e2e/scripts/grid_screening.py`.

---

## Workflow

```text
Step 0  bairro attributes     → flood_risk_score_poa.gpkg / catalog poa_flood_*
Step 1  catalog + local rasters → hazard, HAND, UPA, built-up, JRC water, etc.
Step 1  mechanism inference   → riverine, pluvial, low-lying, drainage_constrained
Step 2  NBS typology scores   → rain garden, bioswale, wetland restoration, …
Grid    screen_bairro_grid    → per 250 m cell flags + GeoJSON export (COUGAR notebook)
```

**Mechanism flags:** `riverine`, `pluvial`, `low_lying`, `drainage_constrained`  
**Dominant type layer (ON-5990):** `classify_dominant_flood_mechanism()` in [`nbs_rules.py`](../scripts/screening/nbs_rules.py)

---

## Run (COUGAR monorepo)

```bash
projects/cougar/floods/.venv/bin/python projects/cougar/nbs_e2e/scripts/run_e2e.py --hazard flood
```

**Outputs (COUGAR):**
- `projects/cougar/nbs_e2e/output/nbs_site_query_humaita.json` — bairro report
- `projects/cougar/nbs_e2e/output/nbs_grid_flood_humaita.geojson` / `.json` — grid screening (notebook)

Change `SITE_NAME` in the notebook Setup cell to try another bairro.

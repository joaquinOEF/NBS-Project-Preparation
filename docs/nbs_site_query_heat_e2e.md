# NBS site query — heat E2E (Porto Alegre)

**Notebook:** [`scripts/nbs_site_query_heat_e2e.ipynb`](../scripts/nbs_site_query_heat_e2e.ipynb)  
**Lens:** [`heat_nbs_dataset_lens.md`](heat_nbs_dataset_lens.md)  
**Default site:** Cidade Baixa

---

## Structure

Bairro-level screening only (250 m grid heat E2E not yet implemented).

| Step | Purpose |
|------|---------|
| **0** | Heat hazard / risk priority from `heat_risk_score_poa.gpkg` |
| **1a** | Diagnostic layers — LST, built-up, NDVI, tree cover, Dynamic World |
| **1b** | Mechanism inference — UHI, shade deficit, daytime LST, nocturnal cooling |
| **2** | Cooling NBS typology scores |
| **6** | Gaps discovered |

---

## Workflow

```text
Step 0  bairro attributes     → heat_risk_score_poa.gpkg
Step 1  catalog + local rasters → heat hazard/risk, GHSL, MODIS LST, Hansen, Dynamic World
Step 1  mechanism inference   → uhi_built_up, shade_deficit, high_daytime_lst, …
Step 2  NBS typology scores   → street trees, green corridor, pocket park, …
```

**Mechanism flags:** `uhi_built_up`, `shade_deficit`, `high_daytime_lst`, `limited_nocturnal_cooling`, `high_social_exposure`

**NBS types:** `urban_street_trees`, `green_corridor`, `pocket_park`, `schoolyard_greening`, `green_roof_wall`, `riparian_cooling_corridor`

---

## Run

```bash
projects/cougar/floods/.venv/bin/python projects/cougar/nbs_e2e/scripts/run_e2e.py --hazard heat
```

**Output:** `output/nbs_site_query_heat_cidade_baixa.json`

Change `HEAT_SITE_NAME` in the notebook Setup cell to try another bairro.

**Caveat:** coarse layers (MODIS LST, CHIRPS) use `all_touched=True` masking for small bairros.

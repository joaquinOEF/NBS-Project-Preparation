# NBS screening rules (reference)

Canonical **Step 1–2** logic for the COUGAR / NBS Project Preparation app:

```text
Step 0  catalog hazard/risk scores     →  WHERE to start (see scripts/sample-catalog-risk.ts)
Step 1  mechanism inference            →  WHAT KIND of problem (diagnostic flags)
Step 2  NBS typology scoring           →  WHICH interventions to surface (ranked 0–1)
```

## Files

| File | Role |
|------|------|
| [`nbs_rules.py`](nbs_rules.py) | Mechanism inference + per-typology NBS scores (flood, heat, landslide) |

## Inputs

`nbs_rules.py` expects three dicts (same shape as the COUGAR E2E exercises):

- **`ctx`** — bairro/cell context: `risk_mean`, `exposure_score`, `vulnerability_score`, hazard means
- **`grid`** — zonal stats from catalog COGs: `flood_score_mean`, `imperv_pct_mean`, `merit_hand_mean`, CHIRPS, JRC water, etc.
- **`water`** — OSM waterway proximity: `dist_nearest_m`, `intersects_waterway`

See [`docs/recommended-datasets.md`](../../docs/recommended-datasets.md) and hazard lens docs for which layers feed each rule.

## Main entry points

```python
from nbs_rules import recommend_all, recommend_flood_all, classify_dominant_flood_mechanism

mechanism, ranked_nbs = recommend_flood_all(ctx, grid, water)
# ranked_nbs: list[NbsRecommendation] sorted by score desc

flood_mech = classify_dominant_flood_mechanism(ctx, grid, water)  # ON-5990 grid layer
```

## App integration (planned)

| Layer | Location | Status |
|-------|----------|--------|
| Reference spec | `scripts/screening/nbs_rules.py` (this folder) | ✅ in repo |
| Prose + expert review | [`docs/nbs_recommendation_rules_expert_review.md`](../../docs/nbs_recommendation_rules_expert_review.md) | ✅ |
| Runtime (TypeScript) | `shared/screening/nbsRules.ts` | 🔜 port when site-explorer runs live filters |

## Source of truth / sync

Authoritative development copy lives in the OEF monorepo:

`projects/cougar/nbs_e2e/scripts/nbs_rules.py`

When rules change in COUGAR, copy or diff-sync into this folder so the app repo stays aligned.

## Related COUGAR artifacts (not in this repo)

| Artifact | Monorepo path |
|----------|----------------|
| Catalog layer sampling | `projects/cougar/nbs_e2e/scripts/catalog_layers.py` |
| 250 m grid screening | `projects/cougar/nbs_e2e/scripts/grid_screening.py` |
| Flood E2E notebook | `projects/cougar/nbs_e2e/scripts/nbs_site_query_flood_e2e.ipynb` |

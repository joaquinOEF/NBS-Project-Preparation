# Porto Alegre — disasters already lived, future risk, and who carries it

Context for any pass that has to say *why Porto Alegre needs nature-based solutions because of climate impacts that are already happening* (the Rede SCbN's ask, 16 Nov 2026). Figures computed by `scripts/city-exposure-stats.py` → `knowledge/porto-alegre/census-2022/exposure.json`; the pre-note prints the site-relevant ones through `shared/city-climate-context.ts`.

**How to use it:** cite a figure only where it bears on the place being discussed (below the 2024 flood level, inside an SGB risk sector, a low-income surrounding). On an organisation's own page, compare **income**, not race — the race figures below are for the coordination's views and the Rede's publication (decision D3).

## 1. Official disaster record (S2ID / Atlas Digital de Desastres, MIDR, 1991–2025)

- 18 disaster records for Porto Alegre: 13 hydrological (floods, flash floods), 3 meteorological (intense rain, windstorms, hail), 2 climatological (drought).
- 5 deaths (all in 2024), 416 injured or ill, 33.9 thousand displaced or homeless, 38.5 thousand directly affected.
- Material damage R$ 177 million (77% from floods); public losses R$ 57 million; private losses R$ 62 million.
- 2024 holds 20.1 thousand of the displaced and homeless; 2015 is second with 8.4 thousand.

⚠️ **The S2ID undercounts.** It holds only what the municipality filed in the federal forms. For 2024 it is far below the event: ~164 thousand people live below the level the Guaíba reached (section 2). Cite the S2ID as "official records" and use section 2 for the scale. It has no neighbourhood breakdown.

## 2. Where the May 2024 flood reached (2022 Census × SMAMUS Guaíba contour of 5.35 m)

- ~164 thousand residents (12.3% of the city) live below the 2024 peak level; the Planet SkySat image of 6 May 2024 shows ~121 thousand residents in area actually flooded that day.
- Neighbourhoods with most residents below the level: Sarandi (26 k, 51% of the bairro), Menino Deus (19 k, 67%), Farrapos (18 k, all of it), Humaitá (13 k, all), Cidade Baixa (10 k, 75%), Floresta (8 k, 87%), Centro Histórico (7 k), Ponta Grossa (7 k), São Geraldo (7 k, 95%), Arquipélago (6 k, all).
- Full per-neighbourhood table: `exposure.json` → `bairros`.

## 3. Future and chronic risk

- PLAC/ARVC 2050, stream (arroio) flood threat high or very high: ~17.5 thousand residents.
- SGB/CPRM risk sectors (surveyed on the ground; landslide, flood, flash flood, rockfall, erosion — houses at risk): ~30.5 thousand residents. ⚠️ SGB surveyed precarious settlements only: a site outside a sector is not "safe".
- The ARVC heat threat rates almost the whole city high, so it does not separate groups.

## 4. Does it show climate injustice? Yes — in everyday risk; 2024 was broader.

City: 26% of residents are Black or brown (pretos e pardos); typical household-head income R$ 3,705.

| Where | Residents | Black or brown | Typical income |
|---|---|---|---|
| Whole city | 1,332,845 | 26% | R$ 3,705 |
| SGB risk sectors | ~30,500 | 43% | R$ 1,731 |
| Arroio flood threat high, 2050 | ~17,500 | 33% | R$ 2,061 |
| Below the 2024 Guaíba level | ~164,300 | 22% | R$ 3,524 |

By income fifth (poorest → richest), share of residents living in an SGB sector: 7.0% · 3.4% · 0.7% · 0.2% · 0.05% (the poorest fifth ~140× the richest). Arroio flood high 2050: 2.5% · 2.9% · 1.0% · 0.2% · 0.1%. Below the 2024 level: 13% · 12% · 13% · 15% · 9% — the 2024 flood reached every income band about equally; its injustice lies in who could recover, which these data do not measure.

**Indicator to use:** the share of Black and brown residents and the typical income inside the risk areas (SGB sectors, arroio flood threat), compared with the whole city. The PLAC/ARVC also publishes its own exposure index for the Black population (`arvc_off_exposure_black_population`).

## Method and sources

A census tract counts in proportion to the share of its area inside the layer (for the ARVC raster, the share of its pixels in the two highest of five classes, stretch p2–p98 as on the printed maps). Typical income = people-weighted median of each tract's average household-head income.

IBGE, Censo Demográfico 2022 by tract (via GeoReDUS/CEM-USP) · SMAMUS, Cotas de inundação do Guaíba · Planet SkySat 6 May 2024 (zenodo.org/records/14662897) · PLAC/ARVC 2023 · SGB/CPRM Setorização de Risco · MIDR, Atlas Digital de Desastres (S2ID), consulted 11 Nov 2026.

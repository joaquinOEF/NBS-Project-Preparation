# The 2022 Census around a site

Decided 23 Oct 2026 (JVP, two /refinehtml rounds). GeoReDUS
(redus.org.br) serves IBGE's Censo 2022 per **setor censitário** through an
open API; COUGAR imports Porto Alegre once and uses it **after the encontros, to
enrich documents** — never to change what an organisation answered.

## The data — `npm run census:import`

`scripts/import-census-2022.ts` → `knowledge/porto-alegre/census-2022/`:
2,744 tracts with people, ages, pretos e pardos, homes, household-head income,
the share of homes on a street with no trees, homes without adequate sewage;
CNES health units and INEP public schools; INCRA quilombos and FUNAI lands.

- A **snapshot**, never a runtime call: the host is `dev-`, with no terms page,
  and the census won't change until 2032.
- **Cited to the original** (IBGE, CNES, INEP, INCRA, FUNAI); "via GeoReDUS"
  only in the manifest.
- **Fails, writing nothing,** unless people sum to IBGE's 1,332,845 and every
  tract has stats. Two misreadings were caught that way while building it: a
  population column that summed to 558,762, and `sesg`, which counts homes
  **without** adequate sewage.
- IBGE withholds figures in small tracts (`null`, listed in the manifest);
  sums over them say so ("o IBGE protege alguns números") and never read as 0.
- Not imported, on purpose: per-facility dengue hospitalisations (5 of 224
  units have it); the SGB risk sectors and the 2022 favelas map (COUGAR already
  has both from their own sources).

## Around a site — `server/services/censusContext.ts`

Tracts that **touch 300 m** around the pin count whole (U2): "moram a até
~300 m", honest about being approximate — in the dense centre it touches many
small tracts (~6,000 people). Several sites together count each tract once.

## Where it shows — `shared/census.ts`

| Where | What | Race |
|---|---|---|
| Proposta inicial, **Território** (all pre-note paths) | people + ages + typical income; trees if the solution acts on heat, sewage if on water (D2); "No entorno" | no |
| Concept note, under the territory | same lines | no |
| Perfil (PDF) | "Quem mora perto (Censo 2022)", by the first solution tested | no |
| Encontro 4, before "quem é atingido" — only while unanswered | "Pelo Censo 2022, cerca de N pessoas moram a até uns 300 m daqui" | no |
| Combined project, pre-portfolio, synergy report (coordination) | totals across places, each tract once | yes (D3) |

- Relevance comes from the solution's família weights (`relevanceFor`):
  heat ≥ 0.5 → trees; flood ≥ 0.5 → sewage.
- **Their record is never written.** Documents are computed when opened, so
  every organisation's pages gain the lines on the next view (D4).
- The census is **not** part of Território's edit basis: a coordinator's
  rewrite made before it stays valid and keeps winning.
- Health units and schools are context, never partners (R2).

Spec: `e2e/census-2022.spec.ts`.

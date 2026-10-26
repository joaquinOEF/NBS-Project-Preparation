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

People **inside a 300 m circle**: each tract counts for the share of its area
inside it (a 20 m grid over the circle; several sites = the union of their
circles, so an overlap counts once).

⚠️ The first version counted every tract that merely **touched** the circle.
Measured against an area-weighted count over 80 points it read **~2× high**
(median 2.04, p90 2.88 — Morro da Cruz 10,300 vs ~3,000). Fixed 23 Oct; the
area-weighted count was then checked against an independent source, CNEFE
address hexagons, at five sites (ratio 0.80–1.42, median ~1.05).
`e2e/record-defects.spec.ts` keeps both checks: bounds over 300 points and
two independent area-weighted counts agreeing within 10%.

## Where it shows — `shared/census.ts`

| Where | What | Race |
|---|---|---|
| Proposta inicial · **Território** | the city's maps only (unnamed squares dropped) | — |
| Proposta inicial · **Quem mora perto** (own section, after Território) | people + ages + typical income; "No entorno": UBS (no SAMU bases), public schools, quilombos/indigenous lands, fresh-food shops for urban agriculture (Overture ≥ 0.7, named, never counted) | no |
| Proposta inicial · **Impacto** | the argument for THIS solution: heat → streets without trees + how many children and 60+ live near; water → homes without adequate sewage (≥ 5%) | no |
| Proposta inicial · **Indicadores** | "referência pública" beside the baseline: homes within 300 m (Famílias atendidas), today's treeless share (Diferença de temperatura) — their count still decides | no |
| Concept note, Perfil (PDF) | people + impact + nearby, in one block | no |
| Encontro 4, "quem é atingido" — only while unanswered | hint + scale chips: "Quase todo mundo daqui (~N)", "Uma parte — umas centenas", "Um grupo específico", "Não sei dizer". A chip records THEIR choice with our number as context; a census note never becomes a household target | no |
| Combined project, pre-portfolio, synergy report (coordination) | one sentence, each tract once | yes (D3) |

- Relevance comes from Robson's rating of the solution itself
  (`relevanceFor` → `shared/solution-strengths.ts`, 26 Oct): Forte or Média on
  calor → trees; on alagamento → sewage. Until then it was the família's
  weights, which still rank famílias in Encontro 2.
- **Their record is never written.** Documents are computed when opened, so
  every organisation's pages gain the lines on the next view (D4).
- The census is **not** part of Território's edit basis: a coordinator's
  rewrite made before it stays valid and keeps winning.
- Health units and schools are context, never partners (R2).

## Bairro figures — `server/services/siteHealing.ts`

Documents read the site through `healSite`: hazards, population and poverty
for the bairro the **pin** is in (its census tract), never the first name of a
list, and a missing poverty rate stays unknown (never 0.0). The stored record is
not rewritten.

Specs: `e2e/census-2022.spec.ts`, `e2e/record-defects.spec.ts`.

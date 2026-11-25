# Landslide and flood: SGB susceptibility (since 24 Nov 2026)

## Why

Julia Caon Froeder (Rede SCbN POA) downloading the publication maps, 24 Nov 2026:
*"no mapa de deslizamento quase toda a cidade está com risco alto, e não é
assim"* — SGB is the agency Civil Defence works with. Decided in refine
`cougar-sgb-hazard-maps-2026-11-24`.

Measured before switching:

| | PLAC/ARVC landslide threat 2050 (what we showed) | SGB landslide susceptibility |
|---|---|---|
| share of the city "alta" (+ "muito alta") | **36%** (relative classes, p2–p98) | **1.7%** alta, 13.7% média, 84.6% baixa |
| Rede sites rated high | 20 de Novembro *alta*, Periferia Feminista *alta*, SDV Reciclando *muito alta* | all nine *baixa* |

The ARVC layer is classed relative to the city, so a fixed share of the
municipality is always the top classes — flat Centro Histórico included.

Flood: ARVC models the streams only (*inundação fluvial*); we used to add the
Guaíba as a second layer (SMAMUS cota 5,35 m). SGB's flood susceptibility is ONE
layer for streams and Guaíba together (the map GeoReDUS shows). 93% of the area
under the Guaíba at 5,35 m (May 2024) falls inside it.

Heat stays PLAC/ARVC (SGB does not map heat).

## The data

`knowledge/official-risk/porto-alegre/sgb-suscetibilidade-{movimento-de-massa,inundacao}.json`
— built by `scripts/build-sgb-suscetibilidade.py` from SGB/CPRM, *Carta de
suscetibilidade a movimentos gravitacionais de massa e inundação — Porto Alegre*
(2015, 1:70.000, field-validated 2012–14), RIGEO doc/15106,
`sig_portoalegre_rs.zip` (172 MB, not committed). One feature per class,
dissolved, ~3 m simplification. Movimento de massa keeps Alta and Média: the
whole municipality is classed, so anything else is Baixa. Inundação keeps all
three; outside them SGB maps no flood susceptibility.

The risk sectors (`sgb-setorizacao.json`, 145 sectors, 2022) are a different
product: field-surveyed areas with houses at risk. 58 are mass movement
(deslizamento, queda, corrida de massa); the rest are flood / flash flood. A
place outside a sector is not "safe" — only precarious settlements were
surveyed.

SGB's own WMS (`SGB_WMS_LAYERS`) paints Baixa yellow across the whole city, which
is the "everything coloured" problem again; we draw the committed vectors
ourselves (média + alta for landslide).

## Wording

"Suscetibilidade" (SGB's word) — how much the terrain favours the process. It
has no climate scenario, so the landslide and flood maps are single maps (no
"atual / 2050" pair).

## Where it is used

- Print maps — `scripts/publication-maps/render.py` (`npm run publication:maps`).
- What is said at a pin — `server/services/sgbPointHazard.ts` → `hazardAtPin`:
  the E2 site card, the synergy report's risk table ("No lugar") and the facts
  the chat gets with the card. Levels keep the 0..4 scale (≥ 3 = high): SGB
  Baixa 1 · Média 2 · Alta 3; flood outside SGB's polygons is 0, "não mapeada"
  (never "baixa"). Landslide adds the nearest SGB mass-movement sector. Heat is
  still PLAC/ARVC 2050 (`arvcHazardAtPin`). The synergy risk table also counts
  the May 2024 Guaíba mark on its own.
- Map layers — `sgb_flood_susc` / `sgb_landslide_susc`, drawn by
  `server/routes/sgbSuscTileRoutes.ts` (`/api/geospatial/sgb-susc/:id/{z}/{x}/{y}.png`)
  from the committed vectors; classes and colours in `shared/sgb-susceptibility.ts`
  (same as the print). Used by the CBO hazard tour (`E2_HAZARD_TILES`) and the
  orchestrator map (`HAZARD_RASTER`); heat keeps `arvc_heat_hazard`. Legends are
  `kind: 'classes'` entries in `layer-legends.json` (hand-added, like the ARVC
  ones — `generate-legends.ts` does not write either). The tour's May 2024
  overlay is now red dashed so it reads over the blue classes. "Sobre os dados"
  (`shared/data-provenance.ts`) and the map-help prompt say SGB.
- Not changed: our internal bairro ordering (ARVC risco ranks) and the
  publication's bairro table column `moradores_ameaca_inundacao_arroios_alta_2050`
  (city-exposure-stats.py) — both say what they are.

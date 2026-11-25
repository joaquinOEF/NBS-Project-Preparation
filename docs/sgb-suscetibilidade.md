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
- The rest of the platform (site card, synergy risk table, chat facts, map
  layers) — follow-up PRs, see the PR list in the refine.

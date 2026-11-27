# Neighbourhood zones: hazard flags from official data — before / after

Review aid for the change that rebuilds the 94 neighbourhoods' hazard flags, typology and suggested solution types from official data (27 Nov 2026). Method and cuts: `docs/neighborhood-zones-methodology.md`.

- **Flags, before → after (of 94):** flood 74 → 37 · heat 35 → 61 · landslide 94 → 33 · no flag 0 → 1. "Before" = the hazards in the old typology, plus the old landslide-prone flag (true for all 94).
- **The cuts (share of the neighbourhood's area):** flood = at least 30% in SGB's flood susceptibility class Alta, or at least 30% inside the area the Guaíba reached in May 2024 (SMAMUS contours up to 5,35 m) · landslide = at least 10% in SGB's mass-movement classes Média + Alta · heat = at least 50% in the two top classes of the climate plan's 2050 heat hazard.
- **Flood by the May 2024 mark alone (◆ in the table): 3** — Cristal, Praia de Belas, Centro Histórico. The other 34 flood flags meet the SGB cut.
- **Typology changed in 70 of 94; primary solution changed in 36 of 94.** Slope stabilisation offered (primary or secondary): 94 → 33. Primary solution: sponge network 47 → 31 · cooling network 21 → 38 · slope stabilisation 15 → 24 · multi-benefit 11 → 1.
- **Order of the list is unchanged:** the priority score is still our own index (OEF estimate). It also decides which flagged hazard is named first when a neighbourhood carries more than one; the first one sets the primary solution, the others are "also recommended" (in brackets).
- **To check:** (1) Bom Jesus has 1% in SGB's landslide classes and loses the landslide flag; (2) hill neighbourhoods where SGB surveyed flash-flood (enxurrada) risk sectors — Coronel Aparício Borges, Lomba do Pinheiro, Jardim Carvalho, Santa Tereza — lose the flood flag, because a flag is an area share and those sectors are small; (3) Cristal gets flood first (33% reached in 2024) ahead of landslide; (4) Tristeza carries no flag at all. Bold = changed.

| Neighbourhood | Priority (OEF estimate) | Flags: old → new | SGB flood Alta | Reached by the Guaíba, May 2024 | SGB landslide Média+Alta | Heat, top classes | Typology: old → new | Primary solution: old → new (also recommended) |
|---|---|---|---|---|---|---|---|---|
| Vila João Pessoa | 1.00 | flood + heat + landslide → **heat** | 26% | 0% | 5% | 100% | FLOOD_HEAT → **HEAT** | cooling network (+ sponge network, slope stabilisation) → cooling network |
| Bom Jesus | 1.00 | flood + landslide → **heat** | 0% | 0% | 1% | 100% | FLOOD_LANDSLIDE → **HEAT** | sponge network (+ slope stabilisation) → **cooling network** |
| Coronel Aparício Borges | 0.99 | flood + landslide → **heat + landslide** | 5% | 0% | 66% | 55% | FLOOD_LANDSLIDE → **HEAT_LANDSLIDE** | slope stabilisation (+ sponge network) → slope stabilisation (+ cooling network) |
| Vila São José | 0.98 | flood + landslide → **heat + landslide** | 0% | 0% | 57% | 63% | FLOOD_LANDSLIDE → **HEAT_LANDSLIDE** | sponge network (+ slope stabilisation) → **slope stabilisation** (+ cooling network) |
| Navegantes | 0.98 | flood + landslide → **flood + heat** | 82% | 98% | 0% | 97% | FLOOD → **FLOOD_HEAT** | sponge network (+ slope stabilisation) → sponge network (+ cooling network) |
| Farrapos | 0.98 | flood + heat + landslide → **flood + heat** | 64% | 98% | 0% | 95% | FLOOD_HEAT → FLOOD_HEAT | sponge network (+ cooling network, slope stabilisation) → sponge network (+ cooling network) |
| Arquipélago | 0.98 | flood + landslide → **flood** | 99% | 100% | 0% | 2% | FLOOD → FLOOD | sponge network (+ slope stabilisation) → sponge network |
| Santa Rosa de Lima | 0.98 | flood + heat + landslide → **flood + heat** | 66% | 27% | 0% | 86% | FLOOD_HEAT → FLOOD_HEAT | cooling network (+ sponge network, slope stabilisation) → cooling network (+ sponge network) |
| Anchieta | 0.97 | flood + landslide → **flood + heat** | 93% | 95% | 0% | 82% | FLOOD → **FLOOD_HEAT** | sponge network (+ slope stabilisation) → sponge network (+ cooling network) |
| Passo das Pedras | 0.97 | flood + landslide → **heat** | 20% | 0% | 0% | 79% | FLOOD_LANDSLIDE → **HEAT** | sponge network (+ slope stabilisation) → **cooling network** |
| São Geraldo | 0.96 | flood + heat + landslide → **flood + heat** | 82% | 97% | 0% | 100% | FLOOD_HEAT → FLOOD_HEAT | sponge network (+ cooling network, slope stabilisation) → sponge network (+ cooling network) |
| Glória | 0.96 | flood + landslide → **landslide** | 1% | 0% | 66% | 43% | FLOOD_LANDSLIDE → **LANDSLIDE** | slope stabilisation (+ sponge network) → slope stabilisation |
| Cristal | 0.96 | flood + landslide → **flood + heat + landslide** | 24% | 33% ◆ | 20% | 75% | FLOOD_LANDSLIDE → FLOOD_LANDSLIDE | sponge network (+ slope stabilisation) → sponge network (+ slope stabilisation, cooling network) |
| Cidade Baixa | 0.96 | flood + heat + landslide → **flood + heat** | 98% | 74% | 0% | 100% | FLOOD_HEAT → FLOOD_HEAT | cooling network (+ sponge network, slope stabilisation) → cooling network (+ sponge network) |
| Santa Tereza | 0.95 | flood + landslide → **heat + landslide** | 0% | 3% | 52% | 63% | FLOOD_LANDSLIDE → **HEAT_LANDSLIDE** | slope stabilisation (+ sponge network) → slope stabilisation (+ cooling network) |
| Praia de Belas | 0.95 | flood + landslide → **flood + heat** | 0% | 94% ◆ | 2% | 65% | FLOOD → **FLOOD_HEAT** | sponge network (+ slope stabilisation) → sponge network (+ cooling network) |
| Passo da Areia | 0.95 | flood + heat + landslide → **heat** | 15% | 0% | 0% | 99% | FLOOD_HEAT → **HEAT** | sponge network (+ cooling network, slope stabilisation) → **cooling network** |
| Humaitá | 0.94 | flood + landslide → **flood + heat** | 87% | 97% | 0% | 88% | FLOOD → **FLOOD_HEAT** | sponge network (+ slope stabilisation) → sponge network (+ cooling network) |
| Jardim Carvalho | 0.94 | flood + landslide → **heat + landslide** | 10% | 0% | 36% | 59% | FLOOD_LANDSLIDE → **HEAT_LANDSLIDE** | slope stabilisation (+ sponge network) → slope stabilisation (+ cooling network) |
| Floresta | 0.94 | flood + heat + landslide → **flood + heat** | 57% | 89% | 0% | 98% | FLOOD_HEAT → FLOOD_HEAT | cooling network (+ sponge network, slope stabilisation) → cooling network (+ sponge network) |
| Bom Fim | 0.94 | flood + heat + landslide → **heat** | 17% | 0% | 0% | 99% | FLOOD_HEAT → **HEAT** | cooling network (+ sponge network, slope stabilisation) → cooling network |
| Cascata | 0.93 | flood + landslide → **landslide** | 0% | 0% | 80% | 5% | FLOOD_LANDSLIDE → **LANDSLIDE** | slope stabilisation (+ sponge network) → slope stabilisation |
| Sarandi | 0.91 | flood + heat + landslide → **flood + heat** | 89% | 76% | 0% | 82% | FLOOD_HEAT → FLOOD_HEAT | sponge network (+ cooling network, slope stabilisation) → sponge network (+ cooling network) |
| Costa e Silva | 0.91 | heat + landslide → **heat** | 12% | 0% | 0% | 96% | HEAT_LANDSLIDE → **HEAT** | slope stabilisation (+ cooling network) → **cooling network** |
| Vila Jardim | 0.91 | heat + landslide → **heat** | 0% | 0% | 1% | 100% | HEAT_LANDSLIDE → **HEAT** | cooling network (+ slope stabilisation) → cooling network |
| Mário Quintana | 0.91 | flood + landslide → **heat** | 16% | 0% | 3% | 63% | FLOOD_LANDSLIDE → **HEAT** | sponge network (+ slope stabilisation) → **cooling network** |
| Morro Santana | 0.90 | flood + landslide → **landslide** | 7% | 0% | 45% | 38% | FLOOD_LANDSLIDE → **LANDSLIDE** | slope stabilisation (+ sponge network) → slope stabilisation |
| Serraria | 0.90 | flood + landslide → flood + landslide | 80% | 75% | 11% | 16% | FLOOD_LANDSLIDE → FLOOD_LANDSLIDE | sponge network (+ slope stabilisation) → sponge network (+ slope stabilisation) |
| Jardim Leopoldina | 0.89 | flood + heat + landslide → **heat** | 0% | 0% | 0% | 100% | FLOOD_HEAT → **HEAT** | cooling network (+ sponge network, slope stabilisation) → cooling network |
| Santa Maria Goretti | 0.89 | flood + landslide → **flood + heat** | 94% | 81% | 0% | 100% | FLOOD → **FLOOD_HEAT** | sponge network (+ slope stabilisation) → sponge network (+ cooling network) |
| Centro Histórico | 0.88 | flood + landslide → **flood + heat** | 15% | 52% ◆ | 0% | 78% | FLOOD_LANDSLIDE → **FLOOD_HEAT** | sponge network (+ slope stabilisation) → sponge network (+ cooling network) |
| Partenon | 0.88 | flood + landslide → **flood + heat + landslide** | 49% | 0% | 21% | 88% | FLOOD_LANDSLIDE → FLOOD_LANDSLIDE | sponge network (+ slope stabilisation) → sponge network (+ slope stabilisation, cooling network) |
| Nonoai | 0.87 | heat + landslide → **landslide** | 8% | 0% | 60% | 37% | HEAT_LANDSLIDE → **LANDSLIDE** | slope stabilisation (+ cooling network) → slope stabilisation |
| Santana | 0.87 | flood + heat + landslide → **flood + heat** | 100% | 20% | 0% | 100% | FLOOD_HEAT → FLOOD_HEAT | cooling network (+ sponge network, slope stabilisation) → cooling network (+ sponge network) |
| Santa Cecília | 0.87 | flood + heat + landslide → **flood + heat** | 99% | 4% | 0% | 94% | FLOOD_HEAT → FLOOD_HEAT | cooling network (+ sponge network, slope stabilisation) → cooling network (+ sponge network) |
| Menino-Deus | 0.87 | flood + heat + landslide → **flood + heat** | 74% | 63% | 3% | 89% | FLOOD_HEAT → FLOOD_HEAT | sponge network (+ cooling network, slope stabilisation) → sponge network (+ cooling network) |
| Rubem Berta | 0.86 | flood + heat + landslide → **heat** | 25% | 0% | 0% | 96% | FLOOD_HEAT → **HEAT** | sponge network (+ cooling network, slope stabilisation) → **cooling network** |
| Santo Antônio | 0.85 | flood + landslide → **heat + landslide** | 6% | 0% | 54% | 89% | FLOOD_LANDSLIDE → **HEAT_LANDSLIDE** | sponge network (+ slope stabilisation) → **slope stabilisation** (+ cooling network) |
| Ponta Grossa | 0.85 | flood + landslide → flood + landslide | 75% | 66% | 25% | 10% | FLOOD → **FLOOD_LANDSLIDE** | sponge network (+ slope stabilisation) → sponge network (+ slope stabilisation) |
| Lomba do Pinheiro | 0.84 | flood + landslide → **landslide** | 5% | 0% | 15% | 16% | FLOOD_LANDSLIDE → **LANDSLIDE** | slope stabilisation (+ sponge network) → slope stabilisation |
| São João | 0.84 | flood + heat + landslide → **flood + heat** | 41% | 49% | 0% | 95% | FLOOD_HEAT → FLOOD_HEAT | sponge network (+ cooling network, slope stabilisation) → sponge network (+ cooling network) |
| Cavalhada | 0.84 | flood + landslide → **heat** | 26% | 0% | 9% | 68% | FLOOD_LANDSLIDE → **HEAT** | sponge network (+ slope stabilisation) → **cooling network** |
| Lami | 0.83 | flood + landslide → **flood** | 82% | 60% | 2% | 22% | FLOOD → FLOOD | sponge network (+ slope stabilisation) → sponge network |
| Camaquã | 0.83 | flood + landslide → **flood + heat** | 40% | 0% | 2% | 84% | FLOOD_LANDSLIDE → **FLOOD_HEAT** | slope stabilisation (+ sponge network) → **sponge network** (+ cooling network) |
| Boa Vista do Sul | 0.82 | flood + landslide → **flood** | 81% | 52% | 5% | 19% | FLOOD → FLOOD | sponge network (+ slope stabilisation) → sponge network |
| Cristo Redentor | 0.82 | heat + landslide → **heat** | 0% | 0% | 0% | 100% | HEAT_LANDSLIDE → **HEAT** | cooling network (+ slope stabilisation) → cooling network |
| Belém Novo | 0.80 | flood + landslide → **flood** | 76% | 58% | 6% | 23% | FLOOD → FLOOD | sponge network (+ slope stabilisation) → sponge network |
| Jardim São Pedro | 0.79 | flood + heat + landslide → **flood + heat** | 42% | 40% | 0% | 94% | FLOOD_HEAT → FLOOD_HEAT | sponge network (+ cooling network, slope stabilisation) → sponge network (+ cooling network) |
| Vila Assunção | 0.77 | flood + landslide → **landslide** | 18% | 15% | 28% | 12% | FLOOD → **LANDSLIDE** | sponge network (+ slope stabilisation) → **slope stabilisation** |
| Vila Ipiranga | 0.76 | heat + landslide → **heat** | 0% | 0% | 0% | 99% | HEAT_LANDSLIDE → **HEAT** | slope stabilisation (+ cooling network) → **cooling network** |
| Azenha | 0.76 | flood + heat + landslide → **flood + heat** | 79% | 28% | 6% | 93% | FLOOD_HEAT → FLOOD_HEAT | cooling network (+ sponge network, slope stabilisation) → cooling network (+ sponge network) |
| Rio Branco | 0.76 | flood + heat + landslide → **heat** | 2% | 0% | 2% | 79% | FLOOD_HEAT → **HEAT** | cooling network (+ sponge network, slope stabilisation) → cooling network |
| Restinga | 0.76 | flood + landslide → flood + landslide | 33% | 0% | 19% | 27% | FLOOD_LANDSLIDE → FLOOD_LANDSLIDE | sponge network (+ slope stabilisation) → sponge network (+ slope stabilisation) |
| Pedra Redonda | 0.76 | flood + landslide → **landslide** | 8% | 23% | 19% | 2% | FLOOD → **LANDSLIDE** | sponge network (+ slope stabilisation) → **slope stabilisation** |
| Guarujá | 0.75 | flood + landslide → **landslide** | 19% | 19% | 31% | 49% | FLOOD_LANDSLIDE → **LANDSLIDE** | sponge network (+ slope stabilisation) → **slope stabilisation** |
| Vila Conceição | 0.74 | flood + landslide → **landslide** | 0% | 7% | 91% | 0% | FLOOD → **LANDSLIDE** | sponge network (+ slope stabilisation) → **slope stabilisation** |
| Tristeza | 0.73 | flood + landslide → **none** | 22% | 16% | 6% | 37% | FLOOD_LANDSLIDE → **LOW** | sponge network (+ slope stabilisation) → **multi-benefit** |
| Jardim Floresta | 0.72 | flood + heat + landslide → **heat** | 11% | 23% | 0% | 100% | FLOOD_HEAT → **HEAT** | sponge network (+ cooling network, slope stabilisation) → **cooling network** |
| Petrópolis | 0.72 | flood + heat + landslide → **heat** | 7% | 0% | 0% | 74% | FLOOD_HEAT → **HEAT** | cooling network (+ sponge network, slope stabilisation) → cooling network |
| Jardim Itu | 0.71 | flood + heat + landslide → **heat** | 11% | 0% | 0% | 98% | FLOOD_HEAT → **HEAT** | sponge network (+ cooling network, slope stabilisation) → **cooling network** |
| Ipanema | 0.71 | flood + landslide → **flood + heat + landslide** | 52% | 24% | 18% | 54% | FLOOD → **FLOOD_LANDSLIDE** | sponge network (+ slope stabilisation) → sponge network (+ slope stabilisation, cooling network) |
| Independência | 0.70 | heat + landslide → **heat** | 0% | 0% | 4% | 79% | HEAT_LANDSLIDE → **HEAT** | cooling network (+ slope stabilisation) → cooling network |
| Medianeira | 0.69 | flood + landslide → **flood + heat + landslide** | 46% | 0% | 30% | 94% | FLOOD_LANDSLIDE → FLOOD_LANDSLIDE | sponge network (+ slope stabilisation) → sponge network (+ slope stabilisation, cooling network) |
| Vila Nova | 0.69 | flood + landslide → **landslide** | 10% | 0% | 40% | 16% | FLOOD_LANDSLIDE → **LANDSLIDE** | slope stabilisation (+ sponge network) → slope stabilisation |
| Espírito Santo | 0.68 | flood + landslide → **landslide** | 16% | 5% | 28% | 46% | FLOOD → **LANDSLIDE** | sponge network (+ slope stabilisation) → **slope stabilisation** |
| Auxiliadora | 0.68 | flood + heat + landslide → **heat** | 0% | 0% | 0% | 91% | FLOOD_HEAT → **HEAT** | cooling network (+ sponge network, slope stabilisation) → cooling network |
| Campo Novo | 0.67 | flood + landslide → **landslide** | 14% | 0% | 32% | 18% | FLOOD_LANDSLIDE → **LANDSLIDE** | sponge network (+ slope stabilisation) → **slope stabilisation** |
| Aberta dos Morros | 0.67 | flood + landslide → **landslide** | 30% | 10% | 48% | 36% | FLOOD_LANDSLIDE → **LANDSLIDE** | sponge network (+ slope stabilisation) → **slope stabilisation** |
| Hípica | 0.66 | flood + landslide → **flood** | 64% | 8% | 7% | 34% | FLOOD → FLOOD | sponge network (+ slope stabilisation) → sponge network |
| Jardim Botânico | 0.66 | flood + heat + landslide → **flood + heat** | 60% | 0% | 0% | 67% | FLOOD_HEAT → FLOOD_HEAT | sponge network (+ cooling network, slope stabilisation) → sponge network (+ cooling network) |
| Teresópolis | 0.63 | flood + landslide → **landslide** | 4% | 0% | 53% | 28% | FLOOD_LANDSLIDE → **LANDSLIDE** | slope stabilisation (+ sponge network) → slope stabilisation |
| São Sebastião | 0.62 | heat + landslide → **heat** | 18% | 0% | 0% | 100% | HEAT_LANDSLIDE → **HEAT** | cooling network (+ slope stabilisation) → cooling network |
| Jardim Sabará | 0.62 | flood + landslide → **heat** | 2% | 0% | 2% | 68% | FLOOD_LANDSLIDE → **HEAT** | slope stabilisation (+ sponge network) → **cooling network** |
| Higienópolis | 0.60 | flood + heat + landslide → **heat** | 0% | 0% | 0% | 90% | FLOOD_HEAT → **HEAT** | cooling network (+ sponge network, slope stabilisation) → cooling network |
| Belém Velho | 0.59 | flood + landslide → **landslide** | 1% | 0% | 26% | 6% | FLOOD_LANDSLIDE → **LANDSLIDE** | slope stabilisation (+ sponge network) → slope stabilisation |
| Moinhos de Vento | 0.58 | flood + heat + landslide → **heat** | 0% | 0% | 6% | 68% | FLOOD_HEAT → **HEAT** | cooling network (+ sponge network, slope stabilisation) → cooling network |
| Jardim do Salso | 0.57 | flood + landslide → **heat** | 25% | 0% | 0% | 87% | FLOOD_LANDSLIDE → **HEAT** | sponge network (+ slope stabilisation) → **cooling network** |
| Jardim Lindóia | 0.54 | flood + heat + landslide → **heat** | 1% | 0% | 0% | 100% | FLOOD_HEAT → **HEAT** | cooling network (+ sponge network, slope stabilisation) → cooling network |
| Mont’Serrat | 0.49 | heat + landslide → **heat** | 0% | 0% | 0% | 67% | HEAT_LANDSLIDE → **HEAT** | cooling network (+ slope stabilisation) → cooling network |
| Bela Vista | 0.41 | heat + landslide → **heat** | 0% | 0% | 4% | 65% | HEAT → HEAT | cooling network (+ slope stabilisation) → cooling network |
| Agronomia | 0.40 | flood + landslide → **landslide** | 10% | 0% | 41% | 4% | FLOOD_LANDSLIDE → **LANDSLIDE** | sponge network (+ slope stabilisation) → **slope stabilisation** |
| Pitinga | 0.40 | flood + landslide → **landslide** | 8% | 0% | 53% | 2% | FLOOD_LANDSLIDE → **LANDSLIDE** | sponge network (+ slope stabilisation) → **slope stabilisation** |
| Extrema | 0.40 | flood + landslide → flood + landslide | 32% | 0% | 35% | 6% | FLOOD → **FLOOD_LANDSLIDE** | sponge network (+ slope stabilisation) → sponge network (+ slope stabilisation) |
| Chácara das Pedras | 0.39 | landslide → **heat** | 0% | 0% | 0% | 100% | LOW → **HEAT** | multi-benefit (+ slope stabilisation) → **cooling network** |
| Chapéu do Sol | 0.34 | landslide → **flood** | 82% | 2% | 0% | 11% | LOW → **FLOOD** | multi-benefit (+ slope stabilisation) → **sponge network** |
| Boa Vista | 0.34 | landslide → **heat** | 0% | 0% | 1% | 76% | LOW → **HEAT** | multi-benefit (+ slope stabilisation) → **cooling network** |
| Parque Santa Fé | 0.31 | landslide → **heat** | 0% | 0% | 0% | 88% | LOW → **HEAT** | multi-benefit (+ slope stabilisation) → **cooling network** |
| Farroupilha | 0.28 | landslide → **flood** | 89% | 0% | 0% | 45% | LOW → **FLOOD** | multi-benefit (+ slope stabilisation) → **sponge network** |
| Sétimo Céu | 0.26 | landslide → landslide | 0% | 0% | 36% | 0% | LOW → **LANDSLIDE** | multi-benefit (+ slope stabilisation) → **slope stabilisation** |
| Jardim Europa | 0.23 | landslide → **heat** | 0% | 0% | 0% | 78% | LOW → **HEAT** | multi-benefit (+ slope stabilisation) → **cooling network** |
| Lageado | 0.20 | landslide → landslide | 21% | 0% | 23% | 3% | LOW → **LANDSLIDE** | multi-benefit (+ slope stabilisation) → **slope stabilisation** |
| Três Figueiras | 0.19 | landslide → **heat** | 0% | 0% | 0% | 88% | LOW → **HEAT** | multi-benefit (+ slope stabilisation) → **cooling network** |
| Jardim Isabel | 0.17 | landslide → **flood** | 34% | 0% | 9% | 12% | LOW → **FLOOD** | multi-benefit (+ slope stabilisation) → **sponge network** |
| São Caetano | 0.00 | landslide → **flood + landslide** | 49% | 0% | 14% | 0% | LOW → **FLOOD_LANDSLIDE** | multi-benefit (+ slope stabilisation) → **sponge network** (+ slope stabilisation) |

// Per-solution "ficha técnica" content for the 27 Rede SCbN POA solutions —
// the CBO-first five-section model decided 2026-07-15:
//   O que é (lives on the catalog entry) · Como funciona · Quanto custa ·
//   Quem precisa dizer sim · Quem cuida depois.
//
// Sourcing: extracted from the deck's own cited sources — GIZ Catálogo de SbN
// para Espaços Livres (2023), CNM Contribuições das SbN (2023), MMA Soluções
// Comunitárias Baseadas na Natureza (2024) — plus Embrapa/ASA program data and
// the researched COUGAR type content. Writing rule (docs/nbs-type-content-model.md):
// plain syntax, full substance — short sentences, real numbers, the actual
// órgão you have to talk to. Porto Alegre institutional facts: drainage = DMAE
// (⚠️ never DEP — extinguished 2017), urban environment = SMAMUS.
//
// Honesty flags: `custoEstimado` / `autorizacaoEstimada` mark fields whose
// figures or agency routing are OUR inference rather than a direct source
// statement — the UI renders a visible "estimado" marker for them. No unmarked
// placeholder ships.

export interface NbsFichaCopy {
  comoFunciona: string;
  quantoCusta: string;
  quemPrecisaDizerSim: string;
  quemCuidaDepois: string;
}

export interface NbsSolutionFicha {
  pt: NbsFichaCopy;
  en: NbsFichaCopy;
  /** Short source strings, e.g. "GIZ Catálogo de SbN p.50-55". */
  sources: string[];
  /** Cost figure is inferred/market-derived, not a direct catalog value. */
  custoEstimado?: boolean;
  /** Agency routing is our Porto Alegre inference, not stated by the source. */
  autorizacaoEstimada?: boolean;
}

export const NBS_SOLUTION_FICHAS: Record<string, NbsSolutionFicha> = {
  // ── Gestão de Águas Pluviais · infiltração ─────────────────────────────
  'jardins-de-chuva': {
    pt: {
      comoFunciona:
        'O jardim de chuva é uma depressão rasa no terreno, forrada com camadas de pedra brita, areia e terra adubada, plantada com espécies que toleram solo encharcado. A água da chuva do telhado, da calçada ou da rua escoa até essa depressão e se infiltra devagar pelo solo, em vez de correr direto para a rua. As raízes das plantas abrem caminhos no solo (canais de infiltração) que ajudam a água a penetrar mais rápido; em até 72 horas, a água some da superfície.',
      quantoCusta:
        'R$ 400–700 por m² (referência GIZ, catálogo de SbN, 2023). Preço varia com o projeto, os materiais e a mão de obra.',
      quemPrecisaDizerSim:
        'Em terreno particular, decide o dono do lote — pode ser construído em mutirão, mas o desenho (camadas de brita, areia, terra, e o teste de infiltração do solo) precisa de um técnico, porque um jardim de chuva mal calculado não drena. Em praça ou parque público, a aprovação é da prefeitura (SMAMUS, responsável pelo ambiente urbano). Se o jardim vai se conectar à rede de drenagem pública, o DMAE também precisa aprovar — é o órgão que cuida da drenagem em Porto Alegre.',
      quemCuidaDepois:
        'Tirar lixo e sedimento acumulado na superfície (recorrente, dá para moradores fazerem), repor mudas que morrem (2–5% do total, logo depois do plantio), e a cada 5–10 anos limpar ou trocar as camadas filtrantes quando entopem (colmatação) e o jardim para de infiltrar. Na prática, quem cuida é a associação de moradores ou a prefeitura, dependendo de quem é o dono do terreno. Se ninguém cuida, o jardim entope, vira poça permanente, e depois de 3–4 dias de água parada vira criadouro de mosquito.',
    },
    en: {
      comoFunciona:
        'A rain garden is a shallow depression in the ground, lined with layers of crushed stone, sand, and enriched soil, planted with species that tolerate wet soil. Rainwater from a roof, sidewalk, or street drains into this depression and infiltrates slowly through the soil instead of running straight into the street. Plant roots open channels in the soil (infiltration channels) that help water soak in faster; within 72 hours, standing water should be gone from the surface.',
      quantoCusta:
        'R$ 400–700 per m² (GIZ SbN catalog reference, 2023). Price depends on the design, materials, and labor.',
      quemPrecisaDizerSim:
        "On private land, the lot owner decides — a mutirão (community work party) can build it, but the design (crushed-stone, sand, and soil layers, plus a soil infiltration test) needs a technician, because a badly calculated rain garden won't drain. On a public square or park, approval comes from the city (SMAMUS, which handles the urban environment). If the garden connects to the public drainage network, DMAE also has to approve — it's the agency that handles drainage in Porto Alegre.",
      quemCuidaDepois:
        'Clear trash and sediment on the surface (recurring, residents can do it), replace dead plants (2–5% of the total, right after planting), and every 5–10 years clean or replace the filter layers once they clog and the garden stops infiltrating. In practice, a residents’ association or the city takes care of it, depending on who owns the land. If nobody does, the garden clogs, turns into a permanent puddle, and after 3–4 days of standing water becomes a mosquito breeding site.',
    },
    sources: ['GIZ Catálogo de SbN para Espaços Livres, p.50-55'],
    autorizacaoEstimada: true,
  },
  'canteiro-pluvial': {
    pt: {
      comoFunciona:
        "Canteiro pluvial é um jardim de chuva compactado num pequeno espaço urbano — geralmente encaixado numa vaga de estacionamento ou num recorte da calçada. Tem as mesmas camadas de brita, areia e terra, mas pode ter paredes laterais de contenção (por isso 'canteiro'). A água da rua ou calçada entra por uma abertura na guia, se infiltra pelas camadas, e o excesso pode sair por um cano de conexão até a rede pública de drenagem.",
      quantoCusta: 'R$ 400–800 por m² (referência GIZ, 2023).',
      quemPrecisaDizerSim:
        'Fica no sistema viário — calçada, vaga de estacionamento — que é espaço público. Por isso precisa de autorização da prefeitura: EPTC (mexe na via e na calçada) e SMAMUS (ambiente urbano). Se tiver cano de conexão com a rede de drenagem pública, o DMAE também precisa aprovar. Mutirão pode fazer a escavação e o plantio, mas o projeto (paredes, tubulação, tipo de solo) precisa de técnico.',
      quemCuidaDepois:
        'Tirar lixo e sedimento (recorrente), repor mudas perdidas (2–5%, logo após plantio), e entre 5–10 anos recuperar as camadas filtrantes quando colmatarem. Como fica na calçada, é fácil de sujar com lixo da rua — o cuidado tende a cair para a prefeitura ou para o comércio/morador vizinho. Sem manutenção, entope, para de drenar, e a água parada vira criadouro de mosquito em poucos dias.',
    },
    en: {
      comoFunciona:
        "A stormwater planter is a rain garden compressed into a small urban space — usually fitted into a parking spot or a cut in the sidewalk. It has the same crushed-stone, sand, and soil layers, but can have retaining side walls (hence 'planter'). Water from the street or sidewalk enters through an opening in the curb, infiltrates through the layers, and any excess can exit through a connecting pipe to the public drainage network.",
      quantoCusta: 'R$ 400–800 per m² (GIZ reference, 2023).',
      quemPrecisaDizerSim:
        'It sits in the road system — sidewalk, parking spot — which is public space. That means city approval: EPTC (roadway/sidewalk work) and SMAMUS (urban environment). If it has a pipe connecting to the public drainage network, DMAE also has to sign off. A mutirão can dig and plant, but the design (walls, piping, soil type) needs a technician.',
      quemCuidaDepois:
        'Clear trash and sediment (recurring), replace lost plants (2–5%, right after planting), and every 5–10 years restore the filter layers once they clog. Because it sits on the sidewalk, street litter builds up easily — upkeep tends to fall to the city or to the neighboring business/resident. Without maintenance, it clogs, stops draining, and standing water becomes a mosquito breeding site within days.',
    },
    sources: ['GIZ Catálogo de SbN para Espaços Livres, p.56-65'],
    autorizacaoEstimada: true,
  },
  biovaletas: {
    pt: {
      comoFunciona:
        'A biovaleta é uma vala rasa e comprida, com laterais em rampa (não paredes retas), plantada com vegetação. Em vez de só acumular água num ponto, ela conduz a água de um lugar a outro — de uma rua até um jardim de chuva, por exemplo — infiltrando parte dela pelo caminho. Em trechos mais inclinados, usa pequenas barreiras dentro da vala para frear a água e evitar erosão.',
      quantoCusta:
        'R$ 200–500 por m² (referência GIZ, 2023) — a faixa mais barata da família, porque é rasa (até 60 cm) e não tem paredes de contenção.',
      quemPrecisaDizerSim:
        'Normalmente fica em canteiro central, estacionamento ou faixa pública estreita — depende de aprovação da prefeitura: EPTC se mexer em via/calçada, SMAMUS para o ambiente urbano, e DMAE se conectar à drenagem pública. Escavação e plantio dá para fazer em mutirão; o cálculo de vazão e a inclinação das barreiras (para não erodir) pedem um técnico.',
      quemCuidaDepois:
        'Reposição de mudas (2–5%, ação pontual), remoção manual de lixo que trava o fluxo (ação recorrente — a mais crítica, porque uma biovaleta entupida não conduz água a lugar nenhum), e recuperação das camadas quando colmatarem. O cuidado recorrente tende a ficar com a prefeitura em vias públicas, ou com a associação de moradores se for interna a um terreno comunitário. Sem manutenção, a água para de circular e forma poças — risco de mosquito depois de 3–4 dias parada.',
    },
    en: {
      comoFunciona:
        "A bioswale is a long, shallow, planted channel with sloped sides (not straight walls). Instead of just holding water in one spot, it carries water from one place to another — say, from a street to a rain garden — while infiltrating part of it along the way. On steeper stretches, small check dams inside the channel slow the water and prevent erosion.",
      quantoCusta:
        "R$ 200–500 per m² (GIZ reference, 2023) — the cheapest band in the family, because it's shallow (up to 60 cm) and has no retaining walls.",
      quemPrecisaDizerSim:
        'Usually sits in a median strip, parking area, or narrow public strip — so it needs city approval: EPTC if it touches the roadway/sidewalk, SMAMUS for the urban environment, and DMAE if it connects to public drainage. Digging and planting can be done in a mutirão; the flow calculations and check-dam slope (to prevent erosion) need a technician.',
      quemCuidaDepois:
        "Replace plants (2–5%, one-off task), manually remove trash blocking the flow (recurring — the critical one, since a clogged bioswale carries water nowhere), and restore the filter layers once they clog. Recurring upkeep tends to fall to the city on public roads, or to the residents' association if it's inside a community lot. Without maintenance, water stops moving and pools — mosquito risk after 3–4 days of standing water.",
    },
    sources: ['GIZ Catálogo de SbN para Espaços Livres, p.67-73'],
    autorizacaoEstimada: true,
  },
  'terracos-de-chuva': {
    pt: {
      comoFunciona:
        'Terraço de chuva é uma série de degraus côncavos construídos num barranco (talude), com paredes de pedra ou gabião (caixa de tela de aço cheia de pedra), preenchidos com camadas filtrantes parecidas com as do jardim de chuva. A ideia vem do terraceamento agrícola chinês: cada degrau segura um pouco de água, reduz a velocidade da enxurrada descendo o morro, e deixa a água infiltrar em vez de arrastar terra.',
      quantoCusta:
        'Depende da estrutura: parede de pedra argamassada custa R$ 250 por m², gabião entre R$ 250–350 por m², e o preenchimento com filtros e plantas soma mais R$ 375–800 por m² (referência GIZ, 2023). Num orçamento fechado, a soma passa facilmente de R$ 600–1.000 por m².',
      quemPrecisaDizerSim:
        'Como mexe na estabilidade de um barranco, tem risco técnico alto — o catálogo GIZ recomenda estudo geotécnico do solo antes de decidir o material da parede. Em terreno particular, o dono decide mas precisa de engenheiro ou técnico especializado (não dá para fazer só em mutirão, por risco de deslizamento). Em talude público, a aprovação é da prefeitura, com SMAMUS pelo ambiente urbano e possivelmente Defesa Civil pela estabilidade da encosta; se drenar para o sistema público, o DMAE também entra.',
      quemCuidaDepois:
        'Depois de chuva forte, checar se os extravasores (saídas de emergência de água) e as biovaletas conectadas estão funcionando; checar periodicamente se a parede de pedra ou gabião tem dano estrutural e reforçar antes que vire deslizamento; tirar lixo que trava o fluxo manualmente. Dado o risco estrutural, essa manutenção não pode ficar só com moradores — precisa de acompanhamento técnico ou da prefeitura.',
    },
    en: {
      comoFunciona:
        "A rain terrace is a series of concave steps built into a slope, with stone or gabion walls (wire cages filled with rock), filled with filter layers similar to a rain garden's. The idea comes from Chinese agricultural terracing: each step holds back some water, slows the runoff coming down the hill, and lets water infiltrate instead of carrying soil away.",
      quantoCusta:
        'Depends on the wall structure: mortared stone costs R$ 250 per m², gabion between R$ 250–350 per m², and the filter/planting fill adds another R$ 375–800 per m² (GIZ reference, 2023). On a full build, the total easily passes R$ 600–1,000 per m².',
      quemPrecisaDizerSim:
        'Because it touches slope stability, the technical risk is high — the GIZ catalog recommends a geotechnical soil study before choosing the wall material. On private land, the owner decides but needs an engineer or specialized technician (not a pure mutirão job, given landslide risk). On a public slope, approval comes from the city, with SMAMUS for the urban environment and likely Defesa Civil for slope stability; if it drains into the public system, DMAE is involved too.',
      quemCuidaDepois:
        "After heavy rain, check that overflow outlets and any connected bioswales are working; periodically check the stone or gabion wall for structural damage and reinforce it before it turns into a landslide; manually clear trash blocking the flow. Given the structural risk, this upkeep can't rest on residents alone — it needs technical follow-up or the city.",
    },
    sources: ['GIZ Catálogo de SbN para Espaços Livres, p.76-81'],
    autorizacaoEstimada: true,
  },
  'escada-hidraulica-vegetada': {
    pt: {
      comoFunciona:
        'A escada hidráulica vegetada é uma sequência de degraus construídos num trecho muito inclinado (acima de 5% de declive), geralmente com gabiões, para a água descer em degraus em vez de escorrer direto pelo barranco. Cada degrau quebra a força da água (dissipa energia) e, quando plantado, a vegetação aumenta o atrito da superfície e filtra um pouco a água que passa. Serve para levar a água de um jardim de chuva ou canteiro pluvial lá em cima até um ponto de saída lá embaixo, sem erodir o caminho.',
      quantoCusta:
        'R$ 600–1.200 por m² (referência GIZ, 2023) — das mais caras da família, porque é obra estrutural (gabião, escavação com maquinário), não só paisagismo.',
      quemPrecisaDizerSim:
        'Envolve cálculo hidráulico e estrutural — o catálogo GIZ pede as mesmas normas técnicas de uma escada hidráulica convencional. Não é projeto de mutirão puro: precisa de técnico ou engenheiro para o dimensionamento, mesmo que a execução (colocar pedra no gabião, plantar) seja feita em mutirão depois. Em terreno público, a aprovação é da prefeitura — SMAMUS pelo ambiente urbano, EPTC se mexer em via — e o DMAE entra se a escada deságua na rede pública de drenagem.',
      quemCuidaDepois:
        'Checar dano nas pedras ou gabiões e reforçar a estrutura antes que vire deslizamento (ação recorrente), tirar manualmente lixo que trava o fluxo (ação recorrente), repor mudas perdidas (2–5%, ação pontual). Como é estrutura, a manutenção pesada tende a ficar com a prefeitura ou com um parceiro técnico, não só com moradores. Sem manutenção: risco de erosão e dano estrutural, além de poças formando degrau a degrau.',
    },
    en: {
      comoFunciona:
        "A vegetated hydraulic stairway is a series of steps built on a very steep stretch (over 5% slope), usually with gabions, so water descends in steps instead of running straight down the bank. Each step breaks the water's force (dissipates energy), and when planted, the vegetation increases surface friction and filters the water passing through a bit. It carries water from a rain garden or stormwater planter above down to an outlet point below, without eroding the path.",
      quantoCusta:
        "R$ 600–1,200 per m² (GIZ reference, 2023) — among the most expensive in the family, because it's structural work (gabion, machine excavation), not just landscaping.",
      quemPrecisaDizerSim:
        'Involves hydraulic and structural calculations — the GIZ catalog says to follow the same technical standards as a conventional hydraulic stairway. Not a pure mutirão project: needs a technician or engineer for sizing, even if the build itself (placing rock in the gabion, planting) is done by a mutirão afterward. On public land, approval comes from the city — SMAMUS for the urban environment, EPTC if it touches the roadway — and DMAE if the stairway drains into the public system.',
      quemCuidaDepois:
        'Check the stone or gabions for damage and reinforce the structure before it becomes a landslide (recurring), manually clear trash blocking the flow (recurring), replace lost plants (2–5%, one-off). Since it’s a structure, heavy maintenance tends to fall to the city or a technical partner, not just residents. Without maintenance: erosion and structural damage risk, plus puddles forming step by step.',
    },
    sources: ['GIZ Catálogo de SbN para Espaços Livres, p.81-86'],
    autorizacaoEstimada: true,
  },
  'pavimentos-permeaveis': {
    pt: {
      comoFunciona:
        'O pavimento permeável — piso drenante, bloco intertravado vazado, ou concreto/asfalto poroso — tem uma estrutura porosa que deixa a água da chuva passar direto pelo piso até uma camada de brita por baixo, em vez de escorrer para a rua. Dali, a água se infiltra devagar no solo ou vai para um dreno. Segundo o catálogo CNM, cerca de 95% da água que cai sobre um piso desse tipo bem executado é absorvida em vez de escoar pela superfície.',
      quantoCusta:
        'R$ 220–480 por m² instalado é a faixa de mercado geral para piso intertravado drenante no Brasil (referência de fornecedores, 2026). Para comparar: concreto ou asfalto comum sai por R$ 140–300 por m² — o permeável custa mais na hora de construir, mas evita obra de drenagem à parte.',
      quemPrecisaDizerSim:
        'Em quintal ou estacionamento particular, decide o dono do lote, e a instalação deve ficar com equipe experiente (base mal compactada entope o piso rápido). Em calçada ou rua, é espaço público: precisa de autorização da EPTC (mexe na via) e da SMAMUS (ambiente urbano). Se o piso for parte de um projeto de drenagem que deságua na rede pública, o DMAE também aprova.',
      quemCuidaDepois:
        'Precisa de limpeza periódica — varrer ou aspirar a superfície para tirar terra e folha que entopem os poros, e de tempos em tempos lavar com jato de água para desentupir de vez. Em espaço público, essa limpeza tende a ficar com a prefeitura; em terreno privado, com o dono ou condomínio. Se ninguém limpa, o piso entope e vira, na prática, um piso comum — perde a função de infiltração, mas não forma poça, então o risco de mosquito é menor que nas outras soluções.',
    },
    en: {
      comoFunciona:
        'Permeable pavement — porous pavers, perforated interlocking blocks, or porous concrete/asphalt — has a porous structure that lets rainwater pass straight through the surface into a gravel layer underneath, instead of running off into the street. From there, water infiltrates slowly into the soil or reaches a drain. According to the CNM catalog, about 95% of the water hitting a well-built permeable surface is absorbed instead of running off.',
      quantoCusta:
        'R$ 220–480 per m² installed is the general market range for permeable interlocking pavers in Brazil (supplier reference, 2026). For comparison: regular concrete or asphalt runs R$ 140–300 per m² — permeable costs more upfront but avoids a separate drainage project.',
      quemPrecisaDizerSim:
        'In a private yard or parking lot, the lot owner decides, and installation should go to an experienced crew (a poorly compacted base clogs the pavement fast). On a sidewalk or street, it’s public space: needs approval from EPTC (roadway work) and SMAMUS (urban environment). If the pavement is part of a drainage project discharging into the public network, DMAE also has to approve.',
      quemCuidaDepois:
        'Needs periodic cleaning — sweep or vacuum the surface to remove dirt and leaves clogging the pores, and every so often pressure-wash to fully unclog it. In public space, this cleaning tends to fall to the city; on private land, to the owner or condo association. If nobody cleans it, the pavement clogs and effectively becomes a regular pavement — it loses its infiltration function, but doesn’t pool water, so mosquito risk is lower than with the other solutions.',
    },
    sources: [
      'CNM — Contribuições das SbN para a Gestão Municipal, p.18-19',
      'Preços de mercado de piso intertravado drenante no Brasil, 2026',
    ],
    custoEstimado: true,
    autorizacaoEstimada: true,
  },

  // ── Gestão de Águas Pluviais · retenção e tratamento ───────────────────
  'bacia-de-retencao': {
    pt: {
      comoFunciona:
        'Uma bacia de retenção é um lago artificial permanente que fica no caminho da água da chuva, a jusante da bacia hidrográfica. A água entra, fica parada — o suficiente para a sujeira decantar no fundo — e sai devagar por um vertedouro. Em chuva forte, um extravasor de segurança escoa o excesso sem que a estrutura transborde.',
      quantoCusta:
        'R$ 700/m² de estrutura + R$ 300/m² de paisagismo e equipamentos públicos (GIZ Catálogo 2023, com base em dados FCTH/SIURB-PMSP, 2022). Uma bacia de 100 m² (tamanho mínimo recomendado) já fica perto de R$ 100 mil.',
      quemPrecisaDizerSim:
        'Bacia de retenção de verdade precisa de mais de 100 m² e de estudo hidrológico feito por engenheiro — não é obra de mutirão. Em Porto Alegre, quem autoriza é o DMAE (drenagem e corpos d’água) e, por mexer com curso d’água ou macrodrenagem, entra também licenciamento ambiental municipal pela SMAMUS.',
      quemCuidaDepois:
        'Alguém tem que limpar sedimento e lixo do fundo (desassoreamento), cuidar da vegetação da margem e manter desobstruídas as entradas e saídas de água — na prática, isso é trabalho de prefeitura (DMAE/secretaria de obras), pelo porte da estrutura. Falha honesta: se a limpeza atrasa, a água parada vira criadouro de mosquito.',
    },
    en: {
      comoFunciona:
        'A retention basin is a permanent artificial pond sitting downstream in the drainage basin, in the path of stormwater. Water flows in and sits still — long enough for silt to settle to the bottom — then drains slowly through a spillway. In heavy rain, a safety overflow lets the excess out without the structure flooding over.',
      quantoCusta:
        'R$ 700/m² for the structure plus R$ 300/m² for landscaping and public fixtures (GIZ Catálogo 2023, based on FCTH/SIURB-PMSP data, 2022). A 100 m² basin — the recommended minimum size — already runs close to R$ 100,000.',
      quemPrecisaDizerSim:
        'A real retention basin needs over 100 m² and a hydrological study by an engineer — this isn’t community-build work. In Porto Alegre, DMAE (drainage and water bodies) has to sign off, and because it touches a watercourse or main drainage, municipal environmental licensing through SMAMUS also applies.',
      quemCuidaDepois:
        'Someone has to clear sediment and trash from the bottom, maintain the bank vegetation, and keep the inlets and outlets clear — in practice this falls to the city (DMAE/public works), given the scale of the structure. Honest failure mode: if cleaning falls behind, standing water becomes a mosquito breeding ground.',
    },
    sources: ['GIZ Catálogo de SbN p.98-103', 'FCTH/SIURB-PMSP 2022 (base de custo, citada no GIZ)'],
    autorizacaoEstimada: true,
  },
  'wetland-construido': {
    pt: {
      comoFunciona:
        'Wetland construído é um brejo artificial que imita um pântano natural para tratar água suja — esgoto, água de chuva poluída ou efluente de banheiro público. A água passa por uma camada de brita, areia e plantas aquáticas (macrófitas); as raízes e o biofilme de micro-organismos que vive nelas absorvem nutrientes e poluentes até a água sair mais limpa.',
      quantoCusta:
        'R$ 1.200 a R$ 2.000 por m² de tanque (GIZ Catálogo, 2023, variando conforme área e configuração do projeto).',
      quemPrecisaDizerSim:
        'É tratamento de esgoto — mesmo pequeno, precisa de projeto de engenheiro/arquiteto com estudo hidráulico, e o efluente tratado tem que seguir a Resolução CONAMA 357/2005. Em Porto Alegre, quem autoriza é o DMAE (saneamento e drenagem da cidade) e, se for perto de curso d’água, licenciamento ambiental municipal pela SMAMUS.',
      quemCuidaDepois:
        'Precisa de poda periódica das macrófitas, controle de espécies invasoras, limpeza do gradeamento de entrada (onde prende lixo grosso) e replantio nos primeiros meses, até a vegetação se firmar. Falha honesta: sem manutenção, o sistema entope (colmatação) e para de filtrar. Melhor com equipe técnica ou parceria com universidade/ONG especializada — não dá para depender só de mutirão.',
    },
    en: {
      comoFunciona:
        'A constructed wetland is an artificial marsh that mimics a natural swamp to treat dirty water — sewage, polluted stormwater, or public restroom effluent. Water flows through a layer of gravel, sand, and aquatic plants (macrophytes); the roots and the biofilm of microorganisms living on them absorb nutrients and pollutants until the water comes out cleaner.',
      quantoCusta:
        'R$ 1,200 to R$ 2,000 per m² of tank (GIZ Catálogo, 2023, varying with area and project configuration).',
      quemPrecisaDizerSim:
        'This is sewage treatment — even at small scale, it needs an engineer/architect’s design with a hydraulic study, and the treated effluent must meet CONAMA Resolution 357/2005. In Porto Alegre, DMAE (the city’s sanitation and drainage utility) has to authorize it, and if it’s near a watercourse, municipal environmental licensing through SMAMUS applies too.',
      quemCuidaDepois:
        'Needs periodic pruning of the macrophytes, control of invasive species, cleaning of the inlet screen (where coarse debris collects), and replanting in the first months until vegetation establishes. Honest failure mode: without maintenance, the system clogs and stops filtering. Best run with technical staff or a partnership with a university/specialized NGO — this can’t rely on volunteer labor alone.',
    },
    sources: ['GIZ Catálogo de SbN p.110-123'],
    autorizacaoEstimada: true,
  },
  'ilhas-filtrantes-flutuantes': {
    pt: {
      comoFunciona:
        'Uma ilha filtrante flutuante é uma balsa com plantas que boia sobre um lago ou lagoa. As raízes ficam soltas na água, sem tocar o fundo, e formam um tapete de micro-organismos — o biofilme — que absorve nutrientes em excesso e ajuda a reduzir sedimentos e o crescimento de algas.',
      quantoCusta: 'R$ 200 a R$ 700 por m² de ilha (GIZ Catálogo, 2023, conforme material e fornecedor).',
      quemPrecisaDizerSim:
        'Se o lago é público, quem administra o corpo d’água tem que autorizar — em Porto Alegre, normalmente o DMAE, e a SMAMUS se for praça ou parque municipal. Não exige compra de terreno nem obra pesada, o que facilita fazer via parceria técnica sem licenciamento ambiental completo — mas o consentimento formal de quem gere o lago é obrigatório.',
      quemCuidaDepois:
        'Poda periódica das plantas, controle de espécies invasoras e checagem da ancoragem — vento e correnteza empurram a ilha para a margem, onde ela enraíza e perde a função. Dá para fazer de barco ou puxando a ilha para a beira, sem mergulho. Falha honesta: se ninguém podar, a planta morre, apodrece e devolve ao lago os nutrientes que tinha absorvido.',
    },
    en: {
      comoFunciona:
        'A floating filter island is a raft of plants floating on a lake or pond. The roots hang loose in the water without touching the bottom, forming a mat of microorganisms — biofilm — that absorbs excess nutrients and helps cut down sediment and algae growth.',
      quantoCusta: 'R$ 200 to R$ 700 per m² of island (GIZ Catálogo, 2023, depending on materials and supplier).',
      quemPrecisaDizerSim:
        'If the lake is public, whoever manages that water body has to approve it — in Porto Alegre, usually DMAE, plus SMAMUS if it’s a municipal square or park. It doesn’t require buying land or heavy construction, which makes a technical-partnership route without full environmental licensing feasible — but formal consent from the lake’s manager is mandatory.',
      quemCuidaDepois:
        'Periodic pruning, control of invasive species, and checking the anchoring — wind and current push the island toward the shore, where it roots and loses its function. Maintenance can be done by boat or by pulling the island to shore, no diving required. Honest failure mode: if no one prunes it, the plant dies, rots, and releases the nutrients it had absorbed back into the lake.',
    },
    sources: ['GIZ Catálogo de SbN p.122-129'],
    autorizacaoEstimada: true,
  },
  barraginha: {
    pt: {
      comoFunciona:
        'Barraginha é uma pequena bacia redonda cavada no chão com trator — até 20 m de diâmetro, rampas suaves — posicionada no caminho da enxurrada, como beira de rua ou base de encosta. Ela recolhe a água de chuva que escorre pela superfície e deixa infiltrar devagar no solo entre uma chuva e outra, recarregando o lençol freático em vez de mandar tudo direto pra rede de drenagem.',
      quantoCusta:
        'Um lote de 100 barraginhas com mobilização comunitária custa cerca de R$ 20.000 alugando máquina, ou R$ 7.000 se a prefeitura cede o trator (Embrapa Milho e Sorgo, Projeto Barraginhas) — algo entre R$ 70 e R$ 200 por barraginha. Valor histórico do projeto, sem data de atualização confirmada; pode estar defasado.',
      quemPrecisaDizerSim:
        'Depende de terraplanagem com trator, então precisa de autorização de uso do terreno (público ou do dono do lote). Em área urbana de Porto Alegre, isso passa pelo DMAE, por lidar com escoamento e infiltração de água, e pela SMAMUS. É maquinário pesado — não dá para fazer só no mutirão — mas a escolha do local e o acompanhamento podem ser feitos junto com a comunidade e um técnico.',
      quemCuidaDepois:
        'Limpeza periódica do sedimento acumulado no fundo e checagem se a rampa continua suave, porque chuva forte erode as bordas. Falha honesta: a barraginha foi pensada para infiltrar água de chuva limpa em contexto rural; num terreno urbano com esgoto clandestino ou lixo, ela vira poço de água parada e sujeira em vez de recarregar o lençol freático.',
    },
    en: {
      comoFunciona:
        'A barraginha is a small round basin dug into the ground with a tractor — up to 20 m across, with gentle slopes — placed in the path of runoff, like alongside a road or at the base of a slope. It catches surface rainwater and lets it soak slowly into the ground between rains, recharging the water table instead of sending everything straight into the drainage network.',
      quantoCusta:
        'A batch of 100 barraginhas with community mobilization costs about R$ 20,000 renting machinery, or R$ 7,000 if the city provides the tractor (Embrapa Milho e Sorgo, Projeto Barraginhas) — roughly R$ 70–200 per basin. Historical program figure with no confirmed update date; may be outdated.',
      quemPrecisaDizerSim:
        'It requires tractor earthmoving, so it needs authorization to use the land (public or the lot owner’s). In urban Porto Alegre, that means DMAE, since it deals with runoff and infiltration, and SMAMUS. It’s heavy machinery work — not something a community can do alone — but site selection and follow-up can be done together with residents and a technician.',
      quemCuidaDepois:
        'Periodic clearing of sediment at the bottom, and checking that the slope stays gentle, since heavy rain erodes the edges. Honest failure mode: the barraginha was designed to infiltrate clean rainwater in a rural setting; on urban land with illegal sewage connections or trash, it turns into a pool of stagnant, dirty water instead of recharging the water table.',
    },
    sources: ['Embrapa Milho e Sorgo — Projeto Barraginhas / ABC da Agricultura Familiar, 2009'],
    custoEstimado: true,
    autorizacaoEstimada: true,
  },
  'captacao-agua-da-chuva': {
    pt: {
      comoFunciona:
        'A água de chuva que cai no telhado escorre pela calha até um filtro que retém folhas e sujeira grossa, e daí vai para a cisterna — um reservatório fechado, muitas vezes semienterrado. De lá, uma bomba leva a água até uma caixa d’água elevada, de onde ela é usada em descarga, limpeza e irrigação (não é água potável sem tratamento extra).',
      quantoCusta:
        'Cisterna de placas de 16 mil litros, modelo padrão do Programa Cisternas: R$ 4.500 quando construída em mutirão com mão de obra capacitada pelo programa (ASA/P1MC); R$ 8.000 a R$ 10.500 quando contratada por edital público (MDS, 2024). Para reservatórios urbanos menores, de 500 a 5.000 litros em polietileno pronto, o preço fica entre R$ 1 e R$ 4 por litro de capacidade (estimativa de mercado).',
      quemPrecisaDizerSim:
        'Captar água de telhado e guardar numa cisterna doméstica ou comunitária não exige licenciamento ambiental — é uma instalação predial simples. Se o uso for coletivo, numa sede comunitária ou escola, o recomendado é conversar com a Vigilância Sanitária municipal sobre o desenho do sistema (água não potável) e, se a cisterna estiver ligada à rede pluvial do terreno, avisar o DMAE. É a solução mais fácil de aprovar da família.',
      quemCuidaDepois:
        'Limpeza da calha e do filtro antes de cada estação chuvosa, porque folhas entopem; limpeza da cisterna a cada 6 a 12 meses para tirar sedimento do fundo; e a cisterna precisa ficar sempre bem tampada, senão vira criadouro de mosquito da dengue. É a manutenção mais simples da família — pode ficar com a própria família ou o zelador do espaço comunitário.',
    },
    en: {
      comoFunciona:
        'Rainwater falling on the roof runs through the gutter to a filter that catches leaves and coarse debris, then flows into the cistern — a closed, often partly buried storage tank. From there, a pump moves the water to an elevated tank, from which it’s used for flushing toilets, cleaning, and irrigation (it’s not drinking water without extra treatment).',
      quantoCusta:
        'A 16,000-liter concrete-panel cistern, the standard Programa Cisternas model: R$ 4,500 when self-built through community labor trained by the program (ASA/P1MC); R$ 8,000 to R$ 10,500 when contracted through a public tender (MDS, 2024). For smaller urban tanks, 500 to 5,000 liters in ready-made polyethylene, prices run R$ 1 to R$ 4 per liter of capacity (market estimate).',
      quemPrecisaDizerSim:
        'Catching roof runoff and storing it in a home or community cistern doesn’t require environmental licensing — it’s a simple building installation. For shared use at a community center or school, it’s advisable to check with the municipal health surveillance office about the (non-potable) system design, and if the cistern connects to the property’s stormwater line, notify DMAE. This is the easiest solution in the family to get approved.',
      quemCuidaDepois:
        'Clean the gutter and filter before each rainy season, since leaves clog them; clean the cistern every 6 to 12 months to remove bottom sediment; and keep the cistern always well sealed, or it becomes a dengue mosquito breeding site. It’s the simplest maintenance in the family — a household or the community space’s caretaker can handle it.',
    },
    sources: [
      'MMA — Soluções Comunitárias Baseadas na Natureza, 2024, p.54',
      'ASA Brasil / Programa Cisternas — IN SESAN/MDS nº 9/2023',
      'MDS — contratos públicos de referência do Programa Cisternas, 2024',
    ],
    custoEstimado: true,
    autorizacaoEstimada: true,
  },

  // ── Infraestrutura Verde Urbana ─────────────────────────────────────────
  'parques-e-florestas-urbanas': {
    pt: {
      comoFunciona:
        'Um terreno vira mata fechada ou parque com copa densa. As árvores dão sombra, esfriam o ar por evapotranspiração — a planta solta vapor d’água e baixa a temperatura ao redor — e a raiz ajuda o chão a beber a chuva. Num terreno pequeno, o método Miyawaki planta de 3 a 5 mudas nativas por m², bem juntas, pra fechar a copa em 2 a 3 anos.',
      quantoCusta:
        'R$ 100 a R$ 230 por m², já com os 2 anos de rega, capina e controle de formiga. Uma floresta de 300 m² com 900 mudas fica em R$ 30 mil a R$ 70 mil. Parque maior, com caminho, banco e iluminação, custa mais — depende do projeto.',
      quemPrecisaDizerSim:
        'O terreno tem que ser praça ou área verde pública, e passa pelo Termo de Adoção — a SMAMUS escolhe as espécies e o local. Se a ideia é reformar uma praça já existente, entra o programa Adote uma Praça, que formaliza a parceria entre associação de bairro e prefeitura pra cuidar do espaço.',
      quemCuidaDepois:
        'Dois anos de rega, capina e controle de formiga cortadeira — ela é a inimiga número 1 da muda nova; porta-isca corta até 80% do custo do controle. Depois disso a mata se sustenta sozinha. Sem esse cuidado inicial, vira mato de novo. A prefeitura corta a grama ao redor, mas não rega árvore nem cuida do miolo da floresta — isso é tarefa da comunidade ou da associação que adotou o espaço.',
    },
    en: {
      comoFunciona:
        'A vacant lot becomes closed forest or a park with a dense canopy. Trees give shade, cool the air through evapotranspiration — plants release water vapour and lower the surrounding temperature — and their roots help the ground drink the rain. On a small plot, the Miyawaki method plants 3 to 5 native saplings per m², packed close, to close the canopy in 2 to 3 years.',
      quantoCusta:
        'R$ 100 to R$ 230 per m², including two years of watering, weeding and ant control. A 300 m² forest with 900 saplings runs R$ 30,000 to R$ 70,000. A larger park with paths, benches and lighting costs more — it depends on the design.',
      quemPrecisaDizerSim:
        'The land has to be a public square or green area, and it goes through the Termo de Adoção — SMAMUS chooses the species and the site. If the idea is to renovate an existing square, the Adote uma Praça program formalises the partnership between a neighbourhood association and the city to look after the space.',
      quemCuidaDepois:
        'Two years of watering, weeding and leaf-cutter ant control — ants are enemy number one for young saplings; bait stations cut control costs by up to 80%. After that, the forest sustains itself. Without that initial care, it reverts to scrub. The council mows the grass around it but doesn’t water trees or tend the forest core — that’s the community’s or the adopting association’s job.',
    },
    sources: [
      'conteúdo COUGAR (floresta urbana)',
      'GIZ Catálogo SbN Espaços Livres',
      'MMA Soluções Comunitárias, p.50',
    ],
    custoEstimado: true,
  },
  'teto-verde': {
    pt: {
      comoFunciona:
        'Uma camada fina de planta cobre a laje. A planta segura parte da chuva antes dela descer pro cano, e esfria a casa por baixo — menos ventilador, menos ar-condicionado. Não é horta: no método mais barato (hidropônico), uma manta de bidim fica sobre a telha e nem precisa de terra.',
      quantoCusta:
        'Método bidim: cerca de R$ 5 por m² de material — uns R$ 150 a R$ 300 no total pra uma laje pequena. Com terra e manta impermeabilizante: R$ 1,5 mil a R$ 6 mil. Sistema comprado pronto: R$ 150 a R$ 350 por m². Referência real: o Teto Verde Favela, no Rio, já cobriu mais de 20 lajes a R$ 5 o metro, sem dinheiro de fora.',
      quemPrecisaDizerSim:
        'É a sua própria laje — não precisa de licença pro método bidim. Se for encher de terra, sim: peso a mais pode rachar a estrutura, e aí precisa de ART ou RRT de um engenheiro atestando que a laje aguenta. Regra prática: laje de casa comum aguenta uns 100 kg/m², e teto verde com terra molhada pesa de 70 a 170 kg/m² — quase o limite.',
      quemCuidaDepois:
        'Tirar mato uma vez por mês no verão e manter o ralo limpo — se entupir, empoça e pode voltar a infiltrar pela telha. Bônus em Porto Alegre: o IPTU Verde (LC 974/2023) dá de 3% a 10% de desconto no IPTU pra quem tem teto verde cadastrado. Falha mais comum: impermeabilização mal feita — a água entra e a laje mofa por dentro, ou terra encharcada demais racha a estrutura.',
    },
    en: {
      comoFunciona:
        'A thin layer of plants covers the roof slab. The plants hold back part of the rain before it hits the drainpipe, and cool the house underneath — less fan, less air conditioning. It’s not a vegetable garden: in the cheapest method (hydroponic), a bidim mat sits over the tiles and needs no soil at all.',
      quantoCusta:
        'Bidim method: about R$ 5 per m² in materials — roughly R$ 150 to R$ 300 total for a small slab. With soil and a waterproof membrane: R$ 1,500 to R$ 6,000. A ready-made commercial system: R$ 150 to R$ 350 per m². Real reference: Teto Verde Favela, in Rio, has already covered more than 20 roofs at R$ 5 per metre, with no outside funding.',
      quemPrecisaDizerSim:
        'It’s your own roof slab — no permit needed for the bidim method. Go with soil, and you do: the extra weight can crack the structure, so you need an engineer’s ART or RRT confirming the slab can take it. Rule of thumb: an ordinary house slab carries about 100 kg/m², and a soil-based green roof weighs 70 to 170 kg/m² when wet — close to the limit.',
      quemCuidaDepois:
        'Weed once a month in summer and keep the drain clear — if it clogs, water pools and can seep back through the roof. Bonus in Porto Alegre: the IPTU Verde (LC 974/2023) gives a 3–10% property-tax discount for a registered green roof. Most common failure: bad waterproofing — water seeps in and the slab moulds from below, or saturated soil gets too heavy and cracks the structure.',
    },
    sources: [
      'conteúdo COUGAR (teto verde)',
      'CNM — Contribuições das SbN para a Gestão Municipal',
      'LC 974/2023 (IPTU Verde, Porto Alegre)',
    ],
  },
  'corredores-verdes': {
    pt: {
      comoFunciona:
        'Uma fileira contínua de árvores liga uma área verde a outra. A copa faz sombra e esfria a rua por evapotranspiração — de 2 a 8 graus a menos embaixo da árvore. A linha de verde também vira corredor ecológico: passarinho, abelha e semente atravessam de um lado a outro.',
      quantoCusta:
        'R$ 250 a R$ 500 por árvore já plantada, com berço, tutor e protetor de metal até o 3º ano. O Viveiro Municipal pode doar a muda de graça — aí o custo é só mão de obra e proteção.',
      quemPrecisaDizerSim:
        "A rua é pública — plantar sem autorização da SMAMUS é proibido. A associação de bairro pede pela via 'Instituições'. Pedido feito depois de agosto costuma só sair em maio do ano seguinte, porque a época certa de plantio é maio a agosto. Embaixo de fiação, só entra árvore pequena, até 6 m.",
      quemCuidaDepois:
        'Rega semanal nos 2 primeiros verões — a SMAMUS não rega árvore de rua, isso fica com a comunidade. Mesmo assim, 25% das mudas morrem nos primeiros 6 meses e mais 15% no segundo ano em Porto Alegre; vandalismo leva outros 20% no primeiro ano. Árvore grande embaixo do fio vira poda feia todo ano, e a roçadeira da prefeitura decepa muda nova se não tiver proteção.',
    },
    en: {
      comoFunciona:
        'A continuous row of trees links one green area to another. The canopy shades and cools the street through evapotranspiration — 2 to 8 degrees cooler under the trees. The green line also works as an ecological corridor: birds, bees and seeds move from one side to the other.',
      quantoCusta:
        'R$ 250 to R$ 500 per planted tree, including the pit, stake and metal guard through year three. The Viveiro Municipal may donate the sapling for free — then the cost is just labour and protection.',
      quemPrecisaDizerSim:
        "The street is public — planting without SMAMUS authorisation is illegal. Associations apply through the 'Instituições' route. Requests filed after August are usually only served the following May, because the right planting window is May to August. Under power lines, only small species up to 6 m are allowed.",
      quemCuidaDepois:
        'Weekly watering through the first two summers — SMAMUS doesn’t water street trees, that’s on the community. Even so, 25% of saplings die in Porto Alegre within the first six months, and another 15% in year two; vandalism takes a further 20% in year one. A large tree under a power line means an ugly pruning every year, and the council’s mowing crew decapitates unprotected saplings.',
    },
    sources: ['conteúdo COUGAR (corredor verde)', 'GIZ Catálogo SbN Espaços Livres'],
    custoEstimado: true,
  },
  'parques-lineares': {
    pt: {
      comoFunciona:
        'Uma faixa verde contínua acompanha um córrego ou arroio, ligando dois pontos da cidade. Dentro dela cabem várias soluções — biovaleta, mata ciliar, caminho — que seguram parte da enchente antes que ela chegue nas casas e ainda servem de área de lazer no dia a dia. É a soma de um corredor verde com uma bacia de detenção, mas ao longo de um curso d’água, não de uma rua.',
      quantoCusta:
        'Não existe um preço fechado — depende do que a faixa já tem pronto e de quantos dispositivos entram nela. Como referência de escala: o Parque Linear do Córrego Bandeirantes, em Campinas, cobre 22,4 hectares e faz parte de um plano municipal com 49 trechos previstos — é obra de prefeitura, não de mutirão. Pra uma faixa pequena de bairro, use como piso os valores de bacia aberta (R$ 60 mil a R$ 150 mil pra 500 m²) mais mata ciliar.',
      quemPrecisaDizerSim:
        'Quase sempre passa por SMAMUS, e se a faixa entra em Área de Proteção Permanente (APP) — o que é comum ao longo de um arroio — o licenciamento pode subir pra SEMA-RS. Drenagem e ponto de saída da água são analisados pelo DMAE. Na prática, o papel realista de uma associação de bairro aqui não é construir o parque inteiro: é pedir a inclusão do trecho no plano diretor, participar da consulta, e depois adotar um pedaço já pronto pelo Termo de Adoção.',
      quemCuidaDepois:
        'Roçada, retirada de lixo e desassoreamento da entrada de água pelo menos 1 vez por ano — igual a uma bacia de detenção. Trecho abandonado vira depósito de lixo entre uma chuva e outra, que é o jeito mais comum dele morrer. Mata ciliar recém-plantada precisa de 2 anos de rega e controle de formiga, como qualquer plantio novo.',
    },
    en: {
      comoFunciona:
        'A continuous green strip follows a stream or creek, linking two points in the city. Several solutions fit inside it — bioswale, riparian buffer, a path — that hold back part of a flood before it reaches houses, while doubling as everyday leisure space. It’s a green corridor combined with a detention basin, but running along a watercourse instead of a street.',
      quantoCusta:
        'There’s no fixed price — it depends on what the strip already has and how many devices go into it. For scale: the Parque Linear do Córrego Bandeirantes, in Campinas, covers 22.4 hectares and is part of a municipal plan with 49 planned stretches — this is city-built infrastructure, not a mutirão. For a small neighbourhood strip, use the open-basin figures as a floor (R$ 60,000 to R$ 150,000 for 500 m²) plus riparian planting.',
      quemPrecisaDizerSim:
        'It almost always goes through SMAMUS, and if the strip sits inside a Permanent Protection Area (APP) — common along a stream — licensing can escalate to SEMA-RS. Drainage and the water outlet are reviewed by DMAE. In practice, a neighbourhood association’s realistic role here isn’t building the whole park: it’s requesting the stretch be included in the master plan, taking part in consultation, and later adopting a finished section through the Termo de Adoção.',
      quemCuidaDepois:
        'Mowing, litter removal and de-silting the water inlet at least once a year — same as a detention basin. An abandoned stretch becomes a dump between storms, which is the most common way it dies. Newly planted riparian vegetation needs two years of watering and ant control, like any new planting.',
    },
    sources: [
      'GIZ Catálogo SbN — Parque Linear do Córrego Bandeirantes, Campinas',
      'conteúdo COUGAR (corredor verde, parque alagável)',
    ],
    custoEstimado: true,
    autorizacaoEstimada: true,
  },
  'escola-verde': {
    pt: {
      comoFunciona:
        'O pátio da escola troca parte do cimento por terra, planta e sombra. Menos área impermeável significa mais chão bebendo a chuva em vez de alagar o pátio, e a copa das árvores esfria o espaço onde as crianças brincam. Em Salvador, uma escola no Mata Escura tinha só 3% de solo livre pra chuva entrar — o projeto Escola Verde com Afeto criou um jardim de chuva justamente pra reverter isso.',
      quantoCusta:
        'A cartilha do MMA não fecha número — o custo real depende do tamanho do pátio e de quanto cimento sai. Como piso, use os valores dos componentes: um jardim de chuva de 10 a 15 m² fica em R$ 4 mil a R$ 12 mil em material, e cada árvore plantada com berço e proteção sai R$ 250 a R$ 500. Um pátio pequeno com os dois fica na casa dos R$ 5 mil a R$ 20 mil.',
      quemPrecisaDizerSim:
        'Escola pública passa pela direção e pela mantenedora — SMED se for municipal, Seduc-RS se for estadual. O projeto pede uma equipe formada por escola, arquitetura/paisagismo e alguém com noção de botânica, porque a escolha das espécies e o desenho ficam sob responsabilidade técnica. É comum envolver os alunos desde o início: no CoCriança (Campinas), a escuta com as crianças levou 11 meses, em 6 etapas.',
      quemCuidaDepois:
        'Regar e cuidar do canteiro entra na rotina escolar — o risco maior é o verão, quando a escola fecha e ninguém rega. Espécies de baixa manutenção reduzem esse problema; jardim de chuva bem plantado quase se autogere, porque bebe da própria chuva. Sem um responsável designado (professor, zelador ou turma fixa), o espaço volta a virar terra pisoteada em poucos meses.',
    },
    en: {
      comoFunciona:
        'The school yard trades part of its concrete for soil, plants and shade. Less paved area means more ground drinking the rain instead of flooding the yard, and the tree canopy cools the space where children play. In Salvador, a school in Mata Escura had only 3% of its ground free for rainwater to soak in — the Escola Verde com Afeto project built a rain garden specifically to reverse that.',
      quantoCusta:
        'The MMA booklet gives no number — the real cost depends on the yard’s size and how much concrete comes out. As a floor, use the components’ costs: a 10–15 m² rain garden runs R$ 4,000 to R$ 12,000 in materials, and each planted tree with pit and guard costs R$ 250 to R$ 500. A small yard with both lands around R$ 5,000 to R$ 20,000.',
      quemPrecisaDizerSim:
        'A public school goes through the school direction and its overseeing body — SMED if municipal, Seduc-RS if state. The project calls for a team combining the school, architecture/landscaping, and someone with botanical know-how, since species choice and design carry technical responsibility. Involving students from the start is common practice: in CoCriança (Campinas), the listening process with children took 11 months across 6 stages.',
      quemCuidaDepois:
        'Watering and tending the beds becomes part of the school routine — the biggest risk is summer break, when the school closes and nobody waters. Low-maintenance species reduce that problem; a well-built rain garden nearly maintains itself, since it feeds on the rain it collects. Without someone designated — a teacher, a caretaker, a fixed class — the space reverts to bare, trampled earth within months.',
    },
    sources: [
      'MMA Soluções Comunitárias (escola verde, p.60)',
      'MMA — caso Escola Verde com Afeto, Salvador-BA',
      'MMA — caso Verdejando Escolas / CoCriança, Campinas-SP',
    ],
    custoEstimado: true,
  },
  'parque-naturalizado': {
    pt: {
      comoFunciona:
        'É um espaço de brincar montado com o que o próprio terreno oferece — tronco, pedra, areia, galho — em vez de brinquedo de plástico comprado pronto. O desenho segue o relevo e o solo que já existem no lugar, então cada parque naturalizado sai diferente. A ideia é estimular o brincar livre: a criança sobe, equilibra e explora em vez de seguir uma função fixa do brinquedo.',
      quantoCusta:
        'A cartilha do MMA não dá valor — o método é justamente aproveitar material que já existe no terreno, o que barateia bastante. Como referência aproximada, uma área de brincar naturalizada pequena (100 a 300 m²) fica perto do piso de uma floresta de bolso pequena, R$ 100 a R$ 230 por m², mas pode custar bem menos se o material for todo reaproveitado em mutirão.',
      quemPrecisaDizerSim:
        'O terreno costuma ser praça ou área verde pública — passa por SMAMUS, com prioridade pra locais perto de escola, ponto de ônibus e outros lugares de fluxo de criança. Depois de pronto, cabe no Termo de Adoção pra manutenção via Adote uma Praça. O exemplo de Jundiaí-SP juntou parque naturalizado com escola verde e jardim de chuva no mesmo terreno, incluindo balanço com assento pra cadeirante e sinalização em Libras.',
      quemCuidaDepois:
        'Checar a estrutura de madeira (tronco, viga) de tempos em tempos — madeira apodrece e lasca com chuva e sol, e isso é questão de segurança, não só estética. Trocar peça deteriorada antes que vire risco de queda. Mato ao redor precisa de roçada periódica pra não engolir os elementos naturais.',
    },
    en: {
      comoFunciona:
        'It’s a play space built from what the site already offers — logs, stones, sand, branches — instead of ready-made plastic equipment. The design follows the terrain and soil already there, so every naturalised park turns out different. The point is to encourage free play: children climb, balance and explore instead of following one fixed function of a toy.',
      quantoCusta:
        'The MMA booklet gives no figure — the whole method is built around reusing material already on site, which keeps costs down. As a rough reference, a small naturalised play area (100–300 m²) sits near the floor of a small pocket forest, R$ 100 to R$ 230 per m², but can cost much less if all the material is reclaimed and the build runs as a mutirão.',
      quemPrecisaDizerSim:
        'The land is usually a public square or green area — it goes through SMAMUS, with priority for sites near schools, bus stops and other places where children already pass. Once built, it fits under the Termo de Adoção for upkeep via Adote uma Praça. The Jundiaí-SP example combined a naturalised park with a green school and a rain garden on the same site, including a wheelchair-accessible swing seat and Libras signage.',
      quemCuidaDepois:
        'Check the wood structures (logs, beams) periodically — wood rots and splinters with rain and sun, and that’s a safety issue, not just looks. Replace deteriorated pieces before they become a fall risk. Surrounding weeds need regular clearing so they don’t swallow the natural elements.',
    },
    sources: [
      'MMA Soluções Comunitárias (parque naturalizado, p.62)',
      'MMA — caso Parque Naturalizado Novo Horizonte, Jundiaí-SP',
    ],
    custoEstimado: true,
  },

  // ── Agricultura Urbana ──────────────────────────────────────────────────
  'hortas-urbanas': {
    pt: {
      comoFunciona:
        'A horta comunitária ocupa um terreno livre — público ou cedido — com canteiros de hortaliças, legumes e plantas medicinais, sem veneno (cultivo agroecológico: sem agrotóxico nem adubo químico). As raízes e a cobertura vegetal seguram a terra na chuva, reduzindo erosão em terrenos antes baldios. O grupo se organiza para plantar, regar, colher e dividir a produção — para comer ou vender.',
      quantoCusta:
        'Uma horta pequena (10–50 m², poucos canteiros) sai por R$ 300 a R$ 1.200, com material reaproveitado (garrafa PET, caixote). Uma horta comunitária de porte médio, para cerca de 50 famílias, com cercamento, rede de irrigação (poço incluído) e mudas, soma perto de R$ 25.000 — a maior parte é o cercamento e a irrigação, não as plantas.',
      quemPrecisaDizerSim:
        'Em terreno privado ou cedido: o dono do lote autoriza por escrito. Em terreno público em Porto Alegre: a SMAMUS aprova via Termo de Permissão de Uso não onerosa — ou seja, sem custo —, pedido pelo Portal de Licenciamento da prefeitura. Hortas de até 50 m² entram como pequena escala; até 100 m², média escala. A SMAMUS já mapeou 300 áreas públicas livres para esse fim.',
      quemCuidaDepois:
        'Rega e capina são quase diárias no começo; colheita e reposição de mudas, semanais. É preciso definir por escrito quem planta, quem rega, quem colhe e quem distribui — sem isso, a horta esvazia depois da primeira colheita, porque ninguém sabe de quem é a vez. O cuidado costuma ficar com uma associação de moradores, escola ou grupo informal do bairro.',
    },
    en: {
      comoFunciona:
        'The community garden turns an empty lot — public or lent — into beds of vegetables, greens, and medicinal plants, with no pesticide (agroecological growing: no chemical sprays or fertilizer). Roots and plant cover hold the soil during rain, cutting erosion on land that used to sit bare. The group organizes who plants, waters, harvests, and shares the output — to eat or to sell.',
      quantoCusta:
        'A small garden (10–50 m², a few beds) runs R$ 300 to R$ 1,200 with reused material (plastic bottles, crates). A mid-size community garden for about 50 families — fencing, irrigation line with a well, seedlings — adds up to close to R$ 25,000; most of that is fencing and irrigation, not the plants.',
      quemPrecisaDizerSim:
        'On private or lent land: the owner signs off in writing. On public land in Porto Alegre: SMAMUS approves it through a free-of-charge use permit (Termo de Permissão de Uso), requested through the city’s licensing portal. Gardens up to 50 m² count as small scale; up to 100 m², medium scale. SMAMUS has already mapped 300 free public plots for this.',
      quemCuidaDepois:
        'Watering and weeding are almost daily at first; harvesting and replanting, weekly. Someone has to write down who plants, who waters, who harvests, who distributes — without that, the garden empties out after the first harvest because no one knows whose turn it is. Upkeep usually falls to a residents’ association, a school, or an informal neighborhood group.',
    },
    sources: [
      'MMA Soluções Comunitárias p.66-67',
      'Prefeitura de Porto Alegre — Hortas Urbanas (SMAMUS) / IN SMAMUS nº 9/2025',
      'Transforma FBB / Instituto Escolhas — custos de implantação',
    ],
    custoEstimado: true,
  },
  compostagem: {
    pt: {
      comoFunciona:
        "Compostagem é a decomposição controlada de restos orgânicos (casca, sobra de comida, poda) por fungos e bactérias, até virarem adubo. Funciona em caixas, tambores ou leiras: camadas alternadas de material 'verde' (úmido, como sobra de comida) e 'marrom' (seco, como folha e serragem) mantêm o equilíbrio que evita mau cheiro e bicho. Em alguns meses o composto fica escuro, solto e com cheiro de terra — pronto para adubar horta e jardim.",
      quantoCusta:
        'Uma composteira doméstica pronta (caixas empilhadas) custa R$ 300 a R$ 500. Em escala comunitária, com tambores ou caixas de madeira reaproveitados, o custo fica entre R$ 500 e R$ 2.000, dependendo do material. Referência de porte: um projeto comunitário em São Paulo, com 4 leiras, já processou cerca de 40 toneladas de resíduo orgânico e produziu perto de 10 toneladas de composto.',
      quemPrecisaDizerSim:
        "Compostagem comunitária de pequena escala, com o composto usado no próprio local ou vendido direto ao consumidor, é dispensada de licença ambiental pela Resolução CONAMA 481/2017 — o órgão ambiental local define o limite de 'baixo impacto' (em São Paulo, por exemplo, 500 kg de resíduo por dia). Em Porto Alegre, esse limite exato não está confirmado publicamente; para praças e terrenos públicos, o uso do espaço segue o mesmo Termo de Permissão de Uso da SMAMUS que vale para hortas.",
      quemCuidaDepois:
        'É preciso virar a leira ou mexer a composteira a cada 1–2 semanas e balancear material verde e marrom. O erro mais comum é excesso de material úmido sem material seco suficiente — aí vem cheiro forte e mosca. A correção é simples: adicionar folha seca, serragem ou papelão picado. Sem alguém responsável fixo, a composteira para: escola, associação de moradores ou grupo do bairro costuma assumir essa função.',
    },
    en: {
      comoFunciona:
        "Composting is the controlled breakdown of organic scraps (peels, food waste, pruning) by fungi and bacteria into fertilizer. It runs in bins, drums, or windrows: alternating layers of 'green' material (wet, like food waste) and 'brown' material (dry, like leaves and sawdust) keep the balance that prevents odor and pests. Within a few months the compost turns dark, crumbly, and earthy-smelling — ready to feed gardens and plants.",
      quantoCusta:
        'A ready-made household compost bin costs R$ 300 to R$ 500. At community scale, using reused drums or wooden bins, cost runs R$ 500 to R$ 2,000 depending on materials. Scale reference: a community project in São Paulo, with 4 windrows, has processed about 40 tons of organic waste and produced close to 10 tons of compost.',
      quemPrecisaDizerSim:
        "Small-scale community composting, where the compost is used on-site or sold directly to the end consumer, is exempt from environmental licensing under CONAMA Resolution 481/2017 — the local environmental authority sets the 'low-impact' threshold (in São Paulo state, for example, 500 kg of waste per day). Porto Alegre's exact threshold isn't publicly confirmed; for squares and public land, using the space follows the same SMAMUS use permit that applies to gardens.",
      quemCuidaDepois:
        'The windrow or bin needs turning every 1–2 weeks and a green/brown balance. The most common mistake is too much wet material without enough dry material — that brings strong odor and flies. The fix is simple: add dry leaves, sawdust, or shredded cardboard. Without one steady person in charge, the compost bin stalls: a school, residents’ association, or neighborhood group usually takes on that role.',
    },
    sources: [
      'MMA Soluções Comunitárias p.68-69',
      'CONAMA Resolução 481/2017 (dispensa para baixo impacto)',
      'MMA — caso Ecobairro, São Paulo-SP',
    ],
    custoEstimado: true,
    autorizacaoEstimada: true,
  },
  'cozinha-comunitaria-biodigestor': {
    pt: {
      comoFunciona:
        'A cozinha comunitária é um equipamento público que prepara e distribui refeições de graça ou a preço baixo. O biodigestor é um tanque fechado onde resto de comida ou esterco fermenta sem oxigênio (fermentação anaeróbica) e vira biogás — usado no fogão no lugar do gás de botijão — e biofertilizante líquido para a horta. Um biodigestor pequeno processa poucos quilos de resto de comida por dia e rende algumas horas de gás de cozinha.',
      quantoCusta:
        'A estrutura completa de uma cozinha comunitária (obra, reforma, equipamento) é hoje financiada pelo governo federal em até R$ 350 mil por unidade, para cozinha que produza no mínimo 100 refeições por dia. O biodigestor isolado: uma versão caseira com tambores reciclados sai por R$ 300 a R$ 800; um kit comercial pronto ficava na faixa de R$ 5.900 a R$ 8.900 em 2021–2022 — hoje deve custar mais.',
      quemPrecisaDizerSim:
        'A cozinha precisa de Alvará de Saúde da vigilância sanitária municipal, obrigatório para atividades de risco II ou III (LC 983/2023 e Decreto 22.102/2023 de Porto Alegre), seguindo as boas práticas da RDC Anvisa nº 216/2004 — inclui vistoria no local. Também precisa de autorização de uso do imóvel: se for espaço público, a gestão costuma envolver a prefeitura; se cedido, termo com o dono. O financiamento geralmente passa por programa federal ou estadual.',
      quemCuidaDepois:
        'O biodigestor precisa ser alimentado quase todo dia — sem entrada regular de resíduo, a produção de gás cai rápido. A cozinha exige rotina de higiene diária para manter o alvará (armazenamento, limpeza, controle de pragas) e, idealmente, apoio de nutricionista para o cardápio. Sem gestão definida, o equipamento é abandonado assim que falta quem cozinhe ou quem alimente o biodigestor.',
    },
    en: {
      comoFunciona:
        'The community kitchen is a public facility that prepares and distributes meals for free or at low cost. The biodigester is a sealed tank where food scraps or manure ferment without oxygen (anaerobic digestion) and turn into biogas — used on the stove instead of bottled gas — and liquid biofertilizer for the garden. A small biodigester processes a few kilos of food waste a day and yields a few hours of cooking gas.',
      quantoCusta:
        'The full community kitchen structure (construction, renovation, equipment) is currently funded by the federal government at up to R$ 350,000 per unit, for a kitchen producing at least 100 meals a day. The biodigester alone: a homemade version with recycled drums runs R$ 300 to R$ 800; a ready-made commercial kit ran R$ 5,900 to R$ 8,900 in 2021–2022 — likely higher now.',
      quemPrecisaDizerSim:
        'The kitchen needs a Health Permit from the municipal health inspection service, mandatory for risk-level II or III activities (Porto Alegre’s LC 983/2023 and Decree 22,102/2023), following ANVISA’s RDC 216/2004 food-service standards — including an on-site inspection. It also needs authorization to use the property: on public land, that usually involves the city; on lent land, a signed agreement with the owner. Funding typically runs through a federal or state program.',
      quemCuidaDepois:
        'The biodigester needs feeding almost daily — without regular waste input, gas output drops fast. The kitchen needs a daily hygiene routine to keep its permit (storage, cleaning, pest control) and, ideally, a nutritionist’s input on the menu. Without management clearly assigned, the facility gets abandoned as soon as there’s no one to cook or feed the biodigester.',
    },
    sources: [
      'MMA Soluções Comunitárias p.58-59',
      'gov.br/mds — Cozinha Comunitária',
      'Prefeitura de Porto Alegre — Alvará de Saúde (vigilância sanitária)',
    ],
    custoEstimado: true,
  },
  'sistema-alimentar-local': {
    pt: {
      comoFunciona:
        'O sistema alimentar local conecta produção, distribuição e consumo de comida dentro da própria região, encurtando o caminho entre quem planta e quem come (circuito curto). Sem atravessador, o alimento chega mais fresco e mais barato, e o dinheiro fica no bairro. Feira agroecológica, horta comunitária e cozinha local formam essa rede — uma alimenta a outra.',
      quantoCusta:
        'Não há um custo de implantação fixo: essa solução é a costura entre as outras (feiras, hortas, cozinhas), que já têm seus próprios custos em cada ficha. O investimento aqui é sobretudo organizacional — tempo de articulação, não obra.',
      quemPrecisaDizerSim:
        'Não existe uma licença única: cada peça da rede segue sua própria regra (horta com SMAMUS, cozinha com vigilância sanitária). Para vender em feira livre ou institucionalmente (merenda escolar, por exemplo), o produtor precisa do Cadastro Nacional da Agricultura Familiar (CAF, antiga DAP). Em Porto Alegre, as Feiras Ecológicas são organizadas e autorizadas pela prefeitura — como a Feira Agroecológica (FAE), todo sábado na Av. José Bonifácio.',
      quemCuidaDepois:
        'É preciso alguém articulando a rede — mapeando produtores, organizando a feira, mantendo o calendário. Sem essa função contínua, a rede se desfaz de volta em pedaços soltos: horta aqui, feira ali, sem circulação entre elas. Normalmente essa articulação fica com uma associação, cooperativa ou rede como a RAMA (Rede Agroecológica Metropolitana de Porto Alegre).',
    },
    en: {
      comoFunciona:
        'The local food system connects production, distribution, and consumption of food within the region itself, shortening the path between grower and eater (short circuit). Without middlemen, food arrives fresher and cheaper, and the money stays in the neighborhood. Agroecological fairs, community gardens, and local kitchens form this network — each one feeds into the next.',
      quantoCusta:
        'There’s no fixed setup cost: this solution is the stitching between the others (fairs, gardens, kitchens), which already carry their own costs in their own fichas. The investment here is mostly organizational — coordination time, not construction.',
      quemPrecisaDizerSim:
        'There’s no single license: each piece of the network follows its own rule (garden with SMAMUS, kitchen with health inspection). To sell at an open-air market or to institutions (school lunches, for example), the producer needs the National Family Farming Registry (CAF, formerly DAP). In Porto Alegre, Ecological Fairs are organized and authorized by the city — like the Agroecological Fair (FAE), every Saturday on Av. José Bonifácio.',
      quemCuidaDepois:
        'Someone needs to keep coordinating the network — mapping producers, organizing the fair, keeping the schedule. Without that ongoing role, the network falls back apart into loose pieces: a garden here, a fair there, with nothing circulating between them. That coordination usually falls to an association, a cooperative, or a network like RAMA (Porto Alegre’s Metropolitan Agroecological Network).',
    },
    sources: [
      'MMA Soluções Comunitárias p.52-53',
      'ICLEI (2023) — Sistemas Alimentares Circulares na América Latina',
      'Prefeitura de Porto Alegre — Feiras Ecológicas',
    ],
    custoEstimado: true,
    autorizacaoEstimada: true,
  },

  // ── Estabilização de Encostas e Solo ────────────────────────────────────
  'grade-viva': {
    pt: {
      comoFunciona:
        "Uma grade de madeira (troncos entrelaçados e ancorados) é fixada na encosta e preenchida com terra e mudas. No início, a madeira segura o barranco; com o tempo, as raízes das plantas formam uma malha que assume essa função de sustentação. Aguenta encostas de até 20 m de altura e 70° de inclinação, mas não resiste a água correndo forte (limite de 1,5 m/s).",
      quantoCusta:
        "R$ 500 a R$ 600 por m² (base GIZ, 2023). É custo alto: envolve madeira tratada, ancoragem no terreno e mão de obra para amarrar a estrutura em formato de 'fogueira'. O valor varia com altura, projeto e material disponível na região.",
      quemPrecisaDizerSim:
        'Se a encosta está mapeada como área de risco, a Defesa Civil de Porto Alegre precisa liberar antes de qualquer intervenção. A estrutura precisa de um responsável técnico (engenheiro ou técnico habilitado) definindo dimensões e ancoragem, com ART registrada no CREA (Lei 6.496/77). É a única solução do grupo em que um mutirão pode ajudar na execução (encher a grade, plantar) sob orientação técnica direta — mas altura, amarração e ancoragem são sempre decisão do técnico, nunca da comunidade sozinha. Terreno público passa por licenciamento da SMAMUS.',
      quemCuidaDepois:
        'Depois de chuva forte, verificar a madeira: ela segura a estrutura até a raiz virar a malha que sustenta o barranco, e madeira apodrecida antes desse ponto significa queda garantida. Poda regular das plantas e reposição de mudas mortas. É manutenção que um mutirão consegue fazer — limpar lixo acumulado, cortar mato, avisar se algum tronco estiver solto ou podre.',
    },
    en: {
      comoFunciona:
        "A wooden lattice — logs interlocked and staked into the slope — is filled with soil and planted with seedlings. At first the wood holds the bank; over time the plants' roots form a mesh that takes over that support role. It handles slopes up to 20 m tall and 70° steep, but not fast-running water (limit 1.5 m/s).",
      quantoCusta:
        "R$ 500–600 per m² (GIZ basis, 2023). High cost: treated wood, ground anchoring, and labor to tie the structure into its 'bonfire' interlock. Price shifts with height, design, and local material availability.",
      quemPrecisaDizerSim:
        "If the slope is mapped as a risk area, Porto Alegre's Defesa Civil must clear it before any work starts. The structure needs a responsible engineer or qualified technician sizing it and defining anchoring, with an ART filed at CREA (Lei 6.496/77). This is the only solution in the group where a community mutirão can help with execution (filling the grid, planting) under direct technical guidance — but height, tying, and anchoring decisions always belong to the technician, never the community alone. Public land goes through SMAMUS licensing.",
      quemCuidaDepois:
        'After heavy rain, check the wood: it holds the structure until the roots become the mesh that sustains the bank, and rotted wood before that point means guaranteed collapse. Regular pruning and replacing dead seedlings. This is maintenance a community mutirão can actually do — clear trash buildup, cut overgrowth, flag any loose or rotten log.',
    },
    sources: ['GIZ Catálogo SbN p.162-167', 'Lei Federal 6.496/77 (ART obrigatória)'],
  },
  'muro-de-arrimo-verde': {
    pt: {
      comoFunciona:
        "É um muro de pedra ou de gabião (caixa de tela metálica cheia de pedra) que segura o empuxo do terreno atrás dele. Entre as pedras ou nas frestas do gabião, plantam-se mudas: as raízes crescem nos vãos e reforçam a estrutura com o tempo. É a solução mais 'dura' da família — funciona como um muro convencional, só que com vida dentro.",
      quantoCusta:
        'R$ 200 a R$ 300 por m² para pedra ou gabião (base GIZ, 2023); a versão pré-fabricada tipo cribwall chega a R$ 1.000–2.000 por m². É custo alto em qualquer variante — envolve avaliação geotécnica, fundação e mão de obra especializada.',
      quemPrecisaDizerSim:
        'É nível licença, sempre. Qualquer muro de arrimo precisa de avaliação geotécnica e responsável técnico com ART registrada no CREA — o próprio catálogo GIZ exige esse cálculo para dimensionar o muro. Área de risco mapeada passa por liberação da Defesa Civil, e a obra passa por licenciamento da SMAMUS. Um mutirão pode plantar mudas nas frestas depois que o muro estiver pronto e aprovado, e pode limpar os drenos — mas não pode empilhar pedra ou montar gabião numa encosta ocupada por conta própria: é assim que um muro cai em cima de casas.',
      quemCuidaDepois:
        'Depois de chuva forte ou qualquer movimento de terra perto do muro, verificar se tem pedra ou bloco solto ou caído — sinal de que o muro está cedendo. O ponto crítico são os drenos: um dreno entupido atrás do muro acumula água e empurra a estrutura de dentro para fora — é assim que a maioria dos muros de arrimo racha ou cai. Vegetação na crista deve ser podada; evitar arbustos nas frestas do gabião, porque raiz grossa pode arrebentar a amarração da tela.',
    },
    en: {
      comoFunciona:
        "It's a stone or gabion wall — a wire-mesh cage packed with rock — that holds back the soil pressure behind it. Seedlings are planted between the stones or in the gabion's gaps; roots grow into the voids and add reinforcement over time. It's the most 'hard-engineering' member of this family — it works like a conventional wall, just with life inside it.",
      quantoCusta:
        'R$ 200–300 per m² for stone or gabion (GIZ basis, 2023); the prefabricated cribwall version runs R$ 1,000–2,000 per m². High cost in any version — needs a geotechnical study, foundation work, and skilled labor.',
      quemPrecisaDizerSim:
        "This is always licença-level. Any retaining wall needs a geotechnical assessment and a responsible engineer with an ART filed at CREA — GIZ's own catalog requires that calculation to size the wall. A mapped risk area needs Defesa Civil clearance, and the build goes through SMAMUS licensing. A mutirão can plant seedlings in the gaps once the wall is finished and approved, and can clear the drains — but it cannot stack stone or assemble a gabion on an occupied slope on its own. That's how walls come down on top of houses.",
      quemCuidaDepois:
        "After heavy rain or any nearby earth movement, check for loose or fallen stones/blocks — a sign the wall is giving way. The critical point is the drains: a clogged drain behind the wall builds up water pressure and pushes the structure outward — that's how most retaining walls crack or fail. Vegetation on the crest should be trimmed; avoid shrubs in gabion gaps, because thick roots can break the wire ties.",
    },
    sources: [
      'GIZ Catálogo SbN p.168-187 (muros de contenção com pedra/gabião e vegetação)',
      'Lei Federal 6.496/77 (ART obrigatória)',
    ],
  },
  'solo-grampeado-verde': {
    pt: {
      comoFunciona:
        'Grampos de metal são cravados fundo na encosta em furos e fixados com calda de cimento injetada — como pinos grandes segurando o barranco por dentro. Uma tela cobre a face do talude e recebe plantio de grama ou trepadeiras. Suporta até 70° de inclinação e 20 m de altura, exceto onde a rocha está exposta.',
      quantoCusta:
        'R$ 800 a R$ 1.000 por m² (base GIZ, 2023). É a opção mais cara da família: exige perfuração mecanizada, grampos e injeção de calda de cimento — equipamento e mão de obra especializada, não dá para mutirão.',
      quemPrecisaDizerSim:
        'Nível licença, sem exceção. Precisa de projeto assinado por engenheiro com ART registrada no CREA, perfuração mecanizada e injeção de calda de cimento — o próprio catálogo GIZ cita a falta de técnicos qualificados como um desafio real para essa solução. Área de risco passa por liberação da Defesa Civil; a obra passa por licenciamento da SMAMUS. Não existe versão mutirão desta solução: a comunidade não deve tocar em grampo, perfuração ou tela estrutural.',
      quemCuidaDepois:
        'Precisa de teste de arrancamento periódico dos grampos, feito por técnico, para garantir que continuam presos como no projeto. Qualquer abertura ou desgaste na tela deve ser reparado na hora. Uma falha de grampo não aparece a olho nu até a tela já estar estufada ou a grama secar em manchas — a inspeção técnica regular não é opcional.',
    },
    en: {
      comoFunciona:
        'Steel nails are drilled deep into the slope and grouted in with injected cement paste — like giant pins holding the bank from the inside. A mesh covers the slope face and is planted with grass or vines. It handles slopes up to 70° and 20 m tall, except where bare rock is exposed.',
      quantoCusta:
        'R$ 800–1,000 per m² (GIZ basis, 2023). The most expensive option in this family: needs mechanized drilling, steel nails, and cement-grout injection — specialized equipment and labor, not a mutirão job.',
      quemPrecisaDizerSim:
        "Licença-level, no exceptions. Needs a design signed by an engineer with an ART filed at CREA, mechanized drilling, and cement-grout injection — GIZ's own catalog flags the shortage of qualified technicians as a real challenge for this solution. A risk area needs Defesa Civil sign-off; the build needs SMAMUS licensing. There's no mutirão version of this solution: the community should not touch the nails, drilling, or structural mesh.",
      quemCuidaDepois:
        "Needs periodic pull-out testing of the nails, done by a technician, to confirm they're still anchored as designed. Any tear or wear in the mesh must be repaired immediately. A nail failure doesn't show to the naked eye until the mesh is already bulging or the grass dies in patches — regular technical inspection isn't optional.",
    },
    sources: ['GIZ Catálogo SbN p.190-197', 'Lei Federal 6.496/77 (ART obrigatória)'],
  },
  'contencoes-em-geocelulas': {
    pt: {
      comoFunciona:
        'Uma manta de células plásticas (parecida com um favo de mel, geralmente de PEAD) é esticada sobre o talude e presa ao solo com grampos ou chumbadores. Cada célula é preenchida com terra, areia ou brita, e depois recebe plantas na superfície. Pode ser instalada em camadas empilhadas até formar a altura de contenção necessária, até 20 m.',
      quantoCusta:
        'R$ 500 a R$ 700 por m² (base GIZ, 2023). Custo alto: a manta geossintética e sua instalação exigem equipamento e mão de obra qualificada, mesmo sendo mais leve de transportar que pedra ou gabião.',
      quemPrecisaDizerSim:
        'Nível licença. A instalação exige mão de obra qualificada e equipamento — o catálogo GIZ é direto sobre isso — então precisa de um responsável técnico com ART registrada no CREA definindo camadas, ancoragem e preenchimento. Área de risco passa por liberação da Defesa Civil; a obra passa por licenciamento da SMAMUS. Um mutirão pode entrar depois, plantando a superfície já preenchida, mas não pode esticar ou ancorar a manta sozinho.',
      quemCuidaDepois:
        'Verificar costura e fixação da manta — ela é resistente a água e vento, mas a costura pode falhar e precisa reparo rápido. O ponto real de atenção é a drenagem superficial do talude: se ela entupir, a água empoça e erode o preenchimento por dentro da célula, e a manta fica com aparência intacta por fora enquanto o recheio já sumiu.',
    },
    en: {
      comoFunciona:
        'A honeycomb-like mesh of plastic cells (usually HDPE) is stretched over the slope and pinned to the ground with stakes or anchors. Each cell is filled with soil, sand, or gravel, then planted on top. It can be stacked in layers to build up the needed containment height, up to 20 m.',
      quantoCusta:
        "R$ 500–700 per m² (GIZ basis, 2023). High cost: the geosynthetic mesh and its installation need equipment and qualified labor, even though it's lighter to transport than stone or gabions.",
      quemPrecisaDizerSim:
        "Licença-level. Installation needs qualified labor and equipment — GIZ's catalog is direct about this — so it needs a responsible engineer with an ART filed at CREA defining layers, anchoring, and infill. A risk area needs Defesa Civil sign-off; the build needs SMAMUS licensing. A mutirão can come in afterward to plant the already-filled surface, but it cannot stretch or anchor the mesh on its own.",
      quemCuidaDepois:
        "Check the mesh's stitching and anchoring — it's water- and wind-resistant, but seams can fail and need quick repair. The real thing to watch is the slope's surface drainage: if it clogs, water pools and erodes the infill inside the cells, leaving the mesh looking intact outside while the fill underneath is already gone.",
    },
    sources: ['GIZ Catálogo SbN p.196-203', 'Lei Federal 6.496/77 (ART obrigatória)'],
  },

  // ── Recuperação de Ecossistemas Naturais ────────────────────────────────
  reflorestamento: {
    pt: {
      comoFunciona:
        'Você planta mudas nativas bem juntas — 3 a 5 por m², o método Miyawaki — imitando como a mata nasce sozinha. As raízes seguram a terra e ajudam a chuva a entrar no solo em vez de escorrer. Em 2 a 3 anos as copas se tocam e a mata fecha.',
      quantoCusta:
        'Em terreno pequeno, feito em mutirão: R$ 100 a R$ 230 por m² (conteúdo COUGAR, Porto Alegre). Uma área de 300 m² com 900 mudas fica em R$ 30 mil a R$ 70 mil, já com 2 anos de cuidado. Em escala de hectare, o Projeto Guapiaçu (RJ) reflorestou Mata Atlântica a R$ 60 mil a R$ 90 mil por hectare em 2024, com mudas e 3 anos de manutenção. Onde ainda sobra banco de sementes no solo, isolar a área e deixar a mata voltar sozinha (regeneração natural conduzida) pode custar só R$ 1 mil a R$ 2 mil por hectare — mas especialistas discordam bastante desses números; trate como faixa, não como orçamento fechado.',
      quemPrecisaDizerSim:
        'Em terreno particular degradado, plantar árvore nativa não precisa de licença — pode ser feito em mutirão. Em praça ou área verde pública, a associação assina um Termo de Adoção e a SMAMUS escolhe as espécies e o local. Se a área fica numa encosta ou perto de nascente (APP), o plantio de recuperação costuma ser liberado e até incentivado — mas confirme com a SMAMUS antes de mexer no terreno.',
      quemCuidaDepois:
        'A formiga cortadeira é o inimigo número 1 — ela derruba a muda nova em poucos dias; porta-isca corta o custo do controle em até 80%. Depois vêm a seca dos 2 primeiros verões e o mato competindo por luz. Reserve 2 anos de rega, capina e controle de formiga, e conte com replantar 15% a 25% das mudas no primeiro ano. Sem esse cuidado, a área volta a virar capoeira — plantar sem manter não vira floresta.',
    },
    en: {
      comoFunciona:
        'You plant native saplings close together — 3 to 5 per m², the Miyawaki method — mimicking how a forest regrows on its own. Roots hold the soil and help rain soak into the ground instead of running off. In 2 to 3 years the canopies touch and the forest closes.',
      quantoCusta:
        'On a small plot, built in a mutirão: R$ 100 to R$ 230 per m² (COUGAR content, Porto Alegre). A 300 m² area with 900 saplings runs R$ 30,000 to R$ 70,000, including two years of care. At hectare scale, Projeto Guapiaçu (RJ) reforested Atlantic Forest land at R$ 60,000 to R$ 90,000 per hectare in 2024, covering seedlings and three years of maintenance. Where a seed bank survives in the soil, fencing the area and letting the forest regrow (assisted natural regeneration) can cost as little as R$ 1,000 to R$ 2,000 per hectare — but experts disagree sharply on these numbers; treat this as a range, not a fixed budget.',
      quemPrecisaDizerSim:
        'On degraded private land, planting native trees needs no permit — it can be done in a mutirão. On a public square or green area, the association signs a Termo de Adoção and SMAMUS chooses the species and site. If the plot sits on a slope or near a spring (APP), restoration planting is usually allowed and even encouraged — but confirm with SMAMUS before touching the ground.',
      quemCuidaDepois:
        'Leaf-cutter ants are enemy number one — they can strip a young sapling in days; bait stations cut control costs by up to 80%. Then come drought in the first two summers and grass competing for light. Budget two years of watering, weeding and ant control, and expect to replant 15–25% of the saplings in year one. Without that care, the area reverts to scrub — planting without maintenance does not make a forest.',
    },
    sources: [
      'conteúdo COUGAR (urban-forests)',
      'Projeto Guapiaçu/REGUA, 2024',
      'SOS Mata Atlântica / Pacto pela Restauração da Mata Atlântica',
      'SMAMUS — Viveiro Municipal de Porto Alegre',
    ],
    custoEstimado: true,
  },
  'restauracao-areas-umidas': {
    pt: {
      comoFunciona:
        'O banhado funciona como uma esponja: a água da chuva ou da cheia entra devagar e sai devagar, achatando o pico da enchente. As plantas — taboa, junco — filtram a água, tirando cerca de 80% da sujeira orgânica. Na margem do rio, a mata ciliar (a faixa de vegetação nativa que a lei exige junto à água) segura o barranco com as raízes e evita erosão.',
      quantoCusta:
        'Recuperar um banhado ou trecho de margem que já existe, mas está degradado, é bem mais barato que construir do zero: R$ 20 mil a R$ 120 mil para recuperar 2.000 m² (conteúdo COUGAR). Construir um jardim filtrante novo custa R$ 540 a R$ 1.410 por m². Na mata ciliar, isolar a área e deixar a vegetação voltar sozinha (regeneração natural conduzida) é a opção mais barata; plantio total custa bem mais e só se justifica onde não sobrou banco de sementes.',
      quemPrecisaDizerSim:
        'Margem de rio, banhado e nascente são quase sempre APP (área de preservação permanente) — protegida pela Lei 12.651/2012, o Código Florestal, que exige uma faixa de 30 a 500 m de mata ao longo da água, dependendo da largura do rio. Restaurar é permitido e até incentivado, mas peça a licença ambiental na SMAMUS antes de começar — diga que é recuperação, não construção. Se o projeto cria um banhado novo ou faz obra dentro da APP, a licença é completa e pode subir para a SEMA-RS. Em qualquer caso, é preciso um parceiro técnico — biólogo ou engenheiro ambiental — assinando o projeto.',
      quemCuidaDepois:
        'Depois de plantada, a mata ciliar e o banhado pedem 2 a 4 idas por ano pra tirar planta invasora, tirar lixo, e cortar a taboa velha 1 a 2 vezes por ano. O medo do mosquito é justo, mas banhado com água correndo e peixe é péssimo lugar pra larva de dengue — quem cria mosquito é água parada e suja, ou seja, banhado abandonado. O risco maior não é o mosquito: é virar depósito de lixo e depois ser aterrado.',
    },
    en: {
      comoFunciona:
        'A wetland works like a sponge: rain or floodwater enters slowly and leaves slowly, flattening the peak of a flood. Plants — cattail, rush — filter the water, removing about 80% of organic pollution. Along a riverbank, the mata ciliar (the strip of native vegetation the law requires beside the water) holds the bank together with its roots and stops erosion.',
      quantoCusta:
        'Restoring an existing but degraded wetland or riverbank stretch is far cheaper than building one from scratch: R$ 20,000 to R$ 120,000 to restore 2,000 m² (COUGAR content). Building a new treatment wetland costs R$ 540 to R$ 1,410 per m². On a riverbank, fencing off the area and letting native vegetation regrow (assisted natural regeneration) is the cheapest option; full planting costs much more and only makes sense where no seed bank survives.',
      quemPrecisaDizerSim:
        "Riverbanks, wetlands and springs are almost always APP (permanent preservation area) — protected under Lei 12.651/2012, Brazil's Forest Code, which requires a 30–500 m vegetated strip along the water depending on the river's width. Restoring it is allowed and even encouraged, but request the environmental licence from SMAMUS before starting — call it restoration, not construction. If the project builds a new wetland or involves works inside the APP, full licensing applies and may escalate to SEMA-RS. Either way, you need a technical partner — a biologist or environmental engineer — signing off on the project.",
      quemCuidaDepois:
        "After planting, the riverbank and wetland need 2 to 4 visits a year to pull invasive plants, remove litter, and cut back old cattail once or twice a year. The fear of mosquitoes is fair, but a wetland with moving water and fish is bad habitat for dengue larvae — what breeds mosquitoes is stagnant, dirty water: an abandoned wetland. The bigger risk isn't the mosquito — it's becoming a dump and later being filled in.",
    },
    sources: [
      'conteúdo COUGAR (wetland-restoration)',
      'Lei 12.651/2012 — Código Florestal (larguras de APP)',
      'GIZ Catálogo SbN (casos Fortaleza e Rio de Janeiro)',
    ],
    custoEstimado: true,
  },
};

export function getSolutionFicha(id: string): NbsSolutionFicha | undefined {
  return NBS_SOLUTION_FICHAS[id];
}

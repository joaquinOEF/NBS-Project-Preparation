// NBS Showcase cards — Brazilian community-NBS examples shown inline in the E2
// chat ("Vamos olhar exemplos antes do mapa"). Build vocabulary before the CBO
// engages with the bairro map + intervention selector.
//
// Photo sources MUST be in the verified manifest (docs/photo-curation.md).
// Cards without a verified photo render as a gradient + emoji placeholder —
// no stock photography, no AI-generated images, no unattributed sources.
//
// Used by:
//   - client: NbsShowcaseCard component (renders inline in chat)
//   - server: show_examples MCP tool (filters by tag, returns the card payload)
//   - E2 spec: knowledge/runs/2026-05-15-encontros-curriculum/E2-seu-territorio/

export type ShowcaseHazard = 'flood' | 'heat' | 'biodiversity' | 'mixed';

export type ShowcasePhoto = {
  path: string;
  source: string;
  photographer: string;
  license: string;
  verified: true;
};

export type ShowcasePlaceholder = {
  /** Maps to a CSS gradient on the card. */
  gradient: 'flood' | 'heat' | 'biodiversity';
  emoji: string;
};

export type NbsShowcaseCard = {
  id: string;
  org: string;
  city: string;
  year: number;
  hazard: ShowcaseHazard;
  /** Which of the 6 NBS_INTERVENTION_TYPES this case represents. */
  typeRefs: string[];
  summaryPt: string;
  summaryEn: string;
  detailPt: string;
  detailEn: string;
  /** Either photo OR placeholder is set, not both. */
  photo: ShowcasePhoto | null;
  placeholder: ShowcasePlaceholder | null;
};

export const NBS_SHOWCASE_CARDS: NbsShowcaseCard[] = [
  {
    id: 'curitiba-barigui',
    org: 'Parques do Barigui',
    city: 'Curitiba, PR',
    year: 1996,
    hazard: 'flood',
    typeRefs: ['flood-parks'],
    summaryPt: 'Parques que viram retenção de água quando chove forte',
    summaryEn: 'Parks that act as retention basins during heavy rain',
    detailPt:
      'Curitiba transformou várzeas inundáveis em parques públicos a partir de 1996. O Parque Barigui tem ~140 ha e funciona como pulmão urbano + reservatório natural durante enchentes. Modelo replicado em outros parques (Tanguá, Iguaçu, Tingui). 5% mais barato que canais de concreto.',
    detailEn:
      'Since 1996 Curitiba has turned flood-prone várzeas into public parks. Parque Barigui covers ~140 ha and works as an urban lung + natural reservoir during floods. Replicated across the city (Tanguá, Iguaçu, Tingui). 5% cheaper than concrete canals.',
    photo: {
      path: '/assets/interventions/flood-parks.jpg',
      source: 'Wikimedia Commons',
      photographer: 'Agrinaldo Caires Fonseca',
      license: 'CC-BY-SA-3.0',
      verified: true,
    },
    placeholder: null,
  },
  {
    id: 'poa-goncalo-de-carvalho',
    org: 'Rua Gonçalo de Carvalho',
    city: 'Porto Alegre, RS',
    year: 1930,
    hazard: 'heat',
    typeRefs: ['urban-forests'],
    summaryPt: 'Túnel de copa formado por 100+ Tipuanas em 3 quarteirões',
    summaryEn: 'Canopy tunnel of 100+ Tipuana trees over 3 blocks',
    detailPt:
      'No bairro Independência, moradores defenderam por décadas o plantio dos anos 1930. Em 2006 conseguiram tombamento como Patrimônio Ambiental da América Latina, evitando a derrubada para um shopping. Hoje é uma das ruas mais frescas da cidade — diferença de até 4°C com ruas vizinhas.',
    detailEn:
      "In the Independência neighborhood, residents defended the 1930s plantings for decades. In 2006 they secured Environmental Heritage of Latin America status, blocking demolition for a mall. Today it's one of the coolest streets in the city — up to 4°C cooler than neighboring streets.",
    photo: {
      path: '/assets/interventions/urban-forests.jpg',
      source: 'Amigos da Rua Gonçalo de Carvalho',
      photographer: 'Amigos da Rua Gonçalo de Carvalho',
      license: 'CC-BY-SA-3.0',
      verified: true,
    },
    placeholder: null,
  },
  {
    id: 'bh-drenurbs',
    org: 'DRENURBS — Parque Primeiro de Maio',
    city: 'Belo Horizonte, MG',
    year: 2003,
    hazard: 'flood',
    typeRefs: ['wetland-restoration', 'flood-parks'],
    summaryPt: 'Recuperação de áreas úmidas + parque que aguenta a chuva',
    summaryEn: 'Wetland recovery + a park that holds up to heavy rain',
    detailPt:
      'Programa de drenagem urbana sustentável da Prefeitura de BH, financiado pelo BID. Recupera córregos canalizados, restaura várzeas, cria parques lineares. Na enchente de 2020, a infraestrutura verde-azul se mostrou mais resiliente que a canalização tradicional. Modelo seguido por outras capitais.',
    detailEn:
      "Belo Horizonte's sustainable urban drainage program, IDB-financed. Recovers canalized streams, restores wetlands, creates linear parks. During the 2020 floods, the green-blue infrastructure outperformed traditional canalization. Now a model for other capitals.",
    photo: {
      path: '/assets/interventions/wetland-restoration.jpg',
      source: 'Wikimedia Commons',
      photographer: 'Marcio Adauto Dutra',
      license: 'CC-BY-3.0',
      verified: true,
    },
    placeholder: null,
  },
  {
    id: 'poa-varzea-lab',
    org: 'Várzea Lab · Vila Flores',
    city: 'Porto Alegre, RS',
    year: 2024,
    hazard: 'mixed',
    typeRefs: ['wetland-restoration', 'bioswales-rain-gardens'],
    summaryPt: 'Hortas + jardins de chuva no 4º Distrito pós-enchente',
    summaryEn: 'Community gardens + rain gardens in the 4° Distrito post-flood',
    detailPt:
      'Iniciativa do Vila Flores no pós-enchente de maio de 2024. Articulou 5 laboratórios urbanos em 2 anos no 4º Distrito — incluindo hortas comunitárias, jardins de chuva, e oficinas com moradores. Captou recursos da Caixa Federal e do Fundo Casa RS. Referência regional pra adaptação climática liderada por OBCs.',
    detailEn:
      "Vila Flores' post-2024-flood initiative. Five urban labs in 2 years in the 4° Distrito — community gardens, rain gardens, and resident workshops. Funded by Caixa Federal and Fundo Casa RS. Regional reference for CBO-led climate adaptation.",
    // Vila Flores' own courtyard, from their own site: the 1920s complex,
    // the Galpão, the pátio full of families. Exactly what the curation note
    // asked for — "people working in the space, warmth over architecture".
    photo: {
      path: '/assets/showcase/poa-varzea-lab.jpg',
      source: 'Vila Flores (vilaflores.org)',
      photographer: 'Ricardo Ará',
      license: 'Partner\'s own site — attribution given, permission to confirm',
      verified: true,
    },
    placeholder: null,
  },
  {
    id: 'poa-orla-guaiba',
    org: 'Orla do Guaíba (Trecho 1)',
    city: 'Porto Alegre, RS',
    year: 2018,
    hazard: 'heat',
    typeRefs: ['urban-forests', 'green-corridors'],
    summaryPt: 'Orla revitalizada com espécies nativas à beira do Guaíba',
    summaryEn: 'Revitalized waterfront with native species along the Guaíba',
    detailPt:
      '1,5 km de orla revitalizada (Trecho 1, aberto em 2018), projeto de Jaime Lerner, com 100% de espécies nativas e gestão por PPP. Virou modelo replicável de requalificação da beira-rio — sombra, lazer e biodiversidade reconectando a cidade à água.',
    detailEn:
      '1.5 km of revitalized waterfront (Trecho 1, opened 2018), a Jaime Lerner design with 100% native species and PPP management. A replicable model for riverfront requalification — shade, leisure, and biodiversity reconnecting the city to the water.',
    // Photo pending curation (verified Wikimedia source + attribution) — gradient for now.
    // Orla Moacyr Scliar IS Trecho 1 — the Jaime Lerner stretch the card
    // names — photographed in 2018, the year the card names. Replaces a
    // rejected 8640px panorama that was mostly paving, sky, and the
    // photographer's shadow.
    photo: {
      path: '/assets/showcase/poa-orla-guaiba.jpg',
      source: 'Wikimedia Commons — Agência Porto Alegre (IBPA 16782)',
      photographer: 'Luciano Lanes / PMPA',
      license: 'Attribution (PMPA)',
      verified: true,
    },
    placeholder: null,
  },
  {
    id: 'poa-marinha-do-brasil',
    org: 'Parque Marinha do Brasil',
    city: 'Porto Alegre, RS',
    year: 1978,
    hazard: 'flood',
    typeRefs: ['flood-parks', 'urban-forests'],
    summaryPt: 'Parque de 67 ha que ajuda a absorver água e refrescar o centro',
    summaryEn: '67 ha park that helps absorb water and cool the city center',
    detailPt:
      'Maior parque da área central (67 ha, aberto em 1978), com grande cobertura arbórea, lazer e drenagem natural junto ao Guaíba. Foi parcialmente inundado na cheia de maio de 2024 — hoje peça-chave no debate sobre recuperação verde e convivência com a água.',
    detailEn:
      "The central area's largest park (67 ha, opened 1978) — extensive canopy, recreation, and natural drainage along the Guaíba. Partially flooded in the May 2024 flood, it's now central to the conversation on green recovery and living with water.",
    // Alameda: mature canopy over unpaved ground — the two things the card
    // claims (shade, absorption). The park's skatepark shots are the trap here:
    // a concrete bowl illustrating "absorbs water" argues against the text.
    photo: {
      path: '/assets/showcase/poa-marinha-do-brasil.jpg',
      source: 'Wikimedia Commons',
      photographer: 'Apesito.nomas',
      license: 'CC0',
      verified: true,
    },
    placeholder: null,
  },
  // ── Community-led cases (biweekly 2026-07-16: "look at how the community
  // did it, how the process went") — the five below are organized/built by
  // residents, not delivered to them. Facts web-verified 2026-07-16; the set
  // is under Robson/Vila Flores validation (see the validation doc) — wrong
  // picks get swapped, so keep each card self-contained.
  {
    id: 'rio-mutirao-reflorestamento',
    org: 'Mutirão Reflorestamento',
    city: 'Rio de Janeiro, RJ',
    year: 1986,
    hazard: 'mixed',
    typeRefs: ['urban-forests'],
    summaryPt: 'Moradores reflorestam as encostas das próprias comunidades',
    summaryEn: 'Residents reforest the slopes of their own communities',
    detailPt:
      'Desde 1986, moradores das favelas cariocas são contratados em mutirão remunerado pra reflorestar as encostas onde vivem — mais de 15 mil pessoas já passaram pelo programa e mais de 3.500 ha de encostas em áreas de risco foram recuperados. A comunidade entra com o trabalho; a prefeitura com mudas, ferramentas, EPI e apoio técnico.',
    detailEn:
      'Since 1986, residents of Rio\'s favelas have been hired through paid mutirões to reforest the slopes where they live — over 15,000 people have taken part and 3,500+ ha of at-risk hillsides recovered. The community brings the work; the city brings seedlings, tools, PPE and technical support.',
    // Fonte: prefeitura.rio (35 anos do programa) + World Bank blog (2023).
    // Alto dos Teixeiras, 2019 — the same hillside the programme's own
    // before/after pair documents. Shows the RESULT rather than the mutirão;
    // the archive's planting-day frames are 300px thumbnails.
    photo: {
      path: '/assets/showcase/rio-mutirao-reflorestamento.jpg',
      source: 'Prefeitura do Rio de Janeiro — SMAC, Refloresta Rio',
      photographer: 'Ângela Meurer / SMAC',
      license: 'Prefeitura source — terms not stated, attribution given',
      verified: true,
    },
    placeholder: null,
  },
  {
    id: 'bh-jardim-chuva-barreiro',
    org: 'Jardim de chuva da EMEI Solar Urucuia',
    city: 'Belo Horizonte, MG',
    year: 2025,
    hazard: 'flood',
    typeRefs: ['bioswales-rain-gardens'],
    summaryPt: 'Um jardim de chuva feito em mutirão — começou com uma professora',
    summaryEn: 'A rain garden built by mutirão — it started with one teacher',
    detailPt:
      'No Barreiro, uma professora da escola infantil procurou a prefeitura atrás de uma solução pro alagamento. O bairro se organizou: grupo de WhatsApp, reuniões, rifa pra bancar parte da obra — e o jardim foi plantado em mutirão com os moradores e as crianças (inaugurado em 2025). Primeiro jardim de chuva de BH feito em parceria com a comunidade.',
    detailEn:
      'In Barreiro, a preschool teacher went to the city hall looking for a flooding fix. The neighborhood organized: a WhatsApp group, meetings, a raffle to fund part of the works — and the garden was planted in a mutirão with residents and the school\'s children (opened 2025). BH\'s first rain garden built in partnership with a community.',
    // Fonte: prefeitura.pbh.gov.br, informe técnico do Barreiro (set/2025).
    // The mutirão itself: the school's children watering the bed they just
    // planted. The card is about a teacher who organised a neighbourhood —
    // this is that day, not the finished landscaping.
    photo: {
      path: '/assets/showcase/bh-jardim-chuva-barreiro.jpg',
      source: 'Prefeitura de Belo Horizonte — inauguração, 20/09/2025',
      photographer: 'Aline Pereira / PBH',
      license: 'Prefeitura source — terms not stated, attribution given',
      verified: true,
    },
    placeholder: null,
  },
  {
    id: 'sp-horta-das-corujas',
    org: 'Horta das Corujas',
    city: 'São Paulo, SP',
    year: 2012,
    hazard: 'biodiversity',
    typeRefs: [],
    summaryPt: 'Vizinhos ocuparam uma praça e criaram a 1ª horta comunitária de SP',
    summaryEn: "Neighbors took over a square and created SP's first community garden",
    detailPt:
      'Nasceu de um grupo de Facebook (Hortelões Urbanos) e virou a primeira grande horta comunitária de São Paulo: 800 m² numa praça pública da Vila Beatriz, tocada por voluntários com escala de rega e canteiros adotados. No caminho, recuperaram uma das nascentes que alimentam o Córrego das Corujas. Sem dono, sem cerca — e funcionando desde 2012.',
    detailEn:
      "Born in a Facebook group (Hortelões Urbanos), it became São Paulo's first major community garden: 800 m² in a public square in Vila Beatriz, run by volunteers with a watering rota and adopted beds. Along the way they recovered one of the springs feeding the Córrego das Corujas. No owner, no fence — running since 2012.",
    // Fonte: hortadascorujas.wordpress.com (Sobre a Horta) + Recicla Sampa.
    // From the horta's OWN blog, credited to one of its volunteers — the
    // community's material, not the stock-agency frame that was the only
    // other published option.
    photo: {
      path: '/assets/showcase/sp-horta-das-corujas.jpg',
      source: 'Horta das Corujas (hortadascorujas.wordpress.com)',
      photographer: 'Ana Elisa de Rizzo',
      license: 'Community blog — attribution given, permission to confirm',
      verified: true,
    },
    placeholder: null,
  },
  {
    id: 'poa-hortas-agroflorestais',
    org: 'Hortas Comunitárias Agroflorestais',
    city: 'Porto Alegre, RS',
    year: 2024,
    hazard: 'biodiversity',
    typeRefs: [],
    summaryPt: 'Hortas agroflorestais escolhidas e mantidas pelas comunidades',
    summaryEn: 'Agroforestry gardens chosen and kept by the communities',
    detailPt:
      'Porto Alegre está implantando 68 hortas comunitárias agroflorestais — os locais são escolhidos com a população pelo Orçamento Participativo e a manutenção é das próprias comunidades, com apoio da OSC Ecos. Dezesseis já funcionavam no fim de 2024. A da Lomba do Pinheiro articula moradores, secretarias e universidades no mesmo espaço.',
    detailEn:
      'Porto Alegre is rolling out 68 agroforestry community gardens — sites are chosen with residents through Participatory Budgeting and maintenance is done by the communities themselves, supported by the CSO Ecos. Sixteen were running by late 2024. The Lomba do Pinheiro garden brings residents, city departments and universities into one space.',
    // Fonte: prefeitura.poa.br/smgov (dez/2024). The photo comes from THAT
    // release (IBPA 141905, 2024-12-28) — same source as the facts above.
    photo: {
      path: '/assets/showcase/poa-hortas-agroflorestais.jpg',
      source: 'Wikimedia Commons — Agência Porto Alegre (IBPA 141905)',
      photographer: 'Marilia Jung / SMGOV / PMPA',
      license: 'Attribution (PMPA)',
      verified: true,
    },
    placeholder: null,
  },
  {
    id: 'asa-um-milhao-de-cisternas',
    org: 'ASA — Um Milhão de Cisternas (P1MC)',
    city: 'Semiárido brasileiro',
    year: 2003,
    hazard: 'mixed',
    typeRefs: [],
    summaryPt: 'Mais de 1 milhão de cisternas construídas pelas próprias famílias',
    summaryEn: 'Over 1 million cisterns built by the families themselves',
    detailPt:
      'A maior obra hídrica comunitária do país: famílias do Semiárido, com pedreiros locais capacitados pelo programa, construíram mais de 1 milhão de cisternas de placas de 16 mil litros pra captar água da chuva. Prova de que mutirão organizado chega a uma escala que nenhuma empreiteira alcançou — tecnologia simples, dona é a família.',
    detailEn:
      "Brazil's largest community-built water infrastructure: families across the Semiárido, with locally trained masons, built over 1 million 16,000-liter plate cisterns to harvest rainwater. Proof that organized mutirões reach a scale no contractor ever did — simple technology, owned by the family.",
    // Fonte: asabrasil.org.br (P1MC).
    // A calçadão catchment slab feeding its cistern, in the caatinga. The
    // sibling frame from the same story is a portrait of Dona Lia with no
    // cistern in it — warmer, but it does not show the intervention, and an
    // identifiable person raises a question separate from copyright.
    photo: {
      path: '/assets/showcase/asa-um-milhao-de-cisternas.jpg',
      source: 'Agência Brasil',
      photographer: 'Camila Boehm / Agência Brasil',
      license: 'CC-BY (Agência Brasil standing licence)',
      verified: true,
    },
    placeholder: null,
  },
  // ── Rede Sul de Restauração · Banco de Experiências (Julia Caon Froeder,
  // 2026-08-10) ─────────────────────────────────────────────────────────────
  // 27 entries, mostly restoration science on rural land and in protected
  // areas — Pampa grassland management, invasive control in state parks, seed
  // harvesting. Most does not transfer to an org working a school yard in a
  // POA bairro. These three do. Photos and figures come from each project's
  // own page in the portfolio; the network coordinates at redesulre@gmail.com.
  {
    id: 'poa-microflorestas-urbanas',
    org: 'Microflorestas Urbanas · Virada Sustentável',
    city: 'Porto Alegre, RS',
    year: 2023,
    hazard: 'mixed',
    typeRefs: ['urban-forests'],
    summaryPt: 'Mata densa em 100 m² — e em um ano já passa da cabeça',
    summaryEn: 'Dense forest in 100 m² — head-high within a year',
    detailPt:
      'Método Miyawaki: plantio bem adensado de nativas que cresce cerca de 10 vezes mais rápido que o plantio tradicional. Precisa de no mínimo 100 m². Em Porto Alegre já são três. Na escola Alberto Torres, na zona sul, quem cuida são estudantes e professoras, e a microfloresta virou matéria de aula. No Foro 1 do TJRS foram 300 mudas de 34 espécies nativas, numa área que alagou em 2024 — ali o plantio serve pra absorver água e baixar a temperatura, e já apareceram pássaros. Na frente do CEIKA, mais 300 mudas de 30 espécies da Mata Atlântica, com irrigação automática e visita mensal no primeiro ano.',
    detailEn:
      'Miyawaki method: densely packed native planting that grows around 10 times faster than conventional planting. Needs at least 100 m². Porto Alegre has three. At Alberto Torres school in the south zone, students and teachers do the upkeep and the microforest became part of lessons. At the TJRS courthouse, 300 seedlings of 34 native species went into an area that flooded in 2024 — there the planting is for absorbing water and lowering temperature, and birds have already arrived. In front of CEIKA, another 300 seedlings of 30 Atlantic Forest species, with automatic irrigation and monthly visits through the first year.',
    // The photo is the project's own labelled before/after — "2023 Plantio" /
    // "2024 · 1 ano depois", same people, same spot, knee-high to overhead.
    // It answers "does this work, and how fast" without a caption.
    photo: {
      path: '/assets/showcase/poa-microflorestas-urbanas.jpg',
      source: 'Rede Sul de Restauração — Banco de Experiências',
      photographer: 'Julia Caon Froeder / Virada Sustentável',
      license: 'Shared for the COUGAR pilot — attribution given',
      verified: true,
    },
    placeholder: null,
  },
  {
    id: 'rs-muvuca-arroio-corupa',
    org: 'Muvuca de sementes · Arroio Corupá',
    city: 'Agudo, RS',
    year: 2024,
    hazard: 'flood',
    typeRefs: ['wetland-restoration'],
    summaryPt: 'Semear direto no chão, sem mudas — 330 m² num mutirão de 50 pessoas',
    summaryEn: 'Direct seeding, no seedlings — 330 m² in a 50-person mutirão',
    detailPt:
      'A enchente de abril e maio de 2024 levou a mata da beira do Arroio Corupá. Em outubro, mais de 50 pessoas semearam 330 m² direto no chão: 3,9 kg de sementes de 22 espécies nativas misturadas com 6,8 kg de adubação verde — é isso que chamam de muvuca, e sai bem mais barato que plantar muda por muda. Nove meses depois, nove espécies de árvore tinham pegado e a crotalária já cobria o solo. O relato também conta o que deu errado: capim-elefante e mamona voltaram e disputam espaço até hoje.',
    detailEn:
      "The April–May 2024 flood took out the riparian forest along Arroio Corupá. In October, 50+ people direct-seeded 330 m²: 3.9 kg of seed from 22 native species mixed with 6.8 kg of green manure — that mix is the muvuca, and it costs far less than planting seedling by seedling. Nine months on, nine tree species had taken and crotalária had covered the ground. The write-up is equally clear about what went wrong: elephant grass and castor bean came back and are still competing.",
    photo: {
      path: '/assets/showcase/rs-muvuca-arroio-corupa.jpg',
      source: 'Rede Sul de Restauração — Banco de Experiências',
      photographer: 'Matheus Degrandi Gazzola / NEPRADE-UFSM',
      license: 'Shared for the COUGAR pilot — attribution given',
      verified: true,
    },
    placeholder: null,
  },
  {
    id: 'rs-quarta-colonia-saf',
    org: 'Restaura CEQC · Corredor Ecológico da Quarta Colônia',
    city: 'Quarta Colônia, RS',
    // ⚠️ The portfolio page states no date. 2024 is OUR inference: same
    // NEPRADE-UFSM / TAESA programme as the Arroio Corupá muvuca above, and
    // Agudo is one of the CEQC municipalities. Correct it if Pedro says
    // otherwise — do not treat this year as sourced.
    year: 2024,
    hazard: 'biodiversity',
    typeRefs: [],
    summaryPt: 'Agrofloresta desenhada junto com quem mora e trabalha na terra',
    summaryEn: 'Agroforestry designed together with the families who work the land',
    detailPt:
      'Sete sistemas agroflorestais em propriedades de agricultura familiar, em seis municípios do corredor ecológico. As espécies são nativas — araucária, juçara, cedro, canjerana, louro-pardo, camboatá-vermelho, aroeira-salso — junto com frutíferas exóticas não invasoras. O desenho de cada sistema é feito com a família que vai cuidar dele, não entregue pronto. A equipe técnica é da UFSM e acompanha em campo.',
    detailEn:
      'Seven agroforestry systems on family farms across six municipalities of the ecological corridor. The species are native — araucária, juçara, cedro, canjerana, louro-pardo, camboatá-vermelho, aroeira-salso — alongside non-invasive exotic fruit trees. Each system is designed with the family who will tend it rather than handed over finished. The technical team is from UFSM and follows up on site.',
    photo: {
      path: '/assets/showcase/rs-quarta-colonia-saf.jpg',
      source: 'Rede Sul de Restauração — Banco de Experiências',
      photographer: 'Pedro Braga Nunes / NEPRADE-UFSM',
      license: 'Shared for the COUGAR pilot — attribution given',
      verified: true,
    },
    placeholder: null,
  },
];

export function getShowcaseCard(id: string): NbsShowcaseCard | undefined {
  return NBS_SHOWCASE_CARDS.find(c => c.id === id);
}

/**
 * Filter by tag — hazard and/or NBS type. `typeRefs` keeps cards that represent
 * ANY of the requested types (used by E2 to show examples tied to the NBS types
 * the user just learned about).
 */
export function filterShowcaseCards(opts?: { hazard?: ShowcaseHazard; typeRefs?: string[] }): NbsShowcaseCard[] {
  if (!opts) return NBS_SHOWCASE_CARDS;
  return NBS_SHOWCASE_CARDS.filter(c => {
    if (opts.hazard && c.hazard !== opts.hazard && c.hazard !== 'mixed') return false;
    if (opts.typeRefs && opts.typeRefs.length > 0 && !c.typeRefs.some(t => opts.typeRefs!.includes(t))) return false;
    return true;
  });
}


/**
 * The same 13 cases, with the ones matching what the org named first.
 *
 * COUGAR convening 2026-08-06: orgs should be able to reference real cases WHILE
 * they choose, instead of choosing blind. Ordering rather than filtering is
 * deliberate — the ranking that would do the filtering runs on bairro averages,
 * not on their site, and an org finding something we didn't predict for them is
 * a feature. Same promise the flow makes out loud: nada fica descartado.
 *
 * `mixed` sits between: it speaks to their hazard among others.
 */
export function orderShowcaseCardsFor(
  cards: typeof NBS_SHOWCASE_CARDS,
  families: string[],
): typeof NBS_SHOWCASE_CARDS {
  if (families.length === 0) return cards;
  const rank = (c: { hazard: string }) =>
    families.includes(c.hazard) ? 0 : c.hazard === 'mixed' ? 1 : 2;
  return [...cards].sort((a, b) => rank(a) - rank(b));
}

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
    photo: null,
    placeholder: {
      gradient: 'biodiversity',
      emoji: '🌱',
    },
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
    photo: null,
    placeholder: {
      gradient: 'biodiversity',
      emoji: '🌳',
    },
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
    photo: null,
    placeholder: {
      gradient: 'biodiversity',
      emoji: '⛰️',
    },
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
    photo: null,
    placeholder: {
      gradient: 'flood',
      emoji: '🌧️',
    },
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
    photo: null,
    placeholder: {
      gradient: 'biodiversity',
      emoji: '🥬',
    },
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
    photo: null,
    placeholder: {
      gradient: 'flood',
      emoji: '🛢️',
    },
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

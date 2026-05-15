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
];

export function getShowcaseCard(id: string): NbsShowcaseCard | undefined {
  return NBS_SHOWCASE_CARDS.find(c => c.id === id);
}

/** Filter by tag — currently just hazard. Extend with more dimensions as we add cards. */
export function filterShowcaseCards(opts?: { hazard?: ShowcaseHazard }): NbsShowcaseCard[] {
  if (!opts) return NBS_SHOWCASE_CARDS;
  return NBS_SHOWCASE_CARDS.filter(c => {
    if (opts.hazard && c.hazard !== opts.hazard && c.hazard !== 'mixed') return false;
    return true;
  });
}

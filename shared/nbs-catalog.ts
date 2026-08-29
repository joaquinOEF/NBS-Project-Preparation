// The Rede SCbN POA solution catalog — 5 famílias × 27 soluções.
//
// Source of truth: the printed card deck "A4 - cartas_scbn" produced by the
// Rede SCbN de POA / Vila Flores. Every card carries a "Pra que serve?" field
// (inherited from the MMA/Arcadis Manual Prático de Aplicabilidade de SbN nos
// Municípios Brasileiros) and that field partitions the 27 cards into exactly
// five famílias — we adopt that classification verbatim rather than inventing
// a taxonomy the cohort would then have to reconcile with the cards on the
// table. Decision record: biweekly proposal (2026-07-15).
//
// Two-level model: the agent recommends at the FAMÍLIA level (hazard + site
// data support that); the organization picks the VARIANTE (terrain, tenure and
// politics are theirs to know). `legacyTypeId` links a solution to one of the
// six deep-content NBS_INTERVENTION_TYPES where one exists, so croquis, cost
// research and knowledge files keep working; solutions without a legacy type
// (all of Agricultura Urbana and Encostas e Solo) fall back to the card photo
// and this catalog's ficha.
//
// `costBand`/`delivery` are OUR classification, pending verification against
// the MMA manual — hence `classificationEstimated: true` on every solution.
// Where a solution maps to a researched legacy type, the values are copied
// from NBS_TYPE_CONTENT so the two layers never disagree.
//
// Photos: extracted from the deck PDF, one per card, under
// `client/public/assets/nbs/solutions/<id>.jpg`. They are documentary photos
// of named places curated by the deck's authors — credit the card's "Fonte"
// line. ⚠️ Written permission from Vila Flores/Rede to reuse them in-app is
// pending (tracked in docs/photo-curation.md).

import { WORRY_SUBTYPES, type WorryId } from './site-knowledge';
import type { NbsInterventionTypeId } from './cbo-schema';
import type { NbsCostBand, NbsDelivery } from './nbs-type-content';

export const NBS_FAMILIAS = [
  {
    id: 'aguas-pluviais',
    emoji: '💧',
    color: '#4B5C8A',
    coverSolutionId: 'jardins-de-chuva',
    croqui: '/assets/nbs/types/bioswales-rain-gardens.jpg',
    croquiBefore: '/assets/nbs/types/bioswales-rain-gardens--before.jpg',
    croquiCaptions: {
      pt: { antes: 'Hoje: a chuva corre pela rua e o bueiro entope.', depois: 'Depois: a água entra na terra e some em poucas horas.' },
      en: { antes: 'Today: rain runs down the street and the drain clogs.', depois: 'After: the water soaks in and is gone within hours.' },
    },
    pt: {
      label: 'Gestão de Águas Pluviais',
      description: 'Infiltrar, reter e tratar a água da chuva para reduzir alagamentos.',
    },
    en: {
      label: 'Stormwater Management',
      description: 'Infiltrate, retain and treat rainwater to reduce flooding.',
    },
    hazards: { flood: 1, heat: 0.2, landslide: 0.3 },
  },
  {
    id: 'verde-urbano',
    emoji: '🌳',
    color: '#6E8E9B',
    coverSolutionId: 'parques-e-florestas-urbanas',
    croqui: '/assets/nbs/types/urban-forests.jpg',
    croquiBefore: '/assets/nbs/types/urban-forests--before.jpg',
    croquiCaptions: {
      pt: { antes: 'Hoje: terreno baldio com entulho, mato seco e lixo.', depois: 'Depois: mata fechada, sombra, e um caminho de terra por dentro.' },
      en: { antes: 'Today: a vacant lot with rubble, dry weeds and litter.', depois: 'After: closed forest, shade, and an earth path through it.' },
    },
    pt: {
      label: 'Infraestrutura Verde Urbana',
      description: 'Mais verde no tecido da cidade — sombra, lazer e menos calor.',
    },
    en: {
      label: 'Urban Green Infrastructure',
      description: 'More green in the city fabric — shade, leisure and less heat.',
    },
    hazards: { flood: 0.4, heat: 1, landslide: 0.1 },
  },
  {
    id: 'agricultura-urbana',
    emoji: '🌱',
    color: '#8F7041',
    coverSolutionId: 'hortas-urbanas',
    croqui: '/assets/nbs/familias/agricultura-urbana.jpg',
    croquiBefore: '/assets/nbs/familias/agricultura-urbana--before.jpg',
    croquiCaptions: {
      pt: { antes: 'Hoje: um terreno baldio fechado, que só junta lixo.', depois: 'Depois: canteiros produzindo, composteira, e o bairro cuidando do espaço.' },
      en: { antes: 'Today: a fenced-off vacant lot that only collects litter.', depois: 'After: beds producing food, a composter, and the neighbourhood caring for the space.' },
    },
    pt: {
      label: 'Agricultura Urbana',
      description: 'Alimento, compostagem e economia circular no território.',
    },
    en: {
      label: 'Urban Agriculture',
      description: 'Food, composting and circular economy in the territory.',
    },
    hazards: { flood: 0.1, heat: 0.3, landslide: 0 },
  },
  {
    id: 'encostas-e-solo',
    emoji: '⛰️',
    color: '#8A4C38',
    coverSolutionId: 'muro-de-arrimo-verde',
    croqui: '/assets/nbs/familias/encostas-e-solo.jpg',
    croquiBefore: '/assets/nbs/familias/encostas-e-solo--before.jpg',
    croquiCaptions: {
      pt: { antes: 'Hoje: barranco pelado — cada chuva leva mais terra pra perto da casa.', depois: 'Depois: raízes e grade viva segurando o morro; a água desce pelo canal.' },
      en: { antes: 'Today: a bare slope — every rain carries more soil toward the house.', depois: 'After: roots and a living grid holding the hill; water runs down the channel.' },
    },
    pt: {
      label: 'Estabilização de Encostas e Solo',
      description: 'Segurar taludes e conter erosão em áreas de risco.',
    },
    en: {
      label: 'Slope & Soil Stabilization',
      description: 'Secure slopes and contain erosion in risk areas.',
    },
    hazards: { flood: 0.2, heat: 0, landslide: 1 },
  },
  {
    id: 'recuperacao-ecossistemas',
    emoji: '🌿',
    color: '#4E6B50',
    coverSolutionId: 'reflorestamento',
    croqui: '/assets/nbs/types/wetland-restoration.jpg',
    croquiBefore: '/assets/nbs/types/wetland-restoration--before.jpg',
    croquiCaptions: {
      pt: { antes: 'Hoje: arroio sujo, barranco pelado, pneu e cano de esgoto.', depois: 'Depois: água rasa com taboa e junco, garça, e uma passarela na margem.' },
      en: { antes: 'Today: a dirty stream, bare banks, tyres and a sewage pipe.', depois: 'After: shallow water with cattail and rush, herons, and a boardwalk along the bank.' },
    },
    pt: {
      label: 'Recuperação de Ecossistemas Naturais',
      description: 'Restaurar matas, várzeas e margens que protegem a cidade.',
    },
    en: {
      label: 'Ecosystem Restoration',
      description: 'Restore forests, floodplains and riverbanks that protect the city.',
    },
    hazards: { flood: 0.7, heat: 0.5, landslide: 0.4 },
  },
] as const;

export type NbsFamiliaId = (typeof NBS_FAMILIAS)[number]['id'];

export interface NbsSolution {
  id: string;
  familiaId: NbsFamiliaId;
  pt: { label: string; whatItIs: string };
  en: { label: string; whatItIs: string };
  /** Deep-content type this solution inherits croqui/costs/knowledge from. */
  legacyTypeId?: NbsInterventionTypeId;
  /** Who can build it — same enum the type cards use. */
  delivery: NbsDelivery;
  costBand: NbsCostBand;
  /** delivery/costBand are our read of the card, not yet verified against the MMA manual. */
  classificationEstimated: true;
  /** "Onde encontrar?" on the card — the named place the photo documents. */
  exampleCity: string;
  /** The card's "Fonte" line — governs the photo credit. */
  source: string;
}

const MMA_MANUAL = 'MMA — Manual Prático Aplicabilidade de SbN nos Municípios Brasileiros';
const GIZ_CATALOGO = 'GIZ — Catálogo de Soluções baseadas na Natureza para Espaços Livres';
const CNM_CONTRIBUICOES = 'CNM — Contribuições das SbN para a gestão municipal';
const MMA_COMUNITARIAS = 'MMA — Soluções Comunitárias Baseadas na Natureza';

export const NBS_SOLUTIONS: NbsSolution[] = [
  // ── Gestão de Águas Pluviais (11) ──────────────────────────────────────
  {
    id: 'jardins-de-chuva',
    familiaId: 'aguas-pluviais',
    pt: {
      label: 'Jardins de chuva',
      whatItIs:
        'Áreas verdes projetadas para receber e infiltrar a água da chuva, reduzindo o escoamento superficial, prevenindo enchentes urbanas e recarregando aquíferos.',
    },
    en: {
      label: 'Rain gardens',
      whatItIs:
        'Planted areas designed to receive and infiltrate rainwater, reducing surface runoff, preventing urban flooding and recharging aquifers.',
    },
    legacyTypeId: 'bioswales-rain-gardens',
    delivery: 'mutirao',
    costBand: 'baixo',
    classificationEstimated: true,
    exampleCity: 'São Paulo - SP',
    source: `${MMA_MANUAL} | ${GIZ_CATALOGO}`,
  },
  {
    id: 'biovaletas',
    familiaId: 'aguas-pluviais',
    pt: {
      label: 'Biovaletas',
      whatItIs:
        'Valas vegetadas que conduzem e infiltram a água da chuva, permitindo escoamento mais lento e natural, reduzindo erosão e recarregando aquíferos.',
    },
    en: {
      label: 'Bioswales',
      whatItIs:
        'Vegetated channels that convey and infiltrate rainwater, slowing runoff naturally, reducing erosion and recharging aquifers.',
    },
    legacyTypeId: 'bioswales-rain-gardens',
    delivery: 'mutirao',
    costBand: 'baixo',
    classificationEstimated: true,
    exampleCity: 'São Paulo - SP',
    source: `${MMA_MANUAL} | ${GIZ_CATALOGO}`,
  },
  {
    id: 'canteiro-pluvial',
    familiaId: 'aguas-pluviais',
    pt: {
      label: 'Canteiro pluvial',
      whatItIs:
        'Estruturas verdes compactas projetadas para receber e infiltrar a água da chuva em áreas urbanas.',
    },
    en: {
      label: 'Stormwater planter',
      whatItIs:
        'Compact green structures designed to receive and infiltrate rainwater in dense urban areas.',
    },
    legacyTypeId: 'bioswales-rain-gardens',
    delivery: 'mutirao',
    costBand: 'baixo',
    classificationEstimated: true,
    exampleCity: 'São Paulo - SP',
    source: `${MMA_MANUAL} | ${GIZ_CATALOGO}`,
  },
  {
    id: 'bacia-de-retencao',
    familiaId: 'aguas-pluviais',
    pt: {
      label: 'Bacia de retenção',
      whatItIs:
        'Reservatórios construídos para acumular temporariamente a água das chuvas, regulando a vazão e evitando alagamentos nos períodos de chuva intensa.',
    },
    en: {
      label: 'Retention basin',
      whatItIs:
        'Constructed reservoirs that temporarily store rainwater, regulating flow and preventing flooding during intense rainfall.',
    },
    legacyTypeId: 'flood-parks',
    delivery: 'licenca',
    costBand: 'alto',
    classificationEstimated: true,
    exampleCity: 'Curitiba - PR',
    source: `${MMA_MANUAL} | ${GIZ_CATALOGO}`,
  },
  {
    id: 'wetland-construido',
    familiaId: 'aguas-pluviais',
    pt: {
      label: 'Wetland construído',
      whatItIs:
        'Zona úmida artificial ou natural que atua como sistema ecológico de tratamento e retenção de águas da chuva, escoamento urbano ou águas residuais.',
    },
    en: {
      label: 'Constructed wetland',
      whatItIs:
        'Artificial or natural wetland acting as an ecological system to treat and retain stormwater, urban runoff or wastewater.',
    },
    legacyTypeId: 'wetland-restoration',
    delivery: 'licenca',
    costBand: 'alto',
    classificationEstimated: true,
    exampleCity: 'Fortaleza - CE',
    source: `${MMA_MANUAL} | ${GIZ_CATALOGO}`,
  },
  {
    id: 'pavimentos-permeaveis',
    familiaId: 'aguas-pluviais',
    pt: {
      label: 'Pavimentos permeáveis',
      whatItIs:
        'Ruas ou calçadas construídas com materiais que permitem a infiltração da água da chuva, reduzindo o escoamento superficial e recarregando aquíferos.',
    },
    en: {
      label: 'Permeable pavements',
      whatItIs:
        'Streets or sidewalks built with materials that let rainwater infiltrate, reducing surface runoff and recharging aquifers.',
    },
    delivery: 'parceria',
    costBand: 'medio',
    classificationEstimated: true,
    exampleCity: 'São Paulo - SP',
    source: `${MMA_MANUAL} | ${CNM_CONTRIBUICOES}`,
  },
  {
    id: 'escada-hidraulica-vegetada',
    familiaId: 'aguas-pluviais',
    pt: {
      label: 'Escada hidráulica vegetada',
      whatItIs:
        'Estrutura em degraus que conduz a água em terrenos inclinados, diminuindo sua velocidade e prevenindo processos erosivos em encostas.',
    },
    en: {
      label: 'Vegetated hydraulic steps',
      whatItIs:
        'Stepped structure that guides water down sloped terrain, slowing it and preventing erosion on hillsides.',
    },
    delivery: 'licenca',
    costBand: 'medio',
    classificationEstimated: true,
    exampleCity: 'São Bernardo do Campo - SP',
    source: `${MMA_MANUAL} | ${GIZ_CATALOGO}`,
  },
  {
    id: 'terracos-de-chuva',
    familiaId: 'aguas-pluviais',
    pt: {
      label: 'Terraços de chuva',
      whatItIs:
        'Estruturas côncavas implantadas no declive do terreno que coletam e absorvem o escoamento superficial, inspiradas nos terraceamentos chineses.',
    },
    en: {
      label: 'Rain terraces',
      whatItIs:
        'Concave structures set into sloping ground that collect and absorb surface runoff, inspired by Chinese terracing.',
    },
    delivery: 'mutirao',
    costBand: 'baixo',
    classificationEstimated: true,
    exampleCity: 'Campinas - SP',
    source: `${MMA_MANUAL} | ${GIZ_CATALOGO}`,
  },
  {
    id: 'ilhas-filtrantes-flutuantes',
    familiaId: 'aguas-pluviais',
    pt: {
      label: 'Ilhas filtrantes flutuantes',
      whatItIs:
        'Plataformas vegetadas instaladas em corpos d’água urbanos que filtram poluentes e nutrientes, melhorando a qualidade da água e a biodiversidade aquática.',
    },
    en: {
      label: 'Floating filter islands',
      whatItIs:
        'Vegetated platforms installed on urban water bodies that filter pollutants and nutrients, improving water quality and aquatic biodiversity.',
    },
    delivery: 'parceria',
    costBand: 'baixo',
    classificationEstimated: true,
    exampleCity: 'São Paulo - SP',
    source: `${MMA_MANUAL} | ${GIZ_CATALOGO}`,
  },
  {
    id: 'barraginha',
    familiaId: 'aguas-pluviais',
    pt: {
      label: 'Barraginha',
      whatItIs:
        'Pequenas bacias escavadas no solo, geralmente em áreas rurais ou periurbanas, que captam a água da chuva, facilitando a infiltração e reduzindo a erosão.',
    },
    en: {
      label: 'Micro-catchment basin',
      whatItIs:
        'Small basins dug into the soil, usually in rural or peri-urban areas, that capture rainwater, aiding infiltration and reducing erosion.',
    },
    delivery: 'mutirao',
    costBand: 'baixo',
    classificationEstimated: true,
    exampleCity: 'Almas - TO',
    source: MMA_MANUAL,
  },
  {
    id: 'captacao-agua-da-chuva',
    familiaId: 'aguas-pluviais',
    pt: {
      label: 'Captação de água da chuva',
      whatItIs:
        'Sistema de reaproveitamento que armazena água da chuva em cisternas para usos que não exigem água potável, como descarga, irrigação e limpeza.',
    },
    en: {
      label: 'Rainwater harvesting',
      whatItIs:
        'Reuse system that stores rainwater in cisterns for non-potable uses such as flushing, irrigation and cleaning.',
    },
    delivery: 'mutirao',
    costBand: 'baixo',
    classificationEstimated: true,
    exampleCity: 'Campinas - SP',
    source: MMA_COMUNITARIAS,
  },

  // ── Infraestrutura Verde Urbana (6) ────────────────────────────────────
  {
    id: 'parques-e-florestas-urbanas',
    familiaId: 'verde-urbano',
    pt: {
      label: 'Parques e florestas urbanas',
      whatItIs:
        'Áreas verdes públicas no interior dos centros urbanos, com variedade de espécies arbóreas, arbustivas e herbáceas, conservadas para o equilíbrio ambiental da cidade.',
    },
    en: {
      label: 'Urban parks and forests',
      whatItIs:
        'Public green areas inside urban centers, with diverse tree, shrub and herbaceous species, conserved for the city’s environmental balance.',
    },
    legacyTypeId: 'urban-forests',
    delivery: 'parceria',
    costBand: 'medio',
    classificationEstimated: true,
    exampleCity: 'Porto Alegre - RS',
    source: MMA_COMUNITARIAS,
  },
  {
    id: 'teto-verde',
    familiaId: 'verde-urbano',
    pt: {
      label: 'Teto verde',
      whatItIs:
        'Cobertura vegetal instalada em telhados que retém água da chuva, reduz ilhas de calor e melhora o isolamento térmico das construções.',
    },
    en: {
      label: 'Green roof',
      whatItIs:
        'Vegetated roof cover that retains rainwater, reduces heat islands and improves buildings’ thermal insulation.',
    },
    legacyTypeId: 'green-roofs-walls',
    delivery: 'mutirao',
    costBand: 'baixo',
    classificationEstimated: true,
    exampleCity: 'Salvador - BA',
    source: `${MMA_MANUAL} | ${CNM_CONTRIBUICOES}`,
  },
  {
    id: 'corredores-verdes',
    familiaId: 'verde-urbano',
    pt: {
      label: 'Corredores verdes',
      whatItIs:
        'Faixas contínuas de vegetação que conectam fragmentos florestais ou áreas verdes dentro das cidades, criando rotas ecológicas.',
    },
    en: {
      label: 'Green corridors',
      whatItIs:
        'Continuous strips of vegetation connecting forest fragments or green areas within cities, creating ecological routes.',
    },
    legacyTypeId: 'green-corridors',
    delivery: 'parceria',
    costBand: 'medio',
    classificationEstimated: true,
    exampleCity: 'São Paulo - SP',
    source: `${MMA_MANUAL} | ${MMA_COMUNITARIAS}`,
  },
  {
    id: 'parques-lineares',
    familiaId: 'verde-urbano',
    pt: {
      label: 'Parques lineares',
      whatItIs:
        'Áreas verdes ao longo de cursos d’água, avenidas ou ferrovias que contribuem para a permeabilidade do solo e o lazer da população.',
    },
    en: {
      label: 'Linear parks',
      whatItIs:
        'Green areas along watercourses, avenues or railways that improve soil permeability and provide leisure space.',
    },
    legacyTypeId: 'green-corridors',
    delivery: 'parceria',
    costBand: 'medio',
    classificationEstimated: true,
    exampleCity: 'Parque Linear Tiquatira - SP',
    source: MMA_MANUAL,
  },
  {
    id: 'escola-verde',
    familiaId: 'verde-urbano',
    pt: {
      label: 'Escola verde',
      whatItIs:
        'Projeto que integra áreas verdes aos espaços escolares, aumentando a cobertura vegetal urbana e criando espaços ao ar livre para lazer e contato com a natureza.',
    },
    en: {
      label: 'Green school',
      whatItIs:
        'Project integrating green areas into school grounds, increasing urban vegetation cover and creating outdoor spaces for leisure and contact with nature.',
    },
    delivery: 'parceria',
    costBand: 'baixo',
    classificationEstimated: true,
    exampleCity: 'Jundiaí - SP',
    source: MMA_COMUNITARIAS,
  },
  {
    id: 'parque-naturalizado',
    familiaId: 'verde-urbano',
    pt: {
      label: 'Parque naturalizado',
      whatItIs:
        'Espaço que usa elementos naturais para brincadeiras livres e criativas, desenhado a partir do relevo e solo do terreno, integrando a rede de áreas verdes da cidade.',
    },
    en: {
      label: 'Naturalized playground',
      whatItIs:
        'Space using natural elements for free, creative play, designed from the site’s relief and soil, integrated into the city’s green network.',
    },
    delivery: 'parceria',
    costBand: 'medio',
    classificationEstimated: true,
    exampleCity: 'Jundiaí - SP',
    source: MMA_COMUNITARIAS,
  },

  // ── Agricultura Urbana (4) ─────────────────────────────────────────────
  {
    id: 'hortas-urbanas',
    familiaId: 'agricultura-urbana',
    pt: {
      label: 'Hortas urbanas',
      whatItIs:
        'Espaços de cultivo de alimentos em terrenos baldios, quintais, praças ou áreas públicas, promovendo segurança alimentar, integração comunitária e educação ambiental.',
    },
    en: {
      label: 'Urban gardens',
      whatItIs:
        'Food-growing spaces on vacant lots, backyards, squares or public areas, promoting food security, community integration and environmental education.',
    },
    delivery: 'mutirao',
    costBand: 'baixo',
    classificationEstimated: true,
    exampleCity: 'Florianópolis - SC',
    source: `${MMA_MANUAL} | ${MMA_COMUNITARIAS}`,
  },
  {
    id: 'compostagem',
    familiaId: 'agricultura-urbana',
    pt: {
      label: 'Compostagem',
      whatItIs:
        'Processo de biodegradação natural da matéria orgânica que transforma resíduos em adubo rico em nutrientes e biofertilizante.',
    },
    en: {
      label: 'Composting',
      whatItIs:
        'Natural biodegradation process that turns organic waste into nutrient-rich fertilizer and biofertilizer.',
    },
    delivery: 'mutirao',
    costBand: 'baixo',
    classificationEstimated: true,
    exampleCity: 'São Paulo - SP',
    source: MMA_COMUNITARIAS,
  },
  {
    id: 'cozinha-comunitaria-biodigestor',
    familiaId: 'agricultura-urbana',
    pt: {
      label: 'Cozinha comunitária com biodigestor',
      whatItIs:
        'Equipamento público que produz refeições acessíveis para comunidades em vulnerabilidade, tornado mais sustentável pelo biodigestor, que gera biogás a partir de matéria orgânica.',
    },
    en: {
      label: 'Community kitchen with biodigester',
      whatItIs:
        'Public facility producing affordable meals for vulnerable communities, made more sustainable by a biodigester that generates biogas from organic waste.',
    },
    delivery: 'parceria',
    costBand: 'medio',
    classificationEstimated: true,
    exampleCity: 'São Paulo - SP',
    source: MMA_COMUNITARIAS,
  },
  {
    id: 'sistema-alimentar-local',
    familiaId: 'agricultura-urbana',
    pt: {
      label: 'Sistema alimentar local e agroecológico',
      whatItIs:
        'Estrutura de organização alimentar sustentável que engloba produção, processamento, distribuição, preparo e consumo de alimentos com base em princípios agroecológicos.',
    },
    en: {
      label: 'Local agroecological food system',
      whatItIs:
        'Sustainable food organization covering production, processing, distribution, preparation and consumption based on agroecological principles.',
    },
    delivery: 'parceria',
    costBand: 'medio',
    classificationEstimated: true,
    exampleCity: 'Porto Alegre - RS',
    source: MMA_COMUNITARIAS,
  },

  // ── Estabilização de Encostas e Solo (4) ───────────────────────────────
  {
    id: 'grade-viva',
    familiaId: 'encostas-e-solo',
    pt: {
      label: 'Grade viva',
      whatItIs:
        'Cercas, paredes ou divisórias estruturadas com vegetação e madeira que estabilizam o solo em áreas inclinadas, ajudando na infiltração e reduzindo a erosão.',
    },
    en: {
      label: 'Living grid',
      whatItIs:
        'Fences, walls or dividers structured with vegetation and timber that stabilize soil on slopes, aiding infiltration and reducing erosion.',
    },
    delivery: 'parceria',
    costBand: 'medio',
    classificationEstimated: true,
    exampleCity: 'Sintra - PORTUGAL',
    source: MMA_MANUAL,
  },
  {
    id: 'muro-de-arrimo-verde',
    familiaId: 'encostas-e-solo',
    pt: {
      label: 'Muro de arrimo verde',
      whatItIs:
        'Muro de contenção revestido por vegetação, com sistemas estruturados ou espontâneos, que estabiliza taludes e melhora a infiltração de água.',
    },
    en: {
      label: 'Green retaining wall',
      whatItIs:
        'Retaining wall covered in vegetation, structured or spontaneous, that stabilizes slopes and improves water infiltration.',
    },
    delivery: 'licenca',
    costBand: 'alto',
    classificationEstimated: true,
    exampleCity: 'Yurimaguas - PERU',
    source: MMA_MANUAL,
  },
  {
    id: 'solo-grampeado-verde',
    familiaId: 'encostas-e-solo',
    pt: {
      label: 'Solo grampeado verde',
      whatItIs:
        'Técnica de estabilização de encostas reforçada internamente com grampos, que garante segurança em áreas de risco e pode ser associada à revegetação da superfície.',
    },
    en: {
      label: 'Green soil nailing',
      whatItIs:
        'Slope-stabilization technique internally reinforced with nails, securing risk areas, often combined with surface revegetation.',
    },
    delivery: 'licenca',
    costBand: 'alto',
    classificationEstimated: true,
    exampleCity: 'Luiz Alves - SC',
    source: `${MMA_MANUAL} | ${GIZ_CATALOGO}`,
  },
  {
    id: 'contencoes-em-geocelulas',
    familiaId: 'encostas-e-solo',
    pt: {
      label: 'Contenções em geocélulas',
      whatItIs:
        'Sistemas de células estruturais preenchidas com solo ou brita que reforçam taludes e encostas, dando estabilidade ao terreno e permitindo revegetação.',
    },
    en: {
      label: 'Geocell containment',
      whatItIs:
        'Structural cell systems filled with soil or gravel that reinforce slopes, stabilizing the terrain and allowing revegetation.',
    },
    delivery: 'licenca',
    costBand: 'alto',
    classificationEstimated: true,
    exampleCity: 'Arraiján - PANAMÁ',
    source: `${MMA_MANUAL} | ${GIZ_CATALOGO}`,
  },

  // ── Recuperação de Ecossistemas Naturais (2) ───────────────────────────
  {
    id: 'reflorestamento',
    familiaId: 'recuperacao-ecossistemas',
    pt: {
      label: 'Reflorestamento',
      whatItIs:
        'Plantio de árvores nativas em áreas degradadas ou desmatadas para restaurar ecossistemas, proteger recursos hídricos e recuperar a biodiversidade local.',
    },
    en: {
      label: 'Reforestation',
      whatItIs:
        'Planting native trees in degraded or deforested areas to restore ecosystems, protect water resources and recover local biodiversity.',
    },
    legacyTypeId: 'urban-forests',
    delivery: 'mutirao',
    costBand: 'medio',
    classificationEstimated: true,
    exampleCity: 'Parque Nacional da Tijuca - RJ',
    source: MMA_MANUAL,
  },
  {
    id: 'restauracao-areas-umidas',
    familiaId: 'recuperacao-ecossistemas',
    pt: {
      label: 'Restauração de áreas úmidas e margens',
      whatItIs:
        'Recuperação de ecossistemas e zonas de transição entre terra e água, garantindo maior resiliência contra enchentes, erosão e degradação ambiental.',
    },
    en: {
      label: 'Wetland and riverbank restoration',
      whatItIs:
        'Recovery of ecosystems and land–water transition zones, building resilience against floods, erosion and environmental degradation.',
    },
    legacyTypeId: 'wetland-restoration',
    delivery: 'licenca',
    costBand: 'alto',
    classificationEstimated: true,
    exampleCity: 'Pantanal - MT',
    source: `${MMA_MANUAL} | ${MMA_COMUNITARIAS}`,
  },
];

export type NbsSolutionId = (typeof NBS_SOLUTIONS)[number]['id'];

/** `/assets/nbs/solutions/<id>.jpg` — the solution's own card photo. */
export function nbsSolutionPhoto(id: NbsSolutionId): string {
  return `/assets/nbs/solutions/${id}.jpg`;
}

// ═══════════════════════════════════════════════════════════════════════════
// WHICH MECHANISM A SOLUTION ANSWERS  ⚠️ PROVISIONAL
// ═══════════════════════════════════════════════════════════════════════════
//
// COUGAR convening 2026-08-06: "solution types differ fundamentally by hazard
// type". An org that says Inundação should not be shown rain gardens first — a
// rain garden answers Alagamento. So the mechanism the org names (see
// WORRY_SUBTYPES) orders the solutions inside a família.
//
// ⚠️ TWO RULES, both load-bearing.
//
// 1. ORDER AND EXPLAIN, NEVER EXCLUDE. The flow promises, in its own words,
//    "Nada fica descartado — dá pra ver as 27 soluções quando quiser." Keep that
//    literally true. Then a wrong tag below costs an org some scrolling instead
//    of hiding the answer they needed.
// 2. THESE TAGS ARE OUR READ, NOT AN EXPERT'S — the same status as
//    `classificationEstimated` on the solutions themselves. Each one is drafted
//    from the solution's OWN `whatItIs` text, not invented: "escada hidráulica
//    vegetada" says "diminuindo sua velocidade" in terrain "inclinado", which is
//    Enxurrada; "parques lineares" says "ao longo de cursos d'água", which is
//    Inundação. Robson/Hesioni to confirm at the convening — this map is
//    deliberately one screen so it can be read and argued with in one sitting.
//
// An empty/absent entry is NEUTRAL, not "irrelevant": the solution simply never
// gets reordered by mechanism. Better than a guess we cannot source.
export const SOLUTION_MECHANISMS: Record<string, WorryId[]> = {
  // ── Águas pluviais — water that pools, drains, or runs ────────────────────
  'jardins-de-chuva': ['alagamento'],                       // "infiltrar… reduzindo o escoamento superficial"
  'biovaletas': ['alagamento', 'enxurrada'],                // "escoamento mais lento… reduzindo erosão"
  'canteiro-pluvial': ['alagamento'],                       // "receber e infiltrar… em áreas urbanas"
  'bacia-de-retencao': ['alagamento', 'enxurrada'],         // "acumular temporariamente… regulando a vazão"
  'wetland-construido': ['alagamento', 'inundacao'],        // "retenção de águas da chuva"; buffers a watercourse
  'pavimentos-permeaveis': ['alagamento'],                  // "infiltração… reduzindo o escoamento"
  'escada-hidraulica-vegetada': ['enxurrada'],              // "terrenos inclinados, diminuindo sua velocidade"
  'terracos-de-chuva': ['enxurrada', 'alagamento'],         // "no declive do terreno… absorvem o escoamento"
  'barraginha': ['enxurrada', 'alagamento'],                // "captam a água da chuva" on periurban slopes
  'captacao-agua-da-chuva': ['alagamento'],                 // cisterns take rain off the surface
  'ilhas-filtrantes-flutuantes': [],                        // water QUALITY in a body of water — no flood mechanism
  // ── Verde urbano ──────────────────────────────────────────────────────────
  'teto-verde': ['heat', 'alagamento'],                     // "retém água da chuva, reduz ilhas de calor"
  'parques-e-florestas-urbanas': ['heat'],
  'corredores-verdes': ['heat'],
  'escola-verde': ['heat'],
  'parque-naturalizado': ['heat'],
  'parques-lineares': ['inundacao'],                        // "ao longo de cursos d'água"
  // ── Encostas e solo — the slope itself, and water arriving down it ────────
  'grade-viva': ['landslide', 'enxurrada'],                 // "estabilizam o solo em áreas inclinadas"
  'muro-de-arrimo-verde': ['landslide'],
  'solo-grampeado-verde': ['landslide'],
  'contencoes-em-geocelulas': ['landslide', 'enxurrada'],
  // ── Recuperação de ecossistemas ───────────────────────────────────────────
  'reflorestamento': ['enxurrada', 'inundacao'],            // slope cover + "proteger recursos hídricos"
  'restauracao-areas-umidas': ['inundacao'],                // "transição entre terra e água… resiliência"
  // ── Agricultura urbana ────────────────────────────────────────────────────
  // Food, soil and organic waste. Real climate value, but not an answer to a
  // water or heat MECHANISM — so neutral rather than tagged for the sake of it.
  'hortas-urbanas': [],
  'compostagem': [],
  'cozinha-comunitaria-biodigestor': [],
  'sistema-alimentar-local': [],
};

/**
 * Solutions reordered so the ones answering the org's named mechanism come
 * first. NEVER filters — see rule 1 above. Stable, so within each group the
 * catalogue order survives.
 */
export function orderSolutionsByMechanism(
  solutions: NbsSolution[],
  worries: string[],
): NbsSolution[] {
  const named = worries.filter(w => w && w !== 'other');
  if (named.length === 0) return solutions;
  const answers = (s: NbsSolution) =>
    (SOLUTION_MECHANISMS[s.id] ?? []).some(m => named.includes(m));
  return [...solutions].sort((a, b) => Number(answers(b)) - Number(answers(a)));
}

/**
 * The one-line reason a solution is near the top, in the org's own vocabulary —
 * "pra água que desce com força" reuses the exact plain-language phrase from the
 * chip they tapped, so the card and the question say the same thing.
 * Null when the solution doesn't answer anything they named: no badge is better
 * than a badge that says nothing.
 */
export function mechanismNote(
  solutionId: string,
  worries: string[],
  lang: 'pt' | 'en' = 'pt',
): string | null {
  const tags = SOLUTION_MECHANISMS[solutionId] ?? [];
  const hit = worries.find(w => tags.includes(w as WorryId));
  if (!hit) return null;
  const sub = WORRY_SUBTYPES.find(w => w.id === hit);
  if (!sub) return null;
  const phrase = (lang === 'pt' ? sub.dPt : sub.dEn).toLowerCase();
  if (lang !== 'pt') return `for ${phrase}`;
  // "pra" + "a água" is "pra a água", which nobody says. The subtype
  // descriptions are written as standalone chip captions ("A água que junta e
  // não escoa"), so the article is theirs and the contraction is ours.
  if (phrase.startsWith('a ')) return `pra ${phrase.slice(2)}`;
  if (phrase.startsWith('o ')) return `pro ${phrase.slice(2)}`;
  return `pra ${phrase}`;
}

export function solutionsForFamilia(familiaId: NbsFamiliaId): NbsSolution[] {
  return NBS_SOLUTIONS.filter((s) => s.familiaId === familiaId);
}

export function getFamilia(familiaId: NbsFamiliaId) {
  return NBS_FAMILIAS.find((f) => f.id === familiaId);
}

export function getSolution(id: string): NbsSolution | undefined {
  return NBS_SOLUTIONS.find((s) => s.id === id);
}

/** Famílias that contain at least one solution mapped to the given legacy type. */
export function familiasForLegacyType(typeId: NbsInterventionTypeId): NbsFamiliaId[] {
  const out: NbsFamiliaId[] = [];
  for (const s of NBS_SOLUTIONS) {
    if (s.legacyTypeId === typeId && !out.includes(s.familiaId)) out.push(s.familiaId);
  }
  return out;
}

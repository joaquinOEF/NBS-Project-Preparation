// Data provenance / "where this data comes from" catalog (data-literacy).
//
// Ana's #1 critique of the maps: people "see colors but don't understand what
// the data means or where it's from" (and Julia repeatedly asked to show the
// vintage). This is the authoritative, plain-language provenance for the layers
// the CBO + orchestrator maps actually display. Sourced from the OEF
// geospatial-data catalog (Open-Earth-Foundation/geospatial-data,
// catalog/datasets.yaml) — NOT invented — so the dates and sources are real.
//
// Shared (client imports it) so the same one dialog serves both views.

export type ProvenanceKey = 'flood' | 'heat' | 'landslide' | 'neighborhoods' | 'sites';

export interface ProvenanceText {
  title: string;
  /** Plain-language: what this layer actually shows. */
  whatItShows: string;
  /** What the colors on the map mean. */
  colorMeaning: string;
  /** Who produced it. */
  source: string;
  /** When it's from — the vintage Julia kept asking for. */
  vintage: string;
  /** Spatial resolution, in words a non-GIS user gets. */
  resolution: string;
  /** An honest limitation — the part that builds trust. */
  caveat: string;
}

export interface ProvenanceEntry {
  key: ProvenanceKey;
  en: ProvenanceText;
  pt: ProvenanceText;
}

export const DATA_PROVENANCE: Record<ProvenanceKey, ProvenanceEntry> = {
  flood: {
    key: 'flood',
    en: {
      title: 'Flood risk',
      whatItShows: 'Where flooding is most likely to cause harm — combining how flood-prone an area is with how many people live there and how vulnerable they are.',
      // ⚠️ This ramp runs the other way to the other two. Verified against the
      // sampled stops in layer-legends.json: #3c2c6c → #4dc16b.
      colorMeaning: 'Dark purple = lower risk, green = higher risk — the reverse of the heat and landslide maps.',
      source: 'Open Earth Foundation, built from JRC Global Surface Water, the Global Flood Database, WRI Aqueduct v2 river-flood maps, the GFPLAIN floodplain mask, and the IBGE 2022 Census.',
      vintage: 'Flood hazard: current terrain + the May 2024 event. People & vulnerability: 2022 Census.',
      resolution: '~250 m grid',
      caveat: 'A screening estimate to compare areas — not a street-level flood forecast.',
    },
    pt: {
      title: 'Risco de inundação',
      whatItShows: 'Onde as inundações têm mais chance de causar dano — combinando o quanto uma área alaga com quantas pessoas vivem ali e quão vulneráveis são.',
      colorMeaning: 'Roxo escuro = menor risco, verde = maior risco — o contrário dos mapas de calor e deslizamento.',
      source: 'Open Earth Foundation, a partir da água superficial do JRC, do Global Flood Database, dos mapas de inundação fluvial WRI Aqueduct v2, da máscara de planície GFPLAIN e do Censo IBGE 2022.',
      vintage: 'Ameaça de inundação: terreno atual + o evento de maio de 2024. Pessoas e vulnerabilidade: Censo 2022.',
      resolution: 'grade de ~250 m',
      caveat: 'Uma estimativa para comparar áreas — não é uma previsão de inundação rua a rua.',
    },
  },
  heat: {
    key: 'heat',
    en: {
      title: 'Heat risk',
      whatItShows: 'Where extreme heat is most likely to harm people — the hottest areas combined with who lives there and how vulnerable they are.',
      colorMeaning: 'Green = lower risk, orange = higher risk.',
      source: 'Open Earth Foundation, built from summer land-surface temperature 2015–2024 (Landsat 8 at 30 m, NASA MODIS day and night), and the IBGE 2022 Census.',
      vintage: 'Heat: summers 2015–2024. People & vulnerability: 2022 Census.',
      resolution: '~250 m grid',
      caveat: 'Based on satellite surface temperature — a close proxy for the heat people actually feel.',
    },
    pt: {
      title: 'Risco de calor',
      whatItShows: 'Onde o calor extremo tem mais chance de prejudicar as pessoas — as áreas mais quentes combinadas com quem vive ali e quão vulnerável é.',
      colorMeaning: 'Verde = menor risco, laranja = maior risco.',
      source: 'Open Earth Foundation, a partir da temperatura de superfície dos verões de 2015–2024 (Landsat 8 a 30 m, NASA MODIS dia e noite) e o Censo IBGE 2022.',
      vintage: 'Calor: verões de 2015–2024. Pessoas e vulnerabilidade: Censo 2022.',
      resolution: 'grade de ~250 m',
      caveat: 'Baseado na temperatura de superfície por satélite — um bom indicador do calor que as pessoas sentem.',
    },
  },
  landslide: {
    key: 'landslide',
    en: {
      title: 'Landslide risk',
      whatItShows: 'Where steep, unstable ground could slide and harm people nearby.',
      // Porto Alegre's 98th percentile is only 0.393, so the ramp never leaves
      // green — the whole city is genuinely low-susceptibility.
      colorMeaning: 'Dark green = lower risk, pale yellow-green = higher risk. Almost the whole city sits in the low band, so the differences are subtle.',
      source: 'Open Earth Foundation, built from Copernicus 30 m terrain slope, MERIT Hydro, SoilGrids soil, CHIRPS rainfall, and vegetation 2015–2024 (MODIS, Dynamic World 2023).',
      vintage: 'Terrain: current. Rainfall & vegetation: through 2024.',
      resolution: '~90 m grid',
      caveat: 'A susceptibility index — where slides are physically possible, not how likely one is — and not yet checked against Porto Alegre’s historical landslide records.',
    },
    pt: {
      title: 'Risco de deslizamento',
      whatItShows: 'Onde o terreno íngreme e instável pode deslizar e atingir quem está por perto.',
      colorMeaning: 'Verde-escuro = menor risco, verde-amarelado claro = maior risco. Quase toda a cidade fica na faixa baixa, então as diferenças são sutis.',
      source: 'Open Earth Foundation, a partir da declividade do terreno Copernicus 30 m, MERIT Hydro, solos SoilGrids, chuva CHIRPS e vegetação 2015–2024 (MODIS, Dynamic World 2023).',
      vintage: 'Terreno: atual. Chuva e vegetação: até 2024.',
      resolution: 'grade de ~90 m',
      caveat: 'Um índice de suscetibilidade — onde deslizamentos são fisicamente possíveis, não a probabilidade de ocorrerem — e ainda não comparado ao histórico de deslizamentos de Porto Alegre.',
    },
  },
  neighborhoods: {
    key: 'neighborhoods',
    en: {
      title: 'Neighborhoods (bairros)',
      whatItShows: 'Official bairro boundaries, shaded by their main risk and by how many people live there.',
      colorMeaning: 'Each bairro is shaded by its dominant hazard; a stronger color means higher risk.',
      source: 'Boundaries and population from IBGE (the Brazilian census bureau); risk coloring from Open Earth Foundation.',
      vintage: 'Population & vulnerability: 2022 Census. Some indicators: 2010 Census.',
      resolution: 'Per bairro',
      caveat: 'Risk is averaged across the whole bairro — conditions still vary block to block.',
    },
    pt: {
      title: 'Bairros',
      whatItShows: 'Limites oficiais dos bairros, coloridos pelo seu principal risco e por quantas pessoas vivem ali.',
      colorMeaning: 'Cada bairro é colorido pela sua ameaça dominante; cor mais forte significa maior risco.',
      source: 'Limites e população do IBGE; coloração de risco pela Open Earth Foundation.',
      vintage: 'População e vulnerabilidade: Censo 2022. Alguns indicadores: Censo 2010.',
      resolution: 'Por bairro',
      caveat: 'O risco é uma média de todo o bairro — as condições ainda variam de quadra em quadra.',
    },
  },
  sites: {
    key: 'sites',
    en: {
      title: 'Parks, schools & hospitals',
      whatItShows: 'Points of interest near your area, to help you place a project.',
      colorMeaning: 'Pins mark each type of place (parks, schools, hospitals, wetlands).',
      source: 'OpenStreetMap — a free, community-maintained map.',
      vintage: 'Continuously updated by contributors.',
      resolution: 'Individual places',
      caveat: 'Community-contributed, so coverage can be incomplete or slightly out of date.',
    },
    pt: {
      title: 'Parques, escolas e hospitais',
      whatItShows: 'Pontos de interesse perto da sua área, para ajudar a posicionar um projeto.',
      colorMeaning: 'Os marcadores indicam cada tipo de lugar (parques, escolas, hospitais, áreas úmidas).',
      source: 'OpenStreetMap — um mapa livre, mantido pela comunidade.',
      vintage: 'Atualizado continuamente pelos colaboradores.',
      resolution: 'Lugares individuais',
      caveat: 'Feito pela comunidade, então a cobertura pode estar incompleta ou um pouco desatualizada.',
    },
  },
};

/** The Hazard × Exposure × Vulnerability explainer — the core data-literacy idea. */
export const RISK_METHODOLOGY: Record<'en' | 'pt', string> = {
  en: 'On these maps, risk = Hazard × Exposure × Vulnerability: how strong the threat is, how many people and assets are in its path, and how vulnerable they are. A strong hazard in an empty area is lower risk than a moderate hazard where many vulnerable people live.',
  pt: 'Nestes mapas, risco = Ameaça × Exposição × Vulnerabilidade: quão forte é a ameaça, quantas pessoas e bens estão no caminho e quão vulneráveis são. Uma ameaça forte numa área vazia representa menos risco do que uma ameaça média onde vivem muitas pessoas vulneráveis.',
};

/** UI chrome strings, kept here so the shared dialog needs no i18n wiring. */
export const PROVENANCE_UI: Record<'en' | 'pt', {
  button: string; title: string; subtitle: string; methodologyTitle: string;
  source: string; updated: string; resolution: string; note: string; colors: string;
}> = {
  en: {
    button: 'About this data',
    title: 'Where this data comes from',
    subtitle: 'What these layers show, and how current they are.',
    methodologyTitle: 'How we measure risk',
    source: 'Source', updated: 'Updated', resolution: 'Resolution',
    note: 'Good to know', colors: 'Colors',
  },
  pt: {
    button: 'Sobre estes dados',
    title: 'De onde vêm estes dados',
    subtitle: 'O que cada camada mostra e o quão atualizada está.',
    methodologyTitle: 'Como medimos o risco',
    source: 'Fonte', updated: 'Atualização', resolution: 'Resolução',
    note: 'Bom saber', colors: 'Cores',
  },
};

export function provenanceText(key: ProvenanceKey, lang: 'en' | 'pt'): ProvenanceText {
  const entry = DATA_PROVENANCE[key];
  return lang === 'pt' ? entry.pt : entry.en;
}

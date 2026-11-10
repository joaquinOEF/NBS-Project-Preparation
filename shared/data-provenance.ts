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

// ⚠️ 10 Nov 2026: the flood/heat/landslide entries used to describe OEF's own
// H×E×V risk rasters (JRC, Aqueduct, GFPLAIN, Landsat…). Both maps that open
// this dialog — the CBO hazard tour and the coordinator's overlays — draw the
// Prefeitura's PLAC/ARVC AMEAÇA tiles (server/routes/arvcTileRoutes.ts,
// ARVC_TILE_SOURCES), so the dialog was describing a map nobody was looking at.
// The entries now describe what is on screen. Anything about our own bairro
// ranking says "estimativa OEF".

export type ProvenanceKey = 'flood' | 'flood2024' | 'heat' | 'landslide' | 'bairros' | 'neighborhoods' | 'sites';

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

const PLAC_SOURCE = {
  en: 'Porto Alegre City Hall — Climate Action Plan (PLAC), Climate Risk and Vulnerability Analysis (ARVC), prepared by WayCarbon with ICLEI, Ludovino Lopes and Ecofinance. Rasters sent by SMAMUS in August 2026.',
  pt: 'Prefeitura de Porto Alegre — Plano de Ação Climática (PLAC), Análise de Riscos e Vulnerabilidades Climáticas (ARVC), elaborada pela WayCarbon com ICLEI, Ludovino Lopes e Ecofinance. Arquivos enviados pela SMAMUS em agosto de 2026.',
};
const PLAC_VINTAGE = {
  en: '2050 scenario (the plan also has 1995–2014 and 2030).',
  pt: 'Cenário 2050 (o plano também traz 1995–2014 e 2030).',
};
const PLAC_COLORS = {
  en: 'Pale yellow = lower hazard, dark red = higher hazard. The scale is stretched over Porto Alegre’s own range, so it compares places within the city.',
  pt: 'Amarelo-claro = menor ameaça, vermelho-escuro = maior ameaça. A escala é esticada sobre a faixa de Porto Alegre, então compara lugares dentro da cidade.',
};

export const DATA_PROVENANCE: Record<ProvenanceKey, ProvenanceEntry> = {
  flood: {
    key: 'flood',
    en: {
      title: 'River-flood hazard (PLAC)',
      whatItShows: 'The city’s own map of river-flood hazard: where the arroios (streams) overflow. It is the hazard only — not who lives there or how vulnerable they are.',
      colorMeaning: PLAC_COLORS.en,
      source: PLAC_SOURCE.en,
      vintage: PLAC_VINTAGE.en,
      resolution: '~30 m grid',
      caveat: 'Fluvial only: it covers the arroios, not the Guaíba and not rain that pools in the street. The Guaíba is shown separately, as the area flooded in May 2024.',
    },
    pt: {
      title: 'Ameaça de inundação fluvial (PLAC)',
      whatItShows: 'O mapa da própria Prefeitura para a ameaça de inundação fluvial: onde os arroios transbordam. É só a ameaça — não diz quem mora ali nem quão vulnerável é.',
      colorMeaning: PLAC_COLORS.pt,
      source: PLAC_SOURCE.pt,
      vintage: PLAC_VINTAGE.pt,
      resolution: 'grade de ~30 m',
      caveat: 'Só fluvial: cobre os arroios, não o Guaíba nem a água da chuva que acumula na rua. O Guaíba aparece à parte, como a área inundada em maio de 2024.',
    },
  },
  flood2024: {
    key: 'flood2024',
    en: {
      title: 'Area flooded in May 2024 (Guaíba)',
      whatItShows: 'Where the water actually reached in the May 2024 flood, observed from satellite — the Guaíba component that the PLAC river-flood map does not cover.',
      colorMeaning: 'Blue with a dashed outline = flooded on 6 May 2024.',
      source: 'Planet SkySat satellite imagery, 6 May 2024, mapped for the Guaíba watershed (zenodo.org/records/14662897).',
      vintage: 'Observed on 6 May 2024.',
      resolution: 'Mapped flooded areas',
      caveat: 'One event on one day: it shows where it flooded then, not every place that can flood.',
    },
    pt: {
      title: 'Área inundada em maio de 2024 (Guaíba)',
      whatItShows: 'Até onde a água chegou de fato na enchente de maio de 2024, vista por satélite — a parte do Guaíba que o mapa fluvial do PLAC não cobre.',
      colorMeaning: 'Azul com contorno tracejado = área inundada em 6 de maio de 2024.',
      source: 'Imagens de satélite Planet SkySat de 6 de maio de 2024, mapeadas para a bacia do Guaíba (zenodo.org/records/14662897).',
      vintage: 'Observado em 6 de maio de 2024.',
      resolution: 'Áreas inundadas mapeadas',
      caveat: 'Um evento, num dia: mostra onde alagou naquela vez, não todo lugar que pode alagar.',
    },
  },
  heat: {
    key: 'heat',
    en: {
      title: 'Heat-wave hazard (PLAC)',
      whatItShows: 'The city’s own map of heat-wave hazard: where extreme heat is expected to hit hardest. The hazard only — not who lives there or how vulnerable they are.',
      colorMeaning: PLAC_COLORS.en,
      source: PLAC_SOURCE.en,
      vintage: PLAC_VINTAGE.en,
      resolution: '~30 m grid',
      caveat: 'A projection for comparing places, not a temperature reading on a given day.',
    },
    pt: {
      title: 'Ameaça de ondas de calor (PLAC)',
      whatItShows: 'O mapa da própria Prefeitura para a ameaça de ondas de calor: onde o calor extremo deve bater mais forte. É só a ameaça — não diz quem mora ali nem quão vulnerável é.',
      colorMeaning: PLAC_COLORS.pt,
      source: PLAC_SOURCE.pt,
      vintage: PLAC_VINTAGE.pt,
      resolution: 'grade de ~30 m',
      caveat: 'Uma projeção para comparar lugares, não a temperatura de um dia específico.',
    },
  },
  landslide: {
    key: 'landslide',
    en: {
      title: 'Landslide hazard (PLAC)',
      whatItShows: 'The city’s own map of landslide hazard: the slopes where the ground can slide. The hazard only — not who lives there or how vulnerable they are.',
      colorMeaning: PLAC_COLORS.en,
      source: PLAC_SOURCE.en,
      vintage: PLAC_VINTAGE.en,
      resolution: '~30 m grid',
      caveat: 'For the sectors a geologist walked, the Serviço Geológico do Brasil (SGB) risk sectors are more precise — and a place outside them was simply not surveyed, which does not mean it is safe.',
    },
    pt: {
      title: 'Ameaça de deslizamento (PLAC)',
      whatItShows: 'O mapa da própria Prefeitura para a ameaça de deslizamento: as encostas onde o terreno pode deslizar. É só a ameaça — não diz quem mora ali nem quão vulnerável é.',
      colorMeaning: PLAC_COLORS.pt,
      source: PLAC_SOURCE.pt,
      vintage: PLAC_VINTAGE.pt,
      resolution: 'grade de ~30 m',
      caveat: 'Nos setores que um geólogo percorreu, os setores de risco do Serviço Geológico do Brasil (SGB) são mais precisos — e um lugar fora deles só não foi vistoriado, o que não quer dizer que seja seguro.',
    },
  },
  // The organisation's map: outlines only, no shading (MapMicroapp).
  bairros: {
    key: 'bairros',
    en: {
      title: 'Neighborhoods (bairros)',
      whatItShows: 'Official bairro boundaries, so you can find yours.',
      colorMeaning: 'Outlines only — the bairros are not colored.',
      source: 'IBGE (the Brazilian census bureau).',
      vintage: '2022 Census.',
      resolution: 'Per bairro',
      caveat: 'A boundary, not a judgement: nothing about hazard is drawn on this layer.',
    },
    pt: {
      title: 'Bairros',
      whatItShows: 'Os limites oficiais dos bairros, pra você achar o seu.',
      colorMeaning: 'Só o contorno — os bairros não são coloridos.',
      source: 'IBGE.',
      vintage: 'Censo 2022.',
      resolution: 'Por bairro',
      caveat: 'Um limite, não uma avaliação: nada sobre ameaça é desenhado nesta camada.',
    },
  },
  // The coordinator's map, which still shades bairros by our ranking.
  neighborhoods: {
    key: 'neighborhoods',
    en: {
      title: 'Neighborhoods (bairros) — OEF estimate',
      whatItShows: 'Official bairro boundaries, shaded by an OEF estimate that ranks the bairros against each other.',
      colorMeaning: 'Each bairro is shaded by the hazard that ranks highest for it in the OEF estimate; a stronger color means a higher rank within Porto Alegre.',
      source: 'Boundaries and population: IBGE. Shading: OEF estimate, a within-city ranking of the PLAC/ARVC risk composite per bairro.',
      vintage: 'Boundaries and population: 2022 Census. Ranking: PLAC/ARVC 2050.',
      resolution: 'Per bairro',
      caveat: 'An OEF estimate for ordering work, not an official risk rating — and an average over the whole bairro; conditions vary block to block.',
    },
    pt: {
      title: 'Bairros — estimativa OEF',
      whatItShows: 'Limites oficiais dos bairros, coloridos por uma estimativa OEF que ordena os bairros entre si.',
      colorMeaning: 'Cada bairro é colorido pela ameaça que fica mais alta para ele na estimativa OEF; cor mais forte = posição mais alta dentro de Porto Alegre.',
      source: 'Limites e população: IBGE. Coloração: estimativa OEF, uma ordenação dentro da cidade do índice de risco do PLAC/ARVC por bairro.',
      vintage: 'Limites e população: Censo 2022. Ordenação: PLAC/ARVC 2050.',
      resolution: 'Por bairro',
      caveat: 'Uma estimativa OEF para ordenar o trabalho, não uma classificação oficial de risco — e uma média do bairro inteiro; as condições variam de quadra em quadra.',
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

/**
 * What these maps show — ameaça, not risco. The old text explained OEF's
 * H×E×V risk; the tiles on screen are the PLAC's hazard layers, so the
 * explainer says that, and where risk would come from.
 */
export const RISK_METHODOLOGY: Record<'en' | 'pt', string> = {
  en: 'These maps show HAZARD (ameaça) from the city’s Climate Action Plan (PLAC): how strong a threat is in each place. Risk would also need exposure and vulnerability — who lives there and how prepared they are — and that is exactly what you know about your place better than any map.',
  pt: 'Estes mapas mostram a AMEAÇA do Plano de Ação Climática da Prefeitura (PLAC): quão forte é cada ameaça em cada lugar. Risco também depende de exposição e vulnerabilidade — quem mora ali e quão preparado está — e isso vocês conhecem do seu lugar melhor do que qualquer mapa.',
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
    methodologyTitle: 'Hazard, not risk',
    source: 'Source', updated: 'Updated', resolution: 'Resolution',
    note: 'Good to know', colors: 'Colors',
  },
  pt: {
    button: 'Sobre estes dados',
    title: 'De onde vêm estes dados',
    subtitle: 'O que cada camada mostra e o quão atualizada está.',
    methodologyTitle: 'Ameaça, não risco',
    source: 'Fonte', updated: 'Atualização', resolution: 'Resolução',
    note: 'Bom saber', colors: 'Cores',
  },
};

export function provenanceText(key: ProvenanceKey, lang: 'en' | 'pt'): ProvenanceText {
  const entry = DATA_PROVENANCE[key];
  return lang === 'pt' ? entry.pt : entry.en;
}

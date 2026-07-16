// ============================================================================
// E2 linear flow — família recommendation engine
// ============================================================================
// The closing of Encontro 2 shows the famílias worth STUDYING for this site —
// never a single verdict (Robson/Ana rule: the agent recommends the FAMÍLIA,
// the organization picks the variante). The ranking crosses three signals the
// flow has already captured:
//   1. the bairro's hazard profile (0–100 means, parsed from the map result)
//   2. the família's hazard weights (shared/nbs-catalog.ts)
//   3. what the org said about the place (current_use, site-type keywords)
// The "why" lines here are deterministic pt/en templates from structured data;
// when the model has richer context (uploaded photos, free-text answers) it
// calls the show_familia_recommendation tool with its own whys, which override
// these per-família.

import {
  NBS_FAMILIAS,
  solutionsForFamilia,
  type NbsFamiliaId,
} from './nbs-catalog';

export interface FamiliaRecoInput {
  /** Bairro mean hazard scores, 0–100. */
  risks: { flood: number; heat: number; landslide: number };
  bairro: string;
  /** current_use enum id: vegetated | paved | mixed | abandoned | under-construction */
  currentUse?: string;
  /** The picked site's name — keyword boosts (praça, escola, horta…). */
  siteName?: string;
}

export interface RankedFamilia {
  familiaId: NbsFamiliaId;
  score: number;
  why: { pt: string; en: string };
  exampleSolutionIds: string[];
}

const HAZARD_WORDS = {
  flood: { pt: 'enchente', en: 'flood' },
  heat: { pt: 'calor', en: 'heat' },
  landslide: { pt: 'deslizamento', en: 'landslide' },
} as const;

function levelWord(pct: number, lang: 'pt' | 'en'): string {
  const idx = pct >= 66 ? 2 : pct >= 33 ? 1 : 0;
  return (lang === 'pt' ? ['baixo', 'médio', 'alto'] : ['low', 'medium', 'high'])[idx];
}

/** Two example variants per família — mutirão-buildable first, then cheapest. */
export function exampleSolutionsFor(familiaId: NbsFamiliaId): string[] {
  const all = solutionsForFamilia(familiaId);
  const order = (d: string) => (d === 'mutirao' ? 0 : d === 'parceria' ? 1 : 2);
  return [...all]
    .sort((a, b) => order(a.delivery) - order(b.delivery))
    .slice(0, 2)
    .map(s => s.id);
}

export function rankFamiliasForSite(input: FamiliaRecoInput): RankedFamilia[] {
  const { risks, bairro } = input;
  const use = (input.currentUse ?? '').toLowerCase();
  const siteName = (input.siteName ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');

  return NBS_FAMILIAS.map(f => {
    // Hazard match: Σ (bairro risk × família weight), normalized to ~0–1.
    const hazardScore =
      ((risks.flood / 100) * f.hazards.flood +
        (risks.heat / 100) * f.hazards.heat +
        (risks.landslide / 100) * f.hazards.landslide) /
      Math.max(1, f.hazards.flood + f.hazards.heat + f.hazards.landslide);

    // The hazard that drives this família's score — used in the why line.
    const contributions = (['flood', 'heat', 'landslide'] as const).map(h => ({
      h,
      c: (risks[h] / 100) * f.hazards[h],
    }));
    const top = contributions.sort((a, b) => b.c - a.c)[0];

    // Context boosts from what the org told us about the place.
    let boost = 0;
    let boostWhy: { pt: string; en: string } | null = null;
    if (f.id === 'agricultura-urbana' && (use === 'abandoned' || /horta|quintal|terreno/.test(siteName))) {
      boost = 0.25;
      boostWhy = {
        pt: use === 'abandoned' ? 'Um terreno parado pode virar produção e cuidado coletivo.' : 'Vocês já têm relação com cultivo nesse lugar.',
        en: use === 'abandoned' ? 'An idle lot can become food and collective care.' : 'You already have a growing relationship with this place.',
      };
    }
    if (f.id === 'verde-urbano' && (use === 'paved' || /praca|rua|escola|quadra/.test(siteName))) {
      boost = 0.2;
      boostWhy = {
        pt: use === 'paved' ? 'Área pavimentada — sombra e verde fazem diferença direta.' : 'Espaços públicos como esse pedem sombra e verde.',
        en: use === 'paved' ? 'A paved area — shade and green make a direct difference.' : 'Public spaces like this call for shade and green.',
      };
    }
    if (f.id === 'recuperacao-ecossistemas' && (use === 'vegetated' || /varzea|banhado|arroio|mata/.test(siteName))) {
      boost = 0.2;
      boostWhy = {
        pt: 'O lugar já tem vegetação — recuperar o que existe rende muito.',
        en: 'The place already has vegetation — restoring what exists goes far.',
      };
    }

    const hazardWhy = {
      pt: `${HAZARD_WORDS[top.h].pt.charAt(0).toUpperCase() + HAZARD_WORDS[top.h].pt.slice(1)} é ${levelWord(risks[top.h], 'pt')} no ${bairro}.`,
      en: `${HAZARD_WORDS[top.h].en.charAt(0).toUpperCase() + HAZARD_WORDS[top.h].en.slice(1)} risk is ${levelWord(risks[top.h], 'en')} in ${bairro}.`,
    };

    return {
      familiaId: f.id,
      score: hazardScore + boost,
      why: boostWhy
        ? { pt: `${hazardWhy.pt} ${boostWhy.pt}`, en: `${hazardWhy.en} ${boostWhy.en}` }
        : hazardWhy,
      exampleSolutionIds: exampleSolutionsFor(f.id),
    };
  }).sort((a, b) => b.score - a.score);
}

/** Keyword site-type inference from a searched/named place — pt/en label, or null. */
export function inferSiteTypeLabel(name: string | undefined, lang: 'pt' | 'en'): string | null {
  if (!name) return null;
  const n = name.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  const RULES: Array<[RegExp, { pt: string; en: string }]> = [
    [/praca|parque|largo/, { pt: 'Praça / área pública', en: 'Square / public area' }],
    [/escola|colegio|creche|emei/, { pt: 'Escola / equipamento público', en: 'School / public facility' }],
    [/horta|quintal/, { pt: 'Horta / área de cultivo', en: 'Garden / growing area' }],
    [/arroio|banhado|varzea|riacho/, { pt: 'Curso d’água / área úmida', en: 'Waterway / wetland' }],
    [/quadra|campo|ginasio/, { pt: 'Quadra / área esportiva', en: 'Court / sports area' }],
    [/terreno|lote/, { pt: 'Terreno', en: 'Lot' }],
  ];
  for (const [re, label] of RULES) if (re.test(n)) return label[lang];
  return null;
}

// ============================================================================
// THE CITY'S CLIMATE CONTEXT, WHERE IT BEARS ON ONE SITE
// ============================================================================
// The Rede asked (16 Nov 2026) for the proposals to say why Porto Alegre needs
// nature-based solutions "em função dos impactos climáticos que já acontecem",
// including whether the risk falls unequally. The city-wide figures come from
// scripts/city-exposure-stats.py (knowledge/porto-alegre/census-2022/
// exposure.json): the 2022 Census crossed with the May 2024 Guaíba level
// (SMAMUS) and the SGB risk sectors.
//
// A line prints ONLY where it bears on the site — a figure about the 2024 flood
// on a site the water never reached is decoration, not context:
//   · below the 2024 level → how many people in the city live below it;
//   · inside an SGB sector → who lives in those sectors (income), city-wide;
//   · either of those AND the income around the site is clearly below the
//     city's → the comparison, which is what the injustice argument rests on.
//
// ⚠️ Income only, never race, on this page: pretos e pardos stay in the
// coordination's views (D3, shared/e4-prenote.ts). The race figures are in the
// knowledge file for the coordination and the model.
// Pure: the server works out the triggers (server/services/cityClimateContext.ts).
// ============================================================================

export type Lang = 'pt' | 'en';

export interface ExposureProfile { people: number; shareOfCity: number; blackOrBrownShare: number; incomeMedian: number | null }
export interface CityExposure {
  city: ExposureProfile;
  layers: { cota2024: ExposureProfile; sgb: ExposureProfile; [k: string]: ExposureProfile };
  incomeQuintiles: Array<{ quintile: number; sgbShare: number; cota2024Share: number; [k: string]: number }>;
}

export interface SiteClimateTriggers {
  /** The site lies below the level the Guaíba reached in May 2024. */
  below2024: boolean;
  /** The site lies inside an SGB/CPRM risk sector. */
  inSgbSector: boolean;
  /** Typical household-head income within 300 m (2022 Census), when known. */
  incomeAround: number | null;
}

/** "Clearly below" — a fifth under the city's median, so a rounding wobble never prints a comparison. */
export const INCOME_BELOW_RATIO = 0.8;

export const CITY_CONTEXT_SOURCE: Record<Lang, string> = {
  pt: 'IBGE, Censo 2022, cruzado com as cotas do Guaíba (SMAMUS) e os setores de risco do SGB — cálculo da plataforma',
  en: 'IBGE 2022 Census, crossed with the Guaíba contours (SMAMUS) and the SGB risk sectors — platform calculation',
};

const brl = (n: number) => `R$ ${Math.round(n).toLocaleString('pt-BR')}`;
const thousands = (n: number, lang: Lang) => lang === 'pt' ? `${Math.round(n / 1000)} mil` : `${Math.round(n / 1000)},000`;
const pctOf = (x: number, lang: Lang) => {
  const v = x * 100;
  const s = v >= 1 ? String(Math.round(v)) : v >= 0.1 ? v.toFixed(1) : v.toFixed(2);
  return `${lang === 'pt' ? s.replace('.', ',') : s}%`;
};

/** The lines for one site — [] when nothing about the city bears on it. */
export function cityClimateLines(x: CityExposure | null | undefined, t: SiteClimateTriggers, lang: Lang): Array<{ text: string; source: string }> {
  if (!x) return [];
  const pt = lang === 'pt';
  const out: string[] = [];
  const cityIncome = x.city.incomeMedian;
  if (t.below2024) {
    const f = x.layers.cota2024;
    out.push(pt
      ? `Cerca de ${thousands(f.people, lang)} moradores de Porto Alegre, ${pctOf(f.shareOfCity, lang)} da cidade, vivem abaixo do nível que o Guaíba atingiu em maio de 2024.`
      : `About ${thousands(f.people, lang)} Porto Alegre residents, ${pctOf(f.shareOfCity, lang)} of the city, live below the level the Guaíba reached in May 2024.`);
  }
  if (t.inSgbSector && x.layers.sgb.incomeMedian && cityIncome) {
    const q = x.incomeQuintiles;
    const poorest = q.find(r => r.quintile === 1)?.sgbShare, richest = q.find(r => r.quintile === 5)?.sgbShare;
    const spread = poorest != null && richest != null && richest > 0
      ? (pt ? `; entre os 20% de moradores mais pobres, ${pctOf(poorest, lang)} vivem num desses setores, contra ${pctOf(richest, lang)} entre os 20% mais ricos`
            : `; ${pctOf(poorest, lang)} of the poorest fifth of residents live in one of these sectors, against ${pctOf(richest, lang)} of the richest fifth`)
      : '';
    const half = x.layers.sgb.incomeMedian < cityIncome / 2;
    out.push(pt
      ? `Em Porto Alegre, a renda típica de quem mora em setores de risco do SGB é ${brl(x.layers.sgb.incomeMedian)}, ${half ? 'menos da metade da' : 'abaixo da'} mediana da cidade (${brl(cityIncome)})${spread}.`
      : `In Porto Alegre, the typical household-head income in the SGB risk sectors is ${brl(x.layers.sgb.incomeMedian)}, ${half ? 'under half' : 'below'} the city's median (${brl(cityIncome)})${spread}.`);
  }
  if ((t.below2024 || t.inSgbSector) && t.incomeAround != null && cityIncome && t.incomeAround < cityIncome * INCOME_BELOW_RATIO) {
    out.push(pt
      ? `Em volta do lugar, a renda típica do responsável pelo domicílio é ${brl(t.incomeAround)}, abaixo da mediana da cidade (${brl(cityIncome)}).`
      : `Around the site, the typical household-head income is ${brl(t.incomeAround)}, below the city's median (${brl(cityIncome)}).`);
  }
  return out.map(text => ({ text, source: CITY_CONTEXT_SOURCE[lang] }));
}

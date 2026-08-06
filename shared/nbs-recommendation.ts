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

import { familiesOfWorries } from './site-knowledge';
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
  /**
   * The W2 read-back: the org told us whether their own place is worse, the
   * same, or calmer than the bairro figure we quoted (shared/site-knowledge.ts).
   *
   * These OVERRIDE the raster, deliberately. The bairro mean is an average over
   * ~500 ha and two of its three factors are bairro constants, while this came
   * from someone standing in the place — and the read-back explicitly promises
   * that their answer counts for more than our number. A correction that
   * changed nothing visible would make that promise a lie.
   */
  corrections?: Partial<Record<'flood' | 'heat' | 'landslide', 'worse' | 'same' | 'less' | 'unsure'>>;
  /**
   * What the org said worries them at this place (beat 1). The clearest
   * statement of intent we ever get, and until 2026-07-31 the ranking ignored
   * it completely: Coletivo Encosta Viva named the slope and was shown three
   * famílias, none of them about slopes, under a line reading "nada fica
   * descartado". The documented failure mode of recommenders is exactly this —
   * inferred signals overriding a user's stated aspiration — and here the
   * inferred signal was a 250 m average over ~500 ha.
   *
   * Weighted, not obeyed: the boost is capped so hazard data still shapes the
   * order, and `familiaGuaranteed` marks the named família so the caller can
   * keep it visible however it trims the list. Boosting is safe precisely
   * because nothing is hidden — see the "sem sinal forte" group in the UI.
   */
  worries?: string[];
}

export interface RankedFamilia {
  familiaId: NbsFamiliaId;
  score: number;
  why: { pt: string; en: string };
  exampleSolutionIds: string[];
  /** This família answers a hazard the org named — never drop it from view. */
  guaranteed?: boolean;
  /** No confirmed signal behind it; the UI groups these rather than ranking them. */
  weak?: boolean;
}

/** Below this, a família has nothing real behind it for this place. */
const WEAK_FLOOR = 0.25;

const HAZARD_WORDS = {
  // `em` carries the gender: "na enchente" (fem) but "no calor" / "no
  // deslizamento" (masc). Templating "no ${palavra}" for all three printed
  // "age principalmente no enchente" to every reader in the cohort.
  flood: { pt: 'enchente', en: 'flood', em: 'na' },
  heat: { pt: 'calor', en: 'heat', em: 'no' },
  landslide: { pt: 'deslizamento', en: 'landslide', em: 'no' },
} as const;

/** `fem` for "enchente é baixA" — the masculine form was printing for all three. */
function levelWord(pct: number, lang: 'pt' | 'en', fem = false): string {
  const idx = pct >= 66 ? 2 : pct >= 33 ? 1 : 0;
  if (lang !== 'pt') return ['low', 'medium', 'high'][idx];
  return (fem ? ['baixa', 'média', 'alta'] : ['baixo', 'médio', 'alto'])[idx];
}

/**
 * The opening sentence, varied by rank so three cards don't repeat one
 * sentence verbatim. Each variant states the SAME fact a different way —
 * rephrasing only, never an extra claim the data doesn't carry.
 */
function openingLine(
  variant: number,
  hazard: 'flood' | 'heat' | 'landslide',
  pct: number,
  bairro: string,
  corrected: 'worse' | 'less' | null,
  lang: 'pt' | 'en',
): string {
  const w = HAZARD_WORDS[hazard];
  if (corrected) {
    const dir = corrected === 'worse'
      ? { pt: 'pior', en: 'worse' } : { pt: 'mais brando', en: 'milder' };
    if (lang === 'pt') {
      return [
        `Vocês disseram que ${w.pt} aqui é ${dir.pt} que na média do bairro.`,
        `Pelo que vocês contaram, ${w.pt} aqui é ${dir.pt} que a média do bairro.`,
        `Como vocês apontaram, aqui ${w.pt} é ${dir.pt} que no resto do bairro.`,
      ][variant % 3];
    }
    return [
      `You told me ${w.en} is ${dir.en} here than the bairro average.`,
      `From what you said, ${w.en} here is ${dir.en} than the bairro average.`,
      `As you pointed out, ${w.en} here is ${dir.en} than across the bairro.`,
    ][variant % 3];
  }
  const fem = hazard === 'flood';
  if (lang === 'pt') {
    const L = levelWord(pct, 'pt', fem);
    const Cap = w.pt.charAt(0).toUpperCase() + w.pt.slice(1);
    return [
      `${Cap} é ${L} no ${bairro}.`,
      `No ${bairro}, ${w.pt} é ${L}.`,
      `O dado do bairro aponta ${w.pt} ${L}.`,
    ][variant % 3];
  }
  const L = levelWord(pct, 'en');
  const Cap = w.en.charAt(0).toUpperCase() + w.en.slice(1);
  return [
    `${Cap} risk is ${L} in ${bairro}.`,
    `In ${bairro}, ${w.en} risk is ${L}.`,
    `The bairro data puts ${w.en} risk at ${L}.`,
  ][variant % 3];
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

/** Apply the org's read-back corrections on top of the bairro means. */
function correctedRisks(
  risks: FamiliaRecoInput['risks'],
  corrections: FamiliaRecoInput['corrections'],
): FamiliaRecoInput['risks'] {
  if (!corrections) return risks;
  const out = { ...risks };
  for (const h of ['flood', 'heat', 'landslide'] as const) {
    const c = corrections[h];
    // A deliberate step, not a nudge: "worse" has to be able to lift a hazard
    // the bairro average called low, or the correction is cosmetic.
    if (c === 'worse') out[h] = Math.min(100, Math.max(out[h] + 30, 70));
    else if (c === 'less') out[h] = Math.max(0, Math.min(out[h] - 30, 45));
  }
  return out;
}

export function rankFamiliasForSite(input: FamiliaRecoInput): RankedFamilia[] {
  const bairro = input.bairro;
  const risks = correctedRisks(input.risks, input.corrections);
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

    // The hazard THIS família is built for — used to keep the "why" lines
    // distinct. Without it two famílias whose top contributor happens to be the
    // same hazard print the identical sentence, which reads as canned and
    // tells the org nothing about why they are being shown two different
    // things (observed on mobile: Verde Urbano and Recuperação both saying
    // only "Calor é médio no Vila São José").
    const primary = (['flood', 'heat', 'landslide'] as Array<'flood' | 'heat' | 'landslide'>)
      .slice()
      .sort((a, b) => f.hazards[b] - f.hazards[a])[0];

    // A correction the org made outranks the raster in the copy too — quoting
    // our own bairro number back at someone who just told us it's wrong is the
    // fastest way to look like we weren't listening.
    const corrected = input.corrections?.[top.h];
    const correctedDir: 'worse' | 'less' | null =
      corrected === 'worse' ? 'worse' : corrected === 'less' ? 'less' : null;

    // "a que mais dá conta de X" would be a superlative ACROSS famílias, and
    // `primary` is only this família's own strongest hazard — Agricultura
    // Urbana leans to heat internally but is nowhere near the best answer to
    // heat. Phrase it as what this família works on, never as a ranking claim.
    const tail = primary === top.h
      ? {
          pt: ` Essa família age principalmente ${HAZARD_WORDS[top.h].em} ${HAZARD_WORDS[top.h].pt}.`,
          en: ` This família acts mainly on ${HAZARD_WORDS[top.h].en}.`,
        }
      : {
          pt: ` Ela age mais ${HAZARD_WORDS[primary].em} ${HAZARD_WORDS[primary].pt} e ajuda também ${HAZARD_WORDS[top.h].em} ${HAZARD_WORDS[top.h].pt}.`,
          en: ` It acts mainly on ${HAZARD_WORDS[primary].en} and helps with ${HAZARD_WORDS[top.h].en} too.`,
        };

    // The worry the org named. Capped so the hazard data still shapes the
    // order — a stated worry should lift a família decisively, not seize the
    // ranking — and marked `guaranteed` so no trimming can hide it.
    // Through the family: worries now carry the finer mechanism (Alagamento /
    // Inundação / Enxurrada) and this scores against the one flood layer we
    // have. A raw `w === 'flood'` filter would drop every one of them and
    // silently stop honouring the worry they just told us about.
    const named = familiesOfWorries(input.worries ?? []);
    const answersAWorry = named.find(h => f.hazards[h] >= 0.6);
    const worryBoost = answersAWorry ? Math.min(0.35, 0.35 * f.hazards[answersAWorry]) : 0;

    // An unconfirmed hazard must not read as a confident one: flatten toward
    // the middle so more famílias stay in play, and say so on the card.
    const unsure = input.corrections?.[top.h] === 'unsure';
    const spread = unsure ? 0.6 : 1;

    // Skip when the opening already attributes this same hazard to them — the
    // corrected opening and this line otherwise both start "Vocês disseram
    // que enchente…" in a single card.
    const worryWhy = answersAWorry && !(correctedDir && answersAWorry === top.h)
      ? {
          pt: ` Vocês disseram que ${HAZARD_WORDS[answersAWorry].pt} preocupa aqui.`,
          en: ` You told me ${HAZARD_WORDS[answersAWorry].en} worries you here.`,
        }
      : null;
    const unsureWhy = unsure
      ? {
          pt: ' Como não deu pra confirmar esse risco, deixo mais coisa em aberto.',
          en: " Since we couldn't confirm that risk, I'm keeping more open.",
        }
      : null;

    const score = (hazardScore + boost) * spread + worryBoost;
    return {
      familiaId: f.id,
      score,
      // Assembled at the end, where the rank is known (openingLine varies by it).
      _parts: {
        hazard: top.h, pct: risks[top.h], correctedDir,
        tail, worryWhy, boostWhy, unsureWhy,
      },
      why: { pt: '', en: '' },
      exampleSolutionIds: exampleSolutionsFor(f.id),
      guaranteed: !!answersAWorry,
      weak: !answersAWorry && score < WEAK_FLOOR,
    } as RankedFamilia & { _parts: any };
  })
  .sort((a, b) => b.score - a.score)
  .map((r: any, i: number) => {
    const p = r._parts;
    const build = (lang: 'pt' | 'en') => [
      openingLine(i, p.hazard, p.pct, bairro, p.correctedDir, lang),
      p.tail[lang],
      p.worryWhy?.[lang],
      p.boostWhy?.[lang],
      p.unsureWhy?.[lang],
    ].filter(Boolean).join('');
    const { _parts, ...rest } = r;
    return {
      ...rest,
      // The top three are never grouped as weak. A single card above a row of
      // greyed chips reads as "we ruled the rest out", which is the opposite
      // of the aperture rule — and the component's own contract is ≥2.
      weak: i < 3 ? false : rest.weak,
      why: { pt: build('pt'), en: build('en') },
    } as RankedFamilia;
  });
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

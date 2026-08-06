// W2 site knowledge — the diagnostic layer.
//
// Decision record: /refine 2026-07-31. Encontro 2 stopped being an attempt at a
// precise recommendation and became a DIAGNOSTIC: gather what we can in the
// easiest possible way, and establish where each organization stands, which is
// what sets how deep Encontro 3 can go.
//
// The reason is in docs/w2-site-knowledge-alternatives.html: not one input to
// the família ranking is measured at the site. Porto Alegre's mean bairro is
// ~500 ha; a community site is 0.3–1 ha; the flood and heat rasters are 250 m
// cells (6.25 ha), two of the three factors in every risk score are bairro
// constants, and ~20% of the flood mechanism map was never screened at all. The
// organization in front of the screen is the highest-resolution instrument in
// the system — so we ask them, in this order:
//
//   0. the frame       — our squares cover several blocks; you know this better
//   1. what worries them here (chips, ordered by what our data suggests)
//   2. the story       — broad prompt, voice or text, examples not a checklist
//   3. photographs     — routed by (1), never a fixed checklist
//   4. the read-back   — their words first, then our guesses, all correctable
//
// Order matters and is deliberate. The platform exposes itself to correction
// rather than quizzing the organization; and the photovoice literature is clear
// that narrow photo assignments encode a power imbalance between facilitator and
// participant, while broad prompts surface what the facilitator never thought to
// ask.

/** The three layers we hold data for. One raster each; nothing finer exists. */
export type HazardKey = 'flood' | 'heat' | 'landslide';

/**
 * The MECHANISM an organization names — one level finer than the data.
 *
 * COUGAR convening, 2026-08-06 (Vila Flores / PxG / OEF / BwB): orgs do not
 * experience "flood" as one thing. Water that pools and won't drain, a river
 * that overtops, and water coming down a slope with velocity are three
 * different problems that take three different solutions. The meeting
 * standardised the civil-defense terms — Alagamento (pluvial/drainage),
 * Inundação (river), Enxurrada (flash flood) — each paired with plain language.
 *
 * The old chip was already merging two of them out loud: "💧 Alagamento — A água
 * que junta OU INVADE". "Junta" is Alagamento, "invade" is Inundação, and both
 * sat under a label that named only the first. An org whose problem is the
 * Guaíba was tapping a chip that called it the wrong thing.
 *
 * ⚠️ This is deliberately NOT a new data key. We hold exactly three rasters, so
 * all three water mechanisms score against `flood`; `family` is how every
 * consumer gets back to a key it has data for. The org's word is theirs and is
 * stored as-is; the number stays the flood-family percentile and keeps saying
 * so. See backlog #24.
 */
export type WorryId = 'alagamento' | 'inundacao' | 'enxurrada' | 'heat' | 'landslide' | 'other';

export interface WorrySubtype {
  id: WorryId;
  /** The data key this mechanism is scored against. null = we have no layer. */
  family: HazardKey | null;
  pt: string;
  en: string;
  dPt: string;
  dEn: string;
}

export const WORRY_SUBTYPES: WorrySubtype[] = [
  { id: 'alagamento', family: 'flood', pt: '💧 Alagamento', en: '💧 Ponding', dPt: 'A água que junta e não escoa', dEn: "Water that pools and won't drain" },
  { id: 'inundacao', family: 'flood', pt: '🌊 Inundação', en: '🌊 River flooding', dPt: 'O rio ou arroio que transborda', dEn: 'The river or stream overtopping' },
  { id: 'enxurrada', family: 'flood', pt: '🌧️ Enxurrada', en: '🌧️ Flash flood', dPt: 'A água que desce com força', dEn: 'Water coming down with force' },
  { id: 'heat', family: 'heat', pt: '🌡️ Calor', en: '🌡️ Heat', dPt: 'Sol forte, falta de sombra', dEn: 'Harsh sun, no shade' },
  { id: 'landslide', family: 'landslide', pt: '⛰️ O barranco', en: '⛰️ The slope', dPt: 'Terra que desce, erosão', dEn: 'Earth coming down, erosion' },
  { id: 'other', family: null, pt: 'Outra coisa', en: 'Something else', dPt: 'Me conta o que é', dEn: 'Tell me what it is' },
];

/**
 * The data key behind a worry, or null if we hold no layer for it.
 *
 * ⚠️ MIGRATION. Sessions that ran before the split stored the family id itself
 * (`site_worry: 'flood'`), and those rows are still in the database — JVP's test
 * orgs and the three W2 test-kit orgs. A legacy `flood` therefore has to keep
 * resolving as "water, mechanism unspecified" rather than becoming an unknown
 * id. Every consumer below filtered with `w === 'flood' || …`, which DROPS
 * anything it doesn't recognise silently — so getting this wrong would not
 * throw, it would quietly stop asking those orgs for photos.
 */
export function familyOfWorry(id: string): HazardKey | null {
  const hit = WORRY_SUBTYPES.find(w => w.id === id);
  if (hit) return hit.family;
  return id === 'flood' || id === 'heat' || id === 'landslide' ? (id as HazardKey) : null;
}

/** The families behind a set of worries, deduped and order-preserving. */
export function familiesOfWorries(worries: string[]): HazardKey[] {
  const out: HazardKey[] = [];
  for (const w of worries) {
    const f = familyOfWorry(w);
    if (f && !out.includes(f)) out.push(f);
  }
  return out;
}

/** What an organization can name as the thing that worries them at this place. */
export const E2_WORRIES = WORRY_SUBTYPES;

/**
 * Worry chips ordered by what the bairro data suggests, highest first — the
 * data seeds the order, the organization decides the answer. "Outra coisa"
 * always sits last.
 *
 * A disagreement between this order and what they pick is a finding worth
 * logging, not an error: it is the clearest signal we get that the bairro
 * average does not describe their corner.
 */
export function orderWorriesByData(risks: Record<HazardKey, number>) {
  const hazards = E2_WORRIES.filter(w => w.id !== 'other');
  const other = E2_WORRIES.filter(w => w.id === 'other');
  const riskOf = (w: WorrySubtype) => (w.family ? risks[w.family] ?? 0 : -1);
  return [
    // Array.prototype.sort is stable, so the three water mechanisms — which all
    // score against the same `flood` number — keep the order they are declared
    // in: Alagamento, Inundação, Enxurrada. Everyday first.
    ...hazards.slice().sort((a, b) => riskOf(b) - riskOf(a)),
    ...other,
  ];
}

// ── Beat 3 · photographs ─────────────────────────────────────────────────────

export interface PhotoPrompt { id: string; pt: string; en: string }

/**
 * What is worth photographing, by what they said worries them. These target the
 * gaps no raster can fill: ground surface and drainage behaviour (we have no
 * infiltration data and SoilGrids covers 64% of the city at 250 m), shade and
 * roof type (no canopy or structural-capacity layer exists at all), and slope
 * face condition (the landslide grid is 90 m, hazard-gated, and never validated
 * against any inventory).
 */
const PHOTO_PROMPTS: Record<HazardKey | 'base', PhotoPrompt[]> = {
  flood: [
    { id: 'water-in', pt: 'Por onde a água entra quando chove forte', en: 'Where the water comes in when it rains hard' },
    { id: 'water-stands', pt: 'Onde ela fica parada depois', en: 'Where it stands afterwards' },
    { id: 'ground', pt: 'O chão de perto — terra, grama, concreto', en: 'The ground up close — earth, grass, concrete' },
  ],
  heat: [
    { id: 'midday', pt: 'O lugar no meio do dia, com o sol batendo', en: 'The place at midday, with the sun on it' },
    { id: 'shade', pt: 'A sombra que existe hoje, se existe', en: 'Whatever shade exists today, if any' },
    { id: 'surface', pt: 'O chão de perto — o que esquenta', en: 'The ground up close — what heats up' },
  ],
  landslide: [
    { id: 'slope-face', pt: 'A cara do barranco, de frente', en: 'The face of the slope, straight on' },
    { id: 'above', pt: 'O que tem em cima do barranco', en: "What's above the slope" },
    { id: 'below', pt: 'O que tem embaixo — casas, rua, quintal', en: "What's below it — houses, street, yard" },
  ],
  base: [
    { id: 'whole', pt: 'O espaço inteiro, da entrada', en: 'The whole space, from the entrance' },
    { id: 'ground', pt: 'O chão de perto', en: 'The ground up close' },
  ],
};

/**
 * Prompts that only make sense for a named mechanism. Deliberately small: these
 * are the questions a raster cannot answer and the generic flood prompts don't
 * ask. See backlog #24 — this is where the finer term changes what we request,
 * at no data cost.
 */
const MECHANISM_PROMPTS: Partial<Record<WorryId, PhotoPrompt[]>> = {
  inundacao: [
    { id: 'high-water-mark', pt: 'Até onde a água chegou — a marca na parede, se tiver', en: 'How high the water reached — the mark on the wall, if there is one' },
  ],
  enxurrada: [
    { id: 'water-path', pt: 'Por onde a água desce quando vem com força', en: 'The path the water takes when it comes down hard' },
  ],
};

/** Always offered last, and deliberately open — see the note on power imbalance. */
export const PHOTO_PROMPT_OPEN: PhotoPrompt = {
  id: 'open',
  pt: 'Qualquer outra coisa que vocês acham que a gente devia ver',
  en: 'Anything else you think we should see',
};

/**
 * Up to three targeted prompts plus the open one. Multiple worries interleave
 * so a site that floods AND bakes gets one prompt for each rather than three
 * about water.
 */
export function photoPromptsFor(worries: string[]): PhotoPrompt[] {
  const hazards = familiesOfWorries(worries);
  if (hazards.length === 0) return [...PHOTO_PROMPTS.base, PHOTO_PROMPT_OPEN];

  const picked: PhotoPrompt[] = [];
  const seen = new Set<string>();
  // The mechanism earns its keep here: the shot that settles Inundação (how
  // high did it get?) is not the shot that settles Enxurrada (where does it
  // come down?), and neither is in the generic flood set. These go FIRST — a
  // named mechanism is the most specific thing we know about the site.
  for (const w of worries) {
    for (const prompt of MECHANISM_PROMPTS[w as WorryId] ?? []) {
      if (!seen.has(prompt.id) && picked.length < 3) {
        seen.add(prompt.id);
        picked.push(prompt);
      }
    }
  }
  // Round-robin across the named hazards, so every worry is represented before
  // any one of them gets a second prompt.
  for (let round = 0; round < 3 && picked.length < 3; round++) {
    for (const h of hazards) {
      const p = PHOTO_PROMPTS[h][round];
      if (p && !seen.has(p.id) && picked.length < 3) {
        seen.add(p.id);
        picked.push(p);
      }
    }
  }
  return [...picked, PHOTO_PROMPT_OPEN];
}

// ── Beat 4 · the read-back ───────────────────────────────────────────────────

export type HazardCheckAnswer = 'worse' | 'same' | 'less' | 'unsure';

export const HAZARD_CHECK_OPTIONS: Array<{ id: HazardCheckAnswer; pt: string; en: string }> = [
  { id: 'worse', pt: 'Aqui é pior', en: "It's worse here" },
  { id: 'same', pt: 'É mais ou menos isso', en: "That's about right" },
  { id: 'less', pt: 'Aqui é mais tranquilo', en: "It's calmer here" },
  // First-class, never penalised. Precedent: has_cnpj already carries
  // "Não temos certeza" as a real answer in E1.
  { id: 'unsure', pt: 'Não sei dizer', en: "I can't say" },
];

const HAZARD_WORD: Record<HazardKey, { pt: string; en: string }> = {
  flood: { pt: 'alagamento', en: 'flooding' },
  heat: { pt: 'calor', en: 'heat' },
  landslide: { pt: 'deslizamento', en: 'landslide' },
};

function level(pct: number, lang: 'pt' | 'en'): string {
  const i = pct >= 66 ? 2 : pct >= 33 ? 1 : 0;
  return (lang === 'pt' ? ['baixo', 'médio', 'alto'] : ['low', 'medium', 'high'])[i];
}

/**
 * Our side of the read-back: state what the data says, say plainly that it is a
 * bairro average, and ask whether their corner is worse, the same, or calmer.
 *
 * This is the cheapest possible attack on the resolution problem — it needs no
 * new geospatial work and produces the one thing the rasters cannot give us: a
 * site-versus-bairro delta, stated by someone standing in the place. When
 * point-level mechanism sampling lands, a sharper claim ("the flooding here
 * looks like rain that can't drain, not the stream rising") replaces the
 * generic one; the answer shape stays identical.
 */
export function hazardCheckQuestion(
  hazard: HazardKey,
  pct: number,
  bairro: string,
  lang: 'pt' | 'en',
  /** False when no site is pinned yet — the check then validates the bairro
   *  figure itself against what they live, which is still worth knowing. */
  hasSite = true,
): string {
  const w = HAZARD_WORD[hazard][lang];
  const l = level(pct, lang);
  if (!hasSite) {
    return lang === 'pt'
      ? `Nosso mapa diz que o risco de ${w} é **${l}** no ${bairro} — mas isso é uma média do bairro inteiro. No dia a dia de vocês, isso bate? É pior, é mais ou menos isso, ou é mais tranquilo?`
      : `Our map says ${w} risk is **${l}** in ${bairro} — but that's an average over the whole neighbourhood. Does that match your day to day? Is it worse, about the same, or calmer?`;
  }
  return lang === 'pt'
    ? `Nosso mapa diz que o risco de ${w} é **${l}** no ${bairro} — mas isso é a média do bairro inteiro, não do lugar de vocês. No lugar de vocês, é pior, é mais ou menos isso, ou é mais tranquilo?`
    : `Our map says ${w} risk is **${l}** in ${bairro} — but that's an average over the whole neighbourhood, not your place. At your place, is it worse, about the same, or calmer?`;
}

/** Which hazards are worth checking: what they named, plus anything our data calls high. */
export function hazardsToCheck(worries: string[], risks: Record<HazardKey, number>): HazardKey[] {
  const named = familiesOfWorries(worries);
  const dataHigh = (['flood', 'heat', 'landslide'] as HazardKey[]).filter(h => (risks[h] ?? 0) >= 66);
  // Cap at two — three checkpoints is where a conversation becomes a form.
  return Array.from(new Set([...named, ...dataHigh])).slice(0, 2);
}

// ── The depth read ───────────────────────────────────────────────────────────

export interface SiteKnowledgeDepth {
  level: 'thin' | 'partial' | 'strong';
  score: number;
  /** What we actually got, in plain language, for the coordinator. */
  captured: string[];
  /** What is still unknown — including everything answered "I can't say". */
  unknowns: string[];
  /** Where the organization's account and our data disagree. Not an error. */
  disagreements: string[];
}

export interface DepthInput {
  siteConfirmed: boolean;
  worries: string[];
  story: string;
  photoIntent: 'sent' | 'later' | 'skip' | '';
  photoCount: number;
  hazardChecks: Partial<Record<HazardKey, HazardCheckAnswer>>;
  currentUse: string;
  tenure: string;
  risks: Record<HazardKey, number>;
  /** Files the org already shared — a proposal or site description may already
   *  answer what we are about to ask. Counted as depth, but see below: anything
   *  a document filled still needs confirming before it counts as known. */
  docCount?: number;
  docImageCount?: number;
  /** intervention_site fields written from a document and not yet confirmed by
   *  a human. The doc-staging gate today only covers org_profile, so these
   *  commit unstaged — they are evidence, not testimony, until someone says so. */
  unconfirmedDocFields?: string[];
}

/**
 * What W2 hands to W3. Coordinator-facing by decision (2026-07-31): shown to the
 * organization it reads as a grade, which is exactly the extractive dynamic
 * Antônia warned about on 2026-07-16.
 *
 * Deliberately mechanical — it counts what was captured rather than judging the
 * organization. Any interpretation on top is the coordinator's, or an agent
 * summary clearly labelled as one.
 */
export function computeSiteKnowledgeDepth(input: DepthInput, lang: 'pt' | 'en'): SiteKnowledgeDepth {
  const pt = lang === 'pt';
  const captured: string[] = [];
  const unknowns: string[] = [];
  const disagreements: string[] = [];
  let score = 0;

  if (input.siteConfirmed) {
    score += 1;
    captured.push(pt ? 'lugar marcado no mapa' : 'site pinned on the map');
  } else {
    unknowns.push(pt ? 'ainda sem lugar definido' : 'no site chosen yet');
  }

  if (input.worries.length > 0) {
    score += 1;
    captured.push(pt ? `preocupação declarada: ${input.worries.join(', ')}` : `stated worry: ${input.worries.join(', ')}`);
    // The disagreement that matters most: what they fear is not what our data
    // ranks highest. Compared RELATIVELY, not against an absolute threshold —
    // an org naming the hazard our raster scores lowest in their bairro is a
    // finding whether or not any hazard clears some cutoff, and in a bairro
    // where everything reads low (common: the landslide ramp never leaves
    // green city-wide) an absolute gate would never fire at all.
    const ranked = (['flood', 'heat', 'landslide'] as HazardKey[])
      .slice()
      .sort((a, b) => (input.risks[b] ?? 0) - (input.risks[a] ?? 0));
    const named = input.worries.filter((w): w is HazardKey =>
      w === 'flood' || w === 'heat' || w === 'landslide');
    if (named.length > 0) {
      const top = ranked[0];
      const bestNamed = Math.max(...named.map(h => input.risks[h] ?? 0));
      if (!named.includes(top) && (input.risks[top] ?? 0) - bestNamed >= 20) {
        disagreements.push(
          pt
            ? `nosso dado aponta ${HAZARD_WORD[top].pt} como o risco mais alto do bairro, mas elas apontaram ${named.map(h => HAZARD_WORD[h].pt).join(' e ')}`
            : `our data ranks ${HAZARD_WORD[top].en} highest for the bairro, but they named ${named.map(h => HAZARD_WORD[h].en).join(' and ')}`,
        );
      }
      // They named the hazard our data scores LOWEST, and scores as low.
      // Only worth saying when the line above didn't already say it: for a
      // single named hazard both fire and state the same fact twice, which
      // gives the coordination three entries for two findings.
      const bottom = ranked[ranked.length - 1];
      const alreadyCovered = disagreements.length > 0 && named.length === 1 && named[0] === bottom;
      if (!alreadyCovered && named.includes(bottom) && (input.risks[bottom] ?? 0) < 33) {
        disagreements.push(
          pt
            ? `elas apontaram ${HAZARD_WORD[bottom].pt}, que o nosso dado classifica como baixo no bairro`
            : `they named ${HAZARD_WORD[bottom].en}, which our data scores low for the bairro`,
        );
      }
    }
  } else {
    unknowns.push(pt ? 'não disseram o que mais preocupa' : "didn't say what worries them most");
  }

  const storyLen = input.story.trim().length;
  const docCount = input.docCount ?? 0;
  if (storyLen >= 120) {
    score += 2;
    captured.push(pt ? 'relato próprio sobre o lugar' : 'their own account of the place');
  } else if (storyLen > 0) {
    score += 1;
    captured.push(pt ? 'relato curto sobre o lugar' : 'a short account of the place');
  } else if (docCount > 0) {
    // They may have answered in a file rather than in the chat — a proposal or
    // site description is an account, just not one given to us conversationally.
    captured.push(pt ? 'sem relato no chat, mas há arquivos' : 'no account in chat, but files exist');
  } else {
    unknowns.push(pt ? 'sem relato sobre o lugar' : 'no account of the place');
  }

  if (docCount > 0) {
    score += Math.min(2, docCount);
    captured.push(
      pt
        ? `${docCount} arquivo(s) compartilhado(s)${input.docImageCount ? `, ${input.docImageCount} com imagem` : ''}`
        : `${docCount} shared file(s)${input.docImageCount ? `, ${input.docImageCount} with images` : ''}`,
    );
  }

  if (input.unconfirmedDocFields?.length) {
    unknowns.push(
      pt
        ? `tirado de arquivo e ainda não confirmado com elas: ${input.unconfirmedDocFields.join(', ')}`
        : `taken from a file and not yet confirmed with them: ${input.unconfirmedDocFields.join(', ')}`,
    );
  }

  if (input.photoIntent === 'sent' && input.photoCount > 0) {
    score += 2;
    captured.push(pt ? `${input.photoCount} foto(s) do lugar` : `${input.photoCount} photo(s) of the place`);
  } else if (input.photoIntent === 'later') {
    score += 1;
    captured.push(pt ? 'ficaram de mandar fotos' : 'said they would send photos');
    unknowns.push(pt ? 'fotos ainda não chegaram' : 'photos not in yet');
  } else {
    unknowns.push(pt ? 'sem fotos do lugar' : 'no photos of the place');
  }

  for (const [h, answer] of Object.entries(input.hazardChecks) as Array<[HazardKey, HazardCheckAnswer]>) {
    if (answer === 'unsure') {
      unknowns.push(pt ? `não souberam dizer sobre ${HAZARD_WORD[h].pt}` : `couldn't say about ${HAZARD_WORD[h].en}`);
      continue;
    }
    score += 1;
    if (answer === 'worse' || answer === 'less') {
      disagreements.push(
        pt
          ? `dizem que ${HAZARD_WORD[h].pt} no lugar é ${answer === 'worse' ? 'pior' : 'mais brando'} que a média do bairro`
          : `they say ${HAZARD_WORD[h].en} at the site is ${answer === 'worse' ? 'worse' : 'milder'} than the bairro average`,
      );
    }
  }

  if (input.tenure && input.tenure !== 'mixed') {
    score += 1;
  } else {
    unknowns.push(pt ? 'posse do terreno a esclarecer' : 'tenure still to clarify');
  }

  // We never have these from any dataset — worth naming so W3 knows to ask.
  if (input.worries.includes('flood')) {
    unknowns.push(pt ? 'lençol freático e tubulação enterrada (sem dado)' : 'groundwater and buried pipes (no data)');
  }

  const level: SiteKnowledgeDepth['level'] = score >= 6 ? 'strong' : score >= 3 ? 'partial' : 'thin';
  return { level, score, captured, unknowns, disagreements };
}

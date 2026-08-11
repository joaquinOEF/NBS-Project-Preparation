// ============================================================================
// E2 FAMÍLIA RANKING — the model reads what the org actually told us
// ============================================================================
// The famílias card opens with "Pra esse lugar, COM O QUE VOCÊ ME CONTOU, vale
// estudar essas famílias". That was mostly untrue. `rankFamiliasForSite` took
// bairro risks, `current_use`, the site-name keywords, the hazard-check
// corrections and `site_worry` — and nothing else. `site_story`, the voice note
// the org recorded describing its own place, was inert. So were the photos we
// explicitly asked them to take. The model's own ranking only ever ran if the
// user tapped "Quero ajustar", i.e. only after the list had already disappointed
// them (JVP, 2026-08-03).
//
// This module closes that. One structured call ranks the five famílias over the
// FULL context — story, photos, worries, corrections, tenure, documents — and
// writes why-lines that quote the org's own words.
//
// Three things keep it honest:
//
//  1. It cannot invent, drop or reorder the catalogue. The schema is an ordering
//     of the five known família ids plus a why-line each; anything else is
//     rejected and the deterministic ranking is served instead.
//  2. Every existing guardrail is re-applied AFTER the model, not asked of it:
//     all five ship ("nada fica descartado" is on screen and has to be true), a
//     família answering a stated worry can never be marked weak, example
//     variants come from the catalogue.
//  3. It always falls back. A timeout, an API error, a malformed answer or a
//     missing key produces the deterministic list — the beat never stalls and
//     never renders empty. Ranking quality degrades; the flow does not break.
//
// Reproducibility is the cost of a model in this position, and it is paid back
// by RECORDING rather than by determinism: the caller persists both this result
// and the deterministic baseline, so the coordinator (and the export bundle) can
// see "our data said X; after reading your story the agent said Y".

import { z } from 'zod';
import { createStructuredResponse, type ContentPart, type Message } from './openaiClient';
import { NBS_FAMILIAS, type NbsFamiliaId } from '@shared/nbs-catalog';
import {
  rankFamiliasForSite,
  exampleSolutionsFor,
  type FamiliaRecoInput,
} from '@shared/nbs-recommendation';

const FAMILIA_IDS: NbsFamiliaId[] = NBS_FAMILIAS.map(f => f.id);

/** Hard ceiling on the call. JVP okayed ~15s at this beat because the tool
 *  activity is narrated ("especially if the tool call is explicit"), so this
 *  buys real reasoning instead of racing a spinner. Past it we serve the
 *  deterministic list — a slower right answer is not worth a stalled chat. */
const TIMEOUT_MS = 12_000;

/** At most this many site photos go into the call. Beyond three the marginal
 *  photo says little and the request gets slow and expensive. */
const MAX_PHOTOS = 3;

const RankingSchema = z.object({
  ranking: z.array(
    z.object({
      familiaId: z.string(),
      why: z.string(),
    }),
  ),
});

export interface FamiliaRankerContext {
  lang: 'pt' | 'en';
  /** Everything the deterministic ranker needs — also the fallback's input. */
  baseline: FamiliaRecoInput;
  /** The org's own account of the place (voice note or typed). The single
   *  richest input, and until now unused. */
  story?: string;
  /** Hazards the org named as worrying them here. */
  worries?: string[];
  /** How the org corrected our bairro figures ('worse' | 'same' | 'calmer'). */
  corrections?: Record<string, string>;
  landTenure?: string;
  orgMission?: string;
  /** Site photos as data URLs, already size-bounded by the caller. */
  photos?: Array<{ filename: string; dataUrl: string }>;
  /** Short excerpts from documents the org uploaded. */
  docExcerpts?: string[];
}

export interface RankedFamiliaItem {
  familiaId: string;
  why: string;
  exampleSolutionIds: string[];
  weak?: boolean;
}

export interface FamiliaRankingResult {
  items: RankedFamiliaItem[];
  /** 'model' when the call succeeded and validated; 'deterministic' otherwise.
   *  Persisted, so a coordinator reading a recommendation can tell which it is
   *  rather than assuming the richer one. */
  source: 'model' | 'deterministic';
  /** Why we fell back, when we did — for the log and the export bundle. */
  fallbackReason?: string;
}

/**
 * Whether a model call is possible at all.
 *
 * Exported so the caller can skip ASSEMBLING the context when it can't be used.
 * Gathering the photos means reading every blob original; without this the beat
 * paid two DB round-trips and N blob fetches on every run that was always going
 * to fall back — including every e2e run and every deployment without a key.
 */
export function rankerCanRun(): boolean {
  return !!process.env.AI_INTEGRATIONS_OPENAI_API_KEY;
}

function catalogueBrief(lang: 'pt' | 'en'): string {
  return NBS_FAMILIAS.map(f => {
    const t = lang === 'pt' ? f.pt : f.en;
    return `- ${f.id}: ${t.label} — ${t.description}`;
  }).join('\n');
}

function buildPrompt(ctx: FamiliaRankerContext): Message[] {
  const { lang } = ctx;
  const pt = lang === 'pt';
  const r = ctx.baseline.risks;

  const facts = [
    `Bairro: ${ctx.baseline.bairro}`,
    `Bairro-wide hazard PERCENTILES vs the rest of Porto Alegre (0-100, NOT measured at the site): `
      + `flood ${r.flood}, heat ${r.heat}, landslide ${r.landslide}. `
      + `These are the bairro's rank among 94, not an absolute severity.`,
    ctx.baseline.siteName ? `Site: ${ctx.baseline.siteName}` : null,
    ctx.baseline.currentUse ? `What the place is like today: ${ctx.baseline.currentUse}` : null,
    ctx.landTenure ? `Access / tenure: ${ctx.landTenure}` : null,
    ctx.worries?.length ? `What they said worries them here: ${ctx.worries.join(', ')}` : null,
    ctx.corrections && Object.keys(ctx.corrections).length
      ? `How they corrected our figures: ${Object.entries(ctx.corrections).map(([h, v]) => `${h}=${v}`).join(', ')}`
      : null,
    ctx.orgMission ? `Organization: ${ctx.orgMission}` : null,
    ctx.docExcerpts?.length ? `From their documents:\n${ctx.docExcerpts.map(e => `  "${e}"`).join('\n')}` : null,
  ].filter(Boolean).join('\n');

  const system: Message = {
    role: 'system',
    content: [
      'You rank five families of nature-based solutions for a Brazilian community organization, for the CLOSE of Workshop 2 of the COUGAR programme in Porto Alegre.',
      '',
      'The families (you MUST return all five, exactly these ids, no others):',
      catalogueBrief(lang),
      '',
      'RULES:',
      '1. Order all five from most to least worth STUDYING for this place. This is an invitation to study, never a verdict — the organization picks the variant later.',
      "2. The organization's own account of the place OUTRANKS our map. Our hazard figures are neighbourhood-wide averages over whole blocks; they cannot see a yard. If the story says the patio floods and our flood figure is low, believe the story.",
      '3. Every `why` must be ONE short sentence that QUOTES OR PARAPHRASES SOMETHING THEY ACTUALLY SAID or that a photo actually shows. Never generic benefit copy. If you have nothing of theirs for a family, say plainly why it is lower down instead of inventing enthusiasm.',
      `4. Write every \`why\` in ${pt ? 'Brazilian Portuguese, warm, second person singular ("vocês")' : 'English'}.`,
      '5. Do not mention scores, percentages, rankings or our data sources in the `why` lines.',
      '',
      'Return JSON: { "ranking": [ { "familiaId", "why" } x5 ] }.',
    ].join('\n'),
  };

  const parts: ContentPart[] = [
    {
      type: 'input_text',
      text: [
        'WHAT WE KNOW ABOUT THIS PLACE',
        facts,
        '',
        ctx.story
          ? `THEIR OWN WORDS ABOUT THE PLACE (the most important input — they recorded this for us):\n"""\n${ctx.story}\n"""`
          : 'They did not leave a description of the place in their own words.',
        ctx.photos?.length
          ? `\nPHOTOS THEY TOOK OF THE PLACE (${ctx.photos.map(p => p.filename).join(', ')}) follow. Read them: standing water, exposed soil, bare pavement, absence of shade, a slope, rubbish — whatever is actually visible. Use what you see in the \`why\` lines.`
          : '\nThey sent no photos of the place.',
      ].join('\n'),
    },
  ];
  for (const p of (ctx.photos ?? []).slice(0, MAX_PHOTOS)) {
    parts.push({ type: 'input_image', image_url: p.dataUrl, detail: 'low' });
  }

  return [system, { role: 'user', content: parts }];
}

/**
 * Turn the model's answer into a servable list, or say why it can't be.
 *
 * Exported and pure so the guardrails are testable WITHOUT a model key — the
 * e2e environment has none, so without this the only tested path would be the
 * fallback and every rule below would ship unverified.
 *
 * The model is trusted for ORDER and PROSE and nothing else. It cannot invent a
 * família, drop one, duplicate one, or decide that one is weak: `weak` means
 * "we have no signal for this", a claim about our data that the model is in no
 * position to make about itself.
 */
export function validateModelRanking(
  raw: Array<{ familiaId: string; why: string }> | undefined,
  deterministic: ReturnType<typeof rankFamiliasForSite>,
): { items: RankedFamiliaItem[] } | { error: string } {
  const seen = new Set<string>();
  const ordered: Array<{ familiaId: NbsFamiliaId; why: string }> = [];
  for (const r of raw ?? []) {
    const id = String(r?.familiaId || '').trim() as NbsFamiliaId;
    if (!FAMILIA_IDS.includes(id) || seen.has(id)) continue;
    const why = String(r?.why || '').trim();
    if (!why) continue;
    seen.add(id);
    ordered.push({ familiaId: id, why });
  }
  // Anything short of the full catalogue is a broken answer, not a partial one:
  // "Nada fica descartado" is printed directly above this list, so a list of
  // four would put a lie on screen.
  if (ordered.length !== FAMILIA_IDS.length) {
    return { error: `model returned ${ordered.length}/${FAMILIA_IDS.length} famílias` };
  }
  const weakById = new Map(
    deterministic.map(d => [d.familiaId, !!d.weak && !d.guaranteed]),
  );
  return {
    items: ordered.map(o => ({
      familiaId: o.familiaId,
      why: o.why,
      exampleSolutionIds: exampleSolutionsFor(o.familiaId),
      ...(weakById.get(o.familiaId) ? { weak: true } : {}),
    })),
  };
}

/**
 * Rank the famílias over the org's full context, falling back to the
 * deterministic ranking on any failure. Never throws.
 */
export async function rankFamiliasWithContext(
  ctx: FamiliaRankerContext,
): Promise<FamiliaRankingResult> {
  const deterministic = rankFamiliasForSite(ctx.baseline);
  const fallback = (reason: string): FamiliaRankingResult => ({
    source: 'deterministic',
    fallbackReason: reason,
    items: deterministic.map(d => ({
      familiaId: d.familiaId,
      why: ctx.lang === 'pt' ? d.why.pt : d.why.en,
      exampleSolutionIds: d.exampleSolutionIds,
      ...(d.weak && !d.guaranteed ? { weak: true } : {}),
    })),
  });

  // Nothing of theirs to read → the model has no advantage over the arithmetic,
  // and we skip a call that would only add latency.
  if (!ctx.story?.trim() && !ctx.photos?.length && !ctx.docExcerpts?.length) {
    return fallback('no org-supplied context to read');
  }
  if (!rankerCanRun()) {
    return fallback('no API key');
  }

  try {
    const result = await Promise.race([
      createStructuredResponse(
        { input: buildPrompt(ctx), config: { reasoningEffort: 'low', maxCompletionTokens: 2000 } },
        RankingSchema,
        'familia_ranking',
      ),
      new Promise<never>((_, rej) =>
        setTimeout(() => rej(new Error('timeout')), TIMEOUT_MS),
      ),
    ]);

    const validated = validateModelRanking(result.ranking, deterministic);
    if ('error' in validated) return fallback(validated.error);
    return { source: 'model', items: validated.items };
  } catch (e: any) {
    const reason = e?.message === 'timeout' ? `timeout after ${TIMEOUT_MS}ms` : String(e?.message || e);
    console.error('[cbo] família ranking fell back to deterministic:', reason);
    return fallback(reason);
  }
}

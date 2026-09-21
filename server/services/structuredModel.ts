// ============================================================================
// STRUCTURED MODEL CALLS — Anthropic first, because that is the key we have
// ============================================================================
// The platform talks to organisations with Anthropic (the CBO agent runs on
// claude-sonnet-4-6 through the Agent SDK). Every *structured* call — the W2
// família ranking, and then the W3 advisor and the synergy report — went
// through the OpenAI client instead, because that is where
// createStructuredResponse happened to live.
//
// Nobody chose that. It is a pattern the first analytical feature set and the
// next two inherited without anyone asking.
//
// ⚠️ It is NOT broken in production, and an earlier version of this comment
// claimed it was. The deployment sets AI_INTEGRATIONS_OPENAI_BASE_URL to
// Replit's own gateway (http://localhost:1106/modelfarm/openai) with a dummy
// key, so the OpenAI path resolves there and works. The reading passes were
// never falling back.
//
// So this is a deliberate choice, not a fix: the platform talks to
// organisations with Anthropic, and the analysis of what they said should run
// on the same provider — one bill, one set of model behaviours, and no
// dependency on a host-specific gateway for the features that decide what an
// organisation is shown.
//
// One entry point. Anthropic when its key is present, the OpenAI-compatible
// path when it is not — which still covers the gateway. Callers pass a Zod
// schema and get a validated object either way, and CBO_STRUCTURED_PROVIDER
// forces one if the choice ever needs revisiting per environment.
//
// Implemented against the REST API with fetch rather than adding a second
// Anthropic dependency beside the Agent SDK — it is one POST, and a structured
// call has no use for the SDK's session machinery.
// ============================================================================

import { z } from 'zod';
import { createStructuredResponse, zodToJsonSchema, type ContentPart, type Message } from './openaiClient';

export type { ContentPart, Message };

export interface StructuredParams {
  input: Message[];
  config?: { model?: string; maxCompletionTokens?: number; reasoningEffort?: string };
}

/** Which provider a structured call will actually use, for logging and skips. */
export function structuredProvider(): 'anthropic' | 'openai' | null {
  const hasAnthropic = !!process.env.ANTHROPIC_API_KEY;
  const hasOpenAi = !!(process.env.OPENAI_API_KEY || process.env.AI_INTEGRATIONS_OPENAI_API_KEY);
  const forced = process.env.CBO_STRUCTURED_PROVIDER;
  if (forced === 'openai' && hasOpenAi) return 'openai';
  if (forced === 'anthropic' && hasAnthropic) return 'anthropic';
  if (hasAnthropic) return 'anthropic';
  if (hasOpenAi) return 'openai';
  return null;
}

const ANTHROPIC_MODEL = process.env.CBO_STRUCTURED_MODEL || 'claude-sonnet-4-6';
const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';

/** OpenAI content parts → Anthropic's shape. */
function toAnthropicContent(content: string | ContentPart[]): unknown {
  if (typeof content === 'string') return content;
  return content.map(part => {
    if (part.type === 'input_text') return { type: 'text', text: part.text };
    // data:image/jpeg;base64,XXXX — Anthropic wants the media type and the
    // payload separately rather than as one URL.
    const m = /^data:([^;]+);base64,(.*)$/.exec(part.image_url);
    if (!m) return { type: 'text', text: '[imagem não pôde ser lida]' };
    return { type: 'image', source: { type: 'base64', media_type: m[1], data: m[2] } };
  });
}

/**
 * A validated object from the model.
 *
 * Anthropic has no JSON-schema response format, so the schema is expressed as a
 * single tool the model is forced to call — which is the supported way to get a
 * shape out of it, and gives the same guarantee: either the object parses
 * against the Zod schema or this throws and the caller falls back.
 */
export async function createStructured<T>(
  params: StructuredParams,
  schema: z.ZodSchema<T>,
  schemaName = 'response',
): Promise<T> {
  const provider = structuredProvider();
  if (provider === 'openai') {
    return createStructuredResponse(params as any, schema, schemaName);
  }
  if (provider !== 'anthropic') throw new Error('no model provider configured');

  const system = params.input.filter(m => m.role === 'system' || m.role === 'developer')
    .map(m => (typeof m.content === 'string' ? m.content : ''))
    .filter(Boolean)
    .join('\n\n');
  const messages = params.input
    .filter(m => m.role === 'user' || m.role === 'assistant')
    .map(m => ({ role: m.role, content: toAnthropicContent(m.content) }));

  const res = await fetch(ANTHROPIC_URL, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY!,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: params.config?.model?.startsWith('claude') ? params.config.model : ANTHROPIC_MODEL,
      max_tokens: params.config?.maxCompletionTokens ?? 4096,
      ...(system ? { system } : {}),
      messages,
      tools: [{
        name: schemaName,
        description: 'Devolve o resultado neste formato exato.',
        input_schema: zodToJsonSchema(schema) as Record<string, unknown>,
      }],
      // Forced: a structured call that comes back as prose is a failed call,
      // and letting the model choose invites exactly that.
      tool_choice: { type: 'tool', name: schemaName },
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`anthropic ${res.status}${body ? `: ${body.slice(0, 200)}` : ''}`);
  }
  const json: any = await res.json();
  const block = (json.content ?? []).find((c: any) => c.type === 'tool_use');
  if (!block) throw new Error('anthropic returned no tool_use block');
  return schema.parse(reviveStringified(block.input));
}

/**
 * ⚠️ A forced tool use sometimes returns an array AS A STRING — `"shortlist":
 * "[{…}]"` — and zod then rejects the whole reply over a value that is one
 * JSON.parse away from correct. Caught live on 2026-09-21: the W3 advisor's
 * entire reading (shortlist, questions, observations) was discarded for an
 * organisation with seven uploaded files, and the only sign was a log line.
 * There is no retry on a one-shot call, so the repair happens here, for every
 * pass: a top-level string that parses to an array or an object becomes it.
 * Anything else is left exactly as it came, and the schema still decides.
 */
export function reviveStringified(input: unknown): unknown {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return input;
  const out: Record<string, unknown> = { ...(input as Record<string, unknown>) };
  for (const [k, v] of Object.entries(out)) {
    if (typeof v !== 'string') continue;
    const t = v.trim();
    if (!t.startsWith('[') && !t.startsWith('{')) continue;
    try {
      const parsed = parseLenient(t);
      if (parsed && typeof parsed === 'object') {
        console.warn(`[structured] "${k}" arrived as a string and was revived (${Array.isArray(parsed) ? `${parsed.length} item(s)` : 'object'})`);
        out[k] = parsed;
      }
    } catch {
      // Not JSON as it stands — the schema will reject it. Say what arrived, so
      // the next repair is chosen from the payload rather than from a guess.
      console.warn(`[structured] "${k}" arrived as an unparseable string (${t.length} chars): ${t.slice(0, 160)} … ${t.slice(-80)}`);
    }
  }
  return out;
}

/**
 * JSON.parse, then one repair. Measured on 2026-09-21: 1 advisor call in 5
 * returned `shortlist` as a string whose TEXT carried unescaped quotation marks
 * — the model quoting the organisation's report, `anota que as calhas "despejam
 * direto no piso"` — so the string was not valid JSON either, and the whole
 * reading was lost. The repair: inside a string, a `"` only closes it when what
 * follows (past whitespace) is `,` `}` `]` `:` or the end; any other `"` is
 * text and is escaped, as is a raw line break. If that still does not parse,
 * it throws and the schema rejects the reply exactly as before.
 */
export function parseLenient(text: string): unknown {
  try { return JSON.parse(text); } catch { /* repair below */ }
  let out = '';
  let inString = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (!inString) { if (c === '"') inString = true; out += c; continue; }
    if (c === '\\') { out += c + (text[i + 1] ?? ''); i++; continue; }
    if (c === '\n') { out += '\\n'; continue; }
    if (c === '\r') continue;
    if (c === '\t') { out += '\\t'; continue; }
    if (c === '"') {
      let j = i + 1;
      while (j < text.length && /\s/.test(text[j])) j++;
      const next = text[j];
      if (next === undefined || next === ',' || next === '}' || next === ']' || next === ':') { inString = false; out += c; }
      else out += '\\"';
      continue;
    }
    out += c;
  }
  return JSON.parse(out);
}

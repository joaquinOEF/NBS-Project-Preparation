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
  return schema.parse(block.input);
}

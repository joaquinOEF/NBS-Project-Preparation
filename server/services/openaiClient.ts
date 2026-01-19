import OpenAI from "openai";
import { z } from "zod";

export const openai = new OpenAI({
  apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
  baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
});

export type ReasoningEffort = "none" | "low" | "medium" | "high" | "xhigh";

export interface ResponsesConfig {
  model?: string;
  reasoningEffort?: ReasoningEffort;
  maxCompletionTokens?: number;
  temperature?: number;
}

const DEFAULT_CONFIG: ResponsesConfig = {
  model: "gpt-5.2",
  reasoningEffort: "medium",
  maxCompletionTokens: 8192,
};

export interface Message {
  role: "user" | "assistant" | "system" | "developer";
  content: string;
}

export interface ResponsesCreateParams {
  input: Message[];
  config?: ResponsesConfig;
  stream?: boolean;
}

export interface StreamingEvent {
  type: string;
  delta?: string;
  content?: string;
  sequence_number?: number;
  [key: string]: unknown;
}

export async function createResponse(params: ResponsesCreateParams): Promise<string> {
  const { input, config = {} } = params;
  const mergedConfig = { ...DEFAULT_CONFIG, ...config };

  const response = await openai.responses.create({
    model: mergedConfig.model!,
    input: input.map(m => ({ role: m.role, content: m.content })),
    max_output_tokens: mergedConfig.maxCompletionTokens,
    reasoning: { effort: mergedConfig.reasoningEffort as any },
  });

  const output = response.output || [];
  const textContent = output
    .filter((item: any) => item.type === "message")
    .flatMap((item: any) => item.content || [])
    .filter((part: any) => part.type === "output_text")
    .map((part: any) => part.text)
    .join("");

  return textContent;
}

export async function* streamResponse(params: ResponsesCreateParams): AsyncGenerator<StreamingEvent> {
  const { input, config = {} } = params;
  const mergedConfig = { ...DEFAULT_CONFIG, ...config };

  const stream = await openai.responses.create({
    model: mergedConfig.model!,
    input: input.map(m => ({ role: m.role, content: m.content })),
    max_output_tokens: mergedConfig.maxCompletionTokens,
    reasoning: { effort: mergedConfig.reasoningEffort as any },
    stream: true,
  });

  for await (const event of stream as any) {
    if (event.type === "response.output_text.delta") {
      yield {
        type: "text_delta",
        delta: event.delta || "",
        sequence_number: event.sequence_number,
      };
    } else if (event.type === "response.completed") {
      yield {
        type: "completed",
        content: extractTextFromResponse(event.response),
      };
    } else if (event.type === "response.failed") {
      yield {
        type: "error",
        error: event.error || "Response generation failed",
      };
    } else if (event.type === "response.created") {
      yield { type: "created" };
    }
  }
}

function extractTextFromResponse(response: any): string {
  if (!response || !response.output) return "";
  
  return response.output
    .filter((item: any) => item.type === "message")
    .flatMap((item: any) => item.content || [])
    .filter((part: any) => part.type === "output_text")
    .map((part: any) => part.text)
    .join("");
}

export async function createStructuredResponse<T>(
  params: ResponsesCreateParams,
  schema: z.ZodSchema<T>,
  schemaName: string = "response"
): Promise<T> {
  const { input, config = {} } = params;
  const mergedConfig = { ...DEFAULT_CONFIG, ...config };

  const systemMessage: Message = {
    role: "system",
    content: `You must respond with valid JSON that matches this schema. Do not include any text outside the JSON object.`,
  };

  const jsonSchemaInstruction: Message = {
    role: "developer",
    content: `Output must be valid JSON matching this structure: ${JSON.stringify(zodToJsonSchema(schema))}`,
  };

  const jsonSchema = zodToJsonSchema(schema) as { [key: string]: unknown };

  const response = await openai.responses.create({
    model: mergedConfig.model!,
    input: [systemMessage, jsonSchemaInstruction, ...input].map(m => ({ 
      role: m.role, 
      content: m.content 
    })),
    max_output_tokens: mergedConfig.maxCompletionTokens,
    reasoning: { effort: mergedConfig.reasoningEffort as any },
    text: {
      format: {
        type: "json_schema",
        name: schemaName,
        schema: jsonSchema,
        strict: true,
      },
    },
  });

  const textContent = extractTextFromResponse(response);
  
  try {
    const parsed = JSON.parse(textContent);
    return schema.parse(parsed);
  } catch (error) {
    console.error("Failed to parse structured response:", textContent);
    throw new Error(`Invalid structured response: ${error}`);
  }
}

function zodToJsonSchema(schema: z.ZodSchema<any>): Record<string, unknown> {
  const typeName = (schema._def as any)?.typeName as string | undefined;
  
  if (typeName === "ZodObject") {
    const shape = (schema as z.ZodObject<any>).shape;
    const properties: Record<string, object> = {};
    const required: string[] = [];
    
    for (const [key, value] of Object.entries(shape)) {
      properties[key] = zodToJsonSchema(value as z.ZodSchema<any>);
      if (!(value as any).isOptional?.()) {
        required.push(key);
      }
    }
    
    return {
      type: "object",
      properties,
      required,
      additionalProperties: false,
    };
  }
  
  if (typeName === "ZodArray") {
    return {
      type: "array",
      items: zodToJsonSchema((schema as z.ZodArray<any>).element),
    };
  }
  
  if (typeName === "ZodString") {
    return { type: "string" };
  }
  
  if (typeName === "ZodNumber") {
    return { type: "number" };
  }
  
  if (typeName === "ZodBoolean") {
    return { type: "boolean" };
  }
  
  if (typeName === "ZodEnum") {
    return {
      type: "string",
      enum: (schema as z.ZodEnum<any>)._def.values,
    };
  }
  
  if (typeName === "ZodOptional") {
    return zodToJsonSchema((schema as z.ZodOptional<any>).unwrap());
  }
  
  if (typeName === "ZodNullable") {
    const inner = zodToJsonSchema((schema as z.ZodNullable<any>).unwrap());
    return { ...inner, nullable: true };
  }
  
  if (typeName === "ZodDefault") {
    return zodToJsonSchema((schema as z.ZodDefault<any>)._def.innerType);
  }
  
  return { type: "string" };
}

export async function createChatCompletion(
  messages: Message[],
  config?: Partial<ResponsesConfig>
): Promise<string> {
  const mergedConfig = { ...DEFAULT_CONFIG, ...config };
  
  const response = await openai.chat.completions.create({
    model: mergedConfig.model!,
    messages: messages.map(m => ({ role: m.role as any, content: m.content })),
    max_completion_tokens: mergedConfig.maxCompletionTokens,
    response_format: { type: "json_object" },
  });

  return response.choices[0]?.message?.content || "";
}

export async function* streamChatCompletion(
  messages: Message[],
  config?: Partial<ResponsesConfig>
): AsyncGenerator<StreamingEvent> {
  const mergedConfig = { ...DEFAULT_CONFIG, ...config };
  
  const stream = await openai.chat.completions.create({
    model: mergedConfig.model!,
    messages: messages.map(m => ({ role: m.role as any, content: m.content })),
    max_completion_tokens: mergedConfig.maxCompletionTokens,
    stream: true,
  });

  let fullContent = "";
  
  for await (const chunk of stream) {
    const delta = chunk.choices[0]?.delta?.content || "";
    if (delta) {
      fullContent += delta;
      yield {
        type: "text_delta",
        delta,
      };
    }
    
    if (chunk.choices[0]?.finish_reason === "stop") {
      yield {
        type: "completed",
        content: fullContent,
      };
    }
  }
}

export { openai as openaiClient };

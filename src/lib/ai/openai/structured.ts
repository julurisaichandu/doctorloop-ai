import { zodTextFormat } from "openai/helpers/zod";
import type { ResponseParseParams } from "openai/resources/responses/responses";
import type { z } from "zod";
import { estimatedUsageEvent, reportModelUsage } from "@/lib/ai/usage";

/** The only part of the OpenAI SDK the pipeline needs; tests inject a fake with this shape. */
export interface OpenAIClientLike {
  responses: {
    parse(body: ResponseParseParams): Promise<{
      output_parsed: unknown;
      output: unknown[];
      usage?: { input_tokens: number; output_tokens: number; total_tokens: number } | null;
    }>;
  };
}

export interface StructuredRequest<T> {
  model: string;
  /** Name of the strict JSON schema sent to the API. */
  name: string;
  schema: z.ZodType<T>;
  system: string;
  user: string;
}

/** Reasoning-style models (gpt-5*, o-series) reject `temperature`; only send it where it is supported. */
export function supportsTemperature(model: string): boolean {
  return /^(?:gpt-4|gpt-3\.5|chatgpt-4o)/.test(model);
}

function findRefusal(output: unknown[]): string | null {
  for (const item of output) {
    const content = (item as { content?: unknown }).content;
    if (!Array.isArray(content)) continue;
    for (const part of content) {
      const candidate = part as { type?: unknown; refusal?: unknown };
      if (candidate.type === "refusal") {
        return typeof candidate.refusal === "string" ? candidate.refusal : "refused";
      }
    }
  }
  return null;
}

/** One structured-output call. Throws on refusal, empty output or schema mismatch. */
export async function callStructured<T>(client: OpenAIClientLike, request: StructuredRequest<T>): Promise<T> {
  const response = await client.responses.parse({
    model: request.model,
    instructions: request.system,
    input: request.user,
    text: { format: zodTextFormat(request.schema, request.name) },
    store: false,
    ...(supportsTemperature(request.model) ? { temperature: 0 } : {}),
  });

  const refusal = findRefusal(response.output ?? []);
  if (refusal) throw new Error(`Model refused the request: ${refusal}`);
  if (response.output_parsed === null || response.output_parsed === undefined) {
    throw new Error("Model returned no structured output.");
  }
  const parsed = request.schema.parse(response.output_parsed);
  const usage = response.usage;
  reportModelUsage(
    usage
      ? {
          kind: request.name,
          provider: "openai",
          model: request.model,
          inputTokens: usage.input_tokens,
          outputTokens: usage.output_tokens,
          totalTokens: usage.total_tokens,
          tokenSource: "provider",
        }
      : estimatedUsageEvent(request.name, "openai", request.model, `${request.system}\n${request.user}`, JSON.stringify(parsed)),
  );
  return parsed;
}

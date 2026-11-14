import { AsyncLocalStorage } from "node:async_hooks";
import type { AiProvider, TokenCountSource } from "@/lib/domain/types";

/** One model call's token usage. Contains no prompt or output text. */
export interface ModelUsageEvent {
  /** Structured-output schema name: "observation_extraction" | "recovery_summary" | "privacy_filter" | ... */
  kind: string;
  provider: AiProvider;
  model: string | null;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  tokenSource: TokenCountSource;
}

const storage = new AsyncLocalStorage<ModelUsageEvent[]>();

export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

export function estimatedUsageEvent(
  kind: string,
  provider: AiProvider,
  model: string | null,
  promptText: string,
  outputText: string,
): ModelUsageEvent {
  const inputTokens = estimateTokens(promptText);
  const outputTokens = estimateTokens(outputText);
  return { kind, provider, model, inputTokens, outputTokens, totalTokens: inputTokens + outputTokens, tokenSource: "estimated" };
}

/** Records usage into the nearest collectModelUsage scope; a no-op outside one. */
export function reportModelUsage(event: ModelUsageEvent): void {
  storage.getStore()?.push(event);
}

/** Runs `fn` in a fresh scope and returns its result with every usage event reported inside it. */
export async function collectModelUsage<T>(fn: () => Promise<T>): Promise<{ result: T; events: ModelUsageEvent[] }> {
  const events: ModelUsageEvent[] = [];
  const result = await storage.run(events, fn);
  return { result, events };
}

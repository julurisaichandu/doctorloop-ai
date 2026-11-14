import "server-only";
import OpenAI from "openai";
import { env } from "@/lib/config/env";
import { AppError } from "@/lib/errors";

/** Creates the OpenAI client. The key stays on the server; callers fall back to the mock when it is missing. */
export function createOpenAIClient(apiKey: string | undefined = env.openaiApiKey): OpenAI {
  if (!apiKey) throw new AppError("INTEGRATION", "OPENAI_API_KEY is not configured.");
  return new OpenAI({ apiKey, maxRetries: 2, timeout: 60_000 });
}

import "server-only";
import { env } from "@/lib/config/env";
import { createOpenAIClient } from "@/lib/ai/openai/client";
import { createOpenAIExtractor } from "@/lib/ai/openai/extractor";
import { createOpenAISummarizer } from "@/lib/ai/openai/summarizer";
import { mockExtractor, mockSummarizer } from "@/lib/ai/mock/provider";
import { createOpenAIPrivacyClassifier } from "@/lib/ai/privacy/openai-classifier";
import { mockPrivacyClassifier } from "@/lib/ai/privacy/mock-classifier";
import type { PrivacyClassifier } from "@/lib/ai/privacy/types";
import type { ObservationExtractor, Summarizer } from "@/lib/ai/types";

export interface AiProviders {
  extractor: ObservationExtractor;
  summarizer: Summarizer;
}

export const MOCK_PROVIDERS: AiProviders = { extractor: mockExtractor, summarizer: mockSummarizer };

/** OpenAI when OPENAI_API_KEY is set, otherwise the deterministic mock. */
export function resolveProviders(): AiProviders {
  const apiKey = env.openaiApiKey;
  if (!apiKey) return MOCK_PROVIDERS;
  const client = createOpenAIClient(apiKey);
  const model = env.openaiModel;
  return {
    extractor: createOpenAIExtractor({ client, model }),
    summarizer: createOpenAISummarizer({ client, model }),
  };
}

/** Privacy filter classifier: OpenAI when OPENAI_API_KEY is set, otherwise the rule-based mock. */
export function resolvePrivacyClassifier(): PrivacyClassifier {
  const apiKey = env.openaiApiKey;
  if (!apiKey) return mockPrivacyClassifier;
  return createOpenAIPrivacyClassifier({ client: createOpenAIClient(apiKey), model: env.openaiModel });
}

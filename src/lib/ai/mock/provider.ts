import { extractObservationsMock } from "@/lib/ai/mock/extractor";
import { summarizeMock } from "@/lib/ai/mock/summarizer";
import { EXTRACTOR_SYSTEM_PROMPT, buildExtractorUserPrompt } from "@/lib/ai/openai/extractor";
import { SUMMARIZER_SYSTEM_PROMPT, buildSummarizerUserPrompt } from "@/lib/ai/openai/summarizer";
import { estimatedUsageEvent, reportModelUsage } from "@/lib/ai/usage";
import type { ObservationExtractor, Summarizer } from "@/lib/ai/types";

/** Deterministic rule-based providers: used without an OpenAI key and as the runtime fallback. */
export const mockExtractor: ObservationExtractor = {
  provider: "mock",
  model: null,
  extract: async (entry) => {
    const observations = extractObservationsMock(entry);
    reportModelUsage(
      estimatedUsageEvent(
        "observation_extraction",
        "mock",
        null,
        `${EXTRACTOR_SYSTEM_PROMPT}\n${buildExtractorUserPrompt(entry)}`,
        JSON.stringify({ observations }),
      ),
    );
    return observations;
  },
};

export const mockSummarizer: Summarizer = {
  provider: "mock",
  model: null,
  summarize: async (input) => {
    const summary = summarizeMock(input);
    reportModelUsage(
      estimatedUsageEvent(
        "recovery_summary",
        "mock",
        null,
        `${SUMMARIZER_SYSTEM_PROMPT}\n${buildSummarizerUserPrompt(input)}`,
        JSON.stringify(summary),
      ),
    );
    return summary;
  },
};

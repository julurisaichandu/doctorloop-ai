import type { AiProvider, SummaryContent } from "@/lib/domain/types";
import type { ExtractedObservation, PipelineEntry } from "@/lib/ai/schemas";
import { mockExtractor, mockSummarizer } from "@/lib/ai/mock/provider";
import { postprocessObservations, postprocessSummary } from "@/lib/ai/postprocess";
import type { ObservationExtractor, Summarizer, SummarizerInput } from "@/lib/ai/types";

/**
 * Pipeline stages with provider fallback. If a non-mock provider fails at runtime the
 * stage is re-run with the deterministic mock and reports provider "mock" honestly.
 */

export interface ExtractionStageResult {
  extracted: { entryId: string; observations: ExtractedObservation[] }[];
  provider: AiProvider;
  model: string | null;
}

export interface SummaryStageResult {
  summary: SummaryContent;
  provider: AiProvider;
  model: string | null;
}

function warnFallback(stage: string, error: unknown): void {
  const reason = error instanceof Error ? error.message : String(error);
  console.warn(`[DoctorLoop AI] ${stage} failed with the configured provider; using mock fallback. ${reason}`);
}

async function extractWith(entries: PipelineEntry[], extractor: ObservationExtractor): Promise<ExtractionStageResult> {
  const extracted = await Promise.all(
    entries.map(async (entry) => ({
      entryId: entry.id,
      observations: postprocessObservations(entry, await extractor.extract(entry)),
    })),
  );
  return { extracted, provider: extractor.provider, model: extractor.model };
}

export async function runExtractionStage(
  entries: PipelineEntry[],
  extractor: ObservationExtractor,
): Promise<ExtractionStageResult> {
  try {
    return await extractWith(entries, extractor);
  } catch (error) {
    if (extractor.provider === "mock") throw error;
    warnFallback("Observation extraction", error);
    return extractWith(entries, mockExtractor);
  }
}

async function summarizeWith(input: SummarizerInput, summarizer: Summarizer): Promise<SummaryStageResult> {
  const summary = postprocessSummary(
    await summarizer.summarize(input),
    input.entries.map((entry) => entry.id),
  );
  return { summary, provider: summarizer.provider, model: summarizer.model };
}

export async function runSummaryStage(input: SummarizerInput, summarizer: Summarizer): Promise<SummaryStageResult> {
  try {
    return await summarizeWith(input, summarizer);
  } catch (error) {
    if (summarizer.provider === "mock") throw error;
    warnFallback("Summary generation", error);
    return summarizeWith(input, mockSummarizer);
  }
}

import { createStep, createWorkflow } from "@mastra/core/workflows";
import { OBSERVATION_CATEGORIES, type ObservationCategory } from "@/lib/domain/types";
import type { ExtractedObservation } from "@/lib/ai/schemas";
import { resolveProviders, type AiProviders } from "@/lib/ai/providers";
import { runExtractionStage, runSummaryStage } from "@/lib/ai/stages";
import { buildTimeline } from "@/lib/ai/timeline";
import {
  ExtractStepOutputSchema,
  TimelineStepOutputSchema,
  WorkflowInputSchema,
  WorkflowOutputSchema,
  type WorkflowInput,
} from "@/lib/ai/workflow-schemas";

/**
 * Deterministic three-step workflow: extract-observations -> build-timeline -> summarize.
 * Only the extraction and summary steps involve a model; the timeline is pure code.
 * Providers are passed per run through the request context (see src/lib/ai/pipeline.ts).
 */

export const PROVIDERS_CONTEXT_KEY = "aiProviders";

function isAiProviders(value: unknown): value is AiProviders {
  const candidate = value as Partial<AiProviders> | null;
  return typeof candidate?.extractor?.extract === "function" && typeof candidate.summarizer?.summarize === "function";
}

function providersFrom(requestContext: { get(key: string): unknown }): AiProviders {
  const provided = requestContext.get(PROVIDERS_CONTEXT_KEY);
  return isAiProviders(provided) ? provided : resolveProviders();
}

function toCategory(value: string): ObservationCategory {
  return OBSERVATION_CATEGORIES.find((category) => category === value) ?? "other";
}

function toWorkflowObservation(entryId: string, index: number, obs: ExtractedObservation) {
  return {
    id: `${entryId}:${index}`,
    journalEntryId: entryId,
    category: toCategory(obs.category),
    label: obs.label,
    bodySite: obs.bodySite,
    patientQuote: obs.patientQuote,
    observedAt: obs.observedAt,
    timeDescription: obs.timeDescription,
    severity: obs.severity,
    severityText: obs.severityText,
    measureValue: obs.measureValue,
    measureUnit: obs.measureUnit,
    context: obs.context,
    uncertainties: obs.uncertainties,
  };
}

function entriesInScope(input: WorkflowInput) {
  const byId = new Map(input.contextEntries.map((entry) => [entry.id, entry]));
  for (const entry of input.newEntries) byId.set(entry.id, entry);
  return [...byId.values()];
}

export const extractObservationsStep = createStep({
  id: "extract-observations",
  description: "Extracts structured observations from each new journal entry (OpenAI or mock).",
  inputSchema: WorkflowInputSchema,
  outputSchema: ExtractStepOutputSchema,
  execute: async ({ inputData, requestContext }) =>
    runExtractionStage(inputData.newEntries, providersFrom(requestContext).extractor),
});

export const buildTimelineStep = createStep({
  id: "build-timeline",
  description: "Builds day buckets, trend series and explicit changes deterministically.",
  inputSchema: ExtractStepOutputSchema,
  outputSchema: TimelineStepOutputSchema,
  execute: async ({ inputData, getInitData }) => {
    const input = getInitData<WorkflowInput>();
    const reprocessed = new Set(input.newEntries.map((entry) => entry.id));
    const fresh = inputData.extracted.flatMap(({ entryId, observations }) =>
      observations.map((obs, index) => toWorkflowObservation(entryId, index, obs)),
    );
    const observations = [
      ...input.existingObservations.filter((obs) => !reprocessed.has(obs.journalEntryId)),
      ...fresh,
    ];
    return { timeline: buildTimeline(entriesInScope(input), observations), observations };
  },
});

export const summarizeStep = createStep({
  id: "summarize",
  description: "Writes the neutral, cited summary for the requested audience (OpenAI or mock).",
  inputSchema: TimelineStepOutputSchema,
  outputSchema: WorkflowOutputSchema,
  execute: async ({ inputData, getInitData, getStepResult, requestContext }) => {
    const input = getInitData<WorkflowInput>();
    const extraction = getStepResult(extractObservationsStep);
    const base = { extracted: extraction.extracted, timeline: inputData.timeline };

    if (!input.summarize) {
      return {
        ...base,
        summary: null,
        provider: extraction.provider,
        model: extraction.model,
        summaryProvider: null,
        summaryModel: null,
      };
    }
    const result = await runSummaryStage(
      {
        audience: input.audience,
        patientFirstName: input.patientContext.firstName,
        patientContext: input.patientContext,
        periodStart: input.periodStart,
        periodEnd: input.periodEnd,
        entries: entriesInScope(input),
        observations: inputData.observations,
        timeline: inputData.timeline,
      },
      providersFrom(requestContext).summarizer,
    );
    // Each stage falls back independently and reports its own provider/model.
    return {
      ...base,
      summary: result.summary,
      provider: extraction.provider,
      model: extraction.model,
      summaryProvider: result.provider,
      summaryModel: result.model,
    };
  },
});

export const healthUpdateWorkflow = createWorkflow({
  id: "health-update-pipeline",
  description: "Extract observations, build the timeline and summarize patient-reported recovery updates.",
  inputSchema: WorkflowInputSchema,
  outputSchema: WorkflowOutputSchema,
  options: { shouldPersistSnapshot: () => false },
})
  .then(extractObservationsStep)
  .then(buildTimelineStep)
  .then(summarizeStep)
  .commit();

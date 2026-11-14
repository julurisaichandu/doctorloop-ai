import { createStep, createWorkflow } from "@mastra/core/workflows";
import { resolvePrivacyClassifier } from "@/lib/ai/providers";
import { segmentSentences } from "@/lib/ai/privacy/segment";
import {
  AssembleOutputSchema,
  ClassifyOutputSchema,
  PrivacyInputSchema,
  SegmentOutputSchema,
  runAssembleStage,
  runClassifyStage,
} from "@/lib/ai/privacy/stages";
import type { PrivacyClassifier } from "@/lib/ai/privacy/types";

/**
 * Deterministic three-step workflow: segment -> classify -> assemble. Only `classify`
 * involves a model (OpenAI or the rule-based mock), and it only returns sentence numbers
 * and redaction spans; `assemble` builds the stored text from the original sentences.
 * The classifier is passed per run through the request context (see src/lib/ai/privacy-pipeline.ts).
 */

export const PRIVACY_CLASSIFIER_CONTEXT_KEY = "privacyClassifier";

function isClassifier(value: unknown): value is PrivacyClassifier {
  return typeof (value as Partial<PrivacyClassifier> | null)?.classify === "function";
}

function classifierFrom(requestContext: { get(key: string): unknown }): PrivacyClassifier {
  const provided = requestContext.get(PRIVACY_CLASSIFIER_CONTEXT_KEY);
  return isClassifier(provided) ? provided : resolvePrivacyClassifier();
}

export const segmentStep = createStep({
  id: "segment",
  description: "Splits the text into numbered sentences (abbreviations, decimals and line breaks handled).",
  inputSchema: PrivacyInputSchema,
  outputSchema: SegmentOutputSchema,
  execute: async ({ inputData }) => ({ sentences: segmentSentences(inputData.text) }),
});

export const classifyStep = createStep({
  id: "classify",
  description: "Chooses which sentences to keep and which spans to hide (OpenAI or rule-based mock).",
  inputSchema: SegmentOutputSchema,
  outputSchema: ClassifyOutputSchema,
  execute: async ({ inputData, requestContext }) => {
    const { sentences } = inputData;
    if (sentences.length === 0) {
      return { sentences, keep: [], redactions: [], provider: "mock" as const, model: null, fallback: false };
    }
    const result = await runClassifyStage(sentences, classifierFrom(requestContext));
    return {
      sentences,
      keep: result.classification.keep,
      redactions: result.classification.redactions,
      provider: result.provider,
      model: result.model,
      fallback: result.fallback,
    };
  },
});

export const assembleStep = createStep({
  id: "assemble",
  description: "Builds the storable text from kept original sentences, swaps in placeholders and counts.",
  inputSchema: ClassifyOutputSchema,
  outputSchema: AssembleOutputSchema,
  execute: async ({ inputData }) =>
    runAssembleStage(inputData.sentences, {
      classification: { keep: inputData.keep, redactions: inputData.redactions },
      provider: inputData.provider,
      model: inputData.model,
      fallback: inputData.fallback,
    }),
});

export const privacyFilterWorkflow = createWorkflow({
  id: "privacy-filter",
  description: "Data minimisation: keep only health-related sentences and hide personal details before anything is saved.",
  inputSchema: PrivacyInputSchema,
  outputSchema: AssembleOutputSchema,
  options: { shouldPersistSnapshot: () => false },
})
  .then(segmentStep)
  .then(classifyStep)
  .then(assembleStep)
  .commit();

import { z } from "zod";
import { PRIVACY_REDACTION_CATEGORIES, type PrivacyFilterReceipt } from "@/lib/domain/types";
import { assembleFiltered, normalizeClassification } from "./assemble";
import { mockPrivacyClassifier } from "./mock-classifier";
import type { Classification, NumberedSentence, PrivacyClassifier } from "./types";

/** Zod schemas for the privacy-filter workflow's step I/O. Raw text only exists inside a run. */

const SentenceSchema = z.object({
  n: z.number(),
  text: z.string(),
  sep: z.enum(["space", "newline"]),
  lineStart: z.boolean(),
});

export const PrivacyInputSchema = z.object({ text: z.string() });
export const SegmentOutputSchema = z.object({ sentences: z.array(SentenceSchema) });

const RedactionSchema = z.object({
  sentence: z.number(),
  text: z.string(),
  category: z.enum(PRIVACY_REDACTION_CATEGORIES),
});

export const ClassifyOutputSchema = z.object({
  sentences: z.array(SentenceSchema),
  keep: z.array(z.number()),
  redactions: z.array(RedactionSchema),
  provider: z.enum(["openai", "mock"]),
  model: z.string().nullable(),
  fallback: z.boolean(),
});

export const PrivacyReceiptSchema = z.object({
  provider: z.enum(["openai", "mock"]),
  model: z.string().nullable(),
  totalSentences: z.number(),
  keptSentences: z.number(),
  redactions: z.partialRecord(z.enum(PRIVACY_REDACTION_CATEGORIES), z.number()),
  fallback: z.boolean().optional(),
  filteredAt: z.string(),
});

export const AssembleOutputSchema = z.object({
  /** The text that may be stored: kept original sentences with placeholders. */
  text: z.string(),
  receipt: PrivacyReceiptSchema,
});

export interface ClassifyStageResult {
  classification: Classification;
  provider: "openai" | "mock";
  model: string | null;
  fallback: boolean;
}

function warnFallback(error: unknown): void {
  // Log the failure class only: never the text being filtered.
  const reason = error instanceof Error ? error.name : "error";
  console.warn(`[DoctorLoop AI] Privacy filter failed with the configured provider (${reason}); using the rule-based filter.`);
}

/**
 * Runs the classifier and sanitises its answer. If a non-mock provider fails, the
 * rule-based filter runs instead and the result is marked as a fallback.
 */
export async function runClassifyStage(
  sentences: NumberedSentence[],
  classifier: PrivacyClassifier,
): Promise<ClassifyStageResult> {
  try {
    const raw = await classifier.classify(sentences);
    return {
      classification: normalizeClassification(raw, sentences),
      provider: classifier.provider,
      model: classifier.model,
      fallback: false,
    };
  } catch (error) {
    if (classifier.provider === "mock") throw error;
    warnFallback(error);
    const raw = await mockPrivacyClassifier.classify(sentences);
    return {
      classification: normalizeClassification(raw, sentences),
      provider: "mock",
      model: null,
      fallback: true,
    };
  }
}

export function runAssembleStage(
  sentences: NumberedSentence[],
  stage: ClassifyStageResult,
  now: Date = new Date(),
): { text: string; receipt: PrivacyFilterReceipt } {
  const assembled = assembleFiltered(sentences, stage.classification);
  return {
    text: assembled.text,
    receipt: {
      provider: stage.provider,
      model: stage.model,
      totalSentences: assembled.totalSentences,
      keptSentences: assembled.keptSentences,
      redactions: assembled.redactions,
      ...(stage.fallback ? { fallback: true } : {}),
      filteredAt: now.toISOString(),
    },
  };
}

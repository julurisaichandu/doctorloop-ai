import { z } from "zod";
import { OBSERVATION_CATEGORIES } from "@/lib/domain/types";

/**
 * Canonical Zod schemas for AI pipeline I/O (SHARED CONTRACT).
 *
 * The AI pipeline (src/lib/ai, src/mastra) MUST return data that validates against
 * these schemas. Provider-specific schemas (e.g. an OpenAI strict-mode variant) may be
 * derived internally, but outputs are always re-validated here before use.
 *
 * Medical-scope rules encoded in the descriptions:
 *  - severity only when the patient explicitly stated a number;
 *  - patientQuote must be verbatim from the source text;
 *  - no diagnosis, risk classification, triage or recommendations.
 */

export const ObservationCategorySchema = z.enum(
  OBSERVATION_CATEGORIES as unknown as [string, ...string[]],
);

export const ExtractedObservationSchema = z.object({
  /** Journal entry this observation was extracted from. */
  sourceEntryId: z.string(),
  category: ObservationCategorySchema,
  /** Short neutral label, e.g. "Knee discomfort". Not a diagnosis. */
  label: z.string().min(1).max(80),
  bodySite: z.string().max(80).nullable(),
  /** Verbatim excerpt from the source text supporting this observation. */
  patientQuote: z.string().min(1).max(600),
  /** ISO-8601 datetime if determinable from the text + entry timestamp; otherwise null. */
  observedAt: z.string().nullable(),
  /** Time wording as stated by the patient, e.g. "last night". */
  timeDescription: z.string().max(120).nullable(),
  /** 0-10 self-reported intensity ONLY if explicitly stated; otherwise null. */
  severity: z.number().int().min(0).max(10).nullable(),
  severityText: z.string().max(120).nullable(),
  /** Explicitly stated quantity (e.g. 4 for "slept 4 hours"); otherwise null. */
  measureValue: z.number().nullable(),
  measureUnit: z.string().max(40).nullable(),
  context: z.array(z.string().max(160)).max(8),
  uncertainties: z.array(z.string().max(200)).max(8),
});
export type ExtractedObservation = z.infer<typeof ExtractedObservationSchema>;

export const ExtractionResultSchema = z.object({
  observations: z.array(ExtractedObservationSchema).max(20),
});
export type ExtractionResult = z.infer<typeof ExtractionResultSchema>;

export const SummaryItemSchema = z.object({
  text: z.string().min(1).max(400),
  /** Journal entry ids; must reference entries that were provided as input. */
  citations: z.array(z.string()).min(1).max(10),
});

export const SummaryContentSchema = z.object({
  overview: z.string().min(1).max(600),
  mainConcerns: z.array(SummaryItemSchema).max(8),
  changesSinceEarlier: z.array(SummaryItemSchema).max(8),
  recoveryActivities: z.array(SummaryItemSchema).max(8),
  patientQuestions: z.array(SummaryItemSchema).max(8),
  dataGaps: z.array(z.string().max(200)).max(8),
});
export type SummaryContentParsed = z.infer<typeof SummaryContentSchema>;

/** Input shape for one journal entry handed to the pipeline. */
export const PipelineEntrySchema = z.object({
  id: z.string(),
  source: z.enum(["manual", "voice", "vexo"]),
  body: z.string().min(1).max(8000),
  occurredAt: z.string(),
});
export type PipelineEntry = z.infer<typeof PipelineEntrySchema>;

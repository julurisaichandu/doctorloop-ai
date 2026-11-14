import { z } from "zod";
import {
  ExtractedObservationSchema,
  PipelineEntrySchema,
  SummaryContentSchema,
} from "@/lib/ai/schemas";

/** Zod schemas for the Mastra workflow's input, step I/O and output. */

const CategorySchema = z.enum([
  "symptom",
  "sleep",
  "mobility",
  "activity",
  "mood",
  "medication",
  "wound",
  "question",
  "other",
]);

/** Observation fields the timeline and summary need (a persisted Observation is a superset). */
export const WorkflowObservationSchema = z.object({
  id: z.string(),
  journalEntryId: z.string(),
  category: CategorySchema,
  label: z.string(),
  bodySite: z.string().nullable(),
  patientQuote: z.string(),
  observedAt: z.string().nullable(),
  timeDescription: z.string().nullable(),
  severity: z.number().nullable(),
  severityText: z.string().nullable(),
  measureValue: z.number().nullable(),
  measureUnit: z.string().nullable(),
  context: z.array(z.string()),
  uncertainties: z.array(z.string()),
});

const TrendPointSchema = z.object({
  date: z.string(),
  value: z.number(),
  entryId: z.string(),
  observationId: z.string(),
});

const TrendSeriesSchema = z.object({
  key: z.string(),
  label: z.string(),
  kind: z.enum(["severity", "measure"]),
  unit: z.string().nullable(),
  category: CategorySchema,
  points: z.array(TrendPointSchema),
});

const ExplicitChangeSchema = z.object({
  seriesKey: z.string(),
  label: z.string(),
  kind: z.enum(["severity", "measure"]),
  unit: z.string().nullable(),
  from: TrendPointSchema,
  to: TrendPointSchema,
  direction: z.enum(["increased", "decreased", "unchanged"]),
  description: z.string(),
});

export const TimelineResultSchema = z.object({
  days: z.array(z.object({ date: z.string(), entryIds: z.array(z.string()), observationIds: z.array(z.string()) })),
  series: z.array(TrendSeriesSchema),
  changes: z.array(ExplicitChangeSchema),
});

const ProviderSchema = z.enum(["openai", "mock"]);

export const WorkflowInputSchema = z.object({
  patientId: z.string(),
  audience: z.enum(["patient", "clinician"]),
  patientContext: z.object({
    firstName: z.string(),
    procedure: z.string(),
    procedureDate: z.string(),
    recoveryStage: z.string(),
  }),
  newEntries: z.array(PipelineEntrySchema),
  contextEntries: z.array(PipelineEntrySchema),
  existingObservations: z.array(WorkflowObservationSchema),
  periodStart: z.string(),
  periodEnd: z.string(),
  summarize: z.boolean(),
});

export const ExtractStepOutputSchema = z.object({
  extracted: z.array(z.object({ entryId: z.string(), observations: z.array(ExtractedObservationSchema) })),
  provider: ProviderSchema,
  model: z.string().nullable(),
});

export const TimelineStepOutputSchema = z.object({
  timeline: TimelineResultSchema,
  /** Fresh observations (temporary ids) plus existing ones, as used by the summary. */
  observations: z.array(WorkflowObservationSchema),
});

export const WorkflowOutputSchema = z.object({
  extracted: ExtractStepOutputSchema.shape.extracted,
  timeline: TimelineResultSchema,
  summary: SummaryContentSchema.nullable(),
  /** Extraction stage provider/model. */
  provider: ProviderSchema,
  model: z.string().nullable(),
  /** Summary stage provider/model (null when no summary was requested). */
  summaryProvider: ProviderSchema.nullable(),
  summaryModel: z.string().nullable(),
});

export type WorkflowInput = z.infer<typeof WorkflowInputSchema>;
export type WorkflowOutput = z.infer<typeof WorkflowOutputSchema>;

import type {
  AiProvider,
  Observation,
  SummaryAudience,
  SummaryContent,
  TimelineResult,
} from "@/lib/domain/types";
import type { ExtractedObservation, PipelineEntry } from "@/lib/ai/schemas";

/** Observation fields the summarizers need (a persisted Observation satisfies this). */
export type SummaryObservationInput = Pick<
  Observation,
  | "id"
  | "journalEntryId"
  | "category"
  | "label"
  | "bodySite"
  | "patientQuote"
  | "observedAt"
  | "timeDescription"
  | "severity"
  | "severityText"
  | "measureValue"
  | "measureUnit"
  | "context"
  | "uncertainties"
>;

export interface SummarizerInput {
  audience: SummaryAudience;
  patientFirstName: string;
  patientContext: { procedure: string; procedureDate: string; recoveryStage: string };
  periodStart: string;
  periodEnd: string;
  /** Entries in scope. Summary citations must come from these ids. */
  entries: PipelineEntry[];
  observations: SummaryObservationInput[];
  timeline: TimelineResult;
}

/** One extraction call per journal entry. Output is NOT yet post-processed. */
export interface ObservationExtractor {
  provider: AiProvider;
  model: string | null;
  extract(entry: PipelineEntry): Promise<ExtractedObservation[]>;
}

export interface Summarizer {
  provider: AiProvider;
  model: string | null;
  /** Output is NOT yet post-processed. */
  summarize(input: SummarizerInput): Promise<SummaryContent>;
}

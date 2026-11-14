import "server-only";
import { RequestContext } from "@mastra/core/request-context";
import { env } from "@/lib/config/env";
import { AppError } from "@/lib/errors";
import type {
  AiProvider,
  Observation,
  SummaryAudience,
  SummaryContent,
  TimelineResult,
} from "@/lib/domain/types";
import type { ExtractedObservation, PipelineEntry } from "@/lib/ai/schemas";
import { resolveProviders, type AiProviders } from "@/lib/ai/providers";
import { WorkflowOutputSchema } from "@/lib/ai/workflow-schemas";
import { mastra } from "@/mastra";
import { PROVIDERS_CONTEXT_KEY } from "@/mastra/workflows/health-update";

export interface RunPipelineInput {
  patientId: string;
  audience: SummaryAudience;
  patientContext: { firstName: string; procedure: string; procedureDate: string; recoveryStage: string };
  /** Entries to extract (may be empty). */
  newEntries: PipelineEntry[];
  /** Already-extracted entries in scope (for timeline/summary). */
  contextEntries: PipelineEntry[];
  /** Active observations of contextEntries. */
  existingObservations: Observation[];
  periodStart: string;
  periodEnd: string;
  summarize: boolean;
}

export interface RunPipelineOutput {
  extracted: { entryId: string; observations: ExtractedObservation[] }[];
  timeline: TimelineResult;
  /** Validated; every citation is one of the input entry ids. */
  summary: SummaryContent | null;
  /** Extraction stage provider/model. */
  provider: AiProvider;
  model: string | null;
  /** Summary stage provider/model (null when summarize=false). */
  summaryProvider: AiProvider | null;
  summaryModel: string | null;
  workflowRunId: string | null;
}

/** Which engine new AI output will come from, based on configuration. */
export function getAiProviderInfo(): { provider: AiProvider; model: string | null } {
  return env.openaiApiKey ? { provider: "openai", model: env.openaiModel } : { provider: "mock", model: null };
}

/**
 * Runs the "health-update-pipeline" Mastra workflow. `options.providers` overrides the
 * configured providers (used by tests); otherwise OpenAI or the mock is chosen from env.
 */
export async function runHealthUpdatePipeline(
  input: RunPipelineInput,
  options: { providers?: AiProviders } = {},
): Promise<RunPipelineOutput> {
  const requestContext = new RequestContext();
  requestContext.set(PROVIDERS_CONTEXT_KEY, options.providers ?? resolveProviders());

  const run = await mastra.getWorkflow("healthUpdateWorkflow").createRun();
  const result = await run.start({ inputData: input, requestContext });

  if (result.status !== "success") {
    const cause = result.status === "failed" ? result.error : undefined;
    console.error("[DoctorLoop AI] Workflow did not complete:", result.status, cause);
    throw new AppError("INTERNAL", "The AI pipeline could not process this update.");
  }

  return { ...WorkflowOutputSchema.parse(result.result), workflowRunId: run.runId };
}

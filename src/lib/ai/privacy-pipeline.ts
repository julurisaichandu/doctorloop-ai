import "server-only";
import { RequestContext } from "@mastra/core/request-context";
import { AppError } from "@/lib/errors";
import type { PrivacyFilterReceipt } from "@/lib/domain/types";
import { AssembleOutputSchema } from "@/lib/ai/privacy/stages";
import type { PrivacyClassifier } from "@/lib/ai/privacy/types";
import { mastra } from "@/mastra";
import { PRIVACY_CLASSIFIER_CONTEXT_KEY } from "@/mastra/workflows/privacy-filter";

export interface PrivacyFilterOutput {
  /** The only text that may be stored: kept original sentences with placeholders. May be empty. */
  text: string;
  receipt: PrivacyFilterReceipt;
  workflowRunId: string | null;
}

/**
 * Runs the "privacy-filter" Mastra workflow on raw text. `options.classifier` overrides the
 * configured provider (used by tests). Fails closed: if the workflow cannot complete, nothing
 * is returned and the caller must not store the raw text. The text is never logged.
 */
export async function runPrivacyFilter(
  text: string,
  options: { classifier?: PrivacyClassifier } = {},
): Promise<PrivacyFilterOutput> {
  const requestContext = new RequestContext();
  if (options.classifier) requestContext.set(PRIVACY_CLASSIFIER_CONTEXT_KEY, options.classifier);

  const run = await mastra.getWorkflow("privacyFilterWorkflow").createRun();
  const result = await run.start({ inputData: { text }, requestContext });

  if (result.status !== "success") {
    // Status only: the error object could carry fragments of the input.
    console.error("[DoctorLoop AI] Privacy filter workflow did not complete:", result.status);
    throw new AppError("INTERNAL", "The privacy filter could not process this update, so nothing was saved.");
  }
  const parsed = AssembleOutputSchema.parse(result.result);
  return { text: parsed.text, receipt: parsed.receipt, workflowRunId: run.runId };
}

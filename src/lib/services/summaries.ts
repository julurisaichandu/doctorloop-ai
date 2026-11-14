import "server-only";

import { subDays } from "date-fns";
import { getAiProviderInfo, runHealthUpdatePipeline } from "@/lib/ai/pipeline";
import type { PipelineEntry } from "@/lib/ai/schemas";
import { collectModelUsage } from "@/lib/ai/usage";
import { getSystemRepository } from "@/lib/data";
import type {
  AiProvider,
  GeneratedSummary,
  JournalEntry,
  PatientProfile,
  ReviewStatus,
  SummaryAudience,
  SummaryContent,
  UsageTrigger,
} from "@/lib/domain/types";
import { integrationError, notFound } from "@/lib/errors";
import { recordAiUsage, usageItemsFromEvents } from "./billing-usage";

export const NO_APPROVED_UPDATES_OVERVIEW = "No patient-approved updates in this period.";
const NO_UPDATES_OVERVIEW = "No updates recorded in this period.";
const SUMMARY_UNAVAILABLE_OVERVIEW =
  "An automatic summary could not be generated for the current updates. Review the original entries directly.";

const CLINICIAN_WINDOW_DAYS = 14;
const PATIENT_WINDOW_DAYS = 7;

export function toPipelineEntry(entry: JournalEntry): PipelineEntry {
  return { id: entry.id, source: entry.source, body: entry.body, occurredAt: entry.occurredAt };
}

export function toPatientContext(patient: PatientProfile) {
  return {
    firstName: patient.fullName.trim().split(/\s+/)[0] ?? patient.fullName,
    procedure: patient.procedure,
    procedureDate: patient.procedureDate,
    recoveryStage: patient.recoveryStage,
  };
}

function emptyContent(overview: string): SummaryContent {
  return {
    overview,
    mainConcerns: [],
    changesSinceEarlier: [],
    recoveryActivities: [],
    patientQuestions: [],
    dataGaps: [],
  };
}

interface GenerateOptions {
  audience: SummaryAudience;
  windowDays: number;
  statuses: ReviewStatus[];
  emptyOverview: string;
  /** Store a neutral placeholder instead of throwing when the pipeline fails. */
  failSafe: boolean;
  /** Re-read the source entry ids after the pipeline and recompute if they changed (max attempts). */
  revalidate?: boolean;
  /** Who caused this run (billing attribution). Defaults to the system. */
  trigger?: UsageTrigger;
}

const MAX_ATTEMPTS = 3;

/** Per-patient in-process promise chain: refreshes for one patient never overlap. */
const refreshChains = new Map<string, Promise<unknown>>();

function serializePerPatient<T>(patientId: string, task: () => Promise<T>): Promise<T> {
  const previous = refreshChains.get(patientId) ?? Promise.resolve();
  const result = previous.catch(() => undefined).then(task);
  const tail = result.catch(() => undefined);
  refreshChains.set(patientId, tail);
  void tail.then(() => {
    if (refreshChains.get(patientId) === tail) refreshChains.delete(patientId);
  });
  return result;
}

const sameIds = (a: string[], b: string[]): boolean => a.length === b.length && a.every((id, i) => id === b[i]);

/**
 * System-level summary generation. Callers MUST have authorized access to `patientId`.
 * Scope is chosen by `statuses` (clinician summaries: approved entries only).
 */
async function generateSummary(patientId: string, opts: GenerateOptions): Promise<GeneratedSummary> {
  const repo = getSystemRepository();
  const patient = await repo.getPatient(patientId);
  if (!patient) throw notFound("Patient not found.");

  const loadEntries = (periodStart: Date) =>
    repo.listEntries(patientId, {
      reviewStatus: opts.statuses,
      since: periodStart.toISOString(),
      order: "asc",
    });

  const placeholder = (periodStart: Date, periodEnd: Date, ids: string[]) => {
    const { provider, model } = getAiProviderInfo();
    return repo.createSummary({
      patientId,
      audience: opts.audience,
      periodStart: periodStart.toISOString(),
      periodEnd: periodEnd.toISOString(),
      content: emptyContent(SUMMARY_UNAVAILABLE_OVERVIEW),
      sourceEntryIds: ids,
      generatedBy: provider,
      model,
    });
  };

  const attempts = opts.revalidate ? MAX_ATTEMPTS : 1;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    const periodEnd = new Date();
    const periodStart = subDays(periodEnd, opts.windowDays);
    const entries = await loadEntries(periodStart);
    const sourceEntryIds = entries.map((e) => e.id);

    let result: { content: SummaryContent; provider: AiProvider; model: string | null };
    if (entries.length === 0) {
      const { provider, model } = getAiProviderInfo();
      result = { content: emptyContent(opts.emptyOverview), provider, model };
    } else {
      try {
        const observations = await repo.listObservations(patientId, { entryIds: sourceEntryIds });
        const { result: output, events } = await collectModelUsage(() =>
          runHealthUpdatePipeline({
            patientId,
            audience: opts.audience,
            patientContext: toPatientContext(patient),
            newEntries: [],
            contextEntries: entries.map(toPipelineEntry),
            existingObservations: observations,
            periodStart: periodStart.toISOString(),
            periodEnd: periodEnd.toISOString(),
            summarize: true,
          }),
        );
        // One record set per pipeline attempt: revalidation retries are billed too.
        await recordAiUsage({
          patientId,
          trigger: opts.trigger ?? { kind: "system", userId: null },
          items: usageItemsFromEvents(events, (kind) =>
            kind === "recovery_summary"
              ? {
                  operation: opts.audience === "clinician" ? "clinician_summary" : "patient_summary",
                  journalEntryId: null,
                }
              : null,
          ),
        });
        if (!output.summary) throw new Error("Pipeline returned no summary.");
        result = {
          content: output.summary,
          provider: output.summaryProvider ?? output.provider,
          model: output.summaryProvider ? output.summaryModel : output.model,
        };
      } catch (error) {
        console.error("[DoctorLoop] Summary generation failed:", error);
        if (!opts.failSafe) throw integrationError("Could not generate the summary. Please try again.");
        return placeholder(periodStart, periodEnd, sourceEntryIds);
      }
    }

    if (opts.revalidate) {
      const current = (await loadEntries(periodStart)).map((e) => e.id);
      if (!sameIds(current, sourceEntryIds)) {
        if (attempt < attempts) continue;
        // Entries kept changing: never store a summary that may cite withdrawn entries.
        if (!opts.failSafe) throw integrationError("Could not generate the summary. Please try again.");
        return placeholder(periodStart, periodEnd, current);
      }
    }
    return repo.createSummary({
      patientId,
      audience: opts.audience,
      periodStart: periodStart.toISOString(),
      periodEnd: periodEnd.toISOString(),
      content: result.content,
      sourceEntryIds,
      generatedBy: result.provider,
      model: result.model,
    });
  }
  throw integrationError("Could not generate the summary. Please try again.");
}

/** Clinician pre-visit summary from approved entries of the last 14 days only. */
export function refreshClinicianSummary(
  patientId: string,
  opts: { failSafe?: boolean; trigger?: UsageTrigger } = {},
): Promise<GeneratedSummary> {
  return serializePerPatient(patientId, () =>
    generateSummary(patientId, {
      audience: "clinician",
      windowDays: CLINICIAN_WINDOW_DAYS,
      statuses: ["approved"],
      emptyOverview: NO_APPROVED_UPDATES_OVERVIEW,
      failSafe: opts.failSafe ?? false,
      revalidate: true,
      trigger: opts.trigger,
    }),
  );
}

/** Patient weekly summary from non-rejected entries of the last 7 days. */
export function refreshPatientSummary(
  patientId: string,
  opts: { trigger?: UsageTrigger } = {},
): Promise<GeneratedSummary> {
  return generateSummary(patientId, {
    audience: "patient",
    windowDays: PATIENT_WINDOW_DAYS,
    statuses: ["pending_review", "approved"],
    emptyOverview: NO_UPDATES_OVERVIEW,
    failSafe: false,
    trigger: opts.trigger,
  });
}

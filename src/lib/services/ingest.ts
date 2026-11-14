import "server-only";

import { subDays } from "date-fns";
import { runHealthUpdatePipeline } from "@/lib/ai/pipeline";
import { collectModelUsage } from "@/lib/ai/usage";
import { runPrivacyFilter } from "@/lib/ai/privacy-pipeline";
import type { RunPipelineOutput } from "@/lib/ai/pipeline";
import type { ExtractedObservation } from "@/lib/ai/schemas";
import { assertPatientSelf } from "@/lib/authz/policies";
import { getRepository, getSystemRepository } from "@/lib/data";
import type { NewJournalEntry, NewObservation, Repository } from "@/lib/data/repository";
import {
  OBSERVATION_CATEGORIES,
  type Actor,
  type EntrySource,
  type JournalEntry,
  type ObservationCategory,
  type PatientProfile,
  type PrivacyFilterReceipt,
  type TimelineEntryView,
  type UsageTrigger,
} from "@/lib/domain/types";
import { conflict, notFound, validationError } from "@/lib/errors";
import { recordAiUsage, usageItemsFromEvents } from "./billing-usage";
import { toPatientContext, toPipelineEntry } from "./summaries";
import { buildTimelineViews } from "./views";

export const MAX_ENTRY_BODY_LENGTH = 8000;
/** Raw input accepted before the privacy filter shrinks it; the FILTERED body must fit MAX_ENTRY_BODY_LENGTH. */
export const MAX_RAW_ENTRY_LENGTH = 20_000;
export const NOTHING_RELEVANT_MESSAGE =
  "Nothing related to your health or recovery was found, so nothing was saved.";
const CONTEXT_WINDOW_DAYS = 7;
const PROCESSING_FAILED_MESSAGE = "Automatic extraction failed. You can retry.";

/** Trims and validates an entry body (1..8000 chars). */
export function normalizeEntryBody(body: string): string {
  const trimmed = body.trim();
  if (trimmed.length === 0) throw validationError("Write or record something first.");
  if (trimmed.length > MAX_ENTRY_BODY_LENGTH) {
    throw validationError(`Updates can be at most ${MAX_ENTRY_BODY_LENGTH} characters.`);
  }
  return trimmed;
}

/** Trims and validates raw (unfiltered) input: 1..20000 chars. */
export function normalizeRawEntry(text: string): string {
  const trimmed = text.trim();
  if (trimmed.length === 0) throw validationError("Write or record something first.");
  if (trimmed.length > MAX_RAW_ENTRY_LENGTH) {
    throw validationError(`Updates can be at most ${MAX_RAW_ENTRY_LENGTH} characters.`);
  }
  return trimmed;
}

export interface FilteredText {
  /** The only text that may ever be stored. Empty when nothing health-related was kept. */
  text: string;
  receipt: PrivacyFilterReceipt;
}

/** Optional usage metering for a privacy-filter run: whose patient it is and who triggered it. */
export interface UsageMeter {
  patientId: string;
  trigger: UsageTrigger;
}

/** Runs the privacy filter on raw text. Never throws for "nothing kept": callers decide. */
export async function applyPrivacyFilter(raw: string, meter?: UsageMeter): Promise<FilteredText> {
  const normalized = normalizeRawEntry(raw);
  if (!meter) {
    const output = await runPrivacyFilter(normalized);
    return { text: output.text.trim(), receipt: output.receipt };
  }
  const { result: output, events } = await collectModelUsage(() => runPrivacyFilter(normalized));
  // Recorded before returning, so runs that keep nothing (which callers reject) are billed too.
  await recordAiUsage({
    patientId: meter.patientId,
    trigger: meter.trigger,
    items: usageItemsFromEvents(events, (kind) =>
      kind === "privacy_filter" ? { operation: "privacy_filter", journalEntryId: null } : null,
    ),
  });
  return { text: output.text.trim(), receipt: output.receipt };
}

/** The filtered body must be non-empty and fit the stored limit. */
export function assertStorableBody(filtered: FilteredText): string {
  if (filtered.text.length === 0) throw validationError(NOTHING_RELEVANT_MESSAGE);
  if (filtered.text.length > MAX_ENTRY_BODY_LENGTH) {
    throw validationError(
      `After filtering, the update is still longer than ${MAX_ENTRY_BODY_LENGTH} characters. Please trim it.`,
    );
  }
  return filtered.text;
}

/** Filter + validate in one step (manual, voice and edit flows). */
export async function filterForStorage(raw: string, meter?: UsageMeter): Promise<FilteredText> {
  const filtered = await applyPrivacyFilter(raw, meter);
  assertStorableBody(filtered);
  return filtered;
}

export function normalizeOccurredAt(value: string | undefined): string {
  if (value === undefined) return new Date().toISOString();
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw validationError("That date and time is not valid.");
  return date.toISOString();
}

const isCategory = (value: string): value is ObservationCategory =>
  (OBSERVATION_CATEGORIES as readonly string[]).includes(value);

function toNewObservation(
  patientId: string,
  entryId: string,
  extracted: ExtractedObservation,
  output: RunPipelineOutput,
): NewObservation {
  return {
    patientId,
    journalEntryId: entryId,
    category: isCategory(extracted.category) ? extracted.category : "other",
    label: extracted.label,
    bodySite: extracted.bodySite,
    patientQuote: extracted.patientQuote,
    observedAt: extracted.observedAt,
    timeDescription: extracted.timeDescription,
    severity: extracted.severity,
    severityText: extracted.severityText,
    measureValue: extracted.measureValue,
    measureUnit: extracted.measureUnit,
    context: extracted.context,
    uncertainties: extracted.uncertainties,
    status: "active",
    editedByPatient: false,
    extractedBy: output.provider,
    model: output.model,
  };
}

/**
 * Runs extraction + patient summary for one entry and stores the results. Never throws
 * for pipeline failures: the entry is marked failed so the UI can offer a retry.
 * The caller must already have authorized the actor for this entry.
 */
export async function processEntry(
  actor: Actor,
  patient: PatientProfile,
  entry: JournalEntry,
  options: { summarize?: boolean } = {},
): Promise<void> {
  await runEntryPipeline(getRepository(actor), { kind: actor.role, userId: actor.userId }, patient, entry, options);
}

/** processEntry with an explicit read repository and usage trigger (actor path or system path). */
async function runEntryPipeline(
  repo: Repository,
  trigger: UsageTrigger,
  patient: PatientProfile,
  entry: JournalEntry,
  options: { summarize?: boolean },
): Promise<void> {
  const summarize = options.summarize ?? true;
  const system = getSystemRepository();
  const now = new Date();
  const periodStart = subDays(now, CONTEXT_WINDOW_DAYS).toISOString();

  try {
    await system.updateEntry(entry.id, { processingStatus: "processing", processingError: null });

    const others = (
      await repo.listEntries(patient.id, { reviewStatus: ["pending_review", "approved"], since: periodStart })
    ).filter((e) => e.id !== entry.id);
    const existingObservations = await repo.listObservations(patient.id, {
      entryIds: others.map((e) => e.id),
    });

    const { result: output, events } = await collectModelUsage(() =>
      runHealthUpdatePipeline({
        patientId: patient.id,
        audience: "patient",
        patientContext: toPatientContext(patient),
        newEntries: [toPipelineEntry(entry)],
        contextEntries: others.map(toPipelineEntry),
        existingObservations,
        periodStart,
        periodEnd: now.toISOString(),
        summarize,
      }),
    );
    await recordAiUsage({
      patientId: patient.id,
      trigger,
      items: usageItemsFromEvents(events, (kind) =>
        kind === "observation_extraction"
          ? { operation: "entry_extraction", journalEntryId: entry.id }
          : kind === "recovery_summary"
            ? { operation: "patient_summary", journalEntryId: null }
            : null,
      ),
    });

    const extracted = output.extracted.find((e) => e.entryId === entry.id)?.observations ?? [];
    await system.replaceObservationsForEntry(
      entry.id,
      extracted.map((o) => toNewObservation(patient.id, entry.id, o, output)),
    );
    await system.updateEntry(entry.id, { processingStatus: "processed", processingError: null });

    if (summarize && output.summary) {
      await system.createSummary({
        patientId: patient.id,
        audience: "patient",
        periodStart,
        periodEnd: now.toISOString(),
        content: output.summary,
        sourceEntryIds: [...others.map((e) => e.id), entry.id],
        generatedBy: output.summaryProvider ?? output.provider,
        model: output.summaryProvider ? output.summaryModel : output.model,
      });
    }
  } catch (error) {
    console.error("[DoctorLoop] Entry processing failed:", error);
    await system.updateEntry(entry.id, {
      processingStatus: "failed",
      processingError: PROCESSING_FAILED_MESSAGE,
    });
  }
}

async function loadView(actor: Actor, entryId: string): Promise<TimelineEntryView> {
  const repo = getRepository(actor);
  const entry = await repo.getEntry(entryId);
  if (!entry) throw notFound("Entry not found.");
  const [view] = await buildTimelineViews(repo, [entry]);
  return view;
}

async function requirePatient(actor: Actor, patientId: string): Promise<PatientProfile> {
  const patient = await getRepository(actor).getPatient(patientId);
  if (!patient) throw notFound("Patient profile not found.");
  return patient;
}

/**
 * Creates an entry for the actor's patient from RAW text: the privacy filter runs first, so
 * only the filtered text is ever stored. Then runs the AI pipeline and returns the view.
 * Used by the manual and voice flows (Vexo filters per item, then calls ingestFilteredEntry).
 */
export async function ingestEntry(
  actor: Actor,
  input: {
    source: EntrySource;
    body: string;
    occurredAt?: string;
    sourceRefId?: string | null;
    voiceSessionId?: string | null;
  },
  options: { summarize?: boolean } = {},
): Promise<TimelineEntryView> {
  const patientId = assertPatientSelf(actor);
  const filtered = await filterForStorage(input.body, {
    patientId,
    trigger: { kind: actor.role, userId: actor.userId },
  });
  return ingestFilteredEntry(actor, filtered, input, options);
}

/**
 * Stores already-filtered text (see applyPrivacyFilter) and runs the AI pipeline. Internal:
 * callers must pass text that came out of the privacy filter, never raw input.
 */
export async function ingestFilteredEntry(
  actor: Actor,
  filtered: FilteredText,
  input: {
    source: EntrySource;
    occurredAt?: string;
    sourceRefId?: string | null;
    voiceSessionId?: string | null;
  },
  options: { summarize?: boolean } = {},
): Promise<TimelineEntryView> {
  const patientId = assertPatientSelf(actor);
  const body = normalizeEntryBody(assertStorableBody(filtered));
  const occurredAt = normalizeOccurredAt(input.occurredAt);
  const patient = await requirePatient(actor, patientId);

  const created = await getRepository(actor).createEntry(newPendingEntry(patientId, body, occurredAt, input));
  // The receipt is a system-only write (ARCHITECTURE 5.1): counts only, never any removed text.
  const entry = await getSystemRepository().updateEntry(created.id, { privacyFilter: filtered.receipt });

  await processEntry(actor, patient, entry, { summarize: options.summarize });
  return loadView(actor, entry.id);
}

function newPendingEntry(
  patientId: string,
  body: string,
  occurredAt: string,
  input: { source: EntrySource; sourceRefId?: string | null; voiceSessionId?: string | null },
): NewJournalEntry {
  return {
    patientId,
    source: input.source,
    body,
    occurredAt,
    reviewStatus: "pending_review",
    reviewedByPatientAt: null,
    processingStatus: "processing",
    processingError: null,
    sourceRefId: input.sourceRefId ?? null,
    voiceSessionId: input.voiceSessionId ?? null,
    editedByPatient: false,
  };
}

/**
 * ingestFilteredEntry for callers with no session (signed webhooks). Every read and write goes
 * through the system repository, so the CALLER must have authorized the patient explicitly first
 * (ARCHITECTURE 5.1), and must have created any `sourceRefId` for this same patient.
 */
export async function ingestFilteredEntryForPatient(
  patient: PatientProfile,
  filtered: FilteredText,
  input: { source: EntrySource; occurredAt?: string; sourceRefId?: string | null },
  options: { trigger: UsageTrigger; summarize?: boolean },
): Promise<JournalEntry> {
  const body = normalizeEntryBody(assertStorableBody(filtered));
  const system = getSystemRepository();
  const entry = await system.createEntry({
    ...newPendingEntry(patient.id, body, normalizeOccurredAt(input.occurredAt), input),
    privacyFilter: filtered.receipt,
  });
  await runEntryPipeline(system, options.trigger, patient, entry, { summarize: options.summarize });
  return (await system.getEntry(entry.id)) ?? entry;
}

/** Retries extraction for an entry that is still pending review (e.g. after a failure). */
export async function reprocessEntry(actor: Actor, entryId: string): Promise<TimelineEntryView> {
  const patientId = assertPatientSelf(actor);
  const entry = await getRepository(actor).getEntry(entryId);
  if (!entry || entry.patientId !== patientId) throw notFound("Entry not found.");
  if (entry.reviewStatus !== "pending_review") {
    throw conflict("Only entries pending your review can be reprocessed.");
  }
  await processEntry(actor, await requirePatient(actor, patientId), entry);
  return loadView(actor, entryId);
}

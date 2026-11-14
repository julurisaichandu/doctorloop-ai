import "server-only";

import { subDays } from "date-fns";
import { z } from "zod";
import { buildTimeline } from "@/lib/ai/timeline";
import { assertPatientSelf, canTransition } from "@/lib/authz/policies";
import { getRepository, getSystemRepository } from "@/lib/data";
import type { ObservationPatch, Repository } from "@/lib/data/repository";
import {
  OBSERVATION_CATEGORIES,
  type Actor,
  type EntrySource,
  type GeneratedSummary,
  type JournalEntry,
  type Observation,
  type PatientDashboardData,
  type ReviewStatus,
  type SharingDecision,
  type TimelineEntryView,
} from "@/lib/domain/types";
import { conflict, notFound, validationError } from "@/lib/errors";
import {
  filterForStorage,
  ingestEntry,
  normalizeOccurredAt,
  normalizeRawEntry,
  processEntry,
} from "./ingest";
import { refreshClinicianSummary, refreshPatientSummary } from "./summaries";
import { buildTimelineViews } from "./views";

const DASHBOARD_WINDOW_DAYS = 14;
const MAX_NOTE_LENGTH = 500;

const ObservationPatchSchema = z.object({
  category: z.enum(OBSERVATION_CATEGORIES as unknown as [string, ...string[]]).optional(),
  label: z.string().trim().min(1, "Label is required.").max(80).optional(),
  bodySite: z.string().trim().max(80).nullable().optional(),
  observedAt: z.string().refine((v) => !Number.isNaN(Date.parse(v)), "Invalid date.").nullable().optional(),
  timeDescription: z.string().trim().max(120).nullable().optional(),
  severity: z.number().int("Severity must be a whole number.").min(0).max(10).nullable().optional(),
  severityText: z.string().trim().max(120).nullable().optional(),
  measureValue: z.number().finite().nullable().optional(),
  measureUnit: z.string().trim().max(40).nullable().optional(),
  context: z.array(z.string().trim().max(160)).max(8).optional(),
  uncertainties: z.array(z.string().trim().max(200)).max(8).optional(),
});

const NoteSchema = z.string().trim().max(MAX_NOTE_LENGTH, "Note is too long.").optional();

function parseOrThrow<S extends z.ZodType>(schema: S, value: unknown): z.infer<S> {
  const result = schema.safeParse(value);
  if (!result.success) throw validationError(result.error.issues[0]?.message ?? "Invalid input.");
  return result.data;
}

/** The actor's own entry (NOT_FOUND for anything else). */
async function requireOwnEntry(repo: Repository, patientId: string, entryId: string): Promise<JournalEntry> {
  const entry = await repo.getEntry(entryId);
  if (!entry || entry.patientId !== patientId) throw notFound("Entry not found.");
  return entry;
}

async function viewOf(repo: Repository, entryId: string): Promise<TimelineEntryView> {
  const entry = await repo.getEntry(entryId);
  if (!entry) throw notFound("Entry not found.");
  const [view] = await buildTimelineViews(repo, [entry], { withCareTeamReview: true });
  return view;
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

export async function getPatientDashboard(actor: Actor): Promise<PatientDashboardData> {
  const patientId = assertPatientSelf(actor);
  const repo = getRepository(actor);
  const patient = await repo.getPatient(patientId);
  if (!patient) throw notFound("Patient profile not found.");

  const all = await repo.listEntries(patientId, { order: "desc" });
  const since = subDays(new Date(), DASHBOARD_WINDOW_DAYS).toISOString();
  const recent = all.filter((e) => e.occurredAt >= since);
  const pending = all.filter((e) => e.reviewStatus === "pending_review");

  const [recentEntries, pendingReview] = await Promise.all([
    buildTimelineViews(repo, recent, { withCareTeamReview: true }),
    buildTimelineViews(repo, pending, { withCareTeamReview: true }),
  ]);

  const nonRejected = all.filter((e) => e.reviewStatus !== "rejected");
  const observations = await repo.listObservations(patientId, { entryIds: nonRejected.map((e) => e.id) });
  const timeline = buildTimeline(nonRejected, observations);

  const [weeklySummary, clinicianSummary, careTeam] = await Promise.all([
    repo.getLatestSummary(patientId, "patient"),
    repo.getLatestSummary(patientId, "clinician"),
    repo.listCareTeam(patientId),
  ]);

  return {
    patient,
    recentEntries,
    pendingReview,
    trends: timeline.series,
    changes: timeline.changes,
    weeklySummary,
    clinicianSummary,
    careTeam,
    stats: {
      totalEntries: all.length,
      sharedEntries: all.filter((e) => e.reviewStatus === "approved").length,
      pendingReview: pending.length,
      lastCheckInAt: all[0]?.occurredAt ?? null,
    },
  };
}

export async function listPatientTimeline(
  actor: Actor,
  filters: { source?: EntrySource; status?: ReviewStatus } = {},
): Promise<TimelineEntryView[]> {
  const patientId = assertPatientSelf(actor);
  const repo = getRepository(actor);
  const entries = await repo.listEntries(patientId, {
    source: filters.source ? [filters.source] : undefined,
    reviewStatus: filters.status ? [filters.status] : undefined,
    order: "desc",
  });
  return buildTimelineViews(repo, entries, { withCareTeamReview: true });
}

export async function getPatientNavCounts(actor: Actor): Promise<{ pendingReview: number }> {
  const patientId = assertPatientSelf(actor);
  const pending = await getRepository(actor).listEntries(patientId, { reviewStatus: ["pending_review"] });
  return { pendingReview: pending.length };
}

export async function getPatientSummaries(actor: Actor): Promise<{
  weekly: GeneratedSummary | null;
  clinician: GeneratedSummary | null;
  entriesById: Record<string, TimelineEntryView>;
}> {
  const patientId = assertPatientSelf(actor);
  const repo = getRepository(actor);
  const [weekly, clinician] = await Promise.all([
    repo.getLatestSummary(patientId, "patient"),
    repo.getLatestSummary(patientId, "clinician"),
  ]);

  const ids = new Set([...(weekly?.sourceEntryIds ?? []), ...(clinician?.sourceEntryIds ?? [])]);
  const entries = (await Promise.all([...ids].map((id) => repo.getEntry(id)))).filter(
    (e): e is JournalEntry => e !== null,
  );
  const views = await buildTimelineViews(repo, entries, { withCareTeamReview: true });
  return { weekly, clinician, entriesById: Object.fromEntries(views.map((v) => [v.entry.id, v])) };
}

// ---------------------------------------------------------------------------
// Writes
// ---------------------------------------------------------------------------

export function createManualEntry(
  actor: Actor,
  input: { body: string; occurredAt?: string },
): Promise<TimelineEntryView> {
  return ingestEntry(actor, { source: "manual", body: input.body, occurredAt: input.occurredAt });
}

/** Pending entries only. A body change re-runs extraction and replaces the observations. */
export async function updateEntryText(
  actor: Actor,
  entryId: string,
  input: { body?: string; occurredAt?: string },
): Promise<TimelineEntryView> {
  const patientId = assertPatientSelf(actor);
  const repo = getRepository(actor);
  const entry = await requireOwnEntry(repo, patientId, entryId);
  if (entry.reviewStatus !== "pending_review") {
    throw conflict("Only updates pending your review can be edited. Stop sharing first to change a shared update.");
  }

  const rawBody = input.body === undefined ? undefined : normalizeRawEntry(input.body);
  const occurredAt = input.occurredAt === undefined ? entry.occurredAt : normalizeOccurredAt(input.occurredAt);
  const rawChanged = rawBody !== undefined && rawBody !== entry.body;
  if (!rawChanged && occurredAt === entry.occurredAt) return viewOf(repo, entryId);

  if (entry.processingStatus === "processing") {
    throw conflict("This update is still being processed. Try again in a moment.");
  }

  // A changed text goes through the privacy filter again before anything is saved.
  const filtered = rawChanged ? await filterForStorage(rawBody, {
        patientId: entry.patientId,
        trigger: { kind: actor.role, userId: actor.userId },
      })
    : null;
  const body = filtered ? filtered.text : entry.body;
  const bodyChanged = body !== entry.body;
  if (!bodyChanged && occurredAt === entry.occurredAt) return viewOf(repo, entryId);

  const updated = await repo.updateEntry(entryId, { body, occurredAt, editedByPatient: true });
  if (bodyChanged && filtered) {
    const system = getSystemRepository();
    await system.updateEntry(entryId, { privacyFilter: filtered.receipt });
    // Observations quote the old text: clear them and mark processing BEFORE re-extraction,
    // so a failed extraction can never leave quotes of deleted text behind.
    await system.replaceObservationsForEntry(entryId, []);
    await system.updateEntry(entryId, { processingStatus: "processing", processingError: null });
    const patient = await repo.getPatient(patientId);
    if (!patient) throw notFound("Patient profile not found.");
    await processEntry(actor, patient, { ...updated, privacyFilter: filtered.receipt });
  }
  return viewOf(repo, entryId);
}

async function requireEditableObservation(
  repo: Repository,
  patientId: string,
  observationId: string,
): Promise<Observation> {
  const observation = await repo.getObservation(observationId);
  if (!observation || observation.patientId !== patientId) throw notFound("Observation not found.");
  const entry = await repo.getEntry(observation.journalEntryId);
  if (!entry) throw notFound("Entry not found.");
  if (entry.reviewStatus !== "pending_review") {
    throw conflict("Observations can only be changed while the update is pending your review.");
  }
  return observation;
}

export async function updateObservation(
  actor: Actor,
  observationId: string,
  patch: ObservationPatch,
): Promise<Observation> {
  const patientId = assertPatientSelf(actor);
  const parsed = parseOrThrow(ObservationPatchSchema, patch) as ObservationPatch;
  const repo = getRepository(actor);
  await requireEditableObservation(repo, patientId, observationId);
  return repo.updateObservation(observationId, { ...parsed, editedByPatient: true });
}

export async function setObservationRemoved(
  actor: Actor,
  observationId: string,
  removed: boolean,
): Promise<Observation> {
  const patientId = assertPatientSelf(actor);
  const repo = getRepository(actor);
  await requireEditableObservation(repo, patientId, observationId);
  return repo.updateObservation(observationId, {
    status: removed ? "removed" : "active",
    editedByPatient: true,
  });
}

async function decide(
  actor: Actor,
  entryId: string,
  to: ReviewStatus,
  decision: SharingDecision,
  note: string | undefined,
): Promise<TimelineEntryView> {
  const patientId = assertPatientSelf(actor);
  const cleanNote = parseOrThrow(NoteSchema, note) || null;
  const repo = getRepository(actor);
  const entry = await requireOwnEntry(repo, patientId, entryId);

  const allowedFrom: Record<SharingDecision, ReviewStatus[]> = {
    approved: ["pending_review", "rejected"],
    rejected: ["pending_review"],
    revoked: ["approved"],
  };
  if (!allowedFrom[decision].includes(entry.reviewStatus) || !canTransition(entry.reviewStatus, to)) {
    throw conflict("This update cannot be changed that way in its current state.");
  }
  if (entry.processingStatus === "processing") {
    throw conflict("This update is still being processed. Try again in a moment.");
  }

  const decidedAt = new Date().toISOString();
  await repo.updateEntry(entryId, { reviewStatus: to, reviewedByPatientAt: decidedAt });
  await getSystemRepository().createSharingApproval({
    patientId,
    journalEntryId: entryId,
    decision,
    decidedBy: actor.userId,
    decidedAt,
    note: cleanNote,
  });

  // What the care team sees must always reflect approved entries only.
  if (decision !== "rejected") await refreshClinicianSummary(patientId, {
      failSafe: true,
      trigger: { kind: "patient", userId: actor.userId },
    });
  return viewOf(repo, entryId);
}

/** Share with the care team. Allowed from pending_review or (share later) rejected. */
export function approveEntry(actor: Actor, entryId: string, note?: string): Promise<TimelineEntryView> {
  return decide(actor, entryId, "approved", "approved", note);
}

/** Keep private. */
export function rejectEntry(actor: Actor, entryId: string, note?: string): Promise<TimelineEntryView> {
  return decide(actor, entryId, "rejected", "rejected", note);
}

/** Stop sharing an approved entry (logged as "revoked"). */
export function revokeEntry(actor: Actor, entryId: string): Promise<TimelineEntryView> {
  return decide(actor, entryId, "rejected", "revoked", undefined);
}

export async function regenerateWeeklySummary(actor: Actor): Promise<GeneratedSummary> {
  return refreshPatientSummary(assertPatientSelf(actor), {
    trigger: { kind: "patient", userId: actor.userId },
  });
}

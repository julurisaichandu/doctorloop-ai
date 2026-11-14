import "server-only";

import { addDays } from "date-fns";
import { buildTimeline } from "@/lib/ai/timeline";
import { assertDoctor } from "@/lib/authz/policies";
import { getRepository } from "@/lib/data";
import type { Repository } from "@/lib/data/repository";
import type {
  Actor,
  DoctorOverviewStats,
  DoctorPatientDetail,
  DoctorPatientListItem,
  DoctorReview,
  GeneratedSummary,
  JournalEntry,
  PatientProfile,
  TimelineEntryView,
} from "@/lib/domain/types";
import { notFound } from "@/lib/errors";
import { refreshClinicianSummary } from "./summaries";
import { buildTimelineViews } from "./views";

interface PatientShares {
  patient: PatientProfile;
  /** Approved entries, most recently shared first. */
  approved: JournalEntry[];
  unreviewed: JournalEntry[];
}

/** When the patient shared the entry (falls back to the entry time). */
const sharedAt = (entry: JournalEntry): string => entry.reviewedByPatientAt ?? entry.occurredAt;

async function loadShares(repo: Repository, doctorId: string, patient: PatientProfile): Promise<PatientShares> {
  const [entries, reviews] = await Promise.all([
    repo.listEntries(patient.id, { reviewStatus: ["approved"] }),
    repo.listDoctorReviews(doctorId, patient.id),
  ]);
  const reviewed = new Set(reviews.map((r) => r.journalEntryId));
  const approved = entries.sort((a, b) => sharedAt(b).localeCompare(sharedAt(a)));
  return { patient, approved, unreviewed: approved.filter((e) => !reviewed.has(e.id)) };
}

async function loadAllShares(actor: Actor): Promise<PatientShares[]> {
  assertDoctor(actor);
  const repo = getRepository(actor);
  const patients = await repo.listPatientsForDoctor(actor.userId);
  return Promise.all(patients.map((p) => loadShares(repo, actor.userId, p)));
}

/** NOT_FOUND unless the doctor is assigned to the patient. */
async function requireAssignedPatient(actor: Actor, patientId: string): Promise<PatientProfile> {
  assertDoctor(actor);
  const repo = getRepository(actor);
  const patient = await repo.getPatient(patientId);
  if (!patient || !(await repo.isDoctorAssigned(actor.userId, patientId))) {
    throw notFound("Patient not found.");
  }
  return patient;
}

// ---------------------------------------------------------------------------
// Overview & navigation
// ---------------------------------------------------------------------------

export async function getDoctorOverview(actor: Actor): Promise<DoctorOverviewStats> {
  const shares = await loadAllShares(actor);
  const now = new Date();
  const horizon = addDays(now, 7);
  return {
    patientCount: shares.length,
    patientsAwaitingReview: shares.filter((s) => s.unreviewed.length > 0).length,
    unreviewedUpdates: shares.reduce((sum, s) => sum + s.unreviewed.length, 0),
    upcomingAppointments7d: shares.filter(({ patient }) => {
      if (!patient.nextAppointmentAt) return false;
      const at = new Date(patient.nextAppointmentAt);
      return at >= now && at <= horizon;
    }).length,
  };
}

export async function getDoctorNavCounts(
  actor: Actor,
): Promise<{ awaitingReviewPatients: number; unreviewedUpdates: number }> {
  const shares = await loadAllShares(actor);
  return {
    awaitingReviewPatients: shares.filter((s) => s.unreviewed.length > 0).length,
    unreviewedUpdates: shares.reduce((sum, s) => sum + s.unreviewed.length, 0),
  };
}

// ---------------------------------------------------------------------------
// Patients
// ---------------------------------------------------------------------------

export async function listDoctorPatients(
  actor: Actor,
  filters: { q?: string; status?: "all" | "awaiting_review" } = {},
): Promise<DoctorPatientListItem[]> {
  let shares = await loadAllShares(actor);

  const q = filters.q?.trim().toLowerCase();
  if (q) {
    shares = shares.filter(
      ({ patient }) => patient.fullName.toLowerCase().includes(q) || patient.procedure.toLowerCase().includes(q),
    );
  }
  if (filters.status === "awaiting_review") shares = shares.filter((s) => s.unreviewed.length > 0);

  const repo = getRepository(actor);
  const items = await Promise.all(
    shares.map(async ({ patient, approved, unreviewed }): Promise<DoctorPatientListItem> => {
      const latest = approved[0];
      const [latestShared] = latest
        ? await buildTimelineViews(repo, [latest], { doctorId: actor.userId })
        : [null];
      return {
        patient,
        latestShared,
        unreviewedCount: unreviewed.length,
        sharedCount: approved.length,
        lastSharedAt: latest ? sharedAt(latest) : null,
      };
    }),
  );

  return items.sort(
    (a, b) =>
      b.unreviewedCount - a.unreviewedCount || (b.lastSharedAt ?? "").localeCompare(a.lastSharedAt ?? ""),
  );
}

export async function getDoctorPatientDetail(actor: Actor, patientId: string): Promise<DoctorPatientDetail> {
  const patient = await requireAssignedPatient(actor, patientId);
  const repo = getRepository(actor);
  const { approved, unreviewed } = await loadShares(repo, actor.userId, patient);

  // Newest first by when the update happened.
  const byOccurred = [...approved].sort((a, b) => b.occurredAt.localeCompare(a.occurredAt));
  const entries = await buildTimelineViews(repo, byOccurred, { doctorId: actor.userId });
  const timeline = buildTimeline(
    byOccurred,
    entries.flatMap((v) => v.observations),
  );
  const [summary, careTeam] = await Promise.all([
    repo.getLatestSummary(patientId, "clinician"),
    repo.listCareTeam(patientId),
  ]);

  return {
    patient,
    entries,
    trends: timeline.series,
    changes: timeline.changes,
    summary,
    unreviewedCount: unreviewed.length,
    careTeam,
  };
}

/** An approved entry of an assigned patient (anything else is NOT_FOUND). */
export async function getSharedRecord(actor: Actor, entryId: string): Promise<TimelineEntryView> {
  assertDoctor(actor);
  const repo = getRepository(actor);
  const entry = await repo.getEntry(entryId);
  if (!entry || !(await repo.isDoctorAssigned(actor.userId, entry.patientId))) {
    throw notFound("Shared update not found.");
  }
  const [view] = await buildTimelineViews(repo, [entry], { doctorId: actor.userId });
  return view;
}

// ---------------------------------------------------------------------------
// Review
// ---------------------------------------------------------------------------

export async function markEntryReviewed(actor: Actor, entryId: string): Promise<DoctorReview> {
  assertDoctor(actor);
  const repo = getRepository(actor);
  const entry = await repo.getEntry(entryId); // hides pending/rejected and unassigned entries
  if (!entry || !(await repo.isDoctorAssigned(actor.userId, entry.patientId))) {
    throw notFound("Shared update not found.");
  }
  return repo.upsertDoctorReview({
    doctorId: actor.userId,
    patientId: entry.patientId,
    journalEntryId: entry.id,
  });
}

/** Marks every unreviewed approved entry of the patient; returns how many were marked. */
export async function markAllReviewed(actor: Actor, patientId: string): Promise<number> {
  const patient = await requireAssignedPatient(actor, patientId);
  const repo = getRepository(actor);
  const { unreviewed } = await loadShares(repo, actor.userId, patient);
  for (const entry of unreviewed) {
    await repo.upsertDoctorReview({ doctorId: actor.userId, patientId, journalEntryId: entry.id });
  }
  return unreviewed.length;
}

export async function regenerateClinicianSummary(actor: Actor, patientId: string): Promise<GeneratedSummary> {
  await requireAssignedPatient(actor, patientId);
  return refreshClinicianSummary(patientId, { trigger: { kind: "doctor", userId: actor.userId } });
}

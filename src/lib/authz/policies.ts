import type {
  Actor,
  GeneratedSummary,
  JournalEntry,
  Observation,
  ReviewStatus,
  SourceReference,
  UserProfile,
  VoiceSession,
} from "@/lib/domain/types";
import { forbidden } from "@/lib/errors";

/**
 * Pure access predicates mirroring docs/ARCHITECTURE.md section 5 (the same rules the
 * Supabase RLS policies enforce). `isAssigned` always means "this doctor actor is
 * assigned to the patient the row belongs to"; it is ignored for patient actors.
 */

const isPatientOf = (actor: Actor, patientId: string): boolean =>
  actor.role === "patient" && actor.patientId !== null && actor.patientId === patientId;

const isAssignedDoctor = (actor: Actor, isAssigned: boolean): boolean =>
  actor.role === "doctor" && isAssigned;

// ---------------------------------------------------------------------------
// Assertions
// ---------------------------------------------------------------------------

/** Returns the actor's own patient id; throws FORBIDDEN for doctors / patient-less actors. */
export function assertPatientSelf(actor: Actor): string {
  if (actor.role !== "patient" || !actor.patientId) {
    throw forbidden("This action is only available to patients.");
  }
  return actor.patientId;
}

export function assertDoctor(actor: Actor): void {
  if (actor.role !== "doctor") {
    throw forbidden("This action is only available to doctors.");
  }
}

// ---------------------------------------------------------------------------
// Identity
// ---------------------------------------------------------------------------

/**
 * Own profile; patients read their assigned doctors; doctors read assigned patients.
 * `isRelated` = the profile's owner is assigned to the actor (doctor profile seen by
 * a patient) or the actor is assigned to them (patient profile seen by a doctor).
 */
export function canReadProfile(actor: Actor, profile: Pick<UserProfile, "id" | "role">, isRelated: boolean): boolean {
  if (profile.id === actor.userId) return true;
  if (actor.role === "patient") return profile.role === "doctor" && isRelated;
  return profile.role === "patient" && isRelated;
}

export function canReadPatient(actor: Actor, patientId: string, isAssigned: boolean): boolean {
  return isPatientOf(actor, patientId) || isAssignedDoctor(actor, isAssigned);
}

// ---------------------------------------------------------------------------
// Journal entries
// ---------------------------------------------------------------------------

export function canReadEntry(
  actor: Actor,
  entry: Pick<JournalEntry, "patientId" | "reviewStatus">,
  isAssigned: boolean,
): boolean {
  if (isPatientOf(actor, entry.patientId)) return true;
  return isAssignedDoctor(actor, isAssigned) && entry.reviewStatus === "approved";
}

export function canCreateEntry(actor: Actor, patientId: string): boolean {
  return isPatientOf(actor, patientId);
}

/** Body / occurredAt edits: own entry, only while pending_review. */
export function canEditEntry(actor: Actor, entry: Pick<JournalEntry, "patientId" | "reviewStatus">): boolean {
  return isPatientOf(actor, entry.patientId) && entry.reviewStatus === "pending_review";
}

/** Status transitions / processing metadata of an entry: the owning patient only. */
export function canUpdateEntry(actor: Actor, entry: Pick<JournalEntry, "patientId">): boolean {
  return isPatientOf(actor, entry.patientId);
}

const TRANSITIONS: Record<ReviewStatus, readonly ReviewStatus[]> = {
  pending_review: ["approved", "rejected"],
  approved: ["rejected"], // revoke ("stop sharing")
  rejected: ["approved"], // share later
};

export function canTransition(from: ReviewStatus, to: ReviewStatus): boolean {
  return TRANSITIONS[from].includes(to);
}

// ---------------------------------------------------------------------------
// Observations
// ---------------------------------------------------------------------------

export function canReadObservation(
  actor: Actor,
  observation: Pick<Observation, "patientId" | "status">,
  entry: Pick<JournalEntry, "reviewStatus">,
  isAssigned: boolean,
): boolean {
  if (isPatientOf(actor, observation.patientId)) return true;
  return (
    isAssignedDoctor(actor, isAssigned) &&
    entry.reviewStatus === "approved" &&
    observation.status === "active"
  );
}

/** Patients edit/remove observations only while the parent entry is pending_review. */
export function canEditObservation(
  actor: Actor,
  observation: Pick<Observation, "patientId">,
  entry: Pick<JournalEntry, "reviewStatus">,
): boolean {
  return isPatientOf(actor, observation.patientId) && entry.reviewStatus === "pending_review";
}

// ---------------------------------------------------------------------------
// Source references, voice sessions
// ---------------------------------------------------------------------------

/** `linkedFromApprovedEntry`: some approved entry of this patient points at the reference. */
export function canReadSourceRef(
  actor: Actor,
  ref: Pick<SourceReference, "patientId">,
  linkedFromApprovedEntry: boolean,
  isAssigned: boolean,
): boolean {
  if (isPatientOf(actor, ref.patientId)) return true;
  return isAssignedDoctor(actor, isAssigned) && linkedFromApprovedEntry;
}

/** Source references are system-written only (ARCHITECTURE 5.1): no actor may create them. */
export function canCreateSourceRef(actor: Actor, patientId: string): boolean {
  void actor;
  void patientId;
  return false;
}

/**
 * Entry columns a patient actor may update (everything else is system-only, including
 * `privacyFilter`: the filter receipt is written by the server after filtering, never by a client).
 */
export const ACTOR_ENTRY_PATCH_FIELDS = [
  "body",
  "occurredAt",
  "editedByPatient",
  "reviewStatus",
  "reviewedByPatientAt",
] as const;

/** Transcripts are patient-only: doctors never access voice sessions. */
export function canAccessVoiceSession(actor: Actor, session: Pick<VoiceSession, "patientId">): boolean {
  return isPatientOf(actor, session.patientId);
}

// ---------------------------------------------------------------------------
// Summaries, approvals, doctor reviews
// ---------------------------------------------------------------------------

export function canReadSummary(
  actor: Actor,
  summary: Pick<GeneratedSummary, "patientId" | "audience"> & { supersededAt?: string | null },
  isAssigned: boolean,
): boolean {
  if (isPatientOf(actor, summary.patientId)) return true;
  return isAssignedDoctor(actor, isAssigned) && summary.audience === "clinician" && !summary.supersededAt;
}

/** Sharing approvals are an audit log readable by the owning patient only (written by the system). */
export function canAccessSharingApprovals(actor: Actor, patientId: string): boolean {
  return isPatientOf(actor, patientId);
}

/** Doctors may review only approved entries of patients they are assigned to. */
export function canDoctorReview(
  actor: Actor,
  entry: Pick<JournalEntry, "reviewStatus">,
  isAssigned: boolean,
): boolean {
  return isAssignedDoctor(actor, isAssigned) && entry.reviewStatus === "approved";
}

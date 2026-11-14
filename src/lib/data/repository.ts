import type {
  AiUsageRecord,
  BillingAccount,
  UsageBillingStatus,
  CareAssignment,
  DoctorReview,
  EntrySource,
  GeneratedSummary,
  JournalEntry,
  Observation,
  PatientProfile,
  ReviewStatus,
  SharingApproval,
  SourceReference,
  SummaryAudience,
  UserProfile,
  VexoConnection,
  VoiceSession,
} from "@/lib/domain/types";

/**
 * Backend-agnostic data access contract (SHARED CONTRACT).
 *
 * Two implementations:
 *  - LocalRepository   (src/lib/data/local/...)    JSON-file/in-memory demo store
 *  - SupabaseRepository (src/lib/data/supabase/...) Postgres via supabase-js
 *
 * Two flavours, obtained from src/lib/data/index.ts:
 *  - getRepository(actor)   → visibility rules of docs/ARCHITECTURE.md §Access rules apply.
 *      Supabase: user-scoped client, enforced by RLS.
 *      Local:    the same rules enforced in code via src/lib/authz/policies.ts.
 *      Reads of rows the actor may not see behave as "not found" (null / omitted from lists).
 *      Writes the actor may not perform throw AppError("FORBIDDEN").
 *  - getSystemRepository()  → no visibility filtering (service role). Use ONLY in services,
 *      AFTER an explicit authorization check, for system-generated writes (AI outputs,
 *      summaries, OAuth tokens, webhooks, seeding).
 *
 * All methods return fresh copies (callers may mutate results without affecting the store).
 */

export type NewJournalEntry = Omit<JournalEntry, "id" | "createdAt" | "updatedAt" | "privacyFilter"> & {
  /** System-only: an actor repository rejects a non-null receipt. Defaults to null. */
  privacyFilter?: JournalEntry["privacyFilter"];
  id?: string;
  createdAt?: string;
};

export type JournalEntryPatch = Partial<
  Pick<
    JournalEntry,
    | "body"
    | "occurredAt"
    | "reviewStatus"
    | "reviewedByPatientAt"
    | "processingStatus"
    | "processingError"
    | "sourceRefId"
    | "voiceSessionId"
    | "editedByPatient"
    | "privacyFilter"
  >
>;

export type NewObservation = Omit<Observation, "id" | "createdAt" | "updatedAt"> & { id?: string };

export type ObservationPatch = Partial<
  Pick<
    Observation,
    | "category"
    | "label"
    | "bodySite"
    | "observedAt"
    | "timeDescription"
    | "severity"
    | "severityText"
    | "measureValue"
    | "measureUnit"
    | "context"
    | "uncertainties"
    | "status"
    | "editedByPatient"
  >
>;

export type NewSourceReference = Omit<SourceReference, "id"> & { id?: string };
export type NewVoiceSession = Omit<VoiceSession, "id"> & { id?: string };
export type VoiceSessionPatch = Partial<
  Pick<
    VoiceSession,
    "status" | "externalConversationId" | "transcript" | "confirmedNotes" | "endedAt" | "journalEntryId"
  >
>;
export type NewGeneratedSummary = Omit<GeneratedSummary, "id" | "createdAt"> & {
  id?: string;
  createdAt?: string;
};
export type NewSharingApproval = Omit<SharingApproval, "id"> & { id?: string };

export type NewAiUsageRecord = Omit<AiUsageRecord, "id" | "createdAt"> & { id?: string; createdAt?: string };
export type AiUsageRecordPatch = Partial<
  Pick<AiUsageRecord, "billingStatus" | "billingMode" | "billingError" | "billedAt">
>;
export interface UsageQuery {
  billingDoctorId?: string;
  patientId?: string;
  /** Inclusive lower bound on occurredAt (ISO). */
  since?: string;
  /** Inclusive upper bound on occurredAt (ISO). */
  until?: string;
  billingStatus?: UsageBillingStatus[];
  limit?: number;
  /** Order by occurredAt. Default "desc". */
  order?: "asc" | "desc";
}

export interface EntryQuery {
  reviewStatus?: ReviewStatus[];
  source?: EntrySource[];
  /** Inclusive lower bound on occurredAt (ISO). */
  since?: string;
  /** Inclusive upper bound on occurredAt (ISO). */
  until?: string;
  limit?: number;
  /** Order by occurredAt. Default "desc". */
  order?: "asc" | "desc";
}

export interface Repository {
  readonly kind: "local" | "supabase";

  // ---- Identity & care team ----------------------------------------------
  getProfile(userId: string): Promise<UserProfile | null>;
  getPatientByUserId(userId: string): Promise<PatientProfile | null>;
  getPatient(patientId: string): Promise<PatientProfile | null>;
  /** Patients assigned to the doctor (actor repo: doctors may only list their own). */
  listPatientsForDoctor(doctorId: string): Promise<PatientProfile[]>;
  isDoctorAssigned(doctorId: string, patientId: string): Promise<boolean>;
  listAssignments(patientId: string): Promise<CareAssignment[]>;
  /** Doctor profiles assigned to the patient. */
  listCareTeam(patientId: string): Promise<UserProfile[]>;

  // ---- Journal entries ------------------------------------------------------
  listEntries(patientId: string, query?: EntryQuery): Promise<JournalEntry[]>;
  getEntry(entryId: string): Promise<JournalEntry | null>;
  createEntry(input: NewJournalEntry): Promise<JournalEntry>;
  updateEntry(entryId: string, patch: JournalEntryPatch): Promise<JournalEntry>;

  // ---- Observations ---------------------------------------------------------
  listObservations(
    patientId: string,
    opts?: { entryIds?: string[]; includeRemoved?: boolean },
  ): Promise<Observation[]>;
  getObservation(observationId: string): Promise<Observation | null>;
  /** Deletes existing observations of the entry and inserts the new set (system repo). */
  replaceObservationsForEntry(entryId: string, observations: NewObservation[]): Promise<Observation[]>;
  updateObservation(observationId: string, patch: ObservationPatch): Promise<Observation>;

  // ---- Source references ----------------------------------------------------
  createSourceRef(input: NewSourceReference): Promise<SourceReference>;
  listSourceRefs(ids: string[]): Promise<SourceReference[]>;

  // ---- Voice sessions -------------------------------------------------------
  createVoiceSession(input: NewVoiceSession): Promise<VoiceSession>;
  getVoiceSession(sessionId: string): Promise<VoiceSession | null>;
  findVoiceSessionByConversationId(conversationId: string): Promise<VoiceSession | null>;
  updateVoiceSession(sessionId: string, patch: VoiceSessionPatch): Promise<VoiceSession>;

  // ---- Summaries ------------------------------------------------------------
  createSummary(input: NewGeneratedSummary): Promise<GeneratedSummary>;
  getLatestSummary(patientId: string, audience: SummaryAudience): Promise<GeneratedSummary | null>;

  // ---- Sharing approvals & doctor reviews --------------------------------------
  createSharingApproval(input: NewSharingApproval): Promise<SharingApproval>;
  listSharingApprovals(patientId: string): Promise<SharingApproval[]>;
  /** Reviews written by this doctor (optionally for one patient). */
  listDoctorReviews(doctorId: string, patientId?: string): Promise<DoctorReview[]>;
  /** Idempotent: one review row per (doctorId, journalEntryId); re-marking updates reviewedAt. */
  upsertDoctorReview(input: { doctorId: string; patientId: string; journalEntryId: string }): Promise<DoctorReview>;

  // ---- Vexo OAuth connection (system repository only; actor repos throw FORBIDDEN) ----
  getVexoConnection(userId: string): Promise<VexoConnection | null>;
  saveVexoConnection(connection: VexoConnection): Promise<void>;
  deleteVexoConnection(userId: string): Promise<void>;

  // ---- AI usage & practice billing (system repository only; actor repos throw FORBIDDEN) ----
  createUsageRecords(records: NewAiUsageRecord[]): Promise<AiUsageRecord[]>;
  /** NOT_FOUND when the record does not exist. */
  updateUsageRecord(id: string, patch: AiUsageRecordPatch): Promise<AiUsageRecord>;
  listUsageRecords(query: UsageQuery): Promise<AiUsageRecord[]>;
  getBillingAccount(doctorId: string): Promise<BillingAccount | null>;
  /** Upsert by doctorId; sets updatedAt. */
  saveBillingAccount(account: BillingAccount): Promise<BillingAccount>;
  findBillingAccountByStripeCustomer(customerId: string): Promise<BillingAccount | null>;
}

import "server-only";

import type { PostgrestError, SupabaseClient } from "@supabase/supabase-js";
import { ACTOR_ENTRY_PATCH_FIELDS } from "@/lib/authz/policies";
import type {
  AiUsageRecordPatch,
  NewAiUsageRecord,
  UsageQuery,
  EntryQuery,
  JournalEntryPatch,
  NewGeneratedSummary,
  NewJournalEntry,
  NewObservation,
  NewSharingApproval,
  NewSourceReference,
  NewVoiceSession,
  ObservationPatch,
  Repository,
  VoiceSessionPatch,
} from "@/lib/data/repository";
import type {
  Actor,
  AiUsageRecord,
  BillingAccount,
  CareAssignment,
  DoctorReview,
  GeneratedSummary,
  JournalEntry,
  Observation,
  PatientProfile,
  SharingApproval,
  SourceReference,
  SummaryAudience,
  UserProfile,
  VexoConnection,
  VoiceSession,
} from "@/lib/domain/types";
import { AppError, forbidden, notFound } from "@/lib/errors";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  approvalFromRow,
  approvalToRow,
  assignmentFromRow,
  billingAccountFromRow,
  billingAccountToRow,
  usageRecordFromRow,
  usageRecordPatchToRow,
  usageRecordToRow,
  type BillingAccountRow,
  type UsageRecordRow,
  doctorReviewFromRow,
  entryFromRow,
  entryPatchToRow,
  entryToRow,
  observationFromRow,
  observationPatchToRow,
  observationToRow,
  patientFromRow,
  profileFromRow,
  sourceRefFromRow,
  sourceRefToRow,
  summaryFromRow,
  summaryToRow,
  vexoConnectionFromRow,
  vexoConnectionToRow,
  voiceSessionFromRow,
  voiceSessionPatchToRow,
  voiceSessionToRow,
  type ApprovalRow,
  type AssignmentRow,
  type DoctorReviewRow,
  type EntryRow,
  type ObservationRow,
  type PatientRow,
  type ProfileRow,
  type SourceRefRow,
  type SummaryRow,
  type VexoConnectionRow,
  type VoiceSessionRow,
} from "./mappers";

type RepositoryOptions = { mode: "actor"; actor: Actor } | { mode: "system" };

/** Postgres/PostgREST outcome -> safe AppError. Never leaks SQL details to callers. */
function toAppError(error: PostgrestError): AppError {
  if (error.code === "42501" || /row-level security/i.test(error.message)) {
    return forbidden();
  }
  if (error.code === "PGRST301" || error.code === "PGRST303") {
    return new AppError("UNAUTHENTICATED", "Please sign in.");
  }
  if (error.code === "23505") {
    return new AppError("CONFLICT", "That record already exists.");
  }
  console.error("[DoctorLoop] Supabase error:", error.code, error.message);
  return new AppError("INTERNAL", "A database error occurred. Please try again.");
}

/** Unwraps a PostgREST response: throws on error, returns data. */
function unwrap<T>(response: { data: T | null; error: PostgrestError | null }): T {
  if (response.error) throw toAppError(response.error);
  return response.data as T;
}

class SupabaseRepository implements Repository {
  readonly kind = "supabase" as const;

  constructor(
    private readonly db: SupabaseClient,
    private readonly isSystem: boolean,
    private readonly actor: Actor | null,
  ) {}

  /** Row missing after a write: RLS hid it (actor) or it does not exist (system). */
  private missingAfterWrite(what: string): AppError {
    return this.isSystem ? notFound(`${what} not found.`) : forbidden();
  }

  // ---- Identity & care team --------------------------------------------------

  async getProfile(userId: string): Promise<UserProfile | null> {
    const row = unwrap(await this.db.from("profiles").select("*").eq("id", userId).maybeSingle<ProfileRow>());
    return row ? profileFromRow(row) : null;
  }

  async getPatientByUserId(userId: string): Promise<PatientProfile | null> {
    const row = unwrap(
      await this.db.from("patient_profiles").select("*").eq("user_id", userId).maybeSingle<PatientRow>(),
    );
    return row ? patientFromRow(row) : null;
  }

  async getPatient(patientId: string): Promise<PatientProfile | null> {
    const row = unwrap(
      await this.db.from("patient_profiles").select("*").eq("id", patientId).maybeSingle<PatientRow>(),
    );
    return row ? patientFromRow(row) : null;
  }

  async listPatientsForDoctor(doctorId: string): Promise<PatientProfile[]> {
    if (this.actor && this.actor.userId !== doctorId) return [];
    const assignments = unwrap(
      await this.db.from("care_assignments").select("patient_id").eq("doctor_id", doctorId).returns<{ patient_id: string }[]>(),
    );
    if (assignments.length === 0) return [];
    const rows = unwrap(
      await this.db
        .from("patient_profiles")
        .select("*")
        .in("id", assignments.map((a) => a.patient_id))
        .order("full_name", { ascending: true })
        .returns<PatientRow[]>(),
    );
    return rows.map(patientFromRow);
  }

  async isDoctorAssigned(doctorId: string, patientId: string): Promise<boolean> {
    const rows = unwrap(
      await this.db
        .from("care_assignments")
        .select("id")
        .eq("doctor_id", doctorId)
        .eq("patient_id", patientId)
        .limit(1)
        .returns<{ id: string }[]>(),
    );
    return rows.length > 0;
  }

  async listAssignments(patientId: string): Promise<CareAssignment[]> {
    const rows = unwrap(
      await this.db.from("care_assignments").select("*").eq("patient_id", patientId).returns<AssignmentRow[]>(),
    );
    return rows.map(assignmentFromRow);
  }

  async listCareTeam(patientId: string): Promise<UserProfile[]> {
    const assignments = await this.listAssignments(patientId);
    if (assignments.length === 0) return [];
    const rows = unwrap(
      await this.db
        .from("profiles")
        .select("*")
        .in("id", assignments.map((a) => a.doctorId))
        .order("full_name", { ascending: true })
        .returns<ProfileRow[]>(),
    );
    return rows.map(profileFromRow);
  }

  // ---- Journal entries ---------------------------------------------------------

  async listEntries(patientId: string, query: EntryQuery = {}): Promise<JournalEntry[]> {
    let q = this.db.from("journal_entries").select("*").eq("patient_id", patientId);
    if (query.reviewStatus) q = q.in("review_status", query.reviewStatus);
    if (query.source) q = q.in("source", query.source);
    if (query.since) q = q.gte("occurred_at", query.since);
    if (query.until) q = q.lte("occurred_at", query.until);
    q = q.order("occurred_at", { ascending: query.order === "asc" });
    if (query.limit !== undefined) q = q.limit(query.limit);
    return unwrap(await q.returns<EntryRow[]>()).map(entryFromRow);
  }

  async getEntry(entryId: string): Promise<JournalEntry | null> {
    const row = unwrap(await this.db.from("journal_entries").select("*").eq("id", entryId).maybeSingle<EntryRow>());
    return row ? entryFromRow(row) : null;
  }

  async createEntry(input: NewJournalEntry): Promise<JournalEntry> {
    if (!this.isSystem && input.privacyFilter) {
      throw forbidden("The privacy filter receipt can only be set by the system.");
    }
    const row = unwrap(await this.db.from("journal_entries").insert(entryToRow(input)).select().single<EntryRow>());
    return entryFromRow(row);
  }

  async updateEntry(entryId: string, patch: JournalEntryPatch): Promise<JournalEntry> {
    if (!this.isSystem) {
      const allowed: readonly string[] = ACTOR_ENTRY_PATCH_FIELDS;
      const changed = Object.entries(patch).filter(([, v]) => v !== undefined).map(([k]) => k);
      if (changed.some((key) => !allowed.includes(key))) {
        throw forbidden("These fields can only be changed by the system.");
      }
    }
    const row = unwrap(
      await this.db
        .from("journal_entries")
        .update(entryPatchToRow(patch))
        .eq("id", entryId)
        .select()
        .maybeSingle<EntryRow>(),
    );
    if (!row) throw this.missingAfterWrite("Entry");
    return entryFromRow(row);
  }

  // ---- Observations ------------------------------------------------------------

  async listObservations(
    patientId: string,
    opts: { entryIds?: string[]; includeRemoved?: boolean } = {},
  ): Promise<Observation[]> {
    if (opts.entryIds && opts.entryIds.length === 0) return [];
    let q = this.db.from("observations").select("*").eq("patient_id", patientId);
    if (opts.entryIds) q = q.in("journal_entry_id", opts.entryIds);
    if (!opts.includeRemoved) q = q.eq("status", "active");
    q = q.order("created_at", { ascending: true }).order("id", { ascending: true });
    return unwrap(await q.returns<ObservationRow[]>()).map(observationFromRow);
  }

  async getObservation(observationId: string): Promise<Observation | null> {
    const row = unwrap(
      await this.db.from("observations").select("*").eq("id", observationId).maybeSingle<ObservationRow>(),
    );
    return row ? observationFromRow(row) : null;
  }

  /** Delete + insert (two requests, not one transaction). Clients cannot do this: RLS denies it. */
  async replaceObservationsForEntry(entryId: string, observations: NewObservation[]): Promise<Observation[]> {
    this.requireSystem();
    unwrap(await this.db.from("observations").delete().eq("journal_entry_id", entryId));
    if (observations.length === 0) return [];
    const rows = unwrap(
      await this.db
        .from("observations")
        .insert(observations.map((o) => observationToRow({ ...o, journalEntryId: entryId })))
        .select()
        .returns<ObservationRow[]>(),
    );
    return rows.map(observationFromRow);
  }

  async updateObservation(observationId: string, patch: ObservationPatch): Promise<Observation> {
    const row = unwrap(
      await this.db
        .from("observations")
        .update(observationPatchToRow(patch))
        .eq("id", observationId)
        .select()
        .maybeSingle<ObservationRow>(),
    );
    if (!row) throw this.missingAfterWrite("Observation");
    return observationFromRow(row);
  }

  // ---- Source references -------------------------------------------------------

  async createSourceRef(input: NewSourceReference): Promise<SourceReference> {
    this.requireSystem();
    const row = unwrap(await this.db.from("source_references").insert(sourceRefToRow(input)).select().single<SourceRefRow>());
    return sourceRefFromRow(row);
  }

  async listSourceRefs(ids: string[]): Promise<SourceReference[]> {
    if (ids.length === 0) return [];
    const rows = unwrap(await this.db.from("source_references").select("*").in("id", ids).returns<SourceRefRow[]>());
    return rows.map(sourceRefFromRow);
  }

  // ---- Voice sessions ----------------------------------------------------------

  async createVoiceSession(input: NewVoiceSession): Promise<VoiceSession> {
    const row = unwrap(await this.db.from("voice_sessions").insert(voiceSessionToRow(input)).select().single<VoiceSessionRow>());
    return voiceSessionFromRow(row);
  }

  async getVoiceSession(sessionId: string): Promise<VoiceSession | null> {
    const row = unwrap(
      await this.db.from("voice_sessions").select("*").eq("id", sessionId).maybeSingle<VoiceSessionRow>(),
    );
    return row ? voiceSessionFromRow(row) : null;
  }

  async findVoiceSessionByConversationId(conversationId: string): Promise<VoiceSession | null> {
    const rows = unwrap(
      await this.db
        .from("voice_sessions")
        .select("*")
        .eq("external_conversation_id", conversationId)
        .limit(1)
        .returns<VoiceSessionRow[]>(),
    );
    return rows[0] ? voiceSessionFromRow(rows[0]) : null;
  }

  async updateVoiceSession(sessionId: string, patch: VoiceSessionPatch): Promise<VoiceSession> {
    this.requireSystem();
    const row = unwrap(
      await this.db
        .from("voice_sessions")
        .update(voiceSessionPatchToRow(patch))
        .eq("id", sessionId)
        .select()
        .maybeSingle<VoiceSessionRow>(),
    );
    if (!row) throw this.missingAfterWrite("Voice session");
    return voiceSessionFromRow(row);
  }

  // ---- Summaries ---------------------------------------------------------------

  async createSummary(input: NewGeneratedSummary): Promise<GeneratedSummary> {
    this.requireSystem();
    // Only the newest summary per patient + audience stays current (doctors cannot read older ones).
    unwrap(
      await this.db
        .from("generated_summaries")
        .update({ superseded_at: new Date().toISOString() })
        .eq("patient_id", input.patientId)
        .eq("audience", input.audience)
        .is("superseded_at", null),
    );
    const row = unwrap(await this.db.from("generated_summaries").insert(summaryToRow(input)).select().single<SummaryRow>());
    return summaryFromRow(row);
  }

  async getLatestSummary(patientId: string, audience: SummaryAudience): Promise<GeneratedSummary | null> {
    const rows = unwrap(
      await this.db
        .from("generated_summaries")
        .select("*")
        .eq("patient_id", patientId)
        .eq("audience", audience)
        .is("superseded_at", null)
        .order("created_at", { ascending: false })
        .limit(1)
        .returns<SummaryRow[]>(),
    );
    return rows[0] ? summaryFromRow(rows[0]) : null;
  }

  // ---- Sharing approvals & doctor reviews ---------------------------------------

  async createSharingApproval(input: NewSharingApproval): Promise<SharingApproval> {
    this.requireSystem();
    const row = unwrap(await this.db.from("sharing_approvals").insert(approvalToRow(input)).select().single<ApprovalRow>());
    return approvalFromRow(row);
  }

  async listSharingApprovals(patientId: string): Promise<SharingApproval[]> {
    const rows = unwrap(
      await this.db
        .from("sharing_approvals")
        .select("*")
        .eq("patient_id", patientId)
        .order("decided_at", { ascending: true })
        .returns<ApprovalRow[]>(),
    );
    return rows.map(approvalFromRow);
  }

  async listDoctorReviews(doctorId: string, patientId?: string): Promise<DoctorReview[]> {
    let q = this.db.from("doctor_reviews").select("*").eq("doctor_id", doctorId);
    if (patientId) q = q.eq("patient_id", patientId);
    return unwrap(await q.returns<DoctorReviewRow[]>()).map(doctorReviewFromRow);
  }

  async upsertDoctorReview(input: { doctorId: string; patientId: string; journalEntryId: string }): Promise<DoctorReview> {
    const row = unwrap(
      await this.db
        .from("doctor_reviews")
        .upsert(
          {
            doctor_id: input.doctorId,
            patient_id: input.patientId,
            journal_entry_id: input.journalEntryId,
            reviewed_at: new Date().toISOString(),
          },
          { onConflict: "doctor_id,journal_entry_id" },
        )
        .select()
        .single<DoctorReviewRow>(),
    );
    return doctorReviewFromRow(row);
  }

  // ---- Vexo OAuth connection (system only) ----------------------------------------

  async getVexoConnection(userId: string): Promise<VexoConnection | null> {
    this.requireSystem();
    const row = unwrap(
      await this.db.from("vexo_connections").select("*").eq("user_id", userId).maybeSingle<VexoConnectionRow>(),
    );
    return row ? vexoConnectionFromRow(row) : null;
  }

  async saveVexoConnection(connection: VexoConnection): Promise<void> {
    this.requireSystem();
    unwrap(await this.db.from("vexo_connections").upsert(vexoConnectionToRow(connection), { onConflict: "user_id" }));
  }

  async deleteVexoConnection(userId: string): Promise<void> {
    this.requireSystem();
    unwrap(await this.db.from("vexo_connections").delete().eq("user_id", userId));
  }

  // ---- AI usage & billing (system only) -------------------------------------------

  async createUsageRecords(records: NewAiUsageRecord[]): Promise<AiUsageRecord[]> {
    this.requireSystem();
    if (records.length === 0) return [];
    const rows = unwrap(
      await this.db
        .from("ai_usage_records")
        .insert(records.map(usageRecordToRow))
        .select()
        .returns<UsageRecordRow[]>(),
    );
    return rows.map(usageRecordFromRow);
  }

  async updateUsageRecord(id: string, patch: AiUsageRecordPatch): Promise<AiUsageRecord> {
    this.requireSystem();
    const row = unwrap(
      await this.db
        .from("ai_usage_records")
        .update(usageRecordPatchToRow(patch))
        .eq("id", id)
        .select()
        .maybeSingle<UsageRecordRow>(),
    );
    if (!row) throw notFound("Usage record not found.");
    return usageRecordFromRow(row);
  }

  async listUsageRecords(query: UsageQuery): Promise<AiUsageRecord[]> {
    this.requireSystem();
    let q = this.db.from("ai_usage_records").select("*");
    if (query.billingDoctorId) q = q.eq("billing_doctor_id", query.billingDoctorId);
    if (query.patientId) q = q.eq("patient_id", query.patientId);
    if (query.since) q = q.gte("occurred_at", query.since);
    if (query.until) q = q.lte("occurred_at", query.until);
    if (query.billingStatus) q = q.in("billing_status", query.billingStatus);
    q = q.order("occurred_at", { ascending: query.order === "asc" }).order("id", { ascending: true });
    if (query.limit !== undefined) q = q.limit(query.limit);
    return unwrap(await q.returns<UsageRecordRow[]>()).map(usageRecordFromRow);
  }

  async getBillingAccount(doctorId: string): Promise<BillingAccount | null> {
    this.requireSystem();
    const row = unwrap(
      await this.db.from("billing_accounts").select("*").eq("doctor_id", doctorId).maybeSingle<BillingAccountRow>(),
    );
    return row ? billingAccountFromRow(row) : null;
  }

  async saveBillingAccount(account: BillingAccount): Promise<BillingAccount> {
    this.requireSystem();
    const row = unwrap(
      await this.db
        .from("billing_accounts")
        .upsert({ ...billingAccountToRow(account), updated_at: new Date().toISOString() }, { onConflict: "doctor_id" })
        .select()
        .single<BillingAccountRow>(),
    );
    return billingAccountFromRow(row);
  }

  async findBillingAccountByStripeCustomer(customerId: string): Promise<BillingAccount | null> {
    this.requireSystem();
    const rows = unwrap(
      await this.db
        .from("billing_accounts")
        .select("*")
        .eq("stripe_customer_id", customerId)
        .limit(1)
        .returns<BillingAccountRow[]>(),
    );
    return rows[0] ? billingAccountFromRow(rows[0]) : null;
  }

  private requireSystem(): void {
    if (!this.isSystem) throw forbidden();
  }
}

/**
 * Supabase-backed Repository.
 * - actor: user-scoped cookie client; row-level security decides visibility.
 * - system: secret-key client that bypasses RLS (call only after an authorization check).
 */
export async function createSupabaseRepository(opts: RepositoryOptions): Promise<Repository> {
  if (opts.mode === "system") {
    return new SupabaseRepository(createSupabaseAdminClient(), true, null);
  }
  return new SupabaseRepository(await createSupabaseServerClient(), false, opts.actor);
}

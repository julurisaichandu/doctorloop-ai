import {
  ACTOR_ENTRY_PATCH_FIELDS,
  canAccessSharingApprovals,
  canAccessVoiceSession,
  canCreateEntry,
  canDoctorReview,
  canEditEntry,
  canEditObservation,
  canReadEntry,
  canReadObservation,
  canReadPatient,
  canReadProfile,
  canReadSourceRef,
  canReadSummary,
  canTransition,
  canUpdateEntry,
} from "@/lib/authz/policies";
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
import { conflict, forbidden, notFound } from "@/lib/errors";
import type {
  AiUsageRecordPatch,
  EntryQuery,
  JournalEntryPatch,
  NewAiUsageRecord,
  UsageQuery,
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
import { getLocalDb, type LocalDb } from "./local-db";

export type LocalRepositoryOptions = { actor: Actor } | { system: true };

const nowIso = () => new Date().toISOString();

/** Copies a patch without undefined values so `Object.assign` never erases fields. */
function definedOnly<T extends object>(patch: T): Partial<T> {
  return Object.fromEntries(Object.entries(patch).filter(([, value]) => value !== undefined)) as Partial<T>;
}

/**
 * In-memory/JSON implementation of the Repository contract. Actor instances apply
 * the docs/ARCHITECTURE.md section 5 rules through authz/policies.ts; system
 * instances are unfiltered (service role equivalent).
 */
export class LocalRepository implements Repository {
  readonly kind = "local" as const;
  private readonly actor: Actor | null;

  constructor(options: LocalRepositoryOptions) {
    this.actor = "actor" in options ? options.actor : null;
  }

  private get db(): LocalDb {
    return getLocalDb();
  }

  // ---- internal helpers ----------------------------------------------------

  private assigned(patientId: string): boolean {
    const actor = this.actor;
    if (!actor || actor.role !== "doctor") return false;
    return this.db.data.assignments.some((a) => a.doctorId === actor.userId && a.patientId === patientId);
  }

  private findEntry(entryId: string): JournalEntry | undefined {
    return this.db.data.entries.find((e) => e.id === entryId);
  }

  private entryVisible(entry: JournalEntry): boolean {
    return !this.actor || canReadEntry(this.actor, entry, this.assigned(entry.patientId));
  }

  private requireSystem(what: string): void {
    if (this.actor) throw forbidden(`${what} is restricted to the system.`);
  }

  /** The entry, or NOT_FOUND when it does not exist; FORBIDDEN when the actor may not update it. */
  private entryForUpdate(entryId: string): JournalEntry {
    const entry = this.findEntry(entryId);
    if (!entry) throw notFound("Entry not found.");
    if (this.actor && !canUpdateEntry(this.actor, entry)) throw forbidden();
    return entry;
  }

  private mutated<T>(value: T): T {
    this.db.save();
    return structuredClone(value);
  }

  // ---- Identity & care team ------------------------------------------------

  async getProfile(userId: string): Promise<UserProfile | null> {
    const profile = this.db.data.profiles.find((p) => p.id === userId);
    if (!profile) return null;
    if (this.actor && !this.profileVisible(this.actor, profile)) return null;
    return structuredClone(profile);
  }

  private profileVisible(actor: Actor, profile: UserProfile): boolean {
    const { assignments, patients } = this.db.data;
    let related = false;
    if (actor.role === "patient" && profile.role === "doctor") {
      related = assignments.some((a) => a.doctorId === profile.id && a.patientId === actor.patientId);
    } else if (actor.role === "doctor" && profile.role === "patient") {
      const patient = patients.find((p) => p.userId === profile.id);
      related = patient !== undefined && this.assigned(patient.id);
    }
    return canReadProfile(actor, profile, related);
  }

  async getPatientByUserId(userId: string): Promise<PatientProfile | null> {
    const patient = this.db.data.patients.find((p) => p.userId === userId);
    return patient ? this.getPatient(patient.id) : null;
  }

  async getPatient(patientId: string): Promise<PatientProfile | null> {
    const patient = this.db.data.patients.find((p) => p.id === patientId);
    if (!patient) return null;
    if (this.actor && !canReadPatient(this.actor, patientId, this.assigned(patientId))) return null;
    return structuredClone(patient);
  }

  async listPatientsForDoctor(doctorId: string): Promise<PatientProfile[]> {
    if (this.actor && (this.actor.role !== "doctor" || this.actor.userId !== doctorId)) return [];
    const ids = new Set(
      this.db.data.assignments.filter((a) => a.doctorId === doctorId).map((a) => a.patientId),
    );
    return structuredClone(this.db.data.patients.filter((p) => ids.has(p.id)));
  }

  async isDoctorAssigned(doctorId: string, patientId: string): Promise<boolean> {
    const actor = this.actor;
    if (actor) {
      const own =
        (actor.role === "doctor" && actor.userId === doctorId) ||
        (actor.role === "patient" && actor.patientId === patientId);
      if (!own) return false;
    }
    return this.db.data.assignments.some((a) => a.doctorId === doctorId && a.patientId === patientId);
  }

  async listAssignments(patientId: string): Promise<CareAssignment[]> {
    const actor = this.actor;
    let rows = this.db.data.assignments.filter((a) => a.patientId === patientId);
    if (actor) {
      rows =
        actor.role === "patient"
          ? actor.patientId === patientId
            ? rows
            : []
          : rows.filter((a) => a.doctorId === actor.userId);
    }
    return structuredClone(rows);
  }

  async listCareTeam(patientId: string): Promise<UserProfile[]> {
    const doctorIds = new Set(
      this.db.data.assignments.filter((a) => a.patientId === patientId).map((a) => a.doctorId),
    );
    const doctors = this.db.data.profiles.filter(
      (p) => doctorIds.has(p.id) && (!this.actor || this.profileVisible(this.actor, p)),
    );
    return structuredClone(doctors);
  }

  // ---- Journal entries -----------------------------------------------------

  async listEntries(patientId: string, query: EntryQuery = {}): Promise<JournalEntry[]> {
    let rows = this.db.data.entries.filter((e) => e.patientId === patientId && this.entryVisible(e));
    if (query.reviewStatus) rows = rows.filter((e) => query.reviewStatus?.includes(e.reviewStatus));
    if (query.source) rows = rows.filter((e) => query.source?.includes(e.source));
    const since = query.since;
    const until = query.until;
    if (since) rows = rows.filter((e) => e.occurredAt >= since);
    if (until) rows = rows.filter((e) => e.occurredAt <= until);
    const direction = query.order === "asc" ? 1 : -1;
    rows = [...rows].sort((a, b) => direction * a.occurredAt.localeCompare(b.occurredAt));
    if (query.limit !== undefined) rows = rows.slice(0, query.limit);
    return structuredClone(rows);
  }

  async getEntry(entryId: string): Promise<JournalEntry | null> {
    const entry = this.findEntry(entryId);
    return entry && this.entryVisible(entry) ? structuredClone(entry) : null;
  }

  async createEntry(input: NewJournalEntry): Promise<JournalEntry> {
    if (this.actor) {
      if (!canCreateEntry(this.actor, input.patientId)) throw forbidden();
      if (input.reviewStatus !== "pending_review" || input.processingStatus !== "processing") {
        throw forbidden("New entries start as pending review.");
      }
      if (input.privacyFilter) throw forbidden("The privacy filter receipt can only be set by the system.");
      const { sourceRefId, voiceSessionId } = input;
      if (sourceRefId) {
        const ref = this.db.data.sourceRefs.find((r) => r.id === sourceRefId);
        if (!ref || ref.patientId !== input.patientId) throw forbidden("Invalid source reference.");
      }
      if (voiceSessionId) {
        const session = this.db.data.voiceSessions.find((s) => s.id === voiceSessionId);
        if (!session || session.patientId !== input.patientId) throw forbidden("Invalid voice session.");
      }
    }
    const now = nowIso();
    const entry: JournalEntry = {
      ...input,
      privacyFilter: input.privacyFilter ?? null,
      id: input.id ?? crypto.randomUUID(),
      createdAt: input.createdAt ?? now,
      updatedAt: now,
    };
    this.db.data.entries.push(entry);
    return this.mutated(entry);
  }

  async updateEntry(entryId: string, patch: JournalEntryPatch): Promise<JournalEntry> {
    const entry = this.entryForUpdate(entryId);
    const changes = definedOnly(patch);
    if (this.actor) {
      const allowed: readonly string[] = ACTOR_ENTRY_PATCH_FIELDS;
      if (Object.keys(changes).some((key) => !allowed.includes(key))) {
        throw forbidden("These fields can only be changed by the system.");
      }
      if (changes.reviewStatus !== undefined && changes.reviewStatus !== entry.reviewStatus &&
          entry.processingStatus === "processing") {
        throw forbidden("This update is still being processed.");
      }
      if (("body" in changes || "occurredAt" in changes) && !canEditEntry(this.actor, entry)) {
        throw forbidden("Entries can only be edited while pending review.");
      }
      if (
        changes.reviewStatus !== undefined &&
        changes.reviewStatus !== entry.reviewStatus &&
        !canTransition(entry.reviewStatus, changes.reviewStatus)
      ) {
        throw forbidden("This status change is not allowed.");
      }
    }
    Object.assign(entry, changes, { updatedAt: nowIso() });
    return this.mutated(entry);
  }

  // ---- Observations --------------------------------------------------------

  private observationVisible(observation: Observation): boolean {
    if (!this.actor) return true;
    const entry = this.findEntry(observation.journalEntryId);
    return (
      entry !== undefined &&
      canReadObservation(this.actor, observation, entry, this.assigned(observation.patientId))
    );
  }

  async listObservations(
    patientId: string,
    opts: { entryIds?: string[]; includeRemoved?: boolean } = {},
  ): Promise<Observation[]> {
    const entryIds = opts.entryIds ? new Set(opts.entryIds) : null;
    const rows = this.db.data.observations.filter(
      (o) =>
        o.patientId === patientId &&
        (!entryIds || entryIds.has(o.journalEntryId)) &&
        (opts.includeRemoved || o.status === "active") &&
        this.observationVisible(o),
    );
    return structuredClone(rows);
  }

  async getObservation(observationId: string): Promise<Observation | null> {
    const observation = this.db.data.observations.find((o) => o.id === observationId);
    return observation && this.observationVisible(observation) ? structuredClone(observation) : null;
  }

  async replaceObservationsForEntry(entryId: string, observations: NewObservation[]): Promise<Observation[]> {
    this.requireSystem("Writing observations");
    const entry = this.findEntry(entryId);
    if (!entry) throw notFound("Entry not found.");
    const now = nowIso();
    const table = this.db.data.observations;
    const kept = table.filter((o) => o.journalEntryId !== entryId);
    const created: Observation[] = observations.map((o) => ({
      ...o,
      id: o.id ?? crypto.randomUUID(),
      patientId: entry.patientId,
      journalEntryId: entryId,
      createdAt: now,
      updatedAt: now,
    }));
    table.splice(0, table.length, ...kept, ...created);
    return this.mutated(created);
  }

  async updateObservation(observationId: string, patch: ObservationPatch): Promise<Observation> {
    const observation = this.db.data.observations.find((o) => o.id === observationId);
    if (!observation) throw notFound("Observation not found.");
    if (this.actor) {
      const entry = this.findEntry(observation.journalEntryId);
      if (!entry || !canEditObservation(this.actor, observation, entry)) throw forbidden();
    }
    Object.assign(observation, definedOnly(patch), { updatedAt: nowIso() });
    return this.mutated(observation);
  }

  // ---- Source references ---------------------------------------------------

  async createSourceRef(input: NewSourceReference): Promise<SourceReference> {
    this.requireSystem("Writing source references");
    // Mirrors the Supabase primary key (23505 -> CONFLICT): callers rely on it for idempotency.
    if (input.id && this.db.data.sourceRefs.some((r) => r.id === input.id)) {
      throw conflict("That record already exists.");
    }
    const ref: SourceReference = { ...input, id: input.id ?? crypto.randomUUID() };
    this.db.data.sourceRefs.push(ref);
    return this.mutated(ref);
  }

  async listSourceRefs(ids: string[]): Promise<SourceReference[]> {
    const wanted = new Set(ids);
    const rows = this.db.data.sourceRefs.filter((ref) => {
      if (!wanted.has(ref.id)) return false;
      if (!this.actor) return true;
      const linked = this.db.data.entries.some(
        (e) => e.sourceRefId === ref.id && e.reviewStatus === "approved",
      );
      return canReadSourceRef(this.actor, ref, linked, this.assigned(ref.patientId));
    });
    return structuredClone(rows);
  }

  // ---- Voice sessions ------------------------------------------------------

  async createVoiceSession(input: NewVoiceSession): Promise<VoiceSession> {
    if (this.actor && !canAccessVoiceSession(this.actor, input)) throw forbidden();
    const session: VoiceSession = { ...input, id: input.id ?? crypto.randomUUID() };
    this.db.data.voiceSessions.push(session);
    return this.mutated(session);
  }

  async getVoiceSession(sessionId: string): Promise<VoiceSession | null> {
    const session = this.db.data.voiceSessions.find((s) => s.id === sessionId);
    return session && (!this.actor || canAccessVoiceSession(this.actor, session))
      ? structuredClone(session)
      : null;
  }

  async findVoiceSessionByConversationId(conversationId: string): Promise<VoiceSession | null> {
    const session = this.db.data.voiceSessions.find((s) => s.externalConversationId === conversationId);
    return session && (!this.actor || canAccessVoiceSession(this.actor, session))
      ? structuredClone(session)
      : null;
  }

  async updateVoiceSession(sessionId: string, patch: VoiceSessionPatch): Promise<VoiceSession> {
    this.requireSystem("Updating voice sessions");
    const session = this.db.data.voiceSessions.find((s) => s.id === sessionId);
    if (!session) throw notFound("Voice session not found.");
    Object.assign(session, definedOnly(patch));
    return this.mutated(session);
  }

  // ---- Summaries -----------------------------------------------------------

  async createSummary(input: NewGeneratedSummary): Promise<GeneratedSummary> {
    this.requireSystem("Writing summaries");
    const now = nowIso();
    for (const previous of this.db.data.summaries) {
      if (
        previous.patientId === input.patientId &&
        previous.audience === input.audience &&
        !previous.supersededAt
      ) {
        previous.supersededAt = now;
      }
    }
    const summary: GeneratedSummary = {
      ...input,
      supersededAt: null,
      id: input.id ?? crypto.randomUUID(),
      createdAt: input.createdAt ?? now,
    };
    this.db.data.summaries.push(summary);
    return this.mutated(summary);
  }

  async getLatestSummary(patientId: string, audience: SummaryAudience): Promise<GeneratedSummary | null> {
    let latest: GeneratedSummary | null = null;
    for (const summary of this.db.data.summaries) {
      if (summary.patientId !== patientId || summary.audience !== audience) continue;
      if (summary.supersededAt) continue;
      if (this.actor && !canReadSummary(this.actor, summary, this.assigned(patientId))) continue;
      // ">=" so that, on equal timestamps, the later-inserted summary wins.
      if (!latest || summary.createdAt >= latest.createdAt) latest = summary;
    }
    return latest ? structuredClone(latest) : null;
  }

  // ---- Sharing approvals & doctor reviews ----------------------------------

  async createSharingApproval(input: NewSharingApproval): Promise<SharingApproval> {
    this.requireSystem("Writing sharing approvals");
    const approval: SharingApproval = { ...input, id: input.id ?? crypto.randomUUID() };
    this.db.data.approvals.push(approval);
    return this.mutated(approval);
  }

  async listSharingApprovals(patientId: string): Promise<SharingApproval[]> {
    if (this.actor && !canAccessSharingApprovals(this.actor, patientId)) return [];
    return structuredClone(this.db.data.approvals.filter((a) => a.patientId === patientId));
  }

  async listDoctorReviews(doctorId: string, patientId?: string): Promise<DoctorReview[]> {
    if (this.actor && (this.actor.role !== "doctor" || this.actor.userId !== doctorId)) return [];
    const rows = this.db.data.doctorReviews.filter(
      (r) => r.doctorId === doctorId && (patientId === undefined || r.patientId === patientId),
    );
    return structuredClone(rows);
  }

  async upsertDoctorReview(input: {
    doctorId: string;
    patientId: string;
    journalEntryId: string;
  }): Promise<DoctorReview> {
    const entry = this.findEntry(input.journalEntryId);
    if (this.actor) {
      if (this.actor.role !== "doctor" || this.actor.userId !== input.doctorId) throw forbidden();
      if (!entry || entry.patientId !== input.patientId) throw notFound("Entry not found.");
      if (!canDoctorReview(this.actor, entry, this.assigned(entry.patientId))) {
        throw forbidden("Only approved entries of assigned patients can be reviewed.");
      }
    }
    const now = nowIso();
    const existing = this.db.data.doctorReviews.find(
      (r) => r.doctorId === input.doctorId && r.journalEntryId === input.journalEntryId,
    );
    if (existing) {
      existing.reviewedAt = now;
      return this.mutated(existing);
    }
    const review: DoctorReview = { id: crypto.randomUUID(), ...input, reviewedAt: now };
    this.db.data.doctorReviews.push(review);
    return this.mutated(review);
  }

  // ---- Vexo connection (system only) ---------------------------------------

  async getVexoConnection(userId: string): Promise<VexoConnection | null> {
    this.requireSystem("Vexo connections");
    const row = this.db.data.vexoConnections.find((c) => c.userId === userId);
    return row ? structuredClone(row) : null;
  }

  async saveVexoConnection(connection: VexoConnection): Promise<void> {
    this.requireSystem("Vexo connections");
    const rows = this.db.data.vexoConnections;
    const index = rows.findIndex((c) => c.userId === connection.userId);
    const copy = structuredClone(connection);
    if (index >= 0) rows[index] = copy;
    else rows.push(copy);
    this.db.save();
  }

  async deleteVexoConnection(userId: string): Promise<void> {
    this.requireSystem("Vexo connections");
    const rows = this.db.data.vexoConnections;
    const index = rows.findIndex((c) => c.userId === userId);
    if (index >= 0) rows.splice(index, 1);
    this.db.save();
  }

  // ---- AI usage & billing (system only) ------------------------------------

  async createUsageRecords(records: NewAiUsageRecord[]): Promise<AiUsageRecord[]> {
    this.requireSystem("AI usage records");
    const now = nowIso();
    const created: AiUsageRecord[] = records.map((r) => ({
      ...r,
      id: r.id ?? crypto.randomUUID(),
      createdAt: r.createdAt ?? now,
    }));
    this.db.data.usageRecords.push(...created);
    return this.mutated(created);
  }

  async updateUsageRecord(id: string, patch: AiUsageRecordPatch): Promise<AiUsageRecord> {
    this.requireSystem("AI usage records");
    const record = this.db.data.usageRecords.find((r) => r.id === id);
    if (!record) throw notFound("Usage record not found.");
    Object.assign(record, definedOnly(patch));
    return this.mutated(record);
  }

  async listUsageRecords(query: UsageQuery): Promise<AiUsageRecord[]> {
    this.requireSystem("AI usage records");
    let rows = this.db.data.usageRecords.filter(
      (r) =>
        (query.billingDoctorId === undefined || r.billingDoctorId === query.billingDoctorId) &&
        (query.patientId === undefined || r.patientId === query.patientId) &&
        (query.since === undefined || r.occurredAt >= query.since) &&
        (query.until === undefined || r.occurredAt <= query.until) &&
        (query.billingStatus === undefined || query.billingStatus.includes(r.billingStatus)),
    );
    const direction = query.order === "asc" ? 1 : -1;
    rows = [...rows].sort((a, b) => direction * a.occurredAt.localeCompare(b.occurredAt));
    if (query.limit !== undefined) rows = rows.slice(0, query.limit);
    return structuredClone(rows);
  }

  async getBillingAccount(doctorId: string): Promise<BillingAccount | null> {
    this.requireSystem("Billing accounts");
    const row = this.db.data.billingAccounts.find((a) => a.doctorId === doctorId);
    return row ? structuredClone(row) : null;
  }

  async saveBillingAccount(account: BillingAccount): Promise<BillingAccount> {
    this.requireSystem("Billing accounts");
    const rows = this.db.data.billingAccounts;
    const copy: BillingAccount = { ...structuredClone(account), updatedAt: nowIso() };
    const index = rows.findIndex((a) => a.doctorId === account.doctorId);
    if (index >= 0) rows[index] = copy;
    else rows.push(copy);
    return this.mutated(copy);
  }

  async findBillingAccountByStripeCustomer(customerId: string): Promise<BillingAccount | null> {
    this.requireSystem("Billing accounts");
    const row = this.db.data.billingAccounts.find((a) => a.stripeCustomerId === customerId);
    return row ? structuredClone(row) : null;
  }
}

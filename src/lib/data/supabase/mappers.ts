import type {
  AiUsageRecord,
  BillingAccount,
  SimulatedInvoice,
  CareAssignment,
  DoctorReview,
  GeneratedSummary,
  JournalEntry,
  Observation,
  PatientProfile,
  SharingApproval,
  SourceReference,
  SummaryContent,
  TranscriptTurn,
  UserProfile,
  VexoConnection,
  VoiceSession,
} from "@/lib/domain/types";
import type {
  AiUsageRecordPatch,
  NewAiUsageRecord,
  JournalEntryPatch,
  NewGeneratedSummary,
  NewJournalEntry,
  NewObservation,
  NewSharingApproval,
  NewSourceReference,
  NewVoiceSession,
  ObservationPatch,
  VoiceSessionPatch,
} from "@/lib/data/repository";

/**
 * Row <-> domain mappers for the Supabase (Postgres) schema in
 * supabase/migrations/20261113000000_doctorloop_init.sql.
 *
 * Rows are snake_case. Timestamps come back from PostgREST in Postgres format
 * ("2026-11-13T21:04:00+00:00"), so they are normalised to ISO-8601 UTC here.
 */

type Json = Record<string, unknown>;

const iso = (value: string): string => new Date(value).toISOString();
const isoOrNull = (value: string | null): string | null => (value === null ? null : iso(value));

/** Copies only defined entries; used to build insert/update payloads without undefined keys. */
export function compact(input: Record<string, unknown>): Json {
  return Object.fromEntries(Object.entries(input).filter(([, value]) => value !== undefined));
}

// ---- Identity ---------------------------------------------------------------

export interface ProfileRow {
  id: string;
  role: UserProfile["role"];
  full_name: string;
  email: string;
  title: string | null;
  created_at: string;
}

export const profileFromRow = (r: ProfileRow): UserProfile => ({
  id: r.id,
  role: r.role,
  fullName: r.full_name,
  email: r.email,
  title: r.title,
  createdAt: iso(r.created_at),
});

export const profileToRow = (p: UserProfile): Json => ({
  id: p.id,
  role: p.role,
  full_name: p.fullName,
  email: p.email,
  title: p.title,
  created_at: p.createdAt,
});

export interface PatientRow {
  id: string;
  user_id: string;
  full_name: string;
  date_of_birth: string | null;
  procedure: string;
  procedure_date: string;
  recovery_stage: string;
  recovery_notes: string | null;
  next_appointment_at: string | null;
  next_appointment_with: string | null;
  next_appointment_reason: string | null;
  created_at: string;
}

export const patientFromRow = (r: PatientRow): PatientProfile => ({
  id: r.id,
  userId: r.user_id,
  fullName: r.full_name,
  dateOfBirth: r.date_of_birth,
  procedure: r.procedure,
  procedureDate: r.procedure_date,
  recoveryStage: r.recovery_stage,
  recoveryNotes: r.recovery_notes,
  nextAppointmentAt: isoOrNull(r.next_appointment_at),
  nextAppointmentWith: r.next_appointment_with,
  nextAppointmentReason: r.next_appointment_reason,
  createdAt: iso(r.created_at),
});

export const patientToRow = (p: PatientProfile): Json => ({
  id: p.id,
  user_id: p.userId,
  full_name: p.fullName,
  date_of_birth: p.dateOfBirth,
  procedure: p.procedure,
  procedure_date: p.procedureDate,
  recovery_stage: p.recoveryStage,
  recovery_notes: p.recoveryNotes,
  next_appointment_at: p.nextAppointmentAt,
  next_appointment_with: p.nextAppointmentWith,
  next_appointment_reason: p.nextAppointmentReason,
  created_at: p.createdAt,
});

export interface AssignmentRow {
  id: string;
  doctor_id: string;
  patient_id: string;
  created_at: string;
}

export const assignmentFromRow = (r: AssignmentRow): CareAssignment => ({
  id: r.id,
  doctorId: r.doctor_id,
  patientId: r.patient_id,
  createdAt: iso(r.created_at),
});

export const assignmentToRow = (a: CareAssignment): Json => ({
  id: a.id,
  doctor_id: a.doctorId,
  patient_id: a.patientId,
  created_at: a.createdAt,
});

// ---- Journal entries ----------------------------------------------------------

export interface EntryRow {
  id: string;
  patient_id: string;
  source: JournalEntry["source"];
  body: string;
  occurred_at: string;
  created_at: string;
  updated_at: string;
  review_status: JournalEntry["reviewStatus"];
  reviewed_by_patient_at: string | null;
  processing_status: JournalEntry["processingStatus"];
  processing_error: string | null;
  source_ref_id: string | null;
  voice_session_id: string | null;
  edited_by_patient: boolean;
  privacy_filter: JournalEntry["privacyFilter"];
}

export const entryFromRow = (r: EntryRow): JournalEntry => ({
  id: r.id,
  patientId: r.patient_id,
  source: r.source,
  body: r.body,
  occurredAt: iso(r.occurred_at),
  createdAt: iso(r.created_at),
  updatedAt: iso(r.updated_at),
  reviewStatus: r.review_status,
  reviewedByPatientAt: isoOrNull(r.reviewed_by_patient_at),
  processingStatus: r.processing_status,
  processingError: r.processing_error,
  sourceRefId: r.source_ref_id,
  voiceSessionId: r.voice_session_id,
  editedByPatient: r.edited_by_patient,
  privacyFilter: r.privacy_filter ?? null,
});

/** Insert payload; also used by the seed script (which passes full JournalEntry objects). */
export const entryToRow = (e: NewJournalEntry & { updatedAt?: string }): Json =>
  compact({
    id: e.id,
    patient_id: e.patientId,
    source: e.source,
    body: e.body,
    occurred_at: e.occurredAt,
    created_at: e.createdAt,
    updated_at: e.updatedAt,
    review_status: e.reviewStatus,
    reviewed_by_patient_at: e.reviewedByPatientAt,
    processing_status: e.processingStatus,
    processing_error: e.processingError,
    source_ref_id: e.sourceRefId,
    voice_session_id: e.voiceSessionId,
    edited_by_patient: e.editedByPatient,
    // Omitted when null so a patient-scoped insert never names the system-only column.
    privacy_filter: e.privacyFilter ?? undefined,
  });

export const entryPatchToRow = (p: JournalEntryPatch): Json =>
  compact({
    body: p.body,
    occurred_at: p.occurredAt,
    review_status: p.reviewStatus,
    reviewed_by_patient_at: p.reviewedByPatientAt,
    processing_status: p.processingStatus,
    processing_error: p.processingError,
    source_ref_id: p.sourceRefId,
    voice_session_id: p.voiceSessionId,
    edited_by_patient: p.editedByPatient,
    privacy_filter: p.privacyFilter,
  });

// ---- Observations -------------------------------------------------------------

export interface ObservationRow {
  id: string;
  patient_id: string;
  journal_entry_id: string;
  category: Observation["category"];
  label: string;
  body_site: string | null;
  patient_quote: string;
  observed_at: string | null;
  time_description: string | null;
  severity: number | null;
  severity_text: string | null;
  measure_value: number | null;
  measure_unit: string | null;
  context: string[];
  uncertainties: string[];
  status: Observation["status"];
  edited_by_patient: boolean;
  extracted_by: Observation["extractedBy"];
  model: string | null;
  created_at: string;
  updated_at: string;
}

export const observationFromRow = (r: ObservationRow): Observation => ({
  id: r.id,
  patientId: r.patient_id,
  journalEntryId: r.journal_entry_id,
  category: r.category,
  label: r.label,
  bodySite: r.body_site,
  patientQuote: r.patient_quote,
  observedAt: isoOrNull(r.observed_at),
  timeDescription: r.time_description,
  severity: r.severity === null ? null : Number(r.severity),
  severityText: r.severity_text,
  measureValue: r.measure_value === null ? null : Number(r.measure_value),
  measureUnit: r.measure_unit,
  context: r.context ?? [],
  uncertainties: r.uncertainties ?? [],
  status: r.status,
  editedByPatient: r.edited_by_patient,
  extractedBy: r.extracted_by,
  model: r.model,
  createdAt: iso(r.created_at),
  updatedAt: iso(r.updated_at),
});

/** Insert payload; also used by the seed script (which passes full Observation objects). */
export const observationToRow = (o: NewObservation & { createdAt?: string; updatedAt?: string }): Json =>
  compact({
    id: o.id,
    patient_id: o.patientId,
    journal_entry_id: o.journalEntryId,
    category: o.category,
    label: o.label,
    body_site: o.bodySite,
    patient_quote: o.patientQuote,
    observed_at: o.observedAt,
    time_description: o.timeDescription,
    severity: o.severity,
    severity_text: o.severityText,
    measure_value: o.measureValue,
    measure_unit: o.measureUnit,
    context: o.context,
    uncertainties: o.uncertainties,
    status: o.status,
    edited_by_patient: o.editedByPatient,
    extracted_by: o.extractedBy,
    model: o.model,
    created_at: o.createdAt,
    updated_at: o.updatedAt,
  });

export const observationPatchToRow = (p: ObservationPatch): Json =>
  compact({
    category: p.category,
    label: p.label,
    body_site: p.bodySite,
    observed_at: p.observedAt,
    time_description: p.timeDescription,
    severity: p.severity,
    severity_text: p.severityText,
    measure_value: p.measureValue,
    measure_unit: p.measureUnit,
    context: p.context,
    uncertainties: p.uncertainties,
    status: p.status,
    edited_by_patient: p.editedByPatient,
  });

// ---- Source references & voice sessions ---------------------------------------

export interface SourceRefRow {
  id: string;
  patient_id: string;
  provider: SourceReference["provider"];
  mode: SourceReference["mode"];
  external_id: string | null;
  title: string | null;
  excerpt: string | null;
  source_timestamp: string | null;
  retrieved_at: string;
  metadata: Record<string, unknown> | null;
}

export const sourceRefFromRow = (r: SourceRefRow): SourceReference => ({
  id: r.id,
  patientId: r.patient_id,
  provider: r.provider,
  mode: r.mode,
  externalId: r.external_id,
  title: r.title,
  excerpt: r.excerpt,
  sourceTimestamp: isoOrNull(r.source_timestamp),
  retrievedAt: iso(r.retrieved_at),
  metadata: r.metadata ?? {},
});

export const sourceRefToRow = (s: NewSourceReference): Json =>
  compact({
    id: s.id,
    patient_id: s.patientId,
    provider: s.provider,
    mode: s.mode,
    external_id: s.externalId,
    title: s.title,
    excerpt: s.excerpt,
    source_timestamp: s.sourceTimestamp,
    retrieved_at: s.retrievedAt,
    metadata: s.metadata,
  });

export interface VoiceSessionRow {
  id: string;
  patient_id: string;
  mode: VoiceSession["mode"];
  status: VoiceSession["status"];
  external_conversation_id: string | null;
  transcript: TranscriptTurn[] | null;
  confirmed_notes: string[] | null;
  started_at: string;
  ended_at: string | null;
  journal_entry_id: string | null;
}

export const voiceSessionFromRow = (r: VoiceSessionRow): VoiceSession => ({
  id: r.id,
  patientId: r.patient_id,
  mode: r.mode,
  status: r.status,
  externalConversationId: r.external_conversation_id,
  transcript: r.transcript ?? [],
  confirmedNotes: r.confirmed_notes ?? [],
  startedAt: iso(r.started_at),
  endedAt: isoOrNull(r.ended_at),
  journalEntryId: r.journal_entry_id,
});

export const voiceSessionToRow = (v: NewVoiceSession): Json =>
  compact({
    id: v.id,
    patient_id: v.patientId,
    mode: v.mode,
    status: v.status,
    external_conversation_id: v.externalConversationId,
    transcript: v.transcript,
    confirmed_notes: v.confirmedNotes,
    started_at: v.startedAt,
    ended_at: v.endedAt,
    journal_entry_id: v.journalEntryId,
  });

export const voiceSessionPatchToRow = (p: VoiceSessionPatch): Json =>
  compact({
    status: p.status,
    external_conversation_id: p.externalConversationId,
    transcript: p.transcript,
    confirmed_notes: p.confirmedNotes,
    ended_at: p.endedAt,
    journal_entry_id: p.journalEntryId,
  });

// ---- Summaries, approvals, reviews, Vexo --------------------------------------

export interface SummaryRow {
  id: string;
  patient_id: string;
  audience: GeneratedSummary["audience"];
  period_start: string;
  period_end: string;
  content: SummaryContent;
  source_entry_ids: string[];
  generated_by: GeneratedSummary["generatedBy"];
  model: string | null;
  created_at: string;
  superseded_at?: string | null;
}

export const summaryFromRow = (r: SummaryRow): GeneratedSummary => ({
  id: r.id,
  patientId: r.patient_id,
  audience: r.audience,
  periodStart: iso(r.period_start),
  periodEnd: iso(r.period_end),
  content: r.content,
  sourceEntryIds: r.source_entry_ids ?? [],
  generatedBy: r.generated_by,
  model: r.model,
  createdAt: iso(r.created_at),
  supersededAt: r.superseded_at ? iso(r.superseded_at) : null,
});

export const summaryToRow = (s: NewGeneratedSummary): Json =>
  compact({
    id: s.id,
    patient_id: s.patientId,
    audience: s.audience,
    period_start: s.periodStart,
    period_end: s.periodEnd,
    content: s.content,
    source_entry_ids: s.sourceEntryIds,
    generated_by: s.generatedBy,
    model: s.model,
    created_at: s.createdAt,
  });

export interface ApprovalRow {
  id: string;
  patient_id: string;
  journal_entry_id: string;
  decision: SharingApproval["decision"];
  decided_by: string;
  decided_at: string;
  note: string | null;
}

export const approvalFromRow = (r: ApprovalRow): SharingApproval => ({
  id: r.id,
  patientId: r.patient_id,
  journalEntryId: r.journal_entry_id,
  decision: r.decision,
  decidedBy: r.decided_by,
  decidedAt: iso(r.decided_at),
  note: r.note,
});

export const approvalToRow = (a: NewSharingApproval): Json =>
  compact({
    id: a.id,
    patient_id: a.patientId,
    journal_entry_id: a.journalEntryId,
    decision: a.decision,
    decided_by: a.decidedBy,
    decided_at: a.decidedAt,
    note: a.note,
  });

export interface DoctorReviewRow {
  id: string;
  doctor_id: string;
  patient_id: string;
  journal_entry_id: string;
  reviewed_at: string;
}

export const doctorReviewFromRow = (r: DoctorReviewRow): DoctorReview => ({
  id: r.id,
  doctorId: r.doctor_id,
  patientId: r.patient_id,
  journalEntryId: r.journal_entry_id,
  reviewedAt: iso(r.reviewed_at),
});

export const doctorReviewToRow = (r: DoctorReview): Json => ({
  id: r.id,
  doctor_id: r.doctorId,
  patient_id: r.patientId,
  journal_entry_id: r.journalEntryId,
  reviewed_at: r.reviewedAt,
});

export interface VexoConnectionRow {
  user_id: string;
  tokens_enc: string;
  client_info_enc: string | null;
  scope: string | null;
  connected_at: string;
  updated_at: string;
}

export const vexoConnectionFromRow = (r: VexoConnectionRow): VexoConnection => ({
  userId: r.user_id,
  tokensEnc: r.tokens_enc,
  clientInfoEnc: r.client_info_enc,
  scope: r.scope,
  connectedAt: iso(r.connected_at),
  updatedAt: iso(r.updated_at),
});

export const vexoConnectionToRow = (c: VexoConnection): Json => ({
  user_id: c.userId,
  tokens_enc: c.tokensEnc,
  client_info_enc: c.clientInfoEnc,
  scope: c.scope,
  connected_at: c.connectedAt,
  updated_at: c.updatedAt,
});

// ---- AI usage & billing ---------------------------------------------------------

export interface UsageRecordRow {
  id: string;
  patient_id: string;
  billing_doctor_id: string | null;
  operation: AiUsageRecord["operation"];
  triggered_by: AiUsageRecord["triggeredBy"];
  triggered_by_user_id: string | null;
  journal_entry_id: string | null;
  provider: AiUsageRecord["provider"];
  model: string | null;
  input_tokens: number;
  output_tokens: number;
  total_tokens: number;
  token_source: AiUsageRecord["tokenSource"];
  rate_micros_per_1k: number;
  /** bigint: PostgREST may return it as a string. */
  amount_micros: number | string;
  billing_status: AiUsageRecord["billingStatus"];
  billing_mode: AiUsageRecord["billingMode"];
  billing_error: string | null;
  billed_at: string | null;
  occurred_at: string;
  created_at: string;
}

export const usageRecordFromRow = (r: UsageRecordRow): AiUsageRecord => ({
  id: r.id,
  patientId: r.patient_id,
  billingDoctorId: r.billing_doctor_id,
  operation: r.operation,
  triggeredBy: r.triggered_by,
  triggeredByUserId: r.triggered_by_user_id,
  journalEntryId: r.journal_entry_id,
  provider: r.provider,
  model: r.model,
  inputTokens: Number(r.input_tokens),
  outputTokens: Number(r.output_tokens),
  totalTokens: Number(r.total_tokens),
  tokenSource: r.token_source,
  rateMicrosPer1k: Number(r.rate_micros_per_1k),
  amountMicros: Number(r.amount_micros),
  billingStatus: r.billing_status,
  billingMode: r.billing_mode,
  billingError: r.billing_error,
  billedAt: isoOrNull(r.billed_at),
  occurredAt: iso(r.occurred_at),
  createdAt: iso(r.created_at),
});

export const usageRecordToRow = (r: NewAiUsageRecord): Json =>
  compact({
    id: r.id,
    patient_id: r.patientId,
    billing_doctor_id: r.billingDoctorId,
    operation: r.operation,
    triggered_by: r.triggeredBy,
    triggered_by_user_id: r.triggeredByUserId,
    journal_entry_id: r.journalEntryId,
    provider: r.provider,
    model: r.model,
    input_tokens: r.inputTokens,
    output_tokens: r.outputTokens,
    total_tokens: r.totalTokens,
    token_source: r.tokenSource,
    rate_micros_per_1k: r.rateMicrosPer1k,
    amount_micros: r.amountMicros,
    billing_status: r.billingStatus,
    billing_mode: r.billingMode,
    billing_error: r.billingError,
    billed_at: r.billedAt,
    occurred_at: r.occurredAt,
    created_at: r.createdAt,
  });

export const usageRecordPatchToRow = (p: AiUsageRecordPatch): Json =>
  compact({
    billing_status: p.billingStatus,
    billing_mode: p.billingMode,
    billing_error: p.billingError,
    billed_at: p.billedAt,
  });

export interface BillingAccountRow {
  doctor_id: string;
  mode: BillingAccount["mode"];
  status: BillingAccount["status"];
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  stripe_price_id: string | null;
  payment_method_label: string | null;
  rate_micros_per_1k: number;
  period_anchor_at: string | null;
  activated_at: string | null;
  canceled_at: string | null;
  simulated_invoices: SimulatedInvoice[] | null;
  created_at: string;
  updated_at: string;
}

export const billingAccountFromRow = (r: BillingAccountRow): BillingAccount => ({
  doctorId: r.doctor_id,
  mode: r.mode,
  status: r.status,
  stripeCustomerId: r.stripe_customer_id,
  stripeSubscriptionId: r.stripe_subscription_id,
  stripePriceId: r.stripe_price_id,
  paymentMethodLabel: r.payment_method_label,
  rateMicrosPer1k: Number(r.rate_micros_per_1k),
  periodAnchorAt: isoOrNull(r.period_anchor_at),
  activatedAt: isoOrNull(r.activated_at),
  canceledAt: isoOrNull(r.canceled_at),
  simulatedInvoices: r.simulated_invoices ?? [],
  createdAt: iso(r.created_at),
  updatedAt: iso(r.updated_at),
});

export const billingAccountToRow = (a: BillingAccount): Json => ({
  doctor_id: a.doctorId,
  mode: a.mode,
  status: a.status,
  stripe_customer_id: a.stripeCustomerId,
  stripe_subscription_id: a.stripeSubscriptionId,
  stripe_price_id: a.stripePriceId,
  payment_method_label: a.paymentMethodLabel,
  rate_micros_per_1k: a.rateMicrosPer1k,
  period_anchor_at: a.periodAnchorAt,
  activated_at: a.activatedAt,
  canceled_at: a.canceledAt,
  simulated_invoices: a.simulatedInvoices,
  created_at: a.createdAt,
  updated_at: a.updatedAt,
});

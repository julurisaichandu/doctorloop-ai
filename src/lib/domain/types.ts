/**
 * Canonical domain types for DoctorLoop AI.
 *
 * SHARED CONTRACT — every module (data layer, services, AI pipeline, integrations, UI)
 * depends on these shapes. Do not rename or remove fields; additive changes only, and
 * update docs/ARCHITECTURE.md when you add something.
 *
 * Conventions:
 * - All ids are UUID strings.
 * - All timestamps are ISO-8601 strings in UTC (e.g. "2026-11-13T21:04:00.000Z").
 * - Calendar dates (no time) are "YYYY-MM-DD" strings.
 * - Everything here is synthetic demo data. Nothing is a diagnosis or a risk score.
 */

// ---------------------------------------------------------------------------
// Enumerations
// ---------------------------------------------------------------------------

export type Role = "patient" | "doctor";

/** Where a journal entry came from. */
export type EntrySource = "manual" | "voice" | "vexo";

/**
 * Patient's sharing decision for a journal entry.
 * - pending_review: visible only to the patient; waiting for the patient to review.
 * - approved: patient approved sharing with their assigned clinicians.
 * - rejected: patient chose to keep it private (also used after "stop sharing").
 */
export type ReviewStatus = "pending_review" | "approved" | "rejected";

/** AI processing state of a journal entry. */
export type ProcessingStatus = "processing" | "processed" | "failed";

export type ObservationCategory =
  | "symptom"
  | "sleep"
  | "mobility"
  | "activity"
  | "mood"
  | "medication"
  | "wound"
  | "question"
  | "other";

/** Patients can remove an AI-extracted observation before sharing. */
export type ObservationStatus = "active" | "removed";

/** Which engine produced AI output. "mock" = deterministic rule-based fallback (no API key). */
export type AiProvider = "openai" | "mock";

/** Provenance mode of an external integration. */
export type IntegrationMode = "live" | "mock" | "simulated";

/** "patient" = weekly recovery summary for the patient; "clinician" = pre-visit summary built ONLY from approved entries. */
export type SummaryAudience = "patient" | "clinician";

export type SharingDecision = "approved" | "rejected" | "revoked";

export type VoiceSessionMode = "elevenlabs" | "simulated";
export type VoiceSessionStatus = "active" | "completed" | "failed" | "cancelled";

export type SourceProvider = "vexo" | "elevenlabs" | "manual";

export const OBSERVATION_CATEGORIES: readonly ObservationCategory[] = [
  "symptom",
  "sleep",
  "mobility",
  "activity",
  "mood",
  "medication",
  "wound",
  "question",
  "other",
] as const;

// ---------------------------------------------------------------------------
// Identity
// ---------------------------------------------------------------------------

export interface UserProfile {
  id: string; // == auth user id
  role: Role;
  fullName: string;
  email: string;
  /** Doctors: specialty/title line, e.g. "Post-operative Care · Internal Medicine". Patients: null. */
  title: string | null;
  createdAt: string;
}

export interface PatientProfile {
  id: string; // patient id (distinct from user id)
  userId: string; // -> UserProfile.id
  fullName: string;
  dateOfBirth: string | null; // YYYY-MM-DD (fictional)
  procedure: string; // e.g. "Right knee ACL reconstruction (arthroscopic)"
  procedureDate: string; // YYYY-MM-DD
  recoveryStage: string; // e.g. "Week 3 of post-operative recovery"
  recoveryNotes: string | null; // e.g. "Physiotherapy 3x/week; crutches as needed"
  nextAppointmentAt: string | null; // ISO datetime
  nextAppointmentWith: string | null; // display name, e.g. "Dr. Elena Park"
  nextAppointmentReason: string | null; // e.g. "3-week post-op follow-up"
  createdAt: string;
}

export interface CareAssignment {
  id: string;
  doctorId: string; // -> UserProfile.id (role doctor)
  patientId: string; // -> PatientProfile.id
  createdAt: string;
}

/** The authenticated principal for a request. Derived server-side only. */
export interface Actor {
  userId: string;
  role: Role;
  fullName: string;
  email: string;
  title: string | null;
  /** Set when role === "patient"; null for doctors. */
  patientId: string | null;
}

/** Demo accounts listed by the development-only role switcher. */
export interface DemoAccount {
  userId: string;
  email: string;
  role: Role;
  fullName: string;
  /** One-line description shown in the switcher, e.g. "Patient A · knee surgery". */
  description: string;
  patientId: string | null;
}

// ---------------------------------------------------------------------------
// Journal, sources, voice
// ---------------------------------------------------------------------------

/** Categories of personal details the privacy filter can hide. */
export const PRIVACY_REDACTION_CATEGORIES = [
  "person_name",
  "phone",
  "email",
  "address",
  "id_number",
  "link",
] as const;
export type PrivacyRedactionCategory = (typeof PRIVACY_REDACTION_CATEGORIES)[number];

/**
 * Counts-only record of what the privacy filter did to an entry. The removed text and the
 * original are never stored; only the filtered body is. System-written (ARCHITECTURE 5.1).
 */
export interface PrivacyFilterReceipt {
  provider: "openai" | "mock";
  model: string | null;
  totalSentences: number;
  keptSentences: number;
  redactions: Partial<Record<PrivacyRedactionCategory, number>>;
  /** True when OpenAI was configured but failed, so the rule-based filter ran instead. */
  fallback?: boolean;
  filteredAt: string;
}

export interface JournalEntry {
  id: string;
  patientId: string;
  source: EntrySource;
  /** The patient's own words: typed note, patient turns of a voice transcript, or an approved Vexo excerpt. */
  body: string;
  /** When it happened according to the source (source timestamp). */
  occurredAt: string;
  /** When it was recorded in DoctorLoop. */
  createdAt: string;
  updatedAt: string;
  reviewStatus: ReviewStatus;
  /** When the patient last approved/rejected/revoked. */
  reviewedByPatientAt: string | null;
  processingStatus: ProcessingStatus;
  processingError: string | null;
  sourceRefId: string | null; // -> SourceReference
  voiceSessionId: string | null; // -> VoiceSession
  editedByPatient: boolean;
  /** Counts-only privacy filter receipt; null for entries saved before the filter existed. System-written. */
  privacyFilter: PrivacyFilterReceipt | null;
}

export interface SourceReference {
  id: string;
  patientId: string;
  provider: SourceProvider;
  mode: IntegrationMode;
  /** Vexo memory/transcript id, ElevenLabs conversation id, etc. */
  externalId: string | null;
  title: string | null;
  /** Original excerpt exactly as retrieved from the source. */
  excerpt: string | null;
  /** Original timestamp reported by the source. */
  sourceTimestamp: string | null;
  retrievedAt: string;
  /** Provenance details, e.g. { tool: "search", query: "knee", mcpServer: "https://api.vexoai.com/mcp" }. */
  metadata: Record<string, unknown>;
}

export interface TranscriptTurn {
  role: "agent" | "patient";
  text: string;
  /** ISO timestamp if known. */
  at: string | null;
}

export interface VoiceSession {
  id: string;
  patientId: string;
  mode: VoiceSessionMode;
  status: VoiceSessionStatus;
  /** ElevenLabs conversation id (null in simulated mode). */
  externalConversationId: string | null;
  transcript: TranscriptTurn[];
  /** Notes the patient explicitly confirmed during the call (via the record_health_note client tool). */
  confirmedNotes: string[];
  startedAt: string;
  endedAt: string | null;
  journalEntryId: string | null;
}

// ---------------------------------------------------------------------------
// Structured observations (AI-extracted, patient-editable)
// ---------------------------------------------------------------------------

export interface Observation {
  id: string;
  patientId: string;
  journalEntryId: string;
  category: ObservationCategory;
  /** Short neutral label, e.g. "Knee discomfort", "Sleep", "Walking". Not a diagnosis. */
  label: string;
  bodySite: string | null; // e.g. "right knee"
  /** Verbatim supporting excerpt from the entry body (the patient's statement). */
  patientQuote: string;
  /** ISO datetime if determinable from the text + entry timestamp, else null. */
  observedAt: string | null;
  /** Time as the patient described it, e.g. "last night". */
  timeDescription: string | null;
  /** 0-10 self-reported intensity — ONLY when the patient explicitly stated a number. */
  severity: number | null;
  /** Verbatim severity wording, e.g. "about a 6 out of 10". */
  severityText: string | null;
  /** Explicitly stated quantity, e.g. 4 (hours of sleep), 20 (minutes walked). */
  measureValue: number | null;
  measureUnit: string | null; // e.g. "hours", "minutes", "steps"
  /** Relevant activities/context, e.g. ["after physiotherapy", "climbing stairs"]. */
  context: string[];
  /** Missing or unclear details, e.g. ["Onset time not stated"]. */
  uncertainties: string[];
  status: ObservationStatus;
  editedByPatient: boolean;
  extractedBy: AiProvider;
  model: string | null;
  createdAt: string;
  updatedAt: string;
}

// ---------------------------------------------------------------------------
// Summaries (AI-generated, unverified)
// ---------------------------------------------------------------------------

export interface SummaryItem {
  text: string;
  /** Journal entry ids that support this item. Every item must cite at least one entry. */
  citations: string[];
}

export interface SummaryContent {
  /** 1-3 neutral sentences. No diagnosis, no risk language, no recommendations. */
  overview: string;
  mainConcerns: SummaryItem[];
  changesSinceEarlier: SummaryItem[];
  recoveryActivities: SummaryItem[];
  patientQuestions: SummaryItem[];
  /** Missing details worth asking about, e.g. "Pain timing not described on Nov 10". */
  dataGaps: string[];
}

export interface GeneratedSummary {
  id: string;
  patientId: string;
  audience: SummaryAudience;
  periodStart: string; // ISO
  periodEnd: string; // ISO
  content: SummaryContent;
  /** Entry ids the summary was generated from (clinician summaries: approved entries only). */
  sourceEntryIds: string[];
  generatedBy: AiProvider;
  model: string | null;
  createdAt: string;
  /** Set when a newer summary of the same patient + audience replaced this one. Doctors only see non-superseded summaries. */
  supersededAt?: string | null;
}

// ---------------------------------------------------------------------------
// Sharing & clinician review
// ---------------------------------------------------------------------------

export interface SharingApproval {
  id: string;
  patientId: string;
  journalEntryId: string;
  decision: SharingDecision;
  decidedBy: string; // user id of the patient
  decidedAt: string;
  note: string | null;
}

/** "Doctor has read this shared update". NOT a clinical assessment and NOT a risk score. */
export interface DoctorReview {
  id: string;
  doctorId: string;
  patientId: string;
  journalEntryId: string;
  reviewedAt: string;
}

// ---------------------------------------------------------------------------
// Vexo OAuth connection (server-only; never sent to the browser)
// ---------------------------------------------------------------------------

export interface VexoConnection {
  userId: string;
  /** AES-256-GCM encrypted JSON of the OAuth tokens (access/refresh/expiry/scope). */
  tokensEnc: string;
  /** AES-256-GCM encrypted JSON of OAuth client information (e.g. from dynamic client registration). */
  clientInfoEnc: string | null;
  scope: string | null;
  connectedAt: string;
  updatedAt: string;
}

// ---------------------------------------------------------------------------
// Timeline & trends (deterministic, computed — never invented by an LLM)
// ---------------------------------------------------------------------------

export interface TrendPoint {
  date: string; // YYYY-MM-DD
  value: number;
  entryId: string;
  observationId: string;
}

export interface TrendSeries {
  /** Stable key, e.g. "severity:knee discomfort" or "measure:sleep:hours". */
  key: string;
  label: string; // e.g. "Knee discomfort (0-10)" or "Sleep (hours)"
  kind: "severity" | "measure";
  unit: string | null;
  category: ObservationCategory;
  points: TrendPoint[]; // sorted by date asc
}

/** An explicit, numeric change between two patient-reported values. No interpretation. */
export interface ExplicitChange {
  seriesKey: string;
  label: string;
  kind: "severity" | "measure";
  unit: string | null;
  from: TrendPoint;
  to: TrendPoint;
  direction: "increased" | "decreased" | "unchanged";
  /** e.g. "Self-reported knee discomfort went from 3/10 (Nov 7) to 7/10 (Nov 13)." */
  description: string;
}

export interface TimelineDay {
  date: string; // YYYY-MM-DD
  entryIds: string[];
  observationIds: string[];
}

export interface TimelineResult {
  days: TimelineDay[]; // sorted asc
  series: TrendSeries[];
  changes: ExplicitChange[];
}

// ---------------------------------------------------------------------------
// View models returned by services to the UI
// ---------------------------------------------------------------------------

export interface TimelineEntryView {
  entry: JournalEntry;
  /** Active observations (removed ones excluded) unless the caller asked otherwise. */
  observations: Observation[];
  sourceRef: SourceReference | null;
  /** Doctor views only: this doctor's review record for the entry, if any. */
  doctorReview?: DoctorReview | null;
  /** Patient views only: latest "seen by care team" marker for this shared entry (closes the loop). */
  careTeamReview?: { doctorName: string; reviewedAt: string } | null;
  /** Counts-only privacy filter receipt (same as `entry.privacyFilter`), shown to both audiences. */
  privacyFilter: PrivacyFilterReceipt | null;
}

export interface PatientDashboardData {
  patient: PatientProfile;
  /** Most recent entries first (all statuses), last 14 days. */
  recentEntries: TimelineEntryView[];
  pendingReview: TimelineEntryView[];
  trends: TrendSeries[];
  changes: ExplicitChange[];
  weeklySummary: GeneratedSummary | null;
  /** What the care team currently sees (built from approved entries only). */
  clinicianSummary: GeneratedSummary | null;
  careTeam: UserProfile[];
  stats: {
    totalEntries: number;
    sharedEntries: number;
    pendingReview: number;
    lastCheckInAt: string | null;
  };
}

export interface DoctorPatientListItem {
  patient: PatientProfile;
  latestShared: TimelineEntryView | null;
  /** Approved entries this doctor has not marked reviewed. Not a risk score. */
  unreviewedCount: number;
  sharedCount: number;
  lastSharedAt: string | null;
}

export interface DoctorPatientDetail {
  patient: PatientProfile;
  /** Approved entries only, newest first, each with this doctor's review record. */
  entries: TimelineEntryView[];
  trends: TrendSeries[];
  changes: ExplicitChange[];
  summary: GeneratedSummary | null;
  unreviewedCount: number;
  careTeam: UserProfile[];
}

export interface DoctorOverviewStats {
  patientCount: number;
  patientsAwaitingReview: number;
  unreviewedUpdates: number;
  upcomingAppointments7d: number;
}

// ---------------------------------------------------------------------------
// Server action result envelope
// ---------------------------------------------------------------------------

export type AppErrorCode =
  | "UNAUTHENTICATED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "VALIDATION"
  | "CONFLICT"
  | "INTEGRATION"
  | "INTERNAL";

export type ActionResult<T = void> =
  | { ok: true; data: T }
  | { ok: false; error: string; code: AppErrorCode };

// ---------------------------------------------------------------------------
// AI usage & practice billing (doctor side only — patients are never billed)
// ---------------------------------------------------------------------------

export type BillingMode = "stripe" | "simulated";
export type BillingAccountStatus = "pending_setup" | "active" | "past_due" | "canceled";
export type UsageOperation = "entry_extraction" | "patient_summary" | "clinician_summary" | "privacy_filter";
export type UsageTriggerKind = "patient" | "doctor" | "system";
export type TokenCountSource = "provider" | "estimated";
export type UsageBillingStatus = "not_billed" | "pending" | "billed" | "sync_failed";
export interface UsageTrigger { kind: UsageTriggerKind; userId: string | null }
/** One metered AI call. Money is integer micro-USD. Contains no entry text. */
export interface AiUsageRecord {
  id: string; patientId: string; billingDoctorId: string | null;
  operation: UsageOperation; triggeredBy: UsageTriggerKind; triggeredByUserId: string | null;
  journalEntryId: string | null; provider: AiProvider; model: string | null;
  inputTokens: number; outputTokens: number; totalTokens: number; tokenSource: TokenCountSource;
  rateMicrosPer1k: number; amountMicros: number;
  billingStatus: UsageBillingStatus; billingMode: BillingMode | null; billingError: string | null;
  billedAt: string | null; occurredAt: string; createdAt: string;
}
export interface SimulatedInvoice {
  id: string; number: string; periodStart: string; periodEnd: string;
  totalTokens: number; amountMicros: number; status: "paid"; paidWith: string; createdAt: string;
}
export interface BillingAccount {
  doctorId: string; mode: BillingMode; status: BillingAccountStatus;
  stripeCustomerId: string | null; stripeSubscriptionId: string | null; stripePriceId: string | null;
  paymentMethodLabel: string | null; rateMicrosPer1k: number;
  periodAnchorAt: string | null; activatedAt: string | null; canceledAt: string | null;
  simulatedInvoices: SimulatedInvoice[]; createdAt: string; updatedAt: string;
}
export interface BillingPeriod { start: string; end: string }
export interface UsageLine {
  id: string; occurredAt: string; patientId: string; patientName: string;
  activity: "entry_extraction" | "clinician_summary"; activityLabel: string;
  triggeredBy: UsageTriggerKind; provider: AiProvider; model: string | null;
  inputTokens: number; outputTokens: number; totalTokens: number; tokenSource: TokenCountSource;
  amountMicros: number; billingStatus: UsageBillingStatus;
  /** Display label for the status (e.g. "Billed", or "Billed (simulated)" for usage billed in the other mode). */
  billingLabel: string;
}
export interface UsageTotals {
  runs: number; inputTokens: number; outputTokens: number; totalTokens: number;
  billedMicros: number; notBilledMicros: number; estimatedRuns: number; failedSyncs: number;
}
export interface PatientUsageRow { patientId: string; patientName: string; totals: UsageTotals; lastItemizedAt: string | null }
export interface BillingInvoiceView {
  id: string; number: string | null; periodStart: string; periodEnd: string; amountCents: number;
  status: string; hostedUrl: string | null; pdfUrl: string | null; source: BillingMode;
}
export interface UpcomingInvoiceView {
  periodStart: string; periodEnd: string; amountCents: number; totalTokens: number;
  source: BillingMode; note: string | null;
}
export interface DoctorBillingOverview {
  mode: BillingMode; modeLabel: string; rateMicrosPer1k: number;
  account: { status: "not_set_up" | BillingAccountStatus; paymentMethodLabel: string | null; activatedAt: string | null; currentPeriod: BillingPeriod | null };
  window: BillingPeriod; totals: UsageTotals; patients: PatientUsageRow[]; recent: UsageLine[];
  upcomingInvoice: UpcomingInvoiceView | null; invoices: BillingInvoiceView[]; stripeError: string | null;
}
export interface PatientUsageStatement {
  doctor: { name: string; title: string | null };
  patient: { id: string; ref: string; name: string; dateOfBirth: string | null };
  period: BillingPeriod; rateMicrosPer1k: number; mode: BillingMode;
  lines: UsageLine[]; privateTotal: UsageTotals; totals: UsageTotals; generatedAt: string;
  /** Whole UTC calendar months covered by `privateTotal` (private usage is never reported per day). */
  privatePeriod: BillingPeriod;
}

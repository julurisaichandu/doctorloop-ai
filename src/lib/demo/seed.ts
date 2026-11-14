/**
 * Synthetic demo dataset for DoctorLoop AI. All people are fictional; emails use the
 * reserved example.com domain. Timestamps are computed relative to `now`.
 */
import { EXTRACTOR_SYSTEM_PROMPT, buildExtractorUserPrompt } from "@/lib/ai/openai/extractor";
import { SUMMARIZER_SYSTEM_PROMPT } from "@/lib/ai/openai/summarizer";
import { estimatedUsageEvent } from "@/lib/ai/usage";
import { DEFAULT_RATE_MICROS_PER_1K, usageAmountMicros } from "@/lib/billing/money";
import type {
  AiUsageRecord,
  CareAssignment,
  DemoAccount,
  DoctorReview,
  GeneratedSummary,
  JournalEntry,
  Observation,
  PatientProfile,
  SharingApproval,
  SourceReference,
  SummaryContent,
  SummaryItem,
  UserProfile,
  VoiceSession,
} from "@/lib/domain/types";
import { ENTRY_DEFS, SUMMARY_DEFS, type EntryDef, type ItemDef, type PatientKey } from "./seed-content";

/** Fixed, valid v4-shaped UUIDs. Prefix identifies the table; suffix is a counter. */
function fixedId(prefix: string, n: number): string {
  return `${prefix}-0000-4000-8000-${String(n).padStart(12, "0")}`;
}

/** Global entry number: m1..m8 -> 1..8, d1..d8 -> 11..18, p1..p8 -> 21..28. */
function entryNumber(key: string): number {
  const base = key[0] === "m" ? 0 : key[0] === "d" ? 10 : 20;
  return base + Number(key.slice(1));
}

const entryIdOf = (key: string): string => fixedId("30000000", entryNumber(key));

function entryIdsFor(prefix: string): string[] {
  return ENTRY_DEFS.filter((e) => e.key.startsWith(prefix)).map((e) => entryIdOf(e.key));
}

export const DEMO_IDS = {
  users: {
    maya: fixedId("10000000", 1),
    daniel: fixedId("10000000", 2),
    priya: fixedId("10000000", 3),
    drPark: fixedId("10000000", 4),
    drBell: fixedId("10000000", 5),
  },
  patients: {
    maya: fixedId("20000000", 1),
    daniel: fixedId("20000000", 2),
    priya: fixedId("20000000", 3),
  },
  /** Journal entry ids per patient, oldest first. */
  entries: {
    maya: entryIdsFor("m"),
    daniel: entryIdsFor("d"),
    priya: entryIdsFor("p"),
  },
} as const;

export const DEMO_ACCOUNTS: DemoAccount[] = [
  {
    userId: DEMO_IDS.users.maya,
    email: "maya.thompson@example.com",
    role: "patient",
    fullName: "Maya Thompson",
    description: "Patient A · Knee surgery recovery",
    patientId: DEMO_IDS.patients.maya,
  },
  {
    userId: DEMO_IDS.users.daniel,
    email: "daniel.okafor@example.com",
    role: "patient",
    fullName: "Daniel Okafor",
    description: "Patient B · Hip replacement recovery",
    patientId: DEMO_IDS.patients.daniel,
  },
  {
    userId: DEMO_IDS.users.priya,
    email: "priya.raman@example.com",
    role: "patient",
    fullName: "Priya Raman",
    description: "Patient C · Gallbladder surgery recovery",
    patientId: DEMO_IDS.patients.priya,
  },
  {
    userId: DEMO_IDS.users.drPark,
    email: "dr.elena.park@example.com",
    role: "doctor",
    fullName: "Dr. Elena Park",
    description: "Doctor · Post-operative care · 3 patients",
    patientId: null,
  },
  {
    userId: DEMO_IDS.users.drBell,
    email: "dr.marcus.bell@example.com",
    role: "doctor",
    fullName: "Dr. Marcus Bell",
    description: "Doctor · General surgery · 1 patient",
    patientId: null,
  },
];

export type SeedData = {
  profiles: UserProfile[];
  patients: PatientProfile[];
  assignments: CareAssignment[];
  entries: JournalEntry[];
  observations: Observation[];
  sourceRefs: SourceReference[];
  voiceSessions: VoiceSession[];
  summaries: GeneratedSummary[];
  approvals: SharingApproval[];
  doctorReviews: DoctorReview[];
  usageRecords: AiUsageRecord[];
};

const MIN = 60_000;
const DAY = 24 * 60 * MIN;
const MCP_SERVER = "https://api.vexoai.com/mcp";

/** Entries Dr. Park has NOT marked reviewed (latest approved ones), so the dashboard shows work waiting. */
const PARK_UNREVIEWED = new Set(["m6", "m7", "d8", "p7"]);
/** Entries Dr. Bell reviewed (Priya's older ones only). */
const BELL_REVIEWED = new Set(["p1", "p2", "p3"]);

export function buildSeedData(now: Date = new Date()): SeedData {
  const nowMs = now.getTime();
  const latestMs = nowMs - MIN;
  const iso = (ms: number): string => new Date(Math.min(ms, latestMs)).toISOString();

  const utcDay = (daysAgo: number, time: string): number => {
    const [hh, mm] = time.split(":").map(Number);
    return Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - daysAgo, hh, mm);
  };
  /** Calendar date in LOCAL time, so "Day N of recovery" never shifts after UTC midnight (evening demos). */
  const dateOnly = (daysAgo: number): string => {
    const d = new Date(now);
    d.setDate(d.getDate() - daysAgo);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  };
  /** Upcoming appointment at a LOCAL wall-clock time (so it never renders at 4-5 AM). */
  const future = (days: number, time: string): string => {
    const [hh, mm] = time.split(":").map(Number);
    const d = new Date(now);
    d.setDate(d.getDate() + days);
    d.setHours(hh, mm, 0, 0);
    return d.toISOString();
  };
  const occurredMs = (def: EntryDef): number =>
    "minsAgo" in def.when ? nowMs - def.when.minsAgo * MIN : utcDay(def.when.daysAgo, def.when.time);

  const userOf = (p: PatientKey): string => DEMO_IDS.users[p];
  const patientOf = (p: PatientKey): string => DEMO_IDS.patients[p];
  const createdLong = iso(nowMs - 30 * DAY);

  const profiles: UserProfile[] = [
    { id: DEMO_IDS.users.maya, role: "patient", fullName: "Maya Thompson", email: "maya.thompson@example.com", title: null, createdAt: createdLong },
    { id: DEMO_IDS.users.daniel, role: "patient", fullName: "Daniel Okafor", email: "daniel.okafor@example.com", title: null, createdAt: createdLong },
    { id: DEMO_IDS.users.priya, role: "patient", fullName: "Priya Raman", email: "priya.raman@example.com", title: null, createdAt: createdLong },
    { id: DEMO_IDS.users.drPark, role: "doctor", fullName: "Dr. Elena Park", email: "dr.elena.park@example.com", title: "Post-operative Care · Internal Medicine", createdAt: createdLong },
    { id: DEMO_IDS.users.drBell, role: "doctor", fullName: "Dr. Marcus Bell", email: "dr.marcus.bell@example.com", title: "General Surgery", createdAt: createdLong },
  ];

  const patients: PatientProfile[] = [
    {
      id: DEMO_IDS.patients.maya,
      userId: DEMO_IDS.users.maya,
      fullName: "Maya Thompson",
      dateOfBirth: "1994-03-18",
      procedure: "Right knee ACL reconstruction (arthroscopic)",
      procedureDate: dateOnly(18),
      recoveryStage: "Week 3 of post-operative recovery",
      recoveryNotes: "Physiotherapy 3 times a week; crutches for stairs and longer distances; icing and leg raises at home.",
      nextAppointmentAt: future(3, "10:30"),
      nextAppointmentWith: "Dr. Elena Park",
      nextAppointmentReason: "3-week post-op follow-up",
      createdAt: createdLong,
    },
    {
      id: DEMO_IDS.patients.daniel,
      userId: DEMO_IDS.users.daniel,
      fullName: "Daniel Okafor",
      dateOfBirth: "1961-09-02",
      procedure: "Left total hip replacement",
      procedureDate: dateOnly(35),
      recoveryStage: "Week 5 of post-operative recovery",
      recoveryNotes: "Physiotherapy twice a week; walker for longer walks, transitioning to a cane; daily home exercises.",
      nextAppointmentAt: future(6, "14:00"),
      nextAppointmentWith: "Dr. Elena Park",
      nextAppointmentReason: "5-week post-op review",
      createdAt: createdLong,
    },
    {
      id: DEMO_IDS.patients.priya,
      userId: DEMO_IDS.users.priya,
      fullName: "Priya Raman",
      dateOfBirth: "1988-11-27",
      procedure: "Laparoscopic cholecystectomy (gallbladder removal)",
      procedureDate: dateOnly(12),
      recoveryStage: "Week 2 of post-operative recovery",
      recoveryNotes: "Rest and short daily walks; no physiotherapy scheduled; planned return to desk work in about 10 days.",
      nextAppointmentAt: future(2, "09:15"),
      nextAppointmentWith: "Dr. Marcus Bell",
      nextAppointmentReason: "2-week post-op check",
      createdAt: createdLong,
    },
  ];

  const assignments: CareAssignment[] = [
    { id: fixedId("a0000000", 1), doctorId: DEMO_IDS.users.drPark, patientId: DEMO_IDS.patients.maya, createdAt: createdLong },
    { id: fixedId("a0000000", 2), doctorId: DEMO_IDS.users.drPark, patientId: DEMO_IDS.patients.daniel, createdAt: createdLong },
    { id: fixedId("a0000000", 3), doctorId: DEMO_IDS.users.drPark, patientId: DEMO_IDS.patients.priya, createdAt: createdLong },
    { id: fixedId("a0000000", 4), doctorId: DEMO_IDS.users.drBell, patientId: DEMO_IDS.patients.priya, createdAt: createdLong },
  ];

  const entries: JournalEntry[] = [];
  const observations: Observation[] = [];
  const sourceRefs: SourceReference[] = [];
  const voiceSessions: VoiceSession[] = [];
  const approvals: SharingApproval[] = [];
  const doctorReviews: DoctorReview[] = [];

  for (const def of ENTRY_DEFS) {
    const g = entryNumber(def.key);
    const entryId = entryIdOf(def.key);
    const patientId = patientOf(def.patient);
    const occurred = occurredMs(def);
    const occurredAt = iso(occurred);
    const isVoice = def.source === "voice";
    const body = isVoice && def.voice ? def.voice.patient.join(" ") : (def.body ?? "");
    const createdAt = iso(occurred + (isVoice ? 4 : 2) * MIN);
    const decidedMs = occurred + (20 + (g % 5) * 5) * MIN;
    const decided = def.status !== "pending_review";
    const decidedAt = iso(decidedMs);

    let sourceRefId: string | null = null;
    let voiceSessionId: string | null = null;

    if (isVoice && def.voice) {
      voiceSessionId = fixedId("60000000", g);
      sourceRefId = fixedId("50000000", g);
      voiceSessions.push({
        id: voiceSessionId,
        patientId,
        mode: "simulated",
        status: "completed",
        externalConversationId: null,
        // Same rule as live check-ins: no call transcript is kept once the entry exists.
        transcript: [],
        confirmedNotes: [],
        startedAt: occurredAt,
        endedAt: iso(occurred + 3 * MIN),
        journalEntryId: entryId,
      });
      sourceRefs.push({
        id: sourceRefId,
        patientId,
        provider: "elevenlabs",
        mode: "simulated",
        externalId: `sim-checkin-${def.key}`,
        title: "Simulated voice check-in",
        excerpt: null,
        sourceTimestamp: occurredAt,
        retrievedAt: createdAt,
        metadata: { transcriptSource: "simulated" },
      });
    } else if (def.source === "vexo" && def.vexo) {
      sourceRefId = fixedId("50000000", g);
      sourceRefs.push({
        id: sourceRefId,
        patientId,
        provider: "vexo",
        mode: "mock",
        externalId: def.vexo.externalId,
        title: def.vexo.title,
        excerpt: null,
        sourceTimestamp: occurredAt,
        retrievedAt: createdAt,
        metadata: { tool: "search", query: def.vexo.query, mcpServer: MCP_SERVER, trimmed: false },
      });
    }

    entries.push({
      id: entryId,
      patientId,
      source: def.source,
      body,
      occurredAt,
      createdAt,
      updatedAt: decided ? decidedAt : createdAt,
      reviewStatus: def.status,
      reviewedByPatientAt: decided ? decidedAt : null,
      processingStatus: "processed",
      processingError: null,
      sourceRefId,
      voiceSessionId,
      editedByPatient: false,
      privacyFilter: def.privacyFilter
        ? { provider: "mock", model: null, ...def.privacyFilter, filteredAt: createdAt }
        : null,
    });

    def.obs.forEach((o, j) => {
      observations.push({
        id: fixedId("40000000", g * 10 + j + 1),
        patientId,
        journalEntryId: entryId,
        category: o.c,
        label: o.l,
        bodySite: o.site ?? null,
        patientQuote: o.q,
        observedAt: o.noTime ? null : occurredAt,
        timeDescription: o.td ?? null,
        severity: o.sev ? o.sev[0] : null,
        severityText: o.sev ? o.sev[1] : null,
        measureValue: o.m ? o.m[0] : null,
        measureUnit: o.m ? o.m[1] : null,
        context: o.ctx ?? [],
        uncertainties: o.unc ?? [],
        status: "active",
        editedByPatient: false,
        extractedBy: "mock",
        model: null,
        createdAt,
        updatedAt: createdAt,
      });
    });

    if (decided) {
      approvals.push({
        id: fixedId("80000000", g),
        patientId,
        journalEntryId: entryId,
        decision: def.status === "approved" ? "approved" : "rejected",
        decidedBy: userOf(def.patient),
        decidedAt,
        note: def.note ?? null,
      });
    }

    if (def.status === "approved") {
      const parkReviewed = !PARK_UNREVIEWED.has(def.key);
      if (parkReviewed) {
        doctorReviews.push({
          id: fixedId("90000000", g),
          doctorId: DEMO_IDS.users.drPark,
          patientId,
          journalEntryId: entryId,
          reviewedAt: iso(decidedMs + (3 + (g % 3)) * 60 * MIN),
        });
      }
      if (BELL_REVIEWED.has(def.key)) {
        doctorReviews.push({
          id: fixedId("90000000", 100 + g),
          doctorId: DEMO_IDS.users.drBell,
          patientId,
          journalEntryId: entryId,
          reviewedAt: iso(decidedMs + 5 * 60 * MIN),
        });
      }
    }
  }

  // Summaries -----------------------------------------------------------------
  const summaryNumber: Record<PatientKey, number> = { maya: 1, daniel: 3, priya: 5 };
  const toItems = (defs: ItemDef[]): SummaryItem[] =>
    defs.map(([text, keys]) => ({ text, citations: keys.map(entryIdOf) }));

  const summaries: GeneratedSummary[] = SUMMARY_DEFS.map((s) => {
    const sourceDefs = ENTRY_DEFS.filter(
      (e) =>
        e.patient === s.patient &&
        (s.audience === "clinician" ? e.status === "approved" : e.status !== "rejected"),
    );
    const content: SummaryContent = {
      overview: s.overview,
      mainConcerns: toItems(s.mainConcerns),
      changesSinceEarlier: toItems(s.changesSinceEarlier),
      recoveryActivities: toItems(s.recoveryActivities),
      patientQuestions: toItems(s.patientQuestions),
      dataGaps: s.dataGaps,
    };
    return {
      id: fixedId("70000000", summaryNumber[s.patient] + (s.audience === "clinician" ? 1 : 0)),
      patientId: patientOf(s.patient),
      audience: s.audience,
      periodStart: iso(nowMs - 7 * DAY),
      periodEnd: iso(nowMs),
      content,
      sourceEntryIds: sourceDefs.map((e) => entryIdOf(e.key)),
      generatedBy: "mock",
      model: null,
      createdAt: iso(nowMs - (s.audience === "clinician" ? 15 : 5) * MIN),
      supersededAt: null,
    };
  });

  // AI usage ------------------------------------------------------------------
  // Payer = the doctor of the patient's earliest assignment (createdAt asc, then id asc).
  const payerOf = (patientId: string): string | null =>
    [...assignments]
      .filter((a) => a.patientId === patientId)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id))[0]?.doctorId ?? null;

  const usageRecords: AiUsageRecord[] = [];
  const pushUsage = (
    n: number,
    base: Pick<AiUsageRecord, "patientId" | "operation" | "journalEntryId" | "triggeredByUserId" | "occurredAt">,
    kind: string,
    promptText: string,
    outputText: string,
  ): void => {
    const event = estimatedUsageEvent(kind, "mock", null, promptText, outputText);
    usageRecords.push({
      id: fixedId("b0000000", n),
      ...base,
      billingDoctorId: payerOf(base.patientId),
      triggeredBy: "patient",
      provider: event.provider,
      model: event.model,
      inputTokens: event.inputTokens,
      outputTokens: event.outputTokens,
      totalTokens: event.totalTokens,
      tokenSource: event.tokenSource,
      rateMicrosPer1k: DEFAULT_RATE_MICROS_PER_1K,
      amountMicros: usageAmountMicros(event.totalTokens, DEFAULT_RATE_MICROS_PER_1K),
      billingStatus: "not_billed",
      billingMode: null,
      billingError: null,
      billedAt: null,
      createdAt: base.occurredAt,
    });
  };

  for (const entry of entries) {
    const def = ENTRY_DEFS.find((d) => entryIdOf(d.key) === entry.id);
    const owner = patients.find((p) => p.id === entry.patientId)?.userId ?? null;
    pushUsage(
      entryNumber(def?.key ?? "m0"),
      {
        patientId: entry.patientId,
        operation: "entry_extraction",
        journalEntryId: entry.id,
        triggeredByUserId: owner,
        occurredAt: entry.createdAt,
      },
      "observation_extraction",
      `${EXTRACTOR_SYSTEM_PROMPT}\n${buildExtractorUserPrompt({
        id: entry.id,
        source: entry.source,
        body: entry.body,
        occurredAt: entry.occurredAt,
      })}`,
      JSON.stringify({ observations: observations.filter((o) => o.journalEntryId === entry.id) }),
    );
  }

  summaries.forEach((summary, i) => {
    const owner = patients.find((p) => p.id === summary.patientId)?.userId ?? null;
    const sourceBodies = summary.sourceEntryIds
      .map((id) => entries.find((e) => e.id === id)?.body ?? "")
      .join("\n");
    pushUsage(
      100 + i,
      {
        patientId: summary.patientId,
        operation: summary.audience === "clinician" ? "clinician_summary" : "patient_summary",
        journalEntryId: null,
        triggeredByUserId: owner,
        occurredAt: summary.createdAt,
      },
      "recovery_summary",
      `${SUMMARIZER_SYSTEM_PROMPT}\n${sourceBodies}`,
      JSON.stringify(summary.content),
    );
  });

  return { profiles, patients, assignments, entries, observations, sourceRefs, voiceSessions, summaries, approvals, doctorReviews, usageRecords };
}

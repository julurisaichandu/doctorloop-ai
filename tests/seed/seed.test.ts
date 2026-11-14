import { describe, expect, it } from "vitest";
import { usageAmountMicros } from "../../src/lib/billing/money";
import { buildSeedData, DEMO_ACCOUNTS, DEMO_IDS } from "../../src/lib/demo/seed";

const NOW = new Date("2026-11-13T00:20:00.000Z");
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

describe("seed data", () => {
  // Use an early-morning "now" to stress ordering and future-timestamp rules.
  const data = buildSeedData(NOW);
  const entryById = new Map(data.entries.map((e) => [e.id, e]));

  it("has unique, valid UUIDs", () => {
    const all = [
      ...data.profiles, ...data.patients, ...data.assignments, ...data.entries, ...data.observations,
      ...data.sourceRefs, ...data.voiceSessions, ...data.summaries, ...data.approvals, ...data.doctorReviews, ...data.usageRecords,
    ].map((r) => r.id);
    expect(new Set(all).size).toBe(all.length);
    for (const id of all) expect(id).toMatch(UUID);
    expect(DEMO_ACCOUNTS).toHaveLength(5);
  });

  it("has 7-9 entries per patient with required statuses", () => {
    for (const pid of Object.values(DEMO_IDS.patients)) {
      const n = data.entries.filter((e) => e.patientId === pid).length;
      expect(n).toBeGreaterThanOrEqual(7);
      expect(n).toBeLessThanOrEqual(9);
    }
    const status = (pid: string, s: string) => data.entries.filter((e) => e.patientId === pid && e.reviewStatus === s).length;
    expect(status(DEMO_IDS.patients.maya, "pending_review")).toBe(1);
    expect(status(DEMO_IDS.patients.daniel, "pending_review")).toBe(0);
    expect(status(DEMO_IDS.patients.priya, "rejected")).toBe(1);
    expect(status(DEMO_IDS.patients.priya, "pending_review")).toBe(1);
  });

  it("observation quotes are verbatim and severity/measures are explicit", () => {
    expect(data.observations.length).toBeGreaterThan(50);
    for (const o of data.observations) {
      const entry = entryById.get(o.journalEntryId);
      expect(entry, o.id).toBeDefined();
      expect(entry?.body.includes(o.patientQuote), `${o.id}: ${o.patientQuote}`).toBe(true);
      expect(entry?.patientId).toBe(o.patientId);
      if (o.severity !== null) {
        expect(o.severityText).not.toBeNull();
        expect(o.patientQuote).toContain(String(o.severity));
        expect(o.patientQuote).toContain(o.severityText ?? "");
      } else {
        expect(o.severityText).toBeNull();
      }
      if (o.measureValue !== null) {
        expect(o.measureUnit).not.toBeNull();
        expect(o.patientQuote).toContain(String(o.measureValue));
      }
      expect(o.status).toBe("active");
      expect(o.extractedBy).toBe("mock");
    }
  });

  it("summary citations reference same-patient entries; clinician summaries use approved only", () => {
    expect(data.summaries).toHaveLength(6);
    for (const s of data.summaries) {
      const c = s.content;
      const items = [...c.mainConcerns, ...c.changesSinceEarlier, ...c.recoveryActivities, ...c.patientQuestions];
      for (const item of items) {
        expect(item.citations.length).toBeGreaterThan(0);
        for (const id of item.citations) {
          const e = entryById.get(id);
          expect(e?.patientId).toBe(s.patientId);
          expect(s.sourceEntryIds).toContain(id);
          if (s.audience === "clinician") expect(e?.reviewStatus).toBe("approved");
          else expect(e?.reviewStatus).not.toBe("rejected");
        }
      }
      for (const id of s.sourceEntryIds) {
        const e = entryById.get(id);
        expect(e?.patientId).toBe(s.patientId);
        if (s.audience === "clinician") expect(e?.reviewStatus).toBe("approved");
      }
      expect(s.generatedBy).toBe("mock");
      expect(s.model).toBeNull();
    }
  });

  it("voice entries link to completed sessions that keep no transcript text", () => {
    const voice = data.entries.filter((e) => e.source === "voice");
    expect(voice.length).toBeGreaterThan(0);
    for (const e of voice) {
      const session = data.voiceSessions.find((v) => v.id === e.voiceSessionId);
      expect(session).toBeDefined();
      expect(session?.journalEntryId).toBe(e.id);
      expect(session?.mode).toBe("simulated");
      expect(session?.status).toBe("completed");
      // Data minimisation: like live check-ins, only the entry body is kept.
      expect(session?.transcript).toEqual([]);
      expect(session?.confirmedNotes).toEqual([]);
      expect(e.body.length).toBeGreaterThan(0);
      const ref = data.sourceRefs.find((r) => r.id === e.sourceRefId);
      expect(ref?.provider).toBe("elevenlabs");
      expect(ref?.mode).toBe("simulated");
    }
  });

  it("source references carry no free text and expose whitelisted provenance only", () => {
    for (const ref of data.sourceRefs) expect(ref.excerpt).toBeNull();
    for (const ref of data.sourceRefs.filter((r) => r.provider === "elevenlabs")) {
      expect(ref.metadata).toEqual({ transcriptSource: "simulated" });
    }
    for (const ref of data.sourceRefs.filter((r) => r.provider === "vexo")) {
      expect(ref.metadata).toMatchObject({ trimmed: false });
    }
    for (const s of data.summaries) expect(s.supersededAt ?? null).toBeNull();
  });

  it("schedules appointments at local wall-clock times", () => {
    const times = data.patients.map((p) => {
      const d = new Date(p.nextAppointmentAt ?? "");
      return [d.getHours(), d.getMinutes()];
    });
    expect(times).toEqual([[10, 30], [14, 0], [9, 15]]);
  });

  it("vexo entries link to a mock vexo source reference", () => {
    const vexo = data.entries.filter((e) => e.source === "vexo");
    expect(vexo.length).toBeGreaterThan(0);
    for (const e of vexo) {
      const ref = data.sourceRefs.find((r) => r.id === e.sourceRefId);
      expect(ref?.provider).toBe("vexo");
      expect(ref?.mode).toBe("mock");
      expect(ref?.excerpt).toBeNull();
      expect(ref?.sourceTimestamp).toBe(e.occurredAt);
      expect(ref?.metadata).toMatchObject({ tool: "search", mcpServer: "https://api.vexoai.com/mcp" });
    }
  });

  it("has no timestamps in the future", () => {
    const limit = NOW.getTime();
    const stamps: string[] = [];
    for (const e of data.entries) stamps.push(e.occurredAt, e.createdAt, e.updatedAt, ...(e.reviewedByPatientAt ? [e.reviewedByPatientAt] : []));
    for (const o of data.observations) stamps.push(o.createdAt, ...(o.observedAt ? [o.observedAt] : []));
    for (const r of data.sourceRefs) stamps.push(r.retrievedAt);
    for (const v of data.voiceSessions) stamps.push(v.startedAt, ...(v.endedAt ? [v.endedAt] : []), ...v.transcript.flatMap((t) => (t.at ? [t.at] : [])));
    for (const s of data.summaries) stamps.push(s.createdAt, s.periodEnd);
    for (const a of data.approvals) stamps.push(a.decidedAt);
    for (const r of data.doctorReviews) stamps.push(r.reviewedAt);
    for (const s of stamps) expect(new Date(s).getTime()).toBeLessThanOrEqual(limit);
  });

  it("orders entries chronologically within each patient and spans six days", () => {
    for (const ids of Object.values(DEMO_IDS.entries)) {
      const times = ids.map((id) => new Date(entryById.get(id)?.occurredAt ?? "").getTime());
      expect([...times].sort((a, b) => a - b)).toEqual(times);
      expect(NOW.getTime() - times[0]).toBeLessThanOrEqual(7 * 24 * 3600_000);
    }
  });

  it("assigns Dr. Bell only to Priya", () => {
    const bell = data.assignments.filter((a) => a.doctorId === DEMO_IDS.users.drBell);
    expect(bell.map((a) => a.patientId)).toEqual([DEMO_IDS.patients.priya]);
    const park = data.assignments.filter((a) => a.doctorId === DEMO_IDS.users.drPark);
    expect(park).toHaveLength(3);
    for (const r of data.doctorReviews.filter((r) => r.doctorId === DEMO_IDS.users.drBell)) {
      expect(r.patientId).toBe(DEMO_IDS.patients.priya);
    }
  });

  it("records approvals and doctor reviews consistently", () => {
    for (const e of data.entries) {
      const a = data.approvals.filter((x) => x.journalEntryId === e.id);
      expect(a).toHaveLength(e.reviewStatus === "pending_review" ? 0 : 1);
      for (const x of a) {
        expect(x.decidedBy).toBe(data.patients.find((p) => p.id === e.patientId)?.userId);
        expect(x.decision).toBe(e.reviewStatus);
      }
    }
    for (const r of data.doctorReviews) expect(entryById.get(r.journalEntryId)?.reviewStatus).toBe("approved");
    const unreviewedPark = (pid: string) =>
      data.entries.filter(
        (e) => e.patientId === pid && e.reviewStatus === "approved" &&
          !data.doctorReviews.some((r) => r.doctorId === DEMO_IDS.users.drPark && r.journalEntryId === e.id),
      ).length;
    expect(unreviewedPark(DEMO_IDS.patients.maya)).toBe(2);
    expect(unreviewedPark(DEMO_IDS.patients.daniel)).toBe(1);
    expect(unreviewedPark(DEMO_IDS.patients.priya)).toBe(1);
  });

  it("seeds one estimated, not-billed usage record per entry and per summary, billed to Dr. Park", () => {
    expect(data.usageRecords).toHaveLength(data.entries.length + data.summaries.length);
    for (const r of data.usageRecords) {
      expect(r.billingDoctorId).toBe(DEMO_IDS.users.drPark);
      expect(r.billingStatus).toBe("not_billed");
      expect(r.tokenSource).toBe("estimated");
      expect(r.totalTokens).toBe(r.inputTokens + r.outputTokens);
      expect(r.totalTokens).toBeGreaterThan(0);
      expect(r.amountMicros).toBe(usageAmountMicros(r.totalTokens, r.rateMicrosPer1k));
      expect(r.billingMode).toBeNull();
      expect(r.billedAt).toBeNull();
    }
    for (const e of data.entries) {
      const r = data.usageRecords.find((u) => u.journalEntryId === e.id);
      expect(r?.operation).toBe("entry_extraction");
      expect(r?.occurredAt).toBe(e.createdAt);
    }
    for (const s of data.summaries) {
      const r = data.usageRecords.find((u) => u.journalEntryId === null && u.occurredAt === s.createdAt && u.patientId === s.patientId);
      expect(r?.operation).toBe(s.audience === "clinician" ? "clinician_summary" : "patient_summary");
    }
  });

  it("is deterministic for a fixed date and uses example.com emails", () => {
    expect(buildSeedData(NOW)).toEqual(buildSeedData(new Date(NOW.getTime())));
    for (const p of data.profiles) expect(p.email.endsWith("@example.com")).toBe(true);
    expect(buildSeedData(new Date("2026-11-13T15:00:00.000Z")).entries.every((e) => e.occurredAt <= "2026-11-13T15:00:00.000Z")).toBe(true);
  });
});

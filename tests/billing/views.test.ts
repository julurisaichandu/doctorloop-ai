import { describe, expect, it } from "vitest";
import { STATEMENT_CSV_HEADER, escapeCsvCell, statementFilename, statementToCsv } from "@/lib/billing/csv";
import { currentMonth, last30Days } from "@/lib/billing/period";
import { parseStatementRange, privateBucket } from "@/lib/billing/statement-range";
import {
  PRIVATE_LINE_LABEL,
  engineLabel,
  formatUtcDate,
  formatUtcStamp,
  isItemized,
  itemizedRecordIds,
  summarizeUsage,
  toUsageLine,
} from "@/lib/billing/views";
import type { AiUsageRecord, PatientUsageStatement } from "@/lib/domain/types";

const record = (over: Partial<AiUsageRecord> = {}): AiUsageRecord => ({
  id: "r1",
  patientId: "p1",
  billingDoctorId: "d1",
  operation: "entry_extraction",
  triggeredBy: "patient",
  triggeredByUserId: null,
  journalEntryId: "e1",
  provider: "mock",
  model: null,
  inputTokens: 600,
  outputTokens: 400,
  totalTokens: 1000,
  tokenSource: "estimated",
  rateMicrosPer1k: 10_000,
  amountMicros: 10_000,
  billingStatus: "not_billed",
  billingMode: null,
  billingError: null,
  billedAt: null,
  occurredAt: "2026-11-10T10:00:00.000Z",
  createdAt: "2026-11-10T10:00:00.000Z",
  ...over,
});

describe("isItemized", () => {
  const shared = new Set(["e1"]);
  it("itemizes pre-visit summaries and extraction of shared entries only", () => {
    expect(isItemized({ operation: "clinician_summary", journalEntryId: null }, shared)).toBe(true);
    expect(isItemized({ operation: "entry_extraction", journalEntryId: "e1" }, shared)).toBe(true);
    expect(isItemized({ operation: "entry_extraction", journalEntryId: "e2" }, shared)).toBe(false);
    expect(isItemized({ operation: "entry_extraction", journalEntryId: null }, shared)).toBe(false);
    expect(isItemized({ operation: "patient_summary", journalEntryId: null }, shared)).toBe(false);
    expect(isItemized({ operation: "privacy_filter", journalEntryId: "e1" }, shared)).toBe(false);
  });
});

describe("summarizeUsage", () => {
  it("sums tokens and splits billed from everything else", () => {
    const totals = summarizeUsage(
      [
        record({ id: "a", billingStatus: "billed", billingMode: "simulated" }),
        record({ id: "b", billingStatus: "pending", tokenSource: "provider" }),
        record({ id: "c", billingStatus: "sync_failed" }),
        record({ id: "d" }),
      ],
      "simulated",
    );
    expect(totals).toEqual({
      runs: 4,
      inputTokens: 2400,
      outputTokens: 1600,
      totalTokens: 4000,
      billedMicros: 10_000,
      notBilledMicros: 30_000,
      estimatedRuns: 3,
      failedSyncs: 1,
    });
  });
  it("maps a record to a line with labels", () => {
    const line = toUsageLine(record({ operation: "clinician_summary" }), "Maya", "simulated");
    expect(line).toMatchObject({
      activity: "clinician_summary",
      activityLabel: "Pre-visit summary",
      patientName: "Maya",
      billingLabel: "Not billed",
    });
  });

  it("counts usage billed in the other mode as not billed and labels the line", () => {
    const stripeBilled = record({ id: "s", billingStatus: "billed", billingMode: "stripe" });
    const simBilled = record({ id: "m", billingStatus: "billed", billingMode: "simulated" });
    const inSim = summarizeUsage([stripeBilled, simBilled], "simulated");
    expect(inSim).toMatchObject({ billedMicros: 10_000, notBilledMicros: 10_000 });
    const inStripe = summarizeUsage([stripeBilled, simBilled], "stripe");
    expect(inStripe).toMatchObject({ billedMicros: 10_000, notBilledMicros: 10_000 });
    expect(toUsageLine(stripeBilled, "M", "simulated").billingLabel).toBe("Billed (Stripe)");
    expect(toUsageLine(simBilled, "M", "stripe").billingLabel).toBe("Billed (simulated)");
    expect(toUsageLine(simBilled, "M", "simulated").billingLabel).toBe("Billed");
  });
});

describe("itemizedRecordIds", () => {
  it("itemizes only the newest extraction record per entry; older ones stay private", () => {
    const shared = new Set(["e1", "e2"]);
    const older = record({ id: "a", journalEntryId: "e1", occurredAt: "2026-11-10T10:00:00.000Z" });
    const newer = record({ id: "b", journalEntryId: "e1", occurredAt: "2026-11-10T11:00:00.000Z" });
    const tieLow = record({ id: "c", journalEntryId: "e2", occurredAt: "2026-11-10T12:00:00.000Z" });
    const tieHigh = record({ id: "d", journalEntryId: "e2", occurredAt: "2026-11-10T12:00:00.000Z" });
    const summary = record({ id: "s", operation: "clinician_summary", journalEntryId: null });
    const unshared = record({ id: "u", journalEntryId: "e3" });
    const ids = itemizedRecordIds([older, newer, tieLow, tieHigh, summary, unshared], shared);
    expect([...ids].sort()).toEqual(["b", "d", "s"]);
  });
});

describe("statement formatting helpers", () => {
  it("formats UTC stamps and engines", () => {
    expect(formatUtcStamp("2026-11-10T10:05:00.000Z")).toBe("2026-11-10 10:05 UTC");
    expect(formatUtcDate("2026-11-10T10:05:00.000Z")).toBe("2026-11-10");
    expect(engineLabel("openai", "gpt-x")).toBe("OpenAI · gpt-x");
    expect(engineLabel("mock", null)).toBe("Mock (rule-based)");
  });
});

describe("parseStatementRange", () => {
  const now = new Date("2026-11-14T12:00:00.000Z");
  it("falls back to the last 30 days for invalid input", () => {
    expect(parseStatementRange({ from: "abc" }, now)).toEqual(last30Days(now));
    expect(parseStatementRange({ from: "2026-02-30", to: "2026-03-01" }, now)).toEqual(last30Days(now));
    expect(parseStatementRange({}, now)).toEqual(last30Days(now));
  });
  it("covers whole UTC days and swaps reversed ranges", () => {
    expect(parseStatementRange({ from: "2026-11-01", to: "2026-11-10" }, now)).toEqual({
      start: "2026-11-01T00:00:00.000Z",
      end: "2026-11-10T23:59:59.999Z",
    });
    expect(parseStatementRange({ from: "2026-11-10", to: "2026-11-01" }, now)).toEqual({
      start: "2026-11-01T00:00:00.000Z",
      end: "2026-11-10T23:59:59.999Z",
    });
  });
  it("caps the span at 366 days ending at `to`", () => {
    const range = parseStatementRange({ from: "2021-11-01", to: "2026-11-10" }, now);
    expect(range.end).toBe("2026-11-10T23:59:59.999Z");
    expect(Date.parse(range.end) - Date.parse(range.start)).toBe(366 * 86_400_000);
  });
  it("caps a future `to` at now", () => {
    expect(parseStatementRange({ from: "2026-11-01", to: "2027-01-01" }, now).end).toBe(now.toISOString());
  });
});

describe("privateBucket / currentMonth", () => {
  const now = new Date("2026-11-14T12:00:00.000Z");
  it("buckets a mid-month day into the whole month, capped at now", () => {
    expect(privateBucket({ start: "2026-11-05T00:00:00.000Z", end: "2026-11-05T23:59:59.999Z" }, now)).toEqual({
      start: "2026-11-01T00:00:00.000Z",
      end: now.toISOString(),
    });
  });
  it("covers every month a range touches", () => {
    const later = new Date("2026-12-20T00:00:00.000Z");
    expect(privateBucket({ start: "2026-10-20T00:00:00.000Z", end: "2026-11-03T23:59:59.999Z" }, later)).toEqual({
      start: "2026-10-01T00:00:00.000Z",
      end: "2026-11-30T23:59:59.999Z",
    });
    expect(privateBucket({ start: "2026-10-20T00:00:00.000Z", end: "2026-11-03T23:59:59.999Z" }, now)).toEqual({
      start: "2026-10-01T00:00:00.000Z",
      end: now.toISOString(),
    });
  });
  it("currentMonth starts on the 1st at midnight UTC", () => {
    expect(currentMonth(now)).toEqual({ start: "2026-11-01T00:00:00.000Z", end: now.toISOString() });
  });
});

describe("csv", () => {
  it("escapes formulas, commas and quotes", () => {
    expect(escapeCsvCell("=SUM(A1)")).toBe("'=SUM(A1)");
    expect(escapeCsvCell("@x")).toBe("'@x");
    expect(escapeCsvCell('a,"b"')).toBe('"a,""b"""');
    expect(escapeCsvCell("plain")).toBe("plain");
  });

  const totals = {
    runs: 2, inputTokens: 100, outputTokens: 50, totalTokens: 150,
    billedMicros: 0, notBilledMicros: 1500, estimatedRuns: 2, failedSyncs: 0,
  };
  const statement: PatientUsageStatement = {
    doctor: { name: "Dr. Park", title: null },
    patient: { id: "abcdef12-0000", ref: "ABCDEF12", name: "Maya O'Neil, Jr.", dateOfBirth: null },
    period: { start: "2026-11-01T00:00:00.000Z", end: "2026-11-10T23:59:59.999Z" },
    rateMicrosPer1k: 10_000,
    mode: "simulated",
    lines: [toUsageLine(record(), "Maya O'Neil, Jr.", "simulated")],
    privateTotal: totals,
    totals,
    generatedAt: "2026-11-14T00:00:00.000Z",
    privatePeriod: { start: "2026-11-01T00:00:00.000Z", end: "2026-11-14T12:00:00.000Z" },
  };

  it("writes header, rows and a private row", () => {
    const rows = statementToCsv(statement).split("\n");
    expect(rows[0]).toBe(STATEMENT_CSV_HEADER);
    expect(rows).toHaveLength(3);
    expect(rows[1]).toContain('"Maya O\'Neil, Jr."');
    const last = rows[rows.length - 1];
    expect(last.startsWith("2026-11-01..2026-11-14,")).toBe(true);
    expect(last).toContain(PRIVATE_LINE_LABEL);
    expect(last).toContain(",estimated,0.0100,0.0015,Not billed");
  });

  it("names the file after the patient and range", () => {
    expect(statementFilename(statement)).toBe("doctorloop-usage-maya-o-neil-jr-2026-11-01-2026-11-10.csv");
  });
});

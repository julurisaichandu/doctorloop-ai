import { describe, expect, it } from "vitest";
import { buildTimeline, type TimelineObservationInput } from "@/lib/ai/timeline";

/** ISO instant for a LOCAL calendar time, so day bucketing tests are timezone-independent. */
const local = (day: number, hour: number) => new Date(2026, 10, day, hour).toISOString();
const entry = (id: string, occurredAt: string) => ({ id, occurredAt });

function obs(
  id: string,
  journalEntryId: string,
  partial: Partial<TimelineObservationInput> = {},
): TimelineObservationInput {
  return {
    id,
    journalEntryId,
    category: "symptom",
    label: "Knee discomfort",
    bodySite: "right knee",
    observedAt: null,
    severity: null,
    measureValue: null,
    measureUnit: null,
    ...partial,
  };
}

const INTERPRETATION = /worsen|improv|concern|worr|better|deteriorat|alarm|risk|serious|urgent/i;

describe("buildTimeline", () => {
  const entries = [
    entry("e1", local(7, 10)),
    entry("e2", local(10, 10)),
    entry("e3", local(13, 10)),
  ];

  it("describes an explicit 3 to 7 increase neutrally", () => {
    const result = buildTimeline(entries, [
      obs("o1", "e1", { severity: 3 }),
      obs("o2", "e2", { severity: 5, label: "Knee pain" }),
      obs("o3", "e3", { severity: 7 }),
    ]);
    expect(result.series).toHaveLength(1);
    expect(result.series[0].key).toBe("severity:knee discomfort");
    expect(result.series[0].points.map((p) => p.value)).toEqual([3, 5, 7]);
    expect(result.changes).toHaveLength(1);
    expect(result.changes[0]).toMatchObject({ direction: "increased", kind: "severity" });
    expect(result.changes[0].description).toBe("Self-reported knee discomfort went from 3/10 (Nov 7) to 7/10 (Nov 13); reported values ranged 3\u20137/10 across 3 updates.");
    expect(result.changes[0].description).not.toMatch(INTERPRETATION);
  });

  it("keeps the latest value per day", () => {
    const result = buildTimeline(
      [entry("e1", local(7, 8)), entry("e2", local(7, 20)), entry("e3", local(9, 9))],
      [obs("o1", "e1", { severity: 2 }), obs("o2", "e2", { severity: 6 }), obs("o3", "e3", { severity: 4 })],
    );
    expect(result.series[0].points).toEqual([
      { date: "2026-11-07", value: 6, entryId: "e2", observationId: "o2" },
      { date: "2026-11-09", value: 4, entryId: "e3", observationId: "o3" },
    ]);
    expect(result.changes[0].direction).toBe("decreased");
  });

  it("uses observedAt for the day bucket when available", () => {
    const result = buildTimeline(
      [entry("e1", local(13, 9))],
      [obs("o1", "e1", { severity: 4, observedAt: local(12, 9) })],
    );
    expect(result.series[0].points[0].date).toBe("2026-11-12");
    expect(result.days.map((d) => d.date)).toEqual(["2026-11-12", "2026-11-13"]);
    expect(result.days[1].entryIds).toEqual(["e1"]);
  });

  it("builds measure series by label and unit with unit folding", () => {
    const result = buildTimeline(entries, [
      obs("o1", "e1", { category: "sleep", label: "Sleep", measureValue: 7, measureUnit: "hours" }),
      obs("o2", "e2", { category: "sleep", label: "Sleep", measureValue: 5, measureUnit: "hrs" }),
      obs("o3", "e3", { category: "sleep", label: "Sleep", measureValue: 4, measureUnit: "hours" }),
      obs("o4", "e3", { category: "mobility", label: "Walking", measureValue: 20, measureUnit: "minutes" }),
    ]);
    const sleep = result.series.find((s) => s.key === "measure:sleep:hours");
    expect(sleep?.label).toBe("Sleep (hours)");
    expect(sleep?.points).toHaveLength(3);
    expect(result.changes[0].description).toBe("Self-reported sleep went from 7 hours (Nov 7) to 4 hours (Nov 13); reported values ranged 4\u20137 hours across 3 updates.");
    // A single point does not produce a change.
    expect(result.changes.some((c) => c.seriesKey.includes("walking"))).toBe(false);
  });

  it("keeps only the four longest series and never interprets", () => {
    const labels = ["Knee pain", "Fatigue", "Stiffness", "Headache", "Nausea"];
    const observations = labels.flatMap((label, i) =>
      entries.slice(0, i === 4 ? 2 : 3).map((e, j) => obs(`${label}-${j}`, e.id, { label, severity: j + 1 })),
    );
    const result = buildTimeline(entries, observations);
    expect(result.series).toHaveLength(4);
    expect(result.series.map((s) => s.key)).not.toContain("severity:nausea");
    for (const change of result.changes) expect(change.description).not.toMatch(INTERPRETATION);
  });

  it("surfaces the peak when a series goes 3 -> 6 -> 4", () => {
    const five = [7, 9, 10, 11, 13].map((d, i) => entry(`x${i}`, local(d, 10)));
    const result = buildTimeline(
      five,
      [3, 5, 6, 5, 4].map((severity, i) => obs(`p${i}`, `x${i}`, { severity })),
    );
    expect(result.changes[0].description).toBe(
      "Self-reported knee discomfort went from 3/10 (Nov 7) to 4/10 (Nov 13); reported values ranged 3\u20136/10 across 5 updates.",
    );
    expect(result.changes[0].description).not.toMatch(INTERPRETATION);
  });

  it("omits the range for two-point series", () => {
    const result = buildTimeline(entries, [obs("o1", "e1", { severity: 3 }), obs("o2", "e3", { severity: 6 })]);
    expect(result.changes[0].description).toBe("Self-reported knee discomfort went from 3/10 (Nov 7) to 6/10 (Nov 13).");
  });

  it("buckets days by the local calendar day", () => {
    const result = buildTimeline([entry("e1", new Date(2026, 10, 7, 23, 30).toISOString())], []);
    expect(result.days.map((d) => d.date)).toEqual(["2026-11-07"]);
  });

  it("reports an unchanged series without direction words", () => {
    const result = buildTimeline(entries, [obs("o1", "e1", { severity: 5 }), obs("o2", "e3", { severity: 5 })]);
    expect(result.changes[0].direction).toBe("unchanged");
    expect(result.changes[0].description).toBe("Self-reported knee discomfort was 5/10 (Nov 7) and again 5/10 (Nov 13).");
  });
});

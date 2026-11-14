import { describe, expect, it } from "vitest";
import { summarizeMock } from "@/lib/ai/mock/summarizer";
import { buildTimeline } from "@/lib/ai/timeline";
import type { SummarizerInput, SummaryObservationInput } from "@/lib/ai/types";

const local = (day: number, hour: number) => new Date(2026, 10, day, hour).toISOString();
const days = [7, 9, 10, 11, 13];
const entries = days.map((d, i) => ({ id: `e${i}`, source: "manual" as const, body: "x", occurredAt: local(d, 10) }));

function obs(i: number, partial: Partial<SummaryObservationInput> = {}): SummaryObservationInput {
  return {
    id: `o${i}`,
    journalEntryId: `e${i}`,
    category: "symptom",
    label: "Knee discomfort",
    bodySite: "knee",
    patientQuote: "q",
    observedAt: null,
    timeDescription: null,
    severity: null,
    severityText: null,
    measureValue: null,
    measureUnit: null,
    context: [],
    uncertainties: [],
    ...partial,
  };
}

function input(observations: SummaryObservationInput[], audience: "patient" | "clinician" = "clinician"): SummarizerInput {
  return {
    audience,
    patientFirstName: "Maya",
    patientContext: { procedure: "p", procedureDate: "2026-10-26", recoveryStage: "Week 3" },
    periodStart: local(6, 0),
    periodEnd: local(13, 23),
    entries,
    observations,
    timeline: buildTimeline(entries, observations),
  };
}

describe("mock summarizer", () => {
  const series = [3, 5, 6, 5, 4].map((severity, i) => obs(i, { severity }));

  it("mentions the range for severity series with 3+ points, neutrally", () => {
    for (const audience of ["clinician", "patient"] as const) {
      const summary = summarizeMock(input(series, audience));
      expect(summary.changesSinceEarlier[0].text).toContain("3–6/10 across 5 updates");
      expect(summary.mainConcerns[0].text).toContain("3–6/10 across 5 updates");
      expect(JSON.stringify(summary)).not.toMatch(/worsen|improv|better|risk/i);
    }
  });

  it("does not duplicate context already in the label or text", () => {
    const summary = summarizeMock(
      input([obs(0, { label: "Aching when lying down", context: ["lying down"] }), obs(1, { context: ["after physio"] })]),
    );
    const text = summary.mainConcerns.map((c) => c.text).join(" ");
    expect(text).not.toMatch(/lying down \(lying down\)/i);
    expect(text).toContain("(after physio)");
  });

  it("orders citations chronologically", () => {
    const summary = summarizeMock(input(series));
    expect(summary.mainConcerns[0].citations).toEqual(["e0", "e1", "e2", "e3", "e4"]);
  });
});

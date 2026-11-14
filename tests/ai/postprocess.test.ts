import { describe, expect, it } from "vitest";
import { postprocessObservations, postprocessSummary } from "@/lib/ai/postprocess";
import type { ExtractedObservation } from "@/lib/ai/schemas";
import type { SummaryContent } from "@/lib/domain/types";

const entry = {
  id: "e1",
  body: "My right knee is hurting after physio, really painful.  I slept about 4 hours last night. Is it normal to ache at night?",
};

function observation(partial: Partial<ExtractedObservation> = {}): ExtractedObservation {
  return {
    sourceEntryId: "e1",
    category: "symptom",
    label: "Knee pain",
    bodySite: "right knee",
    patientQuote: "My right knee is hurting after physio, really painful.",
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

describe("postprocessObservations", () => {
  it("removes an invented severity and records the gap", () => {
    const [result] = postprocessObservations(entry, [observation({ severity: 8, severityText: "8 out of 10" })]);
    expect(result.severity).toBeNull();
    expect(result.severityText).toBeNull();
    expect(result.uncertainties).toContain("Intensity not stated");
  });

  it("keeps a severity that the quote states explicitly", () => {
    const body = "My knee is about 7 out of 10 today.";
    const [result] = postprocessObservations(
      { id: "e1", body },
      [observation({ patientQuote: body, severity: 7, severityText: "about 7 out of 10", label: "Knee pain" })],
    );
    expect(result.severity).toBe(7);
  });

  it("rejects a rating that does not match the stated number", () => {
    const body = "My knee is about 7 out of 10 today.";
    const [result] = postprocessObservations({ id: "e1", body }, [observation({ patientQuote: body, severity: 3 })]);
    expect(result.severity).toBeNull();
  });

  it("normalizes whitespace but keeps verbatim quotes", () => {
    const [result] = postprocessObservations(entry, [
      observation({ patientQuote: "I slept about 4 hours last night.", label: "Sleep", category: "sleep" }),
    ]);
    expect(result.patientQuote).toBe("I slept about 4 hours last night.");
  });

  it("replaces a non-verbatim quote with the best matching sentence", () => {
    const [result] = postprocessObservations(entry, [
      observation({ label: "Sleep", category: "sleep", bodySite: null, patientQuote: "The patient slept four hours" }),
    ]);
    expect(result.patientQuote).toBe("I slept about 4 hours last night.");
  });

  it("drops an observation whose quote cannot be repaired", () => {
    const result = postprocessObservations(entry, [
      observation({ label: "Nausea", bodySite: null, patientQuote: "I feel sick to my stomach" }),
    ]);
    expect(result).toEqual([]);
  });

  it("drops measures whose number is not in the quote and invalid dates", () => {
    const [result] = postprocessObservations(entry, [
      observation({
        label: "Sleep",
        category: "sleep",
        bodySite: null,
        patientQuote: "I slept about 4 hours last night.",
        measureValue: 9,
        measureUnit: "hours",
        observedAt: "not-a-date",
      }),
    ]);
    expect(result.measureValue).toBeNull();
    expect(result.measureUnit).toBeNull();
    expect(result.observedAt).toBeNull();
  });

  it("forces the source entry id", () => {
    const [result] = postprocessObservations(entry, [observation({ sourceEntryId: "other" })]);
    expect(result.sourceEntryId).toBe("e1");
  });
});

describe("postprocessSummary", () => {
  const summary: SummaryContent = {
    overview: "Over the past 7 days, Maya shared 3 updates.",
    mainConcerns: [
      { text: "Valid item", citations: ["e1", "ghost", "e1"] },
      { text: "Only invalid citations", citations: ["ghost"] },
    ],
    changesSinceEarlier: [{ text: "No citations at all", citations: [] }],
    recoveryActivities: [{ text: "Walked", citations: ["e2"] }],
    patientQuestions: [],
    dataGaps: ["Intensity not stated for knee pain (Nov 10)", "   "],
  };

  it("removes unknown citations and drops uncited items", () => {
    const result = postprocessSummary(summary, ["e1", "e2"]);
    expect(result.mainConcerns).toEqual([{ text: "Valid item", citations: ["e1"] }]);
    expect(result.changesSinceEarlier).toEqual([]);
    expect(result.recoveryActivities).toEqual([{ text: "Walked", citations: ["e2"] }]);
    expect(result.dataGaps).toEqual(["Intensity not stated for knee pain (Nov 10)"]);
  });

  it("throws when the summary cannot satisfy the schema", () => {
    expect(() => postprocessSummary({ ...summary, overview: "   " }, ["e1"])).toThrow();
  });
});

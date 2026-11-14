import { describe, expect, it } from "vitest";
import { extractObservationsMock } from "@/lib/ai/mock/extractor";
import { ExtractedObservationSchema } from "@/lib/ai/schemas";
import { splitSentences } from "@/lib/ai/text-utils";

const OCCURRED_AT = "2026-11-13T09:00:00.000Z";

function extract(body: string) {
  return extractObservationsMock({ id: "entry-1", source: "manual", body, occurredAt: OCCURRED_AT });
}

describe("mock extractor", () => {
  it("extracts an explicit severity from 'about 7 out of 10'", () => {
    const [knee] = extract("My right knee has been aching, about 7 out of 10 after physio.").filter(
      (o) => o.category === "symptom",
    );
    expect(knee.severity).toBe(7);
    expect(knee.severityText).toBe("about 7 out of 10");
    expect(knee.bodySite).toBe("right knee");
    expect(knee.label).toBe("Knee aching");
    expect(knee.context).toContain("after physio");
    expect(knee.uncertainties).not.toContain("Intensity not stated");
  });

  it.each([
    ["7/10", 7],
    ["a 6 out of 10", 6],
    ["seven out of ten", 7],
  ])("reads the rating in '%s'", (rating, expected) => {
    const symptom = extract(`My knee pain is ${rating} today.`).find((o) => o.category === "symptom");
    expect(symptom?.severity).toBe(expected);
  });

  it("does not invent severity from vague wording", () => {
    const observations = extract("My knee was really painful on the stairs yesterday.");
    const symptom = observations.find((o) => o.category === "symptom");
    expect(symptom).toBeDefined();
    expect(symptom?.severity).toBeNull();
    expect(symptom?.severityText).toBeNull();
    expect(symptom?.uncertainties).toContain("Intensity not stated");
  });

  it("applies a rating in the following sentence to the previous finding", () => {
    const symptom = extract("My knee hurts at night. It is about a 7 out of 10.").find((o) => o.category === "symptom");
    expect(symptom?.severity).toBe(7);
    expect(symptom?.patientQuote).toBe("My knee hurts at night. It is about a 7 out of 10.");
  });

  it("extracts sleep hours and resolves 'last night'", () => {
    const sleep = extract("I only slept about 4 hours last night.").find((o) => o.category === "sleep");
    expect(sleep).toMatchObject({ label: "Sleep", measureValue: 4, measureUnit: "hours", timeDescription: "last night" });
    expect(sleep?.observedAt).toBe(new Date(Date.parse(OCCURRED_AT) - 24 * 3600 * 1000).toISOString());
  });

  it("leaves observedAt null for ambiguous time wording", () => {
    const sleep = extract("Since Tuesday I have slept badly.").find((o) => o.category === "sleep");
    expect(sleep?.timeDescription).toBe("since tuesday");
    expect(sleep?.observedAt).toBeNull();
    expect(sleep?.uncertainties).toContain("Duration not stated");
  });

  it("extracts walking minutes, step counts and mobility aids", () => {
    const observations = extract("I walked 20 minutes this morning with my crutches. Got about 2,000 steps in.");
    const walking = observations.find((o) => o.label === "Walking");
    expect(walking).toMatchObject({ category: "mobility", measureValue: 20, measureUnit: "minutes" });
    expect(walking?.context).toContain("with crutches");
    expect(observations.find((o) => o.label === "Steps")).toMatchObject({ measureValue: 2000, measureUnit: "steps" });
  });

  it("detects patient questions", () => {
    const questions = extract("I want to ask about icing my knee. Is it normal for it to ache at night?").filter(
      (o) => o.category === "question",
    );
    expect(questions).toHaveLength(2);
    expect(questions.map((q) => q.label)).toEqual(["Question about icing", "Question about night aching"]);
  });

  it("does not cut sentences at titles such as 'Dr.' (quotes stay whole)", () => {
    const body = "I want to ask Dr. Park about both at my next appointment. It aches at night.";
    expect(splitSentences(body).map((s) => s.text)).toEqual([
      "I want to ask Dr. Park about both at my next appointment.",
      "It aches at night.",
    ]);
    for (const span of splitSentences("Ask Mrs. Reed, e.g. about ice.\nDr.\nNext line.")) {
      expect("Ask Mrs. Reed, e.g. about ice.\nDr.\nNext line.".slice(span.start, span.end)).toBe(span.text);
    }
    const question = extract(body).find((o) => o.category === "question");
    expect(question?.patientQuote).toBe("I want to ask Dr. Park about both at my next appointment.");
  });

  it("classifies activity, mood, medication and wound mentions", () => {
    const observations = extract(
      "I did my physio exercises. Feeling worried about going back to work. Took some ibuprofen. The incision looks a bit red.",
    );
    const labelOf = (category: string) => observations.find((o) => o.category === category)?.label;
    expect(labelOf("activity")).toBe("Physiotherapy");
    expect(labelOf("mood")).toBe("Feeling worried");
    expect(labelOf("medication")).toBe("Ibuprofen");
    expect(labelOf("wound")).toBe("Incision redness");
  });

  it("ignores negated findings", () => {
    const observations = extract("No pain and no swelling today.");
    expect(observations.filter((o) => o.category === "symptom")).toHaveLength(0);
  });

  it("returns exact substrings of the entry text as quotes and schema-valid observations", () => {
    const body =
      "My right knee is still hurting, about 7 out of 10 after physio.\nI slept about 4 hours last night.  Is it normal to ache at night? Walked 20 minutes today.";
    const observations = extract(body);
    expect(observations.length).toBeGreaterThanOrEqual(4);
    for (const observation of observations) {
      expect(body).toContain(observation.patientQuote);
      expect(ExtractedObservationSchema.safeParse(observation).success).toBe(true);
      expect(observation.sourceEntryId).toBe("entry-1");
    }
  });

  it("merges pain-like wordings for one finding and does not treat questions as findings", () => {
    const observations = extract("Knee discomfort is a 7 out of 10 and it aches at night. Is it normal for it to ache at night?");
    const symptoms = observations.filter((o) => o.category === "symptom");
    expect(symptoms).toHaveLength(1);
    expect(symptoms[0]).toMatchObject({ label: "Knee discomfort", severity: 7 });
    expect(observations.filter((o) => o.category === "question")).toHaveLength(1);
  });

  it("does not duplicate a finding", () => {
    const observations = extract("My knee hurts. My knee hurts at night, 6/10.");
    expect(observations.filter((o) => o.category === "symptom")).toHaveLength(1);
  });

  it("returns nothing for text without health content", () => {
    expect(extract("Had a lovely cup of tea with the neighbours.")).toEqual([]);
  });
});

describe("mock extractor: ratings and questions", () => {
  it("keeps an explicit rating that has a body site but no symptom keyword", () => {
    const [knee] = extract("My knee is a 7 out of 10 right now.").filter((o) => o.category === "symptom");
    expect(knee).toMatchObject({
      label: "Knee discomfort",
      bodySite: "knee",
      severity: 7,
      patientQuote: "My knee is a 7 out of 10 right now.",
    });
    expect(ExtractedObservationSchema.safeParse(knee).success).toBe(true);
  });

  it("does not turn a bare intent to ask into a question", () => {
    expect(extract("I want to ask at my next appointment.").filter((o) => o.category === "question")).toHaveLength(0);
  });

  it("still detects real questions", () => {
    for (const body of [
      "I want to ask whether I should ice it.",
      "Is it normal for it to ache at night?",
      "I was wondering about driving again.",
    ]) {
      expect(extract(body).filter((o) => o.category === "question")).toHaveLength(1);
    }
  });
});

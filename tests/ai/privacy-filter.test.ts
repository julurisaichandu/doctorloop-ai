import { describe, expect, it, vi } from "vitest";
import { runPrivacyFilter } from "@/lib/ai/privacy-pipeline";
import { assembleFiltered, normalizeClassification } from "@/lib/ai/privacy/assemble";
import { findNameSpans, mockClassify, mockKeep } from "@/lib/ai/privacy/mock-classifier";
import { createOpenAIPrivacyClassifier } from "@/lib/ai/privacy/openai-classifier";
import { applySafetyNet } from "@/lib/ai/privacy/safety-net";
import { segmentSentences } from "@/lib/ai/privacy/segment";
import type { OpenAIClientLike } from "@/lib/ai/openai/structured";
import type { PrivacyClassifier } from "@/lib/ai/privacy/types";
import { mockPrivacyClassifier } from "@/lib/ai/privacy/mock-classifier";

const texts = (input: string) => segmentSentences(input).map((s) => s.text);

const LUNCH = [
  "Chloe was telling me about her new manager and the reorganisation at her company. Apparently the whole marketing team is moving to the third floor.",
  "We talked about the trip she is planning to Lisbon in spring and which neighbourhood to stay in.",
  "Oh, and my knee has been aching all morning and I'm a bit worried about it. It is around a 6 out of 10 today.",
  "Anyway, she showed me photos of the apartment she found. It has a lovely balcony and a view of the river.",
].join("\n");

describe("segmentSentences", () => {
  it("splits on . ! ? and numbers sentences from 1", () => {
    const s = segmentSentences("My knee hurts. Is it normal? It really does!");
    expect(s.map((x) => [x.n, x.text])).toEqual([
      [1, "My knee hurts."],
      [2, "Is it normal?"],
      [3, "It really does!"],
    ]);
  });

  it("does not split after abbreviations or inside decimals", () => {
    expect(texts("I want to ask Dr. Park about it. Mr. Lee is my neighbour.")).toEqual([
      "I want to ask Dr. Park about it.",
      "Mr. Lee is my neighbour.",
    ]);
    expect(texts("I slept 4.5 hours, e.g. less than usual. The clinic is on Main St. Next to the bank.")).toEqual([
      "I slept 4.5 hours, e.g. less than usual.",
      "The clinic is on Main St. Next to the bank.",
    ]);
  });

  it("always splits at line breaks (speaker lines) and marks line starts", () => {
    const s = segmentSentences("Linda: How is the knee?\nMaya: Sore today. Better than yesterday.\n\n");
    expect(s.map((x) => x.text)).toEqual(["Linda: How is the knee?", "Maya: Sore today.", "Better than yesterday."]);
    expect(s.map((x) => x.lineStart)).toEqual([true, true, false]);
    expect(s[1].sep).toBe("newline");
    expect(s[2].sep).toBe("space");
  });

  it("returns nothing for blank input", () => {
    expect(segmentSentences("  \n \n")).toEqual([]);
  });
});

describe("mock keep rules", () => {
  it("'Lunch with Chloe' keeps only the two knee sentences", () => {
    const sentences = segmentSentences(LUNCH);
    const keep = mockKeep(sentences);
    expect(keep.map((n) => sentences[n - 1].text)).toEqual([
      "Oh, and my knee has been aching all morning and I'm a bit worried about it.",
      "It is around a 6 out of 10 today.",
    ]);
  });

  it("drops work, plans and shopping, keeps care questions and ratings", () => {
    const keep = (t: string) => mockKeep(segmentSentences(t)).length;
    expect(keep("Quick stand-up with the design team. We agreed to move the client review to next week.")).toBe(0);
    expect(keep("We need oats, bananas and olive oil. Maybe pasta with mushrooms.")).toBe(0);
    expect(keep("Should I take the stairs more? When can I drive again?")).toBe(2);
    expect(keep("I only slept about four and a half hours last night.")).toBe(1);
    expect(keep("It was a 7/10 earlier.")).toBe(1);
    expect(keep("I will ask the surgeon at my next visit.")).toBe(1);
  });
});

describe("name heuristics", () => {
  const spans = (t: string, lineStart = false) => findNameSpans({ n: 1, text: t, sep: "space", lineStart });

  it("finds titled names, relation names and speaker labels", () => {
    expect(spans("Mrs. Patel drove me home.")).toEqual(["Mrs. Patel"]);
    expect(spans("My neighbour Linda Okoro said I can call.")).toEqual(["Linda Okoro"]);
    expect(spans("my coworker Sam helped with the bag.")).toEqual(["Sam"]);
    expect(spans("Chloe: my knee hurts today.", true)).toEqual(["Chloe"]);
  });

  it("finds two consecutive capitalised words mid-sentence", () => {
    expect(spans("Yesterday I met Jordan Blake after physio.")).toEqual(["Jordan Blake"]);
  });

  it("never flags weekdays, months, I, Dr. + name, relations without a name or acronyms", () => {
    expect(spans("On Tuesday I will ask Dr. Park about my ACL.")).toEqual([]);
    expect(spans("My husband stood behind me.")).toEqual([]);
    expect(spans("It started on Monday March and I'm worried.")).toEqual([]);
    expect(spans("I saw Dr. Elena Park on Friday.")).toEqual([]);
    expect(spans("I did Physical Therapy and the Emergency Room visit was fine.")).toEqual([]);
    expect(spans("Note: my knee is sore.", true)).toEqual([]);
  });
});

describe("safety net", () => {
  const net = (t: string) => applySafetyNet(t);

  it("redacts e-mails, links, phones, ids and addresses", () => {
    expect(net("Write to linda.o@example.com or see https://example.com/x.").text).toBe("Write to [email] or see [link].");
    expect(net("Call 617-555-0142 or (617) 555 0143 or +1 617 555 0144.").text).toBe("Call [phone] or [phone] or [phone].");
    expect(net("SSN 123-45-6789 and card 4111 1111 1111 1111.").text).toBe("SSN [id] and card [id].");
    expect(net("The clinic on 418 Beacon Street is near 12 Oak Ave.").text).toBe("The clinic on [address] is near [address].");
    expect(net("Visit www.clinic.org/book today").text).toBe("Visit [link] today");
  });

  it("counts what it hides", () => {
    expect(net("a@b.com, c@d.org and 617-555-0142").counts).toEqual({ email: 2, phone: 1 });
  });

  it("leaves ordinary numbers, ratings, times and dates alone", () => {
    const keep = [
      "It was 4.5 out of 10 and 6 out of 10 at night.",
      "I bent it to 90 degrees at 21:15.",
      "On 2026-11-10 08:14 I walked 3000 steps in 20 minutes.",
      "I took 2 tablets at 8 and 2 at 20.",
    ];
    for (const t of keep) expect(net(t)).toEqual({ text: t, counts: {} });
  });
});

describe("assembleFiltered", () => {
  it("keeps original sentences verbatim with placeholders and counts them", () => {
    const sentences = segmentSentences(
      "Physio was hard. The weather was nice.\nMy neighbour Linda Okoro said call 617-555-0142 about the appointment. Ask Dr. Park.",
    );
    const result = assembleFiltered(sentences, {
      keep: [1, 3, 4],
      redactions: [{ sentence: 3, text: "Linda Okoro", category: "person_name" }],
    });
    expect(result.text).toBe(
      "Physio was hard.\nMy neighbour [name] said call [phone] about the appointment. Ask Dr. Park.",
    );
    expect(result).toMatchObject({
      totalSentences: 4,
      keptSentences: 3,
      redactions: { person_name: 1, phone: 1 },
    });
  });

  it("never redacts a clinician name that follows Dr./nurse", () => {
    const sentences = segmentSentences("I will ask Dr. Park and Park is also my neighbour.");
    const result = assembleFiltered(sentences, {
      keep: [1],
      redactions: [{ sentence: 1, text: "Park", category: "person_name" }],
    });
    expect(result.text).toBe("I will ask Dr. Park and [name] is also my neighbour.");
  });
});

describe("normalizeClassification (defensive post-processing)", () => {
  const sentences = segmentSentences("My knee hurts. Lunch was nice. Ask Dr. Park.");

  it("ignores out-of-range, duplicate and non-integer indices", () => {
    const out = normalizeClassification({ keep: [3, 1, 1, 0, 9, -2, 1.5], redactions: [] }, sentences);
    expect(out.keep).toEqual([1, 3]);
  });

  it("ignores redactions that are not exact substrings of a kept sentence", () => {
    const out = normalizeClassification(
      {
        keep: [1],
        redactions: [
          { sentence: 1, text: "my knee", category: "person_name" }, // wrong case: not a substring
          { sentence: 1, text: "knee", category: "person_name" },
          { sentence: 1, text: "knee", category: "person_name" }, // duplicate
          { sentence: 2, text: "Lunch", category: "person_name" }, // sentence not kept
          { sentence: 7, text: "x", category: "phone" },
          { sentence: 1, text: "  ", category: "phone" },
        ],
      },
      sentences,
    );
    expect(out.redactions).toEqual([{ sentence: 1, text: "knee", category: "person_name" }]);
  });
});

function fakeClient(output: unknown): { client: OpenAIClientLike; parse: ReturnType<typeof vi.fn> } {
  const parse = vi.fn(async () => ({ output_parsed: output, output: [] }));
  return { client: { responses: { parse } }, parse };
}

const customClassifier = (c: PrivacyClassifier) => ({ classifier: c });

describe("OpenAI classifier path (fake client)", () => {
  const input = "Chloe talked about Lisbon. My knee aches. Linda Okoro is on 617-555-0142.";

  it("assembles from the model's keep list and spans, then applies the safety net", async () => {
    const { client, parse } = fakeClient({
      keep: [2, 3],
      redactions: [{ sentence: 3, text: "Linda Okoro", category: "person_name" }],
    });
    const out = await runPrivacyFilter(
      input,
      customClassifier(createOpenAIPrivacyClassifier({ client, model: "gpt-test" })),
    );
    expect(out.text).toBe("My knee aches. [name] is on [phone].");
    expect(out.receipt).toMatchObject({
      provider: "openai",
      model: "gpt-test",
      totalSentences: 3,
      keptSentences: 2,
      redactions: { person_name: 1, phone: 1 },
    });
    expect(out.receipt.fallback).toBeUndefined();
    const call = parse.mock.calls[0][0] as { input: string; store: boolean };
    expect(call.input).toContain("1. Chloe talked about Lisbon.");
    expect(call.store).toBe(false);
  });

  it("survives bad indices and non-matching spans", async () => {
    const { client } = fakeClient({
      keep: [2, 2, 99, 0],
      redactions: [{ sentence: 2, text: "not in sentence", category: "person_name" }],
    });
    const out = await runPrivacyFilter(
      input,
      customClassifier(createOpenAIPrivacyClassifier({ client, model: "gpt-test" })),
    );
    expect(out.text).toBe("My knee aches.");
    expect(out.receipt).toMatchObject({ keptSentences: 1, redactions: {} });
  });

  it("returns empty text when the model keeps nothing", async () => {
    const { client } = fakeClient({ keep: [], redactions: [] });
    const out = await runPrivacyFilter(
      input,
      customClassifier(createOpenAIPrivacyClassifier({ client, model: "gpt-test" })),
    );
    expect(out.text).toBe("");
    expect(out.receipt).toMatchObject({ provider: "openai", totalSentences: 3, keptSentences: 0 });
  });

  it("falls back to the rule-based filter and marks the receipt when the call fails", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const client: OpenAIClientLike = {
      responses: {
        parse: async () => {
          throw new Error("boom: Linda Okoro 617-555-0142");
        },
      },
    };
    const out = await runPrivacyFilter(
      input,
      customClassifier(createOpenAIPrivacyClassifier({ client, model: "gpt-test" })),
    );
    expect(out.receipt).toMatchObject({ provider: "mock", model: null, fallback: true });
    expect(out.text).toContain("My knee aches.");
    expect(out.text).not.toContain("Lisbon");
    // The failure log never contains the filtered text or the provider's error message.
    expect(JSON.stringify(warn.mock.calls)).not.toMatch(/Linda|617|boom/);
    warn.mockRestore();
  });

  it("still redacts what the model missed", async () => {
    const { client } = fakeClient({ keep: [3], redactions: [] });
    const out = await runPrivacyFilter(
      input,
      customClassifier(createOpenAIPrivacyClassifier({ client, model: "gpt-test" })),
    );
    expect(out.text).toBe("Linda Okoro is on [phone].");
  });
});

describe("runPrivacyFilter with the rule-based mock (Mastra workflow)", () => {
  it("filters 'Lunch with Chloe' down to the knee sentences with a receipt", async () => {
    const out = await runPrivacyFilter(LUNCH, { classifier: mockPrivacyClassifier });
    expect(out.text).toBe(
      "Oh, and my knee has been aching all morning and I'm a bit worried about it. It is around a 6 out of 10 today.",
    );
    expect(out.receipt).toMatchObject({
      provider: "mock",
      model: null,
      totalSentences: 7,
      keptSentences: 2,
      redactions: {},
    });
    expect(out.receipt.fallback).toBeUndefined();
    expect(Number.isNaN(Date.parse(out.receipt.filteredAt))).toBe(false);
    expect(out.workflowRunId).toBeTruthy();
  });

  it("hides the neighbour and address in the updated band capture sentences", async () => {
    const out = await runPrivacyFilter(
      "My neighbour Linda Okoro said I can call her on 617-555-0142 if I need a lift to the appointment.\nJust got back from physio at the clinic on 418 Beacon Street and my knee is so sore.",
    );
    expect(out.text).toBe(
      "My neighbour [name] said I can call her on [phone] if I need a lift to the appointment.\nJust got back from physio at the clinic on [address] and my knee is so sore.",
    );
    expect(out.receipt.redactions).toEqual({ person_name: 1, phone: 1, address: 1 });
  });

  it("returns an empty text for input with nothing health-related", async () => {
    const out = await runPrivacyFilter("We need oats and bananas. Chloe is visiting Lisbon.");
    expect(out.text).toBe("");
    expect(out.receipt.keptSentences).toBe(0);
    expect(out.receipt.totalSentences).toBe(2);
  });

  it("mockClassify keeps sentence numbers and only flags kept sentences", () => {
    const sentences = segmentSentences("Chloe Martin visited. My knee aches after seeing Jordan Blake.");
    expect(mockClassify(sentences)).toEqual({
      keep: [2],
      redactions: [{ sentence: 2, text: "Jordan Blake", category: "person_name" }],
    });
  });
});

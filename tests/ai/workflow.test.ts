import { describe, expect, it, vi } from "vitest";
import { getAiProviderInfo, runHealthUpdatePipeline, type RunPipelineInput } from "@/lib/ai/pipeline";
import { createOpenAIExtractor } from "@/lib/ai/openai/extractor";
import { createOpenAISummarizer } from "@/lib/ai/openai/summarizer";
import { supportsTemperature, type OpenAIClientLike } from "@/lib/ai/openai/structured";
import { MOCK_PROVIDERS } from "@/lib/ai/providers";
import { ExtractedObservationSchema, SummaryContentSchema } from "@/lib/ai/schemas";
import { mastra } from "@/mastra";

const local = (day: number, hour: number) => new Date(2026, 10, day, hour).toISOString();

const entries = [
  {
    id: "entry-1",
    source: "manual" as const,
    occurredAt: local(7, 18),
    body: "Knee discomfort is about 3 out of 10 today. I slept about 7 hours last night. Did my physio exercises.",
  },
  {
    id: "entry-2",
    source: "voice" as const,
    occurredAt: local(10, 18),
    body: "My right knee hurts after physio, about 5/10. I slept 6 hours last night. Walked 15 minutes with my crutches.",
  },
  {
    id: "entry-3",
    source: "manual" as const,
    occurredAt: local(13, 8),
    body: "Knee discomfort is a 7 out of 10 and it aches at night. I only slept about 4 hours last night. Is it normal for it to ache at night? Should I keep icing it?",
  },
];

const baseInput: RunPipelineInput = {
  patientId: "patient-1",
  audience: "clinician",
  patientContext: {
    firstName: "Maya",
    procedure: "Right knee ACL reconstruction",
    procedureDate: "2026-10-26",
    recoveryStage: "Week 3",
  },
  newEntries: entries,
  contextEntries: [],
  existingObservations: [],
  periodStart: "2026-11-06T00:00:00.000Z",
  periodEnd: "2026-11-13T23:59:59.000Z",
  summarize: true,
};

const allCitations = (summary: NonNullable<Awaited<ReturnType<typeof runHealthUpdatePipeline>>["summary"]>) =>
  [summary.mainConcerns, summary.changesSinceEarlier, summary.recoveryActivities, summary.patientQuestions].flatMap((items) =>
    items.flatMap((item) => item.citations),
  );

describe("health-update-pipeline (mock provider)", () => {
  it("registers the workflow with the contract id and steps", () => {
    const workflow = mastra.getWorkflow("healthUpdateWorkflow");
    expect(workflow.id).toBe("health-update-pipeline");
    expect(Object.keys(workflow.steps)).toEqual(["extract-observations", "build-timeline", "summarize"]);
  });

  it("reports the mock provider when no key is configured", () => {
    expect(getAiProviderInfo()).toEqual({ provider: "mock", model: null });
  });

  it.each(["clinician", "patient"] as const)("runs end-to-end for the %s audience", async (audience) => {
    const output = await runHealthUpdatePipeline({ ...baseInput, audience });

    expect(output.provider).toBe("mock");
    expect(output.model).toBeNull();
    expect(output.summaryProvider).toBe("mock");
    expect(output.summaryModel).toBeNull();
    expect(output.workflowRunId).toEqual(expect.any(String));
    expect(output.extracted.map((e) => e.entryId)).toEqual(["entry-1", "entry-2", "entry-3"]);
    for (const { observations } of output.extracted) {
      for (const observation of observations) expect(ExtractedObservationSchema.safeParse(observation).success).toBe(true);
    }

    const knee = output.timeline.changes.find((c) => c.seriesKey === "severity:knee discomfort");
    expect(knee?.description).toBe("Self-reported knee discomfort went from 3/10 (Nov 7) to 7/10 (Nov 13); reported values ranged 3\u20137/10 across 3 updates.");
    const sleep = output.timeline.changes.find((c) => c.seriesKey === "measure:sleep:hours");
    expect(sleep?.description).toBe("Self-reported sleep went from 7 hours (Nov 6) to 4 hours (Nov 12); reported values ranged 4\u20137 hours across 3 updates.");

    const summary = output.summary;
    expect(summary).not.toBeNull();
    expect(SummaryContentSchema.safeParse(summary).success).toBe(true);
    const inputIds = new Set(entries.map((e) => e.id));
    for (const id of allCitations(summary!)) expect(inputIds.has(id)).toBe(true);
    expect(summary!.mainConcerns.length).toBeGreaterThan(0);
    expect(summary!.patientQuestions).toHaveLength(2);
    expect(summary!.recoveryActivities.length).toBeGreaterThan(0);

    const text = JSON.stringify(summary);
    if (audience === "patient") {
      expect(summary!.overview).toMatch(/you shared 3 updates/);
      expect(summary!.mainConcerns[0].text).toMatch(/^You reported/);
      expect(summary!.patientQuestions[0].text).toMatch(/^You asked/);
    } else {
      expect(summary!.overview).toMatch(/Maya shared 3 updates/);
      expect(summary!.mainConcerns[0].text).toMatch(/^Patient reported/);
      expect(summary!.patientQuestions[0].text).toMatch(/^Patient asked/);
    }
    expect(text).not.toMatch(/worsen|improv|concerning|diagnos|you should|recommend/i);
  });

  it("uses existing observations for the timeline and skips the summary when asked", async () => {
    const first = await runHealthUpdatePipeline({ ...baseInput, newEntries: [entries[0]], summarize: false });
    const existing = first.extracted[0].observations.map((o, index) => ({
      id: `obs-${index}`,
      patientId: "patient-1",
      journalEntryId: "entry-1",
      ...o,
      status: "active" as const,
      editedByPatient: false,
      extractedBy: "mock" as const,
      model: null,
      createdAt: entries[0].occurredAt,
      updatedAt: entries[0].occurredAt,
    })) as RunPipelineInput["existingObservations"];

    const output = await runHealthUpdatePipeline({
      ...baseInput,
      newEntries: [entries[2]],
      contextEntries: [entries[0]],
      existingObservations: existing,
      summarize: false,
    });
    expect(output.summary).toBeNull();
    expect(output.summaryProvider).toBeNull();
    expect(output.summaryModel).toBeNull();
    expect(output.extracted).toHaveLength(1);
    expect(output.timeline.changes.map((c) => c.seriesKey)).toContain("severity:knee discomfort");
  });
});

describe("health-update-pipeline (OpenAI path with an injected client)", () => {
  function fakeClient(parsed: (callIndex: number, body: { input: unknown }) => unknown) {
    const parse = vi.fn(async (body: { input: unknown }) => ({
      output_parsed: parsed(parse.mock.calls.length - 1, body),
      output: [],
    }));
    return { client: { responses: { parse } } as unknown as OpenAIClientLike, parse };
  }

  const extractionFor = (entryId: string) => ({
    observations: [
      {
        sourceEntryId: entryId,
        category: "symptom",
        label: "Knee discomfort",
        bodySite: "knee",
        // Model paraphrased the quote and invented a rating: both must be repaired.
        patientQuote: "knee discomfort is very high",
        observedAt: null,
        timeDescription: null,
        severity: 9,
        severityText: "9 out of 10",
        measureValue: null,
        measureUnit: null,
        context: [],
        uncertainties: [],
      },
    ],
  });

  it("validates and post-processes model output", async () => {
    const { client, parse } = fakeClient((index) => {
      if (index < 3) return extractionFor(`entry-${index + 1}`);
      return {
        overview: "Over the past 7 days, Maya shared 3 updates.",
        mainConcerns: [
          { text: "Patient reported knee discomfort.", citations: ["entry-3", "not-an-entry"] },
          { text: "Uncited item.", citations: ["not-an-entry"] },
        ],
        changesSinceEarlier: [],
        recoveryActivities: [],
        patientQuestions: [],
        dataGaps: [],
      };
    });
    const providers = {
      extractor: createOpenAIExtractor({ client, model: "gpt-4.1-mini" }),
      summarizer: createOpenAISummarizer({ client, model: "gpt-4.1-mini" }),
    };

    const output = await runHealthUpdatePipeline(baseInput, { providers });

    expect(output.provider).toBe("openai");
    expect(output.model).toBe("gpt-4.1-mini");
    expect(output.summaryProvider).toBe("openai");
    expect(output.summaryModel).toBe("gpt-4.1-mini");
    expect(parse).toHaveBeenCalledTimes(4);
    const first = parse.mock.calls[0][0] as { model: string; temperature?: number; instructions: string; input: string };
    expect(first).toMatchObject({ model: "gpt-4.1-mini", temperature: 0 });
    expect(first.input).toContain(`Entry timestamp (UTC): ${entries[0].occurredAt}`);

    const [obs] = output.extracted[0].observations;
    expect(obs.severity).toBeNull();
    expect(entries[0].body).toContain(obs.patientQuote);
    expect(obs.uncertainties).toContain("Intensity not stated");

    expect(output.summary?.mainConcerns).toEqual([
      { text: "Patient reported knee discomfort.", citations: ["entry-3"] },
    ]);
  });

  it("falls back to the mock provider when OpenAI fails and says so", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const { client } = fakeClient(() => ({ nonsense: true }));
    const providers = {
      extractor: createOpenAIExtractor({ client, model: "gpt-4.1-mini" }),
      summarizer: createOpenAISummarizer({ client, model: "gpt-4.1-mini" }),
    };

    const output = await runHealthUpdatePipeline(baseInput, { providers });

    expect(output.provider).toBe("mock");
    expect(output.model).toBeNull();
    expect(output.summaryProvider).toBe("mock");
    expect(output.summaryModel).toBeNull();
    expect(output.extracted.flatMap((e) => e.observations).length).toBeGreaterThan(0);
    expect(output.summary).not.toBeNull();
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it("reports each stage's provider: working extractor, failing summarizer", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const extractor = { provider: "openai" as const, model: "gpt-4.1-mini", extract: MOCK_PROVIDERS.extractor.extract };
    const summarizer = {
      provider: "openai" as const,
      model: "gpt-4.1-mini",
      summarize: async () => {
        throw new Error("summary service down");
      },
    };

    const output = await runHealthUpdatePipeline(baseInput, { providers: { extractor, summarizer } });

    expect(output.provider).toBe("openai");
    expect(output.model).toBe("gpt-4.1-mini");
    expect(output.summaryProvider).toBe("mock");
    expect(output.summaryModel).toBeNull();
    expect(output.summary).not.toBeNull();
    warn.mockRestore();
  });

  it("surfaces a refusal as a failure and falls back", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const client: OpenAIClientLike = {
      responses: {
        parse: async () => ({ output_parsed: null, output: [{ content: [{ type: "refusal", refusal: "no" }] }] }),
      },
    };
    const output = await runHealthUpdatePipeline(baseInput, {
      providers: {
        extractor: createOpenAIExtractor({ client, model: "gpt-5-mini" }),
        summarizer: MOCK_PROVIDERS.summarizer,
      },
    });
    expect(output.provider).toBe("mock");
    expect(output.summaryProvider).toBe("mock");
    warn.mockRestore();
  });

  it("only sends temperature to models that support it", () => {
    expect(supportsTemperature("gpt-4.1-mini")).toBe(true);
    expect(supportsTemperature("gpt-5-mini")).toBe(false);
    expect(supportsTemperature("o4-mini")).toBe(false);
  });
});

import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { runHealthUpdatePipeline, type RunPipelineInput } from "@/lib/ai/pipeline";
import { callStructured, type OpenAIClientLike } from "@/lib/ai/openai/structured";
import { MOCK_PROVIDERS } from "@/lib/ai/providers";
import { collectModelUsage, estimateTokens, reportModelUsage, type ModelUsageEvent } from "@/lib/ai/usage";

const evt: ModelUsageEvent = {
  kind: "k",
  provider: "mock",
  model: null,
  inputTokens: 1,
  outputTokens: 1,
  totalTokens: 2,
  tokenSource: "estimated",
};

const entry = {
  id: "entry-1",
  source: "manual" as const,
  occurredAt: new Date(2026, 10, 7, 18).toISOString(),
  body: "Knee discomfort is about 3 out of 10 today. I slept about 7 hours last night. Did my physio exercises.",
};

const baseInput: RunPipelineInput = {
  patientId: "patient-1",
  audience: "clinician",
  patientContext: {
    firstName: "Maya",
    procedure: "Right knee ACL reconstruction",
    procedureDate: "2026-10-26",
    recoveryStage: "Week 3",
  },
  newEntries: [entry],
  contextEntries: [],
  existingObservations: [],
  periodStart: "2026-11-06T00:00:00.000Z",
  periodEnd: "2026-11-13T23:59:59.000Z",
  summarize: true,
};

const schema = z.object({ ok: z.string() });
const request = { model: "gpt-4.1-mini", name: "test_schema", schema, system: "sys", user: "usr" };

function clientReturning(response: Record<string, unknown>): OpenAIClientLike {
  return { responses: { parse: async () => response } } as unknown as OpenAIClientLike;
}

describe("model usage collector", () => {
  it("reportModelUsage outside a scope is a no-op", () => {
    expect(() => reportModelUsage(evt)).not.toThrow();
  });

  it("collects events inside a scope; inner scopes do not leak outward; concurrent scopes are isolated", async () => {
    const outer = await collectModelUsage(async () => {
      reportModelUsage({ ...evt, kind: "a" });
      const inner = await collectModelUsage(async () => reportModelUsage({ ...evt, kind: "b" }));
      expect(inner.events.map((e) => e.kind)).toEqual(["b"]);
    });
    expect(outer.events.map((e) => e.kind)).toEqual(["a"]);
    const [x, y] = await Promise.all([
      collectModelUsage(async () => reportModelUsage({ ...evt, kind: "x" })),
      collectModelUsage(async () => reportModelUsage({ ...evt, kind: "y" })),
    ]);
    expect(x.events.map((e) => e.kind)).toEqual(["x"]);
    expect(y.events.map((e) => e.kind)).toEqual(["y"]);
  });

  it("mock pipeline run reports estimated extraction + summary usage", async () => {
    const { events } = await collectModelUsage(() => runHealthUpdatePipeline(baseInput, { providers: MOCK_PROVIDERS }));
    expect(events.map((e) => e.kind)).toEqual(["observation_extraction", "recovery_summary"]);
    for (const e of events) {
      expect(e.provider).toBe("mock");
      expect(e.tokenSource).toBe("estimated");
      expect(e.inputTokens).toBeGreaterThan(0);
      expect(e.outputTokens).toBeGreaterThan(0);
      expect(e.totalTokens).toBe(e.inputTokens + e.outputTokens);
    }
  });

  it("callStructured reports provider counts when the response has usage", async () => {
    const client = clientReturning({
      output_parsed: { ok: "yes" },
      output: [],
      usage: { input_tokens: 120, output_tokens: 30, total_tokens: 150 },
    });
    const { events } = await collectModelUsage(() => callStructured(client, request));
    expect(events).toEqual([
      { kind: "test_schema", provider: "openai", model: "gpt-4.1-mini", inputTokens: 120, outputTokens: 30, totalTokens: 150, tokenSource: "provider" },
    ]);
  });

  it("callStructured estimates when usage is missing", async () => {
    const client = clientReturning({ output_parsed: { ok: "yes" }, output: [] });
    const { events } = await collectModelUsage(() => callStructured(client, request));
    expect(events).toHaveLength(1);
    expect(events[0].tokenSource).toBe("estimated");
    expect(events[0].inputTokens).toBe(estimateTokens("sys\nusr"));
    expect(events[0].outputTokens).toBe(estimateTokens(JSON.stringify({ ok: "yes" })));
  });

  it("callStructured reports nothing for invalid output", async () => {
    const client = clientReturning({ output_parsed: { nope: 1 }, output: [], usage: { input_tokens: 1, output_tokens: 1, total_tokens: 2 } });
    const { events } = await collectModelUsage(() => callStructured(client, request).catch(() => null));
    expect(events).toEqual([]);
  });

  it("a failing OpenAI extractor reports only the mock fallback", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const extractor = {
      provider: "openai" as const,
      model: "gpt-4.1-mini",
      extract: async () => {
        throw new Error("boom");
      },
    };
    const { events } = await collectModelUsage(() =>
      runHealthUpdatePipeline(baseInput, { providers: { extractor, summarizer: MOCK_PROVIDERS.summarizer } }),
    );
    warn.mockRestore();
    const extraction = events.filter((e) => e.kind === "observation_extraction");
    expect(extraction.length).toBeGreaterThan(0);
    expect(extraction.every((e) => e.provider === "mock")).toBe(true);
    expect(events.some((e) => e.provider === "openai" && e.kind === "observation_extraction")).toBe(false);
  });
});

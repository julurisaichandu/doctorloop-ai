import { createHash } from "node:crypto";
import { beforeEach, describe, expect, it } from "vitest";
import { getRepository } from "@/lib/data";
import { resetLocalDb } from "@/lib/data/local/local-db";
import { decryptSecret, encryptSecret } from "@/lib/integrations/vexo/crypto";
import { MOCK_MEMORY_SEEDS } from "@/lib/integrations/vexo/mock-data";
import { normalizeVexoItem } from "@/lib/integrations/vexo/live-adapter";
import { classifyHealthRelevance } from "@/lib/integrations/vexo/relevance";
import { issuerAcceptable } from "@/lib/integrations/vexo/oauth-flow";
import { importVexoMemories, previewVexoImport } from "@/lib/services/vexo";
import { drPark, maya, patientIdOf } from "../services/support";

const DAY_MS = 86_400_000;
const range = () => ({
  from: new Date(Date.now() - 14 * DAY_MS).toISOString(),
  to: new Date().toISOString(),
});

async function vexoEntryCount(): Promise<number> {
  const actor = maya();
  return (await getRepository(actor).listEntries(patientIdOf(actor), { source: ["vexo"] })).length;
}

beforeEach(() => {
  resetLocalDb();
});

describe("vexo preview", () => {
  it("returns only health-relevant memories and reports excluded ones", async () => {
    const preview = await previewVexoImport(maya(), range());
    expect(preview.mode).toBe("mock");
    expect(preview.candidates.length).toBeGreaterThanOrEqual(4);
    expect(preview.excludedCount).toBeGreaterThan(0);
    for (const candidate of preview.candidates) {
      expect(candidate.matchedTerms.length).toBeGreaterThan(0);
      expect(candidate.id).not.toMatch(/-0[678]$/); // the unrelated private memories
    }
    const titles = preview.candidates.map((c) => c.title);
    expect(titles).not.toContain("Planning a birthday dinner");
    expect(titles).not.toContain("Budget call");
  });

  it("filters unrelated memories for every demo patient's mock data", () => {
    for (const seeds of Object.values(MOCK_MEMORY_SEEDS)) {
      const relevant = seeds.filter((s) => classifyHealthRelevance(`${s.title} ${s.excerpt}`).relevant);
      expect(relevant.length).toBeGreaterThanOrEqual(4);
      expect(seeds.length - relevant.length).toBeGreaterThanOrEqual(2);
    }
  });

  it("uses search provenance when a query is given", async () => {
    const preview = await previewVexoImport(maya(), { ...range(), query: "knee" });
    expect(preview.candidates.length).toBeGreaterThan(0);
    for (const candidate of preview.candidates) {
      expect(candidate.provenance).toEqual({ tool: "search", query: "knee" });
    }
  });

  it("persists nothing", async () => {
    const before = await vexoEntryCount();
    await previewVexoImport(maya(), range());
    expect(await vexoEntryCount()).toBe(before);
  });

  it("rejects ranges longer than 31 days", async () => {
    await expect(
      previewVexoImport(maya(), { from: new Date(Date.now() - 40 * DAY_MS).toISOString(), to: new Date().toISOString() }),
    ).rejects.toMatchObject({ code: "VALIDATION" });
  });

  it("forbids doctors", async () => {
    await expect(previewVexoImport(drPark(), range())).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(importVexoMemories(drPark(), { items: [{ externalId: "mock-maya-01", excerpt: "x" }] })).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });
});

describe("vexo import", () => {
  async function firstCandidate() {
    const preview = await previewVexoImport(maya(), { ...range(), query: "knee" });
    const candidate = preview.candidates[0];
    expect(candidate).toBeDefined();
    return candidate;
  }

  it("requires explicit items", async () => {
    await expect(importVexoMemories(maya(), { items: [] })).rejects.toMatchObject({ code: "VALIDATION" });
  });

  it("rejects forged or rewritten excerpts and unknown ids", async () => {
    const candidate = await firstCandidate();
    const before = await vexoEntryCount();
    await expect(
      importVexoMemories(maya(), { items: [{ externalId: candidate.id, excerpt: "My knee is fine, I feel great." }] }),
    ).rejects.toMatchObject({ code: "VALIDATION" });
    await expect(
      importVexoMemories(maya(), { items: [{ externalId: "mock-maya-999", excerpt: candidate.excerpt }] }),
    ).rejects.toMatchObject({ code: "VALIDATION" });
    expect(await vexoEntryCount()).toBe(before);
  });

  it("refuses to import unrelated private memories", async () => {
    await expect(
      importVexoMemories(maya(), {
        items: [{ externalId: "mock-maya-06", excerpt: "We're thinking of booking the Italian place on Friday" }],
      }),
    ).rejects.toMatchObject({ code: "VALIDATION" });
  });

  it("preserves provenance and the original timestamp", async () => {
    const candidate = await firstCandidate();
    const trimmed = candidate.excerpt.split(". ")[0];
    const result = await importVexoMemories(maya(), {
      items: [{ externalId: candidate.id, excerpt: trimmed, query: "knee" }],
    });
    expect(result.entries).toHaveLength(1);
    const { entry, sourceRef } = result.entries[0];
    expect(entry.source).toBe("vexo");
    expect(entry.reviewStatus).toBe("pending_review");
    expect(entry.occurredAt).toBe(candidate.startedAt);
    expect(entry.body).toBe(trimmed);
    expect(sourceRef).toMatchObject({
      provider: "vexo",
      mode: "mock",
      externalId: candidate.id,
      excerpt: null,
      sourceTimestamp: candidate.startedAt,
    });
    expect(sourceRef?.metadata).toMatchObject({
      tool: "search",
      query: "knee",
      mcpServer: "https://api.vexoai.com/mcp",
      originalExcerptSha256: createHash("sha256").update(candidate.excerpt).digest("hex"),
      originalLength: candidate.excerpt.length,
      trimmed: true,
    });
    // The trimmed-away remainder is stored nowhere (only the approved body holds text).
    const remainder = candidate.excerpt.slice(trimmed.length).trim();
    expect(JSON.stringify(sourceRef)).not.toContain(remainder);
  });

  it("imports several items in one call", async () => {
    const preview = await previewVexoImport(maya(), range());
    const items = preview.candidates.slice(0, 3).map((c) => ({ externalId: c.id, excerpt: c.excerpt }));
    const result = await importVexoMemories(maya(), { items });
    expect(result.entries).toHaveLength(3);
  });

  it("skips memories that were already imported", async () => {
    const candidate = await firstCandidate();
    const item = { externalId: candidate.id, excerpt: candidate.excerpt };
    await importVexoMemories(maya(), { items: [item] });
    const again = await importVexoMemories(maya(), { items: [item] });
    expect(again.entries).toHaveLength(0);
    expect(again.skippedExternalIds).toEqual([candidate.id]);

    const preview = await previewVexoImport(maya(), { ...range(), query: "knee" });
    expect(preview.candidates.find((c) => c.id === candidate.id)?.alreadyImported).toBe(true);
  });
});

describe("vexo token crypto", () => {
  it("round-trips and uses a random IV", () => {
    const a = encryptSecret("access-token-123", "tokens", "user-1", "test-key");
    const b = encryptSecret("access-token-123", "tokens", "user-1", "test-key");
    expect(a).not.toBe(b);
    expect(decryptSecret(a, "tokens", "user-1", "test-key")).toBe("access-token-123");
  });

  it("detects tampering, wrong keys, wrong AAD and wrong purpose", () => {
    const payload = encryptSecret("secret", "tokens", "user-1", "test-key");
    const raw = Buffer.from(payload, "base64url");
    raw[raw.length - 1] ^= 0x01;
    expect(() => decryptSecret(raw.toString("base64url"), "tokens", "user-1", "test-key")).toThrow();
    expect(() => decryptSecret(payload, "tokens", "user-1", "other-key")).toThrow();
    expect(() => decryptSecret(payload, "tokens", "user-2", "test-key")).toThrow();
    expect(() => decryptSecret(payload, "oauth-cookie", "user-1", "test-key")).toThrow();
    expect(() => decryptSecret("AAAA", "tokens", "user-1", "test-key")).toThrow();
  });
});

describe("oauth issuer check (RFC 9207)", () => {
  it("requires iss when advertised and compares ignoring trailing slashes", () => {
    expect(issuerAcceptable(null, "https://a.example", true)).toBe(false);
    expect(issuerAcceptable(null, "https://a.example", false)).toBe(true);
    expect(issuerAcceptable("https://a.example/", "https://a.example", true)).toBe(true);
    expect(issuerAcceptable("https://evil.example", "https://a.example", false)).toBe(false);
  });
});

describe("mock memory timestamps", () => {
  it("uses local hours and is never in the future", async () => {
    const preview = await previewVexoImport(maya(), range());
    const byTitle = new Map(preview.candidates.map((c) => [c.title, new Date(c.startedAt)]));
    expect(byTitle.get("Exercises this morning")?.getHours()).toBe(9);
    expect(byTitle.get("Rough night")?.getHours()).toBe(2);
    for (const c of preview.candidates) expect(Date.parse(c.startedAt)).toBeLessThan(Date.now());
  });
});

describe("live result normalization", () => {
  it("maps alternative field names and rejects incomplete items", () => {
    const memory = normalizeVexoItem(
      { memory_id: 42, name: "Walk", text: "Walked today", start_time: "2026-11-10T10:00:00Z" },
      "get_context",
    );
    expect(memory).toMatchObject({ id: "42", title: "Walk", excerpt: "Walked today", provenance: { tool: "get_context" } });
    expect(normalizeVexoItem({ id: "x", text: "no time" }, "search", "q")).toBeNull();
  });
});

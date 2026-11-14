import "server-only";
import { getSystemRepository } from "@/lib/data";
import { MOCK_MEMORY_SEEDS, type MockMemorySeed } from "./mock-data";
import { contextFrom, searchFrom, transcriptFrom, type BareMemory } from "./memory-store";
import type { VexoAdapter, VexoMemory, VexoRangeQuery } from "./types";

function materialize(seed: MockMemorySeed): BareMemory {
  const started = new Date();
  started.setDate(started.getDate() - seed.daysAgo);
  started.setHours(seed.hour, 0, 0, 0);
  return {
    id: seed.id,
    title: seed.title,
    excerpt: seed.excerpt,
    startedAt: started.toISOString(),
    endedAt: new Date(started.getTime() + seed.durationMinutes * 60_000).toISOString(),
    kind: seed.kind,
  };
}

/** Mock memories are keyed by the demo patient's e-mail (resolved from the user id). */
async function memoriesFor(userId: string): Promise<BareMemory[]> {
  const profile = await getSystemRepository().getProfile(userId);
  const seeds = (profile && MOCK_MEMORY_SEEDS[profile.email.toLowerCase()]) || [];
  return seeds.map(materialize);
}

/** Fictional memories, clearly labeled as mock. Never contacts Vexo. */
export class MockVexoAdapter implements VexoAdapter {
  readonly mode = "mock" as const;

  async isConnected(): Promise<boolean> {
    return true;
  }

  async getContext(userId: string, params: VexoRangeQuery): Promise<VexoMemory[]> {
    return contextFrom(await memoriesFor(userId), params);
  }

  async search(userId: string, params: VexoRangeQuery & { query: string }): Promise<VexoMemory[]> {
    return searchFrom(await memoriesFor(userId), params);
  }

  async getTranscript(userId: string, id: string): Promise<VexoMemory | null> {
    return transcriptFrom(await memoriesFor(userId), id);
  }
}

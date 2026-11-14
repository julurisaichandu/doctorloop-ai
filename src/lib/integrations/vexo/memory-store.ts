import type { VexoMemory, VexoRangeQuery, VexoTool } from "./types";

/** A memory before a tool call stamps its provenance. Shared by the mock and file adapters. */
export type BareMemory = Omit<VexoMemory, "provenance">;

export const DEFAULT_LIMIT = 50;

function stamp(memory: BareMemory, tool: VexoTool, query?: string): VexoMemory {
  return { ...memory, provenance: query ? { tool, query } : { tool } };
}

function inRange(memory: BareMemory, { from, to }: VexoRangeQuery): boolean {
  const t = Date.parse(memory.startedAt);
  return t >= Date.parse(from) && t <= Date.parse(to);
}

const newestFirst = (a: BareMemory, b: BareMemory) => b.startedAt.localeCompare(a.startedAt);

/** get_context semantics over an in-memory list: range filter, newest first, limit. */
export function contextFrom(memories: readonly BareMemory[], params: VexoRangeQuery): VexoMemory[] {
  return memories
    .filter((memory) => inRange(memory, params))
    .sort(newestFirst)
    .slice(0, params.limit ?? DEFAULT_LIMIT)
    .map((memory) => stamp(memory, "get_context"));
}

/** search semantics over an in-memory list: range filter, any-keyword match, newest first, limit. */
export function searchFrom(
  memories: readonly BareMemory[],
  params: VexoRangeQuery & { query: string },
): VexoMemory[] {
  const words = params.query.toLowerCase().split(/\s+/).filter(Boolean);
  return memories
    .filter((memory) => inRange(memory, params))
    .filter((memory) => {
      const haystack = `${memory.title ?? ""} ${memory.excerpt}`.toLowerCase();
      return words.some((word) => haystack.includes(word));
    })
    .sort(newestFirst)
    .slice(0, params.limit ?? DEFAULT_LIMIT)
    .map((memory) => stamp(memory, "search", params.query));
}

export function transcriptFrom(memories: readonly BareMemory[], id: string): VexoMemory | null {
  const found = memories.find((memory) => memory.id === id);
  return found ? stamp(found, "get_transcript") : null;
}

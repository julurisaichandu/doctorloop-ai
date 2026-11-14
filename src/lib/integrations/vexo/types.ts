export type VexoTool = "search" | "get_context" | "get_transcript";

/** A wearable memory or transcript retrieved from Vexo (or the labeled mock). */
export interface VexoMemory {
  id: string;
  title: string | null;
  excerpt: string;
  startedAt: string;
  endedAt: string | null;
  kind: "memory" | "transcript";
  provenance: { tool: VexoTool; query?: string };
}

export interface VexoRangeQuery {
  from: string;
  to: string;
  limit?: number;
}

/** Read-only access to a patient's Vexo memories. */
export interface VexoAdapter {
  mode: "mock" | "live" | "file";
  isConnected(userId: string): Promise<boolean>;
  search(userId: string, params: VexoRangeQuery & { query: string }): Promise<VexoMemory[]>;
  getContext(userId: string, params: VexoRangeQuery): Promise<VexoMemory[]>;
  getTranscript(userId: string, id: string): Promise<VexoMemory | null>;
}

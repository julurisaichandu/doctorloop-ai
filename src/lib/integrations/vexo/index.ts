import "server-only";
import { env } from "@/lib/config/env";
import { FileVexoAdapter } from "./file-adapter";
import { LiveVexoAdapter } from "./live-adapter";
import { MockVexoAdapter } from "./mock-adapter";
import type { VexoAdapter } from "./types";

/** Live MCP adapter (VEXO_MODE=live), band-file replay (VEXO_MODE=file), otherwise the labeled mock. */
export function getVexoAdapter(): VexoAdapter {
  switch (env.vexoMode) {
    case "live":
      return new LiveVexoAdapter();
    case "file":
      return new FileVexoAdapter();
    default:
      return new MockVexoAdapter();
  }
}

export type { VexoAdapter, VexoMemory } from "./types";

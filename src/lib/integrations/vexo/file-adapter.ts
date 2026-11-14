import "server-only";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { env } from "@/lib/config/env";
import { getSystemRepository } from "@/lib/data";
import { isAppError, validationError } from "@/lib/errors";
import { parseBandFile } from "./band-file";
import { contextFrom, searchFrom, transcriptFrom, type BareMemory } from "./memory-store";
import type { VexoAdapter, VexoMemory, VexoRangeQuery } from "./types";

function bandFilePath(): string {
  return path.resolve(/*turbopackIgnore: true*/ process.cwd(), env.vexoFilePath);
}

/** Only the basename ever leaves the server. */
export function bandFileName(): string {
  return path.basename(env.vexoFilePath);
}

export interface BandFileState {
  fileName: string;
  /** Set when the file is missing or invalid (the message is safe to show). */
  error: string | null;
  wearer: string | null;
  /** True when the file names a wearer other than this user. */
  wearerMismatch: boolean;
}

type Loaded = Pick<BandFileState, "wearer" | "wearerMismatch"> & { memories: BareMemory[] };

/** Replays a predefined band capture file as if it came from the wearable. Never contacts Vexo. */
export class FileVexoAdapter implements VexoAdapter {
  readonly mode = "file" as const;

  /** Re-reads the file; reports problems instead of throwing so the UI can explain them. */
  async inspect(userId: string): Promise<BandFileState> {
    const fileName = bandFileName();
    try {
      const { wearer, wearerMismatch } = await this.load(userId);
      return { fileName, error: null, wearer, wearerMismatch };
    } catch (error) {
      if (!isAppError(error)) throw error;
      return { fileName, error: error.message, wearer: null, wearerMismatch: false };
    }
  }

  /** Reads and parses on every call so edits to the file show up on refresh. */
  private async load(userId: string): Promise<Loaded> {
    const fileName = bandFileName();
    let text: string;
    try {
      text = await readFile(bandFilePath(), "utf8");
    } catch {
      throw validationError(`Vexo band file "${fileName}" could not be read. Check VEXO_FILE_PATH.`);
    }
    const band = parseBandFile(text, { fileName });
    if (band.wearer) {
      const profile = await getSystemRepository().getProfile(userId);
      if (!profile || profile.email.toLowerCase() !== band.wearer.toLowerCase()) {
        return { wearer: band.wearer, wearerMismatch: true, memories: [] };
      }
    }
    return { wearer: band.wearer, wearerMismatch: false, memories: band.recordings };
  }

  async isConnected(userId: string): Promise<boolean> {
    const state = await this.inspect(userId);
    return !state.error && !state.wearerMismatch;
  }

  async getContext(userId: string, params: VexoRangeQuery): Promise<VexoMemory[]> {
    return contextFrom((await this.load(userId)).memories, params);
  }

  async search(userId: string, params: VexoRangeQuery & { query: string }): Promise<VexoMemory[]> {
    return searchFrom((await this.load(userId)).memories, params);
  }

  async getTranscript(userId: string, id: string): Promise<VexoMemory | null> {
    return transcriptFrom((await this.load(userId)).memories, id);
  }
}

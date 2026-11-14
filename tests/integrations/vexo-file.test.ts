import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { env, getIntegrationStatus } from "@/lib/config/env";
import { getRepository } from "@/lib/data";
import { resetLocalDb } from "@/lib/data/local/local-db";
import { getVexoAdapter } from "@/lib/integrations/vexo";
import { FileVexoAdapter } from "@/lib/integrations/vexo/file-adapter";
import { sanitizeSourceRefForDoctor } from "@/lib/services/views";
import { getVexoStatus, importVexoMemories, previewVexoImport } from "@/lib/services/vexo";
import { daniel, maya } from "../services/support";

const DAY_MS = 86_400_000;
const range = () => ({ from: new Date(Date.now() - 14 * DAY_MS).toISOString(), to: new Date().toISOString() });

let dir: string;
const saved = { mode: process.env.VEXO_MODE, file: process.env.VEXO_FILE_PATH };

function useFile(name: string, content: string): void {
  const full = path.join(dir, name);
  writeFileSync(full, content, "utf8");
  process.env.VEXO_MODE = "file";
  process.env.VEXO_FILE_PATH = full;
}

beforeEach(() => {
  resetLocalDb();
  dir = mkdtempSync(path.join(tmpdir(), "band-"));
  process.env.VEXO_MODE = "file";
  delete process.env.VEXO_FILE_PATH; // default sample file
});

afterEach(() => {
  for (const [key, value] of [
    ["VEXO_MODE", saved.mode],
    ["VEXO_FILE_PATH", saved.file],
  ] as const) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  rmSync(dir, { recursive: true, force: true });
});

describe("file mode config", () => {
  it("selects the file adapter and labels the integration", () => {
    expect(env.vexoMode).toBe("file");
    expect(env.vexoFilePath).toBe("vexo-band/maya-band-capture.txt");
    expect(getVexoAdapter()).toBeInstanceOf(FileVexoAdapter);
    expect(getIntegrationStatus().vexo).toEqual({ mode: "file", label: "Vexo band replay (file)" });
    process.env.VEXO_MODE = "bogus";
    expect(env.vexoMode).toBe("mock");
  });
});

describe("file mode service", () => {
  it("reports a connected status with the basename only", async () => {
    const status = await getVexoStatus(maya());
    expect(status).toMatchObject({
      mode: "file",
      connected: true,
      replayFile: "maya-band-capture.txt",
      label: "Vexo band replay — maya-band-capture.txt (simulated band data)",
    });
    expect(JSON.stringify(status)).not.toContain(process.cwd());
  });

  it("previews only relevant recordings and counts the rest", async () => {
    const preview = await previewVexoImport(maya(), range());
    expect(preview.mode).toBe("file");
    expect(preview.candidates).toHaveLength(7);
    expect(preview.excludedCount).toBe(4);
    expect(preview.candidates.map((c) => c.title)).not.toContain("Groceries");
    const searched = await previewVexoImport(maya(), { ...range(), query: "stairs" });
    expect(searched.candidates.map((c) => c.title)).toEqual(["Stairs at home"]);
  });

  it("imports pending entries with simulated source refs, replayFile and no mcpServer", async () => {
    const preview = await previewVexoImport(maya(), range());
    const pick = preview.candidates[0];
    const actor = maya();
    const result = await importVexoMemories(actor, { items: [{ externalId: pick.id, excerpt: pick.excerpt }] });
    expect(result.entries).toHaveLength(1);
    expect(result.entries[0].entry.reviewStatus).toBe("pending_review");
    const refs = await getRepository(actor).listSourceRefs([result.entries[0].entry.sourceRefId as string]);
    expect(refs[0].mode).toBe("simulated");
    expect(refs[0].metadata).toMatchObject({ tool: "get_context", replayFile: "maya-band-capture.txt", trimmed: false });
    expect("mcpServer" in refs[0].metadata).toBe(false);
    expect(sanitizeSourceRefForDoctor(refs[0]).metadata.replayFile).toBe("maya-band-capture.txt");
    const again = await importVexoMemories(actor, { items: [{ externalId: pick.id, excerpt: pick.excerpt }] });
    expect(again.skippedExternalIds).toEqual([pick.id]);
  });

  it("still verifies a trimmed excerpt of the mixed recording", async () => {
    const preview = await previewVexoImport(maya(), range());
    const mixed = preview.candidates.find((c) => c.title === "Lunch with Chloe");
    expect(mixed).toBeDefined();
    await expect(
      importVexoMemories(maya(), { items: [{ externalId: mixed!.id, excerpt: "Something I never said about my knee" }] }),
    ).rejects.toThrow(/Trim it/);
    const trimmed = "my knee has been aching all morning and I'm a bit worried about it. It is around a 6 out of 10 today.";
    const result = await importVexoMemories(maya(), { items: [{ externalId: mixed!.id, excerpt: trimmed }] });
    expect(result.entries[0].entry.body).toBe(trimmed);
    const refs = await getRepository(maya()).listSourceRefs([result.entries[0].entry.sourceRefId as string]);
    expect(refs[0].metadata.trimmed).toBe(true);
  });

  it("gives nothing to a patient the file does not belong to", async () => {
    const status = await getVexoStatus(daniel());
    expect(status.connected).toBe(false);
    expect(status.label).toMatch(/belongs to another wearer/);
    const preview = await previewVexoImport(daniel(), range());
    expect(preview).toMatchObject({ candidates: [], excludedCount: 0 });
  });

  it("serves every patient when the file names no wearer, and re-reads edits", async () => {
    useFile("open.txt", "## yesterday 08:00 | Walk\nI walked for twenty minutes and my knee ached.\n");
    expect((await previewVexoImport(daniel(), range())).candidates).toHaveLength(1);
    useFile(
      "open.txt",
      "## yesterday 08:00 | Walk\nI walked for twenty minutes and my knee ached.\n## yesterday 09:00 | Pain\nMy back hurts.\n",
    );
    expect((await previewVexoImport(daniel(), range())).candidates).toHaveLength(2);
  });

  it("surfaces missing and invalid files as validation errors naming the file", async () => {
    process.env.VEXO_FILE_PATH = path.join(dir, "missing.txt");
    await expect(previewVexoImport(maya(), range())).rejects.toThrow(/missing\.txt/);
    expect((await getVexoStatus(maya())).connected).toBe(false);
    useFile("bad.txt", "## yesterday 08:00\nok\n## someday\nbad\n");
    await expect(previewVexoImport(maya(), range())).rejects.toThrow(/bad\.txt, line 3/);
    const status = await getVexoStatus(maya());
    expect(status.connected).toBe(false);
    expect(status.label).toContain("bad.txt, line 3");
    expect(status.label).not.toContain(dir);
  });
});

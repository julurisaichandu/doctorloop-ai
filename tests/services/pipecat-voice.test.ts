import { beforeEach, describe, expect, it } from "vitest";
import { getRepository } from "@/lib/data";
import { resetLocalDb } from "@/lib/data/local/local-db";
import { approveEntry } from "@/lib/services/patient";
import { completePipecatCheckIn } from "@/lib/services/voice";
import { drPark, KNEE_NOTE, maya } from "./support";

beforeEach(() => resetLocalDb());

const transcript = [
  { role: "agent" as const, text: "How is your knee today?", at: "2026-01-05T10:00:00.000Z" },
  { role: "patient" as const, text: KNEE_NOTE, at: "2026-01-05T10:00:05.000Z" },
];

describe("completePipecatCheckIn", () => {
  it("creates a pending voice entry with an unverified pipecat ref and no transcript text", async () => {
    const view = await completePipecatCheckIn(maya(), { transcript });
    expect(view.entry).toMatchObject({ source: "voice", reviewStatus: "pending_review" });
    expect(view.sourceRef).toMatchObject({ provider: "manual", mode: "live", excerpt: null });
    expect(view.sourceRef?.metadata).toMatchObject({
      tool: "pipecat",
      transcriptSource: "client_unverified",
      turns: 2,
    });
    expect(JSON.stringify(view.sourceRef)).not.toContain("knee");
  });

  it("rejects a call with no patient words", async () => {
    await expect(
      completePipecatCheckIn(maya(), { transcript: [{ role: "agent", text: "Hello", at: null }] }),
    ).rejects.toMatchObject({ code: "VALIDATION" });
    await expect(
      completePipecatCheckIn(maya(), { transcript: [{ role: "patient", text: "   ", at: null }] }),
    ).rejects.toMatchObject({ code: "VALIDATION" });
  });

  it("hides the entry from a doctor until it is approved", async () => {
    const view = await completePipecatCheckIn(maya(), { transcript });
    const refId = view.sourceRef!.id;
    expect(await getRepository(drPark()).listSourceRefs([refId])).toHaveLength(0);
    await approveEntry(maya(), view.entry.id);
    expect(await getRepository(drPark()).listSourceRefs([refId])).toHaveLength(1);
  });
});

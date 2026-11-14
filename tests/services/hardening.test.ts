import { beforeEach, describe, expect, it, vi } from "vitest";
import * as pipeline from "@/lib/ai/pipeline";
import { getRepository, getSystemRepository } from "@/lib/data";
import { resetLocalDb } from "@/lib/data/local/local-db";
import type { NewJournalEntry } from "@/lib/data/repository";
import { getSharedRecord } from "@/lib/services/doctor";
import { ingestEntry } from "@/lib/services/ingest";
import { approveEntry, createManualEntry, revokeEntry, updateEntryText } from "@/lib/services/patient";
import { refreshClinicianSummary } from "@/lib/services/summaries";
import { KNEE_NOTE, daniel, drPark, maya, patientIdOf } from "./support";

vi.mock("@/lib/ai/pipeline", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/ai/pipeline")>();
  return { ...actual, runHealthUpdatePipeline: vi.fn(actual.runHealthUpdatePipeline) };
});

const runPipeline = vi.mocked(pipeline.runHealthUpdatePipeline);
const code = (c: string) => expect.objectContaining({ code: c });

const newEntry = (patientId: string, over: Partial<NewJournalEntry> = {}): NewJournalEntry => ({
  patientId,
  source: "manual",
  body: "x",
  occurredAt: new Date().toISOString(),
  reviewStatus: "pending_review",
  reviewedByPatientAt: null,
  processingStatus: "processing",
  processingError: null,
  sourceRefId: null,
  voiceSessionId: null,
  editedByPatient: false,
  ...over,
});

beforeEach(() => {
  resetLocalDb();
  runPipeline.mockClear();
});

describe("doctor views strip patient text from source references", () => {
  it("drops excerpt and non-whitelisted metadata for doctors, keeps them for the patient", async () => {
    const created = await createManualEntry(maya(), { body: KNEE_NOTE });
    const system = getSystemRepository();
    const ref = await system.createSourceRef({
      patientId: patientIdOf(maya()),
      provider: "vexo",
      mode: "mock",
      externalId: "ext-1",
      title: "Note",
      excerpt: "text the patient later removed",
      sourceTimestamp: null,
      retrievedAt: new Date().toISOString(),
      metadata: { tool: "search", query: "knee", mcpServer: "https://x", trimmed: true, originalExcerptSha256: "abc", secret: "removed text" },
    });
    await system.updateEntry(created.entry.id, { sourceRefId: ref.id });
    await approveEntry(maya(), created.entry.id);

    const doctorView = await getSharedRecord(drPark(), created.entry.id);
    expect(doctorView.sourceRef?.excerpt).toBeNull();
    expect(doctorView.sourceRef?.metadata).toEqual({ tool: "search", query: "knee", mcpServer: "https://x", trimmed: true });
    expect(JSON.stringify(doctorView)).not.toContain("removed");

    const own = await getRepository(maya()).listSourceRefs([ref.id]);
    expect(own[0]?.excerpt).toBe("text the patient later removed");
  });
});

describe("processing state guards", () => {
  it("approve, reject and revoke are CONFLICT while the entry is processing", async () => {
    const created = await createManualEntry(maya(), { body: KNEE_NOTE });
    const system = getSystemRepository();
    await system.updateEntry(created.entry.id, { processingStatus: "processing" });
    await expect(approveEntry(maya(), created.entry.id)).rejects.toEqual(code("CONFLICT"));

    await system.updateEntry(created.entry.id, { processingStatus: "processed" });
    await approveEntry(maya(), created.entry.id);
    await system.updateEntry(created.entry.id, { processingStatus: "processing" });
    await expect(revokeEntry(maya(), created.entry.id)).rejects.toEqual(code("CONFLICT"));
  });

  it("a failed re-extraction leaves no observations quoting the old text", async () => {
    const created = await createManualEntry(maya(), { body: KNEE_NOTE });
    expect(created.observations.length).toBeGreaterThan(0);

    runPipeline.mockRejectedValueOnce(new Error("provider down"));
    const updated = await updateEntryText(maya(), created.entry.id, { body: "My knee feels completely different today." });
    expect(updated.entry.processingStatus).toBe("failed");
    expect(updated.observations).toEqual([]);
    const all = await getSystemRepository().listObservations(patientIdOf(maya()), {
      entryIds: [created.entry.id],
      includeRemoved: true,
    });
    expect(all).toEqual([]);
  });

  it("ingestEntry can skip the patient summary", async () => {
    const before = await getRepository(maya()).getLatestSummary(patientIdOf(maya()), "patient");
    await ingestEntry(maya(), { source: "manual", body: KNEE_NOTE }, { summarize: false });
    expect(runPipeline.mock.calls.at(-1)?.[0].summarize).toBe(false);
    const after = await getRepository(maya()).getLatestSummary(patientIdOf(maya()), "patient");
    expect(after?.id).toBe(before?.id);
  });
});

describe("summary supersede", () => {
  it("marks previous summaries superseded and returns the newest one", async () => {
    const system = getSystemRepository();
    const patientId = patientIdOf(maya());
    const base = {
      patientId,
      audience: "clinician" as const,
      periodStart: new Date().toISOString(),
      periodEnd: new Date().toISOString(),
      content: { overview: "x", mainConcerns: [], changesSinceEarlier: [], recoveryActivities: [], patientQuestions: [], dataGaps: [] },
      sourceEntryIds: [],
      generatedBy: "mock" as const,
      model: null,
    };
    const first = await system.createSummary({ ...base, content: { ...base.content, overview: "first" } });
    const second = await system.createSummary({ ...base, content: { ...base.content, overview: "second" } });

    const latest = await system.getLatestSummary(patientId, "clinician");
    expect(latest?.id).toBe(second.id);
    expect(latest?.supersededAt ?? null).toBeNull();
    expect(first.id).not.toBe(second.id);

    const asDoctor = await getRepository(drPark()).getLatestSummary(patientId, "clinician");
    expect(asDoctor?.content.overview).toBe("second");
    // The patient-audience summary is untouched.
    expect((await system.getLatestSummary(patientId, "patient"))?.supersededAt ?? null).toBeNull();
  });
});

describe("actor repository forbids system-only writes", () => {
  it("rejects source refs, approvals, voice-session updates, summaries and observation replacement", async () => {
    const actorRepo = getRepository(maya());
    const patientId = patientIdOf(maya());
    const entry = (await actorRepo.listEntries(patientId))[0];
    const now = new Date().toISOString();

    await expect(
      actorRepo.createSourceRef({ patientId, provider: "manual", mode: "mock", externalId: null, title: null, excerpt: null, sourceTimestamp: null, retrievedAt: now, metadata: {} }),
    ).rejects.toEqual(code("FORBIDDEN"));
    await expect(
      actorRepo.createSharingApproval({ patientId, journalEntryId: entry.id, decision: "approved", decidedBy: maya().userId, decidedAt: now, note: null }),
    ).rejects.toEqual(code("FORBIDDEN"));
    await expect(actorRepo.updateVoiceSession("00000000-0000-4000-8000-000000000000", { status: "failed" })).rejects.toEqual(
      code("FORBIDDEN"),
    );
    await expect(
      actorRepo.createSummary({
        patientId, audience: "clinician", periodStart: now, periodEnd: now, sourceEntryIds: [], generatedBy: "mock", model: null,
        content: { overview: "x", mainConcerns: [], changesSinceEarlier: [], recoveryActivities: [], patientQuestions: [], dataGaps: [] },
      }),
    ).rejects.toEqual(code("FORBIDDEN"));
    await expect(actorRepo.replaceObservationsForEntry(entry.id, [])).rejects.toEqual(code("FORBIDDEN"));
  });

  it("restricts which entry fields an actor may update", async () => {
    const created = await createManualEntry(maya(), { body: KNEE_NOTE });
    const actorRepo = getRepository(maya());
    for (const patch of [
      { processingStatus: "processed" as const },
      { processingError: "x" },
      { sourceRefId: null },
      { voiceSessionId: null },
    ]) {
      await expect(actorRepo.updateEntry(created.entry.id, patch)).rejects.toEqual(code("FORBIDDEN"));
    }
    await expect(actorRepo.updateEntry(created.entry.id, { editedByPatient: true })).resolves.toBeDefined();
  });

  it("createEntry requires pending_review and same-patient source refs / voice sessions", async () => {
    const actorRepo = getRepository(maya());
    await expect(actorRepo.createEntry(newEntry(patientIdOf(maya()), { reviewStatus: "approved" }))).rejects.toEqual(code("FORBIDDEN"));
    await expect(actorRepo.createEntry(newEntry(patientIdOf(maya()), { processingStatus: "processed" }))).rejects.toEqual(code("FORBIDDEN"));

    const system = getSystemRepository();
    const danielRef = await system.createSourceRef({
      patientId: patientIdOf(daniel()), provider: "manual", mode: "mock", externalId: null, title: null, excerpt: null,
      sourceTimestamp: null, retrievedAt: new Date().toISOString(), metadata: {},
    });
    const danielSession = await system.createVoiceSession({
      patientId: patientIdOf(daniel()), mode: "simulated", status: "active", externalConversationId: null,
      transcript: [], confirmedNotes: [], startedAt: new Date().toISOString(), endedAt: null, journalEntryId: null,
    });
    await expect(actorRepo.createEntry(newEntry(patientIdOf(maya()), { sourceRefId: danielRef.id }))).rejects.toEqual(code("FORBIDDEN"));
    await expect(actorRepo.createEntry(newEntry(patientIdOf(maya()), { voiceSessionId: danielSession.id }))).rejects.toEqual(code("FORBIDDEN"));
    await expect(actorRepo.createEntry(newEntry(patientIdOf(maya())))).resolves.toBeDefined();
  });
});

describe("clinician summary refresh race", () => {
  it("does not cite an entry revoked while a refresh is in flight", async () => {
    const created = await createManualEntry(maya(), { body: KNEE_NOTE });
    const entryId = created.entry.id;
    await approveEntry(maya(), entryId);
    const patientId = patientIdOf(maya());
    const system = getSystemRepository();
    expect((await system.getLatestSummary(patientId, "clinician"))?.sourceEntryIds).toContain(entryId);

    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => (release = resolve));
    let started: () => void = () => undefined;
    const inFlight = new Promise<void>((resolve) => (started = resolve));
    const actual = await vi.importActual<typeof import("@/lib/ai/pipeline")>("@/lib/ai/pipeline");
    runPipeline.mockImplementationOnce(async (input) => {
      started();
      await gate;
      return actual.runHealthUpdatePipeline(input);
    });

    const refresh = refreshClinicianSummary(patientId);
    await inFlight;
    const revoke = revokeEntry(maya(), entryId);
    await vi.waitFor(async () => {
      expect((await system.getEntry(entryId))?.reviewStatus).toBe("rejected");
    });
    release();
    await Promise.all([refresh, revoke]);

    const latest = await system.getLatestSummary(patientId, "clinician");
    expect(latest?.sourceEntryIds).not.toContain(entryId);
    const cited = latest
      ? [...latest.content.mainConcerns, ...latest.content.changesSinceEarlier, ...latest.content.recoveryActivities, ...latest.content.patientQuestions].flatMap((i) => i.citations)
      : [];
    expect(cited).not.toContain(entryId);
  });
});

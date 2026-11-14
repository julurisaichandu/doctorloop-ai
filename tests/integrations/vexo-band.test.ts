import { createHash } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { POST } from "@/app/api/integrations/vexo/band/route";
import { getIntegrationStatus } from "@/lib/config/env";
import { getSystemRepository } from "@/lib/data";
import { getLocalDb, resetLocalDb } from "@/lib/data/local/local-db";
import { LocalRepository } from "@/lib/data/local/local-repository";
import type { Actor } from "@/lib/domain/types";
import { conflict } from "@/lib/errors";
import {
  bandSourceRefId,
  MAX_BAND_BODY_BYTES,
  signBandBody,
  verifyBandSignature,
} from "@/lib/integrations/vexo/band-bridge";
import { getSharedRecord } from "@/lib/services/doctor";
import { approveEntry, listPatientTimeline } from "@/lib/services/patient";
import { handleBandRecording } from "@/lib/services/vexo-band";
import { daniel, drPark, KNEE_NOTE, maya, patientIdOf } from "../services/support";

// The band path has no session: any actor-scoped repository there is a bug that local mode
// would hide (in Supabase mode it runs as anon and fails). Fail loudly instead.
let forbidActorRepo = false;
vi.mock("@/lib/data", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/lib/data")>();
  return {
    ...real,
    getRepository: (actor: Actor) => {
      if (forbidActorRepo) throw new Error("actor-scoped repository used on the band path");
      return real.getRepository(actor);
    },
  };
});

const SECRET = "band-test-secret-0123456789abcdef0123";
const NOISE = "The quarterly budget review moved to Friday.";
const TRANSCRIPT = `${KNEE_NOTE} ${NOISE}`;
const HOUR_MS = 3_600_000;
const BAND_KEYS = ["VEXO_BAND_NUMBER", "VEXO_BAND_SECRET", "VEXO_BAND_WEARER"] as const;
const saved = Object.fromEntries(BAND_KEYS.map((k) => [k, process.env[k]]));

function recording(over: Record<string, unknown> = {}) {
  const started = Date.now() - 2 * HOUR_MS;
  return {
    bandNumber: 47,
    recordingId: "rec_001",
    mode: "live",
    startedAt: new Date(started).toISOString(),
    endedAt: new Date(started + 90_000).toISOString(),
    transcript: TRANSCRIPT,
    stt: { provider: "deepgram", model: "nova-3" },
    gate: { provider: "gemini", model: "gemini-decision-1", veryPrivate: 0.1, healthRelated: 0.92, fallback: false },
    ...over,
  };
}

function signedHeader(raw: string, now: Date, secret = SECRET): string {
  const t = String(Math.floor(now.getTime() / 1000));
  return `t=${t},v1=${signBandBody(secret, t, raw)}`;
}

/** Posts through the service with the actor repository forbidden. */
async function post(payload: unknown, opts: { header?: string | null; now?: Date; raw?: string } = {}) {
  const now = opts.now ?? new Date();
  const raw = opts.raw ?? JSON.stringify(payload);
  const header = opts.header === undefined ? signedHeader(raw, now) : opts.header;
  forbidActorRepo = true;
  try {
    return await handleBandRecording(raw, header, now);
  } finally {
    forbidActorRepo = false;
  }
}

const mayaId = () => patientIdOf(maya());
const usage = () => getSystemRepository().listUsageRecords({ patientId: mayaId() });
const privacyUsageCount = async () => (await usage()).filter((r) => r.operation === "privacy_filter").length;
const refIdFor = (recordingId: string) => bandSourceRefId(`band-47:${recordingId}`);
const entriesLinking = (refId: string) => getLocalDb().data.entries.filter((e) => e.sourceRefId === refId);

beforeEach(() => {
  resetLocalDb();
  forbidActorRepo = false;
  process.env.VEXO_BAND_NUMBER = "47";
  process.env.VEXO_BAND_SECRET = SECRET;
  process.env.VEXO_BAND_WEARER = "Maya.Thompson@example.com";
});

afterEach(() => {
  forbidActorRepo = false;
  for (const key of BAND_KEYS) {
    if (saved[key] === undefined) delete process.env[key];
    else process.env[key] = saved[key];
  }
});

describe("band signature contract", () => {
  it("matches the HMAC test vector shared with band-bridge/", () => {
    const secret = "test-secret-0123456789abcdef0123456789";
    const body = '{"bandNumber":47,"recordingId":"r1"}';
    const v1 = "c7d8ede7b386df3e1fa5d91014eec0b402791a0e316f5e0b7373b2c28bee57e3";
    expect(signBandBody(secret, "1794700000", body)).toBe(v1);
    expect(verifyBandSignature(`t=1794700000,v1=${v1}`, body, secret, new Date(1_794_700_000_000))).toBe(true);
  });

  it("the actor-repository guard really intercepts actor-scoped reads", async () => {
    forbidActorRepo = true;
    await expect(listPatientTimeline(maya())).rejects.toThrow(/actor-scoped repository/);
  });

  it("derives a stable, valid UUID per band recording", () => {
    expect(z.uuid().safeParse(refIdFor("r1")).success).toBe(true);
    expect(refIdFor("r1")).toBe(refIdFor("r1"));
    expect(refIdFor("r1")).not.toBe(refIdFor("r2"));
  });

  it("labels the integration", () => {
    expect(getIntegrationStatus().band).toEqual({ mode: "live", label: "Vexo band 47 · Pipecat bridge" });
    process.env.VEXO_BAND_SECRET = "too-short";
    expect(getIntegrationStatus().band).toEqual({ mode: "off", label: "Not configured" });
  });
});

describe("band push stores a pending entry", () => {
  it.each(["live", "simulated"] as const)("stores a %s recording with metadata-only provenance", async (mode) => {
    const rec = recording({ mode, recordingId: `rec-${mode}` });
    const res = await post(rec);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ stored: true });
    expect(JSON.stringify(res.body)).not.toContain("knee");

    const entryId = (res.body as { entryId: string }).entryId;
    const entry = await getSystemRepository().getEntry(entryId);
    expect(entry).toMatchObject({
      patientId: mayaId(),
      source: "vexo",
      reviewStatus: "pending_review",
      processingStatus: "processed",
      occurredAt: rec.startedAt,
      sourceRefId: refIdFor(rec.recordingId),
    });
    expect(entry?.privacyFilter).not.toBeNull();
    expect(entry?.body).toContain("knee aches");

    const [ref] = await getSystemRepository().listSourceRefs([refIdFor(rec.recordingId)]);
    expect(ref).toMatchObject({
      patientId: mayaId(),
      provider: "vexo",
      mode,
      externalId: `band-47:${rec.recordingId}`,
      title: "Band 47 conversation",
      excerpt: null,
      sourceTimestamp: rec.startedAt,
    });
    expect(ref.metadata).toEqual({
      tool: "band",
      bandNumber: 47,
      sttProvider: "deepgram",
      sttModel: "nova-3",
      gateProvider: "gemini",
      gateModel: "gemini-decision-1",
      gateVeryPrivate: 0.1,
      gateHealthRelated: 0.92,
      gateFallback: false,
      originalExcerptSha256: createHash("sha256").update(TRANSCRIPT).digest("hex"),
      originalLength: TRANSCRIPT.length,
      trimmed: false,
      privacyFiltered: true,
    });
    expect(JSON.stringify(ref)).not.toMatch(/knee|physio|quarterly/i);
    expect(JSON.stringify(getLocalDb().data)).not.toContain("quarterly budget");
  });

  it("is visible to Maya, and to Dr. Park only after Maya approves it", async () => {
    const res = await post(recording());
    const entryId = (res.body as { entryId: string }).entryId;
    expect((await listPatientTimeline(maya())).map((v) => v.entry.id)).toContain(entryId);
    await expect(getSharedRecord(drPark(), entryId)).rejects.toMatchObject({ code: "NOT_FOUND" });

    await approveEntry(maya(), entryId);
    const shared = await getSharedRecord(drPark(), entryId);
    expect(shared.sourceRef?.metadata).toEqual({ tool: "band", bandNumber: 47, sttProvider: "deepgram", trimmed: false });
  });

  it("records every AI usage with the system trigger", async () => {
    const before = new Set((await usage()).map((r) => r.id));
    await post(recording());
    const added = (await usage()).filter((r) => !before.has(r.id));
    expect(new Set(added.map((r) => r.operation))).toEqual(
      new Set(["privacy_filter", "entry_extraction", "patient_summary"]),
    );
    for (const r of added) expect(r).toMatchObject({ triggeredBy: "system", triggeredByUserId: null });
  });
});

describe("idempotency", () => {
  it("answers a retry with duplicate: one entry, no second filter run", async () => {
    expect((await post(recording())).body).toMatchObject({ stored: true });
    const filterRuns = await privacyUsageCount();
    expect(await post(recording())).toEqual({ status: 200, body: { stored: false, reason: "duplicate" } });
    expect(entriesLinking(refIdFor("rec_001"))).toHaveLength(1);
    expect(await privacyUsageCount()).toBe(filterRuns);
  });

  it("finishes a run that crashed after creating the source reference", async () => {
    const id = refIdFor("rec_001");
    await getSystemRepository().createSourceRef({
      id,
      patientId: mayaId(),
      provider: "vexo",
      mode: "live",
      externalId: "band-47:rec_001",
      title: "Band 47 conversation",
      excerpt: null,
      sourceTimestamp: null,
      retrievedAt: new Date().toISOString(),
      metadata: { tool: "band" },
    });
    expect((await post(recording())).body).toMatchObject({ stored: true });
    expect(entriesLinking(id)).toHaveLength(1);
    expect(getLocalDb().data.sourceRefs.filter((r) => r.id === id)).toHaveLength(1);
  });

  it("never re-links a source reference that belongs to another patient", async () => {
    const id = refIdFor("rec_001");
    const danielId = patientIdOf(daniel());
    await getSystemRepository().createSourceRef({
      id,
      patientId: danielId,
      provider: "vexo",
      mode: "live",
      externalId: "band-47:rec_001",
      title: "Band 47 conversation",
      excerpt: null,
      sourceTimestamp: null,
      retrievedAt: new Date().toISOString(),
      metadata: { tool: "band" },
    });
    expect(await post(recording())).toEqual({ status: 200, body: { stored: false, reason: "duplicate" } });
    expect(entriesLinking(id)).toHaveLength(0);
    expect(getLocalDb().data.sourceRefs.filter((r) => r.id === id).map((r) => r.patientId)).toEqual([danielId]);
  });

  it("answers duplicate when a concurrent request creates the source reference first", async () => {
    const spy = vi
      .spyOn(LocalRepository.prototype, "createSourceRef")
      .mockRejectedValueOnce(conflict("Source reference already exists."));
    try {
      expect(await post(recording())).toEqual({ status: 200, body: { stored: false, reason: "duplicate" } });
      expect(spy).toHaveBeenCalledOnce();
    } finally {
      spy.mockRestore();
    }
    expect(entriesLinking(refIdFor("rec_001"))).toHaveLength(0);
  });

  it("local createSourceRef rejects an existing id like the Supabase primary key", async () => {
    const input = {
      id: refIdFor("x"),
      patientId: mayaId(),
      provider: "vexo" as const,
      mode: "live" as const,
      externalId: "band-47:x",
      title: null,
      excerpt: null,
      sourceTimestamp: null,
      retrievedAt: new Date().toISOString(),
      metadata: {},
    };
    await getSystemRepository().createSourceRef(input);
    await expect(getSystemRepository().createSourceRef(input)).rejects.toMatchObject({ code: "CONFLICT" });
  });
});

describe("filtering", () => {
  it("drops a recording with no health words before any AI runs", async () => {
    const usageBefore = (await usage()).length;
    const refsBefore = getLocalDb().data.sourceRefs.length;
    const res = await post(recording({ transcript: "We need oats and bananas. Chloe is visiting Lisbon." }));
    expect(res).toEqual({ status: 200, body: { stored: false, reason: "not_health_related" } });
    expect((await usage()).length).toBe(usageBefore);
    expect(getLocalDb().data.sourceRefs.length).toBe(refsBefore);
  });

  it("stores nothing when the privacy filter keeps nothing", async () => {
    // "follow up" spans the line break: relevant as a whole, but no single sentence is about health.
    const transcript = "Remind me to follow\nup with Chloe about the concert tickets.";
    const refsBefore = getLocalDb().data.sourceRefs.length;
    const entriesBefore = getLocalDb().data.entries.length;
    const filterRuns = await privacyUsageCount();
    const res = await post(recording({ transcript }));
    expect(res).toEqual({ status: 200, body: { stored: false, reason: "nothing_kept" } });
    expect(getLocalDb().data.sourceRefs.length).toBe(refsBefore);
    expect(getLocalDb().data.entries.length).toBe(entriesBefore);
    expect(await privacyUsageCount()).toBe(filterRuns + 1);
  });
});

describe("rejections", () => {
  it("rejects bad, missing and stale signatures with 401", async () => {
    const raw = JSON.stringify(recording());
    const now = new Date();
    expect((await post(null, { raw, header: signedHeader(raw, now, `${SECRET}-other`) })).status).toBe(401);
    expect((await post(null, { raw, header: null })).status).toBe(401);
    expect((await post(null, { raw, header: "t=abc,v1=zz" })).status).toBe(401);
    const stale = new Date(now.getTime() - 301_000);
    expect((await post(null, { raw, header: signedHeader(raw, stale), now })).status).toBe(401);
    const future = new Date(now.getTime() + 301_000);
    expect((await post(null, { raw, header: signedHeader(raw, future), now })).status).toBe(401);
    expect((await post(null, { raw: raw.replace("rec_001", "rec_002"), header: signedHeader(raw, now), now })).status).toBe(401);
    expect(getLocalDb().data.sourceRefs.some((r) => r.externalId?.startsWith("band-"))).toBe(false);
  });

  it("rejects a malformed signature header with 401", async () => {
    const raw = JSON.stringify(recording());
    const now = new Date();
    const valid = signedHeader(raw, now);
    expect(verifyBandSignature(valid, raw, SECRET, now)).toBe(true);
    const [tPart, v1Part] = valid.split(",");
    const zeros = `v1=${"0".repeat(64)}`;
    const malformed = [
      `${valid}=garbage`,
      `${valid}0`,
      `${tPart},${zeros},${v1Part}`,
      `${tPart},${tPart},${v1Part}`,
      `${valid},v0=${"0".repeat(64)}`,
      `x=1,${valid}`,
      `${v1Part},${tPart}`,
      `${tPart}, ${v1Part}`,
      `${tPart},${v1Part.toUpperCase().replace("V1", "v1")}`,
    ];
    for (const header of malformed) expect((await post(null, { raw, header, now })).status).toBe(401);
    expect(getLocalDb().data.sourceRefs.some((r) => r.externalId?.startsWith("band-"))).toBe(false);
  });

  it("rejects a wrong band, bad payloads and out-of-range times with 400", async () => {
    const day = 86_400_000;
    const cases: unknown[] = [
      recording({ bandNumber: 48 }),
      recording({ recordingId: "has space" }),
      recording({ transcript: "   " }),
      recording({ transcript: "x".repeat(20_001) }),
      recording({ startedAt: "2026-11-14 10:00" }),
      recording({ endedAt: new Date(Date.now() - 3 * HOUR_MS).toISOString() }),
      recording({ stt: { provider: "whisper", model: null } }),
      recording({ gate: { provider: "gemini", model: null, veryPrivate: 2, healthRelated: 0.5, fallback: false } }),
      recording({ startedAt: new Date(Date.now() - 40 * day).toISOString(), endedAt: new Date().toISOString() }),
      recording({ startedAt: new Date(Date.now() + 2 * day).toISOString(), endedAt: new Date(Date.now() + 3 * day).toISOString() }),
    ];
    for (const payload of cases) {
      const res = await post(payload);
      expect(res.status).toBe(400);
      expect(JSON.stringify(res.body)).not.toContain("knee");
    }
    expect((await post(null, { raw: "{not json" })).status).toBe(400);
  });

  it("answers 503 when band ingest is not configured or the wearer is unknown", async () => {
    delete process.env.VEXO_BAND_SECRET;
    expect((await post(recording())).status).toBe(503);
    process.env.VEXO_BAND_SECRET = SECRET;
    process.env.VEXO_BAND_WEARER = "nobody@example.com";
    expect(await post(recording())).toEqual({ status: 503, body: { error: "Band wearer not found." } });
    process.env.VEXO_BAND_WEARER = "dr.elena.park@example.com"; // a doctor wears no band
    expect((await post(recording())).status).toBe(503);
  });
});

describe("route", () => {
  const url = "http://localhost/api/integrations/vexo/band";

  it("rejects a body over 256 KB with 413", async () => {
    const res = await POST(new Request(url, { method: "POST", body: "x".repeat(MAX_BAND_BODY_BYTES + 1) }));
    expect(res.status).toBe(413);
  });

  it("passes a signed post through to the service", async () => {
    const raw = JSON.stringify(recording());
    const headers = { "x-vexo-band-signature": signedHeader(raw, new Date()) };
    forbidActorRepo = true;
    try {
      const res = await POST(new Request(url, { method: "POST", body: raw, headers }));
      expect(res.status).toBe(200);
      expect(await res.json()).toMatchObject({ stored: true });
    } finally {
      forbidActorRepo = false;
    }
  });
});

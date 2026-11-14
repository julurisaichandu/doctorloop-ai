import { createHmac } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getSystemRepository } from "@/lib/data";
import { resetLocalDb } from "@/lib/data/local/local-db";
import { DEMO_ACCOUNTS, DEMO_IDS } from "@/lib/demo/seed";
import type { Actor, TranscriptTurn } from "@/lib/domain/types";
import { isAppError } from "@/lib/errors";
import { simulatedGreeting } from "@/components/voice/simulated-script";
import {
  AGENT_FIRST_MESSAGE,
  AGENT_SYSTEM_PROMPT,
  NOT_FOR_EMERGENCIES_SENTENCE,
} from "@/lib/integrations/elevenlabs/agent-config";
import * as elevenlabsServer from "@/lib/integrations/elevenlabs/server";
import { verifyAndParseWebhook } from "@/lib/integrations/elevenlabs/server";
import { patientBodyFromTranscript, toTranscriptTurns } from "@/lib/integrations/elevenlabs/transcript";
import {
  cancelVoiceSession,
  completeVoiceSession,
  handleElevenLabsWebhook,
  startVoiceSession,
} from "@/lib/services/voice";

vi.mock("@/lib/integrations/elevenlabs/server", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/integrations/elevenlabs/server")>();
  return { ...actual, fetchConversation: vi.fn() };
});

const SECRET = "test-webhook-secret";

function actorFor(email: string): Actor {
  const account = DEMO_ACCOUNTS.find((a) => a.email === email);
  if (!account) throw new Error(`Unknown demo account ${email}`);
  return {
    userId: account.userId,
    role: account.role,
    fullName: account.fullName,
    email: account.email,
    title: null,
    patientId: account.patientId,
  };
}

/** Signature scheme documented by ElevenLabs: header `t=<unix>,v0=<hex HMAC-SHA256 of "<t>.<body>">`. */
function sign(body: string, secret = SECRET, timestamp = Math.floor(Date.now() / 1000)): string {
  const digest = createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex");
  return `t=${timestamp},v0=${digest}`;
}

const maya = () => actorFor("maya.thompson@example.com");
const daniel = () => actorFor("daniel.okafor@example.com");

const MAYA_TRANSCRIPT: TranscriptTurn[] = [
  { role: "agent", text: "How are you feeling today?", at: null },
  {
    role: "patient",
    text: "My right knee has been aching since last night, about a 6 out of 10, and I only slept about 4 hours.",
    at: null,
  },
  { role: "agent", text: "Is there anything that makes it better or worse?", at: null },
  { role: "patient", text: "It is worse after climbing stairs.", at: null },
];

describe("ElevenLabs webhook verification", () => {
  const body = JSON.stringify({
    type: "post_call_transcription",
    data: { conversation_id: "conv_abc", transcript: [] },
  });

  beforeEach(() => {
    process.env.ELEVENLABS_WEBHOOK_SECRET = SECRET;
  });
  afterEach(() => {
    delete process.env.ELEVENLABS_WEBHOOK_SECRET;
  });

  it("accepts a correctly signed payload", async () => {
    const event = await verifyAndParseWebhook(body, sign(body));
    expect(event.type).toBe("post_call_transcription");
    expect(event.data?.conversation_id).toBe("conv_abc");
  });

  it("rejects tampered, unsigned, wrongly signed and stale payloads", async () => {
    await expect(verifyAndParseWebhook(`${body} `, sign(body))).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
    await expect(verifyAndParseWebhook(body, null)).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
    await expect(verifyAndParseWebhook(body, "garbage")).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
    await expect(verifyAndParseWebhook(body, sign(body, "other-secret"))).rejects.toMatchObject({
      code: "UNAUTHENTICATED",
    });
    const stale = Math.floor(Date.now() / 1000) - 3600;
    await expect(verifyAndParseWebhook(body, sign(body, SECRET, stale))).rejects.toMatchObject({
      code: "UNAUTHENTICATED",
    });
  });

  it("rejects everything when the secret is not configured", async () => {
    delete process.env.ELEVENLABS_WEBHOOK_SECRET;
    await expect(verifyAndParseWebhook(body, sign(body))).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
  });
});

describe("transcript mapping", () => {
  it("keeps only patient turns for the entry body", () => {
    expect(patientBodyFromTranscript(MAYA_TRANSCRIPT)).toBe(
      "My right knee has been aching since last night, about a 6 out of 10, and I only slept about 4 hours.\n\nIt is worse after climbing stairs.",
    );
  });

  it("maps ElevenLabs roles and drops empty or unknown turns", () => {
    const turns = toTranscriptTurns(
      [
        { role: "agent", message: "Hello", timeInCallSecs: 0 },
        { role: "user", message: "  My knee aches  ", timeInCallSecs: 4 },
        { role: "user", message: null },
        { role: "system", message: "ignored" },
      ],
      "2026-11-13T10:00:00.000Z",
    );
    expect(turns).toEqual([
      { role: "agent", text: "Hello", at: "2026-11-13T10:00:00.000Z" },
      { role: "patient", text: "My knee aches", at: "2026-11-13T10:00:04.000Z" },
    ]);
  });
});

describe("voice sessions (simulated mode, local DB)", () => {
  beforeEach(() => {
    resetLocalDb();
  });

  it("completes Maya's session into a pending voice entry with observations", async () => {
    const { session, connection } = await startVoiceSession(maya());
    expect(connection).toEqual({ mode: "simulated" });
    expect(session).toMatchObject({ mode: "simulated", status: "active", patientId: DEMO_IDS.patients.maya });

    const result = await completeVoiceSession(maya(), session.id, {
      transcript: MAYA_TRANSCRIPT,
      confirmedNotes: [],
    });

    expect(result.session.status).toBe("completed");
    expect(result.session.journalEntryId).toBe(result.entry?.entry.id);
    expect(result.entry?.entry).toMatchObject({
      source: "voice",
      reviewStatus: "pending_review",
      voiceSessionId: session.id,
    });
    expect(result.entry?.entry.body).not.toContain("How are you feeling today?");
    expect(result.entry?.observations.length).toBeGreaterThan(0);
    expect(result.entry?.sourceRef).toMatchObject({ provider: "elevenlabs", mode: "simulated", excerpt: null });
    expect(result.entry?.sourceRef?.metadata).toMatchObject({ transcriptSource: "simulated", conversationBound: false });

    // A finished session cannot be completed again (no duplicate entries).
    await expect(
      completeVoiceSession(maya(), session.id, { transcript: MAYA_TRANSCRIPT, confirmedNotes: [] }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("completes without an entry when the patient said nothing", async () => {
    const { session } = await startVoiceSession(maya());
    const result = await completeVoiceSession(maya(), session.id, {
      transcript: [{ role: "agent", text: "How are you feeling today?", at: null }],
      confirmedNotes: [],
    });
    expect(result.entry).toBeNull();
    expect(result.session).toMatchObject({ status: "completed", journalEntryId: null });
  });

  it("rejects oversized transcripts", async () => {
    const { session } = await startVoiceSession(maya());
    const turns: TranscriptTurn[] = Array.from({ length: 201 }, () => ({ role: "patient", text: "hi", at: null }));
    await expect(
      completeVoiceSession(maya(), session.id, { transcript: turns, confirmedNotes: [] }),
    ).rejects.toMatchObject({ code: "VALIDATION" });
  });

  it("does not let another patient complete or cancel Maya's session", async () => {
    const { session } = await startVoiceSession(maya());

    for (const attempt of [
      () => completeVoiceSession(daniel(), session.id, { transcript: MAYA_TRANSCRIPT, confirmedNotes: [] }),
      () => cancelVoiceSession(daniel(), session.id),
    ]) {
      const error = await attempt().then(
        () => null,
        (e: unknown) => e,
      );
      expect(isAppError(error) && ["FORBIDDEN", "NOT_FOUND"].includes(error.code)).toBe(true);
    }

    const stored = await getSystemRepository().getVoiceSession(session.id);
    expect(stored?.status).toBe("active");
  });

  it("cancels an active session", async () => {
    const { session } = await startVoiceSession(maya());
    const cancelled = await cancelVoiceSession(maya(), session.id);
    expect(cancelled.status).toBe("cancelled");
  });
});

describe("handleElevenLabsWebhook", () => {
  beforeEach(() => {
    resetLocalDb();
    process.env.ELEVENLABS_WEBHOOK_SECRET = SECRET;
  });
  afterEach(() => {
    delete process.env.ELEVENLABS_WEBHOOK_SECRET;
  });

  it("acknowledges a matching session without storing any transcript text, ignores unknown events, rejects bad signatures", async () => {
    const repo = getSystemRepository();
    const session = await repo.createVoiceSession({
      patientId: DEMO_IDS.patients.maya,
      mode: "elevenlabs",
      status: "completed",
      externalConversationId: "conv_xyz",
      transcript: [],
      confirmedNotes: [],
      startedAt: "2026-11-13T10:00:00.000Z",
      endedAt: "2026-11-13T10:05:00.000Z",
      journalEntryId: null,
    });

    const body = JSON.stringify({
      type: "post_call_transcription",
      data: {
        conversation_id: "conv_xyz",
        transcript: [
          { role: "agent", message: "How are you feeling today?", time_in_call_secs: 0 },
          { role: "user", message: "My knee aches.", time_in_call_secs: 5 },
        ],
      },
    });
    await expect(handleElevenLabsWebhook(body, sign(body))).resolves.toEqual({ handled: true });
    const updated = await repo.getVoiceSession(session.id);
    // Data minimisation: the webhook never writes transcript text back.
    expect(updated?.transcript).toEqual([]);
    expect(updated?.journalEntryId).toBeNull();

    const other = JSON.stringify({ type: "post_call_audio", data: {} });
    await expect(handleElevenLabsWebhook(other, sign(other))).resolves.toEqual({ handled: false });

    await expect(handleElevenLabsWebhook(body, "t=1,v0=bad")).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
  });
});

describe("agent scope", () => {
  it("states the fixed non-emergency sentence and never asks the agent to judge urgency", () => {
    expect(AGENT_FIRST_MESSAGE).toContain(NOT_FOR_EMERGENCIES_SENTENCE);
    expect(simulatedGreeting("Maya")).toContain(NOT_FOR_EMERGENCIES_SENTENCE);
    expect(AGENT_SYSTEM_PROMPT).not.toMatch(/sounds urgent/i);
    expect(AGENT_SYSTEM_PROMPT).toMatch(/Never assess urgency, severity or risk/);
  });
});

describe("live conversation binding", () => {
  const fetchConversation = vi.mocked(elevenlabsServer.fetchConversation);
  const turns: TranscriptTurn[] = [
    { role: "agent", text: "How are you feeling today?", at: null },
    { role: "patient", text: "My knee aches since last night.", at: null },
  ];

  async function liveSession(bound: string | null = null) {
    return getSystemRepository().createVoiceSession({
      patientId: DEMO_IDS.patients.maya,
      mode: "elevenlabs",
      status: "active",
      externalConversationId: bound,
      transcript: [],
      confirmedNotes: [],
      startedAt: new Date().toISOString(),
      endedAt: null,
      journalEntryId: null,
    });
  }
  const snapshot = (
    over: Partial<elevenlabsServer.ConversationSnapshot> = {},
  ): elevenlabsServer.ConversationSnapshot => ({
    agentMatches: true,
    sessionIds: [],
    startedAtMs: Date.now(),
    transcript: turns,
    ...over,
  });

  beforeEach(() => {
    resetLocalDb();
    fetchConversation.mockReset();
  });

  it("rejects a conversation that does not carry this session id, or is foreign/stale", async () => {
    const session = await liveSession();
    for (const snap of [
      snapshot({ sessionIds: ["someone-elses-session"] }),
      snapshot({ sessionIds: [] }),
      snapshot({ sessionIds: [session.id], agentMatches: false }),
      snapshot({ sessionIds: [session.id], startedAtMs: Date.now() - 10 * 60_000 }),
    ]) {
      fetchConversation.mockResolvedValueOnce(snap);
      await expect(
        completeVoiceSession(maya(), session.id, {
          transcript: [],
          externalConversationId: "conv_foreign",
          confirmedNotes: [],
        }),
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
    }
    expect((await getSystemRepository().getVoiceSession(session.id))?.status).toBe("active");
  });

  it("accepts a matching conversation, uses its transcript and records provenance without free text", async () => {
    const session = await liveSession();
    fetchConversation.mockResolvedValueOnce(snapshot({ sessionIds: [session.id] }));
    const result = await completeVoiceSession(maya(), session.id, {
      transcript: [{ role: "patient", text: "client-forged text", at: null }],
      externalConversationId: "conv_ok",
      confirmedNotes: [],
    });
    expect(result.session.externalConversationId).toBe("conv_ok");
    expect(result.entry?.entry.body).toBe("My knee aches since last night.");
    expect(result.entry?.sourceRef).toMatchObject({ excerpt: null, externalId: "conv_ok" });
    expect(result.entry?.sourceRef?.metadata).toMatchObject({
      transcriptSource: "elevenlabs_api",
      conversationBound: true,
    });
  });

  it("requires a client id to match the id bound at start; a failed fetch is client_unverified", async () => {
    const session = await liveSession("conv_bound");
    await expect(
      completeVoiceSession(maya(), session.id, {
        transcript: turns,
        externalConversationId: "conv_other",
        confirmedNotes: [],
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });

    fetchConversation.mockResolvedValueOnce(null);
    const result = await completeVoiceSession(maya(), session.id, {
      transcript: turns,
      externalConversationId: "conv_bound",
      confirmedNotes: [],
    });
    expect(result.entry?.sourceRef).toMatchObject({ excerpt: null });
    expect(result.entry?.sourceRef?.metadata).toMatchObject({
      transcriptSource: "client_unverified",
      conversationBound: true,
    });
  });

  it("never trusts an unverifiable client conversation id", async () => {
    const session = await liveSession();
    fetchConversation.mockResolvedValueOnce(null);
    const result = await completeVoiceSession(maya(), session.id, {
      transcript: turns,
      externalConversationId: "conv_unknown",
      confirmedNotes: [],
    });
    expect(result.session.externalConversationId).toBeNull();
    expect(result.entry?.sourceRef?.metadata).toMatchObject({
      transcriptSource: "client_unverified",
      conversationBound: false,
    });
  });

  it("webhook ignores unbound conversations and mismatching session ids, and never creates entries", async () => {
    process.env.ELEVENLABS_WEBHOOK_SECRET = SECRET;
    try {
      const session = await liveSession("conv_hook");
      const payload = (conv: string, extra: object = {}) =>
        JSON.stringify({
          type: "post_call_transcription",
          data: { conversation_id: conv, transcript: [{ role: "user", message: "hi", time_in_call_secs: 1 }], ...extra },
        });
      const withVar = (id: string) => ({ conversation_initiation_client_data: { dynamic_variables: { doctorloop_session_id: id } } });

      const unbound = payload("conv_never_bound");
      await expect(handleElevenLabsWebhook(unbound, sign(unbound))).resolves.toEqual({ handled: false });

      const wrong = payload("conv_hook", withVar("other"));
      await expect(handleElevenLabsWebhook(wrong, sign(wrong))).resolves.toEqual({ handled: false });
      expect((await getSystemRepository().getVoiceSession(session.id))?.transcript).toHaveLength(0);

      const ok = payload("conv_hook", withVar(session.id));
      await expect(handleElevenLabsWebhook(ok, sign(ok))).resolves.toEqual({ handled: true });
      const stored = await getSystemRepository().getVoiceSession(session.id);
      expect(stored?.transcript).toHaveLength(0);
      expect(stored?.journalEntryId).toBeNull();
    } finally {
      delete process.env.ELEVENLABS_WEBHOOK_SECRET;
    }
  });
});

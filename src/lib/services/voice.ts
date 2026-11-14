import "server-only";

import { assertPatientSelf } from "@/lib/authz/policies";
import { getRepository, getSystemRepository } from "@/lib/data";
import type { Actor, TimelineEntryView, TranscriptTurn, VoiceSession } from "@/lib/domain/types";
import { conflict, forbidden, notFound, validationError } from "@/lib/errors";
import {
  createConversationCredentials,
  fetchConversation,
  getVoiceMode,
  verifyAndParseWebhook,
  webhookSessionIds,
} from "@/lib/integrations/elevenlabs/server";
import {
  type CompleteVoiceInput,
  completeVoiceInputSchema,
  patientBodyFromTranscript,
} from "@/lib/integrations/elevenlabs/transcript";
import type { VoiceConnection } from "@/lib/integrations/elevenlabs/types";
import { filterForStorage, ingestFilteredEntry } from "@/lib/services/ingest";

export type { VoiceConnection };

export async function startVoiceSession(
  actor: Actor,
): Promise<{ session: VoiceSession; connection: VoiceConnection }> {
  const patientId = assertPatientSelf(actor);
  const mode = getVoiceMode();
  // Mint credentials first so a failed provider call does not leave a dangling active session.
  const credentials = mode === "elevenlabs" ? await createConversationCredentials() : null;
  const connection: VoiceConnection = credentials?.connection ?? { mode: "simulated" };

  const session = await getRepository(actor).createVoiceSession({
    patientId,
    mode,
    status: "active",
    // Bound at start when the WebRTC token exposes the conversation id.
    externalConversationId: credentials?.conversationId ?? null,
    transcript: [],
    confirmedNotes: [],
    startedAt: new Date().toISOString(),
    endedAt: null,
    journalEntryId: null,
  });
  return { session, connection };
}

async function loadActiveSession(actor: Actor, sessionId: string): Promise<VoiceSession> {
  const patientId = assertPatientSelf(actor);
  const session = await getRepository(actor).getVoiceSession(sessionId);
  // Rows of other patients behave as "not found"; the explicit check keeps that true for any repository.
  if (!session || session.patientId !== patientId) throw notFound("Voice session not found.");
  if (session.status !== "active") throw conflict("This check-in has already been finished.");
  return session;
}

/** A conversation may start slightly before the session row is created (token minted first). */
const START_SKEW_MS = 60_000;

type TranscriptSource = "elevenlabs_api" | "client_unverified" | "simulated";

interface ResolvedTranscript {
  transcript: TranscriptTurn[];
  transcriptSource: TranscriptSource;
  /** Conversation id verified to belong to this session (null: none trusted). */
  conversationId: string | null;
}

/**
 * Prefer the transcript ElevenLabs recorded for a conversation verified to belong to this
 * session; otherwise fall back to what the browser captured (labelled unverified).
 * Throws FORBIDDEN when the conversation is not this session's.
 */
async function resolveTranscript(
  session: VoiceSession,
  clientTranscript: TranscriptTurn[],
  clientConversationId: string | null,
): Promise<ResolvedTranscript> {
  if (session.mode !== "elevenlabs") {
    return { transcript: clientTranscript, transcriptSource: "simulated", conversationId: null };
  }
  const bound = session.externalConversationId;
  if (bound && clientConversationId && clientConversationId !== bound) {
    throw forbidden("This conversation does not belong to this check-in.");
  }
  const conversationId = bound ?? clientConversationId;
  const unverified: ResolvedTranscript = {
    transcript: clientTranscript,
    transcriptSource: "client_unverified",
    conversationId: bound,
  };
  if (!conversationId) return unverified;

  // Another session already owns this conversation.
  const existing = await getSystemRepository().findVoiceSessionByConversationId(conversationId);
  if (existing && existing.id !== session.id) throw forbidden("This conversation does not belong to this check-in.");

  const snapshot = await fetchConversation(conversationId);
  if (!snapshot) return unverified; // not ready / unavailable: never trust the client-supplied id
  if (!snapshot.agentMatches) throw forbidden("This conversation does not belong to this check-in.");
  if (!bound) {
    const carriesSession = snapshot.sessionIds.includes(session.id);
    const startedOk = snapshot.startedAtMs >= Date.parse(session.startedAt) - START_SKEW_MS;
    if (!carriesSession || !startedOk) throw forbidden("This conversation does not belong to this check-in.");
  }
  if (!patientBodyFromTranscript(snapshot.transcript)) return { ...unverified, conversationId };
  return { transcript: snapshot.transcript, transcriptSource: "elevenlabs_api", conversationId };
}

export async function completeVoiceSession(
  actor: Actor,
  sessionId: string,
  rawInput: CompleteVoiceInput,
): Promise<{ session: VoiceSession; entry: TimelineEntryView | null }> {
  const parsed = completeVoiceInputSchema.safeParse(rawInput);
  if (!parsed.success) throw validationError("The check-in transcript is invalid.");
  const input = parsed.data;

  // Ownership verified here; every later write goes through the system repository (§5.1).
  const session = await loadActiveSession(actor, sessionId);
  const system = getSystemRepository();

  const resolved = await resolveTranscript(session, input.transcript, input.externalConversationId ?? null);
  const { transcript, transcriptSource, conversationId } = resolved;
  const body = patientBodyFromTranscript(transcript);
  const endedAt = new Date().toISOString();
  // Data minimisation: the raw call transcript and in-call notes are only used to build the
  // privacy-filtered entry below and are never persisted (the entry receipt promises that
  // removed parts were never saved). Only counts survive, in the source reference metadata.
  const common = {
    status: "completed" as const,
    externalConversationId: conversationId,
    transcript: [],
    confirmedNotes: [],
    endedAt,
  };

  if (!body) {
    const updated = await system.updateVoiceSession(session.id, { ...common, journalEntryId: null });
    return { session: updated, entry: null };
  }

  // Filter first: if nothing health-related is left, no source reference or entry is created.
  const filtered = await filterForStorage(body, {
    patientId: session.patientId,
    trigger: { kind: actor.role, userId: actor.userId },
  });

  const sourceRef = await system.createSourceRef({
    patientId: session.patientId,
    provider: "elevenlabs",
    mode: session.mode === "elevenlabs" ? "live" : "simulated",
    externalId: conversationId,
    title: "Voice check-in",
    excerpt: null,
    sourceTimestamp: session.startedAt,
    retrievedAt: endedAt,
    metadata: {
      voiceSessionId: session.id,
      turnCount: transcript.length,
      transcriptSource,
      conversationBound: conversationId !== null,
    },
  });

  const entry = await ingestFilteredEntry(actor, filtered, {
    source: "voice",
    occurredAt: session.startedAt,
    sourceRefId: sourceRef.id,
    voiceSessionId: session.id,
  });

  const updated = await system.updateVoiceSession(session.id, { ...common, journalEntryId: entry.entry.id });
  return { session: updated, entry };
}

export async function cancelVoiceSession(actor: Actor, sessionId: string): Promise<VoiceSession> {
  const session = await loadActiveSession(actor, sessionId);
  return getSystemRepository().updateVoiceSession(session.id, {
    status: "cancelled",
    endedAt: new Date().toISOString(),
  });
}

/**
 * ElevenLabs post-call webhook. Verifies the signature and that the conversation is bound to
 * an existing session, then acknowledges. It never stores transcript text (data minimisation:
 * the privacy-filtered entry was already built when the patient finished the check-in) and
 * never creates entries, so retries and duplicates are harmless. Unknown events are ignored.
 * Throws UNAUTHENTICATED for a missing secret or invalid signature.
 */
export async function handleElevenLabsWebhook(
  rawBody: string,
  signatureHeader: string | null | undefined,
): Promise<{ handled: boolean }> {
  const event = await verifyAndParseWebhook(rawBody, signatureHeader);
  if (event.type !== "post_call_transcription") return { handled: false };

  const conversationId = event.data?.conversation_id;
  if (!conversationId || !event.data?.transcript) return { handled: false };

  const repo = getSystemRepository();
  const session = await repo.findVoiceSessionByConversationId(conversationId);
  if (!session) return { handled: false };
  // Only sessions already bound to this conversation; a payload that names another session is ignored.
  const claimed = webhookSessionIds(event.data);
  if (claimed.length > 0 && !claimed.includes(session.id)) return { handled: false };

  return { handled: true };
}

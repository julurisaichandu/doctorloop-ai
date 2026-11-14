import "server-only";

import { ElevenLabsClient } from "@elevenlabs/elevenlabs-js";
import { z } from "zod";
import { env } from "@/lib/config/env";
import type { TranscriptTurn, VoiceSessionMode } from "@/lib/domain/types";
import { integrationError, unauthenticated, validationError } from "@/lib/errors";
import { SESSION_ID_VARIABLE } from "./agent-config";
import { type RawTranscriptItem, toTranscriptTurns } from "./transcript";
import type { VoiceConnection } from "./types";

const POLL_INTERVAL_MS = 1000;
const POLL_BUDGET_MS = 8000;

export function getVoiceMode(): VoiceSessionMode {
  return env.elevenlabsApiKey && env.elevenlabsAgentId ? "elevenlabs" : "simulated";
}

function createClient(): ElevenLabsClient {
  const apiKey = env.elevenlabsApiKey;
  if (!apiKey) throw integrationError("ElevenLabs is not configured.");
  return new ElevenLabsClient({ apiKey });
}

export type ConversationCredentials = Extract<VoiceConnection, { mode: "elevenlabs" }>;

/**
 * Mints short-lived credentials for the browser so the API key never leaves the server.
 * Prefers a WebRTC conversation token (which exposes the conversation id, so the conversation
 * can be bound to the voice session at start); falls back to a websocket signed URL.
 */
export async function createConversationCredentials(): Promise<{
  connection: ConversationCredentials;
  conversationId: string | null;
}> {
  const agentId = env.elevenlabsAgentId;
  if (!agentId) throw integrationError("ElevenLabs agent is not configured.");
  const client = createClient();

  try {
    const { token, conversationId } = await client.conversationalAi.conversations.getWebrtcToken({ agentId });
    return {
      connection: { mode: "elevenlabs", agentId, conversationToken: token, signedUrl: null },
      conversationId: conversationId || null,
    };
  } catch (webrtcError) {
    console.warn("[voice] WebRTC token request failed; trying signed URL.", errorSummary(webrtcError));
  }
  try {
    const { signedUrl } = await client.conversationalAi.conversations.getSignedUrl({ agentId });
    return {
      connection: { mode: "elevenlabs", agentId, conversationToken: null, signedUrl },
      conversationId: null,
    };
  } catch (signedUrlError) {
    console.error("[voice] Signed URL request failed.", errorSummary(signedUrlError));
    throw integrationError("Could not start the voice check-in. Please try again or use text instead.");
  }
}

/** A fetched conversation reduced to what the binding checks and the transcript need. */
export interface ConversationSnapshot {
  agentMatches: boolean;
  /** Session id the conversation was started with (`userId` or the `doctorloop_session_id` variable). */
  sessionIds: string[];
  startedAtMs: number;
  transcript: TranscriptTurn[];
}

/**
 * Fetches a finished conversation. Polls briefly because ElevenLabs processes the call after it
 * ends. Returns null when it is not ready, not found, failed, or the request fails; callers then
 * fall back to the client transcript (labelled unverified). Ownership checks are the caller's job.
 */
export async function fetchConversation(conversationId: string): Promise<ConversationSnapshot | null> {
  if (!env.elevenlabsApiKey) return null;
  const client = createClient();
  const deadline = Date.now() + POLL_BUDGET_MS;

  for (;;) {
    try {
      const conversation = await client.conversationalAi.conversations.get(conversationId);
      if (conversation.status === "failed") return null;
      if (conversation.status === "done") {
        const startedAtMs = conversation.metadata.startTimeUnixSecs * 1000;
        const initiation = conversation.conversationInitiationClientData;
        const variable = initiation?.dynamicVariables?.[SESSION_ID_VARIABLE];
        const sessionIds = [conversation.userId, initiation?.userId, typeof variable === "string" ? variable : undefined]
          .filter((value): value is string => typeof value === "string" && value.length > 0);
        return {
          agentMatches: !env.elevenlabsAgentId || conversation.agentId === env.elevenlabsAgentId,
          sessionIds,
          startedAtMs,
          transcript: toTranscriptTurns(conversation.transcript, new Date(startedAtMs).toISOString()),
        };
      }
    } catch (error) {
      // Not found yet / transient failure: keep polling until the budget is spent.
      console.warn("[voice] Transcript fetch not ready.", errorSummary(error));
    }
    if (Date.now() + POLL_INTERVAL_MS > deadline) return null;
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
  }
}

// ---------------------------------------------------------------------------
// Webhooks
// ---------------------------------------------------------------------------

const webhookTurnSchema = z.object({
  role: z.string(),
  message: z.string().nullish(),
  time_in_call_secs: z.number().nullish(),
});

const webhookEventSchema = z.object({
  type: z.string(),
  data: z
    .object({
      conversation_id: z.string().optional(),
      agent_id: z.string().optional(),
      transcript: z.array(webhookTurnSchema).optional(),
      user_id: z.string().nullish(),
      conversation_initiation_client_data: z
        .object({
          user_id: z.string().nullish(),
          dynamic_variables: z.record(z.string(), z.unknown()).nullish(),
        })
        .passthrough()
        .nullish(),
    })
    .passthrough()
    .optional(),
});

export type ElevenLabsWebhookEvent = z.infer<typeof webhookEventSchema>;

export function webhookTurnsToRaw(turns: z.infer<typeof webhookTurnSchema>[]): RawTranscriptItem[] {
  return turns.map((turn) => ({ role: turn.role, message: turn.message, timeInCallSecs: turn.time_in_call_secs }));
}

/**
 * Verifies the `ElevenLabs-Signature` header (`t=<unix>,v0=<hex HMAC-SHA256 of "<t>.<rawBody>">`,
 * 30 minute tolerance) with the SDK helper and returns the parsed event.
 * Throws UNAUTHENTICATED when the secret is unset or the signature is missing/invalid.
 */
export async function verifyAndParseWebhook(
  rawBody: string,
  signatureHeader: string | null | undefined,
): Promise<ElevenLabsWebhookEvent> {
  const secret = env.elevenlabsWebhookSecret;
  if (!secret) throw unauthenticated("Webhook secret is not configured.");
  if (!signatureHeader) throw unauthenticated("Missing webhook signature.");

  let event: unknown;
  try {
    // The key is irrelevant for verification; the SDK client only needs a non-empty value.
    const client = new ElevenLabsClient({ apiKey: env.elevenlabsApiKey ?? "webhook-verification-only" });
    event = await client.webhooks.constructEvent(rawBody, signatureHeader, secret);
  } catch {
    throw unauthenticated("Invalid webhook signature.");
  }
  const parsed = webhookEventSchema.safeParse(event);
  if (!parsed.success) throw validationError("Malformed webhook payload.");
  return parsed.data;
}

/** Session ids a webhook payload carries (empty when the conversation was started without them). */
export function webhookSessionIds(data: NonNullable<ElevenLabsWebhookEvent["data"]>): string[] {
  const initiation = data.conversation_initiation_client_data;
  const variable = initiation?.dynamic_variables?.[SESSION_ID_VARIABLE];
  return [data.user_id, initiation?.user_id, typeof variable === "string" ? variable : undefined].filter(
    (value): value is string => typeof value === "string" && value.length > 0,
  );
}

function errorSummary(error: unknown): string {
  return error instanceof Error ? error.message : "unknown error";
}

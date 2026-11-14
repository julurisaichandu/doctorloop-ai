import { z } from "zod";
import type { TranscriptTurn } from "@/lib/domain/types";

/** Pure transcript helpers shared by the service, the webhook and the server action. */

export const MAX_TURNS = 200;
export const MAX_TURN_CHARS = 4000;

export const transcriptTurnSchema = z.object({
  role: z.enum(["agent", "patient"]),
  text: z.string().max(MAX_TURN_CHARS),
  at: z.string().nullable().default(null),
});

export const clientTranscriptSchema = z.array(transcriptTurnSchema).max(MAX_TURNS);

export const completeVoiceInputSchema = z.object({
  transcript: clientTranscriptSchema,
  externalConversationId: z.string().min(1).max(200).nullish(),
  confirmedNotes: z.array(z.string().trim().min(1).max(500)).max(50).default([]),
});

export type CompleteVoiceInput = z.input<typeof completeVoiceInputSchema>;

/** Item shape shared by the ElevenLabs REST response (after SDK camel-casing) and webhook payloads. */
export interface RawTranscriptItem {
  role: string;
  message?: string | null;
  timeInCallSecs?: number | null;
}

/** ElevenLabs "user" is the patient; "agent" is the assistant. Empty messages are dropped. */
export function toTranscriptTurns(items: RawTranscriptItem[], startedAtIso?: string): TranscriptTurn[] {
  const startMs = startedAtIso ? Date.parse(startedAtIso) : Number.NaN;
  const turns: TranscriptTurn[] = [];
  for (const item of items.slice(0, MAX_TURNS)) {
    const text = (item.message ?? "").trim().slice(0, MAX_TURN_CHARS);
    if (!text) continue;
    if (item.role !== "user" && item.role !== "agent") continue;
    const at =
      Number.isFinite(startMs) && typeof item.timeInCallSecs === "number"
        ? new Date(startMs + item.timeInCallSecs * 1000).toISOString()
        : null;
    turns.push({ role: item.role === "user" ? "patient" : "agent", text, at });
  }
  return turns;
}

/** The journal entry body is the patient's own words only: assistant turns are never included. */
export function patientBodyFromTranscript(turns: TranscriptTurn[]): string {
  return turns
    .filter((turn) => turn.role === "patient")
    .map((turn) => turn.text.trim())
    .filter(Boolean)
    .join("\n\n");
}

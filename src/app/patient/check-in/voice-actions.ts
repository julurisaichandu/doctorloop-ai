"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireActor } from "@/lib/auth/session";
import { toActionResult } from "@/lib/errors";
import { clientTranscriptSchema, completeVoiceInputSchema } from "@/lib/integrations/elevenlabs/transcript";
import { cancelVoiceSession, completePipecatCheckIn, completeVoiceSession, startVoiceSession } from "@/lib/services/voice";

const completeActionSchema = completeVoiceInputSchema.extend({ sessionId: z.uuid() });
const pipecatSchema = z.object({ transcript: clientTranscriptSchema.min(1) });
const sessionIdSchema = z.uuid();

function revalidatePatientViews() {
  revalidatePath("/patient");
  revalidatePath("/patient/review");
}

export async function startVoiceSessionAction() {
  return toActionResult(async () => {
    const actor = await requireActor("patient");
    return startVoiceSession(actor);
  });
}

export async function completeVoiceSessionAction(input: z.input<typeof completeActionSchema>) {
  return toActionResult(async () => {
    const { sessionId, ...rest } = completeActionSchema.parse(input);
    const actor = await requireActor("patient");
    const result = await completeVoiceSession(actor, sessionId, rest);
    revalidatePatientViews();
    return result;
  });
}

export async function cancelVoiceSessionAction(sessionId: string) {
  return toActionResult(async () => {
    const id = sessionIdSchema.parse(sessionId);
    const actor = await requireActor("patient");
    const session = await cancelVoiceSession(actor, id);
    revalidatePatientViews();
    return session;
  });
}

export async function completePipecatCheckInAction(input: z.input<typeof pipecatSchema>) {
  return toActionResult(async () => {
    const parsed = pipecatSchema.parse(input);
    const actor = await requireActor("patient");
    const view = await completePipecatCheckIn(actor, parsed);
    revalidatePatientViews();
    return { entryId: view.entry.id };
  });
}

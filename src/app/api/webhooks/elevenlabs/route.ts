import { isAppError } from "@/lib/errors";
import { handleElevenLabsWebhook } from "@/lib/services/voice";

export const runtime = "nodejs";

/** ElevenLabs post-call webhook. Must read the raw body: the signature covers the exact bytes. */
export async function POST(request: Request): Promise<Response> {
  const rawBody = await request.text();
  const signature = request.headers.get("elevenlabs-signature");

  try {
    await handleElevenLabsWebhook(rawBody, signature);
    return Response.json({ received: true });
  } catch (error) {
    if (isAppError(error) && error.code === "UNAUTHENTICATED") {
      return Response.json({ error: "Invalid signature." }, { status: 401 });
    }
    if (isAppError(error) && error.code === "VALIDATION") {
      // Correctly signed but not an event we understand: acknowledge so it is not retried.
      return Response.json({ received: true, ignored: true });
    }
    console.error("[webhook:elevenlabs] Failed to process event.", error);
    return Response.json({ error: "Webhook processing failed." }, { status: 500 });
  }
}

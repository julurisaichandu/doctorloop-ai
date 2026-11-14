import { BAND_SIGNATURE_HEADER, MAX_BAND_BODY_BYTES } from "@/lib/integrations/vexo/band-bridge";
import { handleBandRecording } from "@/lib/services/vexo-band";

export const runtime = "nodejs";

const tooLarge = () => Response.json({ error: "Body is too large." }, { status: 413 });

/** Signed push of one band conversation from the local Pipecat bridge (band-bridge/). Raw body: the HMAC covers the exact bytes. */
export async function POST(request: Request): Promise<Response> {
  if (Number(request.headers.get("content-length") ?? 0) > MAX_BAND_BODY_BYTES) return tooLarge();
  const rawBody = await request.text();
  if (Buffer.byteLength(rawBody, "utf8") > MAX_BAND_BODY_BYTES) return tooLarge();
  const { status, body } = await handleBandRecording(rawBody, request.headers.get(BAND_SIGNATURE_HEADER));
  return Response.json(body, { status });
}

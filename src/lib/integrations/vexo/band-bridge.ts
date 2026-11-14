import "server-only";

import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";

/** Contract shared with band-bridge/ (Pipecat): see docs/ARCHITECTURE.md §6.8. */
export const BAND_SIGNATURE_HEADER = "x-vexo-band-signature";
export const BAND_SIGNATURE_TOLERANCE_SECONDS = 300;
export const MAX_BAND_BODY_BYTES = 256 * 1024;

/** Hex HMAC-SHA256(secret, `${t}.${rawBody}`). */
export function signBandBody(secret: string, t: string, rawBody: string): string {
  return createHmac("sha256", secret).update(`${t}.${rawBody}`).digest("hex");
}

/** Header `t=<unix seconds>,v1=<hex>`: valid only within the tolerance and with a matching HMAC. */
export function verifyBandSignature(header: string | null, rawBody: string, secret: string, now: Date): boolean {
  if (!header) return false;
  const parts = new Map(header.split(",").map((part) => part.trim().split("=", 2) as [string, string]));
  const t = parts.get("t");
  const v1 = parts.get("v1");
  if (!t || !/^\d{1,12}$/.test(t) || !v1 || !/^[0-9a-f]{64}$/i.test(v1)) return false;
  if (Math.abs(now.getTime() / 1000 - Number(t)) > BAND_SIGNATURE_TOLERANCE_SECONDS) return false;
  const expected = Buffer.from(signBandBody(secret, t, rawBody), "hex");
  const given = Buffer.from(v1, "hex");
  return given.length === expected.length && timingSafeEqual(given, expected);
}

const isoWithOffset = z.iso.datetime({ offset: true });

export const bandRecordingSchema = z
  .object({
    bandNumber: z.number().int().min(1).max(999),
    recordingId: z.string().regex(/^[A-Za-z0-9_-]{1,128}$/),
    mode: z.enum(["live", "simulated"]),
    startedAt: isoWithOffset,
    endedAt: isoWithOffset,
    transcript: z
      .string()
      .min(1)
      .max(20_000)
      .refine((text) => text.trim().length > 0),
    stt: z.object({ provider: z.enum(["deepgram", "typed"]), model: z.string().max(200).nullable() }),
    gate: z.object({
      provider: z.enum(["gemini", "rule-based"]),
      model: z.string().max(200).nullable(),
      veryPrivate: z.number().min(0).max(1),
      healthRelated: z.number().min(0).max(1),
      fallback: z.boolean(),
    }),
  })
  .refine((r) => Date.parse(r.endedAt) >= Date.parse(r.startedAt), { path: ["endedAt"] });

export type BandRecording = z.infer<typeof bandRecordingSchema>;

export const bandExternalId = (bandNumber: number, recordingId: string) => `band-${bandNumber}:${recordingId}`;

/** Deterministic v4-shaped UUID from sha256(externalId), so a retry maps to the same source reference. */
export function bandSourceRefId(externalId: string): string {
  const b = createHash("sha256").update(externalId).digest().subarray(0, 16);
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const hex = b.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

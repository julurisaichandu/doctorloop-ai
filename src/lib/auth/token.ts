import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";
import { env } from "@/lib/config/env";

/** Local-mode session cookie name. */
export const SESSION_COOKIE = "dl_session";
export const SESSION_MAX_AGE_SECONDS = 7 * 24 * 60 * 60;

interface SessionPayload {
  userId: string;
  /** Issued-at, seconds since epoch. */
  iat: number;
}

const sign = (data: string): Buffer => createHmac("sha256", env.sessionSecret).update(data).digest();

/** `base64url(JSON{userId, iat}).base64url(HMAC-SHA256)` */
export function createSessionToken(userId: string, nowMs: number = Date.now()): string {
  const payload: SessionPayload = { userId, iat: Math.floor(nowMs / 1000) };
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${body}.${sign(body).toString("base64url")}`;
}

/** Returns the user id for a valid, unexpired token; otherwise null. */
export function verifySessionToken(token: string | undefined, nowMs: number = Date.now()): string | null {
  if (!token) return null;
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const [body, signature] = parts;

  const expected = sign(body);
  const given = Buffer.from(signature, "base64url");
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;

  try {
    const payload: unknown = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
    if (typeof payload !== "object" || payload === null) return null;
    const { userId, iat } = payload as Partial<SessionPayload>;
    if (typeof userId !== "string" || typeof iat !== "number") return null;
    const ageSeconds = nowMs / 1000 - iat;
    if (ageSeconds < 0 || ageSeconds > SESSION_MAX_AGE_SECONDS) return null;
    return userId;
  } catch {
    return null;
  }
}

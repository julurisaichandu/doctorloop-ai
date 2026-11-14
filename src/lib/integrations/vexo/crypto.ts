import "server-only";
import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from "node:crypto";
import { env } from "@/lib/config/env";

const ALGORITHM = "aes-256-gcm";
const IV_BYTES = 12;
const TAG_BYTES = 16;

export type SecretPurpose = "tokens" | "oauth-cookie";

const INFO_LABELS: Record<SecretPurpose, string> = {
  tokens: "doctorloop/vexo-tokens/v1",
  "oauth-cookie": "doctorloop/vexo-oauth-cookie/v1",
};

/** HKDF-SHA256 key per purpose, so one secret never keys two different uses. */
function deriveKey(secret: string, purpose: SecretPurpose): Buffer {
  return Buffer.from(hkdfSync("sha256", secret, Buffer.alloc(0), INFO_LABELS[purpose], 32));
}

/** AES-256-GCM with AAD (the user id). Payload = base64url(iv | authTag | ciphertext). */
export function encryptSecret(
  plaintext: string,
  purpose: SecretPurpose,
  aad: string,
  secret: string = env.tokenEncryptionKey,
): string {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, deriveKey(secret, purpose), iv);
  cipher.setAAD(Buffer.from(aad, "utf8"));
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), ciphertext]).toString("base64url");
}

/** Throws when the payload is malformed, tampered with, bound to other AAD, or keyed differently. */
export function decryptSecret(
  payload: string,
  purpose: SecretPurpose,
  aad: string,
  secret: string = env.tokenEncryptionKey,
): string {
  const raw = Buffer.from(payload, "base64url");
  if (raw.length < IV_BYTES + TAG_BYTES) throw new Error("Encrypted payload is malformed.");
  const iv = raw.subarray(0, IV_BYTES);
  const tag = raw.subarray(IV_BYTES, IV_BYTES + TAG_BYTES);
  const ciphertext = raw.subarray(IV_BYTES + TAG_BYTES);
  const decipher = createDecipheriv(ALGORITHM, deriveKey(secret, purpose), iv);
  decipher.setAAD(Buffer.from(aad, "utf8"));
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
}

export function encryptJson(value: unknown, purpose: SecretPurpose, aad: string, secret?: string): string {
  return encryptSecret(JSON.stringify(value), purpose, aad, secret);
}

export function decryptJson(payload: string, purpose: SecretPurpose, aad: string, secret?: string): unknown {
  return JSON.parse(decryptSecret(payload, purpose, aad, secret));
}

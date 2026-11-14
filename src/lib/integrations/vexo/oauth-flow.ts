import "server-only";
import { randomBytes } from "node:crypto";
import {
  discoverOAuthServerInfo,
  exchangeAuthorization,
  registerClient,
  startAuthorization,
} from "@modelcontextprotocol/sdk/client/auth.js";
import type { OAuthClientInformationMixed } from "@modelcontextprotocol/sdk/shared/auth.js";
import { z } from "zod";
import { env } from "@/lib/config/env";
import { getSystemRepository } from "@/lib/data";
import { integrationError } from "@/lib/errors";
import { decryptJson, encryptJson } from "./crypto";
import {
  VexoOAuthProvider,
  buildClientMetadata,
  buildConnectionRecord,
  configuredClientInformation,
  parseClientInformation,
} from "./oauth-provider";

export const VEXO_OAUTH_COOKIE = "dl_vexo_oauth";
export const VEXO_OAUTH_COOKIE_MAX_AGE_SECONDS = 600;

const pendingSchema = z.object({
  userId: z.string(),
  state: z.string(),
  codeVerifier: z.string(),
  clientInfo: z.unknown(),
  authorizationServerUrl: z.string(),
  createdAt: z.number(),
});

/** Fixed error codes surfaced to the import page (never free text). */
export const VEXO_ERROR_CODES = [
  "access_denied",
  "state_mismatch",
  "issuer_mismatch",
  "token_exchange_failed",
  "not_configured",
  "unknown",
] as const;
export type VexoErrorCode = (typeof VEXO_ERROR_CODES)[number];

export class VexoOAuthError extends Error {
  constructor(readonly code: VexoErrorCode) {
    super(code);
  }
}

export function vexoErrorCodeOf(error: unknown): VexoErrorCode {
  return error instanceof VexoOAuthError ? error.code : "unknown";
}

type ServerMetadataExtras = {
  revocation_endpoint?: string;
  authorization_response_iss_parameter_supported?: boolean;
};
const extrasOf = (metadata: unknown): ServerMetadataExtras => (metadata ?? {}) as ServerMetadataExtras;

const trimSlash = (value: string) => value.replace(/\/+$/, "");

/** RFC 9207 issuer check; a missing `iss` is rejected when the server advertises support. */
export function issuerAcceptable(issuer: string | null, expected: string, required: boolean): boolean {
  if (!issuer) return !required;
  return trimSlash(issuer) === trimSlash(expected);
}

/** Best-effort token revocation (RFC 7009) at the server's revocation endpoint; never throws. */
export async function revokeVexoTokens(userId: string): Promise<void> {
  try {
    const connection = await getSystemRepository().getVexoConnection(userId);
    if (!connection) return;
    const provider = new VexoOAuthProvider(userId);
    const tokens = await provider.tokens();
    const clientInfo = await provider.clientInformation();
    const server = await discoverOAuthServerInfo(env.vexoMcpUrl);
    const endpoint = extrasOf(server.authorizationServerMetadata).revocation_endpoint;
    if (!tokens || !endpoint) return;
    const toRevoke: Array<[string, string]> = [["access_token", tokens.access_token]];
    if (tokens.refresh_token) toRevoke.unshift(["refresh_token", tokens.refresh_token]);
    for (const [hint, token] of toRevoke) {
      const body = new URLSearchParams({ token, token_type_hint: hint });
      if (clientInfo?.client_id) body.set("client_id", clientInfo.client_id);
      if (clientInfo?.client_secret) body.set("client_secret", clientInfo.client_secret);
      await fetch(endpoint, {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body,
        signal: AbortSignal.timeout(5000),
      }).catch(() => undefined);
    }
  } catch {
    // Best effort: the stored connection is deleted regardless.
  }
}

/** Start OAuth 2.1 + PKCE (S256). Returns the Vexo authorization URL and the encrypted cookie payload. */
export async function beginVexoAuthorization(userId: string): Promise<{ url: string; cookieValue: string }> {
  const server = await discoverOAuthServerInfo(env.vexoMcpUrl);
  const metadata = server.authorizationServerMetadata;
  if (!metadata) throw integrationError("Could not discover the Vexo authorization server.");

  let clientInfo: OAuthClientInformationMixed | undefined = configuredClientInformation();
  if (!clientInfo) {
    if (!metadata.registration_endpoint) {
      throw integrationError("Vexo does not allow dynamic client registration. Set VEXO_CLIENT_ID.");
    }
    clientInfo = await registerClient(server.authorizationServerUrl, {
      metadata,
      clientMetadata: buildClientMetadata(),
      scope: env.vexoScopes,
    });
  }

  const state = randomBytes(24).toString("base64url");
  const { authorizationUrl, codeVerifier } = await startAuthorization(server.authorizationServerUrl, {
    metadata,
    clientInformation: clientInfo,
    redirectUrl: env.vexoRedirectUri,
    scope: env.vexoScopes,
    state,
    resource: new URL(env.vexoMcpUrl),
  });

  const cookieValue = encryptJson(
    {
      userId,
      state,
      codeVerifier,
      clientInfo,
      authorizationServerUrl: server.authorizationServerUrl,
      createdAt: Date.now(),
    },
    "oauth-cookie",
    userId,
  );
  return { url: authorizationUrl.toString(), cookieValue };
}

/** Validate state, exchange the code, and store the encrypted tokens. */
export async function completeVexoAuthorization(input: {
  userId: string;
  cookieValue: string | undefined;
  code: string | null;
  state: string | null;
  issuer: string | null;
}): Promise<void> {
  if (!input.cookieValue || !input.code || !input.state) {
    throw new VexoOAuthError("state_mismatch");
  }
  let pending: z.infer<typeof pendingSchema>;
  try {
    pending = pendingSchema.parse(decryptJson(input.cookieValue, "oauth-cookie", input.userId));
  } catch {
    throw new VexoOAuthError("state_mismatch");
  }
  if (pending.userId !== input.userId) throw new VexoOAuthError("state_mismatch");
  if (pending.state !== input.state) throw new VexoOAuthError("state_mismatch");
  if (Date.now() - pending.createdAt > VEXO_OAUTH_COOKIE_MAX_AGE_SECONDS * 1000) {
    throw new VexoOAuthError("state_mismatch");
  }

  const server = await discoverOAuthServerInfo(env.vexoMcpUrl);
  // RFC 9207: required when the server advertises support; otherwise validated if present.
  const issRequired = extrasOf(server.authorizationServerMetadata).authorization_response_iss_parameter_supported === true;
  if (!issuerAcceptable(input.issuer, pending.authorizationServerUrl, issRequired)) {
    throw new VexoOAuthError("issuer_mismatch");
  }

  const clientInfo = configuredClientInformation() ?? parseClientInformation(pending.clientInfo);
  if (!clientInfo) throw new VexoOAuthError("not_configured");

  let tokens;
  try {
    tokens = await exchangeAuthorization(pending.authorizationServerUrl, {
      metadata: server.authorizationServerMetadata,
      clientInformation: clientInfo,
      authorizationCode: input.code,
      codeVerifier: pending.codeVerifier,
      redirectUri: env.vexoRedirectUri,
      resource: new URL(env.vexoMcpUrl),
    });
  } catch {
    throw new VexoOAuthError("token_exchange_failed");
  }

  const repo = getSystemRepository();
  const existing = await repo.getVexoConnection(input.userId);
  await repo.saveVexoConnection(
    buildConnectionRecord({
      userId: input.userId,
      tokens,
      existing,
      clientInfo: configuredClientInformation() ? undefined : clientInfo,
    }),
  );
}

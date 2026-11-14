import "server-only";
import type { OAuthClientProvider } from "@modelcontextprotocol/sdk/client/auth.js";
import type {
  OAuthClientInformationMixed,
  OAuthClientMetadata,
  OAuthTokens,
} from "@modelcontextprotocol/sdk/shared/auth.js";
import { z } from "zod";
import { env } from "@/lib/config/env";
import { getSystemRepository } from "@/lib/data";
import { integrationError } from "@/lib/errors";
import { decryptJson, encryptJson } from "./crypto";

const tokenRecordSchema = z.object({
  tokens: z.object({
    access_token: z.string(),
    token_type: z.string(),
    refresh_token: z.string().optional(),
    expires_in: z.number().optional(),
    scope: z.string().optional(),
  }),
  /** Epoch ms when the tokens were saved; used to compute the remaining lifetime. */
  savedAt: z.number(),
});

const clientInfoSchema = z.object({
  client_id: z.string(),
  client_secret: z.string().optional(),
  client_id_issued_at: z.number().optional(),
  client_secret_expires_at: z.number().optional(),
  redirect_uris: z.array(z.string()).optional(),
});

export function buildClientMetadata(): OAuthClientMetadata {
  return {
    client_name: "DoctorLoop AI (synthetic demo)",
    redirect_uris: [env.vexoRedirectUri],
    grant_types: ["authorization_code", "refresh_token"],
    response_types: ["code"],
    scope: env.vexoScopes,
    token_endpoint_auth_method: env.vexoClientSecret ? "client_secret_post" : "none",
  };
}

/** Client credentials from the environment, when pre-registered; otherwise undefined. */
export function configuredClientInformation(): OAuthClientInformationMixed | undefined {
  const clientId = env.vexoClientId;
  if (!clientId) return undefined;
  return env.vexoClientSecret
    ? { client_id: clientId, client_secret: env.vexoClientSecret }
    : { client_id: clientId };
}

export function parseClientInformation(value: unknown): OAuthClientInformationMixed | undefined {
  const parsed = clientInfoSchema.safeParse(value);
  return parsed.success ? parsed.data : undefined;
}

/**
 * OAuthClientProvider backed by server-side encrypted storage (vexo_connections).
 * Tokens and client information never leave the server. The interactive authorization
 * redirect is handled by the connect/callback route handlers, so a request that needs
 * re-authorization here fails with a clear error instead of redirecting.
 */
export class VexoOAuthProvider implements OAuthClientProvider {
  constructor(private readonly userId: string) {}

  get redirectUrl(): string {
    return env.vexoRedirectUri;
  }

  get clientMetadata(): OAuthClientMetadata {
    return buildClientMetadata();
  }

  async clientInformation(): Promise<OAuthClientInformationMixed | undefined> {
    const configured = configuredClientInformation();
    if (configured) return configured;
    const connection = await getSystemRepository().getVexoConnection(this.userId);
    if (!connection?.clientInfoEnc) return undefined;
    return parseClientInformation(decryptJson(connection.clientInfoEnc, "tokens", this.userId));
  }

  async tokens(): Promise<OAuthTokens | undefined> {
    const connection = await getSystemRepository().getVexoConnection(this.userId);
    if (!connection) return undefined;
    const record = tokenRecordSchema.parse(decryptJson(connection.tokensEnc, "tokens", this.userId));
    const { tokens } = record;
    if (tokens.expires_in === undefined) return tokens;
    const elapsedSeconds = Math.floor((Date.now() - record.savedAt) / 1000);
    return { ...tokens, expires_in: Math.max(tokens.expires_in - elapsedSeconds, 0) };
  }

  async saveTokens(tokens: OAuthTokens): Promise<void> {
    const repo = getSystemRepository();
    const existing = await repo.getVexoConnection(this.userId);
    await repo.saveVexoConnection(
      buildConnectionRecord({ userId: this.userId, tokens, existing, clientInfo: undefined }),
    );
  }

  redirectToAuthorization(): never {
    throw integrationError("Your Vexo connection needs to be renewed. Please reconnect Vexo.");
  }

  saveCodeVerifier(): never {
    throw new Error("PKCE verifiers are stored in the connect cookie, not by the provider.");
  }

  codeVerifier(): never {
    throw new Error("PKCE verifiers are stored in the connect cookie, not by the provider.");
  }

  async invalidateCredentials(scope: "all" | "client" | "tokens" | "verifier" | "discovery"): Promise<void> {
    if (scope === "all" || scope === "tokens") {
      await getSystemRepository().deleteVexoConnection(this.userId);
    }
  }
}

/** Build the encrypted connection row; keeps existing client info unless new info is given. */
export function buildConnectionRecord(input: {
  userId: string;
  tokens: OAuthTokens;
  existing: { clientInfoEnc: string | null; connectedAt: string } | null;
  clientInfo: OAuthClientInformationMixed | undefined;
}) {
  const now = new Date().toISOString();
  const clientInfoEnc = input.clientInfo
    ? encryptJson(input.clientInfo, "tokens", input.userId)
    : (input.existing?.clientInfoEnc ?? null);
  return {
    userId: input.userId,
    tokensEnc: encryptJson({ tokens: input.tokens, savedAt: Date.now() }, "tokens", input.userId),
    clientInfoEnc,
    scope: input.tokens.scope ?? env.vexoScopes,
    connectedAt: input.existing?.connectedAt ?? now,
    updatedAt: now,
  };
}

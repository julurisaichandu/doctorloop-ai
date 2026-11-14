import "server-only";

import { randomBytes } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";

import { DEFAULT_RATE_MICROS_PER_1K, parseRateMicrosPer1k } from "@/lib/billing/money";
import type { BillingMode } from "@/lib/domain/types";

/**
 * Server-side configuration. Values are read lazily (on every call) so tests can
 * change process.env between cases. NEVER import this module from a client component.
 *
 * Every external integration falls back to a clearly-labeled mock when its
 * credentials are missing, so the demo always works.
 */

const MIN_SESSION_SECRET_LENGTH = 32;
const DEV_SECRET_FILE = join(".data", "dev-session-secret");
const globalForSecret = globalThis as unknown as { __doctorloopDevSecret?: string };

/**
 * Non-production secret: read or create `.data/dev-session-secret` (random, never committed);
 * fall back to a per-process random secret when the filesystem is not writable.
 */
function devSessionSecret(): string {
  if (globalForSecret.__doctorloopDevSecret) return globalForSecret.__doctorloopDevSecret;
  let secret: string | undefined;
  try {
    const existing = readFileSync(DEV_SECRET_FILE, "utf8").trim();
    if (existing.length >= MIN_SESSION_SECRET_LENGTH) secret = existing;
  } catch {
    // missing file: create below
  }
  if (!secret) {
    secret = randomBytes(48).toString("base64url");
    try {
      mkdirSync(".data", { recursive: true });
      writeFileSync(DEV_SECRET_FILE, secret, { encoding: "utf8", mode: 0o600 });
    } catch {
      // read-only filesystem: keep the per-process secret
    }
  }
  globalForSecret.__doctorloopDevSecret = secret;
  return secret;
}

let warnedInvalidRate = false;

function read(name: string): string | undefined {
  const value = process.env[name];
  return value && value.trim().length > 0 ? value.trim() : undefined;
}

export const env = {
  get nodeEnv() {
    return process.env.NODE_ENV ?? "development";
  },
  get isProduction() {
    return process.env.NODE_ENV === "production";
  },
  get appUrl() {
    return read("NEXT_PUBLIC_APP_URL") ?? "http://localhost:3000";
  },

  // --- Supabase -----------------------------------------------------------
  get supabaseUrl() {
    return read("NEXT_PUBLIC_SUPABASE_URL");
  },
  /** Publishable (sb_publishable_...) or legacy anon key. Safe for the browser. */
  get supabasePublishableKey() {
    return read("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY") ?? read("NEXT_PUBLIC_SUPABASE_ANON_KEY");
  },
  /** Secret (sb_secret_...) or legacy service_role key. SERVER ONLY. Bypasses RLS. */
  get supabaseSecretKey() {
    return read("SUPABASE_SECRET_KEY") ?? read("SUPABASE_SERVICE_ROLE_KEY");
  },
  /** Password used by the seed script and the demo switcher (Supabase mode). No default. */
  get demoAccountPassword(): string | undefined {
    return read("DEMO_ACCOUNT_PASSWORD");
  },

  // --- OpenAI -------------------------------------------------------------
  get openaiApiKey() {
    return read("OPENAI_API_KEY");
  },
  get openaiModel() {
    return read("OPENAI_MODEL") ?? "gpt-4.1-mini";
  },

  // --- ElevenLabs ---------------------------------------------------------
  get elevenlabsApiKey() {
    return read("ELEVENLABS_API_KEY");
  },
  get elevenlabsAgentId() {
    return read("ELEVENLABS_AGENT_ID");
  },
  get elevenlabsWebhookSecret() {
    return read("ELEVENLABS_WEBHOOK_SECRET");
  },

  // --- Vexo MCP -----------------------------------------------------------
  /** "live" / "file" only when explicitly enabled; otherwise the labeled mock adapter is used. */
  get vexoMode(): "live" | "mock" | "file" {
    const mode = read("VEXO_MODE");
    return mode === "live" || mode === "file" ? mode : "mock";
  },
  /** Band capture replayed in VEXO_MODE=file. Relative paths resolve against process.cwd(). */
  get vexoFilePath() {
    return read("VEXO_FILE_PATH") ?? "vexo-band/maya-band-capture.txt";
  },
  get vexoMcpUrl() {
    return read("VEXO_MCP_URL") ?? "https://api.vexoai.com/mcp";
  },
  get vexoClientId() {
    return read("VEXO_CLIENT_ID");
  },
  get vexoClientSecret() {
    return read("VEXO_CLIENT_SECRET");
  },
  get vexoScopes() {
    return read("VEXO_SCOPES") ?? "vexo:read";
  },
  get vexoRedirectUri() {
    return read("VEXO_REDIRECT_URI") ?? `${env.appUrl}/api/integrations/vexo/callback`;
  },

  // --- Vexo band push (Pipecat bridge -> /api/integrations/vexo/band) ------
  /** The one band number the bridge may post for (1..999); undefined when unset or invalid. */
  get vexoBandNumber(): number | undefined {
    const raw = read("VEXO_BAND_NUMBER");
    const n = raw && /^\d{1,3}$/.test(raw) ? Number(raw) : NaN;
    return n >= 1 && n <= 999 ? n : undefined;
  },
  /** HMAC secret shared with band-bridge/ (at least 32 characters). SERVER ONLY. */
  get vexoBandSecret(): string | undefined {
    const secret = read("VEXO_BAND_SECRET");
    return secret && secret.length >= MIN_SESSION_SECRET_LENGTH ? secret : undefined;
  },
  /** E-mail of the patient account that wears the band. */
  get vexoBandWearer(): string | undefined {
    const email = read("VEXO_BAND_WEARER");
    return email && z.email().safeParse(email).success ? email : undefined;
  },

  // --- Stripe (practice billing, test mode only) --------------------------
  get stripeSecretKey() {
    return read("STRIPE_SECRET_KEY");
  },
  get stripeWebhookSecret() {
    return read("STRIPE_WEBHOOK_SECRET");
  },
  /** Price in micro-USD per 1,000 tokens (default $0.01). Invalid values fall back to the default. */
  get billingRateMicrosPer1k(): number {
    const raw = read("BILLING_PRICE_PER_1K_TOKENS_USD");
    const rate = parseRateMicrosPer1k(raw);
    if (raw !== undefined && rate === DEFAULT_RATE_MICROS_PER_1K && Number(raw) !== 0.01 && !warnedInvalidRate) {
      warnedInvalidRate = true;
      console.warn(`BILLING_PRICE_PER_1K_TOKENS_USD is invalid; using ${DEFAULT_RATE_MICROS_PER_1K / 1_000_000}.`);
    }
    return rate;
  },

  // --- Sessions, secrets, demo -------------------------------------------
  get sessionSecret() {
    const secret = read("SESSION_SECRET");
    if (process.env.NODE_ENV === "production") {
      if (!secret || secret.length < MIN_SESSION_SECRET_LENGTH) {
        throw new Error(
          `SESSION_SECRET must be set to at least ${MIN_SESSION_SECRET_LENGTH} characters in production.`,
        );
      }
      return secret;
    }
    return secret ?? devSessionSecret();
  },
  /**
   * Key material for encrypting OAuth tokens at rest. Required for live Vexo in production;
   * otherwise falls back to the session secret (the crypto module derives a separate key via HKDF).
   */
  get tokenEncryptionKey(): string {
    const key = read("TOKEN_ENCRYPTION_KEY");
    if (key) return key;
    if (env.isProduction && env.vexoMode === "live") {
      throw new Error("TOKEN_ENCRYPTION_KEY must be set when VEXO_MODE=live in production.");
    }
    return env.sessionSecret;
  },
  /**
   * Development-only demo role switcher. On by default outside production; in
   * production it must be explicitly enabled (synthetic-data demo deployments only).
   * It signs in AS a demo account — all authorization rules still apply.
   */
  get enableDemoSwitcher() {
    const flag = read("ENABLE_DEMO_ROLE_SWITCHER");
    if (flag === "true") return true;
    if (flag === "false") return false;
    return process.env.NODE_ENV !== "production";
  },
  /** Local JSON database path (local mode). ":memory:" disables persistence (tests). */
  get localDbPath() {
    return read("DOCTORLOOP_LOCAL_DB_PATH") ?? ".data/local-db.json";
  },
};

export type DataBackend = "supabase" | "local";

export function hasSupabase(): boolean {
  return Boolean(env.supabaseUrl && env.supabasePublishableKey && env.supabaseSecretKey);
}

export function getDataBackend(): DataBackend {
  return hasSupabase() ? "supabase" : "local";
}

export interface BandIngestConfig {
  bandNumber: number;
  secret: string;
  wearerEmail: string;
}

/** Band ingest is enabled only when all three VEXO_BAND_* values are valid. */
export function getBandIngestConfig(): BandIngestConfig | null {
  const { vexoBandNumber: bandNumber, vexoBandSecret: secret, vexoBandWearer: wearerEmail } = env;
  return bandNumber !== undefined && secret && wearerEmail ? { bandNumber, secret, wearerEmail } : null;
}

export interface IntegrationStatus {
  data: { mode: DataBackend; label: string };
  ai: { mode: "openai" | "mock"; model: string | null; label: string };
  voice: { mode: "elevenlabs" | "simulated"; label: string };
  vexo: { mode: "live" | "mock" | "file"; label: string };
  band: { mode: "live" | "off"; label: string };
  billing: { mode: BillingMode; label: string };
}

const STRIPE_TEST_KEY = /^(sk|rk)_test_/;
const STRIPE_LIVE_KEY = /^(sk|rk)_live_/;

/** "stripe" only for a Stripe TEST-mode key; everything else (including live keys) is simulated. */
export function getBillingMode(): BillingMode {
  const key = env.stripeSecretKey;
  return key && STRIPE_TEST_KEY.test(key) ? "stripe" : "simulated";
}

/** Human-readable status of every integration (safe to send to the browser: no secrets). */
export function getIntegrationStatus(): IntegrationStatus {
  const data = getDataBackend();
  const ai = env.openaiApiKey ? "openai" : "mock";
  const voice = env.elevenlabsApiKey && env.elevenlabsAgentId ? "elevenlabs" : "simulated";
  const vexo = env.vexoMode;
  const band = getBandIngestConfig();
  return {
    data: {
      mode: data,
      label: data === "supabase" ? "Supabase (Postgres + RLS)" : "Local demo database",
    },
    ai: {
      mode: ai,
      model: ai === "openai" ? env.openaiModel : null,
      label: ai === "openai" ? `OpenAI · ${env.openaiModel}` : "Mock AI (rule-based)",
    },
    voice: {
      mode: voice,
      label: voice === "elevenlabs" ? "ElevenLabs voice agent" : "Simulated voice check-in",
    },
    vexo: {
      mode: vexo,
      label:
        vexo === "live"
          ? "Vexo MCP (live OAuth)"
          : vexo === "file"
            ? "Vexo band replay (file)"
            : "Mock Vexo memories",
    },
    band: band
      ? { mode: "live", label: `Vexo band ${band.bandNumber} · Pipecat bridge` }
      : { mode: "off", label: "Not configured" },
    billing: {
      mode: getBillingMode(),
      label:
        getBillingMode() === "stripe"
          ? "Stripe test mode"
          : env.stripeSecretKey && STRIPE_LIVE_KEY.test(env.stripeSecretKey)
            ? "Simulated billing (live Stripe keys are ignored)"
            : "Simulated billing (no Stripe key)",
    },
  };
}

import { afterEach, describe, expect, it, vi } from "vitest";
import { env } from "@/lib/config/env";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("production secret requirements", () => {
  it("requires SESSION_SECRET of at least 32 characters in production, even with the switcher on", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("ENABLE_DEMO_ROLE_SWITCHER", "true");
    vi.stubEnv("SESSION_SECRET", "");
    expect(() => env.sessionSecret).toThrow(/SESSION_SECRET/);
    vi.stubEnv("SESSION_SECRET", "too-short");
    expect(() => env.sessionSecret).toThrow(/SESSION_SECRET/);
    vi.stubEnv("SESSION_SECRET", "x".repeat(32));
    expect(env.sessionSecret).toBe("x".repeat(32));
  });

  it("requires TOKEN_ENCRYPTION_KEY for live Vexo in production, otherwise falls back to the session secret", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("SESSION_SECRET", "s".repeat(40));
    vi.stubEnv("TOKEN_ENCRYPTION_KEY", "");
    vi.stubEnv("VEXO_MODE", "mock");
    expect(env.tokenEncryptionKey).toBe("s".repeat(40));
    vi.stubEnv("VEXO_MODE", "live");
    expect(() => env.tokenEncryptionKey).toThrow(/TOKEN_ENCRYPTION_KEY/);
    vi.stubEnv("TOKEN_ENCRYPTION_KEY", "k".repeat(40));
    expect(env.tokenEncryptionKey).toBe("k".repeat(40));
  });

  it("has no default demo password", () => {
    vi.stubEnv("DEMO_ACCOUNT_PASSWORD", "");
    expect(env.demoAccountPassword).toBeUndefined();
    vi.stubEnv("DEMO_ACCOUNT_PASSWORD", "a-long-demo-password");
    expect(env.demoAccountPassword).toBe("a-long-demo-password");
  });

  it("outside production generates a usable random secret", () => {
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("SESSION_SECRET", "");
    const secret = env.sessionSecret;
    expect(secret.length).toBeGreaterThanOrEqual(32);
    expect(env.sessionSecret).toBe(secret);
  });
});

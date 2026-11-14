import { afterEach, describe, expect, it, vi } from "vitest";
import { env, getBillingMode, getIntegrationStatus } from "@/lib/config/env";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("billing mode", () => {
  it("is simulated without a Stripe key", () => {
    expect(getBillingMode()).toBe("simulated");
    expect(getIntegrationStatus().billing).toEqual({
      mode: "simulated",
      label: "Simulated billing (no Stripe key)",
    });
  });

  it.each(["sk_test_abc", "rk_test_abc"])("is stripe for %s", (key) => {
    vi.stubEnv("STRIPE_SECRET_KEY", key);
    expect(getBillingMode()).toBe("stripe");
    expect(getIntegrationStatus().billing).toEqual({ mode: "stripe", label: "Stripe test mode" });
    expect(env.stripeSecretKey).toBe(key);
  });

  it.each(["sk_live_abc", "rk_live_abc"])("ignores live key %s", (key) => {
    vi.stubEnv("STRIPE_SECRET_KEY", key);
    expect(getBillingMode()).toBe("simulated");
    expect(getIntegrationStatus().billing).toEqual({
      mode: "simulated",
      label: "Simulated billing (live Stripe keys are ignored)",
    });
  });

  it("reads the webhook secret", () => {
    expect(env.stripeWebhookSecret).toBeUndefined();
    vi.stubEnv("STRIPE_WEBHOOK_SECRET", "whsec_x");
    expect(env.stripeWebhookSecret).toBe("whsec_x");
  });

  it("reads the rate with a default for invalid values", () => {
    expect(env.billingRateMicrosPer1k).toBe(10_000);
    vi.stubEnv("BILLING_PRICE_PER_1K_TOKENS_USD", "0.02");
    expect(env.billingRateMicrosPer1k).toBe(20_000);
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.stubEnv("BILLING_PRICE_PER_1K_TOKENS_USD", "nope");
    expect(env.billingRateMicrosPer1k).toBe(10_000);
  });
});

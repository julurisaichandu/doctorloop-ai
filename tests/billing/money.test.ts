import { describe, expect, it } from "vitest";
import {
  DEFAULT_RATE_MICROS_PER_1K,
  formatCents,
  formatRate,
  formatTokens,
  formatUsd,
  microsToCents,
  parseRateMicrosPer1k,
  stripeUnitAmountDecimal,
  usageAmountMicros,
} from "@/lib/billing/money";

describe("billing money helpers", () => {
  it("parses the rate with a safe default", () => {
    expect(DEFAULT_RATE_MICROS_PER_1K).toBe(10_000);
    expect(parseRateMicrosPer1k(undefined)).toBe(10_000);
    expect(parseRateMicrosPer1k("0.01")).toBe(10_000);
    expect(parseRateMicrosPer1k("0.015")).toBe(15_000);
    for (const bad of ["abc", "0", "-1", "10.5", ""]) expect(parseRateMicrosPer1k(bad)).toBe(10_000);
    expect(parseRateMicrosPer1k("10")).toBe(10_000_000);
  });

  it("computes and formats amounts", () => {
    expect(usageAmountMicros(2_100, 10_000)).toBe(21_000);
    expect(usageAmountMicros(0, 10_000)).toBe(0);
    expect(microsToCents(21_000)).toBe(2);
    expect(formatUsd(1_520_000)).toBe("$1.52");
    expect(formatUsd(21_000, 4)).toBe("$0.0210");
    expect(formatCents(152)).toBe("$1.52");
    expect(formatRate(10_000)).toBe("$0.01 per 1,000 tokens");
    expect(formatTokens(152_340)).toBe("152,340");
  });

  it("converts the rate to a Stripe unit_amount_decimal (cents per token)", () => {
    expect(stripeUnitAmountDecimal(10_000)).toBe("0.001");
    expect(stripeUnitAmountDecimal(15_000)).toBe("0.0015");
    expect(stripeUnitAmountDecimal(1)).toBe("0.0000001");
  });
});

/**
 * Pure money helpers for practice billing. Money is integer micro-USD (1 USD = 1,000,000).
 * No server-only imports: client components may use the formatting helpers.
 */

export const DEFAULT_RATE_MICROS_PER_1K = 10_000;
const MAX_RATE_USD_PER_1K = 10;

/** Parse a USD-per-1,000-tokens string into micro-USD. Invalid, non-positive or > $10 values give the default. */
export function parseRateMicrosPer1k(raw: string | undefined): number {
  if (raw === undefined || !/^\d+(\.\d+)?$/.test(raw.trim())) return DEFAULT_RATE_MICROS_PER_1K;
  const usd = Number(raw.trim());
  if (!Number.isFinite(usd) || usd <= 0 || usd > MAX_RATE_USD_PER_1K) return DEFAULT_RATE_MICROS_PER_1K;
  const micros = Math.round(usd * 1_000_000);
  return micros >= 1 ? micros : DEFAULT_RATE_MICROS_PER_1K;
}

export function usageAmountMicros(totalTokens: number, rateMicrosPer1k: number): number {
  return Math.round((totalTokens * rateMicrosPer1k) / 1000);
}

export function microsToCents(micros: number): number {
  return Math.round(micros / 10_000);
}

export function formatUsd(micros: number, decimals: 2 | 4 = 2): string {
  const value = (micros / 1_000_000).toLocaleString("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
  return `$${value}`;
}

export function formatCents(cents: number): string {
  return formatUsd(cents * 10_000, 2);
}

export function formatRate(rateMicrosPer1k: number): string {
  const text = trimZeros((rateMicrosPer1k / 1_000_000).toFixed(6));
  const [whole, frac = ""] = text.split(".");
  return `$${whole}.${frac.padEnd(2, "0")} per 1,000 tokens`;
}

export function formatTokens(n: number): string {
  return Math.round(n).toLocaleString("en-US");
}

/** Stripe `unit_amount_decimal` (cents per token) for a rate in micro-USD per 1,000 tokens. */
export function stripeUnitAmountDecimal(rateMicrosPer1k: number): string {
  return trimZeros((rateMicrosPer1k / 10_000_000).toFixed(12));
}

function trimZeros(fixed: string): string {
  const trimmed = fixed.includes(".") ? fixed.replace(/0+$/, "") : fixed;
  return trimmed.endsWith(".") ? trimmed.slice(0, -1) : trimmed;
}

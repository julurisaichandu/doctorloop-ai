import type { BillingPeriod } from "@/lib/domain/types";
import { last30Days } from "./period";

const DAY_MS = 86_400_000;
const MAX_SPAN_DAYS = 366;

function parseDay(value: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const ms = Date.parse(`${value}T00:00:00.000Z`);
  if (Number.isNaN(ms)) return null;
  return new Date(ms).toISOString().slice(0, 10) === value ? ms : null;
}

/** Inclusive UTC day range from YYYY-MM-DD inputs; anything invalid falls back to the last 30 days. */
export function parseStatementRange(input: { from?: string; to?: string }, now: Date): BillingPeriod {
  const fromRaw = input.from?.trim() || undefined;
  const toRaw = input.to?.trim() || undefined;
  if (!fromRaw && !toRaw) return last30Days(now);
  const fromDay = fromRaw ? parseDay(fromRaw) : null;
  const toDay = toRaw ? parseDay(toRaw) : null;
  if ((fromRaw && fromDay === null) || (toRaw && toDay === null)) return last30Days(now);

  const endOf = (dayMs: number) => dayMs + DAY_MS - 1;
  let fromMs = fromDay;
  let toMs = toDay === null ? null : endOf(toDay);
  if (fromMs !== null && toMs !== null && fromMs > toMs) {
    const swappedFrom = toDay as number;
    toMs = endOf(fromMs);
    fromMs = swappedFrom;
  }
  toMs = Math.min(toMs ?? now.getTime(), now.getTime());
  if (fromMs === null) fromMs = toMs - 30 * DAY_MS;
  if (fromMs > toMs) fromMs = Math.floor(toMs / DAY_MS) * DAY_MS;
  if (toMs - fromMs > MAX_SPAN_DAYS * DAY_MS) fromMs = toMs - MAX_SPAN_DAYS * DAY_MS;
  return { start: new Date(fromMs).toISOString(), end: new Date(toMs).toISOString() };
}

/**
 * Whole UTC calendar months containing the range (1st of the start month to the end of the end
 * month), capped at now. Private usage is only ever totalled over this bucket, never per day.
 */
export function privateBucket(range: BillingPeriod, now: Date): BillingPeriod {
  const start = new Date(range.start);
  const end = new Date(range.end);
  const bucketStart = Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), 1);
  const bucketEnd = Date.UTC(end.getUTCFullYear(), end.getUTCMonth() + 1, 1) - 1;
  return {
    start: new Date(bucketStart).toISOString(),
    end: new Date(Math.min(bucketEnd, now.getTime())).toISOString(),
  };
}

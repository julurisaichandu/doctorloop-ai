import type { BillingPeriod } from "@/lib/domain/types";

/**
 * Add whole months in UTC, keeping the anchor's UTC time of day and clamping the day to the
 * target month's length. Always computed from the original anchor (never chained).
 * (date-fns addMonths is avoided: it works in the machine's local time zone.)
 */
function addMonthsUtc(anchor: Date, months: number): Date {
  const total = anchor.getUTCFullYear() * 12 + anchor.getUTCMonth() + months;
  const year = Math.floor(total / 12);
  const month = total - year * 12;
  const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const day = Math.min(anchor.getUTCDate(), daysInMonth);
  return new Date(
    Date.UTC(
      year,
      month,
      day,
      anchor.getUTCHours(),
      anchor.getUTCMinutes(),
      anchor.getUTCSeconds(),
      anchor.getUTCMilliseconds(),
    ),
  );
}

/** The monthly period `[anchor + k months, anchor + k + 1 months)` that contains `now` (k >= 0). */
export function currentBillingPeriod(anchorIso: string, now: Date): BillingPeriod {
  const anchor = new Date(anchorIso);
  let k = Math.max(
    0,
    (now.getUTCFullYear() - anchor.getUTCFullYear()) * 12 + now.getUTCMonth() - anchor.getUTCMonth(),
  );
  while (k > 0 && addMonthsUtc(anchor, k).getTime() > now.getTime()) k--;
  while (addMonthsUtc(anchor, k + 1).getTime() <= now.getTime()) k++;
  return {
    start: addMonthsUtc(anchor, k).toISOString(),
    end: addMonthsUtc(anchor, k + 1).toISOString(),
  };
}

export function last30Days(now: Date): BillingPeriod {
  return { start: new Date(now.getTime() - 30 * 86_400_000).toISOString(), end: now.toISOString() };
}

/** The current UTC calendar month so far: 1st at 00:00:00.000Z to now. */
export function currentMonth(now: Date): BillingPeriod {
  return {
    start: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString(),
    end: now.toISOString(),
  };
}

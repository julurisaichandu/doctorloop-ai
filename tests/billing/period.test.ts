import { describe, expect, it } from "vitest";
import { currentBillingPeriod, last30Days } from "@/lib/billing/period";

describe("billing periods", () => {
  it("finds the monthly period containing now", () => {
    const p = currentBillingPeriod("2026-10-05T10:00:00.000Z", new Date("2026-11-14T00:00:00.000Z"));
    expect(p).toEqual({ start: "2026-11-05T10:00:00.000Z", end: "2026-12-05T10:00:00.000Z" });
    expect(currentBillingPeriod("2026-11-14T00:00:00.000Z", new Date("2026-11-14T00:00:00.000Z"))).toEqual({
      start: "2026-11-14T00:00:00.000Z",
      end: "2026-12-14T00:00:00.000Z",
    });
  });

  it("computes month-end anchors from the anchor, not chained", () => {
    expect(currentBillingPeriod("2026-01-31T00:00:00.000Z", new Date("2026-03-30T00:00:00.000Z"))).toEqual({
      start: "2026-02-28T00:00:00.000Z",
      end: "2026-03-31T00:00:00.000Z",
    });
  });

  it("uses the first period when now is before the anchor", () => {
    expect(
      currentBillingPeriod("2026-11-14T00:00:00.000Z", new Date("2026-11-01T00:00:00.000Z")).start,
    ).toBe("2026-11-14T00:00:00.000Z");
  });

  it("last30Days is now minus 30 days", () => {
    expect(last30Days(new Date("2026-11-14T00:00:00.000Z"))).toEqual({
      start: "2026-10-15T00:00:00.000Z",
      end: "2026-11-14T00:00:00.000Z",
    });
  });
});

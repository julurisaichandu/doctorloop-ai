import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetLocalDb } from "@/lib/data/local/local-db";
import { getSystemRepository } from "@/lib/data";
import { DEMO_IDS } from "@/lib/demo/seed";
import type { BillingAccount, BillingMode } from "@/lib/domain/types";
import type { UsageItem } from "@/lib/services/billing-usage";
import { LocalRepository } from "@/lib/data/local/local-repository";
import {
  RETRY_WINDOW_MS,
  isBillableAccount,
  recordAiUsage,
  resolvePayer,
  retryUsageSync,
  usageItemsFromEvents,
} from "@/lib/services/billing-usage";
import { usageAmountMicros } from "@/lib/billing/money";
import { setStripeForTests, type StripeLike } from "@/lib/integrations/stripe/client";
import { resetStripeCatalogCache } from "@/lib/integrations/stripe/catalog";
import { drBell, drPark, patientIdOf, priya } from "./support";

const item = (over: Partial<UsageItem> = {}): UsageItem => ({
  operation: "entry_extraction",
  journalEntryId: null,
  provider: "mock",
  model: null,
  inputTokens: 600,
  outputTokens: 400,
  totalTokens: 1000,
  tokenSource: "estimated",
  ...over,
});

async function seedAccount(doctorId: string, mode: BillingMode, over: Partial<BillingAccount> = {}) {
  const now = new Date().toISOString();
  await getSystemRepository().saveBillingAccount({
    doctorId,
    mode,
    status: "active",
    stripeCustomerId: mode === "stripe" ? "cus_test_1" : null,
    stripeSubscriptionId: null,
    stripePriceId: null,
    paymentMethodLabel: null,
    rateMicrosPer1k: 20_000,
    periodAnchorAt: null,
    activatedAt: now,
    canceledAt: null,
    simulatedInvoices: [],
    createdAt: now,
    updatedAt: now,
    ...over,
  });
}

function fakeStripe(create: ReturnType<typeof vi.fn>): StripeLike {
  return { billing: { meterEvents: { create } } } as unknown as StripeLike;
}

// The demo seed already holds usage records; only look at ones written during this test.
let startedAt = "";
const parkRecords = () =>
  getSystemRepository().listUsageRecords({ billingDoctorId: DEMO_IDS.users.drPark, since: startedAt });

beforeEach(() => {
  resetLocalDb();
  startedAt = new Date().toISOString();
  setStripeForTests(null);
  resetStripeCatalogCache();
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  setStripeForTests(null);
});

describe("billing usage recording", () => {
  it("bills a patient's usage to the earliest-assigned doctor (Priya → Dr. Park)", async () => {
    const patientId = patientIdOf(priya());
    expect(await resolvePayer(patientId, { kind: "patient", userId: priya().userId })).toBe(DEMO_IDS.users.drPark);
    await recordAiUsage({ patientId, trigger: { kind: "patient", userId: priya().userId }, items: [item()] });
    const records = await getSystemRepository().listUsageRecords({ patientId, since: startedAt });
    expect(records).toHaveLength(1);
    expect(records[0].billingDoctorId).toBe(DEMO_IDS.users.drPark);
    expect(records[0].triggeredBy).toBe("patient");
  });

  it("bills doctor-triggered usage to that doctor (Dr. Bell regenerates Priya's summary)", async () => {
    const patientId = patientIdOf(priya());
    const trigger = { kind: "doctor" as const, userId: drBell().userId };
    expect(await resolvePayer(patientId, trigger)).toBe(DEMO_IDS.users.drBell);
    await recordAiUsage({ patientId, trigger, items: [item({ operation: "clinician_summary" })] });
    const records = await getSystemRepository().listUsageRecords({ patientId, since: startedAt });
    expect(records).toHaveLength(1);
    expect(records[0].billingDoctorId).toBe(DEMO_IDS.users.drBell);
  });

  it("falls back to the earliest assignment for an unassigned doctor trigger", async () => {
    const patientId = patientIdOf(priya());
    const payer = await resolvePayer(patientId, { kind: "doctor", userId: "00000000-0000-4000-8000-00000000dead" });
    expect(payer).toBe(DEMO_IDS.users.drPark);
  });

  it("records not_billed when the payer has no billing account", async () => {
    const patientId = patientIdOf(priya());
    await recordAiUsage({ patientId, trigger: { kind: "patient", userId: null }, items: [item()] });
    const [record] = await parkRecords();
    expect(record.billingStatus).toBe("not_billed");
    expect(record.rateMicrosPer1k).toBe(10_000);
    expect(record.amountMicros).toBe(usageAmountMicros(1000, 10_000));
    expect(record.billedAt).toBeNull();
  });

  it("bills immediately in simulated mode once the account is active", async () => {
    await seedAccount(DEMO_IDS.users.drPark, "simulated");
    await recordAiUsage({
      patientId: patientIdOf(priya()),
      trigger: { kind: "patient", userId: null },
      items: [item()],
    });
    const [record] = await parkRecords();
    expect(record.billingStatus).toBe("billed");
    expect(record.billingMode).toBe("simulated");
    expect(record.billedAt).not.toBeNull();
    expect(record.rateMicrosPer1k).toBe(20_000);
    expect(record.amountMicros).toBe(usageAmountMicros(1000, 20_000));
  });

  it("does not bill an account activated in the other mode", async () => {
    await seedAccount(DEMO_IDS.users.drPark, "stripe");
    await recordAiUsage({
      patientId: patientIdOf(priya()),
      trigger: { kind: "patient", userId: null },
      items: [item()],
    });
    const [record] = await parkRecords();
    expect(record.billingStatus).toBe("not_billed");
    expect(record.rateMicrosPer1k).toBe(10_000);
  });

  it("isBillableAccount checks status and mode", () => {
    expect(isBillableAccount(null, "simulated")).toBe(false);
    const base = { status: "active", mode: "simulated" } as BillingAccount;
    expect(isBillableAccount(base, "simulated")).toBe(true);
    expect(isBillableAccount({ ...base, status: "past_due" }, "simulated")).toBe(true);
    expect(isBillableAccount({ ...base, status: "canceled" }, "simulated")).toBe(false);
    expect(isBillableAccount(base, "stripe")).toBe(false);
  });

  it("sends one meter event per record in Stripe mode and marks them billed", async () => {
    vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_x");
    const create = vi.fn().mockResolvedValue({});
    setStripeForTests(fakeStripe(create));
    await seedAccount(DEMO_IDS.users.drPark, "stripe");
    await recordAiUsage({
      patientId: patientIdOf(priya()),
      trigger: { kind: "patient", userId: null },
      items: [item(), item({ operation: "clinician_summary", totalTokens: 500 })],
    });
    const records = await parkRecords();
    expect(create).toHaveBeenCalledTimes(2);
    expect(records.every((r) => r.billingStatus === "billed" && r.billingMode === "stripe" && r.billedAt)).toBe(true);
    const identifiers = create.mock.calls.map((c) => c[0].identifier).sort();
    expect(identifiers).toEqual(records.map((r) => r.id).sort());
  });

  it("marks sync_failed and resolves when Stripe rejects", async () => {
    vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_x");
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    setStripeForTests(fakeStripe(vi.fn().mockRejectedValue(new Error("boom"))));
    await seedAccount(DEMO_IDS.users.drPark, "stripe");
    await expect(
      recordAiUsage({ patientId: patientIdOf(priya()), trigger: { kind: "patient", userId: null }, items: [item()] }),
    ).resolves.toBeUndefined();
    const [record] = await parkRecords();
    expect(record.billingStatus).toBe("sync_failed");
    expect(record.billingError).toBe("Could not reach Stripe.");
    expect(spy).toHaveBeenCalled();
  });

  it("retryUsageSync resends failed records with the same identifier", async () => {
    vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_x");
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const failing = vi.fn().mockRejectedValue(new Error("boom"));
    setStripeForTests(fakeStripe(failing));
    await seedAccount(DEMO_IDS.users.drPark, "stripe");
    await recordAiUsage({ patientId: patientIdOf(priya()), trigger: { kind: "patient", userId: null }, items: [item()] });
    const [failed] = await parkRecords();
    expect(failed.billingStatus).toBe("sync_failed");

    const create = vi.fn().mockResolvedValue({});
    setStripeForTests(fakeStripe(create));
    expect(await retryUsageSync(drPark())).toEqual({ retried: 1, failed: 0 });
    expect(create.mock.calls[0][0].identifier).toBe(failed.id);
    const [after] = await parkRecords();
    expect(after.billingStatus).toBe("billed");
    expect(after.billingError).toBeNull();
    expect(spy).toHaveBeenCalled();

    expect(await retryUsageSync(drPark())).toEqual({ retried: 0, failed: 0 });
  });

  it("retryUsageSync does nothing in simulated mode", async () => {
    expect(await retryUsageSync(drPark())).toEqual({ retried: 0, failed: 0 });
  });

  it("never throws when the repository fails", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(LocalRepository.prototype, "createUsageRecords").mockRejectedValue(new Error("boom"));
    await expect(
      recordAiUsage({ patientId: patientIdOf(priya()), trigger: { kind: "system", userId: null }, items: [item()] }),
    ).resolves.toBeUndefined();
    expect(spy).toHaveBeenCalledWith("[DoctorLoop] Usage recording failed:", expect.any(Error));
  });

  it("still sends every record when a post-send bookkeeping update fails", async () => {
    vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_x");
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const create = vi.fn().mockResolvedValue({});
    setStripeForTests(fakeStripe(create));
    await seedAccount(DEMO_IDS.users.drPark, "stripe");
    vi.spyOn(LocalRepository.prototype, "updateUsageRecord").mockRejectedValueOnce(new Error("db down"));
    await expect(
      recordAiUsage({
        patientId: patientIdOf(priya()),
        trigger: { kind: "patient", userId: null },
        items: [item(), item({ totalTokens: 500 })],
      }),
    ).resolves.toBeUndefined();
    expect(create).toHaveBeenCalledTimes(2);
    const records = await parkRecords();
    expect(records.filter((r) => r.billingStatus === "billed")).toHaveLength(1);
    expect(spy).toHaveBeenCalledWith("[DoctorLoop] Usage recording failed:", expect.any(Error));
  });

  it("reports a batch's meter events concurrently", async () => {
    vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_x");
    let started = 0;
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const create = vi.fn().mockImplementation(async () => {
      started += 1;
      if (started === 2) release();
      await gate; // resolves only once both calls have started
      return {};
    });
    setStripeForTests(fakeStripe(create));
    await seedAccount(DEMO_IDS.users.drPark, "stripe");
    await recordAiUsage({
      patientId: patientIdOf(priya()),
      trigger: { kind: "patient", userId: null },
      items: [item(), item({ totalTokens: 500 })],
    });
    expect(create).toHaveBeenCalledTimes(2);
    expect((await parkRecords()).every((r) => r.billingStatus === "billed")).toBe(true);
  });

  describe("retry window", () => {
    const hoursAgo = (h: number) => new Date(Date.now() - h * 3_600_000).toISOString();
    const minutesAgo = (m: number) => new Date(Date.now() - m * 60_000).toISOString();

    async function seedStale(billingStatus: "sync_failed" | "pending", occurredAt: string) {
      const [record] = await getSystemRepository().createUsageRecords([
        {
          patientId: patientIdOf(priya()),
          billingDoctorId: DEMO_IDS.users.drPark,
          operation: "entry_extraction",
          triggeredBy: "patient",
          triggeredByUserId: null,
          journalEntryId: null,
          provider: "mock",
          model: null,
          inputTokens: 1,
          outputTokens: 1,
          totalTokens: 2,
          tokenSource: "estimated",
          rateMicrosPer1k: 10_000,
          amountMicros: 20,
          billingStatus,
          billingMode: null,
          billingError: null,
          billedAt: null,
          occurredAt,
        },
      ]);
      return record.id;
    }

    async function retryWith(create: ReturnType<typeof vi.fn>) {
      vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_x");
      setStripeForTests(fakeStripe(create));
      await seedAccount(DEMO_IDS.users.drPark, "stripe");
      return retryUsageSync(drPark());
    }

    it("is 23 hours", () => {
      expect(RETRY_WINDOW_MS).toBe(23 * 3_600_000);
    });

    it("retries a sync_failed record 22 h old but not one 24 h old", async () => {
      const recent = await seedStale("sync_failed", hoursAgo(22));
      await seedStale("sync_failed", hoursAgo(24));
      const create = vi.fn().mockResolvedValue({});
      expect(await retryWith(create)).toEqual({ retried: 1, failed: 0 });
      expect(create).toHaveBeenCalledTimes(1);
      expect(create.mock.calls[0][0].identifier).toBe(recent);
    });

    it("retries pending records only after 2 minutes", async () => {
      await seedStale("pending", minutesAgo(1));
      const old = await seedStale("pending", minutesAgo(3));
      const create = vi.fn().mockResolvedValue({});
      expect(await retryWith(create)).toEqual({ retried: 1, failed: 0 });
      expect(create.mock.calls[0][0].identifier).toBe(old);
    });
  });

  it("usageItemsFromEvents maps kinds and drops unknown ones", () => {
    const base = { provider: "mock" as const, model: "m", inputTokens: 1, outputTokens: 2, totalTokens: 3, tokenSource: "provider" as const };
    const items = usageItemsFromEvents(
      [
        { ...base, kind: "observation_extraction" },
        { ...base, kind: "mystery" },
      ],
      (kind) => (kind === "observation_extraction" ? { operation: "entry_extraction", journalEntryId: "e1" } : null),
    );
    expect(items).toEqual([{ ...base, operation: "entry_extraction", journalEntryId: "e1" }]);
  });
});

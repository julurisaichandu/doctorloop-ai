import { beforeEach, describe, expect, it } from "vitest";
import { getRepository, getSystemRepository } from "@/lib/data";
import { getLocalDb, resetLocalDb } from "@/lib/data/local/local-db";
import type { AiUsageRecord, BillingAccount } from "@/lib/domain/types";
import type { NewAiUsageRecord } from "@/lib/data/repository";
import { drPark, maya } from "../services/support";

beforeEach(() => resetLocalDb());

const account: BillingAccount = {
  doctorId: "10000000-0000-4000-8000-000000000004",
  mode: "simulated",
  status: "active",
  stripeCustomerId: "cus_123",
  stripeSubscriptionId: null,
  stripePriceId: null,
  paymentMethodLabel: "Visa 4242",
  rateMicrosPer1k: 10_000,
  periodAnchorAt: null,
  activatedAt: "2026-11-01T00:00:00.000Z",
  canceledAt: null,
  simulatedInvoices: [],
  createdAt: "2026-11-01T00:00:00.000Z",
  updatedAt: "2026-11-01T00:00:00.000Z",
};

function usage(over: Partial<NewAiUsageRecord>): NewAiUsageRecord {
  return {
    patientId: "p1",
    billingDoctorId: "d1",
    operation: "entry_extraction",
    triggeredBy: "patient",
    triggeredByUserId: null,
    journalEntryId: null,
    provider: "mock",
    model: null,
    inputTokens: 10,
    outputTokens: 5,
    totalTokens: 15,
    tokenSource: "estimated",
    rateMicrosPer1k: 10_000,
    amountMicros: 150,
    billingStatus: "not_billed",
    billingMode: null,
    billingError: null,
    billedAt: null,
    occurredAt: "2026-11-10T00:00:00.000Z",
    ...over,
  };
}

describe("local repository: usage and billing", () => {
  it("actor repositories cannot touch usage or billing", async () => {
    for (const actor of [maya(), drPark()]) {
      const repo = getRepository(actor);
      await expect(repo.listUsageRecords({})).rejects.toMatchObject({ code: "FORBIDDEN" });
      await expect(repo.createUsageRecords([])).rejects.toMatchObject({ code: "FORBIDDEN" });
      await expect(repo.updateUsageRecord("x", {})).rejects.toMatchObject({ code: "FORBIDDEN" });
      await expect(repo.getBillingAccount(drPark().userId)).rejects.toMatchObject({ code: "FORBIDDEN" });
      await expect(repo.saveBillingAccount(account)).rejects.toMatchObject({ code: "FORBIDDEN" });
      await expect(repo.findBillingAccountByStripeCustomer("cus_123")).rejects.toMatchObject({ code: "FORBIDDEN" });
    }
  });

  it("system repository creates, filters, orders, limits and updates usage records", async () => {
    const repo = getSystemRepository();
    const [a, b, c] = await repo.createUsageRecords([
      usage({ billingDoctorId: "dX", patientId: "pX", occurredAt: "2026-11-01T00:00:00.000Z" }),
      usage({ billingDoctorId: "dX", patientId: "pY", occurredAt: "2026-11-02T00:00:00.000Z", billingStatus: "billed" }),
      usage({ billingDoctorId: "dY", patientId: "pX", occurredAt: "2026-11-03T00:00:00.000Z" }),
    ]);
    expect(a.id).toBeTruthy();
    expect(a.createdAt).toBeTruthy();
    const ids = (rows: AiUsageRecord[]) => rows.map((r) => r.id);
    const base = { since: "2026-11-01T00:00:00.000Z", until: "2026-11-03T00:00:00.000Z" };

    expect(ids(await repo.listUsageRecords({ billingDoctorId: "dX", ...base }))).toEqual([b.id, a.id]);
    expect(ids(await repo.listUsageRecords({ billingDoctorId: "dX", order: "asc", ...base }))).toEqual([a.id, b.id]);
    expect(ids(await repo.listUsageRecords({ patientId: "pX", ...base }))).toEqual([c.id, a.id]);
    expect(ids(await repo.listUsageRecords({ since: "2026-11-02T00:00:00.000Z", until: "2026-11-02T00:00:00.000Z" }))).toEqual([b.id]);
    expect(ids(await repo.listUsageRecords({ billingDoctorId: "dX", billingStatus: ["billed"] }))).toEqual([b.id]);
    expect(await repo.listUsageRecords({ billingDoctorId: "dX", limit: 1 })).toHaveLength(1);

    const updated = await repo.updateUsageRecord(a.id, {
      billingStatus: "billed",
      billingMode: "simulated",
      billedAt: "2026-11-05T00:00:00.000Z",
    });
    expect(updated).toMatchObject({ billingStatus: "billed", billingMode: "simulated", totalTokens: 15, patientId: "pX" });
    await expect(repo.updateUsageRecord("nope", { billingStatus: "billed" })).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("system repository upserts billing accounts and finds them by Stripe customer", async () => {
    const repo = getSystemRepository();
    expect(await repo.getBillingAccount(account.doctorId)).toBeNull();
    const first = await repo.saveBillingAccount(account);
    expect(first.updatedAt).not.toBe(account.updatedAt);
    const second = await repo.saveBillingAccount({ ...account, status: "past_due" });
    expect(second.status).toBe("past_due");
    expect(second.updatedAt >= first.updatedAt).toBe(true);
    expect((await repo.getBillingAccount(account.doctorId))?.status).toBe("past_due");
    expect((await repo.findBillingAccountByStripeCustomer("cus_123"))?.doctorId).toBe(account.doctorId);
    expect(await repo.findBillingAccountByStripeCustomer("cus_other")).toBeNull();
  });
});

describe("getLocalDb stale holder", () => {
  it("reloads when the cached holder predates the billing tables", () => {
    const key = Symbol.for("doctorloop.localDb");
    const g = globalThis as unknown as Record<symbol, { dbPath: string; data: Record<string, unknown>; warned: boolean }>;
    const holder = g[key];
    const legacy = { ...holder.data };
    delete legacy.usageRecords;
    delete legacy.billingAccounts;
    g[key] = { ...holder, data: legacy };
    const db = getLocalDb();
    expect(Array.isArray(db.data.usageRecords)).toBe(true);
    expect(Array.isArray(db.data.billingAccounts)).toBe(true);
  });
});

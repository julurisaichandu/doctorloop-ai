import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getSystemRepository } from "@/lib/data";
import { getLocalDb, resetLocalDb } from "@/lib/data/local/local-db";
import { DEMO_IDS } from "@/lib/demo/seed";
import { PRIVATE_LINE_LABEL } from "@/lib/billing/views";
import { setStripeForTests, type StripeLike } from "@/lib/integrations/stripe/client";
import {
  getDoctorBillingOverview,
  getPatientUsageStatement,
  getPatientUsageStatementCsv,
} from "@/lib/services/billing-views";
import { approveEntry, revokeEntry } from "@/lib/services/patient";
import { drBell, drPark, maya, patientIdOf, priya } from "./support";

const WIDE = { from: "2020-01-01", to: "2099-01-01" };
const code = (c: string) => expect.objectContaining({ code: c });

beforeEach(() => {
  resetLocalDb();
  setStripeForTests(null);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  setStripeForTests(null);
});

const seeded = () => getLocalDb().data;
const mayaPatientId = () => patientIdOf(maya());

describe("billing views", () => {
  it("Maya's pending entry is only in the private total; shared entries and pre-visit summaries are itemized", async () => {
    const data = seeded();
    const pid = mayaPatientId();
    const pending = data.entries.filter((e) => e.patientId === pid && e.reviewStatus === "pending_review");
    expect(pending).toHaveLength(1);
    const usage = data.usageRecords.filter((u) => u.patientId === pid);
    const itemizable = usage.filter(
      (u) =>
        u.operation === "clinician_summary" ||
        (u.operation === "entry_extraction" &&
          data.entries.find((e) => e.id === u.journalEntryId)?.reviewStatus === "approved"),
    );
    const privateOnes = usage.filter((u) => !itemizable.includes(u));

    const statement = await getPatientUsageStatement(drPark(), pid, WIDE);
    expect(statement.lines.map((l) => l.id).sort()).toEqual(itemizable.map((u) => u.id).sort());
    expect(statement.privateTotal.runs).toBe(privateOnes.length);
    expect(statement.privateTotal.runs).toBeGreaterThan(0);
    expect(statement.lines.some((l) => l.activity === "clinician_summary")).toBe(true);
    expect(statement.totals.runs).toBe(usage.length);
    const times = statement.lines.map((l) => l.occurredAt);
    expect(times).toEqual([...times].sort());
    expect(statement.patient.ref).toBe(pid.slice(0, 8).toUpperCase());
  });

  it("an entry becomes itemized after approval and leaves again after revoke", async () => {
    const pid = mayaPatientId();
    const pending = seeded().entries.find((e) => e.patientId === pid && e.reviewStatus === "pending_review");
    if (!pending) throw new Error("no pending entry");
    const itemizedIds = async () => (await getPatientUsageStatement(drPark(), pid, WIDE)).lines.map((l) => l.id);
    const usageId = seeded().usageRecords.find((u) => u.journalEntryId === pending.id)?.id as string;

    expect(await itemizedIds()).not.toContain(usageId);
    await approveEntry(maya(), pending.id);
    expect(await itemizedIds()).toContain(usageId);
    await revokeEntry(maya(), pending.id);
    expect(await itemizedIds()).not.toContain(usageId);
  });

  it("two extraction records for one approved entry: only the newer is a line, the older is private", async () => {
    const pid = mayaPatientId();
    const approved = seeded().entries.find((e) => e.patientId === pid && e.reviewStatus === "approved");
    if (!approved) throw new Error("no approved entry");
    const source = seeded().usageRecords.find((u) => u.journalEntryId === approved.id && u.operation === "entry_extraction");
    if (!source) throw new Error("no usage");
    const { id: _id, createdAt: _c, ...rest } = source;
    void _id;
    void _c;
    const base = { ...rest, operation: "entry_extraction" as const, journalEntryId: approved.id };
    const t = Date.now();
    const [older, newer] = await getSystemRepository().createUsageRecords([
      { ...base, occurredAt: new Date(t - 2000).toISOString() },
      { ...base, occurredAt: new Date(t - 1000).toISOString() },
    ]);
    const statement = await getPatientUsageStatement(drPark(), pid, WIDE);
    const ids = statement.lines.map((l) => l.id);
    expect(ids).toContain(newer.id);
    expect(ids).not.toContain(older.id);
    // The older record is counted in the private total (same month bucket) instead.
    expect(statement.privateTotal.totalTokens).toBeGreaterThanOrEqual(older.totalTokens);
    const overview = await getDoctorBillingOverview(drPark());
    expect(overview.recent.map((l) => l.id)).not.toContain(older.id);
  });

  it("usage billed in the other mode is not counted as billed and is labelled", async () => {
    const pid = mayaPatientId();
    const source = seeded().usageRecords.find((u) => u.patientId === pid && u.operation === "clinician_summary");
    if (!source) throw new Error("no usage");
    const { id: _id, createdAt: _c, ...rest } = source;
    void _id;
    void _c;
    const [rec] = await getSystemRepository().createUsageRecords([
      {
        ...rest,
        billingDoctorId: DEMO_IDS.users.drPark,
        billingStatus: "billed",
        billingMode: "stripe",
        amountMicros: 123_000,
        occurredAt: "2026-11-05T10:00:00.000Z",
      },
    ]);
    const statement = await getPatientUsageStatement(drPark(), pid, WIDE);
    expect(statement.mode).toBe("simulated");
    expect(statement.lines.find((l) => l.id === rec.id)?.billingLabel).toBe("Billed (Stripe)");
    expect(statement.totals.billedMicros).toBe(0);
  });

  it("Dr. Bell sees nothing billed to Dr. Park", async () => {
    const bell = await getDoctorBillingOverview(drBell());
    expect(bell.patients).toEqual([]);
    expect(bell.totals.runs).toBe(0);
    const park = await getDoctorBillingOverview(drPark());
    expect(park.patients.map((p) => p.patientId)).toContain(patientIdOf(priya()));
    expect(park.account.status).toBe("not_set_up");
    expect(park.recent.length).toBeLessThanOrEqual(20);
  });

  it("statement for an unassigned patient is NOT_FOUND; patients cannot read billing views", async () => {
    await expect(getPatientUsageStatement(drBell(), mayaPatientId(), WIDE)).rejects.toEqual(code("NOT_FOUND"));
    await expect(getPatientUsageStatement(maya(), mayaPatientId(), WIDE)).rejects.toEqual(code("FORBIDDEN"));
    await expect(getDoctorBillingOverview(maya())).rejects.toEqual(code("FORBIDDEN"));
  });

  it("views never contain entry ids or entry text", async () => {
    const overview = await getDoctorBillingOverview(drPark());
    const statements = await Promise.all(
      [DEMO_IDS.patients.maya, DEMO_IDS.patients.priya, DEMO_IDS.patients.daniel].map((id) =>
        getPatientUsageStatement(drPark(), id, WIDE).catch(() => null),
      ),
    );
    const json = JSON.stringify([overview, statements]);
    for (const entry of seeded().entries) {
      expect(json).not.toContain(entry.id);
      for (let i = 0; i + 20 <= entry.body.length; i += 20) {
        expect(json).not.toContain(entry.body.slice(i, i + 20));
      }
    }
  });

  it("overview survives Stripe failures", async () => {
    vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_x");
    const reject = () => vi.fn().mockRejectedValue(new Error("stripe down"));
    setStripeForTests({
      subscriptions: { retrieve: reject() },
      invoices: { createPreview: reject(), list: reject() },
    } as unknown as StripeLike);
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const now = new Date().toISOString();
    await getSystemRepository().saveBillingAccount({
      doctorId: DEMO_IDS.users.drPark,
      mode: "stripe",
      status: "active",
      stripeCustomerId: "cus_1",
      stripeSubscriptionId: "sub_1",
      stripePriceId: "price_1",
      paymentMethodLabel: "Visa •••• 4242",
      rateMicrosPer1k: 10_000,
      periodAnchorAt: "2020-01-01T00:00:00.000Z",
      activatedAt: now,
      canceledAt: null,
      simulatedInvoices: [],
      createdAt: now,
      updatedAt: now,
    });

    const overview = await getDoctorBillingOverview(drPark());
    expect(overview.stripeError).toBe("Couldn't reach Stripe. Showing DoctorLoop's own usage records.");
    expect(overview.upcomingInvoice).toBeNull();
    expect(overview.invoices).toEqual([]);
    expect(overview.account.status).toBe("active");
    expect(overview.totals.runs).toBeGreaterThan(0);
  });

  it("a refresh failure alone sets stripeError and empties the Stripe sections", async () => {
    const saveAccount = async () => {
      const now = new Date().toISOString();
      await getSystemRepository().saveBillingAccount({
        doctorId: DEMO_IDS.users.drPark,
        mode: "stripe",
        status: "canceled",
        stripeCustomerId: "cus_1",
        stripeSubscriptionId: "sub_1",
        stripePriceId: "price_1",
        paymentMethodLabel: null,
        rateMicrosPer1k: 10_000,
        periodAnchorAt: "2020-01-01T00:00:00.000Z",
        activatedAt: now,
        canceledAt: now,
        simulatedInvoices: [],
        createdAt: now,
        updatedAt: now,
      });
    };
    const baseline = await getDoctorBillingOverview(drPark());
    vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_x");
    setStripeForTests({
      subscriptions: { retrieve: vi.fn().mockRejectedValue(new Error("down")) },
      invoices: {
        createPreview: vi.fn().mockResolvedValue({ total: 500 }),
        list: vi.fn().mockResolvedValue({ data: [] }),
      },
    } as unknown as StripeLike);
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    await saveAccount();

    const overview = await getDoctorBillingOverview(drPark());
    expect(overview.stripeError).toBe("Couldn't reach Stripe. Showing DoctorLoop's own usage records.");
    expect(overview.upcomingInvoice).toBeNull();
    expect(overview.invoices).toEqual([]);
    expect(overview.totals).toEqual(baseline.totals);
  });

  it("private totals are bucketed by month: different days give identical private totals", async () => {
    const now = new Date();
    const pid = mayaPatientId();
    const day = (n: number) => {
      const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), n)).toISOString().slice(0, 10);
      return { from: d, to: d };
    };
    const a = await getPatientUsageStatement(drPark(), pid, day(1), now);
    const b = await getPatientUsageStatement(drPark(), pid, day(now.getUTCDate()), now);
    expect(a.privatePeriod).toEqual(b.privatePeriod);
    expect(a.privatePeriod.start).toBe(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString());
    expect(a.privateTotal).toEqual(b.privateTotal);
  });

  it("overview window is the current UTC month", async () => {
    const now = new Date();
    const overview = await getDoctorBillingOverview(drPark(), now);
    expect(overview.window.start).toBe(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString());
    expect(overview.window.end).toBe(now.toISOString());
  });

  it("overview never itemizes Maya's pending entry or lets it set lastItemizedAt", async () => {
    const pid = mayaPatientId();
    const pending = seeded().entries.find((e) => e.patientId === pid && e.reviewStatus === "pending_review");
    if (!pending) throw new Error("no pending entry");
    const repo = getSystemRepository();
    const source = seeded().usageRecords.find((u) => u.journalEntryId === pending.id);
    if (!source) throw new Error("no usage");
    const { id: _id, createdAt: _c, ...rest } = source;
    void _id;
    void _c;
    const now = new Date();
    const [fresh] = await repo.createUsageRecords([{ ...rest, occurredAt: new Date(now.getTime() - 1000).toISOString() }]);
    const pendingIds = new Set([source.id, fresh.id]);

    const overview = await getDoctorBillingOverview(drPark(), now);
    expect(overview.recent.some((l) => pendingIds.has(l.id))).toBe(false);
    const row = overview.patients.find((p) => p.patientId === pid);
    expect(row).toBeDefined();
    expect(row?.lastItemizedAt).not.toBe(fresh.occurredAt);
    expect(overview.totals.runs).toBeGreaterThan(overview.recent.length);
  });

  it("upcoming invoice in simulated mode sums billed usage of the current period", async () => {
    const now = new Date();
    const iso = now.toISOString();
    const repo = getSystemRepository();
    await repo.saveBillingAccount({
      doctorId: DEMO_IDS.users.drPark,
      mode: "simulated",
      status: "active",
      stripeCustomerId: null,
      stripeSubscriptionId: null,
      stripePriceId: null,
      paymentMethodLabel: "Simulated card",
      rateMicrosPer1k: 10_000,
      periodAnchorAt: new Date(now.getTime() - 5 * 86_400_000).toISOString(),
      activatedAt: iso,
      canceledAt: null,
      simulatedInvoices: [],
      createdAt: iso,
      updatedAt: iso,
    });
    const base = seeded().usageRecords[0];
    const { id: _id, createdAt: _c, ...rest } = base;
    void _id;
    void _c;
    await repo.createUsageRecords([
      { ...rest, billingDoctorId: DEMO_IDS.users.drPark, billingStatus: "billed", amountMicros: 1_500_000, totalTokens: 150_000, occurredAt: new Date(now.getTime() - 86_400_000).toISOString() },
      { ...rest, billingDoctorId: DEMO_IDS.users.drPark, billingStatus: "billed", amountMicros: 500_000, totalTokens: 50_000, occurredAt: new Date(now.getTime() - 2 * 86_400_000).toISOString() },
      // Outside the current period and not billed: must not count.
      { ...rest, billingDoctorId: DEMO_IDS.users.drPark, billingStatus: "billed", amountMicros: 9_000_000, totalTokens: 900_000, occurredAt: new Date(now.getTime() - 20 * 86_400_000).toISOString() },
      { ...rest, billingDoctorId: DEMO_IDS.users.drPark, billingStatus: "not_billed", amountMicros: 7_000_000, totalTokens: 700_000, occurredAt: new Date(now.getTime() - 86_400_000).toISOString() },
    ]);

    const overview = await getDoctorBillingOverview(drPark(), now);
    expect(overview.upcomingInvoice).toMatchObject({ amountCents: 200, totalTokens: 200_000, source: "simulated", note: null });
    expect(overview.stripeError).toBeNull();
    expect(overview.account.currentPeriod).not.toBeNull();
  });

  it("CSV export escapes cells and names the file after the patient and range", async () => {
    const pid = mayaPatientId();
    const { filename, csv } = await getPatientUsageStatementCsv(drPark(), pid, { from: "2026-11-01", to: "2026-11-10" });
    expect(filename).toBe("doctorloop-usage-maya-thompson-2026-11-01-2026-11-10.csv");
    const rows = csv.split("\n");
    expect(rows[0].startsWith("date_utc,patient,patient_ref")).toBe(true);
    expect(rows[rows.length - 1]).toContain(PRIVATE_LINE_LABEL);

    // A patient name that needs escaping is quoted in the CSV.
    const profile = seeded().patients.find((p) => p.id === pid);
    if (!profile) throw new Error("no patient");
    profile.fullName = '=Maya, "M"';
    const escaped = await getPatientUsageStatementCsv(drPark(), pid, WIDE);
    expect(escaped.csv).toContain(`"'=Maya, ""M"""`);
  });
});

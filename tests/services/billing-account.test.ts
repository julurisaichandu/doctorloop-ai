import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetLocalDb } from "@/lib/data/local/local-db";
import { getSystemRepository } from "@/lib/data";
import { DEMO_IDS } from "@/lib/demo/seed";
import { SIMULATED_CARD_LABEL } from "@/lib/billing/simulated";
import { METER_EVENT_NAME, resetStripeCatalogCache } from "@/lib/integrations/stripe/catalog";
import { setStripeForTests, type StripeLike } from "@/lib/integrations/stripe/client";
import { recordAiUsage } from "@/lib/services/billing-usage";
import {
  activateSimulatedBilling,
  cancelSimulatedBilling,
  completeStripeCheckout,
  handleStripeWebhook,
  invoiceNow,
  refreshAccountReporting,
  startBillingSetup,
} from "@/lib/services/billing-account";
import { drBell, drPark, maya, patientIdOf, priya } from "./support";

const requireActor = vi.hoisted(() => vi.fn());
vi.mock("@/lib/auth/session", () => ({ requireActor }));

const PERIOD_START = 1_700_000_000;
const NOTHING_TO_INVOICE = "Nothing to invoice yet — no billed AI usage in this period.";

function subscription(over: Record<string, unknown> = {}) {
  return {
    id: "sub_1",
    status: "active",
    items: { data: [{ current_period_start: PERIOD_START, current_period_end: PERIOD_START + 2_592_000 }] },
    default_payment_method: { card: { brand: "visa", last4: "4242" } },
    ...over,
  };
}

function checkoutSession(doctorId: string, over: Record<string, unknown> = {}) {
  return {
    id: "cs_1",
    status: "complete",
    client_reference_id: doctorId,
    customer: "cus_1",
    subscription: subscription(),
    ...over,
  };
}

function fakeStripe(extra: Record<string, unknown> = {}) {
  const fake = {
    billing: {
      meterEvents: { create: vi.fn().mockResolvedValue({}) },
      meters: {
        list: vi.fn().mockResolvedValue({ data: [{ id: "mtr_1", event_name: METER_EVENT_NAME }] }),
        create: vi.fn(),
      },
    },
    prices: { list: vi.fn().mockResolvedValue({ data: [{ id: "price_1" }] }), create: vi.fn() },
    billingPortal: {
      configurations: {
        list: vi.fn().mockResolvedValue({ data: [{ id: "bpc_1", metadata: { doctorloop: "portal" } }] }),
        create: vi.fn(),
      },
      sessions: { create: vi.fn().mockResolvedValue({ url: "https://portal.test/s" }) },
    },
    customers: { create: vi.fn().mockResolvedValue({ id: "cus_1" }) },
    checkout: {
      sessions: {
        create: vi.fn().mockResolvedValue({ id: "cs_1", url: "https://checkout.test/cs_1" }),
        retrieve: vi.fn().mockResolvedValue(checkoutSession(DEMO_IDS.users.drPark)),
      },
    },
    subscriptions: {
      retrieve: vi.fn().mockResolvedValue(subscription()),
      list: vi.fn().mockResolvedValue({ data: [] }),
      update: vi.fn().mockResolvedValue({}),
    },
    webhooks: { constructEvent: vi.fn() },
    ...extra,
  };
  return fake;
}

function useStripe(fake: ReturnType<typeof fakeStripe>) {
  vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_x");
  setStripeForTests(fake as unknown as StripeLike);
}

const parkAccount = () => getSystemRepository().getBillingAccount(DEMO_IDS.users.drPark);

async function seedStripeAccount(over: Record<string, unknown> = {}) {
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
    ...over,
  });
}

async function recordUsage(tokens = 1000) {
  await recordAiUsage({
    patientId: patientIdOf(priya()),
    trigger: { kind: "patient", userId: priya().userId },
    items: [
      {
        operation: "entry_extraction",
        journalEntryId: null,
        provider: "mock",
        model: null,
        inputTokens: tokens / 2,
        outputTokens: tokens / 2,
        totalTokens: tokens,
        tokenSource: "estimated",
      },
    ],
  });
}

beforeEach(() => {
  resetLocalDb();
  setStripeForTests(null);
  resetStripeCatalogCache();
  requireActor.mockReset();
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  setStripeForTests(null);
  resetStripeCatalogCache();
});

describe("billing account lifecycle (simulated)", () => {
  it("startBillingSetup sends the doctor to the simulated checkout", async () => {
    expect(await startBillingSetup(drPark())).toEqual({ redirectTo: "/doctor/billing/checkout" });
    expect(await parkAccount()).toBeNull();
  });

  it("activateSimulatedBilling activates with the test card and current rate", async () => {
    const before = Date.now();
    const account = await activateSimulatedBilling(drPark());
    expect(account).toMatchObject({
      mode: "simulated",
      status: "active",
      paymentMethodLabel: SIMULATED_CARD_LABEL,
      rateMicrosPer1k: 10_000,
    });
    expect(Date.parse(account.periodAnchorAt ?? "")).toBeGreaterThanOrEqual(before);
    await expect(startBillingSetup(drPark())).rejects.toMatchObject({
      code: "CONFLICT",
      message: "Billing is already set up.",
    });
  });

  it("patients cannot use billing services", async () => {
    await expect(startBillingSetup(maya())).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(invoiceNow(maya())).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(activateSimulatedBilling(maya())).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("invoiceNow refuses when nothing was billed in the period", async () => {
    await activateSimulatedBilling(drPark());
    await expect(invoiceNow(drPark(), new Date(Date.now() + 1000))).rejects.toMatchObject({
      code: "CONFLICT",
      message: NOTHING_TO_INVOICE,
    });
    await expect(invoiceNow(drBell())).rejects.toMatchObject({ code: "CONFLICT", message: "Billing isn't active." });
  });

  it("invoiceNow closes the simulated period with a paid invoice and refuses an immediate second click", async () => {
    await activateSimulatedBilling(drPark());
    await recordUsage(1000);
    await recordUsage(500);
    const first = new Date(Date.now() + 5000);
    expect(await invoiceNow(drPark(), first)).toEqual({ invoiceNumber: "SIM-0001" });
    const account = await parkAccount();
    expect(account?.simulatedInvoices[0]).toMatchObject({
      number: "SIM-0001",
      totalTokens: 1500,
      amountMicros: 15_000,
      status: "paid",
      paidWith: SIMULATED_CARD_LABEL,
    });
    expect(account?.periodAnchorAt).toBe(first.toISOString());
    await expect(invoiceNow(drPark(), new Date(first.getTime() + 5000))).rejects.toMatchObject({
      code: "CONFLICT",
      message: NOTHING_TO_INVOICE,
    });
  });

  it("cancelSimulatedBilling stops billing new usage", async () => {
    await activateSimulatedBilling(drPark());
    await recordUsage();
    const canceled = await cancelSimulatedBilling(drPark());
    expect(canceled.status).toBe("canceled");
    await expect(cancelSimulatedBilling(drPark())).rejects.toMatchObject({
      code: "CONFLICT",
      message: "Billing isn't active.",
    });
    await recordUsage();
    const records = await getSystemRepository().listUsageRecords({
      billingDoctorId: DEMO_IDS.users.drPark,
      since: canceled.activatedAt ?? undefined,
      order: "asc",
    });
    expect(records.map((r) => r.billingStatus)).toEqual(["billed", "not_billed"]);
  });
});

describe("billing account lifecycle (Stripe mode, fake client)", () => {
  it("startBillingSetup reuses the saved Stripe customer on a second attempt", async () => {
    const fake = fakeStripe();
    useStripe(fake);
    expect(await startBillingSetup(drPark())).toEqual({ redirectTo: "https://checkout.test/cs_1" });
    expect(await parkAccount()).toMatchObject({ mode: "stripe", status: "pending_setup", stripeCustomerId: "cus_1" });
    await startBillingSetup(drPark());
    expect(fake.customers.create).toHaveBeenCalledTimes(1);
  });

  it("startBillingSetup is serialized so concurrent clicks create one customer", async () => {
    const fake = fakeStripe();
    useStripe(fake);
    await Promise.all([startBillingSetup(drPark()), startBillingSetup(drPark())]);
    expect(fake.customers.create).toHaveBeenCalledTimes(1);
  });

  it("completeStripeCheckout activates only the doctor's own completed session", async () => {
    const fake = fakeStripe();
    useStripe(fake);
    await startBillingSetup(drPark());

    fake.checkout.sessions.retrieve.mockResolvedValueOnce(checkoutSession(DEMO_IDS.users.drBell));
    await expect(completeStripeCheckout(drPark(), "cs_1")).rejects.toMatchObject({ code: "FORBIDDEN" });

    fake.checkout.sessions.retrieve.mockResolvedValueOnce(
      checkoutSession(DEMO_IDS.users.drPark, { status: "open", subscription: null }),
    );
    await expect(completeStripeCheckout(drPark(), "cs_1")).rejects.toMatchObject({ code: "CONFLICT" });

    fake.checkout.sessions.retrieve.mockResolvedValueOnce(
      checkoutSession(DEMO_IDS.users.drPark, { customer: "cus_other" }),
    );
    await expect(completeStripeCheckout(drPark(), "cs_1")).rejects.toMatchObject({ code: "FORBIDDEN" });

    const account = await completeStripeCheckout(drPark(), "cs_1");
    expect(account).toMatchObject({
      status: "active",
      stripeSubscriptionId: "sub_1",
      paymentMethodLabel: "Visa •••• 4242",
      periodAnchorAt: new Date(PERIOD_START * 1000).toISOString(),
    });
  });

  it("checkout return route redirects to setup=error for a garbage session and leaves the account pending", async () => {
    const fake = fakeStripe();
    useStripe(fake);
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    requireActor.mockResolvedValue(drPark());
    await startBillingSetup(drPark());
    fake.checkout.sessions.retrieve.mockRejectedValueOnce(new Error("No such session"));
    const { GET } = await import("@/app/api/billing/checkout/complete/route");
    const response = await GET(new Request("http://localhost/api/billing/checkout/complete?session_id=bad"));
    expect(response.headers.get("location")).toMatch(/\/doctor\/billing\?setup=error$/);
    expect((await parkAccount())?.status).toBe("pending_setup");
  });

  it("checkout return route redirects to setup=error when the subscription is not active yet", async () => {
    const fake = fakeStripe();
    useStripe(fake);
    requireActor.mockResolvedValue(drPark());
    await startBillingSetup(drPark());
    fake.checkout.sessions.retrieve.mockResolvedValueOnce(
      checkoutSession(DEMO_IDS.users.drPark, { subscription: subscription({ status: "incomplete" }) }),
    );
    const { GET } = await import("@/app/api/billing/checkout/complete/route");
    const response = await GET(new Request("http://localhost/api/billing/checkout/complete?session_id=cs_1"));
    expect(response.headers.get("location")).toMatch(/\/doctor\/billing\?setup=error$/);
    expect((await parkAccount())?.status).toBe("pending_setup");
  });

  it("checkout return route redirects to setup=success for an active subscription", async () => {
    useStripe(fakeStripe());
    requireActor.mockResolvedValue(drPark());
    await startBillingSetup(drPark());
    const { GET } = await import("@/app/api/billing/checkout/complete/route");
    const response = await GET(new Request("http://localhost/api/billing/checkout/complete?session_id=cs_1"));
    expect(response.headers.get("location")).toMatch(/\/doctor\/billing\?setup=success$/);
  });

  it("invoiceNow in Stripe mode resets the anchor once there is billed usage", async () => {
    const fake = fakeStripe();
    useStripe(fake);
    await seedStripeAccount();
    await expect(invoiceNow(drPark())).rejects.toMatchObject({ code: "CONFLICT", message: NOTHING_TO_INVOICE });
    await recordUsage();
    expect(await invoiceNow(drPark(), new Date(Date.now() + 5000))).toEqual({ invoiceNumber: null });
    expect(fake.subscriptions.update).toHaveBeenCalledWith("sub_1", expect.objectContaining({ proration_behavior: "always_invoice" }));
    expect((await parkAccount())?.periodAnchorAt).toBe(new Date(PERIOD_START * 1000).toISOString());
  });
});

describe("unrecorded completed Checkout (Stripe mode)", () => {
  const liveSub = (id = "sub_live") => ({
    id,
    status: "active",
    created: 1_700_000_000,
    items: { data: [{ price: { id: "price_1" } }] },
  });

  it("startBillingSetup adopts the live subscription instead of opening a second Checkout", async () => {
    const fake = fakeStripe();
    useStripe(fake);
    await startBillingSetup(drPark());
    expect(fake.checkout.sessions.create).toHaveBeenCalledTimes(1);
    fake.subscriptions.list.mockResolvedValue({ data: [liveSub()] });
    fake.subscriptions.retrieve.mockResolvedValue(subscription({ id: "sub_live" }));
    expect(await startBillingSetup(drPark())).toEqual({ redirectTo: "/doctor/billing?setup=success" });
    expect(fake.checkout.sessions.create).toHaveBeenCalledTimes(1);
    expect(await parkAccount()).toMatchObject({
      status: "active",
      stripeSubscriptionId: "sub_live",
      paymentMethodLabel: "Visa •••• 4242",
      periodAnchorAt: new Date(PERIOD_START * 1000).toISOString(),
    });
  });

  it("refreshAccountReporting self-heals a pending setup and reports lookup failures", async () => {
    const fake = fakeStripe();
    useStripe(fake);
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    await startBillingSetup(drPark());
    const pending = (await parkAccount()) as NonNullable<Awaited<ReturnType<typeof parkAccount>>>;

    expect(await refreshAccountReporting(pending)).toEqual({ account: pending, failed: false });

    fake.subscriptions.list.mockRejectedValueOnce(new Error("down"));
    expect(await refreshAccountReporting(pending)).toEqual({ account: pending, failed: true });

    fake.subscriptions.list.mockResolvedValue({ data: [liveSub()] });
    const healed = await refreshAccountReporting(pending);
    expect(healed.failed).toBe(false);
    expect(healed.account).toMatchObject({ status: "active", stripeSubscriptionId: "sub_live" });
    expect(await parkAccount()).toMatchObject({ status: "active", stripeSubscriptionId: "sub_live" });
  });

  it("replaying an old checkout session after a re-setup conflicts and keeps the current subscription", async () => {
    const fake = fakeStripe();
    useStripe(fake);
    await seedStripeAccount({ stripeSubscriptionId: "sub_current" });
    fake.checkout.sessions.retrieve.mockResolvedValue(checkoutSession(DEMO_IDS.users.drPark));
    await expect(completeStripeCheckout(drPark(), "cs_old")).rejects.toMatchObject({
      code: "CONFLICT",
      message: "This checkout is no longer valid. Open Billing to check your setup.",
    });
    expect((await parkAccount())?.stripeSubscriptionId).toBe("sub_current");
    // An idempotent replay of the session that created the current subscription is still fine.
    await seedStripeAccount({ stripeSubscriptionId: "sub_1" });
    expect(await completeStripeCheckout(drPark(), "cs_1")).toMatchObject({ stripeSubscriptionId: "sub_1" });
  });

  it("never adopts a canceled completion", async () => {
    const fake = fakeStripe();
    useStripe(fake);
    await startBillingSetup(drPark());
    fake.checkout.sessions.retrieve.mockResolvedValue(
      checkoutSession(DEMO_IDS.users.drPark, { subscription: subscription({ status: "canceled" }) }),
    );
    await expect(completeStripeCheckout(drPark(), "cs_1")).rejects.toMatchObject({ code: "CONFLICT" });
    expect((await parkAccount())?.status).toBe("pending_setup");
  });
});

describe("invoiceNow double-click safety (Stripe mode)", () => {
  it("does not re-invoice already-invoiced usage when the post-invoice refresh fails", async () => {
    const fake = fakeStripe();
    useStripe(fake);
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    await seedStripeAccount();
    await recordUsage();
    fake.subscriptions.retrieve.mockRejectedValue(new Error("down"));
    const first = new Date(Date.now() + 5000);
    expect(await invoiceNow(drPark(), first)).toEqual({ invoiceNumber: null });
    await expect(invoiceNow(drPark(), new Date(first.getTime() + 5000))).rejects.toMatchObject({
      code: "CONFLICT",
      message: NOTHING_TO_INVOICE,
    });
    expect(fake.subscriptions.update).toHaveBeenCalledTimes(1);
    expect((await parkAccount())?.periodAnchorAt).toBe(first.toISOString());
  });
});

describe("stripe webhook", () => {
  const event = (type: string, object: Record<string, unknown>) => ({ type, data: { object } });

  it("is disabled in simulated mode", async () => {
    expect(await handleStripeWebhook("{}", "sig")).toEqual({
      status: 404,
      body: "Billing webhooks are not enabled.",
    });
  });

  it("503 without secret, 400 on bad signature, 200 ignored for unknown customers, subscription.deleted cancels", async () => {
    const fake = fakeStripe();
    useStripe(fake);
    vi.stubEnv("STRIPE_WEBHOOK_SECRET", "");
    expect(await handleStripeWebhook("{}", "sig")).toEqual({
      status: 503,
      body: "STRIPE_WEBHOOK_SECRET is not configured.",
    });

    vi.stubEnv("STRIPE_WEBHOOK_SECRET", "whsec_x");
    expect(await handleStripeWebhook("{}", null)).toEqual({ status: 400, body: "Invalid signature." });
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    fake.webhooks.constructEvent.mockImplementationOnce(() => {
      throw new Error("bad");
    });
    expect(await handleStripeWebhook("{}", "sig")).toEqual({ status: 400, body: "Invalid signature." });

    fake.webhooks.constructEvent.mockReturnValueOnce(event("customer.subscription.deleted", { id: "sub_1", customer: "cus_nobody" }));
    expect(await handleStripeWebhook("{}", "sig")).toEqual({ status: 200, body: "ignored" });

    await seedStripeAccount();
    fake.webhooks.constructEvent.mockReturnValueOnce(event("invoice.payment_failed", { customer: "cus_1" }));
    expect((await handleStripeWebhook("{}", "sig")).body).toBe("ok");
    expect((await parkAccount())?.status).toBe("past_due");
    fake.webhooks.constructEvent.mockReturnValueOnce(event("invoice.paid", { customer: "cus_1" }));
    await handleStripeWebhook("{}", "sig");
    expect((await parkAccount())?.status).toBe("active");

    fake.webhooks.constructEvent.mockReturnValueOnce(event("customer.subscription.deleted", { id: "sub_1", customer: "cus_1" }));
    expect(await handleStripeWebhook("{}", "sig")).toEqual({ status: 200, body: "ok" });
    expect((await parkAccount())?.status).toBe("canceled");
  });

  it("checkout.session.completed activates a pending account by re-reading the session", async () => {
    const fake = fakeStripe();
    useStripe(fake);
    vi.stubEnv("STRIPE_WEBHOOK_SECRET", "whsec_x");
    await startBillingSetup(drPark());
    fake.webhooks.constructEvent.mockReturnValueOnce(
      event("checkout.session.completed", {
        id: "cs_1",
        client_reference_id: DEMO_IDS.users.drPark,
        customer: "cus_1",
      }),
    );
    expect(await handleStripeWebhook("{}", "sig")).toEqual({ status: 200, body: "ok" });
    expect(await parkAccount()).toMatchObject({ status: "active", stripeSubscriptionId: "sub_1" });
  });
});

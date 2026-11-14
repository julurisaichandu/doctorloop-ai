import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { METER_EVENT_NAME, ensureStripeCatalog, resetStripeCatalogCache } from "@/lib/integrations/stripe/catalog";
import { getStripe, setStripeForTests, type StripeLike } from "@/lib/integrations/stripe/client";
import {
  createSubscriptionCheckout,
  ensureCustomer,
  findLiveSubscription,
  invoiceUsageNow,
  mapSubscriptionStatus,
  readCompletedCheckout,
  sendMeterEvent,
} from "@/lib/integrations/stripe/operations";

function catalogFake(existing: boolean) {
  return {
    billing: {
      meters: {
        list: vi.fn().mockResolvedValue({ data: existing ? [{ id: "mtr_1", event_name: METER_EVENT_NAME }] : [] }),
        create: vi.fn().mockResolvedValue({ id: "mtr_new" }),
      },
    },
    prices: {
      list: vi.fn().mockResolvedValue({ data: existing ? [{ id: "price_1" }] : [] }),
      create: vi.fn().mockResolvedValue({ id: "price_new" }),
    },
    billingPortal: {
      configurations: {
        list: vi.fn().mockResolvedValue({
          data: existing ? [{ id: "bpc_other", metadata: {} }, { id: "bpc_1", metadata: { doctorloop: "portal" } }] : [],
        }),
        create: vi.fn().mockResolvedValue({ id: "bpc_new" }),
      },
    },
  };
}

beforeEach(() => resetStripeCatalogCache());
afterEach(() => {
  setStripeForTests(null);
  resetStripeCatalogCache();
  vi.unstubAllEnvs();
});

describe("ensureStripeCatalog", () => {
  it("reuses an existing meter, price and portal configuration", async () => {
    const fake = catalogFake(true);
    const catalog = await ensureStripeCatalog(fake as unknown as StripeLike, 10_000);
    expect(catalog).toEqual({ meterId: "mtr_1", priceId: "price_1", portalConfigurationId: "bpc_1" });
    expect(fake.billing.meters.create).not.toHaveBeenCalled();
    expect(fake.prices.create).not.toHaveBeenCalled();
    expect(fake.billingPortal.configurations.create).not.toHaveBeenCalled();
    expect(fake.prices.list).toHaveBeenCalledWith({
      lookup_keys: ["doctorloop_ai_tokens_10000"],
      active: true,
      limit: 1,
    });
  });

  it("creates meter, price and portal configuration when missing", async () => {
    const fake = catalogFake(false);
    const catalog = await ensureStripeCatalog(fake as unknown as StripeLike, 10_000);
    expect(catalog).toEqual({ meterId: "mtr_new", priceId: "price_new", portalConfigurationId: "bpc_new" });
    expect(fake.billing.meters.create).toHaveBeenCalledWith({
      display_name: "DoctorLoop AI tokens",
      event_name: "doctorloop_ai_tokens",
      default_aggregation: { formula: "sum" },
      customer_mapping: { event_payload_key: "stripe_customer_id", type: "by_id" },
      value_settings: { event_payload_key: "value" },
    });
    const priceParams = fake.prices.create.mock.calls[0][0];
    expect(String(priceParams.unit_amount_decimal)).toBe("0.001");
    expect(priceParams).toMatchObject({
      currency: "usd",
      billing_scheme: "per_unit",
      recurring: { interval: "month", usage_type: "metered", meter: "mtr_new" },
      lookup_key: "doctorloop_ai_tokens_10000",
      product_data: { name: "DoctorLoop AI usage" },
    });
    expect(fake.billingPortal.configurations.create).toHaveBeenCalledWith({
      features: {
        invoice_history: { enabled: true },
        payment_method_update: { enabled: true },
        subscription_cancel: { enabled: true, mode: "immediately" },
      },
      business_profile: { headline: "DoctorLoop AI · practice billing (test mode)" },
      metadata: { doctorloop: "portal" },
    });
  });

  it("memoizes the catalog per rate", async () => {
    const fake = catalogFake(true);
    await ensureStripeCatalog(fake as unknown as StripeLike, 10_000);
    await ensureStripeCatalog(fake as unknown as StripeLike, 10_000);
    expect(fake.billing.meters.list).toHaveBeenCalledTimes(1);
    await ensureStripeCatalog(fake as unknown as StripeLike, 20_000);
    expect(fake.billing.meters.list).toHaveBeenCalledTimes(2);
  });

  it("drops the memo when the catalog fails", async () => {
    const fake = catalogFake(true);
    fake.billing.meters.list.mockRejectedValueOnce(new Error("boom"));
    await expect(ensureStripeCatalog(fake as unknown as StripeLike, 10_000)).rejects.toMatchObject({
      code: "INTEGRATION",
    });
    await expect(ensureStripeCatalog(fake as unknown as StripeLike, 10_000)).resolves.toBeTruthy();
  });
});

describe("operations", () => {
  it("ensureCustomer reuses an existing id and only creates once", async () => {
    const create = vi.fn().mockResolvedValue({ id: "cus_new" });
    const stripe = { customers: { create } } as unknown as StripeLike;
    const doctor = { id: "doc-1", fullName: "Dr Park", email: "park@example.com" };
    expect(await ensureCustomer(stripe, doctor, "cus_old")).toBe("cus_old");
    expect(create).not.toHaveBeenCalled();
    expect(await ensureCustomer(stripe, doctor, null)).toBe("cus_new");
    expect(create).toHaveBeenCalledTimes(1);
    expect(create).toHaveBeenCalledWith({
      name: "Dr Park",
      email: "park@example.com",
      metadata: { doctorloop_doctor_id: "doc-1" },
    });
  });

  it("checkout uses subscription mode, metered price without quantity and the doctor as client_reference_id", async () => {
    const create = vi.fn().mockResolvedValue({ id: "cs_1", url: "https://checkout.stripe.com/c/cs_1" });
    const stripe = { checkout: { sessions: { create } } } as unknown as StripeLike;
    const out = await createSubscriptionCheckout(stripe, {
      customerId: "cus_1",
      priceId: "price_1",
      doctorId: "doc-1",
      appUrl: "http://localhost:3000",
    });
    expect(out).toEqual({ id: "cs_1", url: "https://checkout.stripe.com/c/cs_1" });
    const params = create.mock.calls[0][0];
    expect(params).toEqual({
      mode: "subscription",
      customer: "cus_1",
      line_items: [{ price: "price_1" }],
      client_reference_id: "doc-1",
      metadata: { doctorloop_doctor_id: "doc-1" },
      subscription_data: { metadata: { doctorloop_doctor_id: "doc-1" } },
      success_url: "http://localhost:3000/api/billing/checkout/complete?session_id={CHECKOUT_SESSION_ID}",
      cancel_url: "http://localhost:3000/doctor/billing?setup=cancelled",
    });
    expect(params.line_items[0]).not.toHaveProperty("quantity");
  });

  const completeSession = (over: Record<string, unknown> = {}) => ({
    id: "cs_1",
    status: "complete",
    client_reference_id: "doc-1",
    customer: "cus_1",
    subscription: {
      id: "sub_1",
      status: "active",
      billing_cycle_anchor: 1_789_000_000,
      default_payment_method: { card: { brand: "visa", last4: "4242" } },
      items: { data: [{ current_period_start: 1_789_000_000, current_period_end: 1_791_592_000 }] },
    },
    ...over,
  });
  const retrieveFake = (session: unknown) =>
    ({ checkout: { sessions: { retrieve: vi.fn().mockResolvedValue(session) } } }) as unknown as StripeLike;

  it("readCompletedCheckout rejects another doctor's session", async () => {
    await expect(readCompletedCheckout(retrieveFake(completeSession()), "cs_1", "doc-2")).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });

  it("readCompletedCheckout rejects an incomplete session", async () => {
    const stripe = retrieveFake(completeSession({ status: "open" }));
    await expect(readCompletedCheckout(stripe, "cs_1", "doc-1")).rejects.toMatchObject({ code: "CONFLICT" });
    const noSub = retrieveFake(completeSession({ subscription: null }));
    await expect(readCompletedCheckout(noSub, "cs_1", "doc-1")).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("readCompletedCheckout maps subscription, period and card label", async () => {
    const stripe = retrieveFake(completeSession());
    const out = await readCompletedCheckout(stripe, "cs_1", "doc-1");
    expect(out).toEqual({
      customerId: "cus_1",
      subscriptionId: "sub_1",
      status: "active",
      periodAnchorAt: new Date(1_789_000_000 * 1000).toISOString(),
      paymentMethodLabel: "Visa •••• 4242",
    });
    expect(stripe.checkout.sessions.retrieve).toHaveBeenCalledWith("cs_1", {
      expand: ["subscription", "subscription.default_payment_method"],
    });
  });

  it("maps subscription statuses", () => {
    expect(mapSubscriptionStatus("trialing")).toBe("active");
    expect(mapSubscriptionStatus("unpaid")).toBe("past_due");
    expect(mapSubscriptionStatus("incomplete")).toBe("pending_setup");
    expect(mapSubscriptionStatus("paused")).toBe("canceled");
    expect(mapSubscriptionStatus("weird")).toBe("pending_setup");
  });

  it("meter events carry only stripe_customer_id and value", async () => {
    const create = vi.fn().mockResolvedValue({});
    const stripe = { billing: { meterEvents: { create } } } as unknown as StripeLike;
    await sendMeterEvent(stripe, {
      customerId: "cus_1",
      recordId: "rec-1",
      totalTokens: 2100,
      occurredAt: new Date(1_789_000_000 * 1000).toISOString(),
    });
    expect(create).toHaveBeenCalledWith(
      {
        event_name: "doctorloop_ai_tokens",
        payload: { stripe_customer_id: "cus_1", value: "2100" },
        identifier: "rec-1",
        timestamp: 1_789_000_000,
      },
      { maxNetworkRetries: 0 },
    );
    expect(Object.keys(create.mock.calls[0][0].payload)).toEqual(["stripe_customer_id", "value"]);
  });

  it("findLiveSubscription picks the newest live subscription on the price", async () => {
    const sub = (id: string, status: string, created: number, priceId: string) => ({
      id,
      status,
      created,
      items: { data: [{ price: { id: priceId } }] },
    });
    const list = vi.fn().mockResolvedValue({
      data: [
        sub("sub_old", "active", 100, "price_1"),
        sub("sub_new", "trialing", 300, "price_1"),
        sub("sub_canceled", "canceled", 400, "price_1"),
        sub("sub_other_price", "active", 500, "price_2"),
      ],
    });
    const stripe = { subscriptions: { list } } as unknown as StripeLike;
    expect(await findLiveSubscription(stripe, { customerId: "cus_1", priceId: "price_1" })).toBe("sub_new");
    expect(list).toHaveBeenCalledWith({ customer: "cus_1", status: "all", limit: 20 });
    list.mockResolvedValue({ data: [sub("sub_x", "canceled", 1, "price_1")] });
    expect(await findLiveSubscription(stripe, { customerId: "cus_1", priceId: "price_1" })).toBeNull();
  });

  it("findLiveSubscription wraps Stripe errors", async () => {
    const list = vi.fn().mockRejectedValue(new Error("boom"));
    const stripe = { subscriptions: { list } } as unknown as StripeLike;
    await expect(findLiveSubscription(stripe, { customerId: "c", priceId: "p" })).rejects.toMatchObject({
      code: "INTEGRATION",
    });
  });

  it("invoice now resets the billing cycle anchor and always invoices", async () => {
    const update = vi.fn().mockResolvedValue({});
    await invoiceUsageNow({ subscriptions: { update } } as unknown as StripeLike, "sub_1");
    expect(update).toHaveBeenCalledWith("sub_1", {
      billing_cycle_anchor: { type: "now" },
      proration_behavior: "always_invoice",
    });
  });

  it("wraps Stripe errors without echoing their message", async () => {
    const create = vi.fn().mockRejectedValue(new Error("secret stripe detail"));
    const stripe = { customers: { create } } as unknown as StripeLike;
    const err = await ensureCustomer(stripe, { id: "d", fullName: "n", email: "e@x.com" }, null).catch((e) => e);
    expect(err).toMatchObject({ code: "INTEGRATION" });
    expect(String(err.message)).not.toContain("secret stripe detail");
  });
});

describe("getStripe", () => {
  it("refuses live keys", () => {
    vi.stubEnv("STRIPE_SECRET_KEY", "sk_live_x");
    expect(() => getStripe()).toThrowError(expect.objectContaining({ code: "INTEGRATION" }));
  });

  it("returns the test override", () => {
    const fake = {} as unknown as StripeLike;
    setStripeForTests(fake);
    expect(getStripe()).toBe(fake);
  });
});

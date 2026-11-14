// No "server-only" / env imports on purpose: takes a StripeLike and plain parameters.
import type Stripe from "stripe";
import type { BillingAccountStatus, BillingInvoiceView } from "@/lib/domain/types";
import { conflict, forbidden, integrationError, isAppError } from "@/lib/errors";
import type { StripeLike } from "./client";
import { METER_EVENT_NAME } from "./catalog";

/** Run a Stripe call; log the real error, surface only a safe message. */
async function guarded<T>(what: string, fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    if (isAppError(error)) throw error;
    console.error(`[stripe] ${what} failed`, error);
    throw integrationError("Stripe test mode request failed. Please try again.");
  }
}

const iso = (unixSeconds: number) => new Date(unixSeconds * 1000).toISOString();

export async function ensureCustomer(
  stripe: StripeLike,
  doctor: { id: string; fullName: string; email: string },
  existingCustomerId: string | null,
): Promise<string> {
  if (existingCustomerId) return existingCustomerId;
  const customer = await guarded("customer create", () =>
    stripe.customers.create({
      name: doctor.fullName,
      email: doctor.email,
      metadata: { doctorloop_doctor_id: doctor.id },
    }),
  );
  return customer.id;
}

export async function createSubscriptionCheckout(
  stripe: StripeLike,
  input: { customerId: string; priceId: string; doctorId: string; appUrl: string },
): Promise<{ id: string; url: string }> {
  const session = await guarded("checkout create", () =>
    stripe.checkout.sessions.create({
      mode: "subscription",
      customer: input.customerId,
      line_items: [{ price: input.priceId }],
      client_reference_id: input.doctorId,
      metadata: { doctorloop_doctor_id: input.doctorId },
      subscription_data: { metadata: { doctorloop_doctor_id: input.doctorId } },
      success_url: `${input.appUrl}/api/billing/checkout/complete?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${input.appUrl}/doctor/billing?setup=cancelled`,
    }),
  );
  if (!session.url) throw integrationError("Stripe test mode request failed. Please try again.");
  return { id: session.id, url: session.url };
}

export function mapSubscriptionStatus(status: string): BillingAccountStatus {
  switch (status) {
    case "active":
    case "trialing":
      return "active";
    case "past_due":
    case "unpaid":
      return "past_due";
    case "canceled":
    case "incomplete_expired":
    case "paused":
      return "canceled";
    default:
      return "pending_setup";
  }
}

function paymentMethodLabel(pm: Stripe.Subscription["default_payment_method"] | undefined): string | null {
  if (!pm || typeof pm === "string") return null;
  const card = pm.card;
  if (!card) return null;
  const brand = card.brand ? card.brand.charAt(0).toUpperCase() + card.brand.slice(1) : "Card";
  return `${brand} •••• ${card.last4}`;
}

function subscriptionPeriod(sub: Stripe.Subscription): { start: number; end: number } {
  const item = sub.items.data[0];
  if (!item) throw integrationError("Stripe test mode request failed. Please try again.");
  return { start: item.current_period_start, end: item.current_period_end };
}

export interface CheckoutCompletion {
  customerId: string;
  subscriptionId: string;
  status: BillingAccountStatus;
  periodAnchorAt: string;
  paymentMethodLabel: string | null;
}

export async function readCompletedCheckout(
  stripe: StripeLike,
  sessionId: string,
  doctorId: string,
): Promise<CheckoutCompletion> {
  const session = await guarded("checkout retrieve", () =>
    stripe.checkout.sessions.retrieve(sessionId, {
      expand: ["subscription", "subscription.default_payment_method"],
    }),
  );
  if (session.client_reference_id !== doctorId) throw forbidden("This checkout belongs to another account.");
  const sub = session.subscription;
  if (session.status !== "complete" || !sub || typeof sub === "string") {
    throw conflict("Checkout isn't complete yet.");
  }
  const customer = session.customer;
  const customerId = typeof customer === "string" ? customer : customer?.id;
  if (!customerId) throw conflict("Checkout isn't complete yet.");
  return {
    customerId,
    subscriptionId: sub.id,
    status: mapSubscriptionStatus(sub.status),
    periodAnchorAt: iso(subscriptionPeriod(sub).start),
    paymentMethodLabel: paymentMethodLabel(sub.default_payment_method),
  };
}

export interface SubscriptionState {
  status: BillingAccountStatus;
  periodStart: string;
  periodEnd: string;
  paymentMethodLabel: string | null;
}

export async function readSubscriptionState(stripe: StripeLike, subscriptionId: string): Promise<SubscriptionState> {
  const sub = await guarded("subscription retrieve", () =>
    stripe.subscriptions.retrieve(subscriptionId, { expand: ["default_payment_method"] }),
  );
  const period = subscriptionPeriod(sub);
  return {
    status: mapSubscriptionStatus(sub.status),
    periodStart: iso(period.start),
    periodEnd: iso(period.end),
    paymentMethodLabel: paymentMethodLabel(sub.default_payment_method),
  };
}

export async function sendMeterEvent(
  stripe: StripeLike,
  input: { customerId: string; recordId: string; totalTokens: number; occurredAt: string },
): Promise<void> {
  await guarded("meter event", () =>
    stripe.billing.meterEvents.create(
      {
        event_name: METER_EVENT_NAME,
        payload: { stripe_customer_id: input.customerId, value: String(input.totalTokens) },
        identifier: input.recordId,
        timestamp: Math.floor(Date.parse(input.occurredAt) / 1000),
      },
      // Patient flows wait at most about one timeout: no network retries here (the client default retries).
      { maxNetworkRetries: 0 },
    ),
  );
}

const LIVE_STATUSES = new Set(["active", "trialing", "past_due"]);

/** Newest live subscription of this customer on this price (heals a completed Checkout that was never recorded). */
export async function findLiveSubscription(
  stripe: StripeLike,
  input: { customerId: string; priceId: string },
): Promise<string | null> {
  const list = await guarded("subscription list", () =>
    stripe.subscriptions.list({ customer: input.customerId, status: "all", limit: 20 }),
  );
  const live = list.data
    .filter(
      (sub) => LIVE_STATUSES.has(sub.status) && sub.items.data.some((item) => item.price.id === input.priceId),
    )
    .sort((a, b) => b.created - a.created);
  return live[0]?.id ?? null;
}

export async function previewUpcomingInvoice(
  stripe: StripeLike,
  input: { customerId: string; subscriptionId: string },
): Promise<{ amountCents: number }> {
  const invoice = await guarded("invoice preview", () =>
    stripe.invoices.createPreview({ customer: input.customerId, subscription: input.subscriptionId }),
  );
  return { amountCents: invoice.total };
}

export async function listStripeInvoices(stripe: StripeLike, customerId: string): Promise<BillingInvoiceView[]> {
  const list = await guarded("invoice list", () => stripe.invoices.list({ customer: customerId, limit: 12 }));
  return list.data.map((invoice) => ({
    id: invoice.id as string,
    number: invoice.number ?? null,
    periodStart: iso(invoice.period_start),
    periodEnd: iso(invoice.period_end),
    amountCents: invoice.total,
    status: invoice.status ?? "draft",
    hostedUrl: invoice.hosted_invoice_url ?? null,
    pdfUrl: invoice.invoice_pdf ?? null,
    source: "stripe" as const,
  }));
}

export async function createPortalSession(
  stripe: StripeLike,
  input: { customerId: string; returnUrl: string; configurationId: string },
): Promise<string> {
  const session = await guarded("portal session", () =>
    stripe.billingPortal.sessions.create({
      customer: input.customerId,
      return_url: input.returnUrl,
      configuration: input.configurationId,
    }),
  );
  return session.url;
}

export async function invoiceUsageNow(stripe: StripeLike, subscriptionId: string): Promise<void> {
  await guarded("invoice now", () =>
    stripe.subscriptions.update(subscriptionId, {
      billing_cycle_anchor: { type: "now" },
      proration_behavior: "always_invoice",
    }),
  );
}

export function parseWebhookEvent(
  stripe: StripeLike,
  rawBody: string,
  signature: string,
  secret: string,
): Stripe.Event {
  try {
    return stripe.webhooks.constructEvent(rawBody, signature, secret);
  } catch (error) {
    console.error("[stripe] webhook verification failed", error);
    throw integrationError("Stripe webhook signature could not be verified.");
  }
}

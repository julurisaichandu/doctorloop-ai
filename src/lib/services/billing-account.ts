import "server-only";

import { assertDoctor } from "@/lib/authz/policies";
import {
  activateSimulatedAccount,
  cancelSimulatedAccount,
  closeSimulatedPeriod,
} from "@/lib/billing/simulated";
import { currentBillingPeriod } from "@/lib/billing/period";
import { env, getBillingMode } from "@/lib/config/env";
import { getSystemRepository } from "@/lib/data";
import type { Actor, BillingAccount } from "@/lib/domain/types";
import { conflict, forbidden } from "@/lib/errors";
import { ensureStripeCatalog } from "@/lib/integrations/stripe/catalog";
import { getStripe } from "@/lib/integrations/stripe/client";
import {
  createPortalSession,
  createSubscriptionCheckout,
  ensureCustomer,
  findLiveSubscription,
  invoiceUsageNow,
  mapSubscriptionStatus,
  parseWebhookEvent,
  readCompletedCheckout,
  readSubscriptionState,
} from "@/lib/integrations/stripe/operations";
import { isBillableAccount } from "@/lib/services/billing-usage";

const NOT_ACTIVE = "Billing isn't active.";

/** Per-doctor in-process promise chain: setups for one doctor never overlap. */
const setupChains = new Map<string, Promise<unknown>>();

function serializePerDoctor<T>(doctorId: string, task: () => Promise<T>): Promise<T> {
  const previous = setupChains.get(doctorId) ?? Promise.resolve();
  const result = previous.catch(() => undefined).then(task);
  const tail = result.catch(() => undefined);
  setupChains.set(doctorId, tail);
  void tail.then(() => {
    if (setupChains.get(doctorId) === tail) setupChains.delete(doctorId);
  });
  return result;
}

/** The doctor's account if it belongs to the current billing mode. */
export async function getEffectiveAccount(doctorId: string): Promise<BillingAccount | null> {
  const account = await getSystemRepository().getBillingAccount(doctorId);
  return account && account.mode === getBillingMode() ? account : null;
}

/** A Stripe-mode account that waits for Checkout: it has a customer and price but no subscription yet. */
function isPendingStripeSetup(account: BillingAccount | null): account is BillingAccount & {
  stripeCustomerId: string;
  stripePriceId: string;
} {
  return (
    account !== null &&
    account.mode === "stripe" &&
    account.status === "pending_setup" &&
    !account.stripeSubscriptionId &&
    Boolean(account.stripeCustomerId) &&
    Boolean(account.stripePriceId)
  );
}

/**
 * Heals a Checkout that completed in Stripe but was never recorded locally: adopts the customer's live
 * subscription on the saved price. Returns null when there is none.
 */
async function adoptLiveSubscription(
  account: BillingAccount & { stripeCustomerId: string; stripePriceId: string },
): Promise<BillingAccount | null> {
  const stripe = getStripe();
  const subscriptionId = await findLiveSubscription(stripe, {
    customerId: account.stripeCustomerId,
    priceId: account.stripePriceId,
  });
  if (!subscriptionId) return null;
  const state = await readSubscriptionState(stripe, subscriptionId);
  if (state.status === "canceled") return null;
  return getSystemRepository().saveBillingAccount({
    ...account,
    status: state.status,
    stripeSubscriptionId: subscriptionId,
    periodAnchorAt: state.periodStart,
    paymentMethodLabel: state.paymentMethodLabel,
    activatedAt: new Date().toISOString(),
    canceledAt: null,
  });
}

/** Like `refreshAccount`, but also reports whether the Stripe read failed. Never throws. */
export async function refreshAccountReporting(
  account: BillingAccount,
): Promise<{ account: BillingAccount; failed: boolean }> {
  if (isPendingStripeSetup(account)) {
    try {
      return { account: (await adoptLiveSubscription(account)) ?? account, failed: false };
    } catch (error) {
      console.error("[DoctorLoop] Billing refresh failed:", error);
      return { account, failed: true };
    }
  }
  if (account.mode !== "stripe" || !account.stripeSubscriptionId) return { account, failed: false };
  try {
    const state = await readSubscriptionState(getStripe(), account.stripeSubscriptionId);
    const next: BillingAccount = {
      ...account,
      status: state.status,
      periodAnchorAt: state.periodStart,
      paymentMethodLabel: state.paymentMethodLabel ?? account.paymentMethodLabel,
      canceledAt: state.status === "canceled" ? (account.canceledAt ?? new Date().toISOString()) : null,
    };
    const changed =
      next.status !== account.status ||
      next.periodAnchorAt !== account.periodAnchorAt ||
      next.paymentMethodLabel !== account.paymentMethodLabel ||
      next.canceledAt !== account.canceledAt;
    return { account: changed ? await getSystemRepository().saveBillingAccount(next) : account, failed: false };
  } catch (error) {
    console.error("[DoctorLoop] Billing refresh failed:", error);
    return { account, failed: true };
  }
}

/** Syncs a Stripe account with its subscription. Errors are logged and the original returned. */
export async function refreshAccount(account: BillingAccount): Promise<BillingAccount> {
  return (await refreshAccountReporting(account)).account;
}

export async function startBillingSetup(actor: Actor): Promise<{ redirectTo: string }> {
  assertDoctor(actor);
  return serializePerDoctor(actor.userId, async () => {
    const repo = getSystemRepository();
    const mode = getBillingMode();
    const existing = await repo.getBillingAccount(actor.userId);
    if (isBillableAccount(existing, mode)) throw conflict("Billing is already set up.");
    if (mode === "simulated") return { redirectTo: "/doctor/billing/checkout" };
    // The guard above narrows `existing` to null for the compiler; widen it back.
    const prior = existing as BillingAccount | null;

    if (isPendingStripeSetup(prior) && (await adoptLiveSubscription(prior))) {
      return { redirectTo: "/doctor/billing?setup=success" };
    }

    const stripe = getStripe();
    const catalog = await ensureStripeCatalog(stripe, env.billingRateMicrosPer1k);
    const customerId = await ensureCustomer(
      stripe,
      { id: actor.userId, fullName: actor.fullName, email: actor.email },
      prior?.mode === "stripe" ? prior.stripeCustomerId : null,
    );
    const now = new Date().toISOString();
    await repo.saveBillingAccount({
      doctorId: actor.userId,
      mode: "stripe",
      status: "pending_setup",
      stripeCustomerId: customerId,
      stripeSubscriptionId: null,
      stripePriceId: catalog.priceId,
      paymentMethodLabel: null,
      rateMicrosPer1k: env.billingRateMicrosPer1k,
      periodAnchorAt: null,
      activatedAt: null,
      canceledAt: null,
      simulatedInvoices: prior?.simulatedInvoices ?? [],
      createdAt: prior?.createdAt ?? now,
      updatedAt: now,
    });
    const session = await createSubscriptionCheckout(stripe, {
      customerId,
      priceId: catalog.priceId,
      doctorId: actor.userId,
      appUrl: env.appUrl,
    });
    return { redirectTo: session.url };
  });
}

export async function activateSimulatedBilling(actor: Actor): Promise<BillingAccount> {
  assertDoctor(actor);
  if (getBillingMode() === "stripe") {
    throw conflict("Simulated billing is off because a Stripe test key is configured.");
  }
  const repo = getSystemRepository();
  const existing = await repo.getBillingAccount(actor.userId);
  if (isBillableAccount(existing, "simulated")) throw conflict("Billing is already set up.");
  return repo.saveBillingAccount(
    activateSimulatedAccount(existing, actor.userId, env.billingRateMicrosPer1k, new Date()),
  );
}

export async function completeStripeCheckout(actor: Actor, sessionId: string): Promise<BillingAccount> {
  assertDoctor(actor);
  if (getBillingMode() !== "stripe") throw conflict("Stripe test mode is not configured.");
  const repo = getSystemRepository();
  const account = await repo.getBillingAccount(actor.userId);
  if (!account || account.mode !== "stripe" || !account.stripeCustomerId) {
    throw conflict("Billing setup hasn't started.");
  }
  const completion = await readCompletedCheckout(getStripe(), sessionId, actor.userId);
  if (completion.customerId !== account.stripeCustomerId) throw forbidden();
  const replay = completion.subscriptionId === account.stripeSubscriptionId;
  if ((account.status !== "pending_setup" && !replay) || completion.status === "canceled") {
    throw conflict("This checkout is no longer valid. Open Billing to check your setup.");
  }
  return repo.saveBillingAccount({
    ...account,
    status: completion.status,
    stripeSubscriptionId: completion.subscriptionId,
    periodAnchorAt: completion.periodAnchorAt,
    paymentMethodLabel: completion.paymentMethodLabel,
    activatedAt: new Date().toISOString(),
    canceledAt: null,
  });
}

export async function cancelSimulatedBilling(actor: Actor): Promise<BillingAccount> {
  assertDoctor(actor);
  const repo = getSystemRepository();
  const account = await repo.getBillingAccount(actor.userId);
  if (!isBillableAccount(account, "simulated")) throw conflict(NOT_ACTIVE);
  return repo.saveBillingAccount(cancelSimulatedAccount(account, new Date()));
}

export async function openBillingPortal(actor: Actor): Promise<{ redirectTo: string }> {
  assertDoctor(actor);
  const account = await getEffectiveAccount(actor.userId);
  if (getBillingMode() !== "stripe" || !account?.stripeCustomerId) {
    throw conflict("The billing portal is available in Stripe test mode.");
  }
  const stripe = getStripe();
  const catalog = await ensureStripeCatalog(stripe, account.rateMicrosPer1k);
  const url = await createPortalSession(stripe, {
    customerId: account.stripeCustomerId,
    returnUrl: `${env.appUrl}/doctor/billing`,
    configurationId: catalog.portalConfigurationId,
  });
  return { redirectTo: url };
}

export async function invoiceNow(actor: Actor, now: Date = new Date()): Promise<{ invoiceNumber: string | null }> {
  assertDoctor(actor);
  return serializePerDoctor(actor.userId, () => invoiceNowSerialized(actor, now));
}

async function invoiceNowSerialized(actor: Actor, now: Date): Promise<{ invoiceNumber: string | null }> {
  const repo = getSystemRepository();
  const mode = getBillingMode();
  const account = await repo.getBillingAccount(actor.userId);
  if (!isBillableAccount(account, mode) || !account.periodAnchorAt) throw conflict(NOT_ACTIVE);

  const period = currentBillingPeriod(account.periodAnchorAt, now);
  const billed = await repo.listUsageRecords({
    billingDoctorId: actor.userId,
    billingStatus: ["billed"],
    since: period.start,
    until: now.toISOString(),
  });
  if (billed.length === 0) throw conflict("Nothing to invoice yet — no billed AI usage in this period.");

  if (mode === "simulated") {
    const next = closeSimulatedPeriod(account, billed, period, now);
    await repo.saveBillingAccount(next);
    return { invoiceNumber: next.simulatedInvoices[0].number };
  }
  if (!account.stripeSubscriptionId) throw conflict(NOT_ACTIVE);
  await invoiceUsageNow(getStripe(), account.stripeSubscriptionId);
  // Move the anchor locally first so a failed refresh cannot let a second click re-invoice the same usage.
  const anchored = await repo.saveBillingAccount({ ...account, periodAnchorAt: now.toISOString() });
  await refreshAccount(anchored);
  return { invoiceNumber: null };
}

const idOf = (value: unknown): string | null => {
  if (typeof value === "string") return value;
  if (value && typeof value === "object" && typeof (value as { id?: unknown }).id === "string") {
    return (value as { id: string }).id;
  }
  return null;
};

export async function handleStripeWebhook(
  rawBody: string,
  signature: string | null,
): Promise<{ status: number; body: string }> {
  if (getBillingMode() !== "stripe") return { status: 404, body: "Billing webhooks are not enabled." };
  const secret = env.stripeWebhookSecret;
  if (!secret) return { status: 503, body: "STRIPE_WEBHOOK_SECRET is not configured." };
  if (!signature) return { status: 400, body: "Invalid signature." };

  const stripe = getStripe();
  let event;
  try {
    event = parseWebhookEvent(stripe, rawBody, signature, secret);
  } catch {
    return { status: 400, body: "Invalid signature." };
  }

  try {
    const repo = getSystemRepository();
    // Payloads use the endpoint's API version: take only the type and ids, re-fetch the rest.
    const object = event.data.object as unknown as Record<string, unknown>;
    const now = new Date().toISOString();

    switch (event.type) {
      case "checkout.session.completed": {
        const doctorId = typeof object.client_reference_id === "string" ? object.client_reference_id : null;
        const sessionId = idOf(object);
        const account = doctorId ? await repo.getBillingAccount(doctorId) : null;
        if (!doctorId || !sessionId || !account || account.mode !== "stripe" || account.status !== "pending_setup") {
          return { status: 200, body: "ignored" };
        }
        if (idOf(object.customer) !== account.stripeCustomerId) return { status: 200, body: "ignored" };
        const completion = await readCompletedCheckout(stripe, sessionId, doctorId);
        if (completion.customerId !== account.stripeCustomerId) return { status: 200, body: "ignored" };
        await repo.saveBillingAccount({
          ...account,
          status: completion.status,
          stripeSubscriptionId: completion.subscriptionId,
          periodAnchorAt: completion.periodAnchorAt,
          paymentMethodLabel: completion.paymentMethodLabel,
          activatedAt: now,
          canceledAt: null,
        });
        return { status: 200, body: "ok" };
      }
      case "customer.subscription.updated":
      case "customer.subscription.deleted": {
        const customerId = idOf(object.customer);
        const account = customerId ? await repo.findBillingAccountByStripeCustomer(customerId) : null;
        const subscriptionId = idOf(object);
        if (!account || account.mode !== "stripe" || !subscriptionId) return { status: 200, body: "ignored" };
        if (account.stripeSubscriptionId && account.stripeSubscriptionId !== subscriptionId) {
          return { status: 200, body: "ignored" };
        }
        if (event.type === "customer.subscription.deleted") {
          await repo.saveBillingAccount({
            ...account,
            status: mapSubscriptionStatus("canceled"),
            canceledAt: account.canceledAt ?? now,
          });
          return { status: 200, body: "ok" };
        }
        const state = await readSubscriptionState(stripe, subscriptionId);
        await repo.saveBillingAccount({
          ...account,
          status: state.status,
          stripeSubscriptionId: subscriptionId,
          periodAnchorAt: state.periodStart,
          paymentMethodLabel: state.paymentMethodLabel ?? account.paymentMethodLabel,
          canceledAt: state.status === "canceled" ? (account.canceledAt ?? now) : null,
        });
        return { status: 200, body: "ok" };
      }
      case "invoice.payment_failed":
      case "invoice.paid": {
        const customerId = idOf(object.customer);
        const account = customerId ? await repo.findBillingAccountByStripeCustomer(customerId) : null;
        if (!account || account.mode !== "stripe") return { status: 200, body: "ignored" };
        if (event.type === "invoice.payment_failed") {
          if (account.status === "active") await repo.saveBillingAccount({ ...account, status: "past_due" });
        } else if (account.status === "past_due") {
          await repo.saveBillingAccount({ ...account, status: "active" });
        }
        return { status: 200, body: "ok" };
      }
      default:
        return { status: 200, body: "ignored" };
    }
  } catch (error) {
    console.error("[DoctorLoop] Stripe webhook handling failed:", error);
    return { status: 500, body: "error" };
  }
}

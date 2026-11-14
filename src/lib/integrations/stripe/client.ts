import "server-only";
import Stripe from "stripe";
import { env, getBillingMode } from "@/lib/config/env";
import { integrationError } from "@/lib/errors";

export type StripeLike = Pick<
  Stripe,
  "billing" | "prices" | "customers" | "checkout" | "subscriptions" | "invoices" | "billingPortal" | "webhooks"
>;

let override: StripeLike | null = null;
let memo: StripeLike | null = null;

/** Test-mode Stripe client. Refuses to build one unless the key is a Stripe TEST key. */
export function getStripe(): StripeLike {
  if (override) return override;
  if (getBillingMode() !== "stripe") throw integrationError("Stripe test mode is not configured.");
  memo ??= new Stripe(env.stripeSecretKey as string, {
    timeout: 5_000,
    maxNetworkRetries: 2,
    appInfo: { name: "DoctorLoop AI (demo)" },
  });
  return memo;
}

export function setStripeForTests(client: StripeLike | null): void {
  override = client;
  memo = null;
}

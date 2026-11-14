// No "server-only" / env imports on purpose: scripts/stripe-setup.ts imports this under tsx.
import Stripe from "stripe";
import { stripeUnitAmountDecimal } from "@/lib/billing/money";
import { integrationError } from "@/lib/errors";
import type { StripeLike } from "./client";

export const METER_EVENT_NAME = "doctorloop_ai_tokens";

export interface StripeCatalog {
  meterId: string;
  priceId: string;
  portalConfigurationId: string;
}

const cache = new Map<number, Promise<StripeCatalog>>();

export function resetStripeCatalogCache(): void {
  cache.clear();
}

export function ensureStripeCatalog(stripe: StripeLike, rateMicrosPer1k: number): Promise<StripeCatalog> {
  const cached = cache.get(rateMicrosPer1k);
  if (cached) return cached;
  const pending = build(stripe, rateMicrosPer1k).catch((error: unknown) => {
    cache.delete(rateMicrosPer1k);
    console.error("[stripe] catalog setup failed", error);
    throw integrationError("Stripe test mode catalog could not be prepared.");
  });
  cache.set(rateMicrosPer1k, pending);
  return pending;
}

async function build(stripe: StripeLike, rate: number): Promise<StripeCatalog> {
  const meters = await stripe.billing.meters.list({ status: "active", limit: 100 });
  const meter =
    meters.data.find((m) => m.event_name === METER_EVENT_NAME) ??
    (await stripe.billing.meters.create({
      display_name: "DoctorLoop AI tokens",
      event_name: METER_EVENT_NAME,
      default_aggregation: { formula: "sum" },
      customer_mapping: { event_payload_key: "stripe_customer_id", type: "by_id" },
      value_settings: { event_payload_key: "value" },
    }));

  const lookupKey = `doctorloop_ai_tokens_${rate}`;
  const prices = await stripe.prices.list({ lookup_keys: [lookupKey], active: true, limit: 1 });
  const price =
    prices.data[0] ??
    (await stripe.prices.create({
      currency: "usd",
      unit_amount_decimal: Stripe.Decimal.from(stripeUnitAmountDecimal(rate)),
      billing_scheme: "per_unit",
      recurring: { interval: "month", usage_type: "metered", meter: meter.id },
      lookup_key: lookupKey,
      product_data: { name: "DoctorLoop AI usage" },
    }));

  const portals = await stripe.billingPortal.configurations.list({ active: true, limit: 20 });
  const portal =
    portals.data.find((p) => p.metadata?.doctorloop === "portal") ??
    (await stripe.billingPortal.configurations.create({
      features: {
        invoice_history: { enabled: true },
        payment_method_update: { enabled: true },
        subscription_cancel: { enabled: true, mode: "immediately" },
      },
      business_profile: { headline: "DoctorLoop AI · practice billing (test mode)" },
      metadata: { doctorloop: "portal" },
    }));

  return { meterId: meter.id, priceId: price.id, portalConfigurationId: portal.id };
}

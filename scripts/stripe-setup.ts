/**
 * Creates (or reuses) the Stripe TEST-mode meter, price and customer-portal configuration.
 * Run: npm run stripe:setup   (reads STRIPE_SECRET_KEY and BILLING_PRICE_PER_1K_TOKENS_USD from .env.local)
 */
import Stripe from "stripe";
import { parseRateMicrosPer1k } from "../src/lib/billing/money";
import { ensureStripeCatalog } from "../src/lib/integrations/stripe/catalog";
import type { StripeLike } from "../src/lib/integrations/stripe/client";

async function main() {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key || !/^(sk|rk)_test_/.test(key)) {
    console.error("Refusing to run: STRIPE_SECRET_KEY must be set to a Stripe TEST-mode key (sk_test_… or rk_test_…).");
    process.exit(1);
  }
  const rate = parseRateMicrosPer1k(process.env.BILLING_PRICE_PER_1K_TOKENS_USD);
  const stripe = new Stripe(key, { appInfo: { name: "DoctorLoop AI (demo)" } });
  const catalog = await ensureStripeCatalog(stripe as unknown as StripeLike, rate);
  console.log(`Meter:                ${catalog.meterId}`);
  console.log(`Price:                ${catalog.priceId}`);
  console.log(`Portal configuration: ${catalog.portalConfigurationId}`);
}

main().catch((error: unknown) => {
  console.error("Stripe setup failed:", error instanceof Error ? error.message : error);
  process.exit(1);
});

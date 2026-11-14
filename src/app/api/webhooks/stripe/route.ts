import { handleStripeWebhook } from "@/lib/services/billing-account";

export const runtime = "nodejs";

/** Stripe webhook. Must read the raw body: the signature covers the exact bytes. */
export async function POST(request: Request): Promise<Response> {
  const { body, status } = await handleStripeWebhook(await request.text(), request.headers.get("stripe-signature"));
  return new Response(body, { status });
}

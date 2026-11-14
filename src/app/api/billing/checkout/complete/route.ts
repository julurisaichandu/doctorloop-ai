import { NextResponse } from "next/server";
import { requireActor } from "@/lib/auth/session";
import { env } from "@/lib/config/env";
import { completeStripeCheckout } from "@/lib/services/billing-account";

/** Stripe Checkout success_url target: verifies the session server-side, then returns to billing. */
export async function GET(request: Request) {
  const actor = await requireActor("doctor");
  const sessionId = new URL(request.url).searchParams.get("session_id");
  let ok = false;
  try {
    if (sessionId) {
      const account = await completeStripeCheckout(actor, sessionId);
      ok = account.status === "active" || account.status === "past_due";
    }
  } catch (error) {
    console.error("[DoctorLoop] Checkout completion failed:", error);
  }
  return NextResponse.redirect(new URL(`/doctor/billing?setup=${ok ? "success" : "error"}`, env.appUrl));
}

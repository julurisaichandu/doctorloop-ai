import { NextResponse } from "next/server";
import { env } from "@/lib/config/env";
import { requireActor } from "@/lib/auth/session";
import { disconnectVexo } from "@/lib/services/vexo";

/** Patient-initiated: delete the stored Vexo tokens. */
export async function POST() {
  const actor = await requireActor("patient");
  await disconnectVexo(actor);
  // 303 so the browser follows with GET after a form POST.
  return NextResponse.redirect(new URL("/patient/import?disconnected=1", env.appUrl), 303);
}

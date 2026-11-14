import { NextResponse } from "next/server";
import { env } from "@/lib/config/env";
import { requireActor } from "@/lib/auth/session";
import { beginVexoAuthorization, VEXO_OAUTH_COOKIE, VEXO_OAUTH_COOKIE_MAX_AGE_SECONDS, vexoErrorCodeOf } from "@/lib/integrations/vexo/oauth-flow";

const importUrl = (query: string) => new URL(`/patient/import?${query}`, env.appUrl);

/** Patient-initiated: start OAuth 2.1 + PKCE against Vexo (scope vexo:read). */
export async function GET() {
  const actor = await requireActor("patient");
  if (env.vexoMode !== "live") {
    return NextResponse.redirect(importUrl("notice=mock"));
  }
  try {
    const { url, cookieValue } = await beginVexoAuthorization(actor.userId);
    const response = NextResponse.redirect(url);
    response.cookies.set(VEXO_OAUTH_COOKIE, cookieValue, {
      httpOnly: true,
      sameSite: "lax",
      secure: env.isProduction,
      path: "/api/integrations/vexo",
      maxAge: VEXO_OAUTH_COOKIE_MAX_AGE_SECONDS,
    });
    return response;
  } catch (error) {
    return NextResponse.redirect(importUrl(`error=${vexoErrorCodeOf(error)}`));
  }
}

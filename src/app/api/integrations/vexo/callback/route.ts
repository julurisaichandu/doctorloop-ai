import { NextResponse, type NextRequest } from "next/server";
import { env } from "@/lib/config/env";
import { requireActor } from "@/lib/auth/session";
import {
  completeVexoAuthorization,
  VEXO_OAUTH_COOKIE,
  vexoErrorCodeOf,
} from "@/lib/integrations/vexo/oauth-flow";

function redirectToImport(query: string): NextResponse {
  const response = NextResponse.redirect(new URL(`/patient/import?${query}`, env.appUrl));
  response.cookies.set(VEXO_OAUTH_COOKIE, "", { path: "/api/integrations/vexo", maxAge: 0 });
  return response;
}

/** OAuth redirect target: validates state, exchanges the code, stores encrypted tokens. */
export async function GET(request: NextRequest) {
  const actor = await requireActor("patient");
  if (env.vexoMode !== "live") return redirectToImport("notice=mock");

  const params = request.nextUrl.searchParams;
  const oauthError = params.get("error");
  if (oauthError) {
    return redirectToImport(`error=${oauthError === "access_denied" ? "access_denied" : "unknown"}`);
  }
  try {
    await completeVexoAuthorization({
      userId: actor.userId,
      cookieValue: request.cookies.get(VEXO_OAUTH_COOKIE)?.value,
      code: params.get("code"),
      state: params.get("state"),
      issuer: params.get("iss"),
    });
    return redirectToImport("connected=1");
  } catch (error) {
    return redirectToImport(`error=${vexoErrorCodeOf(error)}`);
  }
}

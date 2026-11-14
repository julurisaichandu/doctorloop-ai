"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { homePathFor, clearSessionCookies, requireActor, setLocalSessionCookie } from "@/lib/auth/session";
import { isDemoSwitcherEnabled, listDemoAccounts } from "@/lib/auth/demo";
import { env, getDataBackend } from "@/lib/config/env";
import { getSystemRepository, resetLocalDemoData } from "@/lib/data";
import type { ActionResult } from "@/lib/domain/types";
import { forbidden, notFound, toActionResult, validationError } from "@/lib/errors";

export type SignInState = ActionResult<{ redirectTo: string }> | null;

const SwitchSchema = z.object({ userId: z.string().min(1).max(100) });
const SignInSchema = z.object({
  email: z.string().trim().email("Enter a valid email address.").max(254),
  password: z.string().min(1, "Enter your password.").max(200),
});

async function supabaseClient() {
  const { createSupabaseServerClient } = await import("@/lib/supabase/server");
  return createSupabaseServerClient();
}

/** Signs in AS a demo account. Authorization rules still apply to everything it can do. */
export async function switchDemoAccountAction(userId: string): Promise<ActionResult<{ redirectTo: string }>> {
  return toActionResult(async () => {
    if (!isDemoSwitcherEnabled()) throw forbidden("The demo account switcher is disabled.");
    const parsed = SwitchSchema.safeParse({ userId });
    if (!parsed.success) throw validationError("Choose a demo account.");
    const account = listDemoAccounts().find((a) => a.userId === parsed.data.userId);
    if (!account) throw notFound("Unknown demo account.");

    if (getDataBackend() === "supabase") {
      const password = env.demoAccountPassword;
      if (!password) throw validationError("Set DEMO_ACCOUNT_PASSWORD and run the seed script");
      const supabase = await supabaseClient();
      const { error } = await supabase.auth.signInWithPassword({
        email: account.email,
        password,
      });
      if (error) throw validationError("Could not sign in to the demo account.");
    } else {
      await setLocalSessionCookie(account.userId);
    }
    return { redirectTo: homePathFor(account.role) };
  });
}

export async function signInAction(_prevState: SignInState, formData: FormData): Promise<SignInState> {
  return toActionResult(async () => {
    if (getDataBackend() !== "supabase") {
      throw validationError("Email sign-in is not configured here. Use the demo accounts to continue.");
    }
    const parsed = SignInSchema.safeParse({
      email: formData.get("email"),
      password: formData.get("password"),
    });
    if (!parsed.success) throw validationError(parsed.error.issues[0]?.message ?? "Check your details.");

    const supabase = await supabaseClient();
    const { data, error } = await supabase.auth.signInWithPassword(parsed.data);
    if (error || !data.user) throw validationError("Incorrect email or password.");

    const profile = await getSystemRepository().getProfile(data.user.id);
    if (!profile) {
      await supabase.auth.signOut();
      throw validationError("This account has no DoctorLoop profile.");
    }
    return { redirectTo: homePathFor(profile.role) };
  });
}

export async function signOutAction(): Promise<void> {
  await clearSessionCookies();
  if (getDataBackend() === "supabase") {
    const supabase = await supabaseClient();
    await supabase.auth.signOut();
  }
  redirect("/");
}

/** Local demo only: re-seed the demo database. */
export async function resetDemoDataAction(): Promise<ActionResult<void>> {
  return toActionResult(async () => {
    await requireActor();
    if (getDataBackend() !== "local" || !isDemoSwitcherEnabled()) {
      throw forbidden("Resetting demo data is not available.");
    }
    await resetLocalDemoData();
  });
}

import "server-only";

import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { env, getDataBackend } from "@/lib/config/env";
import { getSystemRepository } from "@/lib/data";
import type { Actor, Role } from "@/lib/domain/types";
import { SESSION_COOKIE, SESSION_MAX_AGE_SECONDS, createSessionToken, verifySessionToken } from "./token";

export function homePathFor(role: Role): "/patient" | "/doctor" {
  return role === "patient" ? "/patient" : "/doctor";
}

/** Builds the Actor for an authenticated user id (profile + patient lookup, system repo). */
async function actorForUserId(userId: string): Promise<Actor | null> {
  const repo = getSystemRepository();
  const profile = await repo.getProfile(userId);
  if (!profile) return null;
  const patient = profile.role === "patient" ? await repo.getPatientByUserId(userId) : null;
  if (profile.role === "patient" && !patient) return null;
  return {
    userId: profile.id,
    role: profile.role,
    fullName: profile.fullName,
    email: profile.email,
    title: profile.title,
    patientId: patient?.id ?? null,
  };
}

async function resolveActor(): Promise<Actor | null> {
  if (getDataBackend() === "supabase") {
    const { createSupabaseServerClient } = await import("@/lib/supabase/server");
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.auth.getUser(); // validated server-side
    if (error || !data.user) return null;
    return actorForUserId(data.user.id);
  }
  const store = await cookies();
  const userId = verifySessionToken(store.get(SESSION_COOKIE)?.value);
  return userId ? actorForUserId(userId) : null;
}

/** The signed-in actor for this request, or null. Cached per request. */
export const getActor = cache(resolveActor);

/**
 * Requires a signed-in actor (redirects to /login otherwise). With `role`, actors of
 * the other role are sent to their own home.
 */
export async function requireActor(role?: Role): Promise<Actor> {
  const actor = await getActor();
  if (!actor) redirect("/login");
  if (role && actor.role !== role) redirect(homePathFor(actor.role));
  return actor;
}

/** Local mode: sign in as `userId` (httpOnly, signed, 7-day cookie). */
export async function setLocalSessionCookie(userId: string): Promise<void> {
  const store = await cookies();
  store.set(SESSION_COOKIE, createSessionToken(userId), {
    httpOnly: true,
    sameSite: "lax",
    secure: env.isProduction,
    path: "/",
    maxAge: SESSION_MAX_AGE_SECONDS,
  });
}

/** Removes the local session cookie (Supabase sessions are ended by the sign-out action). */
export async function clearSessionCookies(): Promise<void> {
  const store = await cookies();
  store.delete(SESSION_COOKIE);
}

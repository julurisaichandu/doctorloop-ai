import "server-only";

import { createServerClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { env } from "@/lib/config/env";
import { AppError } from "@/lib/errors";

/**
 * Request-scoped Supabase client bound to the signed-in user's cookies (publishable key).
 * Row-level security applies. Create one per request; never cache it across requests.
 */
export async function createSupabaseServerClient(): Promise<SupabaseClient> {
  const url = env.supabaseUrl;
  const key = env.supabasePublishableKey;
  if (!url || !key) throw new AppError("INTERNAL", "Supabase is not configured.");

  const cookieStore = await cookies();
  return createServerClient(url, key, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Called from a Server Component, where cookies are read-only.
          // The proxy (src/proxy.ts) refreshes the session, so this is safe to ignore.
        }
      },
    },
  });
}

import "server-only";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { env } from "@/lib/config/env";
import { AppError } from "@/lib/errors";

/**
 * Service-role client: bypasses RLS. SERVER ONLY — use exclusively for system-generated
 * writes after an explicit authorization check. Holds no user session.
 */
export function createSupabaseAdminClient(): SupabaseClient {
  const url = env.supabaseUrl;
  const key = env.supabaseSecretKey;
  if (!url || !key) throw new AppError("INTERNAL", "Supabase admin access is not configured.");

  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

import "server-only";

import { getDataBackend } from "@/lib/config/env";
import type { Actor } from "@/lib/domain/types";
import { LocalRepository } from "./local/local-repository";
import { resetLocalDb } from "./local/local-db";
import type { Repository } from "./repository";

type SupabaseOptions = { mode: "actor"; actor: Actor } | { mode: "system" };

/**
 * The Supabase factory is async (cookie-bound client), so the returned Repository
 * resolves the real implementation on first method call.
 */
function lazySupabaseRepository(options: SupabaseOptions): Repository {
  let pending: Promise<Repository> | null = null;
  const resolve = (): Promise<Repository> => {
    pending ??= import("./supabase/repository").then((m) => m.createSupabaseRepository(options));
    return pending;
  };

  return new Proxy({} as Repository, {
    get(_target, prop) {
      if (prop === "kind") return "supabase";
      if (typeof prop !== "string" || prop === "then") return undefined;
      return async (...args: unknown[]) => {
        const repo = await resolve();
        const method = repo[prop as keyof Repository] as unknown as (...a: unknown[]) => unknown;
        return method.apply(repo, args);
      };
    },
  });
}

/** Repository with the actor's visibility rules applied (docs/ARCHITECTURE.md section 5). */
export function getRepository(actor: Actor): Repository {
  return getDataBackend() === "supabase"
    ? lazySupabaseRepository({ mode: "actor", actor })
    : new LocalRepository({ actor });
}

/** Unfiltered repository: services only, AFTER an explicit authorization check. */
export function getSystemRepository(): Repository {
  return getDataBackend() === "supabase"
    ? lazySupabaseRepository({ mode: "system" })
    : new LocalRepository({ system: true });
}

/** Local mode only: re-seed the demo data relative to now. */
export async function resetLocalDemoData(): Promise<void> {
  if (getDataBackend() !== "local") throw new Error("Demo data reset is only available in local mode.");
  resetLocalDb(new Date());
}

import "server-only";

import { env } from "@/lib/config/env";
import { DEMO_ACCOUNTS } from "@/lib/demo/seed";
import type { DemoAccount } from "@/lib/domain/types";

export function listDemoAccounts(): DemoAccount[] {
  return DEMO_ACCOUNTS.map((account) => ({ ...account }));
}

export function isDemoSwitcherEnabled(): boolean {
  return env.enableDemoSwitcher;
}

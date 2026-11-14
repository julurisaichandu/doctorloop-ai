import "server-only";

import { assertDoctor } from "@/lib/authz/policies";
import { usageAmountMicros } from "@/lib/billing/money";
import { env, getBillingMode } from "@/lib/config/env";
import { getSystemRepository } from "@/lib/data";
import type { NewAiUsageRecord } from "@/lib/data/repository";
import type { ModelUsageEvent } from "@/lib/ai/usage";
import type {
  Actor,
  AiProvider,
  BillingAccount,
  BillingMode,
  TokenCountSource,
  UsageOperation,
  UsageTrigger,
} from "@/lib/domain/types";
import { getStripe } from "@/lib/integrations/stripe/client";
import { sendMeterEvent } from "@/lib/integrations/stripe/operations";

export interface UsageItem {
  operation: UsageOperation;
  journalEntryId: string | null;
  provider: AiProvider;
  model: string | null;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  tokenSource: TokenCountSource;
}

const SYNC_ERROR = "Could not reach Stripe.";
const PENDING_RETRY_AFTER_MS = 2 * 60 * 1000;
/** Stripe only guarantees meter-event identifier uniqueness for 24 h, so never retry past 23 h. */
export const RETRY_WINDOW_MS = 23 * 60 * 60 * 1000;

/** Maps captured model events to usage items; events whose kind is unmapped are dropped. */
export function usageItemsFromEvents(
  events: ModelUsageEvent[],
  map: (kind: string) => { operation: UsageOperation; journalEntryId: string | null } | null,
): UsageItem[] {
  const items: UsageItem[] = [];
  for (const event of events) {
    const mapped = map(event.kind);
    if (!mapped) continue;
    items.push({
      operation: mapped.operation,
      journalEntryId: mapped.journalEntryId,
      provider: event.provider,
      model: event.model,
      inputTokens: event.inputTokens,
      outputTokens: event.outputTokens,
      totalTokens: event.totalTokens,
      tokenSource: event.tokenSource,
    });
  }
  return items;
}

/** The doctor who pays: the triggering doctor if assigned, else the earliest-assigned doctor. */
export async function resolvePayer(patientId: string, trigger: UsageTrigger): Promise<string | null> {
  const repo = getSystemRepository();
  if (trigger.kind === "doctor" && trigger.userId && (await repo.isDoctorAssigned(trigger.userId, patientId))) {
    return trigger.userId;
  }
  const assignments = await repo.listAssignments(patientId);
  const earliest = [...assignments].sort(
    (a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id),
  )[0];
  return earliest?.doctorId ?? null;
}

export function isBillableAccount(account: BillingAccount | null, mode: BillingMode): account is BillingAccount {
  return !!account && (account.status === "active" || account.status === "past_due") && account.mode === mode;
}

/** Sends one meter event and records the outcome. Never throws. */
async function syncRecord(
  recordId: string,
  customerId: string | null,
  totalTokens: number,
  occurredAt: string,
): Promise<boolean> {
  try {
    if (!customerId) throw new Error("Billing account has no Stripe customer.");
    await sendMeterEvent(getStripe(), { customerId, recordId, totalTokens, occurredAt });
  } catch (error) {
    console.error("[DoctorLoop] Usage recording failed:", error);
    try {
      await getSystemRepository().updateUsageRecord(recordId, {
        billingStatus: "sync_failed",
        billingError: SYNC_ERROR,
      });
    } catch (updateError) {
      console.error("[DoctorLoop] Usage recording failed:", updateError);
    }
    return false;
  }
  // Stripe accepted the event: a failed bookkeeping update must not count as a failed send.
  try {
    await getSystemRepository().updateUsageRecord(recordId, {
      billingStatus: "billed",
      billingMode: "stripe",
      billingError: null,
      billedAt: new Date().toISOString(),
    });
  } catch (updateError) {
    console.error("[DoctorLoop] Usage recording failed:", updateError);
  }
  return true;
}

/** Stores usage records for an AI call and bills them. Never throws. */
export async function recordAiUsage(input: {
  patientId: string;
  trigger: UsageTrigger;
  items: UsageItem[];
}): Promise<void> {
  try {
    if (input.items.length === 0) return;
    const repo = getSystemRepository();
    const doctorId = await resolvePayer(input.patientId, input.trigger);
    const mode = getBillingMode();
    const account = doctorId ? await repo.getBillingAccount(doctorId) : null;
    const billable = isBillableAccount(account, mode);
    const rate = billable ? account.rateMicrosPer1k : env.billingRateMicrosPer1k;
    const now = new Date().toISOString();
    const status = !billable ? "not_billed" : mode === "simulated" ? "billed" : "pending";

    const records: NewAiUsageRecord[] = input.items.map((item) => ({
      patientId: input.patientId,
      billingDoctorId: doctorId,
      operation: item.operation,
      triggeredBy: input.trigger.kind,
      triggeredByUserId: input.trigger.userId,
      journalEntryId: item.journalEntryId,
      provider: item.provider,
      model: item.model,
      inputTokens: item.inputTokens,
      outputTokens: item.outputTokens,
      totalTokens: item.totalTokens,
      tokenSource: item.tokenSource,
      rateMicrosPer1k: rate,
      amountMicros: usageAmountMicros(item.totalTokens, rate),
      billingStatus: status,
      billingMode: billable && mode === "simulated" ? "simulated" : null,
      billingError: null,
      billedAt: billable && mode === "simulated" ? now : null,
      occurredAt: now,
    }));
    const created = await repo.createUsageRecords(records);

    if (billable && mode === "stripe") {
      // Concurrent so a Stripe outage costs about one timeout, not one per record.
      await Promise.all(
        created.map((record) =>
          syncRecord(record.id, account.stripeCustomerId, record.totalTokens, record.occurredAt),
        ),
      );
    }
  } catch (error) {
    console.error("[DoctorLoop] Usage recording failed:", error);
  }
}

/** Re-sends a doctor's failed (or stuck pending) records to Stripe, reusing the record id as identifier. */
export async function retryUsageSync(actor: Actor): Promise<{ retried: number; failed: number }> {
  assertDoctor(actor);
  const mode = getBillingMode();
  if (mode !== "stripe") return { retried: 0, failed: 0 };
  const repo = getSystemRepository();
  const account = await repo.getBillingAccount(actor.userId);
  if (!isBillableAccount(account, mode)) return { retried: 0, failed: 0 };

  const nowMs = Date.now();
  const candidates = await repo.listUsageRecords({
    billingDoctorId: actor.userId,
    billingStatus: ["sync_failed", "pending"],
    since: new Date(nowMs - RETRY_WINDOW_MS).toISOString(),
  });
  const due = candidates.filter(
    (r) => r.billingStatus === "sync_failed" || Date.parse(r.occurredAt) <= nowMs - PENDING_RETRY_AFTER_MS,
  );

  let retried = 0;
  let failed = 0;
  for (const record of due) {
    try {
      const ok = await syncRecord(record.id, account.stripeCustomerId, record.totalTokens, record.occurredAt);
      if (ok) retried += 1;
      else failed += 1;
    } catch (error) {
      console.error("[DoctorLoop] Usage recording failed:", error);
      failed += 1;
    }
  }
  return { retried, failed };
}

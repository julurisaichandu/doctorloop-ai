import type {
  AiProvider,
  AiUsageRecord,
  BillingMode,
  UsageBillingStatus,
  UsageLine,
  UsageTotals,
  UsageTriggerKind,
} from "@/lib/domain/types";

export const ACTIVITY_LABELS: Record<"entry_extraction" | "clinician_summary", string> = {
  entry_extraction: "Update structuring",
  clinician_summary: "Pre-visit summary",
};

export const PRIVATE_LINE_LABEL = "Private processing (not itemized)";

export const BILLING_STATUS_LABELS: Record<UsageBillingStatus, string> = {
  billed: "Billed",
  not_billed: "Not billed",
  pending: "Sending…",
  sync_failed: "Sync failed",
};

export const TRIGGER_LABELS: Record<UsageTriggerKind, string> = {
  patient: "Patient",
  doctor: "Clinician",
  system: "System",
};

/** "2026-11-10T10:05:00.000Z" -> "2026-11-10 10:05 UTC" (never client-local time). */
export function formatUtcStamp(iso: string): string {
  return `${iso.slice(0, 10)} ${iso.slice(11, 16)} UTC`;
}

/** "2026-11-10T10:05:00.000Z" -> "2026-11-10". */
export function formatUtcDate(iso: string): string {
  return iso.slice(0, 10);
}

export function engineLabel(provider: AiProvider, model: string | null): string {
  return provider === "openai" ? `OpenAI · ${model ?? "unknown model"}` : "Mock (rule-based)";
}

/**
 * Doctors only get dated line items for pre-visit summaries and for extraction of updates the
 * patient currently shares. Everything else is folded into the undated private total.
 */
export function isItemized(
  record: Pick<AiUsageRecord, "operation" | "journalEntryId">,
  sharedEntryIds: ReadonlySet<string>,
): boolean {
  if (record.operation === "clinician_summary") return true;
  return (
    record.operation === "entry_extraction" &&
    record.journalEntryId !== null &&
    sharedEntryIds.has(record.journalEntryId)
  );
}

/**
 * Ids of the records that get a dated line. Besides `isItemized`, only the NEWEST extraction record
 * of each entry is itemized (edits and retries of a pending entry add records for the same entry);
 * older ones stay in the undated private total.
 */
export function itemizedRecordIds(
  records: readonly AiUsageRecord[],
  sharedEntryIds: ReadonlySet<string>,
): Set<string> {
  const ids = new Set<string>();
  const newestPerEntry = new Map<string, AiUsageRecord>();
  for (const r of records) {
    if (!isItemized(r, sharedEntryIds)) continue;
    if (r.operation === "clinician_summary" || r.journalEntryId === null) {
      ids.add(r.id);
      continue;
    }
    const best = newestPerEntry.get(r.journalEntryId);
    if (!best || r.occurredAt > best.occurredAt || (r.occurredAt === best.occurredAt && r.id > best.id)) {
      newestPerEntry.set(r.journalEntryId, r);
    }
  }
  for (const r of newestPerEntry.values()) ids.add(r.id);
  return ids;
}

/** Billed usage only counts as billed when it was billed in the account's current mode. */
const isBilledIn = (r: AiUsageRecord, mode: BillingMode): boolean =>
  r.billingStatus === "billed" && r.billingMode === mode;

export function billingLabel(record: AiUsageRecord, mode: BillingMode): string {
  if (record.billingStatus === "billed" && record.billingMode !== mode) {
    return record.billingMode === "stripe" ? "Billed (Stripe)" : "Billed (simulated)";
  }
  return BILLING_STATUS_LABELS[record.billingStatus];
}

export function summarizeUsage(records: AiUsageRecord[], mode: BillingMode): UsageTotals {
  const totals: UsageTotals = {
    runs: 0,
    inputTokens: 0,
    outputTokens: 0,
    totalTokens: 0,
    billedMicros: 0,
    notBilledMicros: 0,
    estimatedRuns: 0,
    failedSyncs: 0,
  };
  for (const r of records) {
    totals.runs += 1;
    totals.inputTokens += r.inputTokens;
    totals.outputTokens += r.outputTokens;
    totals.totalTokens += r.totalTokens;
    if (isBilledIn(r, mode)) totals.billedMicros += r.amountMicros;
    else totals.notBilledMicros += r.amountMicros;
    if (r.tokenSource === "estimated") totals.estimatedRuns += 1;
    if (r.billingStatus === "sync_failed") totals.failedSyncs += 1;
  }
  return totals;
}

/** Only call for itemized records. */
export function toUsageLine(record: AiUsageRecord, patientName: string, mode: BillingMode): UsageLine {
  const activity = record.operation === "clinician_summary" ? "clinician_summary" : "entry_extraction";
  return {
    id: record.id,
    occurredAt: record.occurredAt,
    patientId: record.patientId,
    patientName,
    activity,
    activityLabel: ACTIVITY_LABELS[activity],
    triggeredBy: record.triggeredBy,
    provider: record.provider,
    model: record.model,
    inputTokens: record.inputTokens,
    outputTokens: record.outputTokens,
    totalTokens: record.totalTokens,
    tokenSource: record.tokenSource,
    amountMicros: record.amountMicros,
    billingStatus: record.billingStatus,
    billingLabel: billingLabel(record, mode),
  };
}

import type { AiUsageRecord, BillingAccount, BillingPeriod, SimulatedInvoice } from "@/lib/domain/types";

export const SIMULATED_CARD_LABEL = "Visa •••• 4242 (test card)";

const MAX_SIMULATED_INVOICES = 24;

/** Activates (or re-activates) a simulated account. Keeps invoices only from an earlier simulated account. */
export function activateSimulatedAccount(
  existing: BillingAccount | null,
  doctorId: string,
  rateMicrosPer1k: number,
  now: Date,
): BillingAccount {
  const iso = now.toISOString();
  return {
    doctorId,
    mode: "simulated",
    status: "active",
    stripeCustomerId: null,
    stripeSubscriptionId: null,
    stripePriceId: null,
    paymentMethodLabel: SIMULATED_CARD_LABEL,
    rateMicrosPer1k,
    periodAnchorAt: iso,
    activatedAt: iso,
    canceledAt: null,
    simulatedInvoices: existing && existing.mode === "simulated" ? existing.simulatedInvoices : [],
    createdAt: existing?.createdAt ?? iso,
    updatedAt: iso,
  };
}

export function cancelSimulatedAccount(account: BillingAccount, now: Date): BillingAccount {
  const iso = now.toISOString();
  return { ...account, status: "canceled", canceledAt: iso, updatedAt: iso };
}

function nextInvoiceNumber(invoices: SimulatedInvoice[]): string {
  const highest = invoices.reduce((max, inv) => {
    const n = Number(/^SIM-(\d+)$/.exec(inv.number)?.[1] ?? 0);
    return Math.max(max, n);
  }, 0);
  return `SIM-${String(highest + 1).padStart(4, "0")}`;
}

/** Closes the current period with a paid invoice and restarts the period at `now`. */
export function closeSimulatedPeriod(
  account: BillingAccount,
  billed: Pick<AiUsageRecord, "totalTokens" | "amountMicros">[],
  period: BillingPeriod,
  now: Date,
): BillingAccount {
  const iso = now.toISOString();
  const invoice: SimulatedInvoice = {
    id: `sim_${globalThis.crypto.randomUUID()}`,
    number: nextInvoiceNumber(account.simulatedInvoices),
    periodStart: period.start,
    periodEnd: iso,
    totalTokens: billed.reduce((sum, r) => sum + r.totalTokens, 0),
    amountMicros: billed.reduce((sum, r) => sum + r.amountMicros, 0),
    status: "paid",
    paidWith: account.paymentMethodLabel ?? SIMULATED_CARD_LABEL,
    createdAt: iso,
  };
  return {
    ...account,
    simulatedInvoices: [invoice, ...account.simulatedInvoices].slice(0, MAX_SIMULATED_INVOICES),
    periodAnchorAt: iso,
    updatedAt: iso,
  };
}

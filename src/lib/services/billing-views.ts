import "server-only";

import { assertDoctor } from "@/lib/authz/policies";
import { statementFilename, statementToCsv } from "@/lib/billing/csv";
import { microsToCents } from "@/lib/billing/money";
import { currentBillingPeriod, currentMonth } from "@/lib/billing/period";
import { parseStatementRange, privateBucket } from "@/lib/billing/statement-range";
import { itemizedRecordIds, summarizeUsage, toUsageLine } from "@/lib/billing/views";
import { env, getBillingMode, getIntegrationStatus } from "@/lib/config/env";
import { getRepository, getSystemRepository } from "@/lib/data";
import type {
  Actor,
  AiUsageRecord,
  BillingAccount,
  BillingInvoiceView,
  DoctorBillingOverview,
  PatientUsageRow,
  PatientUsageStatement,
  UpcomingInvoiceView,
  UsageLine,
} from "@/lib/domain/types";
import { notFound } from "@/lib/errors";
import { getStripe } from "@/lib/integrations/stripe/client";
import { listStripeInvoices, previewUpcomingInvoice } from "@/lib/integrations/stripe/operations";
import { getEffectiveAccount, refreshAccountReporting } from "@/lib/services/billing-account";
import { isBillableAccount } from "@/lib/services/billing-usage";

const STRIPE_ERROR = "Couldn't reach Stripe. Showing DoctorLoop's own usage records.";
const STRIPE_NOTE = "Stripe preview · may lag a few minutes";
const FORMER_PATIENT = "Former patient";
const RECENT_LIMIT = 20;

/** Entries the patient currently shares, as readable by the doctor's actor repository. */
async function sharedEntryIds(actor: Actor, patientId: string): Promise<Set<string>> {
  try {
    const entries = await getRepository(actor).listEntries(patientId, { reviewStatus: ["approved"] });
    return new Set(entries.map((e) => e.id));
  } catch {
    return new Set();
  }
}

async function patientName(actor: Actor, patientId: string): Promise<string> {
  try {
    return (await getRepository(actor).getPatient(patientId))?.fullName ?? FORMER_PATIENT;
  } catch {
    return FORMER_PATIENT;
  }
}

export async function getDoctorBillingOverview(actor: Actor, now: Date = new Date()): Promise<DoctorBillingOverview> {
  assertDoctor(actor);
  const mode = getBillingMode();
  const system = getSystemRepository();
  let stripeError: string | null = null;

  let account: BillingAccount | null = await getEffectiveAccount(actor.userId);
  if (account && account.mode === "stripe") {
    const refreshed = await refreshAccountReporting(account);
    account = refreshed.account;
    if (refreshed.failed) stripeError = STRIPE_ERROR;
  }
  const billable = isBillableAccount(account, mode) ? account : null;
  const currentPeriod =
    billable && billable.periodAnchorAt ? currentBillingPeriod(billable.periodAnchorAt, now) : null;

  const window = currentMonth(now);
  const records = await system.listUsageRecords({
    billingDoctorId: actor.userId,
    since: window.start,
    until: window.end,
  });

  const byPatient = new Map<string, AiUsageRecord[]>();
  for (const r of records) {
    const list = byPatient.get(r.patientId);
    if (list) list.push(r);
    else byPatient.set(r.patientId, [r]);
  }

  const patients: PatientUsageRow[] = [];
  const itemizedLines: UsageLine[] = [];
  for (const [patientId, rows] of byPatient) {
    const [shared, name] = await Promise.all([sharedEntryIds(actor, patientId), patientName(actor, patientId)]);
    const itemizedIds = itemizedRecordIds(rows, shared);
    const lines = rows.filter((r) => itemizedIds.has(r.id)).map((r) => toUsageLine(r, name, mode));
    itemizedLines.push(...lines);
    patients.push({
      patientId,
      patientName: name,
      totals: summarizeUsage(rows, mode),
      lastItemizedAt: lines.reduce<string | null>(
        (max, l) => (max === null || l.occurredAt > max ? l.occurredAt : max),
        null,
      ),
    });
  }
  patients.sort((a, b) => b.totals.totalTokens - a.totals.totalTokens);
  const recent = itemizedLines
    .sort((a, b) => b.occurredAt.localeCompare(a.occurredAt) || b.id.localeCompare(a.id))
    .slice(0, RECENT_LIMIT);

  let upcomingInvoice: UpcomingInvoiceView | null = null;
  let invoices: BillingInvoiceView[] = [];
  if (billable && currentPeriod) {
    const periodBilled = await system.listUsageRecords({
      billingDoctorId: actor.userId,
      billingStatus: ["billed"],
      since: currentPeriod.start,
      until: now.toISOString(),
    });
    const billedMicros = periodBilled.reduce((sum, r) => sum + r.amountMicros, 0);
    const billedTokens = periodBilled.reduce((sum, r) => sum + r.totalTokens, 0);
    if (billable.mode === "simulated") {
      upcomingInvoice = {
        periodStart: currentPeriod.start,
        periodEnd: currentPeriod.end,
        amountCents: microsToCents(billedMicros),
        totalTokens: billedTokens,
        source: "simulated",
        note: null,
      };
    } else if (!stripeError && billable.stripeCustomerId && billable.stripeSubscriptionId) {
      try {
        const stripe = getStripe();
        const [preview, list] = await Promise.all([
          previewUpcomingInvoice(stripe, {
            customerId: billable.stripeCustomerId,
            subscriptionId: billable.stripeSubscriptionId,
          }),
          listStripeInvoices(stripe, billable.stripeCustomerId),
        ]);
        upcomingInvoice = {
          periodStart: currentPeriod.start,
          periodEnd: currentPeriod.end,
          amountCents: preview.amountCents,
          totalTokens: billedTokens,
          source: "stripe",
          note: STRIPE_NOTE,
        };
        invoices = list;
      } catch (error) {
        console.error("[DoctorLoop] Stripe billing overview failed:", error);
        stripeError = STRIPE_ERROR;
      }
    }
  }
  if (account && account.mode === "simulated") {
    invoices = account.simulatedInvoices.map((inv) => ({
      id: inv.id,
      number: inv.number,
      periodStart: inv.periodStart,
      periodEnd: inv.periodEnd,
      amountCents: microsToCents(inv.amountMicros),
      status: inv.status,
      hostedUrl: null,
      pdfUrl: null,
      source: "simulated" as const,
    }));
  }

  return {
    mode,
    modeLabel: getIntegrationStatus().billing.label,
    rateMicrosPer1k: account?.rateMicrosPer1k ?? env.billingRateMicrosPer1k,
    account: {
      status: account ? account.status : "not_set_up",
      paymentMethodLabel: account?.paymentMethodLabel ?? null,
      activatedAt: account?.activatedAt ?? null,
      currentPeriod,
    },
    window,
    totals: summarizeUsage(records, mode),
    patients,
    recent,
    upcomingInvoice,
    invoices,
    stripeError,
  };
}

export async function getPatientUsageStatement(
  actor: Actor,
  patientId: string,
  range: { from?: string; to?: string },
  now: Date = new Date(),
): Promise<PatientUsageStatement> {
  assertDoctor(actor);
  const repo = getRepository(actor);
  const patient = await repo.getPatient(patientId);
  if (!patient || !(await repo.isDoctorAssigned(actor.userId, patientId))) {
    throw notFound("Patient not found.");
  }
  const period = parseStatementRange(range, now);
  const privatePeriod = privateBucket(period, now);
  const [records, shared, account] = await Promise.all([
    getSystemRepository().listUsageRecords({
      billingDoctorId: actor.userId,
      patientId,
      since: privatePeriod.start < period.start ? privatePeriod.start : period.start,
      until: privatePeriod.end > period.end ? privatePeriod.end : period.end,
      order: "asc",
    }),
    sharedEntryIds(actor, patientId),
    getEffectiveAccount(actor.userId),
  ]);
  const inRange = (r: AiUsageRecord) => r.occurredAt >= period.start && r.occurredAt <= period.end;
  const mode = getBillingMode();
  const itemizedIds = itemizedRecordIds(records, shared);
  const itemized = records.filter((r) => itemizedIds.has(r.id) && inRange(r));
  const rest = records.filter(
    (r) => !itemizedIds.has(r.id) && r.occurredAt >= privatePeriod.start && r.occurredAt <= privatePeriod.end,
  );
  const lines = itemized
    .sort((a, b) => a.occurredAt.localeCompare(b.occurredAt) || a.id.localeCompare(b.id))
    .map((r) => toUsageLine(r, patient.fullName, mode));
  return {
    doctor: { name: actor.fullName, title: actor.title },
    patient: {
      id: patient.id,
      ref: patient.id.slice(0, 8).toUpperCase(),
      name: patient.fullName,
      dateOfBirth: patient.dateOfBirth,
    },
    period,
    rateMicrosPer1k: account?.rateMicrosPer1k ?? env.billingRateMicrosPer1k,
    mode,
    lines,
    privateTotal: summarizeUsage(rest, mode),
    totals: summarizeUsage([...itemized, ...rest], mode),
    generatedAt: now.toISOString(),
    privatePeriod,
  };
}

export async function getPatientUsageStatementCsv(
  actor: Actor,
  patientId: string,
  range: { from?: string; to?: string },
): Promise<{ filename: string; csv: string }> {
  const statement = await getPatientUsageStatement(actor, patientId, range);
  return { filename: statementFilename(statement), csv: statementToCsv(statement) };
}

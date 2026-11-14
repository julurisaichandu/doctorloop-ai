"use client";

import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  cancelSimulatedBillingAction,
  invoiceNowAction,
  openBillingPortalAction,
  retryUsageSyncAction,
  startBillingSetupAction,
} from "@/app/doctor/billing/actions";
import { IntegrationModeBadge } from "@/components/shared/integration-mode-badge";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { useServerAction } from "@/components/patient/use-action";
import { formatCents, formatRate, formatUsd } from "@/lib/billing/money";
import type { DoctorBillingOverview } from "@/lib/domain/types";
import { cn } from "@/lib/utils";

const STATUS_LABEL = {
  not_set_up: "Not set up",
  pending_setup: "Setup not finished",
  active: "Billing active",
  past_due: "Payment past due",
  canceled: "Billing off",
} as const;

const dateFmt = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
const dateYearFmt = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });

function formatPeriod(start: string, end: string): string {
  return `${dateFmt.format(new Date(start))} – ${dateYearFmt.format(new Date(end))}`;
}

function navigate(router: ReturnType<typeof useRouter>, target: string) {
  if (/^https?:\/\//.test(target)) window.location.assign(target);
  else router.push(target);
}

export function BillingHero({ overview }: { overview: DoctorBillingOverview }) {
  const router = useRouter();
  const { pending, run } = useServerAction();
  const { account, mode, upcomingInvoice } = overview;
  const status = account.status;
  const billable = status === "active" || status === "past_due";
  const canSetUp = status === "not_set_up" || status === "pending_setup" || status === "canceled";

  const heroLabel = upcomingInvoice ? "Upcoming invoice" : "This month";
  const heroValue = upcomingInvoice ? formatCents(upcomingInvoice.amountCents) : billable ? formatCents(0) : "Not set up";
  const heroSub = upcomingInvoice
    ? formatPeriod(upcomingInvoice.periodStart, upcomingInvoice.periodEnd)
    : `${formatUsd(overview.totals.notBilledMicros, 2)} of AI usage this month is not billed`;

  return (
    <section aria-label="Billing summary" className="relative overflow-hidden rounded-[28px] bg-ink p-6 text-paper sm:p-10">
      <div className="flex flex-col gap-8 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-3">
            <p className="eyebrow text-muted-ink">{heroLabel}</p>
            <span
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium",
                status === "active" ? "bg-lime text-ink" : "border border-ink-3 bg-ink-2 text-paper",
              )}
            >
              {STATUS_LABEL[status]}
            </span>
          </div>
          <p className="mt-4 font-display text-6xl leading-none tabular-nums sm:text-7xl">{heroValue}</p>
          <p className="mt-3 text-sm text-muted-ink">{heroSub}</p>
          <div className="mt-5 flex flex-wrap items-center gap-3">
            <IntegrationModeBadge label={overview.modeLabel} mode={mode === "stripe" ? "test" : "simulated"} />
            <span className="font-mono text-xs text-muted-ink">{formatRate(overview.rateMicrosPer1k)}</span>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {canSetUp ? (
            <Button
              type="button"
              className="rounded-full bg-lime px-5 text-ink hover:bg-lime/90"
              size="lg"
              disabled={pending}
              onClick={() => run(() => startBillingSetupAction(), { onSuccess: (d) => navigate(router, d.redirectTo) })}
            >
              {pending ? <Spinner /> : null}
              Set up billing
            </Button>
          ) : null}
          {billable ? (
            <Button
              type="button"
              className="rounded-full bg-lime px-5 text-ink hover:bg-lime/90"
              size="lg"
              disabled={pending}
              onClick={() =>
                run(() => invoiceNowAction(), {
                  onSuccess: (d) =>
                    toast.success(
                      d.invoiceNumber
                        ? `Invoice ${d.invoiceNumber} created and paid with the test card.`
                        : "Invoice created in Stripe — it can take a few seconds to appear.",
                    ),
                })
              }
            >
              {pending ? <Spinner /> : null}
              Invoice now (demo)
            </Button>
          ) : null}
          {billable && mode === "stripe" ? (
            <Button
              type="button"
              variant="outline"
              size="lg"
              className="rounded-full border-ink-3 bg-transparent px-5 text-paper hover:bg-ink-2 hover:text-paper"
              disabled={pending}
              onClick={() => run(() => openBillingPortalAction(), { onSuccess: (d) => navigate(router, d.redirectTo) })}
            >
              Manage billing
            </Button>
          ) : null}
          {billable && mode === "simulated" ? (
            <Button
              type="button"
              variant="outline"
              size="lg"
              className="rounded-full border-ink-3 bg-transparent px-5 text-paper hover:bg-ink-2 hover:text-paper"
              disabled={pending}
              onClick={() =>
                run(() => cancelSimulatedBillingAction(), {
                  success: "Billing turned off.",
                  onSuccess: () => router.refresh(),
                })
              }
            >
              Turn off billing (demo)
            </Button>
          ) : null}
        </div>
      </div>
    </section>
  );
}

export function RetrySyncButton() {
  const router = useRouter();
  const { pending, run } = useServerAction();
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      className="rounded-full border-ink"
      disabled={pending}
      onClick={() =>
        run(() => retryUsageSyncAction(), {
          onSuccess: (d) => {
            toast.success(`Retried ${d.retried}; ${d.failed} still failing.`);
            router.refresh();
          },
        })
      }
    >
      {pending ? <Spinner /> : null}
      Retry sync
    </Button>
  );
}

import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { StatementActions } from "@/components/billing/statement-actions";
import { UsageLinesTable } from "@/components/billing/usage-tables";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { requireActor } from "@/lib/auth/session";
import { formatRate, formatTokens, formatUsd } from "@/lib/billing/money";
import { PRIVATE_LINE_LABEL } from "@/lib/billing/views";
import { isAppError } from "@/lib/errors";
import { getPatientUsageStatement } from "@/lib/services/billing-views";

type PageProps = {
  params: Promise<{ patientId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function first(value: string | string[] | undefined): string | undefined {
  const v = Array.isArray(value) ? value[0] : value;
  return v ? v : undefined;
}

const dayFmt = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
const dayYearFmt = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });

function formatRange(start: string, end: string): string {
  return `${dayFmt.format(new Date(start))} – ${dayYearFmt.format(new Date(end))}`;
}

function Meta({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="eyebrow text-muted-foreground">{label}</dt>
      <dd className="mt-1 text-sm font-medium">{children}</dd>
    </div>
  );
}

export default async function UsageStatementPage({ params, searchParams }: PageProps) {
  const actor = await requireActor("doctor");
  const { patientId } = await params;
  const query = await searchParams;
  const from = first(query.from);
  const to = first(query.to);

  let statement;
  try {
    statement = await getPatientUsageStatement(actor, patientId, { from, to });
  } catch (error) {
    if (isAppError(error) && error.code === "NOT_FOUND") notFound();
    throw error;
  }

  const { patient, doctor } = statement;
  const totalsClass = "flex items-baseline justify-between gap-4 py-2 text-sm";

  return (
    <div className="mx-auto max-w-4xl space-y-8">
      <div className="space-y-4 print:hidden">
        <Button asChild variant="ghost" size="sm" className="-ml-2">
          <Link href="/doctor/billing">
            <ArrowLeft />
            Billing
          </Link>
        </Button>
        <form method="get" className="flex flex-wrap items-end gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="range-from">From</Label>
            <Input id="range-from" name="from" type="date" defaultValue={from ?? ""} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="range-to">To</Label>
            <Input id="range-to" name="to" type="date" defaultValue={to ?? ""} />
          </div>
          <Button type="submit" variant="outline" className="rounded-full border-ink">
            Apply dates
          </Button>
        </form>
        <StatementActions patientId={patient.id} from={from} to={to} />
      </div>

      <header className="space-y-5 border-b border-hairline pb-6">
        <div>
          <p className="eyebrow text-muted-foreground">Usage statement</p>
          <h1 className="mt-2 font-display text-4xl leading-[1.05] tracking-normal sm:text-5xl">{patient.name}</h1>
        </div>
        <dl className="grid gap-4 sm:grid-cols-3">
          <Meta label="Practice">
            {doctor.name}
            {doctor.title ? <span className="block text-muted-foreground">{doctor.title}</span> : null}
          </Meta>
          <Meta label="Date of birth">{patient.dateOfBirth ?? "—"}</Meta>
          <Meta label="Reference">
            <span className="font-mono">{patient.ref}</span>
          </Meta>
          <Meta label="Period">{formatRange(statement.period.start, statement.period.end)}</Meta>
          <Meta label="Rate">{formatRate(statement.rateMicrosPer1k)}</Meta>
          <Meta label="Billing mode">{statement.mode === "stripe" ? "Stripe (test mode)" : "Simulated"}</Meta>
        </dl>
      </header>

      <section className="space-y-3" aria-label="Itemized usage">
        <h2 className="font-display text-2xl tracking-normal">Itemized usage</h2>
        {statement.lines.length === 0 ? (
          <p className="rounded-[20px] border border-dashed border-hairline bg-paper-2 p-6 text-sm text-muted-foreground">
            No itemized usage in this period.
          </p>
        ) : (
          <UsageLinesTable lines={statement.lines} showPatient={false} detailed />
        )}
        <div className="flex flex-wrap items-start justify-between gap-4 rounded-[20px] border border-hairline bg-paper-2 px-5 py-4 text-sm">
          <div>
            <p className="font-medium">{PRIVATE_LINE_LABEL}</p>
            <p className="text-xs text-muted-foreground">
              {formatRange(statement.privatePeriod.start, statement.privatePeriod.end)}
            </p>
          </div>
          <p className="tabular-nums">
            {statement.privateTotal.runs} runs · {formatTokens(statement.privateTotal.totalTokens)} tokens ·{" "}
            <span className="font-medium">{formatUsd(statement.privateTotal.billedMicros + statement.privateTotal.notBilledMicros, 4)}</span>
          </p>
        </div>
      </section>

      <section aria-label="Totals" className="rounded-[20px] border border-hairline bg-paper-2 px-5 py-3">
        <h2 className="sr-only">Totals</h2>
        <dl className="divide-y divide-hairline">
          <div className={totalsClass}>
            <dt>AI runs</dt>
            <dd className="tabular-nums">{statement.totals.runs}</dd>
          </div>
          <div className={totalsClass}>
            <dt>Tokens</dt>
            <dd className="tabular-nums">{formatTokens(statement.totals.totalTokens)}</dd>
          </div>
          <div className={totalsClass}>
            <dt>Amount</dt>
            <dd className="font-display text-2xl tabular-nums">
              {formatUsd(statement.totals.billedMicros + statement.totals.notBilledMicros, 2)}
            </dd>
          </div>
        </dl>
        <p className="pb-2 text-xs text-muted-foreground">
          Totals combine the itemized lines of the selected dates with the private total for the full month(s) shown.
        </p>
      </section>

      <p className="text-xs leading-relaxed text-muted-foreground">
        Usage statement — not an insurance claim. No clinical content. Synthetic demo data.
      </p>
    </div>
  );
}

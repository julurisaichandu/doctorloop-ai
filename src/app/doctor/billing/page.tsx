import { Coins, Cpu, Receipt, Sparkles } from "lucide-react";
import { BillingHero, RetrySyncButton } from "@/components/billing/billing-hero";
import { InvoiceList } from "@/components/billing/invoice-list";
import { PatientUsageTable, UsageLinesTable } from "@/components/billing/usage-tables";
import { Reveal } from "@/components/motion/reveal";
import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { StatCard } from "@/components/shared/stat-card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { requireActor } from "@/lib/auth/session";
import { formatTokens, formatUsd } from "@/lib/billing/money";
import { getDoctorBillingOverview } from "@/lib/services/billing-views";
import { RETRY_WINDOW_MS } from "@/lib/services/billing-usage";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function first(value: string | string[] | undefined): string {
  return (Array.isArray(value) ? value[0] : value) ?? "";
}

const SETUP_NOTICE: Record<string, { text: string; error?: boolean }> = {
  success: { text: "Billing is set up." },
  cancelled: { text: "Checkout was cancelled." },
  error: { text: "Couldn't finish setting up billing. Try again.", error: true },
};

function Section({ title, eyebrow, children }: { title: string; eyebrow: string; children: React.ReactNode }) {
  return (
    <section className="space-y-4">
      <div>
        <p className="eyebrow text-muted-foreground">{eyebrow}</p>
        <h2 className="mt-1 font-display text-3xl tracking-normal">{title}</h2>
      </div>
      {children}
    </section>
  );
}

export default async function DoctorBillingPage({ searchParams }: { searchParams: SearchParams }) {
  const actor = await requireActor("doctor");
  const params = await searchParams;
  const overview = await getDoctorBillingOverview(actor);
  const notice = SETUP_NOTICE[first(params.setup)];
  const { totals } = overview;
  const retryHours = Math.floor(RETRY_WINDOW_MS / 3_600_000);

  return (
    <div className="space-y-12">
      <PageHeader
        eyebrow="Practice billing"
        title="Billing"
        description="AI usage from your patients is billed to your practice — never to patients."
      />

      {notice ? (
        <Alert variant={notice.error ? "destructive" : "default"} role="status">
          <AlertDescription>{notice.text}</AlertDescription>
        </Alert>
      ) : null}

      {overview.stripeError ? (
        <Alert variant="destructive">
          <AlertTitle>Stripe is not responding</AlertTitle>
          <AlertDescription>{overview.stripeError}</AlertDescription>
        </Alert>
      ) : null}

      <Reveal>
        <BillingHero overview={overview} />
      </Reveal>

      {totals.failedSyncs > 0 ? (
        <Alert>
          <AlertTitle>Some usage couldn&apos;t be sent to Stripe.</AlertTitle>
          <AlertDescription>
            <div className="mt-2 flex flex-wrap items-center gap-3">
              <RetrySyncButton />
              <span className="text-xs text-muted-foreground">
                Usage that failed more than {retryHours} hours ago can&apos;t be resent safely.
              </span>
            </div>
          </AlertDescription>
        </Alert>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="AI runs · this month" value={totals.runs} icon={Sparkles} />
        <StatCard label="Tokens · this month" value={formatTokens(totals.totalTokens)} icon={Cpu} />
        <StatCard label="Billed · this month" value={formatUsd(totals.billedMicros)} icon={Receipt} />
        <StatCard
          label="Not billed · this month"
          value={formatUsd(totals.notBilledMicros)}
          icon={Coins}
          hint={totals.estimatedRuns > 0 ? `${totals.estimatedRuns} estimated` : undefined}
        />
      </div>

      <Section eyebrow="This month" title="By patient">
        <PatientUsageTable rows={overview.patients} />
      </Section>

      <Section eyebrow="This month" title="Recent activity">
        {overview.recent.length === 0 ? (
          <EmptyState title="No itemized activity yet" description="Shared updates and pre-visit summaries appear here." />
        ) : (
          <UsageLinesTable lines={overview.recent} />
        )}
      </Section>

      <Section eyebrow="Invoices" title="Invoices">
        <InvoiceList invoices={overview.invoices} />
      </Section>

      <p className="text-xs leading-relaxed text-muted-foreground">
        Patients are never billed. Stripe receives only your practice&apos;s account and token counts — no patient
        information.
      </p>
    </div>
  );
}

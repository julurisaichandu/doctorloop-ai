import { redirect } from "next/navigation";
import { SimulatedCheckoutForm } from "@/components/billing/simulated-checkout-form";
import { PageHeader } from "@/components/shared/page-header";
import { requireActor } from "@/lib/auth/session";
import { formatRate } from "@/lib/billing/money";
import { getDoctorBillingOverview } from "@/lib/services/billing-views";

export default async function SimulatedCheckoutPage() {
  const actor = await requireActor("doctor");
  const overview = await getDoctorBillingOverview(actor);
  if (overview.mode === "stripe") redirect("/doctor/billing");

  return (
    <div className="mx-auto max-w-xl space-y-8">
      <PageHeader eyebrow="Practice billing" title="Start billing" description="Simulated checkout for the demo." />
      <section className="rounded-[20px] border border-hairline bg-paper-2 p-6">
        <p className="eyebrow text-muted-foreground">Plan</p>
        <p className="mt-2 font-display text-3xl tracking-normal">Usage-based AI billing</p>
        <p className="mt-1 text-sm text-muted-foreground">
          {formatRate(overview.rateMicrosPer1k)} · billed monthly
        </p>
        <dl className="mt-4 text-sm">
          <dt className="eyebrow text-muted-foreground">Billed to</dt>
          <dd className="mt-1 font-medium">{actor.fullName}</dd>
          <dd className="text-muted-foreground">{actor.email}</dd>
        </dl>
      </section>
      <section className="rounded-[20px] border border-hairline bg-paper-2 p-6">
        <SimulatedCheckoutForm />
      </section>
    </div>
  );
}

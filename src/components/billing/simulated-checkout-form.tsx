"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { activateSimulatedBillingAction } from "@/app/doctor/billing/actions";
import { useServerAction } from "@/components/patient/use-action";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";

export function SimulatedCheckoutForm() {
  const router = useRouter();
  const { pending, run } = useServerAction();
  return (
    <form
      className="space-y-5"
      onSubmit={(e) => {
        e.preventDefault();
        run(() => activateSimulatedBillingAction(), { onSuccess: (d) => router.push(d.redirectTo) });
      }}
    >
      <p className="eyebrow inline-block rounded-sm bg-paper-3 px-2 py-1 text-ink">SIMULATED · NO REAL PAYMENT</p>
      <div className="space-y-2">
        <Label htmlFor="card-number">Card number</Label>
        <Input id="card-number" value="4242 4242 4242 4242" readOnly className="font-mono tabular-nums" />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="card-expiry">Expiry</Label>
          <Input id="card-expiry" value="12 / 34" readOnly className="font-mono tabular-nums" />
        </div>
        <div className="space-y-2">
          <Label htmlFor="card-cvc">CVC</Label>
          <Input id="card-cvc" value="123" readOnly className="font-mono tabular-nums" />
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-3 pt-2">
        <Button type="submit" size="lg" className="rounded-full px-5" disabled={pending}>
          {pending ? <Spinner /> : null}
          Start billing (simulated)
        </Button>
        <Link href="/doctor/billing?setup=cancelled" className="text-sm font-medium underline-offset-4 hover:underline">
          Cancel
        </Link>
      </div>
    </form>
  );
}

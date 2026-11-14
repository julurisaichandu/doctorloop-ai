"use client";

import { useTransition } from "react";
import { CheckCheck, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { markAllReviewedAction, regenerateClinicianSummaryAction } from "@/app/doctor/actions";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";

export function PatientActions({ patientId, unreviewedCount }: { patientId: string; unreviewedCount: number }) {
  const [markPending, startMark] = useTransition();
  const [regenPending, startRegen] = useTransition();

  function markAll() {
    startMark(async () => {
      const result = await markAllReviewedAction(patientId);
      if (!result.ok) toast.error(result.error);
      else toast.success(`Marked ${result.data.count} ${result.data.count === 1 ? "update" : "updates"} as reviewed`);
    });
  }

  function regenerate() {
    startRegen(async () => {
      const result = await regenerateClinicianSummaryAction(patientId);
      if (!result.ok) toast.error(result.error);
      else toast.success("Pre-visit summary regenerated");
    });
  }

  return (
    <div className="flex flex-wrap gap-2">
      <Button
        type="button"
        className="h-10 rounded-full px-5 text-sm"
        onClick={markAll}
        disabled={unreviewedCount === 0 || markPending}
      >
        {markPending ? <Spinner /> : <CheckCheck />}
        Mark all reviewed
      </Button>
      <Button
        type="button"
        variant="outline"
        className="h-10 rounded-full px-5 text-sm"
        onClick={regenerate}
        disabled={regenPending}
      >
        <RefreshCw className={cn(regenPending && "animate-spin motion-reduce:animate-none")} />
        {regenPending ? "Regenerating…" : "Regenerate summary"}
      </Button>
    </div>
  );
}

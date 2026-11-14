"use client";

import { useOptimistic, useTransition } from "react";
import { Check, CheckCheck } from "lucide-react";
import { toast } from "sonner";
import { markEntryReviewedAction } from "@/app/doctor/actions";
import { Timestamp } from "@/components/shared/timestamp";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";

/** Marks one shared update as read by the doctor. Optimistic; reverts with a toast on failure. */
export function MarkReviewedButton({ entryId, reviewedAt }: { entryId: string; reviewedAt: string | null }) {
  const [optimisticReviewedAt, setOptimisticReviewedAt] = useOptimistic(reviewedAt);
  const [isPending, startTransition] = useTransition();

  if (optimisticReviewedAt) {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
        <Check className="size-3.5" aria-hidden />
        Reviewed <Timestamp value={optimisticReviewedAt} mode="relative" />
      </span>
    );
  }

  function onClick() {
    startTransition(async () => {
      setOptimisticReviewedAt(new Date().toISOString());
      const result = await markEntryReviewedAction(entryId);
      if (result.ok) toast.success("Marked as reviewed");
      else toast.error(result.error);
    });
  }

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      className="h-8 rounded-full border-ink px-3.5 hover:bg-ink hover:text-paper"
      onClick={onClick}
      disabled={isPending}
    >
      {isPending ? <Spinner /> : <CheckCheck />}
      Mark reviewed
    </Button>
  );
}

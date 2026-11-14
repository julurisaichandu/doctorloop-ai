"use client";

import { RefreshCw } from "lucide-react";
import { regenerateWeeklySummaryAction } from "@/app/patient/actions";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useServerAction } from "./use-action";

export function RegenerateSummaryButton({ label = "Regenerate" }: { label?: string }) {
  const { pending, run } = useServerAction();
  return (
    <Button
      variant="outline"
      size="sm"
      className="h-9 rounded-full border-ink bg-transparent px-4 text-[13px] hover:bg-ink hover:text-paper"
      disabled={pending}
      onClick={() => run(() => regenerateWeeklySummaryAction(), { success: "Summary regenerated." })}
    >
      <RefreshCw className={cn(pending && "animate-spin motion-reduce:animate-none")} />
      {pending ? "Regenerating…" : label}
    </Button>
  );
}

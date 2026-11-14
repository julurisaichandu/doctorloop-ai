import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

export function DoctorReviewBadge({ reviewed, className }: { reviewed: boolean; className?: string }) {
  if (reviewed) {
    return (
      <span
        className={cn("inline-flex h-6 items-center gap-1 px-1 text-xs font-medium text-muted-foreground", className)}
      >
        <Check className="size-3" strokeWidth={1.75} aria-hidden />
        Reviewed
      </span>
    );
  }
  return (
    <span
      className={cn(
        "inline-flex h-6 items-center gap-1.5 rounded-full border border-cobalt/30 px-2.5 text-xs font-medium text-cobalt",
        className,
      )}
    >
      <span className="size-1.5 rounded-full bg-cobalt" aria-hidden />
      New
    </span>
  );
}

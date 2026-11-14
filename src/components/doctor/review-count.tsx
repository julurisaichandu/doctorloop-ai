import { Check } from "lucide-react";

/** Review status of a patient's shared updates. A reading status only, never a risk indicator. */
export function ReviewCount({ count }: { count: number }) {
  if (count > 0) {
    return (
      <span className="inline-flex h-6 items-center gap-1.5 rounded-full bg-lime px-2.5 text-xs font-medium whitespace-nowrap text-ink">
        <span className="size-1.5 rounded-full bg-ink" aria-hidden />
        {count} new {count === 1 ? "update" : "updates"}
      </span>
    );
  }
  return (
    <span className="inline-flex h-6 items-center gap-1 text-xs font-medium whitespace-nowrap text-muted-foreground">
      <Check className="size-3" aria-hidden />
      All reviewed
    </span>
  );
}

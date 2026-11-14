import type { ReviewStatus } from "@/lib/domain/types";
import { cn } from "@/lib/utils";
import { STATUS_TONES } from "@/components/viz/palette";

/** Icon + label + color, never color alone (pending = amber, shared = lime, private = paper). */
export function ReviewStatusBadge({ status, className }: { status: ReviewStatus; className?: string }) {
  const { label, Icon, className: tone } = STATUS_TONES[status];
  return (
    <span
      className={cn(
        "inline-flex h-6 items-center gap-1.5 rounded-full border px-2.5 text-xs font-medium whitespace-nowrap",
        tone,
        className,
      )}
    >
      <Icon className="size-3" strokeWidth={1.75} aria-hidden />
      {label}
    </span>
  );
}

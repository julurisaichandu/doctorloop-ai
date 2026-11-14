"use client";

import { useSyncExternalStore } from "react";
import { format, formatDistanceToNowStrict } from "date-fns";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

const subscribe = () => () => {};

/** True only after hydration, so relative times never cause a server/client mismatch. */
function useIsMounted(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );
}

export function Timestamp({
  value,
  mode = "absolute",
  className,
}: {
  value: string;
  mode?: "relative" | "absolute" | "both";
  className?: string;
}) {
  const mounted = useIsMounted();
  // useIsMounted flips after hydration, which re-formats in the browser timezone.
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;

  const absolute = format(date, "MMM d, h:mm a");
  const relative = mounted ? `${formatDistanceToNowStrict(date)} ago` : null;
  const text =
    mode === "absolute" || relative === null
      ? absolute
      : mode === "relative"
        ? relative
        : `${absolute} · ${relative}`;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <time
          suppressHydrationWarning
          dateTime={value}
          className={cn("font-mono text-xs text-muted-foreground", className)}
        >
          {text}
        </time>
      </TooltipTrigger>
      <TooltipContent>{format(date, "EEEE, MMMM d, yyyy 'at' h:mm a")}</TooltipContent>
    </Tooltip>
  );
}

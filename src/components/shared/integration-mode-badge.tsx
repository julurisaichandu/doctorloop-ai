import { cn } from "@/lib/utils";

const DOTS = {
  live: "bg-lime-deep",
  mock: "bg-amber",
  simulated: "bg-amber",
  test: "bg-ink",
  local: "bg-ink",
  off: "bg-muted-foreground",
} as const;

export function IntegrationModeBadge({
  label,
  mode,
}: {
  label: string;
  mode: keyof typeof DOTS;
}) {
  return (
    <span className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-hairline bg-paper-2 px-2.5 py-0.5 text-xs font-medium text-ink">
      <span className={cn("size-1.5 shrink-0 rounded-full", DOTS[mode])} aria-hidden />
      <span className="truncate">{label}</span>
      <span className="eyebrow rounded-sm bg-paper-3 px-1 text-[10px] font-medium">{mode}</span>
    </span>
  );
}

import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";

export function StatCard({
  label,
  value,
  hint,
  icon: Icon,
  spark,
}: {
  label: string;
  value: ReactNode;
  hint?: string;
  icon?: LucideIcon;
  /** Optional slot, e.g. a Sparkline, shown beside the number. */
  spark?: ReactNode;
}) {
  return (
    <div className="rounded-[20px] border border-hairline bg-paper-2 p-5">
      <div className="flex items-center justify-between gap-2">
        <p className="eyebrow text-muted-foreground">{label}</p>
        {Icon ? <Icon className="size-4 text-muted-foreground" strokeWidth={1.5} aria-hidden /> : null}
      </div>
      <div className="mt-3 flex items-end justify-between gap-3">
        <p className="font-display text-5xl leading-none tracking-normal tabular-nums">{value}</p>
        {spark ? <div className="pb-1">{spark}</div> : null}
      </div>
      {hint ? <p className="mt-2 font-mono text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

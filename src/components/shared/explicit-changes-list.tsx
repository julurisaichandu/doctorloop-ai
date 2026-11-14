import { ArrowDownRight, ArrowRight, ArrowUpRight } from "lucide-react";
import { format } from "date-fns";
import type { ExplicitChange, TrendPoint } from "@/lib/domain/types";

const ICONS = { increased: ArrowUpRight, decreased: ArrowDownRight, unchanged: ArrowRight } as const;

function formatValue(point: TrendPoint, change: ExplicitChange): string {
  if (change.kind === "severity") return `${point.value}/10`;
  return change.unit ? `${point.value} ${change.unit}` : String(point.value);
}

function shortDate(date: string): string {
  return format(new Date(`${date}T12:00:00`), "MMM d");
}

/** Neutral, numeric changes between patient-reported values. No interpretation, no good/bad colors. */
export function ExplicitChangesList({ changes }: { changes: ExplicitChange[] }) {
  if (changes.length === 0) return null;
  return (
    <ul className="divide-y divide-hairline rounded-[20px] border border-hairline bg-paper-2">
      {changes.map((c) => {
        const Icon = ICONS[c.direction];
        return (
          <li key={`${c.seriesKey}:${c.from.date}:${c.to.date}`} className="flex items-start gap-3 p-4">
            <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full bg-ink text-paper">
              <Icon className="size-4" strokeWidth={1.5} aria-hidden />
            </span>
            <div className="min-w-0">
              <p className="text-sm">{c.description}</p>
              <p className="mt-1 font-mono text-xs text-muted-foreground">
                {formatValue(c.from, c)} ({shortDate(c.from.date)}) → {formatValue(c.to, c)} ({shortDate(c.to.date)})
              </p>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

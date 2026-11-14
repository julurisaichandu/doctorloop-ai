import { ArrowDown, ArrowRight, ArrowUp } from "lucide-react";
import { CountUp } from "@/components/motion/count-up";
import { Sparkline } from "@/components/viz/sparkline";

/**
 * Editorial stat: mono eyebrow, big latest value, unit, sparkline in the category color,
 * neutral delta text (ink + arrow glyph, never red/green) and a self-report count.
 */
export function MetricTile({
  label,
  value,
  unit,
  values,
  color,
  delta,
  sourceCount,
  decimals = 0,
}: {
  label: string;
  value: number;
  unit?: string | null;
  values: number[];
  color: string;
  /** Pre-built neutral text, e.g. "+4 since Nov 7"; `direction` picks the arrow glyph. */
  delta: { text: string; direction: "up" | "down" | "flat" } | null;
  sourceCount: number;
  decimals?: number;
}) {
  const Arrow = delta?.direction === "up" ? ArrowUp : delta?.direction === "down" ? ArrowDown : ArrowRight;
  return (
    <div className="flex h-full flex-col p-5 sm:p-6">
      <p className="eyebrow truncate text-muted-foreground">{label}</p>
      <div className="mt-3 flex items-end justify-between gap-3">
        <p className="flex items-baseline gap-1.5 text-ink">
          <CountUp value={value} decimals={decimals} className="font-display text-[56px] leading-[0.9] tracking-tight" />
          {unit ? <span className="font-mono text-xs text-muted-foreground">{unit}</span> : null}
        </p>
        <Sparkline values={values} color={color} width={96} height={36} ariaLabel={`${label} trend, self-reported`} />
      </div>
      <p className="mt-4 flex items-center gap-1.5 text-[13px] text-ink">
        {delta ? (
          <>
            <Arrow className="size-3.5" strokeWidth={1.5} aria-hidden />
            {delta.text}
          </>
        ) : (
          <span className="text-muted-foreground">Single report so far</span>
        )}
      </p>
      <p className="eyebrow mt-1 text-[10px] text-muted-foreground">
        {sourceCount} self-reported {sourceCount === 1 ? "entry" : "entries"}
      </p>
    </div>
  );
}

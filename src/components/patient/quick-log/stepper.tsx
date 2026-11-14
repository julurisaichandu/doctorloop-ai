"use client";

import { Minus, Plus } from "lucide-react";
import { cn } from "@/lib/utils";

/** Big-number +/- stepper. `value === null` means "not logged": shows an em dash. */
export function Stepper({
  id,
  label,
  unit,
  value,
  step,
  min,
  max,
  start,
  format = String,
  onChange,
  disabled,
}: {
  id: string;
  label: string;
  unit: string;
  value: number | null;
  step: number;
  min: number;
  max: number;
  /** Value the first press lands on. */
  start: number;
  format?: (n: number) => string;
  onChange: (next: number) => void;
  disabled?: boolean;
}) {
  const bump = (dir: 1 | -1) => {
    if (value === null) return onChange(start);
    onChange(Math.min(max, Math.max(min, Math.round((value + dir * step) * 10) / 10)));
  };
  const btn =
    "flex size-10 items-center justify-center rounded-full border border-hairline bg-paper-2 text-ink transition-[background-color,transform] hover:bg-paper-3 active:scale-95 disabled:pointer-events-none disabled:opacity-40";

  return (
    <div className="flex items-center justify-between gap-3">
      <div className="min-w-0">
        <p id={`${id}-label`} className="eyebrow text-muted-foreground">
          {label}
        </p>
        <p className="mt-1 flex items-baseline gap-1.5 font-mono" role="group" aria-labelledby={`${id}-label`}>
          <span id={id} className={cn("text-3xl leading-none font-medium", value === null && "text-bone")} aria-live="polite">
            {value === null ? "—" : format(value)}
          </span>
          <span className="text-xs text-muted-foreground">{unit}</span>
        </p>
      </div>
      <div className="flex shrink-0 gap-2">
        <button type="button" className={btn} onClick={() => bump(-1)} disabled={disabled || (value !== null && value <= min)} aria-label={`Decrease ${label.toLowerCase()}`}>
          <Minus className="size-4" aria-hidden />
        </button>
        <button type="button" className={btn} onClick={() => bump(1)} disabled={disabled || (value !== null && value >= max)} aria-label={`Increase ${label.toLowerCase()}`}>
          <Plus className="size-4" aria-hidden />
        </button>
      </div>
    </div>
  );
}

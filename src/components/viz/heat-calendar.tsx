"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";

export interface HeatDay {
  key: string;
  /** Day of month, e.g. "13". */
  short: string;
  /** e.g. "Thu, Nov 13". */
  label: string;
}

export interface HeatCell {
  value: number;
  /** Exact self-reported value for the tooltip, e.g. "6/10". */
  text: string;
}

export interface HeatRow {
  key: string;
  label: string;
  /** Any CSS color; a single hue per row, ramped by opacity. */
  color: string;
  /** One entry per day (aligned with `days`); null = no log. */
  cells: (HeatCell | null)[];
}

const STEPS = [0.2, 0.4, 0.6, 0.8, 1] as const;
const HATCH = "repeating-linear-gradient(135deg, var(--hairline) 0 1.5px, transparent 1.5px 5px)";

function step(value: number, min: number, max: number): number {
  if (max === min) return 2;
  return Math.min(4, Math.floor(((value - min) / (max - min)) * 5));
}

/**
 * 14 local days x tracked series. Magnitude only (single-hue ramp per row, never good/bad);
 * hatched = no log. Hover or focus a cell to read the exact value.
 */
export function SymptomHeatCalendar({ days, rows }: { days: HeatDay[]; rows: HeatRow[] }) {
  const [readout, setReadout] = useState<string | null>(null);
  const cols = { gridTemplateColumns: `repeat(${days.length}, minmax(0, 1fr))` };
  const range = days.length > 0 ? `${days[0].label.split(", ")[1]} to ${days[days.length - 1].label.split(", ")[1]}` : "";

  return (
    <figure className="m-0">
      <div className="space-y-3">
        {rows.map((row) => {
          const vals = row.cells.flatMap((c) => (c ? [c.value] : []));
          const min = Math.min(...vals);
          const max = Math.max(...vals);
          return (
            <div key={row.key} className="md:grid md:grid-cols-[168px_1fr] md:items-center md:gap-4">
              <p className="mb-1.5 flex items-center gap-2 text-[13px] font-medium text-ink md:mb-0">
                <span className="size-2 shrink-0 rounded-full" style={{ background: row.color }} aria-hidden />
                <span className="truncate">{row.label}</span>
              </p>
              <div className="grid gap-[3px]" style={cols}>
                {row.cells.map((cell, i) => {
                  const d = days[i];
                  const text = cell ? `${row.label} · ${d.label} · ${cell.text} (self-reported)` : `${row.label} · ${d.label} · no log`;
                  return (
                    <button
                      key={d.key}
                      type="button"
                      aria-label={text}
                      title={text}
                      onMouseEnter={() => setReadout(text)}
                      onFocus={() => setReadout(text)}
                      onMouseLeave={() => setReadout(null)}
                      onBlur={() => setReadout(null)}
                      className={cn(
                        "h-7 rounded-[4px] outline-offset-2 focus-visible:outline-2 focus-visible:outline-cobalt sm:h-8",
                        cell ? "" : "border border-hairline",
                      )}
                      style={
                        cell
                          ? { background: row.color, opacity: STEPS[step(cell.value, min, max)] }
                          : { backgroundImage: HATCH }
                      }
                    />
                  );
                })}
              </div>
            </div>
          );
        })}
        <div className="md:grid md:grid-cols-[168px_1fr] md:gap-4">
          <p className="eyebrow hidden text-muted-foreground md:block">{range}</p>
          <div className="grid gap-[3px]" style={cols} aria-hidden>
            {days.map((d) => (
              <span key={d.key} className="text-center font-mono text-[9px] text-muted-foreground tabular-nums sm:text-[10.5px]">
                {d.short}
              </span>
            ))}
          </div>
        </div>
      </div>
      <figcaption className="mt-5 flex flex-col gap-2 border-t border-hairline pt-4 sm:flex-row sm:items-center sm:justify-between">
        <p className="min-h-5 font-mono text-xs text-ink" aria-live="polite">
          {readout ?? "Self-reported · not clinical measurements"}
        </p>
        <div className="eyebrow flex items-center gap-3 text-[10px] text-muted-foreground">
          <span>Lower</span>
          <span className="flex gap-[3px]" aria-hidden>
            {STEPS.map((o) => (
              <span key={o} className="size-3.5 rounded-[3px] bg-ink" style={{ opacity: o }} />
            ))}
          </span>
          <span>Higher</span>
          <span className="ml-2 size-3.5 rounded-[3px] border border-hairline" style={{ backgroundImage: HATCH }} aria-hidden />
          <span>No log</span>
        </div>
      </figcaption>
    </figure>
  );
}

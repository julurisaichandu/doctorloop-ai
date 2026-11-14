import { cn } from "@/lib/utils";

/**
 * DoctorLoop mark: an open loop (the care loop) with a small lime spark on it.
 * `tone="onInk"` for dark surfaces (default), `"onPaper"` for light ones.
 */
export function LogoMark({ className, tone = "onInk" }: { className?: string; tone?: "onInk" | "onPaper" }) {
  return (
    <span
      className={cn("flex size-8 shrink-0 items-center justify-center", className)}
      aria-hidden
    >
      <svg viewBox="0 0 32 32" className="size-full" fill="none">
        <circle
          cx="16"
          cy="16"
          r="11"
          strokeWidth="3"
          strokeLinecap="round"
          strokeDasharray="58 11"
          transform="rotate(-60 16 16)"
          stroke={tone === "onInk" ? "var(--lime)" : "var(--ink)"}
        />
        <circle cx="27" cy="16" r="3.2" fill={tone === "onInk" ? "var(--paper)" : "var(--lime)"} />
      </svg>
    </span>
  );
}

/** Wordmark: "Doctor" in Geist semibold + "Loop" in Instrument Serif italic. */
export function BrandName({ className }: { className?: string }) {
  return (
    <span className={cn("tracking-tight", className)}>
      <span className="font-semibold">Doctor</span>
      <span className="font-display text-[1.2em] leading-none italic">Loop</span>
      <span className="sr-only"> AI</span>
    </span>
  );
}

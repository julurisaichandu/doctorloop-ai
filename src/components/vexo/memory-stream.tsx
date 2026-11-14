"use client";

import { EyeOff } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useEffect, useState } from "react";
import { DUR, EASE_OUT } from "@/components/motion/tokens";

/** Fixed, content-free widths (px) for redacted bars: the filtered memories are never rendered. */
const BAR_WIDTHS = [88, 132, 64, 112, 76, 144, 96, 58, 120, 82] as const;
const SKELETON_LINES = [
  ["72%", "48%"],
  ["58%", "84%", "36%"],
  ["66%", "42%"],
  ["80%", "52%"],
] as const;

/** While searching: a lime scan line sweeps a stack of skeleton memory cards on ink. */
export function MemoryScan() {
  return (
    <div
      role="status"
      aria-live="polite"
      className="grain relative overflow-hidden rounded-[28px] bg-ink p-5 text-paper sm:p-7"
    >
      <div className="relative z-10">
        <p className="eyebrow flex items-center gap-2 text-lime">
          <span className="size-1.5 animate-pulse rounded-full bg-lime" aria-hidden />
          Searching your memories…
        </p>
        <div className="mt-4 space-y-3" aria-hidden>
          {SKELETON_LINES.map((lines, i) => (
            <div key={i} className="flex gap-4 rounded-2xl border border-ink-3 bg-ink-2 p-4">
              <span className="mt-0.5 size-4 shrink-0 rounded-[4px] border border-ink-3" />
              <div className="min-w-0 flex-1 space-y-2.5">
                <div className="h-3 w-1/3 rounded-full bg-ink-3" />
                {lines.map((w, j) => (
                  <div key={j} className="h-2.5 rounded-full bg-ink-3/70" style={{ width: w }} />
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
      <motion.div
        aria-hidden
        className="pointer-events-none absolute inset-0 z-10"
        initial={{ y: "-100%" }}
        animate={{ y: "0%" }}
        transition={{ duration: 1.9, ease: "linear", repeat: Infinity, repeatDelay: 0.15 }}
      >
        <div className="absolute inset-x-0 bottom-0 h-20 border-b-2 border-lime bg-lime/10" />
      </motion.div>
    </div>
  );
}

/**
 * After a search: unrelated memories exist ONLY as N content-free redacted bars. They dissolve, leaving
 * the plain statement that they were filtered out and never stored.
 */
export function FilteredStrip({ count }: { count: number }) {
  const reduce = useReducedMotion();
  const [phase, setPhase] = useState<"bars" | "dissolving" | "done">("bars");

  useEffect(() => {
    if (count === 0) return;
    const t1 = setTimeout(() => setPhase("dissolving"), reduce ? 300 : 1700);
    const t2 = setTimeout(() => setPhase("done"), reduce ? 600 : 3100);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [count, reduce]);

  if (count === 0) {
    return (
      <p className="flex items-center gap-2 rounded-2xl border border-hairline bg-paper-2 px-4 py-3 text-sm text-muted-foreground">
        <EyeOff className="size-4 shrink-0 text-ink" strokeWidth={1.5} aria-hidden />
        No unrelated memories were found in this range.
      </p>
    );
  }

  return (
    <div className="rounded-2xl border border-hairline bg-paper-2 px-4 py-3.5">
      <AnimatePresence>
        {phase !== "done" ? (
          <motion.ul
            key="bars"
            aria-hidden
            className="mb-3.5 flex flex-wrap gap-2 overflow-hidden"
            exit={{ opacity: 0, height: 0, marginBottom: 0, transition: { duration: DUR.base, ease: EASE_OUT } }}
          >
            {Array.from({ length: count }, (_, i) => (
              <motion.li
                key={i}
                className="h-3 origin-left rounded-[3px] bg-ink"
                style={{ width: BAR_WIDTHS[i % BAR_WIDTHS.length] }}
                initial={{ opacity: 0, scaleX: 0.5 }}
                animate={phase === "dissolving" ? { opacity: 0, scaleX: 0 } : { opacity: 1, scaleX: 1 }}
                transition={{ duration: 0.5, ease: EASE_OUT, delay: Math.min(i, 14) * 0.045 }}
              />
            ))}
          </motion.ul>
        ) : null}
      </AnimatePresence>
      <p className="flex items-center gap-2 text-sm text-ink">
        <EyeOff className="size-4 shrink-0" strokeWidth={1.5} aria-hidden />
        <span>
          {count} unrelated {count === 1 ? "memory was" : "memories were"} filtered out — never stored.
        </span>
      </p>
    </div>
  );
}

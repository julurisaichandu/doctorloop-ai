"use client";

import { Check } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import { useEffect, useState } from "react";
import { DUR, EASE_OUT } from "@/components/motion/tokens";
import { cn } from "@/lib/utils";

const STEPS = ["Reading your words", "Finding details", "Drafting notes"] as const;
const STEP_MS = 1500;

/**
 * The elegant "structuring" wait: three named steps advance while the server works. It is purely
 * presentational; the caller owns the pending state and unmounts this when the result arrives.
 */
export function ProcessingSequence({
  title = "AI is structuring your update…",
  words,
  className,
}: {
  title?: string;
  /** The patient's own words, echoed in serif italic while they are being read. */
  words?: string;
  className?: string;
}) {
  const [step, setStep] = useState(0);
  const reduce = useReducedMotion();

  useEffect(() => {
    const id = setInterval(() => setStep((s) => Math.min(s + 1, STEPS.length - 1)), STEP_MS);
    return () => clearInterval(id);
  }, []);

  return (
    <div
      role="status"
      aria-live="polite"
      className={cn("grain relative overflow-hidden rounded-[28px] bg-ink p-6 text-paper sm:p-8", className)}
    >
      <div className="relative z-10">
        <p className="eyebrow flex items-center gap-2 text-lime">
          <span className="size-1.5 animate-pulse rounded-full bg-lime" aria-hidden />
          AI DRAFT · UNVERIFIED
        </p>
        <h3 className="font-display mt-3 text-3xl leading-[1.1] sm:text-4xl">{title}</h3>

        <div className="mt-6 h-px w-full overflow-hidden rounded-full bg-ink-3" aria-hidden>
          <motion.div
            className="h-px origin-left bg-lime"
            initial={false}
            animate={{ scaleX: (step + 1) / STEPS.length }}
            transition={{ duration: reduce ? 0.2 : DUR.reveal, ease: EASE_OUT }}
          />
        </div>

        <ol className="mt-5 grid gap-3 sm:grid-cols-3">
          {STEPS.map((label, i) => {
            const done = i < step;
            const active = i === step;
            return (
              <li
                key={label}
                aria-current={active ? "step" : undefined}
                className={cn("flex items-center gap-3 transition-opacity duration-300", !done && !active && "opacity-40")}
              >
                <span
                  aria-hidden
                  className={cn(
                    "flex size-7 shrink-0 items-center justify-center rounded-full border font-mono text-[11px]",
                    done ? "border-lime bg-lime text-ink" : active ? "border-lime text-lime" : "border-ink-3 text-muted-ink",
                  )}
                >
                  {done ? <Check className="size-3.5" strokeWidth={2} /> : String(i + 1).padStart(2, "0")}
                </span>
                <span className="text-sm">{label}…</span>
              </li>
            );
          })}
        </ol>

        {words ? (
          <p className="font-display mt-6 line-clamp-3 border-t border-ink-3 pt-5 text-lg leading-[1.45] text-paper/80 italic">
            “{words}”
          </p>
        ) : null}
      </div>
    </div>
  );
}

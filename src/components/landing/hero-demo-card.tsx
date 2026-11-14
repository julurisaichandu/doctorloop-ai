"use client";

import { useEffect, useRef, useState } from "react";
import { animate, motion, useReducedMotion } from "motion/react";
import { Check, Mic } from "lucide-react";
import { DUR, EASE_OUT } from "@/components/motion/tokens";
import { AnnotatedText, type Annotation } from "@/components/viz/annotated-text";
import { categoryTone } from "@/components/viz/palette";
import type { ObservationCategory } from "@/lib/domain/types";

const TEXT = "My knee ached more last night after physio, about a 7 out of 10. I only slept four hours. Should I keep icing it?";

const ANNOTATIONS: Annotation[] = [
  { id: "a1", quote: "My knee ached more last night after physio, about a 7 out of 10", category: "symptom", label: "Knee discomfort 7/10" },
  { id: "a2", quote: "only slept four hours", category: "sleep", label: "Sleep 4 h" },
  { id: "a3", quote: "Should I keep icing it?", category: "question", label: "Question for care team" },
];

const CHIPS: { id: string; category: ObservationCategory; text: string }[] = [
  { id: "a1", category: "symptom", text: "Knee discomfort 7/10 · self-reported" },
  { id: "a2", category: "sleep", text: "Sleep 4 h" },
  { id: "a3", category: "question", text: "Question for care team" },
];

/**
 * Signature card: patient sentence types in, verbatim highlights appear, observation chips stagger out,
 * ending with an "AI DRAFT · UNVERIFIED" pill and a decorative approve pill. Final state for reduced motion.
 */
export function HeroDemoCard() {
  const reduce = useReducedMotion();
  const typedRef = useRef<HTMLSpanElement>(null);
  const [phase, setPhase] = useState(0); // 0 typing, 1 highlights, 2 chips, 3 draft pill + approve
  const [final, setFinal] = useState(false);

  useEffect(() => {
    if (reduce || navigator.webdriver) {
      const t = setTimeout(() => {
        setFinal(true);
        setPhase(3);
      }, 0);
      return () => clearTimeout(t);
    }
    const timers: ReturnType<typeof setTimeout>[] = [];
    const typing = animate(0, TEXT.length, {
      duration: 3.2,
      delay: 0.7,
      ease: "linear",
      onUpdate: (v) => {
        if (typedRef.current) typedRef.current.textContent = TEXT.slice(0, Math.round(v));
      },
      onComplete: () => {
        timers.push(setTimeout(() => setPhase(1), 250));
        timers.push(setTimeout(() => setPhase(2), 1000));
        timers.push(setTimeout(() => setPhase(3), 2300));
      },
    });
    return () => {
      typing.stop();
      timers.forEach(clearTimeout);
    };
  }, [reduce]);

  const showMarks = phase >= 1;

  return (
    <figure className="w-full overflow-hidden rounded-[24px] ring-1 ring-ink-3">
      <figcaption className="sr-only">Illustration with fictional data: a patient sentence is structured into observations.</figcaption>
      {/* Patient words on paper */}
      <div className="bg-paper-2 p-5 text-ink">
        <div className="flex items-center justify-between gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-cobalt px-2.5 py-1 text-white">
            <Mic className="size-3" strokeWidth={1.5} aria-hidden />
            <span className="eyebrow text-[10px]">Voice</span>
          </span>
          <span className="eyebrow text-[10px] text-muted-foreground">Patient · own words</span>
        </div>
        <div className="font-display mt-4 grid text-[22px] leading-[1.4] italic">
          <p aria-hidden className="invisible col-start-1 row-start-1">{TEXT}</p>
          <div className="col-start-1 row-start-1">
            {showMarks || final ? (
              <AnnotatedText text={TEXT} annotations={ANNOTATIONS} />
            ) : (
              <p>
                <span ref={typedRef} />
                <span className="ml-0.5 inline-block h-[0.9em] w-[2px] translate-y-[0.12em] animate-pulse bg-ink" aria-hidden />
              </p>
            )}
          </div>
        </div>
      </div>
      {/* AI draft on ink */}
      <div className="bg-ink-2 p-5 text-paper">
        <p className="eyebrow text-[10px] text-muted-ink">Structured from the quotes above</p>
        <ul className="mt-3 flex min-h-[92px] flex-wrap content-start gap-2">
          {CHIPS.map((c, i) => {
            const tone = categoryTone(c.category);
            return (
              <motion.li
                key={c.id}
                initial={false}
                animate={phase >= 2 ? { opacity: 1, y: 0, scale: 1 } : { opacity: 0, y: 14, scale: 0.96 }}
                transition={{ duration: phase >= 2 && !final ? DUR.base : 0, ease: EASE_OUT, delay: final ? 0 : i * 0.12 }}
                className="inline-flex items-center gap-2 rounded-full border border-ink-3 bg-ink py-1.5 pr-3 pl-2.5 text-[13px]"
              >
                <span className="size-2 rounded-full" style={{ background: tone.onInk }} aria-hidden />
                {c.text}
              </motion.li>
            );
          })}
        </ul>
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-ink-3 pt-4">
          <motion.span
            initial={false}
            animate={{ opacity: phase >= 3 ? 1 : 0 }}
            transition={{ duration: final ? 0 : DUR.base }}
            className="eyebrow inline-flex items-center gap-1.5 rounded-full border border-ink-3 bg-ink px-2.5 py-1 text-[10px] text-paper"
          >
            <span className="size-1.5 rounded-full bg-lime" aria-hidden />
            AI DRAFT · UNVERIFIED
          </motion.span>
          <motion.span
            aria-hidden
            initial={false}
            animate={phase >= 3 ? { opacity: 1, scale: 1 } : { opacity: 0, scale: 0.9 }}
            transition={{ duration: final ? 0 : DUR.base, delay: final ? 0 : 0.25, ease: EASE_OUT }}
            className="inline-flex items-center gap-1.5 rounded-full bg-lime px-3.5 py-1.5 text-[13px] font-medium text-ink"
          >
            <Check className="size-3.5" strokeWidth={2} />
            Approve &amp; share
          </motion.span>
        </div>
      </div>
    </figure>
  );
}

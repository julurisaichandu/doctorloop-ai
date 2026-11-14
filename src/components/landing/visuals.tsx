"use client";

import { useEffect, useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import { Check, Lock, Share2 } from "lucide-react";
import { SPRING } from "@/components/motion/tokens";
import { AnnotatedText, type Annotation } from "@/components/viz/annotated-text";
import { cn } from "@/lib/utils";

/** False on the server, on first paint and with reduced motion, so SSR and hydration always agree. */
export function useStatic() {
  const reduce = useReducedMotion();
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setMounted(true), 0);
    return () => clearTimeout(t);
  }, []);
  return !mounted || !!reduce;
}

/* ---------- Voice waveform ---------- */
const BARS = [0.3, 0.55, 0.4, 0.8, 0.5, 0.95, 0.6, 0.35, 0.7, 1, 0.65, 0.4, 0.85, 0.5, 0.3, 0.75, 0.9, 0.45, 0.6, 0.35, 0.7, 0.5, 0.8, 0.4];

export function VoiceWave({ className }: { className?: string }) {
  const reduce = useStatic();
  return (
    <div className={cn("flex h-24 items-center justify-center gap-[5px]", className)} aria-hidden>
      {BARS.map((h, i) => (
        <motion.span
          key={i}
          className="h-full w-[5px] origin-center rounded-full bg-lime"
          initial={false}
          animate={reduce ? { scaleY: h } : { scaleY: [h, Math.max(0.15, 1 - h * 0.8), h] }}
          transition={
            reduce ? { duration: 0 } : { duration: 1.4 + (i % 5) * 0.18, repeat: Infinity, ease: "easeInOut", delay: i * 0.05 }
          }
        />
      ))}
    </div>
  );
}

/* ---------- Annotated sentence ---------- */
const SENTENCE = "The stairs were rough today, my right knee hurt about a 6. I walked for twenty minutes anyway.";
const SENTENCE_ANN: Annotation[] = [
  { id: "s1", quote: "my right knee hurt about a 6", category: "symptom", label: "Knee discomfort 6/10" },
  { id: "s2", quote: "walked for twenty minutes", category: "activity", label: "Walking 20 min" },
];

export function AnnotatedSentence({ className }: { className?: string }) {
  return (
    <div className={className}>
      <AnnotatedText
        text={SENTENCE}
        annotations={SENTENCE_ANN}
        className="font-display text-[22px] leading-[1.45] italic sm:text-2xl"
      />
      <ul className="mt-4 flex flex-wrap gap-2">
        {[
          ["bg-vermilion", "Symptom · knee 6/10 · self-reported"],
          ["bg-lime-deep", "Activity · walking 20 min"],
        ].map(([dot, t]) => (
          <li
            key={t}
            className="inline-flex items-center gap-2 rounded-full border border-hairline bg-paper-2 px-3 py-1 text-[13px] text-ink"
          >
            <span className={cn("size-2 rounded-full", dot)} aria-hidden />
            {t}
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ---------- Private <-> shared switch ---------- */
export function ShareSwitch({ on, tone = "ink" }: { on: boolean; tone?: "ink" | "paper" }) {
  return (
    <span
      className={cn(
        "relative inline-flex h-7 w-[52px] shrink-0 items-center rounded-full border px-[3px] transition-colors duration-300",
        on ? "border-lime bg-lime" : tone === "ink" ? "border-ink-3 bg-ink" : "border-ink/30 bg-paper-3",
      )}
      aria-hidden
    >
      <motion.span
        className={cn(
          "flex size-5 items-center justify-center rounded-full",
          on ? "bg-ink text-lime" : tone === "ink" ? "bg-muted-ink text-ink" : "bg-ink text-paper",
        )}
        initial={false}
        animate={{ x: on ? 24 : 0 }}
        transition={SPRING}
      >
        {on ? <Check className="size-3" strokeWidth={2.5} /> : <Lock className="size-3" strokeWidth={2} />}
      </motion.span>
    </span>
  );
}

/** Flips on a slow interval; holds its final "shared" state with reduced motion / automation. */
export function useLoopingFlag(period = 2600) {
  const reduce = useReducedMotion();
  const [on, setOn] = useState(true);
  useEffect(() => {
    if (reduce || navigator.webdriver) return;
    const id = setInterval(() => setOn((v) => !v), period);
    return () => clearInterval(id);
  }, [reduce, period]);
  return on;
}

const REVIEW_ROWS = [
  { text: "Knee discomfort 6/10", meta: "Symptom · self-reported" },
  { text: "Walked 20 minutes", meta: "Activity" },
  { text: "Sleep 5 h", meta: "Sleep" },
];

export function ApproveToggles({ className }: { className?: string }) {
  const flag = useLoopingFlag(2400);
  return (
    <div className={cn("rounded-[24px] bg-ink p-5 text-paper ring-1 ring-ink-3", className)}>
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <span className="eyebrow text-muted-ink">Your review</span>
        <span className="eyebrow text-lime">Nothing shared until you approve</span>
      </div>
      <ul className="mt-4 divide-y divide-ink-3">
        {REVIEW_ROWS.map((r, i) => {
          const on = i === 0 ? flag : i === 1;
          return (
            <li key={r.text} className="flex items-center justify-between gap-4 py-3.5">
              <div className="min-w-0">
                <p className="truncate text-[15px]">{r.text}</p>
                <p className="eyebrow mt-0.5 text-[10px] text-muted-ink">{r.meta}</p>
              </div>
              <div className="flex items-center gap-3">
                <span className="eyebrow hidden w-[68px] text-right text-[10px] text-muted-ink sm:block">
                  {on ? "Shared" : "Private"}
                </span>
                <ShareSwitch on={on} />
              </div>
            </li>
          );
        })}
      </ul>
      <p className="mt-3 flex items-center gap-2 text-[13px] text-muted-ink">
        <Share2 className="size-3.5 shrink-0" strokeWidth={1.5} aria-hidden />
        You choose, item by item. Change your mind any time.
      </p>
    </div>
  );
}

/* ---------- Doctor report with citations ---------- */
export function CitationChip({ n }: { n: number }) {
  return (
    <sup className="mx-0.5 inline-flex size-[18px] -translate-y-px items-center justify-center rounded-full bg-lime align-baseline font-mono text-[10px] font-semibold text-ink">
      {n}
    </sup>
  );
}

export function DoctorReport({ className, compact = false }: { className?: string; compact?: boolean }) {
  return (
    <div className={cn("rounded-[24px] bg-ink p-5 text-paper ring-1 ring-ink-3", className)}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="eyebrow inline-flex items-center gap-1.5 text-muted-ink">
          <span className="size-1.5 rounded-full bg-lime" aria-hidden />
          Pre-visit summary
        </span>
        <span className="eyebrow rounded-full border border-ink-3 px-2 py-0.5 text-[10px]">AI DRAFT · UNVERIFIED</span>
      </div>
      <p className="font-display mt-4 text-[22px] leading-[1.35] sm:text-2xl">
        Knee discomfort was reported at 6 out of 10 after physio
        <CitationChip n={1} /> with short sleep
        <CitationChip n={2} /> and a question about icing
        <CitationChip n={3} />.
      </p>
      {compact ? null : (
        <ol className="mt-5 space-y-2 border-t border-ink-3 pt-4 text-[13px] text-muted-ink">
          <li>
            <span className="font-mono text-lime">1</span> &nbsp;“my right knee hurt about a 6” · Nov 9, voice
          </li>
          <li>
            <span className="font-mono text-lime">2</span> &nbsp;“I only slept four hours” · Nov 10, note
          </li>
          <li>
            <span className="font-mono text-lime">3</span> &nbsp;“Should I keep icing it?” · Nov 10, note
          </li>
        </ol>
      )}
    </div>
  );
}

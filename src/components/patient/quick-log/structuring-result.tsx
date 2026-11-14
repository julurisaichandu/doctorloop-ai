"use client";

import { format } from "date-fns";
import { Lock } from "lucide-react";
import { motion, useReducedMotion, type Variants } from "motion/react";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { DUR, EASE_OUT, STAGGER } from "@/components/motion/tokens";
import { AiGeneratedLabel } from "@/components/shared/ai-generated-label";
import { isBandReplay, SourceBadge } from "@/components/shared/source-badge";
import { PrivacyReceipt } from "@/components/shared/privacy-receipt";
import {
  AnnotatedText,
  type Annotation,
} from "@/components/viz/annotated-text";
import { categoryTone, STATUS_TONES } from "@/components/viz/palette";
import type { Observation, TimelineEntryView } from "@/lib/domain/types";
import { cn } from "@/lib/utils";

const chipVariants: Variants = {
  hidden: { opacity: 0, y: 14, scale: 0.97 },
  shown: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: { duration: DUR.base, ease: EASE_OUT },
  },
};

/** Observation chips on an ink surface: category color, big mono value, explicit "self-reported". */
export function ObservationChips({
  observations,
  activeId,
  onActiveChange,
  delay = 0,
}: {
  observations: Observation[];
  activeId?: string | null;
  onActiveChange?: (id: string | null) => void;
  delay?: number;
}) {
  return (
    <motion.ul
      className="flex flex-wrap gap-2.5"
      initial="hidden"
      animate="shown"
      variants={{
        hidden: {},
        shown: {
          transition: { staggerChildren: STAGGER * 1.6, delayChildren: delay },
        },
      }}
    >
      {observations.map((o) => {
        const tone = categoryTone(o.category);
        const active = activeId === o.id;
        return (
          <motion.li
            key={o.id}
            variants={chipVariants}
            tabIndex={0}
            data-observation-id={o.id}
            onMouseEnter={() => onActiveChange?.(o.id)}
            onMouseLeave={() => onActiveChange?.(null)}
            onFocus={() => onActiveChange?.(o.id)}
            onBlur={() => onActiveChange?.(null)}
            className={cn(
              "relative flex min-w-0 max-w-full items-center gap-3 rounded-2xl border bg-ink-2 py-2.5 pr-4 pl-5 transition-colors duration-150",
              active ? "border-paper/70" : "border-ink-3",
            )}
          >
            <span
              aria-hidden
              className="absolute top-2.5 bottom-2.5 left-2 w-1 rounded-full"
              style={{ backgroundColor: tone.onInk }}
            />
            <div className="min-w-0">
              <p
                className="eyebrow flex flex-wrap gap-x-1.5 text-[10px]"
                style={{ color: tone.onInk }}
              >
                <span>{o.category}</span>
                {o.bodySite ? (
                  <span className="text-muted-ink">· {o.bodySite}</span>
                ) : null}
                {o.timeDescription ? (
                  <span className="text-muted-ink">· {o.timeDescription}</span>
                ) : null}
              </p>
              <p className="mt-0.5 text-sm text-paper">{o.label}</p>
            </div>
            {o.severity != null ? (
              <span className="font-mono whitespace-nowrap">
                <span className="text-2xl leading-none font-medium text-lime">
                  {o.severity}/10
                </span>
                <span className="text-[11px] text-muted-ink">
                  {" "}
                  (self-reported)
                </span>
              </span>
            ) : null}
            {o.measureValue != null ? (
              <span className="font-mono text-xl leading-none font-medium whitespace-nowrap text-lime">
                {o.measureValue}
                {o.measureUnit ? ` ${o.measureUnit}` : ""}
              </span>
            ) : null}
          </motion.li>
        );
      })}
    </motion.ul>
  );
}

/** Reveals annotations one at a time so highlights visibly land on the patient's words. */
export function useStaggeredAnnotations(
  observations: Observation[],
  startMs = 500,
  stepMs = 380,
): Annotation[] {
  const reduce = useReducedMotion();
  const all = useMemo<Annotation[]>(
    () =>
      observations
        .filter((o) => o.patientQuote)
        .map((o) => ({
          id: o.id,
          quote: o.patientQuote,
          category: o.category,
          label: o.label,
        })),
    [observations],
  );
  const [count, setCount] = useState(0);

  useEffect(() => {
    let interval: ReturnType<typeof setInterval> | undefined;
    const start = setTimeout(
      () => {
        if (reduce) {
          setCount(all.length);
          return;
        }
        interval = setInterval(() => {
          setCount((c) => {
            if (c + 1 >= all.length && interval) clearInterval(interval);
            return Math.min(c + 1, all.length);
          });
        }, stepMs);
      },
      reduce ? 0 : startMs,
    );
    return () => {
      clearTimeout(start);
      if (interval) clearInterval(interval);
    };
  }, [all, reduce, startMs, stepMs]);

  return useMemo(() => all.slice(0, count), [all, count]);
}

/** Words with animated highlights, then the structured chips on an ink card. Used by every capture flow. */
export function StructuredEntry({
  item,
  chipsDelay = 0.6,
  headingLevel: Heading = "h3",
}: {
  item: TimelineEntryView;
  chipsDelay?: number;
  headingLevel?: "h2" | "h3" | "h4";
}) {
  const { entry, observations, sourceRef } = item;
  const [activeId, setActiveId] = useState<string | null>(null);
  const annotations = useStaggeredAnnotations(observations);
  const provider = observations[0]?.extractedBy;

  return (
    <div className="space-y-3">
      <div className="rounded-[28px] border border-hairline bg-paper-2 p-5 sm:p-7">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="eyebrow text-muted-foreground">
            {entry.source === "vexo"
              ? `Memory excerpt · ${format(new Date(entry.occurredAt), "MMM d, h:mm a")}`
              : "Your words"}
          </p>
          <SourceBadge source={entry.source} mode={sourceRef?.mode ?? null} replay={isBandReplay(sourceRef)} />
        </div>
        <AnnotatedText
          text={entry.body}
          annotations={annotations}
          activeId={activeId}
          onActiveChange={setActiveId}
          className="font-display mt-3 text-[1.375rem] leading-[1.5] text-ink italic sm:text-[1.625rem] [&_mark]:animate-in [&_mark]:fade-in [&_mark]:duration-500"
        />
        <PrivacyReceipt receipt={item.privacyFilter} audience="patient" />
      </div>

      <div className="grain relative overflow-hidden rounded-[28px] bg-ink p-5 text-paper sm:p-7">
        <div className="relative z-10">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Heading className="eyebrow text-muted-ink">
              {observations.length === 1
                ? "1 detail found"
                : `${observations.length} details found`}
            </Heading>
            <AiGeneratedLabel
              provider={provider}
              className="border-ink-3 bg-ink-2"
            />
          </div>
          {observations.length === 0 ? (
            <p className="mt-4 text-sm text-muted-ink">
              No structured details were extracted. Your words were saved and
              you can edit them in review.
            </p>
          ) : (
            <div className="mt-4">
              <ObservationChips
                observations={observations}
                activeId={activeId}
                onActiveChange={setActiveId}
                delay={chipsDelay}
              />
            </div>
          )}
          <p className="mt-5 flex items-center gap-2 border-t border-ink-3 pt-4 text-xs text-muted-ink">
            <Lock className="size-3.5 shrink-0" aria-hidden />
            AI drafts can be wrong. Nothing is shared with your care team until
            you review and approve it.
          </p>
        </div>
      </div>
    </div>
  );
}

/** "Saved" header: a drawn check, serif title and the pending-review status pill. */
export function SavedHeader({
  title,
  description,
  status = "pending_review",
}: {
  title: string;
  description?: ReactNode;
  status?: keyof typeof STATUS_TONES;
}) {
  const tone = STATUS_TONES[status];
  const reduce = useReducedMotion();
  return (
    <div className="flex items-start">
      <div className="flex min-w-0 items-start gap-4">
        <span
          className="flex size-11 shrink-0 items-center justify-center rounded-full bg-lime text-ink"
          aria-hidden
        >
          <svg
            viewBox="0 0 24 24"
            className="size-5"
            fill="none"
            stroke="currentColor"
            strokeWidth={2.2}
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <motion.path
              d="M5 12.5l4.5 4.5L19 7.5"
              initial={reduce ? false : { pathLength: 0 }}
              animate={{ pathLength: 1 }}
              transition={{
                duration: DUR.base + 0.2,
                ease: EASE_OUT,
                delay: 0.1,
              }}
            />
          </svg>
        </span>
        <div className="min-w-0">
          <p className="font-display text-3xl leading-[1.1] sm:text-4xl">
            {title}
          </p>
          {description ? (
            <p className="mt-1.5 max-w-xl text-sm text-muted-foreground">
              {description}
            </p>
          ) : null}
          <span
            className={cn(
              "eyebrow inline-flex h-6 items-center gap-1.5 rounded-full border px-2.5 whitespace-nowrap",
              tone.className,
            )}
          >
            <tone.Icon className="size-3" aria-hidden />
            {tone.label}
          </span>
        </div>
      </div>
    </div>
  );
}

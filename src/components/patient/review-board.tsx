"use client";

import { useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Check, CheckCheck, Lock } from "lucide-react";
import { DUR, EASE_OUT, SPRING } from "@/components/motion/tokens";
import { EmptyState } from "@/components/shared/empty-state";
import { EntryCard } from "@/components/shared/entry-card";
import { Button } from "@/components/ui/button";
import type { TimelineEntryView } from "@/lib/domain/types";
import { ReviewPanel } from "./review-panel";
import { ShareEntryButton, StopSharingButton } from "./sharing-buttons";

function SectionHead({ title, note }: { title: string; note?: string }) {
  return (
    <div className="mb-5 border-b border-hairline pb-3">
      <h2 className="font-display text-3xl leading-tight sm:text-[34px]">{title}</h2>
      {note ? <p className="mt-1 text-sm text-muted-foreground">{note}</p> : null}
    </div>
  );
}

/** Lime check burst that plays over a card the moment its approval lands. */
function CheckBurst() {
  return (
    <motion.div
      aria-hidden
      className="pointer-events-none absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 rounded-[20px] bg-paper-2/90"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: DUR.micro }}
    >
      <span className="relative flex size-20 items-center justify-center">
        <motion.span
          className="absolute inset-0 rounded-full bg-lime"
          initial={{ scale: 0.4, opacity: 0.9 }}
          animate={{ scale: 1.9, opacity: 0 }}
          transition={{ duration: 0.9, ease: EASE_OUT }}
        />
        <motion.span
          className="absolute inset-0 flex items-center justify-center rounded-full bg-lime text-ink"
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={SPRING}
        >
          <Check className="size-9" strokeWidth={2.25} />
        </motion.span>
      </span>
      <span className="eyebrow text-ink">Shared with your care team</span>
    </motion.div>
  );
}

/** A soft lime ring that pulses once around a card that just landed in the decided list. */
function LandingPulse() {
  return (
    <motion.span
      aria-hidden
      className="pointer-events-none absolute -inset-px rounded-[21px] border-2 border-lime"
      initial={{ opacity: 1 }}
      animate={{ opacity: 0 }}
      transition={{ duration: 1.4, ease: EASE_OUT, delay: 0.25 }}
    />
  );
}

export function ReviewBoard({ pending, decided }: { pending: TimelineEntryView[]; decided: TimelineEntryView[] }) {
  const reduce = useReducedMotion();
  const [burstId, setBurstId] = useState<string | null>(null);
  // Entries already decided on first paint do not get the landing animation.
  const [initialDecided] = useState(() => new Set(decided.map((d) => d.entry.id)));

  const count = pending.length;
  const barText = count === 0 ? "Nothing waiting" : `${count} ${count === 1 ? "update" : "updates"} waiting`;

  const exit = reduce
    ? { opacity: 0, transition: { duration: 0.15 } }
    : { opacity: 0, scale: 0.97, transition: { duration: 0.35, ease: EASE_OUT } };

  return (
    <div className="space-y-12">
      <div className="sticky top-16 z-10">
        <div role="status" className="flex items-center gap-3 rounded-full bg-ink px-3 py-2 text-paper sm:px-4">
          <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-lime text-ink">
            <Lock className="size-3.5" strokeWidth={2} aria-hidden />
          </span>
          <p className="min-w-0 text-sm leading-snug">
            <span className="font-medium tabular-nums">{barText}</span>
            <span className="text-muted-ink"> · nothing is shared until you approve</span>
          </p>
        </div>
      </div>

      <section aria-label="Waiting for you">
        <SectionHead
          title="Waiting for you"
          note={count > 0 ? "Read it, fix what is off, then decide. Your words are the source of truth." : undefined}
        />
        {count === 0 ? (
          <EmptyState
            icon={CheckCheck}
            title="All caught up"
            description="No updates are waiting for your review."
            action={
              <Button asChild variant="outline" className="rounded-full">
                <Link href="/patient/check-in">Add an update</Link>
              </Button>
            }
          />
        ) : (
          <div className="space-y-5">
            <AnimatePresence mode="popLayout" initial={false}>
              {pending.map((item) => (
                <motion.div
                  key={item.entry.id}
                  layout={reduce ? false : "position"}
                  exit={exit}
                  transition={SPRING}
                  className="relative"
                >
                  <EntryCard
                    item={item}
                    id={`entry-${item.entry.id}`}
                    footer={<ReviewPanel item={item} onApproved={() => setBurstId(item.entry.id)} />}
                  />
                  {burstId === item.entry.id && !reduce ? <CheckBurst /> : null}
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        )}
      </section>

      <section aria-label="Recently decided">
        <SectionHead title="Recently decided" note="Change your mind any time. Sharing can be switched on or off." />
        {decided.length === 0 ? (
          <EmptyState title="Nothing decided yet" description="Updates you approve or keep private will appear here." />
        ) : (
          <div className="space-y-5">
            {decided.map((item) => {
              const isNew = !initialDecided.has(item.entry.id) && !reduce;
              return (
                <motion.div
                  key={item.entry.id}
                  layout={reduce ? false : "position"}
                  initial={isNew ? { opacity: 0, y: -16 } : false}
                  animate={{ opacity: 1, y: 0 }}
                  transition={isNew ? { ...SPRING, delay: 0.15 } : SPRING}
                  className="relative"
                >
                  <EntryCard
                    item={item}
                    id={`entry-${item.entry.id}`}
                    actions={
                      item.entry.reviewStatus === "approved" ? (
                        <StopSharingButton entryId={item.entry.id} />
                      ) : (
                        <ShareEntryButton entryId={item.entry.id} />
                      )
                    }
                  />
                  {isNew && item.entry.reviewStatus === "approved" ? <LandingPulse /> : null}
                </motion.div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}

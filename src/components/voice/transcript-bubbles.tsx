"use client";

import { Check } from "lucide-react";
import { motion } from "motion/react";
import { useEffect, useRef } from "react";
import { DUR, EASE_OUT } from "@/components/motion/tokens";
import type { TranscriptTurn } from "@/lib/domain/types";
import { cn } from "@/lib/utils";

/**
 * Transcript: the patient's words are serif italic on paper (right), the assistant's are a mono label
 * plus sans on paper-3 (left), so human and machine are visibly different.
 */
export function TranscriptBubbles({ turns, className }: { turns: TranscriptTurn[]; className?: string }) {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [turns.length]);

  return (
    <div
      ref={scrollRef}
      className={cn(
        "flex max-h-[22rem] min-h-32 flex-col gap-3 overflow-y-auto rounded-[28px] border border-hairline bg-paper-2 p-4 sm:p-5",
        className,
      )}
      role="log"
      aria-live="polite"
      aria-label="Check-in transcript"
    >
      {turns.length === 0 ? (
        <p className="eyebrow m-auto text-muted-foreground">The conversation will appear here</p>
      ) : (
        turns.map((turn, index) => {
          const patient = turn.role === "patient";
          return (
            <motion.div
              key={`${index}-${turn.at ?? ""}`}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: DUR.base, ease: EASE_OUT }}
              className={cn("flex", patient ? "justify-end" : "justify-start")}
            >
              {patient ? (
                <div className="max-w-[88%] rounded-[20px] rounded-br-md border border-ink bg-paper px-4 py-3 sm:max-w-[80%]">
                  <span className="eyebrow mb-1 block text-[10px] text-muted-foreground">You</span>
                  <p className="font-display text-xl leading-[1.35] text-ink italic">{turn.text}</p>
                </div>
              ) : (
                <div className="max-w-[88%] rounded-[20px] rounded-bl-md bg-paper-3 px-4 py-3 sm:max-w-[80%]">
                  <span className="eyebrow mb-1 flex items-center gap-1.5 text-[10px] text-muted-foreground">
                    <span className="size-1.5 rounded-full bg-ink" aria-hidden />
                    Assistant
                  </span>
                  <p className="text-[15px] leading-relaxed text-ink">{turn.text}</p>
                </div>
              )}
            </motion.div>
          );
        })
      )}
    </div>
  );
}

/** Notes the patient confirmed during the call (via the record_health_note client tool). */
export function ConfirmedNoteChips({ notes }: { notes: string[] }) {
  if (notes.length === 0) return null;
  return (
    <div className="space-y-2">
      <p className="eyebrow text-muted-foreground">Confirmed notes</p>
      <ul className="flex flex-wrap gap-2">
        {notes.map((note, index) => (
          <motion.li
            key={`${index}-${note}`}
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: DUR.base, ease: EASE_OUT }}
            className="inline-flex max-w-full items-center gap-1.5 rounded-full bg-lime py-1.5 pr-3.5 pl-2.5 text-sm text-ink"
          >
            <Check className="size-3.5 shrink-0" strokeWidth={2} aria-hidden />
            <span className="min-w-0">{note}</span>
          </motion.li>
        ))}
      </ul>
    </div>
  );
}

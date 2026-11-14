"use client";

import { Fragment, type Ref } from "react";
import { motion } from "motion/react";
import { cn } from "@/lib/utils";
import { DUR, EASE_OUT, STAGGER } from "./tokens";
import { useRevealGate } from "./use-reveal-gate";

type Tag = "h1" | "h2" | "h3" | "p" | "div" | "span";

/** Splits "Between visits, *nothing gets lost.*" into words; `*...*` segments render italic serif. */
function parse(text: string): { word: string; italic: boolean }[] {
  const out: { word: string; italic: boolean }[] = [];
  let italic = false;
  for (const part of text.split("*")) {
    for (const word of part.split(/\s+/).filter(Boolean)) out.push({ word, italic });
    italic = !italic;
  }
  return out;
}

/** Per-word mask reveal headline. Plain text is always available to assistive tech. */
export function SplitText({ text, className, as = "h2" }: { text: string; className?: string; as?: Tag }) {
  const { ref, hidden } = useRevealGate<HTMLElement>("-5%");
  const Comp = motion[as] as typeof motion.h2;
  const words = parse(text);
  const plain = words.map((w) => w.word).join(" ");

  return (
    <Comp
      ref={ref as Ref<HTMLHeadingElement>}
      className={cn("font-display text-balance", className)}
      initial={false}
      animate={hidden ? "hidden" : "shown"}
      variants={{
        hidden: { transition: { duration: 0 } },
        shown: { transition: { staggerChildren: STAGGER } },
      }}
    >
      <span className="sr-only">{plain}</span>
      <span aria-hidden>
        {words.map((w, i) => (
          <Fragment key={`${i}-${w.word}`}>
            <span className="-mb-[0.14em] inline-block overflow-hidden pb-[0.14em] align-bottom">
              <motion.span
                className={cn("inline-block", w.italic && "italic")}
                variants={{
                  hidden: { y: "110%", transition: { duration: 0 } },
                  shown: { y: "0%", transition: { duration: DUR.reveal, ease: EASE_OUT } },
                }}
              >
                {w.word}
              </motion.span>
            </span>
            {i < words.length - 1 ? " " : null}
          </Fragment>
        ))}
      </span>
    </Comp>
  );
}

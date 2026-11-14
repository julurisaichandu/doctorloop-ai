"use client";

import type { ReactNode, Ref } from "react";
import { motion } from "motion/react";
import { DUR, EASE_OUT } from "./tokens";
import { useRevealGate } from "./use-reveal-gate";

type Tag = "div" | "section" | "article" | "header" | "li" | "p" | "span" | "ul" | "ol" | "aside" | "figure";

/** Scroll reveal: opacity 0 to 1, y 24 to 0, once, margin -10%. */
export function Reveal({
  children,
  delay = 0,
  y = 24,
  className,
  as = "div",
}: {
  children: ReactNode;
  delay?: number;
  y?: number;
  className?: string;
  as?: Tag;
}) {
  const { ref, hidden } = useRevealGate<HTMLElement>();
  const Comp = motion[as] as typeof motion.div;
  return (
    <Comp
      ref={ref as Ref<HTMLDivElement>}
      className={className}
      initial={false}
      animate={hidden ? { opacity: 0, y } : { opacity: 1, y: 0 }}
      transition={hidden ? { duration: 0 } : { duration: DUR.reveal, ease: EASE_OUT, delay }}
    >
      {children}
    </Comp>
  );
}

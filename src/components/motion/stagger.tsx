"use client";

import type { ReactNode } from "react";
import { motion, type Variants } from "motion/react";
import { DUR, EASE_OUT, STAGGER } from "./tokens";
import { useRevealGate } from "./use-reveal-gate";

const itemVariants: Variants = {
  hidden: { opacity: 0, y: 16, transition: { duration: 0 } },
  shown: { opacity: 1, y: 0, transition: { duration: DUR.base, ease: EASE_OUT } },
};

/** Container that staggers its `StaggerItem` children when scrolled into view. */
export function Stagger({
  children,
  className,
  delay = 0,
}: {
  children: ReactNode;
  className?: string;
  delay?: number;
}) {
  const { ref, hidden } = useRevealGate<HTMLDivElement>();
  return (
    <motion.div
      ref={ref}
      className={className}
      initial={false}
      animate={hidden ? "hidden" : "shown"}
      variants={{
        hidden: { transition: { duration: 0 } },
        shown: { transition: { staggerChildren: STAGGER, delayChildren: delay } },
      }}
    >
      {children}
    </motion.div>
  );
}

export function StaggerItem({
  children,
  className,
  as = "div",
}: {
  children: ReactNode;
  className?: string;
  as?: "div" | "li" | "article" | "section";
}) {
  const Comp = motion[as] as typeof motion.div;
  return (
    <Comp className={className} variants={itemVariants}>
      {children}
    </Comp>
  );
}

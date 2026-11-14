"use client";

import { motion } from "motion/react";
import { DUR, EASE_OUT } from "./tokens";
import { useRevealGate } from "./use-reveal-gate";

/** SVG path that draws itself in (pathLength 0 to 1). Render inside an `<svg>`; stroke via className. */
export function DrawPath({
  d,
  className,
  strokeWidth = 2,
  delay = 0,
}: {
  d: string;
  className?: string;
  strokeWidth?: number;
  delay?: number;
}) {
  const { ref, hidden } = useRevealGate<SVGPathElement>();
  return (
    <motion.path
      ref={ref}
      d={d}
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      initial={false}
      animate={{ pathLength: hidden ? 0 : 1 }}
      transition={hidden ? { duration: 0 } : { duration: DUR.draw, ease: EASE_OUT, delay }}
    />
  );
}

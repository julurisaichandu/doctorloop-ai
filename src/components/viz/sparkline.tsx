"use client";

import type { Ref } from "react";
import { motion } from "motion/react";
import { DUR, EASE_OUT } from "@/components/motion/tokens";
import { useRevealGate } from "@/components/motion/use-reveal-gate";

/** Tiny trend line with an end dot; draws in. Color is any CSS color. */
export function Sparkline({
  values,
  color = "var(--ink)",
  width = 96,
  height = 32,
  ariaLabel,
}: {
  values: number[];
  color?: string;
  width?: number;
  height?: number;
  ariaLabel: string;
}) {
  const { ref, hidden } = useRevealGate<SVGSVGElement>();
  const pad = 4;
  const clean = values.filter((n) => Number.isFinite(n));
  if (clean.length === 0) return null;
  const min = Math.min(...clean);
  const max = Math.max(...clean);
  const span = max - min || 1;
  const x = (i: number) => (clean.length === 1 ? width / 2 : pad + (i * (width - pad * 2)) / (clean.length - 1));
  const y = (v: number) => (max === min ? height / 2 : height - pad - ((v - min) / span) * (height - pad * 2));
  const d = clean.map((v, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(2)} ${y(v).toFixed(2)}`).join(" ");
  const last = clean.length - 1;

  return (
    <svg
      ref={ref as Ref<SVGSVGElement>}
      role="img"
      aria-label={ariaLabel}
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className="shrink-0 overflow-visible"
    >
      {clean.length > 1 ? (
        <motion.path
          d={d}
          fill="none"
          stroke={color}
          strokeWidth={1.75}
          strokeLinecap="round"
          strokeLinejoin="round"
          initial={false}
          animate={{ pathLength: hidden ? 0 : 1 }}
          transition={hidden ? { duration: 0 } : { duration: DUR.draw, ease: EASE_OUT }}
        />
      ) : null}
      <motion.circle
        cx={x(last)}
        cy={y(clean[last])}
        r={3}
        fill={color}
        initial={false}
        animate={{ opacity: hidden ? 0 : 1 }}
        transition={hidden ? { duration: 0 } : { duration: DUR.base, delay: DUR.draw * 0.8 }}
      />
    </svg>
  );
}

"use client";

import type { ReactNode, Ref } from "react";
import { motion } from "motion/react";
import { DUR, EASE_OUT } from "@/components/motion/tokens";
import { useRevealGate } from "@/components/motion/use-reveal-gate";

/** Progress ring (0..1) that draws in. Colors are any CSS color, e.g. "var(--lime)". */
export function Ring({
  value,
  size = 96,
  thickness = 8,
  color = "var(--ink)",
  trackColor = "var(--hairline)",
  children,
  ariaLabel,
}: {
  value: number;
  size?: number;
  thickness?: number;
  color?: string;
  trackColor?: string;
  children?: ReactNode;
  ariaLabel: string;
}) {
  const v = Math.min(1, Math.max(0, Number.isFinite(value) ? value : 0));
  const r = (size - thickness) / 2;
  const c = size / 2;
  const { ref, hidden } = useRevealGate<HTMLDivElement>();

  return (
    <div
      ref={ref as Ref<HTMLDivElement>}
      role="img"
      aria-label={ariaLabel}
      className="relative inline-flex shrink-0 items-center justify-center"
      style={{ width: size, height: size }}
    >
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden className="-rotate-90">
        <circle cx={c} cy={c} r={r} fill="none" stroke={trackColor} strokeWidth={thickness} />
        {v > 0 ? (
          <motion.circle
            cx={c}
            cy={c}
            r={r}
            fill="none"
            stroke={color}
            strokeWidth={thickness}
            strokeLinecap="round"
            initial={false}
            animate={{ pathLength: hidden ? 0 : v }}
            transition={hidden ? { duration: 0 } : { duration: DUR.draw, ease: EASE_OUT }}
          />
        ) : null}
      </svg>
      {children ? <div className="absolute inset-0 flex items-center justify-center">{children}</div> : null}
    </div>
  );
}

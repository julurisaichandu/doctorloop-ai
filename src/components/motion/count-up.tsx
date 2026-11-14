"use client";

import { useEffect, useRef } from "react";
import { animate, useInView, useReducedMotion } from "motion/react";
import { DUR, EASE_OUT } from "./tokens";

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/**
 * Decorative count-up. Server-renders (and keeps, for reduced motion) the FINAL value; only
 * animates from 0 after the element enters the viewport. Never use for review counters.
 */
export function CountUp({
  value,
  decimals = 0,
  prefix = "",
  suffix = "",
  className,
}: {
  value: number;
  decimals?: number;
  prefix?: string;
  suffix?: string;
  className?: string;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, margin: "-10%" });
  const reduce = useReducedMotion();

  useEffect(() => {
    const el = ref.current;
    if (!inView || reduce || !el || navigator.webdriver) return;
    const fmt = (n: number) =>
      n.toLocaleString("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
    const final = esc(`${prefix}${fmt(value)}${suffix}`);
    const controls = animate(0, value, {
      duration: DUR.count,
      ease: EASE_OUT,
      onUpdate: (v) => {
        el.innerHTML = esc(`${prefix}${fmt(v)}${suffix}`);
      },
      onComplete: () => {
        el.innerHTML = final;
      },
    });
    return () => {
      controls.stop();
      el.innerHTML = final;
    };
  }, [inView, reduce, value, decimals, prefix, suffix]);

  const text = `${prefix}${value.toLocaleString("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}${suffix}`;
  return (
    <span
      ref={ref}
      className={className}
      style={{ fontVariantNumeric: "tabular-nums" }}
      dangerouslySetInnerHTML={{ __html: esc(text) }}
    />
  );
}

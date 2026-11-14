"use client";

import { Mic } from "lucide-react";
import { animate, motion, useMotionValue, useReducedMotion, useSpring, useTransform, type MotionValue } from "motion/react";
import { useEffect, useRef } from "react";
import { EASE_OUT } from "@/components/motion/tokens";
import { cn } from "@/lib/utils";

export type OrbState = "idle" | "waiting" | "connecting" | "listening" | "speaking" | "thinking";

export interface OrbLevels {
  /** Microphone level 0..1. */
  input: number;
  /** Assistant voice level 0..1. */
  output: number;
}

const RING_SCALES = [1, 0.8, 0.62, 0.46] as const;

function OrbRing({
  level,
  index,
  speaking,
  animated,
}: {
  level: MotionValue<number>;
  index: number;
  speaking: boolean;
  animated: boolean;
}) {
  // Outer rings travel further than inner ones, so the orb "breathes" outward.
  const reach = 0.05 + index * 0.035;
  const scale = useTransform(level, (v) => 1 + v * reach * (RING_SCALES.length - index));
  const size = `${RING_SCALES[index] * 100}%`;
  return (
    <motion.span
      aria-hidden
      className={cn(
        "absolute top-1/2 left-1/2 rounded-full border transition-colors duration-500",
        speaking
          ? ["border-cobalt-soft/90", "border-cobalt-soft/60", "border-cobalt-soft/40", "border-cobalt-soft/25"][index]
          : ["border-lime/70", "border-lime/45", "border-lime/28", "border-lime/16"][index],
      )}
      style={{
        width: size,
        height: size,
        marginLeft: `calc(${RING_SCALES[index] * -50}%)`,
        marginTop: `calc(${RING_SCALES[index] * -50}%)`,
        ...(animated ? { scale } : null),
      }}
    />
  );
}

/**
 * The voice check-in orb: concentric rings around a soft core, on ink.
 * - Live mode: `getLevels` is sampled in requestAnimationFrame into motion values (no React state per frame).
 * - Simulated mode: slow breathing plus a pulse whenever `pulseKey` changes (a message arrived).
 * - Reduced motion: no transforms, a static level meter shows the state instead.
 */
export function VoiceOrb({
  state,
  getLevels,
  pulseKey = 0,
  caption,
  onPress,
  pressLabel,
  size = "lg",
  className,
}: {
  state: OrbState;
  /** Live volume getters. Omit for simulated mode. */
  getLevels?: () => OrbLevels;
  /** Increment to fire a one-off pulse (simulated mode). */
  pulseKey?: number;
  caption: string;
  /** When set, the core is a button (idle "start" state). */
  onPress?: () => void;
  pressLabel?: string;
  size?: "lg" | "sm";
  className?: string;
}) {
  const reduce = useReducedMotion();
  const level = useMotionValue(0);
  const pulse = useMotionValue(0);
  const smooth = useSpring(level, { stiffness: 140, damping: 16, mass: 0.6 });
  const smoothPulse = useSpring(pulse, { stiffness: 120, damping: 14, mass: 0.7 });
  const total = useTransform([smooth, smoothPulse], ([a, b]) => Math.min(1.2, (a as number) + (b as number)));
  const coreScale = useTransform(total, (v) => 1 + v * 0.14);
  const glowOpacity = useTransform(total, (v) => 0.12 + v * 0.5);

  const speaking = state === "speaking";
  const liveSampling = Boolean(getLevels) && (state === "listening" || state === "speaking");
  const getLevelsRef = useRef(getLevels);
  useEffect(() => {
    getLevelsRef.current = getLevels;
  });

  // Live: sample the SDK volume getters every frame into a motion value.
  useEffect(() => {
    if (reduce || !liveSampling) return;
    let raf = 0;
    const tick = () => {
      try {
        const levels = getLevelsRef.current?.();
        if (levels) level.set(Math.min(1, (speaking ? levels.output : levels.input) * 1.7));
      } catch {
        // The conversation may be tearing down; the next frame retries.
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [reduce, liveSampling, speaking, level]);

  // Everything else: gentle breathing.
  useEffect(() => {
    if (reduce || liveSampling) return;
    const fast = state === "connecting" || state === "waiting" || state === "thinking";
    const controls = animate(level, [0.06, fast ? 0.4 : 0.28, 0.06], {
      duration: fast ? 2.2 : 6,
      repeat: Infinity,
      ease: "easeInOut",
    });
    return () => controls.stop();
  }, [reduce, liveSampling, state, level]);

  // Simulated: a pulse each time a message arrives.
  const firstPulse = useRef(true);
  useEffect(() => {
    if (firstPulse.current) {
      firstPulse.current = false;
      return;
    }
    if (reduce) return;
    const controls = animate(pulse, [0.85, 0], { duration: 1.4, ease: EASE_OUT });
    return () => controls.stop();
  }, [pulseKey, reduce, pulse]);

  const lit = state === "speaking" ? 7 : state === "listening" ? 3 : state === "thinking" ? 2 : 0;
  const box = size === "lg" ? "size-[min(72vw,288px)]" : "size-[min(58vw,208px)]";
  const coreBox = size === "lg" ? "size-[34%]" : "size-[38%]";
  const coreClass = cn(
    "absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full transition-colors duration-500",
    coreBox,
    speaking ? "bg-paper" : "bg-lime",
    (state === "connecting" || state === "waiting") && "opacity-70",
  );

  return (
    <div className={cn("flex flex-col items-center gap-5", className)}>
      <div className={cn("relative", box)} data-orb-state={state}>
        <svg viewBox="0 0 100 100" className="absolute inset-0 size-full" aria-hidden>
          <circle cx="50" cy="50" r="49.2" fill="none" stroke="var(--ink-3)" strokeWidth="0.5" strokeDasharray="0.4 2.2" strokeLinecap="round" />
          <circle cx="50" cy="50" r="31" fill="none" stroke="var(--ink-3)" strokeWidth="0.4" strokeDasharray="0.4 2.6" strokeLinecap="round" />
        </svg>
        {RING_SCALES.map((_, i) => (
          <OrbRing key={i} level={total} index={i} speaking={speaking} animated={!reduce} />
        ))}
        {!reduce ? (
          <motion.span
            aria-hidden
            className={cn(
              "absolute top-1/2 left-1/2 size-[34%] -translate-x-1/2 -translate-y-1/2 rounded-full blur-2xl transition-colors duration-500",
              speaking ? "bg-cobalt-soft" : "bg-lime",
            )}
            style={{ opacity: glowOpacity }}
          />
        ) : null}
        <motion.div aria-hidden className={coreClass} style={reduce ? undefined : { scale: coreScale }} />
        {/* The control sits on a static layer above the breathing core so it stays clickable (stable box). */}
        {onPress ? (
          <button
            type="button"
            onClick={onPress}
            aria-label={pressLabel}
            className={cn(
              "group/orb absolute top-1/2 left-1/2 flex -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full text-ink focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-paper",
              coreBox,
            )}
          >
            <Mic className="size-[34%] transition-transform duration-200 group-hover/orb:scale-125" strokeWidth={1.5} aria-hidden />
          </button>
        ) : (
          <Mic
            className={cn("absolute top-1/2 left-1/2 size-[12%] -translate-x-1/2 -translate-y-1/2 text-ink opacity-80")}
            strokeWidth={1.5}
            aria-hidden
          />
        )}
      </div>

      {reduce ? (
        <div className="flex h-6 items-end gap-1" aria-hidden>
          {Array.from({ length: 10 }, (_, i) => (
            <span
              key={i}
              className={cn("w-1.5 rounded-full", i < lit ? (speaking ? "bg-cobalt-soft" : "bg-lime") : "bg-ink-3")}
              style={{ height: `${8 + i * 1.6}px` }}
            />
          ))}
        </div>
      ) : null}

      <p
        role="status"
        aria-live="polite"
        className={cn("eyebrow text-center transition-colors duration-300", speaking ? "text-cobalt-soft" : "text-lime")}
      >
        {caption}
      </p>
    </div>
  );
}

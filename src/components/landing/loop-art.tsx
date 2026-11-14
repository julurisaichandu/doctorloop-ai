"use client";

import { useEffect, useState } from "react";
import { useReducedMotion } from "motion/react";
import { Sparkles, Stethoscope, UserRound, type LucideIcon } from "lucide-react";
import { DrawPath } from "@/components/motion/draw-path";
import { cn } from "@/lib/utils";

const R = 170;
const LOOP = `M240 ${240 - R} A${R} ${R} 0 0 1 240 ${240 + R} A${R} ${R} 0 0 1 240 ${240 - R} Z`;

type NodeSpec = { label: string; Icon: LucideIcon; left: string; top: string };

/** Clockwise loop: You, then AI, then Your care team. "balanced" spaces them evenly; "upperLeft" keeps them clear of a card on the lower right. */
const LAYOUTS: Record<"balanced" | "upperLeft", NodeSpec[]> = {
  balanced: [
    { label: "You", Icon: UserRound, left: "50%", top: "14.6%" },
    { label: "AI", Icon: Sparkles, left: "80.7%", top: "67.7%" },
    { label: "Your care team", Icon: Stethoscope, left: "19.3%", top: "67.7%" },
  ],
  upperLeft: [
    { label: "You", Icon: UserRound, left: "19.3%", top: "67.7%" },
    { label: "AI", Icon: Sparkles, left: "19.3%", top: "32.3%" },
    { label: "Your care team", Icon: Stethoscope, left: "50%", top: "14.6%" },
  ],
};

/** Animated orbit: You, AI, Your care team on a loop with a lime dot travelling slowly (static for reduced motion). */
export function LoopArt({
  className,
  caption = true,
  layout = "balanced",
}: {
  className?: string;
  caption?: boolean;
  layout?: "balanced" | "upperLeft";
}) {
  const prefersReduced = useReducedMotion();
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setMounted(true), 0);
    return () => clearTimeout(t);
  }, []);
  const reduce = !mounted || prefersReduced; // server + first paint render the static dot
  return (
    <div
      className={cn("relative mx-auto aspect-square w-full", className)}
      role="img"
      aria-label="Illustration: an update loops from you to AI to your care team, and only moves on with your approval."
    >
      <svg viewBox="0 0 480 480" className="absolute inset-0 size-full" fill="none" aria-hidden>
        <circle cx="240" cy="240" r={R + 44} stroke="var(--ink-3)" strokeWidth="1" strokeDasharray="2 7" />
        <circle cx="240" cy="240" r={R - 52} stroke="var(--ink-3)" strokeWidth="1" />
        <DrawPath d={LOOP} className="text-bone" strokeWidth={1.5} />
        <path d={`M240 ${240 - R} A${R} ${R} 0 0 1 ${240 + R * 0.866} ${240 + R / 2}`} stroke="var(--lime)" strokeWidth="3" strokeLinecap="round" opacity="0.9" />
        <g transform={reduce ? `translate(240 ${240 - R})` : undefined}>
          {reduce ? null : <animateMotion dur="16s" repeatCount="indefinite" path={LOOP} rotate="0" />}
          <circle r="16" fill="var(--lime)" opacity="0.22" />
          <circle r="7" fill="var(--lime)" />
        </g>
      </svg>
      {LAYOUTS[layout].map(({ label, Icon, left, top }) => (
        <span
          key={label}
          className="absolute flex -translate-x-1/2 -translate-y-1/2 items-center gap-2 whitespace-nowrap rounded-full border border-ink-3 bg-ink-2 py-1.5 pr-3.5 pl-1.5"
          style={{ left, top }}
        >
          <span className="flex size-6 items-center justify-center rounded-full bg-lime text-ink">
            <Icon className="size-3.5" strokeWidth={1.5} aria-hidden />
          </span>
          <span className="eyebrow text-paper">{label}</span>
        </span>
      ))}
      {caption ? (
        <div className="absolute inset-0 flex flex-col items-center justify-center text-center" aria-hidden>
          <span className="eyebrow text-muted-ink">The loop</span>
          <span className="font-display mt-1 text-3xl leading-none text-paper sm:text-4xl">
            Nothing <em>lost</em>
          </span>
        </div>
      ) : null}
    </div>
  );
}

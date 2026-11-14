"use client";

import type { CSSProperties, ReactNode } from "react";
import { cn } from "@/lib/utils";

/** Infinite CSS marquee: content duplicated, paused on hover/focus, static with reduced motion. */
export function Marquee({
  children,
  className,
  speedSeconds = 35,
}: {
  children: ReactNode;
  className?: string;
  speedSeconds?: number;
}) {
  return (
    <div className={cn("marquee relative flex overflow-hidden", className)}>
      <div className="marquee-track" style={{ "--marquee-speed": `${speedSeconds}s` } as CSSProperties}>
        <div className="flex shrink-0 items-center">{children}</div>
        <div className="flex shrink-0 items-center" aria-hidden>
          {children}
        </div>
      </div>
    </div>
  );
}

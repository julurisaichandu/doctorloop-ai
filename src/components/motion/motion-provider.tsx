"use client";

import type { ReactNode } from "react";
import { MotionConfig } from "motion/react";

/** Root motion config: honors the OS "reduce motion" setting for every primitive. */
export function MotionProvider({ children }: { children: ReactNode }) {
  return <MotionConfig reducedMotion="user">{children}</MotionConfig>;
}

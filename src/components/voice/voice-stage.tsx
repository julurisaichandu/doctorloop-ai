"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { VoiceOrb, type OrbLevels, type OrbState } from "./voice-orb";

/** The ink "stage" every voice phase lives on: orb, mono caption, a serif line and its actions. */
export function VoiceStage({
  state,
  caption,
  title,
  children,
  getLevels,
  pulseKey,
  onPress,
  pressLabel,
  size,
  tag,
  className,
}: {
  state: OrbState;
  caption: string;
  title?: ReactNode;
  children?: ReactNode;
  getLevels?: () => OrbLevels;
  pulseKey?: number;
  onPress?: () => void;
  pressLabel?: string;
  size?: "lg" | "sm";
  /** Small mono tag in the corner, e.g. "SIMULATED". */
  tag?: string;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "grain relative overflow-hidden rounded-[28px] bg-ink px-5 py-9 text-paper sm:px-10 sm:py-12",
        className,
      )}
    >
      {tag ? (
        <span className="eyebrow absolute top-4 right-4 z-10 rounded-full border border-ink-3 px-2.5 py-1 text-[10px] text-muted-ink sm:top-5 sm:right-6">
          {tag}
        </span>
      ) : null}
      <div className="relative z-10 flex flex-col items-center text-center">
        <VoiceOrb
          state={state}
          caption={caption}
          getLevels={getLevels}
          pulseKey={pulseKey}
          onPress={onPress}
          pressLabel={pressLabel}
          size={size}
        />
        {title ? <div className="font-display mt-6 max-w-md text-3xl leading-[1.1] sm:text-4xl">{title}</div> : null}
        {children ? <div className="mt-3 flex w-full max-w-lg flex-col items-center gap-4 text-sm text-muted-ink">{children}</div> : null}
      </div>
    </div>
  );
}

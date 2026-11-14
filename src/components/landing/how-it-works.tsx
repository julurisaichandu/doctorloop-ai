"use client";

import { useRef, type ReactNode } from "react";
import { motion, useScroll, useTransform, type MotionValue } from "motion/react";
import { ClipboardCheck, LayoutList, Mic, Share2, type LucideIcon } from "lucide-react";
import { Reveal } from "@/components/motion/reveal";
import { cn } from "@/lib/utils";
import { AnnotatedSentence, ApproveToggles, DoctorReport, VoiceWave } from "./visuals";

type VisualKind = "voice" | "text" | "approve" | "doctor";

const STEPS: { icon: LucideIcon; title: string; text: string; visual: VisualKind }[] = [
  {
    icon: Mic,
    title: "Capture",
    text: "Speak, type or import a wearable memory the moment something happens. Only your own words are kept.",
    visual: "voice",
  },
  {
    icon: LayoutList,
    title: "Structure",
    text: "AI organizes your words into a timeline and quotes you verbatim. It never adds anything you did not say.",
    visual: "text",
  },
  {
    icon: ClipboardCheck,
    title: "Review",
    text: "You edit, approve or keep private every single item. Nothing moves on without you.",
    visual: "approve",
  },
  {
    icon: Share2,
    title: "Share",
    text: "Your care team sees only what you approved, as a pre-visit summary where every statement cites its source.",
    visual: "doctor",
  },
];

function StepVisual({ kind }: { kind: VisualKind }) {
  switch (kind) {
    case "voice":
      return (
        <div className="rounded-[24px] bg-ink p-6 text-paper ring-1 ring-ink-3">
          <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
            <span className="eyebrow text-muted-ink">Voice check-in · simulated</span>
            <span className="eyebrow text-lime">Listening</span>
          </div>
          <VoiceWave className="my-6" />
          <p className="font-display text-xl text-paper/90 italic">“My knee ached more last night…”</p>
        </div>
      );
    case "text":
      return (
        <div className="rounded-[24px] border border-hairline bg-paper-2 p-6">
          <span className="eyebrow text-muted-foreground">Patient · own words</span>
          <AnnotatedSentence className="mt-4" />
        </div>
      );
    case "approve":
      return <ApproveToggles />;
    case "doctor":
      return <DoctorReport />;
  }
}

function Layer({
  i,
  progress,
  children,
  className,
}: {
  i: number;
  progress: MotionValue<number>;
  children: ReactNode;
  className?: string;
}) {
  const a = i / 4;
  const b = (i + 1) / 4;
  const pad = 0.05;
  const first = i === 0;
  const last = i === 3;
  // Input ranges stay inside 0..1 (scroll-linked animations reject offsets outside it).
  // Sequential crossfade: fade-in over [a, a+pad], hold, fade-out over [b-pad, b] (no muddy overlap).
  const stops = first ? [b - pad, b] : last ? [a, a + pad] : [a, a + pad, b - pad, b];
  const opacityOut = first ? [1, 0] : last ? [0, 1] : [0, 1, 1, 0];
  const yOut = first ? [0, -18] : last ? [18, 0] : [18, 0, 0, -18];
  const opacity = useTransform(progress, stops, opacityOut);
  const y = useTransform(progress, stops, yOut);
  return (
    <motion.div style={{ opacity, y }} className={cn("col-start-1 row-start-1", className)}>
      {children}
    </motion.div>
  );
}

function Rail({ progress }: { progress: MotionValue<number> }) {
  const scaleX = useTransform(progress, [0, 1], [0.04, 1]);
  return (
    <div className="mt-12">
      <div className="h-px w-full bg-hairline">
        <motion.div style={{ scaleX }} className="h-[3px] origin-left -translate-y-px rounded-full bg-ink" />
      </div>
      <ol className="mt-3 flex justify-between">
        {STEPS.map((s, i) => (
          <li key={s.title} className="eyebrow text-muted-foreground">
            0{i + 1} {s.title}
          </li>
        ))}
      </ol>
    </div>
  );
}

export function HowItWorks() {
  const ref = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start start", "end end"] });

  return (
    <>
      {/* Desktop: sticky scroll story (CSS-hidden on small screens / reduced motion) */}
      <div ref={ref} className="relative hidden h-[360vh] motion-safe:lg:block">
        <div className="sticky top-0 flex h-screen max-h-[860px] flex-col justify-center">
          <div className="grid grid-cols-12 items-center gap-10">
            <div className="col-span-5">
              <div className="grid">
                {STEPS.map((s, i) => (
                  <Layer key={s.title} i={i} progress={scrollYProgress}>
                    <span className="flex size-12 items-center justify-center rounded-full bg-lime text-ink">
                      <s.icon className="size-5" strokeWidth={1.5} aria-hidden />
                    </span>
                    <p className="eyebrow mt-6 text-muted-foreground">Step 0{i + 1} / 04</p>
                    <h3 className="font-display mt-2 text-7xl leading-none tracking-[-0.02em]">{s.title}</h3>
                    <p className="mt-5 max-w-md text-lg text-muted-foreground">{s.text}</p>
                  </Layer>
                ))}
              </div>
              <Rail progress={scrollYProgress} />
            </div>
            <div className="col-span-7">
              <div className="grid">
                {STEPS.map((s, i) => (
                  <Layer key={s.title} i={i} progress={scrollYProgress} className="self-center">
                    <StepVisual kind={s.visual} />
                  </Layer>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Mobile / reduced motion: stacked cards */}
      <ol className="grid gap-5 sm:grid-cols-2 motion-safe:lg:hidden">
        {STEPS.map((s, i) => (
          <Reveal
            as="li"
            key={s.title}
            className="flex flex-col gap-5 rounded-[24px] border border-hairline bg-paper-2 p-5"
          >
            <div className="flex items-center justify-between">
              <span className="flex size-11 items-center justify-center rounded-full bg-lime text-ink">
                <s.icon className="size-5" strokeWidth={1.5} aria-hidden />
              </span>
              <span className="eyebrow text-muted-foreground">0{i + 1} / 04</span>
            </div>
            <div>
              <h3 className="font-display text-4xl leading-none">{s.title}</h3>
              <p className="mt-3 text-[15px] text-muted-foreground">{s.text}</p>
            </div>
            <div className="mt-auto">
              <StepVisual kind={s.visual} />
            </div>
          </Reveal>
        ))}
      </ol>
    </>
  );
}

"use client";

import type { ReactNode } from "react";
import { motion } from "motion/react";
import { Lock, Radio, Share2, ShieldCheck } from "lucide-react";
import { GlowCard } from "@/components/motion/glow-card";
import { Stagger, StaggerItem } from "@/components/motion/stagger";
import { cn } from "@/lib/utils";
import { AnnotatedSentence, CitationChip, ShareSwitch, useLoopingFlag, useStatic } from "./visuals";

function Tile({
  className,
  eyebrow,
  title,
  children,
}: {
  className?: string;
  eyebrow: string;
  title: ReactNode;
  children: ReactNode;
}) {
  return (
    <GlowCard className={cn("flex flex-col rounded-[28px] p-6 sm:p-7", className)}>
      <p className="eyebrow opacity-90">{eyebrow}</p>
      <h3 className="font-display mt-2 text-[32px] leading-[1.05] tracking-[-0.02em] sm:text-4xl">{title}</h3>
      <div className="mt-6 flex-1">{children}</div>
    </GlowCard>
  );
}

/* Voice: breathing orb */
function BreathingOrb() {
  const reduce = useStatic();
  return (
    <div className="relative mx-auto flex size-44 items-center justify-center" aria-hidden>
      {[0, 1].map((i) => (
        <motion.span
          key={i}
          className="absolute inset-0 rounded-full border border-paper/40"
          initial={false}
          animate={reduce ? { scale: 1 + i * 0.2, opacity: 0.4 } : { scale: [1, 1.35 + i * 0.15], opacity: [0.5, 0] }}
          transition={reduce ? { duration: 0 } : { duration: 4, repeat: Infinity, ease: "easeOut", delay: i * 2 }}
        />
      ))}
      <motion.span
        className="size-28 rounded-full bg-lime"
        initial={false}
        animate={reduce ? { scale: 1 } : { scale: [1, 1.12, 1] }}
        transition={reduce ? { duration: 0 } : { duration: 4, repeat: Infinity, ease: "easeInOut" }}
      />
      <span className="absolute size-12 rounded-full bg-ink/90" />
      <span className="absolute size-2.5 rounded-full bg-lime" />
    </div>
  );
}

/* Vexo: memory stream */
const RELEVANT = [
  { text: "Resting heart rate ran higher than usual after the long walk.", meta: "Vexo · mock · Nov 8", terms: ["walk", "heart rate"] },
  { text: "Slept in two short blocks, restless around 3 a.m.", meta: "Vexo · mock · Nov 10", terms: ["sleep"] },
  { text: "Skipped the evening stretches, knee felt stiff on the stairs.", meta: "Vexo · mock · Nov 11", terms: ["knee", "stairs"] },
];

function Redacted({ w, delay }: { w: string; delay: number }) {
  const reduce = useStatic();
  return (
    <motion.div
      className="h-8 rounded-lg bg-ink"
      style={{ width: w }}
      initial={false}
      animate={reduce ? { opacity: 0.25 } : { opacity: [0.9, 0.9, 0.08, 0.08, 0.9], scaleX: [1, 1, 0.94, 0.94, 1] }}
      transition={reduce ? { duration: 0 } : { duration: 7, repeat: Infinity, ease: "easeInOut", delay }}
    />
  );
}

function MemoryStream() {
  return (
    <div className="grid gap-6 md:grid-cols-[1fr_0.62fr]">
      <Stagger className="space-y-2.5">
        {RELEVANT.map((m) => (
          <StaggerItem key={m.text} className="rounded-2xl border border-hairline bg-paper p-4">
            <p className="font-display text-[19px] leading-snug italic">“{m.text}”</p>
            <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
              <span className="eyebrow inline-flex items-center gap-1 rounded-full bg-ink px-2 py-0.5 text-[10px] text-lime">
                <Radio className="size-3" strokeWidth={1.5} aria-hidden />
                {m.meta}
              </span>
              {m.terms.map((t) => (
                <span key={t} className="eyebrow rounded-full bg-paper-3 px-2 py-0.5 text-[10px]">
                  {t}
                </span>
              ))}
            </div>
          </StaggerItem>
        ))}
      </Stagger>
      <div className="flex flex-col justify-between gap-4 rounded-2xl bg-paper-3 p-4">
        <div className="space-y-2.5" aria-hidden>
          <Redacted w="92%" delay={0} />
          <Redacted w="68%" delay={0.5} />
          <Redacted w="80%" delay={1} />
        </div>
        <p className="eyebrow flex items-center gap-1.5 text-[11px] leading-snug">
          <Lock className="size-3.5 shrink-0" strokeWidth={1.5} aria-hidden />
          3 unrelated · filtered out · never stored
        </p>
      </div>
    </div>
  );
}

/* Consent */
function ConsentToggle() {
  const shared = useLoopingFlag(2800);
  return (
    <div className="flex h-full flex-col justify-between gap-6">
      <div className="rounded-2xl bg-paper-2 p-4 text-ink">
        <div className="flex items-center justify-between gap-3">
          <span className="min-w-0 text-[15px] leading-tight font-medium">Knee discomfort 6/10</span>
          <ShareSwitch on={shared} tone="paper" />
        </div>
        <p className="eyebrow mt-3 flex items-center gap-1.5 text-[11px]">
          {shared ? (
            <>
              <Share2 className="size-3.5" strokeWidth={1.5} aria-hidden /> Shared with care team
            </>
          ) : (
            <>
              <Lock className="size-3.5" strokeWidth={1.5} aria-hidden /> Private · only you
            </>
          )}
        </p>
      </div>
      <p className="flex items-start gap-2 text-[14px] leading-snug">
        <ShieldCheck className="mt-0.5 size-4 shrink-0" strokeWidth={1.5} aria-hidden />
        Private by default. Sharing is a choice you make per item.
      </p>
    </div>
  );
}

export function Bento() {
  return (
    <Stagger className="grid gap-4 lg:grid-cols-12">
      <StaggerItem className="lg:col-span-4">
        <Tile eyebrow="Voice check-in" title={<>Talk it <em>through.</em></>} className="h-full bg-cobalt text-white">
          <BreathingOrb />
          <p className="mt-6 text-[15px] text-white/85">A calm voice check-in. Only your own words are kept, never the assistant&apos;s.</p>
        </Tile>
      </StaggerItem>
      <StaggerItem className="lg:col-span-8">
        <Tile
          eyebrow="Vexo memories · read-only"
          title={<>Only what&apos;s <em>health-relevant</em> comes in.</>}
          className="h-full border border-hairline bg-paper-2"
        >
          <MemoryStream />
        </Tile>
      </StaggerItem>
      <StaggerItem className="lg:col-span-5">
        <Tile eyebrow="AI structuring" title={<>Your words, <em>highlighted.</em></>} className="h-full border border-hairline bg-paper-2">
          <AnnotatedSentence />
        </Tile>
      </StaggerItem>
      <StaggerItem className="lg:col-span-4">
        <Tile eyebrow="Doctor view" title={<>Cited, <em>not guessed.</em></>} className="h-full bg-ink text-paper">
          <div className="rounded-2xl border border-ink-3 bg-ink-2 p-4">
            <span className="eyebrow rounded-full border border-ink-3 px-2 py-0.5 text-[10px]">AI DRAFT · UNVERIFIED</span>
            <p className="font-display mt-3 text-xl leading-snug">
              Knee discomfort at 6 out of 10 after physio
              <CitationChip n={1} /> and short sleep
              <CitationChip n={2} />.
            </p>
          </div>
          <p className="mt-4 text-[14px] text-muted-ink">Every statement links back to the patient&apos;s original words.</p>
        </Tile>
      </StaggerItem>
      <StaggerItem className="lg:col-span-3">
        <Tile eyebrow="Consent" title={<>You hold <em>the switch.</em></>} className="h-full bg-lime text-ink">
          <ConsentToggle />
        </Tile>
      </StaggerItem>
    </Stagger>
  );
}

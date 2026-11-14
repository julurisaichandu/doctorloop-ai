import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowRight, Eye, Mic, PenLine, Radio, ShieldAlert, UserCheck, Sparkles, type LucideIcon } from "lucide-react";
import { BrandName, LogoMark } from "@/components/app-shell/brand";
import { Grain } from "@/components/motion/grain";
import { CountUp } from "@/components/motion/count-up";
import { Marquee } from "@/components/motion/marquee";
import { Reveal } from "@/components/motion/reveal";
import { SplitText } from "@/components/motion/split-text";
import { Stagger, StaggerItem } from "@/components/motion/stagger";
import { IntegrationModeBadge } from "@/components/shared/integration-mode-badge";
import { cn } from "@/lib/utils";
import { HeroDemoCard } from "./hero-demo-card";
import { LoopArt } from "./loop-art";
import { ScrollLink } from "./scroll-link";

export const WRAP = "mx-auto w-full max-w-[1280px] px-4 sm:px-6";

const pillBase =
  "group/cta inline-flex h-12 items-center justify-center gap-2 rounded-full px-6 text-[15px] font-medium whitespace-nowrap transition-transform duration-150 active:scale-[0.97] motion-reduce:transition-none";
const arrow = "size-4 transition-transform duration-150 group-hover/cta:translate-x-1 motion-reduce:transform-none";

export function SectionHead({ eyebrow, title, intro, className }: { eyebrow: string; title: string; intro?: string; className?: string }) {
  return (
    <div className={cn("max-w-3xl", className)}>
      <p className="eyebrow text-muted-foreground">{eyebrow}</p>
      <SplitText as="h2" text={title} className="mt-3 text-[40px] leading-[1.05] tracking-[-0.02em] sm:text-5xl lg:text-6xl" />
      {intro ? (
        <Reveal>
          <p className="mt-4 max-w-xl text-[17px] text-muted-foreground">{intro}</p>
        </Reveal>
      ) : null}
    </div>
  );
}

/* ---------------- Hero ---------------- */
export function Hero({ signedInHref, hasDemo }: { signedInHref: string | null; hasDemo: boolean }) {
  return (
    <section className="p-2 sm:p-3">
      <div className="grain relative overflow-hidden rounded-[28px] bg-ink text-paper">
        <Grain />
        <div className="relative z-10">
          <header className={cn(WRAP, "flex h-[72px] items-center justify-between")}>
            <Link href="/" className="flex items-center gap-2.5" aria-label="DoctorLoop AI home">
              <LogoMark />
              <BrandName className="text-xl" />
            </Link>
            {signedInHref ? (
              <Link href={signedInHref} className="inline-flex h-10 items-center rounded-full bg-lime px-5 text-sm font-medium text-ink">
                Go to my dashboard
              </Link>
            ) : (
              <Link
                href="/login"
                className="inline-flex h-10 items-center rounded-full border border-ink-3 px-5 text-sm font-medium text-paper transition-colors hover:border-paper"
              >
                Sign in
              </Link>
            )}
          </header>

          <div className={cn(WRAP, "grid items-center gap-10 pt-8 pb-14 sm:pt-12 lg:grid-cols-[1.05fr_1fr] lg:gap-6 lg:pt-6 lg:pb-20")}>
            <div>
              <p className="eyebrow inline-flex items-center gap-2 rounded-full border border-ink-3 px-3 py-1.5 text-muted-ink">
                <span className="size-1.5 rounded-full bg-lime" aria-hidden />
                Recovery updates · patient-approved
              </p>
              <SplitText
                as="h1"
                text="Between appointments, *nothing gets lost.*"
                className="mt-6 text-[52px] leading-[0.98] tracking-[-0.02em] sm:text-7xl lg:text-[88px]"
              />
              <Reveal delay={0.2}>
                <p className="mt-6 max-w-lg text-[17px] leading-relaxed text-muted-ink sm:text-lg">
                  DoctorLoop AI turns the small updates of everyday recovery into a clear, cited timeline that you review,
                  approve and share with your care team.
                </p>
              </Reveal>
              <Reveal delay={0.3}>
                <div className="mt-8 flex flex-wrap gap-3">
                  {signedInHref ? (
                    <Link href={signedInHref} className={cn(pillBase, "bg-lime text-ink")}>
                      Go to my dashboard <ArrowRight className={arrow} strokeWidth={1.5} />
                    </Link>
                  ) : (
                    <>
                      {hasDemo ? (
                        <ScrollLink href="#demo" className={cn(pillBase, "bg-lime text-ink")}>
                          Try a demo account <ArrowRight className={arrow} strokeWidth={1.5} />
                        </ScrollLink>
                      ) : null}
                      <Link href="/login" className={cn(pillBase, "border border-ink-3 text-paper hover:border-paper")}>
                        Sign in
                      </Link>
                    </>
                  )}
                </div>
                <p className="eyebrow mt-6 text-[10px] text-muted-ink">
                  Prototype · synthetic data · not a medical device · not for emergencies
                </p>
              </Reveal>
            </div>

            <div className="relative flex flex-col items-center gap-8 lg:block lg:h-[620px]">
              <LoopArt layout="upperLeft" className="max-w-[340px] sm:max-w-[420px] lg:absolute lg:top-0 lg:left-0 lg:size-[600px] lg:max-w-none" caption={false} />
              <div className="w-full max-w-[400px] lg:absolute lg:right-0 lg:bottom-0 lg:w-[390px]">
                <HeroDemoCard />
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ---------------- Marquee ---------------- */
const MARQUEE: { icon: LucideIcon | null; text: string }[] = [
  { icon: Mic, text: "Voice check-ins" },
  { icon: PenLine, text: "Typed notes" },
  { icon: Radio, text: "Vexo memories" },
  { icon: UserCheck, text: "You approve every item" },
  { icon: Eye, text: "Clinicians see only what's shared" },
  { icon: Sparkles, text: "AI output is unverified" },
];

export function MarqueeStrip() {
  return (
    <div className="border-y border-hairline py-5" aria-label="Capture channels and principles">
      <Marquee speedSeconds={35}>
        {MARQUEE.map(({ icon: Icon, text }) => (
          <span key={text} className="font-display flex items-center gap-4 pr-10 text-3xl whitespace-nowrap sm:text-4xl">
            {Icon ? <Icon className="size-6 text-lime-deep" strokeWidth={1.5} aria-hidden /> : null}
            <span className={text.includes("Vexo") ? "italic" : undefined}>{text}</span>
            <span className="size-1.5 rounded-full bg-ink" aria-hidden />
          </span>
        ))}
      </Marquee>
    </div>
  );
}

/* ---------------- Stat strip ---------------- */
export function StatStrip() {
  const stats: { big: ReactNode; label: string }[] = [
    { big: <CountUp value={3} />, label: "ways to capture: voice, typed notes, Vexo memories" },
    { big: <span>0</span>, label: "items shared without your approval" },
    { big: <span className="italic">Cited</span>, label: "every AI statement links to its source" },
    { big: <span className="whitespace-nowrap italic">Read‑only</span>, label: "Vexo access: memories are only ever read" },
  ];
  return (
    <Stagger className="grid border-y border-ink sm:grid-cols-2 lg:grid-cols-4">
      {stats.map((s, i) => (
        <StaggerItem
          key={s.label}
          className={cn(
            "flex flex-col justify-between gap-6 px-0 py-8 sm:px-6",
            i > 0 && "border-t border-hairline sm:border-t-0",
            i === 0 && "lg:pl-0",
            i % 2 === 1 && "sm:border-l sm:border-hairline",
            i === 2 && "sm:border-t sm:border-hairline lg:border-t-0",
            i === 3 && "sm:border-t sm:border-hairline lg:border-t-0",
            i > 0 && "lg:border-l lg:border-hairline",
          )}
        >
          <span className="font-display text-7xl leading-none tracking-[-0.02em] lg:text-[68px]">{s.big}</span>
          <span className="eyebrow max-w-[22ch] leading-relaxed text-muted-foreground">{s.label}</span>
        </StaggerItem>
      ))}
    </Stagger>
  );
}

/* ---------------- Principles ---------------- */
const PRINCIPLES = [
  { n: "01", title: "You approve every item", text: "Nothing reaches a clinician until you share it, and you can stop sharing at any time." },
  { n: "02", title: "Clinicians see only what is shared", text: "Doctors see approved updates of their own assigned patients, nothing else." },
  { n: "03", title: "AI output is unverified", text: "Every AI summary is labeled and cites the original words it came from." },
];

export function Principles() {
  return (
    <ol className="border-t border-ink">
      {PRINCIPLES.map((p) => (
        <Reveal as="li" key={p.n} className="grid gap-3 border-b border-hairline py-8 md:grid-cols-[120px_1.2fr_1fr] md:items-baseline md:gap-8">
          <span className="eyebrow text-muted-foreground">{p.n}</span>
          <h3 className="font-display text-4xl leading-[1.05] tracking-[-0.02em] sm:text-5xl">{p.title}</h3>
          <p className="max-w-md text-[16px] text-muted-foreground">{p.text}</p>
        </Reveal>
      ))}
    </ol>
  );
}

/* ---------------- Disclaimer ---------------- */
export function Disclaimer() {
  return (
    <Reveal>
      <div className="flex flex-col gap-5 rounded-[28px] bg-amber p-6 text-ink sm:flex-row sm:gap-8 sm:p-10">
        <span className="flex size-12 shrink-0 items-center justify-center rounded-full bg-ink text-amber">
          <ShieldAlert className="size-6" strokeWidth={1.5} aria-hidden />
        </span>
        <div>
          <h2 className="font-display text-4xl leading-none tracking-[-0.02em] sm:text-5xl">
            Prototype, <em>not a medical product</em>
          </h2>
          <p className="mt-4 max-w-3xl text-[16px] leading-relaxed">
            This is a hackathon prototype that uses synthetic, fictional data only. It is not a medical device, makes no HIPAA
            compliance claim, does not diagnose or recommend treatment, and is not for emergencies. If you need urgent help,
            call your local emergency number.
          </p>
        </div>
      </div>
    </Reveal>
  );
}

/* ---------------- Integration status ---------------- */
export function IntegrationStatus({ items }: { items: readonly { label: string; mode: "live" | "mock" | "simulated" | "local" }[] }) {
  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_1.4fr] lg:items-center">
      <div>
        <p className="eyebrow text-muted-foreground">Live integration status</p>
        <h2 className="font-display mt-3 text-4xl leading-[1.05] tracking-[-0.02em] sm:text-5xl">
          Honest about what&apos;s <em>real.</em>
        </h2>
      </div>
      <div>
        <div className="flex flex-wrap gap-2">
          {items.map((i) => (
            <IntegrationModeBadge key={i.label} label={i.label} mode={i.mode} />
          ))}
        </div>
        <p className="mt-4 max-w-lg text-[15px] text-muted-foreground">
          Anything without credentials falls back to a clearly labeled mock so the demo always works.
        </p>
      </div>
    </div>
  );
}

/* ---------------- Footer ---------------- */
export function Footer() {
  return (
    <footer className="p-2 sm:p-3">
      <div className="grain relative overflow-hidden rounded-[28px] bg-ink px-6 py-12 text-paper sm:px-10 sm:py-16">
        <Grain />
        <div className="relative z-10">
          <div className="flex flex-wrap items-end justify-between gap-8">
            <div className="flex items-center gap-3 sm:gap-4">
              <LogoMark className="size-12 sm:size-16" />
              <BrandName className="text-5xl sm:text-7xl" />
            </div>
            <Link
              href="/login"
              className="group/cta inline-flex h-12 items-center gap-2 rounded-full bg-lime px-6 text-[15px] font-medium text-ink"
            >
              Sign in <ArrowRight className={arrow} strokeWidth={1.5} />
            </Link>
          </div>
          <div className="mt-12 flex flex-col gap-2 border-t border-ink-3 pt-6 text-muted-ink sm:flex-row sm:justify-between">
            <p className="eyebrow">DoctorLoop AI · synthetic demo data · AI output is unverified</p>
            <p className="eyebrow">Prototype · not a medical device · not for emergencies</p>
          </div>
        </div>
      </div>
    </footer>
  );
}

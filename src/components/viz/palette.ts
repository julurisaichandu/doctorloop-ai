import { Clock, Check, Lock, Mic, PenLine, Radio, type LucideIcon } from "lucide-react";
import type { EntrySource, ObservationCategory, ReviewStatus } from "@/lib/domain/types";

/**
 * Single source of truth: category / source / status / chart colors (docs/DESIGN.md section 2).
 * All values are CSS variable references or full Tailwind class strings (so Tailwind can see them).
 */

export interface CategoryTone {
  label: string;
  /** Data stroke/fill on paper (>= 3:1 graphics). */
  color: string;
  /** Soft tint source for highlights (a fill-safe token). */
  fill: string;
  /** Text on paper (>= 4.5:1). */
  text: string;
  /** Tailwind classes. */
  bar: string;
  dot: string;
  textClass: string;
  /** The same category's color on ink surfaces. */
  onInk: string;
}

const T = {
  symptom: {
    color: "var(--vermilion)",
    fill: "var(--vermilion)",
    text: "var(--vermilion-deep)",
    bar: "bg-vermilion",
    dot: "bg-vermilion",
    textClass: "text-vermilion-deep",
    onInk: "var(--vermilion)",
  },
  sleep: {
    color: "var(--cobalt)",
    fill: "var(--cobalt)",
    text: "var(--cobalt)",
    bar: "bg-cobalt",
    dot: "bg-cobalt",
    textClass: "text-cobalt",
    onInk: "var(--cobalt-soft)",
  },
  active: {
    color: "var(--lime-deep)",
    fill: "var(--lime)",
    text: "var(--lime-deep)",
    bar: "bg-lime-deep",
    dot: "bg-lime-deep",
    textClass: "text-lime-deep",
    onInk: "var(--lime)",
  },
  warm: {
    color: "var(--amber-deep)",
    fill: "var(--amber)",
    text: "var(--amber-deep)",
    bar: "bg-amber",
    dot: "bg-amber",
    textClass: "text-amber-deep",
    onInk: "var(--amber)",
  },
  neutral: {
    color: "var(--ink)",
    fill: "var(--ink)",
    text: "var(--ink)",
    bar: "bg-ink",
    dot: "bg-ink",
    textClass: "text-ink",
    onInk: "var(--paper)",
  },
} as const;

const LABELS: Record<ObservationCategory, string> = {
  symptom: "Symptom",
  sleep: "Sleep",
  mobility: "Mobility",
  activity: "Activity",
  mood: "Mood",
  wound: "Wound",
  medication: "Medication",
  question: "Question",
  other: "Other",
};

const GROUP: Record<ObservationCategory, keyof typeof T> = {
  symptom: "symptom",
  sleep: "sleep",
  mobility: "active",
  activity: "active",
  mood: "warm",
  wound: "warm",
  medication: "neutral",
  question: "neutral",
  other: "neutral",
};

export function categoryTone(category: ObservationCategory): CategoryTone {
  return { label: LABELS[category] ?? "Other", ...T[GROUP[category] ?? "neutral"] };
}

/** Chart series colors on paper, then on ink (DESIGN section 2). */
export const CHART_COLORS = ["var(--vermilion)", "var(--cobalt)", "var(--lime-deep)", "var(--amber-deep)", "var(--ink)"] as const;
export const CHART_COLORS_ON_INK = ["var(--lime)", "var(--vermilion)", "var(--cobalt-soft)", "var(--amber)", "var(--paper)"] as const;

export function chartColor(index: number, onInk = false): string {
  const list = onInk ? CHART_COLORS_ON_INK : CHART_COLORS;
  return list[((index % list.length) + list.length) % list.length];
}

/** Category color per series; when two series share a category color, later ones take unused chart colors. */
export function assignSeriesColors(series: { category: ObservationCategory }[]): string[] {
  const used = new Set<string>();
  const out: (string | null)[] = series.map((s) => {
    const c = categoryTone(s.category).color;
    if (used.has(c)) return null;
    used.add(c);
    return c;
  });
  return out.map((c) => c ?? CHART_COLORS.find((x) => !used.has(x) && used.add(x)) ?? "var(--ink)");
}

export interface SourceTone {
  label: string;
  Icon: LucideIcon;
  className: string;
}

export const SOURCE_TONES: Record<EntrySource, SourceTone> = {
  voice: { label: "Voice", Icon: Mic, className: "border-cobalt bg-cobalt text-white" },
  manual: { label: "Note", Icon: PenLine, className: "border-hairline bg-paper-3 text-ink" },
  vexo: { label: "Vexo", Icon: Radio, className: "border-ink bg-ink text-lime" },
};

export interface StatusTone {
  label: string;
  Icon: LucideIcon;
  className: string;
}

export const STATUS_TONES: Record<ReviewStatus, StatusTone> = {
  pending_review: { label: "Pending your review", Icon: Clock, className: "border-amber bg-amber text-ink" },
  approved: { label: "Shared with care team", Icon: Check, className: "border-lime bg-lime text-ink" },
  rejected: { label: "Private", Icon: Lock, className: "border-hairline bg-paper-3 text-ink" },
};

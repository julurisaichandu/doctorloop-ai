import Link from "next/link";
import { format } from "date-fns";
import { ArrowRight } from "lucide-react";
import { Grain } from "@/components/motion/grain";
import { AiGeneratedLabel } from "@/components/shared/ai-generated-label";
import type { GeneratedSummary } from "@/lib/domain/types";

/** Compact editorial preview of the AI weekly report (ink card, serif overview). */
export function WeeklyPreview({
  summary,
  stats,
}: {
  summary: GeneratedSummary;
  stats: { label: string; value: number }[];
}) {
  const c = summary.content;
  const period = `${format(new Date(summary.periodStart), "MMM d")} – ${format(new Date(summary.periodEnd), "MMM d")}`;
  const points = [...c.changesSinceEarlier, ...c.recoveryActivities].slice(0, 3);

  return (
    <article className="relative isolate overflow-hidden rounded-[28px] bg-ink p-6 text-paper sm:p-10">
      <Grain />
      <div className="relative grid gap-10 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] lg:gap-14">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            <AiGeneratedLabel provider={summary.generatedBy} model={summary.model} generatedAt={summary.createdAt} />
            <span className="eyebrow text-muted-ink">Week of {period}</span>
          </div>
          <p className="mt-6 font-display text-[28px] leading-[1.2] text-balance sm:text-4xl">{c.overview}</p>
          <Link
            href="/patient/summary"
            className="group mt-8 inline-flex h-11 items-center gap-2 rounded-full bg-lime px-6 text-[15px] font-medium text-ink transition-transform active:scale-[0.97] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cobalt-soft"
          >
            Open the full report
            <ArrowRight className="size-4 transition-transform group-hover:translate-x-1" strokeWidth={1.75} aria-hidden />
          </Link>
        </div>
        <div className="min-w-0">
          <dl className="grid grid-cols-3 divide-x divide-ink-3 border-y border-ink-3">
            {stats.map((s) => (
              <div key={s.label} className="px-4 py-4 first:pl-0">
                <dd className="font-display text-5xl leading-none tabular-nums">{s.value}</dd>
                <dt className="eyebrow mt-2 text-[10px] text-muted-ink">{s.label}</dt>
              </div>
            ))}
          </dl>
          {points.length > 0 ? (
            <ul className="mt-6 space-y-3">
              {points.map((p) => (
                <li key={p.text} className="flex gap-3 text-[14px] leading-snug text-paper/90">
                  <span className="mt-2 size-1.5 shrink-0 rounded-full bg-lime" aria-hidden />
                  {p.text}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      </div>
    </article>
  );
}

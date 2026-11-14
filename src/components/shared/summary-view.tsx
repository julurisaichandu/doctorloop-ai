import Link from "next/link";
import { format } from "date-fns";
import type { GeneratedSummary, SummaryItem } from "@/lib/domain/types";
import { Grain } from "@/components/motion/grain";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { AiGeneratedLabel } from "./ai-generated-label";

type CitationProps = {
  citationHref?: (entryId: string) => string;
  entryLabels?: Record<string, string>;
};

const CHIP =
  "inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-lime px-1.5 font-mono text-[11px] font-semibold text-ink transition-transform hover:scale-110 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-lime";

function CitationChips({
  ids,
  numbering,
  citationHref,
  entryLabels,
}: CitationProps & { ids: string[]; numbering: Map<string, number> }) {
  return (
    <span className="ml-1.5 inline-flex flex-wrap gap-1 align-middle">
      {ids.map((id) => {
        const n = numbering.get(id);
        const label = entryLabels?.[id] ?? "Original record";
        return (
          <Tooltip key={id}>
            <TooltipTrigger asChild>
              {citationHref ? (
                <Link href={citationHref(id)} aria-label={`Source ${n}: ${label}`} className={CHIP}>
                  {n}
                </Link>
              ) : (
                <span tabIndex={0} aria-label={`Source ${n}: ${label}`} className={CHIP}>
                  {n}
                </span>
              )}
            </TooltipTrigger>
            <TooltipContent>{label}</TooltipContent>
          </Tooltip>
        );
      })}
    </span>
  );
}

function Section({
  title,
  items,
  ...citation
}: CitationProps & { title: string; items: SummaryItem[]; numbering: Map<string, number> }) {
  if (items.length === 0) return null;
  return (
    <section className="border-t border-ink-3 pt-4">
      <h3 className="eyebrow mb-3 text-muted-ink">{title}</h3>
      <ul className="space-y-3">
        {items.map((item, i) => (
          <li key={`${i}:${item.text}`} className="flex gap-3 text-[15px] leading-relaxed">
            <span className="mt-2.5 size-1 shrink-0 rounded-full bg-lime" aria-hidden />
            <span>
              {item.text}
              <CitationChips ids={item.citations} {...citation} />
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** AI report card (ink) with numbered lime citations that link to the original entries. */
export function SummaryView({
  summary,
  citationHref,
  entryLabels,
}: { summary: GeneratedSummary } & CitationProps) {
  const c = summary.content;
  const numbering = new Map<string, number>();
  for (const item of [...c.mainConcerns, ...c.changesSinceEarlier, ...c.recoveryActivities, ...c.patientQuestions]) {
    for (const id of item.citations) if (!numbering.has(id)) numbering.set(id, numbering.size + 1);
  }
  const shared = { numbering, citationHref, entryLabels };
  const period = `${format(new Date(summary.periodStart), "MMM d")} – ${format(new Date(summary.periodEnd), "MMM d")}`;

  return (
    <article className="relative isolate overflow-hidden rounded-[28px] bg-ink p-6 text-paper sm:p-8">
      <Grain />
      <div className="relative">
        <header className="mb-5 flex flex-wrap items-center gap-x-3 gap-y-2">
          <AiGeneratedLabel provider={summary.generatedBy} model={summary.model} generatedAt={summary.createdAt} />
          <span className="eyebrow text-muted-ink">Period: {period}</span>
        </header>
        <p className="font-display text-[26px] leading-[1.25] tracking-normal text-balance sm:text-3xl">
          {c.overview}
        </p>
        <div className="mt-8 space-y-6">
          <Section title="Main concerns" items={c.mainConcerns} {...shared} />
          <Section title="Changes since earlier" items={c.changesSinceEarlier} {...shared} />
          <Section title="Recovery activities" items={c.recoveryActivities} {...shared} />
          <Section title="Questions to discuss" items={c.patientQuestions} {...shared} />
          {c.dataGaps.length > 0 ? (
            <section className="border-t border-ink-3 pt-4">
              <h3 className="eyebrow mb-3 text-muted-ink">Missing details</h3>
              <ul className="space-y-2">
                {c.dataGaps.map((gap) => (
                  <li key={gap} className="flex gap-3 text-sm text-muted-ink">
                    <span className="mt-2.5 size-1 shrink-0 rounded-full bg-muted-ink" aria-hidden />
                    {gap}
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </div>
      </div>
    </article>
  );
}

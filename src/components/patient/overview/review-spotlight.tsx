import Link from "next/link";
import { format } from "date-fns";
import { ArrowRight, Check, Clock } from "lucide-react";
import { SourceBadge } from "@/components/shared/source-badge";
import { PrivacyReceipt } from "@/components/shared/privacy-receipt";
import { AnnotatedText } from "@/components/viz/annotated-text";
import { categoryTone } from "@/components/viz/palette";
import type { TimelineEntryView } from "@/lib/domain/types";
import { CARD } from "./section";

/** First pending update, with the AI's structured highlights over the patient's own words. */
export function ReviewSpotlight({ pending }: { pending: TimelineEntryView[] }) {
  const first = pending[0];
  if (!first) {
    return (
      <div className={`${CARD} flex items-center gap-4 p-6 sm:p-8`}>
        <span className="flex size-10 shrink-0 items-center justify-center rounded-full border border-ink bg-lime text-ink">
          <Check className="size-4" strokeWidth={1.75} aria-hidden />
        </span>
        <div>
          <p className="font-display text-2xl">You are all caught up</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Nothing is waiting for your review. New updates will show up here before anything is shared.
          </p>
        </div>
      </div>
    );
  }
  const { entry, observations } = first;
  const annotations = observations.map((o) => ({
    id: o.id,
    quote: o.patientQuote,
    category: o.category,
    label: o.label,
  }));

  return (
    <div className={`${CARD} p-5 sm:p-8`}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <span className="inline-flex h-6 items-center gap-1.5 rounded-full border border-amber bg-amber px-2.5 text-xs font-medium text-ink">
          <Clock className="size-3" strokeWidth={1.75} aria-hidden />
          Pending your review
        </span>
        <SourceBadge source={entry.source} />
        <time dateTime={entry.occurredAt} className="eyebrow text-muted-foreground">
          {format(new Date(entry.occurredAt), "MMM d, h:mm a")}
        </time>
      </div>

      <div className="mt-6 grid gap-8 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)] lg:gap-12">
        <div className="min-w-0 border-l-2 border-ink pl-5">
          <p className="eyebrow mb-3 text-muted-foreground">In your words</p>
          <div className="line-clamp-6 font-display text-[22px] leading-[1.45] text-ink italic sm:text-2xl">
            <AnnotatedText text={entry.body} annotations={annotations} />
          </div>
          <PrivacyReceipt receipt={first.privacyFilter} audience="patient" />
        </div>
        <div className="min-w-0">
          <p className="eyebrow mb-3 text-muted-foreground">
            {observations.length} structured {observations.length === 1 ? "note" : "notes"} to check · AI draft, unverified
          </p>
          <ul className="divide-y divide-hairline border-y border-hairline">
            {observations.slice(0, 4).map((o) => {
              const tone = categoryTone(o.category);
              return (
                <li key={o.id} className="flex items-center gap-3 py-2.5">
                  <span className="size-2.5 shrink-0 rounded-full" style={{ background: tone.color }} aria-hidden />
                  <span className="min-w-0 flex-1 truncate text-sm">{o.label}</span>
                  {o.severity !== null ? (
                    <span className="font-mono text-sm tabular-nums">{o.severity}/10</span>
                  ) : o.measureValue !== null ? (
                    <span className="font-mono text-sm tabular-nums">
                      {o.measureValue} {o.measureUnit ?? ""}
                    </span>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </div>
      </div>

      <div className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-3 border-t border-hairline pt-6">
        <Link
          href={`/patient/review#entry-${entry.id}`}
          className="group inline-flex h-11 items-center gap-2 rounded-full bg-ink px-6 text-[15px] font-medium text-paper transition-transform active:scale-[0.97] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cobalt"
        >
          Review &amp; share
          <ArrowRight className="size-4 transition-transform group-hover:translate-x-1" strokeWidth={1.75} aria-hidden />
        </Link>
        {pending.length > 1 ? (
          <Link
            href="/patient/review"
            className="text-sm text-cobalt underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cobalt"
          >
            Review &amp; share all ({pending.length})
          </Link>
        ) : null}
        <p className="eyebrow text-muted-foreground">Nothing is shared until you approve it</p>
      </div>
    </div>
  );
}

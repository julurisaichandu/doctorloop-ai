import type { ReactNode } from "react";
import { format, isToday, isYesterday } from "date-fns";
import { CalendarClock } from "lucide-react";
import { Reveal } from "@/components/motion/reveal";
import { EmptyState } from "@/components/shared/empty-state";
import { EntryCard } from "@/components/shared/entry-card";
import { LoopTracker } from "@/components/viz/loop-tracker";
import { categoryTone } from "@/components/viz/palette";
import type { TimelineEntryView } from "@/lib/domain/types";
import { cn } from "@/lib/utils";

function dayLabel(date: Date): string {
  if (isToday(date)) return "Today";
  if (isYesterday(date)) return "Yesterday";
  return format(date, "EEE, MMM d");
}

function groupByDay(items: TimelineEntryView[]) {
  const groups = new Map<string, { key: string; date: Date; items: TimelineEntryView[] }>();
  for (const item of items) {
    const date = new Date(item.entry.occurredAt);
    const key = format(date, "yyyy-MM-dd");
    const group = groups.get(key) ?? { key, date, items: [] };
    group.items.push(item);
    groups.set(key, group);
  }
  return [...groups.values()];
}

/** The patient's own timeline: serif day headers, a thin rule with category dots, and a compact loop per entry. */
export function PatientTimeline({
  items,
  renderActions,
  emptyTitle,
  emptyDescription,
  emptyAction,
}: {
  items: TimelineEntryView[];
  renderActions?: (item: TimelineEntryView) => ReactNode;
  emptyTitle: string;
  emptyDescription?: string;
  emptyAction?: ReactNode;
}) {
  if (items.length === 0) {
    return <EmptyState icon={CalendarClock} title={emptyTitle} description={emptyDescription} action={emptyAction} />;
  }

  return (
    <div className="space-y-12">
      {groupByDay(items).map((group) => (
        <section key={group.key} aria-label={dayLabel(group.date)}>
          <Reveal>
            <h3 className="mb-5 flex items-baseline gap-3">
              <span className="font-display text-3xl tracking-normal sm:text-4xl">{dayLabel(group.date)}</span>
              <span className="eyebrow text-muted-foreground">
                {group.items.length} {group.items.length === 1 ? "update" : "updates"}
              </span>
            </h3>
          </Reveal>
          <ol className="relative space-y-5 border-l border-hairline pl-5 sm:pl-8">
            {group.items.map((item) => {
              const first = item.observations[0];
              const dot = first ? categoryTone(first.category).dot : "bg-ink";
              return (
                <Reveal as="li" key={item.entry.id} className="relative">
                  <span
                    className={cn(
                      "absolute top-8 -left-[26px] size-2.5 rounded-full ring-4 ring-background sm:-left-[38px]",
                      dot,
                    )}
                    aria-hidden
                  />
                  <EntryCard
                    item={item}
                    id={`entry-${item.entry.id}`}
                    actions={renderActions?.(item)}
                    footer={<LoopTracker item={item} compact />}
                  />
                </Reveal>
              );
            })}
          </ol>
        </section>
      ))}
    </div>
  );
}

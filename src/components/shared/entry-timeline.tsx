import type { ReactNode } from "react";
import { format, isToday, isYesterday } from "date-fns";
import { CalendarClock } from "lucide-react";
import type { TimelineEntryView } from "@/lib/domain/types";
import { categoryTone } from "@/components/viz/palette";
import { cn } from "@/lib/utils";
import { EmptyState } from "./empty-state";
import { EntryCard } from "./entry-card";

function dayLabel(date: Date): string {
  if (isToday(date)) return "Today";
  if (isYesterday(date)) return "Yesterday";
  return format(date, "EEE, MMM d");
}

function groupByDay(items: TimelineEntryView[]): { key: string; date: Date; items: TimelineEntryView[] }[] {
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

export function EntryTimeline({
  items,
  renderActions,
  emptyTitle = "Nothing here yet",
  emptyDescription,
}: {
  items: TimelineEntryView[];
  renderActions?: (item: TimelineEntryView) => ReactNode;
  emptyTitle?: string;
  emptyDescription?: string;
}) {
  if (items.length === 0) {
    return <EmptyState icon={CalendarClock} title={emptyTitle} description={emptyDescription} />;
  }

  return (
    <div className="space-y-10">
      {groupByDay(items).map((group) => (
        <section key={group.key} aria-label={dayLabel(group.date)}>
          <h3 className="mb-4 flex items-baseline gap-3 bg-background py-1">
            <span className="font-display text-3xl tracking-normal sm:text-4xl">{dayLabel(group.date)}</span>
            <span className="eyebrow text-muted-foreground">
              {group.items.length} {group.items.length === 1 ? "update" : "updates"}
            </span>
          </h3>
          <ol className="relative space-y-4 border-l border-hairline pl-5 sm:pl-7">
            {group.items.map((item) => {
              const first = item.observations[0];
              const dot = first ? categoryTone(first.category).dot : "bg-ink";
              return (
                <li key={item.entry.id} className="relative">
                  <span
                    className={cn(
                      "absolute top-7 -left-[26px] size-2.5 rounded-full ring-4 ring-background sm:-left-[34px]",
                      dot,
                    )}
                    aria-hidden
                  />
                  <EntryCard item={item} id={`entry-${item.entry.id}`} actions={renderActions?.(item)} />
                </li>
              );
            })}
          </ol>
        </section>
      ))}
    </div>
  );
}

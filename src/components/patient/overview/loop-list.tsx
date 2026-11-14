import { format } from "date-fns";
import { RedactedText } from "@/components/shared/redacted-text";
import { SourceBadge } from "@/components/shared/source-badge";
import { LoopTracker } from "@/components/viz/loop-tracker";
import type { TimelineEntryView } from "@/lib/domain/types";

/** Latest entries, each with its loop: Captured to Seen by care team. */
export function LoopList({ items }: { items: TimelineEntryView[] }) {
  if (items.length === 0) {
    return <p className="text-sm text-muted-foreground">No updates yet. Your first check-in will start a loop here.</p>;
  }
  return (
    <ul className="divide-y divide-hairline">
      {items.map((item) => (
        <li key={item.entry.id} className="py-5 first:pt-0 last:pb-0">
          <div className="flex items-center justify-between gap-3">
            <SourceBadge source={item.entry.source} />
            <time dateTime={item.entry.occurredAt} className="eyebrow text-muted-foreground">
              {format(new Date(item.entry.occurredAt), "MMM d, h:mm a")}
            </time>
          </div>
          <p className="mt-3 mb-5 line-clamp-2 font-display text-[19px] leading-snug text-ink italic"><RedactedText text={item.entry.body} /></p>
          <LoopTracker item={item} />
        </li>
      ))}
    </ul>
  );
}

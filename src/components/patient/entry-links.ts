import { format } from "date-fns";
import type { EntrySource, TimelineEntryView } from "@/lib/domain/types";

const SOURCE_LABELS: Record<EntrySource, string> = { voice: "Voice", manual: "Note", vexo: "Vexo" };

export const timelineCitationHref = (entryId: string): string => `/patient/timeline#entry-${entryId}`;

/** Citation tooltip labels such as "Nov 12 · Voice". */
export function entryLabels(entriesById: Record<string, TimelineEntryView>): Record<string, string> {
  return Object.fromEntries(
    Object.entries(entriesById).map(([id, { entry }]) => [
      id,
      `${format(new Date(entry.occurredAt), "MMM d")} · ${SOURCE_LABELS[entry.source]}`,
    ]),
  );
}

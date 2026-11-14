import Link from "next/link";
import { FileText } from "lucide-react";
import type { TimelineEntryView } from "@/lib/domain/types";
import { Button } from "@/components/ui/button";
import { MarkReviewedButton } from "./mark-reviewed-button";

/** Per-entry actions in the shared-updates timeline: review state plus a plain-link record deep link. */
export function EntryActions({ item, patientId }: { item: TimelineEntryView; patientId: string }) {
  return (
    <>
      <Button asChild variant="ghost" size="sm" className="h-8 rounded-full px-3.5">
        <Link href={`/doctor/patients/${patientId}?record=${item.entry.id}`} scroll={false}>
          <FileText />
          Open record
        </Link>
      </Button>
      <MarkReviewedButton entryId={item.entry.id} reviewedAt={item.doctorReview?.reviewedAt ?? null} />
    </>
  );
}

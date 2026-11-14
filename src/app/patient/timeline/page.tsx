import Link from "next/link";
import { ClipboardCheck } from "lucide-react";
import { AddPhotoDialog } from "@/components/patient/add-photo-dialog";
import { HashScroller } from "@/components/patient/hash-scroller";
import { orNotFound } from "@/components/patient/or-not-found";
import { PatientTimeline } from "@/components/patient/patient-timeline";
import { ShareEntryButton, StopSharingButton } from "@/components/patient/sharing-buttons";
import {
  SOURCE_FILTERS,
  STATUS_FILTERS,
  TimelineFilters,
  type SourceFilter,
  type StatusFilter,
} from "@/components/patient/timeline-filters";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { requireActor } from "@/lib/auth/session";
import type { TimelineEntryView } from "@/lib/domain/types";
import { listPatientTimeline } from "@/lib/services/patient";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

function pick<T extends string>(options: { value: T }[], raw: string | undefined, fallback: T): T {
  return options.find((o) => o.value === raw)?.value ?? fallback;
}

function renderActions({ entry }: TimelineEntryView) {
  if (entry.reviewStatus === "pending_review") {
    return (
      <Button asChild size="sm" className="h-8 rounded-full px-3.5">
        <Link href={`/patient/review#entry-${entry.id}`}>
          <ClipboardCheck />
          Review
        </Link>
      </Button>
    );
  }
  if (entry.reviewStatus === "approved") return <StopSharingButton entryId={entry.id} />;
  return <ShareEntryButton entryId={entry.id} />;
}

function emptyCopy(source: SourceFilter, status: StatusFilter): { title: string; description: string } {
  if (source === "all" && status === "all") {
    return {
      title: "No updates yet",
      description: "Record a voice check-in or write a note and it will appear here.",
    };
  }
  if (source !== "all" && status !== "all") {
    return {
      title: "No updates match these filters",
      description: "Try a different source or status, or clear the filters to see everything.",
    };
  }
  if (status === "pending_review") {
    return { title: "Nothing waiting for review", description: "Every update has been decided. Nicely done." };
  }
  if (status === "approved") {
    return { title: "Nothing shared yet", description: "Updates you approve for your care team will show up here." };
  }
  if (status === "rejected") {
    return { title: "No private updates", description: "Updates you keep to yourself will show up here." };
  }
  if (source === "voice") {
    return { title: "No voice check-ins yet", description: "Talk through your day and it will be written down here." };
  }
  if (source === "manual") {
    return { title: "No notes yet", description: "Write a quick note and it will be structured here." };
  }
  return { title: "No Vexo imports yet", description: "Import a health-related memory and it will appear here." };
}

export default async function TimelinePage({ searchParams }: { searchParams: SearchParams }) {
  const [actor, params] = await Promise.all([requireActor("patient"), searchParams]);
  const source = pick<SourceFilter>(SOURCE_FILTERS, first(params.source), "all");
  const status = pick<StatusFilter>(STATUS_FILTERS, first(params.status), "all");

  const items = await orNotFound(
    listPatientTimeline(actor, {
      source: source === "all" ? undefined : source,
      status: status === "all" ? undefined : status,
    }),
  );
  const filtered = source !== "all" || status !== "all";
  const copy = emptyCopy(source, status);

  return (
    <div className="space-y-8">
      <HashScroller />
      <PageHeader
        eyebrow="Timeline"
        title="Your recovery timeline"
        description="Every update you have recorded, newest first, with who can see it."
        actions={<AddPhotoDialog />}
      />
      <TimelineFilters source={source} status={status} />
      <PatientTimeline
        items={items}
        renderActions={renderActions}
        emptyTitle={copy.title}
        emptyDescription={copy.description}
        emptyAction={
          filtered ? (
            <Button asChild variant="outline" className="rounded-full">
              <Link href="/patient/timeline" scroll={false}>
                Clear filters
              </Link>
            </Button>
          ) : (
            <Button asChild className="rounded-full">
              <Link href="/patient/check-in">Add an update</Link>
            </Button>
          )
        }
      />
    </div>
  );
}

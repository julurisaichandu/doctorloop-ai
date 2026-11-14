import { HashScroller } from "@/components/patient/hash-scroller";
import { orNotFound } from "@/components/patient/or-not-found";
import { ReviewBoard } from "@/components/patient/review-board";
import { PageHeader } from "@/components/shared/page-header";
import { requireActor } from "@/lib/auth/session";
import { listPatientTimeline } from "@/lib/services/patient";

const RECENT_LIMIT = 10;

export default async function ReviewPage() {
  const actor = await requireActor("patient");
  const all = await orNotFound(listPatientTimeline(actor));
  const pending = all.filter((i) => i.entry.reviewStatus === "pending_review");
  const decided = all.filter((i) => i.entry.reviewStatus !== "pending_review").slice(0, RECENT_LIMIT);

  return (
    <div className="space-y-8">
      <HashScroller />
      <PageHeader
        eyebrow="Review & share"
        title="Review & share"
        description="Check what the AI wrote down, fix anything that is off, then decide what your care team sees."
      />
      <ReviewBoard pending={pending} decided={decided} />
    </div>
  );
}

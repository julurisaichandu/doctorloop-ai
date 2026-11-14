import Link from "next/link";
import { format } from "date-fns";
import { ArrowLeft, FileSearch, Sparkles } from "lucide-react";
import { DataNotes } from "@/components/doctor/data-notes";
import { EntryActions } from "@/components/doctor/entry-actions";
import { PatientHeader } from "@/components/doctor/patient-header";
import { RecordSheet } from "@/components/doctor/record-sheet";
import { ClinicalDisclaimer } from "@/components/shared/clinical-disclaimer";
import { EmptyState } from "@/components/shared/empty-state";
import { EntryTimeline } from "@/components/shared/entry-timeline";
import { ExplicitChangesList } from "@/components/shared/explicit-changes-list";
import { SummaryView } from "@/components/shared/summary-view";
import { SymptomTrendsChart } from "@/components/shared/symptom-trends-chart";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { requireActor } from "@/lib/auth/session";
import type { Actor, EntrySource, TimelineEntryView } from "@/lib/domain/types";
import { isAppError } from "@/lib/errors";
import { getDoctorPatientDetail, getSharedRecord } from "@/lib/services/doctor";
import { notFound } from "next/navigation";

type PageProps = {
  params: Promise<{ patientId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

const SOURCE_LABEL: Record<EntrySource, string> = { voice: "Voice note", manual: "Note", vexo: "Vexo memory" };

type RecordLookup = { status: "none" } | { status: "missing" } | { status: "found"; item: TimelineEntryView };

async function lookupRecord(actor: Actor, patientId: string, entryId: string): Promise<RecordLookup> {
  if (!entryId) return { status: "none" };
  try {
    const item = await getSharedRecord(actor, entryId);
    // A record of a different patient must look exactly like a missing one.
    return item.entry.patientId === patientId ? { status: "found", item } : { status: "missing" };
  } catch (error) {
    if (isAppError(error) && (error.code === "NOT_FOUND" || error.code === "FORBIDDEN" || error.code === "VALIDATION")) {
      return { status: "missing" };
    }
    throw error;
  }
}

export default async function DoctorPatientDetailPage({ params, searchParams }: PageProps) {
  const { patientId } = await params;
  const query = await searchParams;
  const recordParam = query.record;
  const recordId = (Array.isArray(recordParam) ? recordParam[0] : recordParam) ?? "";

  const actor = await requireActor("doctor");

  const [detail, record] = await Promise.all([
    getDoctorPatientDetail(actor, patientId).catch((error: unknown) => {
      if (isAppError(error) && (error.code === "NOT_FOUND" || error.code === "FORBIDDEN")) notFound();
      throw error;
    }),
    lookupRecord(actor, patientId, recordId),
  ]);

  const entryLabels = Object.fromEntries(
    detail.entries.map((item) => [
      item.entry.id,
      `${format(new Date(item.entry.occurredAt), "MMM d")} · ${SOURCE_LABEL[item.entry.source]}`,
    ]),
  );

  return (
    <div className="space-y-8">
      <Button asChild variant="ghost" size="sm" className="-ml-2 rounded-full">
        <Link href="/doctor">
          <ArrowLeft /> All patients
        </Link>
      </Button>

      <PatientHeader detail={detail} />

      {record.status === "missing" ? (
        <Alert>
          <FileSearch />
          <AlertTitle>Record not available</AlertTitle>
          <AlertDescription>
            That record was not found, or it is not shared with you for this patient.
          </AlertDescription>
        </Alert>
      ) : null}

      <div className="grid gap-10 lg:grid-cols-5">
        <div className="min-w-0 space-y-12 lg:col-span-3">
          <section aria-labelledby="summary-title" className="space-y-4">
            <p className="eyebrow flex items-center gap-2 text-muted-foreground">
              <Sparkles className="size-3.5" strokeWidth={1.5} aria-hidden />
              Pre-visit · AI draft
            </p>
            <h2 id="summary-title" className="font-display text-3xl sm:text-[34px]">
              AI pre-visit summary
            </h2>
            {detail.summary ? (
              <SummaryView
                summary={detail.summary}
                entryLabels={entryLabels}
                citationHref={(entryId) => `/doctor/patients/${patientId}?record=${entryId}`}
              />
            ) : (
              <EmptyState
                icon={Sparkles}
                title="No summary yet"
                description="A pre-visit summary is generated once the patient shares updates. You can also regenerate it above."
              />
            )}
          </section>

          <section aria-labelledby="updates-title" className="space-y-5">
            <p className="eyebrow text-muted-foreground">In the patient&apos;s words</p>
            <h2 id="updates-title" className="font-display text-3xl sm:text-[34px]">
              Shared updates
            </h2>
            <EntryTimeline
              items={detail.entries}
              renderActions={(item) => <EntryActions item={item} patientId={patientId} />}
              emptyTitle="No shared updates yet"
              emptyDescription="Updates appear here after the patient approves sharing them."
            />
          </section>
        </div>

        <aside className="min-w-0 space-y-6 lg:col-span-2">
          <SymptomTrendsChart
            series={detail.trends}
            title="Self-reported symptom trends"
            description="Values come from the patient's own words in shared updates."
          />
          <ExplicitChangesList changes={detail.changes} />
          <DataNotes />
          <ClinicalDisclaimer variant="doctor" />
        </aside>
      </div>

      {record.status === "found" ? <RecordSheet key={record.item.entry.id} item={record.item} /> : null}
    </div>
  );
}

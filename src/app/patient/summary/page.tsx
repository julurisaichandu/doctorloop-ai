import Link from "next/link";
import { format } from "date-fns";
import { FileText, Lock, Stethoscope } from "lucide-react";
import { Reveal } from "@/components/motion/reveal";
import { entryLabels, timelineCitationHref } from "@/components/patient/entry-links";
import { orNotFound } from "@/components/patient/or-not-found";
import { RegenerateSummaryButton } from "@/components/patient/regenerate-summary-button";
import { StatStrip } from "@/components/patient/stat-strip";
import { ClinicalDisclaimer } from "@/components/shared/clinical-disclaimer";
import { EmptyState } from "@/components/shared/empty-state";
import { RedactedText } from "@/components/shared/redacted-text";
import { SummaryView } from "@/components/shared/summary-view";
import { requireActor } from "@/lib/auth/session";
import type { GeneratedSummary, TimelineEntryView } from "@/lib/domain/types";
import { getPatientSummaries } from "@/lib/services/patient";

/** "Week of Nov 7–13", or "Week of Oct 30 – Nov 5" across months. */
function weekTitle(summary: GeneratedSummary | null): string {
  if (!summary) return "This week";
  const start = new Date(summary.periodStart);
  const end = new Date(summary.periodEnd);
  if (start.getMonth() === end.getMonth() && start.getFullYear() === end.getFullYear()) {
    return `Week of ${format(start, "MMM d")}–${format(end, "d")}`;
  }
  return `Week of ${format(start, "MMM d")} – ${format(end, "MMM d")}`;
}

/** Same numbering as SummaryView: order of first citation across the four lists. */
function footnotes(summary: GeneratedSummary): string[] {
  const c = summary.content;
  const order: string[] = [];
  for (const item of [...c.mainConcerns, ...c.changesSinceEarlier, ...c.recoveryActivities, ...c.patientQuestions]) {
    for (const id of item.citations) if (!order.includes(id)) order.push(id);
  }
  return order;
}

const SOURCE_NAME = { voice: "Voice", manual: "Note", vexo: "Vexo" } as const;

function Footnotes({ ids, entries }: { ids: string[]; entries: Record<string, TimelineEntryView> }) {
  const rows = ids.map((id, i) => ({ id, n: i + 1, view: entries[id] })).filter((r) => r.view);
  if (rows.length === 0) return null;
  return (
    <section aria-label="Sources" className="mt-8 border-t border-hairline pt-5">
      <h3 className="eyebrow mb-3 text-muted-foreground">Sources · your own words</h3>
      <ol className="divide-y divide-hairline">
        {rows.map(({ id, n, view }) => (
          <li key={id}>
            <Link
              href={timelineCitationHref(id)}
              className="group flex items-baseline gap-3 py-3 outline-none focus-visible:bg-paper-3"
            >
              <span className="inline-flex h-5 min-w-5 shrink-0 translate-y-0.5 items-center justify-center rounded-full bg-lime px-1.5 font-mono text-[11px] font-semibold text-ink">
                {n}
              </span>
              <span className="min-w-0 flex-1">
                <span className="eyebrow block text-muted-foreground">
                  {format(new Date(view.entry.occurredAt), "MMM d")} · {SOURCE_NAME[view.entry.source]}
                </span>
                <span className="font-display line-clamp-2 text-lg leading-snug italic group-hover:underline">
                  <RedactedText text={view.entry.body} />
                </span>
              </span>
            </Link>
          </li>
        ))}
      </ol>
    </section>
  );
}

export default async function SummaryPage() {
  const actor = await requireActor("patient");
  const { weekly, clinician, entriesById } = await orNotFound(getPatientSummaries(actor));
  const labels = entryLabels(entriesById);

  const weeklyViews = (weekly?.sourceEntryIds ?? []).map((id) => entriesById[id]).filter(Boolean);
  const trackedSymptoms = new Set(
    weeklyViews.flatMap((v) => v.observations.filter((o) => o.category === "symptom").map((o) => (o.bodySite ?? o.label).toLowerCase())),
  ).size;
  const stats = [
    { label: "Updates", value: weekly?.sourceEntryIds.length ?? 0, hint: "recorded this week" },
    {
      label: "Shared",
      value: weeklyViews.filter((v) => v.entry.reviewStatus === "approved").length,
      hint: "approved by you",
    },
    { label: "Symptoms tracked", value: trackedSymptoms, hint: "self-reported" },
    { label: "Questions", value: weekly?.content.patientQuestions.length ?? 0, hint: "to ask your care team" },
  ];

  return (
    <div className="space-y-12">
      <header className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <p className="eyebrow mb-3 flex items-center gap-2 text-muted-foreground">
            <span className="h-px w-5 bg-ink" aria-hidden />
            Summaries · weekly report
          </p>
          <h1 className="font-display text-5xl leading-[1.02] text-balance sm:text-7xl">
            {weekTitle(weekly)}
          </h1>
          <p className="mt-4 max-w-2xl text-[15px] leading-relaxed text-muted-foreground sm:text-base">
            Two AI-written recaps built from your own updates. Every point links back to the original entry.
          </p>
        </div>
        {weekly ? (
          <div className="shrink-0">
            <RegenerateSummaryButton />
          </div>
        ) : null}
      </header>

      <Reveal>
        <StatStrip stats={stats} />
      </Reveal>

      <div className="grid items-start gap-10 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <section className="min-w-0" aria-labelledby="weekly-title">
          <h2 id="weekly-title" className="font-display text-3xl sm:text-[34px]">
            Your weekly recovery summary
          </h2>
          <p className="mt-1 mb-5 text-sm text-muted-foreground">
            Covers your last 7 days, including updates you have not shared yet.
          </p>
          {weekly ? (
            <>
              <SummaryView summary={weekly} citationHref={timelineCitationHref} entryLabels={labels} />
              <Footnotes ids={footnotes(weekly)} entries={entriesById} />
            </>
          ) : (
            <EmptyState
              icon={FileText}
              title="No weekly summary yet"
              description="Add an update, then generate a recap of your week."
              action={<RegenerateSummaryButton label="Generate summary" />}
            />
          )}
        </section>

        <section className="min-w-0 lg:sticky lg:top-20" aria-labelledby="clinician-title">
          <h2 id="clinician-title" className="font-display text-3xl sm:text-[34px]">
            What your care team sees
          </h2>
          <p className="mt-1 mb-5 flex items-start gap-2 text-sm text-muted-foreground">
            <Lock className="mt-0.5 size-3.5 shrink-0" strokeWidth={1.75} aria-hidden />
            Built only from entries you approved. Private and pending updates are never included.
          </p>
          {clinician ? (
            <>
              <SummaryView summary={clinician} citationHref={timelineCitationHref} entryLabels={labels} />
              <p className="eyebrow mt-3 text-muted-foreground">
                Built from {clinician.sourceEntryIds.length} approved{" "}
                {clinician.sourceEntryIds.length === 1 ? "entry" : "entries"}
              </p>
            </>
          ) : (
            <EmptyState
              icon={Stethoscope}
              title="Nothing shared yet"
              description="Once you approve an update, your care team will see a summary of the entries you shared."
            />
          )}
        </section>
      </div>

      <ClinicalDisclaimer variant="patient" />
    </div>
  );
}

"use client";

import { useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { format } from "date-fns";
import type { TimelineEntryView } from "@/lib/domain/types";
import { AiGeneratedLabel } from "@/components/shared/ai-generated-label";
import { EntryPhoto, photoOf } from "@/components/shared/entry-photo";
import { ObservationItem } from "@/components/shared/observation-item";
import { PatientQuote } from "@/components/shared/patient-quote";
import { isBandReplay, SourceBadge } from "@/components/shared/source-badge";
import { Timestamp } from "@/components/shared/timestamp";
import { PrivacyReceipt } from "@/components/shared/privacy-receipt";
import { AnnotatedText, type Annotation } from "@/components/viz/annotated-text";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { MarkReviewedButton } from "./mark-reviewed-button";

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[6.5rem_1fr] gap-3 border-b border-hairline py-2 text-sm last:border-b-0">
      <dt className="eyebrow pt-0.5 text-muted-foreground">{label}</dt>
      <dd className="min-w-0 break-words">{children}</dd>
    </div>
  );
}

function metadataText(metadata: Record<string, unknown>, key: string): string | null {
  const value = metadata[key];
  return typeof value === "string" && value.length > 0 ? value : null;
}

function Provenance({ item }: { item: TimelineEntryView }) {
  const ref = item.sourceRef;
  if (!ref) {
    return <p className="text-sm text-muted-foreground">Manual note typed by the patient. No external source.</p>;
  }
  const tool = metadataText(ref.metadata, "tool");
  const query = metadataText(ref.metadata, "query");
  const trimmed = ref.metadata.trimmed === true;
  const mcpServer = metadataText(ref.metadata, "mcpServer");
  const replayFile = metadataText(ref.metadata, "replayFile");
  const transcriptSource = metadataText(ref.metadata, "transcriptSource");
  const transcriptLabel =
    transcriptSource === "elevenlabs_api"
      ? "Transcript fetched from ElevenLabs"
      : transcriptSource === "client_unverified"
        ? "Transcript captured in the browser (unverified)"
        : transcriptSource === "simulated"
          ? "Simulated check-in"
          : null;
  const heading =
    ref.provider === "vexo" ? "Vexo memory" : ref.provider === "elevenlabs" ? "ElevenLabs conversation" : "Manual note";

  return (
    <dl>
      <Fact label="Source">
        {heading}
        {replayFile ? " (simulated, replayed from band file)" : ref.mode !== "live" ? ` (${ref.mode})` : ""}
      </Fact>
      {replayFile ? <Fact label="Replayed from">{replayFile}</Fact> : null}
      {ref.externalId ? (
        <Fact label={ref.provider === "elevenlabs" ? "Conversation id" : "Memory id"}>
          <code className="rounded bg-paper-3 px-1.5 py-0.5 font-mono text-xs">{ref.externalId}</code>
        </Fact>
      ) : null}
      {ref.sourceTimestamp ? (
        <Fact label="Original time">{format(new Date(ref.sourceTimestamp), "MMM d, yyyy 'at' h:mm a")}</Fact>
      ) : null}
      {transcriptLabel ? <Fact label="Transcript">{transcriptLabel}</Fact> : null}
      {tool ? <Fact label="Tool">{mcpServer ? `${tool} (${mcpServer})` : tool}</Fact> : null}
      {query ? <Fact label="Query">{`“${query}”`}</Fact> : null}
      {trimmed ? <Fact label="Edited">Trimmed by patient before sharing</Fact> : null}
      {ref.title ? <Fact label="Title">{ref.title}</Fact> : null}
    </dl>
  );
}

/** The patient's words with highlighted quotes, linked to the observation list (hover or focus). */
function RecordEvidence({ item }: { item: TimelineEntryView }) {
  const { entry, observations } = item;
  const [activeId, setActiveId] = useState<string | null>(null);
  const annotations: Annotation[] = useMemo(
    () =>
      observations
        .filter((o) => o.patientQuote)
        .map((o) => ({ id: o.id, quote: o.patientQuote, category: o.category, label: o.label })),
    [observations],
  );

  const photo = photoOf(item.sourceRef);
  return (
    <>
      {entry.body ? (
        <PatientQuote className="text-[1.05rem]">
          <AnnotatedText text={entry.body} annotations={annotations} activeId={activeId} onActiveChange={setActiveId} />
        </PatientQuote>
      ) : null}
      {photo ? <EntryPhoto photo={photo} /> : null}
      <PrivacyReceipt receipt={item.privacyFilter} audience="doctor" className="mt-0" />

      <section aria-label="Provenance" className="space-y-2">
        <h3 className="eyebrow text-muted-foreground">Provenance</h3>
        <div className="rounded-2xl border border-hairline bg-paper px-4 py-1">
          <Provenance item={item} />
        </div>
      </section>

      <section aria-label="AI-extracted observations" className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="eyebrow text-muted-foreground">Extracted observations</h3>
          <AiGeneratedLabel compact provider={observations[0]?.extractedBy} model={observations[0]?.model} />
        </div>
        {observations.length > 0 ? (
          observations.map((o) => (
            <ObservationItem
              key={o.id}
              observation={o}
              active={activeId === o.id}
              onActiveChange={(on) => setActiveId(on ? o.id : null)}
            />
          ))
        ) : (
          <p className="text-sm text-muted-foreground">No observations were extracted from this record.</p>
        )}
      </section>
    </>
  );
}

export function RecordSheet({ item }: { item: TimelineEntryView }) {
  const router = useRouter();
  const pathname = usePathname();
  const [open, setOpen] = useState(true);
  const { entry, sourceRef } = item;

  function onOpenChange(next: boolean) {
    setOpen(next);
    if (!next) router.replace(pathname, { scroll: false });
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full gap-0 overflow-y-auto border-l border-hairline bg-paper-2 data-[side=right]:sm:max-w-lg">
        <SheetHeader className="gap-2 border-b border-hairline p-6 pr-14">
          <p className="eyebrow text-muted-foreground">Clinician view · read only</p>
          <SheetTitle className="font-display text-3xl leading-tight font-normal">
            Original patient-approved record
          </SheetTitle>
          <SheetDescription>Exactly what the patient chose to share with their care team.</SheetDescription>
        </SheetHeader>

        <div className="space-y-7 p-6">
          <div className="flex flex-wrap items-center gap-2">
            <SourceBadge source={entry.source} mode={sourceRef?.mode} replay={isBandReplay(sourceRef)} />
            <span className="eyebrow text-muted-foreground">
              {entry.source === "manual" ? "typed note" : `${entry.source} source`}
            </span>
          </div>

          <dl className="rounded-2xl border border-hairline bg-paper px-4 py-1">
            <Fact label="Happened">
              <Timestamp value={entry.occurredAt} className="text-sm text-foreground" />
            </Fact>
            <Fact label="Recorded">
              <Timestamp value={entry.createdAt} className="text-sm text-foreground" />
            </Fact>
            <Fact label="Shared">
              {entry.reviewedByPatientAt ? (
                <>
                  Approved by patient <Timestamp value={entry.reviewedByPatientAt} className="text-sm text-foreground" />
                </>
              ) : (
                "Approved by patient"
              )}
            </Fact>
            {entry.editedByPatient ? <Fact label="Edits">Edited by patient before sharing</Fact> : null}
          </dl>

          <RecordEvidence item={item} />
        </div>

        <div className="sticky bottom-0 mt-auto flex justify-end border-t border-hairline bg-paper-2 p-4">
          <MarkReviewedButton entryId={entry.id} reviewedAt={item.doctorReview?.reviewedAt ?? null} />
        </div>
      </SheetContent>
    </Sheet>
  );
}

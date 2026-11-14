import type { ReactNode } from "react";
import { format } from "date-fns";
import { AlertTriangle } from "lucide-react";
import type { SourceReference, TimelineEntryView } from "@/lib/domain/types";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";
import { DoctorReviewBadge } from "./doctor-review-badge";
import { EntryEvidence } from "./entry-evidence";
import { EntryPhoto } from "./entry-photo";
import { photoOf } from "./photo-of";
import { PrivacyReceipt } from "./privacy-receipt";
import { ReviewStatusBadge } from "./review-status-badge";
import { isBandReplay, SourceBadge } from "./source-badge";
import { Timestamp } from "./timestamp";

function provenance(ref: SourceReference): string {
  const md = ref.metadata ?? {};
  const str = (k: string) => (typeof md[k] === "string" && (md[k] as string).length > 0 ? (md[k] as string) : null);
  const original = ref.sourceTimestamp ? ` · original time ${format(new Date(ref.sourceTimestamp), "MMM d, h:mm a")}` : "";
  const title = ref.title ? ` “${ref.title}”` : "";
  const ext = ref.externalId ? ` · id ${ref.externalId}` : "";
  if (ref.provider === "vexo" && md.tool === "band") {
    // Doctor views carry only bandNumber + sttProvider; every other part drops out cleanly.
    const parts = [`Vexo band${typeof md.bandNumber === "number" ? ` ${md.bandNumber}` : ""}${ref.mode === "simulated" ? " (simulated)" : ""}`];
    const stt = str("sttProvider");
    if (stt === "deepgram") parts.push(`transcribed by Deepgram${str("sttModel") ? ` ${str("sttModel")}` : ""}`);
    if (stt === "typed") parts.push("typed transcript (no audio)");
    const gate = str("gateProvider");
    if (gate === "gemini") parts.push("kept by the Gemini Decisions privacy gate");
    if (gate === "rule-based") {
      parts.push(md.gateFallback === true ? "kept by the rule-based privacy gate (Gemini fallback)" : "kept by the rule-based privacy gate");
    }
    return `${parts.join(" · ")}${original}${ext}`;
  }
  if (ref.provider === "vexo") {
    const tool = str("tool");
    const query = str("query");
    const replayFile = str("replayFile");
    if (replayFile) {
      return `Vexo memory (simulated, replayed from band file ${replayFile}, not live)${tool ? ` via ${tool}` : ""}${query ? ` · query “${query}”` : ""}${md.trimmed === true ? " · trimmed by patient" : ""}${title}${original}${ext}`;
    }
    return `Vexo memory${tool ? ` via ${tool}` : ""}${query ? ` · query “${query}”` : ""}${md.trimmed === true ? " · trimmed by patient" : ""}${title}${original}${ext}`;
  }
  if (ref.provider === "elevenlabs") {
    const ts = str("transcriptSource");
    const label =
      ts === "elevenlabs_api"
        ? "Transcript fetched from ElevenLabs"
        : ts === "client_unverified"
          ? "Transcript captured in the browser (unverified)"
          : ts === "simulated"
            ? "Simulated check-in"
            : "ElevenLabs conversation";
    return `${label}${title}${original}${ext}`;
  }
  if (md.tool === "pipecat") {
    return `Voice check-in with the Pipecat agent (Deepgram + OpenAI) · transcript captured in the browser (unverified)${original}`;
  }
  if (md.kind === "photo") return `Photo added by the patient${original}`;
  return `Manual note${title}${original}`;
}

export function EntryCard({
  item,
  actions,
  footer,
  highlight = false,
  id,
}: {
  item: TimelineEntryView;
  actions?: ReactNode;
  footer?: ReactNode;
  highlight?: boolean;
  id?: string;
}) {
  const { entry, observations, sourceRef } = item;
  const aiProvider = observations[0]?.extractedBy;
  const aiModel = observations[0]?.model ?? null;

  const photo = photoOf(sourceRef);
  const meta = (
    <>
      {photo ? <EntryPhoto photo={photo} className="mt-3 ml-9" /> : null}
      {entry.editedByPatient ? <p className="eyebrow mt-2 pl-9 text-muted-foreground">Edited by patient</p> : null}
      {sourceRef ? <p className="mt-2 pl-9 font-mono text-xs text-muted-foreground">{provenance(sourceRef)}</p> : null}
      <PrivacyReceipt
        receipt={item.privacyFilter}
        audience={item.doctorReview !== undefined ? "doctor" : "patient"}
        className="ml-9"
      />
    </>
  );

  return (
    <article
      id={id}
      className={cn(
        "scroll-mt-24 rounded-[20px] border border-hairline bg-paper-2 p-5 transition-[box-shadow,border-color] duration-200 sm:p-6",
        highlight && "border-ink ring-2 ring-ink",
      )}
    >
      <header className="flex flex-wrap items-center gap-2">
        <SourceBadge source={entry.source} mode={sourceRef?.mode} replay={isBandReplay(sourceRef)} />
        <ReviewStatusBadge status={entry.reviewStatus} />
        {item.doctorReview !== undefined ? <DoctorReviewBadge reviewed={item.doctorReview !== null} /> : null}
        <div className="ml-auto flex flex-col items-end leading-tight">
          <Timestamp value={entry.occurredAt} className="font-medium text-foreground" />
          <span className="font-mono text-[11px] text-muted-foreground">
            recorded <Timestamp value={entry.createdAt} className="text-[11px]" />
          </span>
        </div>
      </header>

      <EntryEvidence
        body={entry.body}
        observations={observations}
        meta={meta}
        aiProvider={aiProvider}
        aiModel={aiModel}
      />

      {entry.processingStatus === "processing" ? (
        <p
          className="mt-4 flex items-center gap-2 rounded-2xl bg-ink px-4 py-2.5 text-sm text-paper"
          role="status"
        >
          <Spinner className="size-4 text-lime" />
          AI is structuring this update…
        </p>
      ) : null}
      {entry.processingStatus === "failed" ? (
        <Alert variant="destructive" className="mt-4">
          <AlertTriangle />
          <AlertTitle>Could not structure this update</AlertTitle>
          <AlertDescription>
            {entry.processingError ?? "Processing failed."} Your original words are saved.
          </AlertDescription>
        </Alert>
      ) : null}

      {actions ? <div className="mt-5 flex flex-wrap justify-end gap-2">{actions}</div> : null}
      {footer ? <div className="mt-4 border-t border-hairline pt-3">{footer}</div> : null}
    </article>
  );
}

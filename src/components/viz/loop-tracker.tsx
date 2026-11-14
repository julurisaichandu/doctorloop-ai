import { format } from "date-fns";
import { CircleAlert, Eye, Layers, Lock, PenLine, Share2, UserCheck, type LucideIcon } from "lucide-react";
import { DrawPath } from "@/components/motion/draw-path";
import type { TimelineEntryView } from "@/lib/domain/types";
import { cn } from "@/lib/utils";

type StageState = "done" | "todo" | "failed" | "private";

interface Stage {
  key: string;
  label: string;
  detail: string | null;
  state: StageState;
  Icon: LucideIcon;
}

/** The five stops of the loop for one entry. Pure; derives everything from the view. */
export function loopStages(item: TimelineEntryView): Stage[] {
  const { entry, careTeamReview } = item;
  const reviewed = entry.reviewStatus !== "pending_review";
  const approved = entry.reviewStatus === "approved";
  const priv = entry.reviewStatus === "rejected";
  return [
    { key: "captured", label: "Captured", detail: format(new Date(entry.occurredAt), "MMM d"), state: "done", Icon: PenLine },
    {
      key: "structured",
      label: entry.processingStatus === "failed" ? "Not structured" : "Structured",
      detail: entry.processingStatus === "processing" ? "In progress" : null,
      state: entry.processingStatus === "processed" ? "done" : entry.processingStatus === "failed" ? "failed" : "todo",
      Icon: entry.processingStatus === "failed" ? CircleAlert : Layers,
    },
    {
      key: "reviewed",
      label: "Reviewed by you",
      detail: reviewed && entry.reviewedByPatientAt ? format(new Date(entry.reviewedByPatientAt), "MMM d") : "Waiting",
      state: reviewed ? "done" : "todo",
      Icon: UserCheck,
    },
    {
      key: "shared",
      label: priv ? "Kept private" : "Shared",
      detail: approved ? "With care team" : priv ? "Only you" : null,
      state: approved ? "done" : priv ? "private" : "todo",
      Icon: priv ? Lock : Share2,
    },
    {
      key: "seen",
      label: "Seen by care team",
      detail: careTeamReview
        ? `${careTeamReview.doctorName}\n${format(new Date(careTeamReview.reviewedAt), "MMM d, h:mm a")}`
        : approved
          ? "Not yet"
          : null,
      state: careTeamReview ? "done" : "todo",
      Icon: Eye,
    },
  ];
}

function summarize(stages: Stage[]): string {
  return stages
    .map((s) => `${s.label}${s.state === "done" ? " (done)" : s.state === "todo" ? " (not yet)" : s.state === "failed" ? " (failed)" : ""}${s.detail && s.state === "done" && s.key === "seen" ? `: ${s.detail.replace("\n", ", ")}` : ""}`)
    .join(", ");
}

/**
 * Captured → Structured → Reviewed by you → Shared → Seen by care team, for one entry.
 * Never color-only: every stop has an icon and a label; completed stops are lime fills with ink icons.
 */
export function LoopTracker({ item, compact }: { item: TimelineEntryView; compact?: boolean }) {
  const stages = loopStages(item);
  const lastDone = stages.reduce((acc, s, i) => (s.state === "done" || s.state === "private" ? i : acc), 0);
  const summary = summarize(stages);

  if (compact) {
    return (
      <span
        role="img"
        aria-label={`Update progress: ${summary}`}
        title={summary}
        className="inline-flex items-center"
      >
        {stages.map((s, i) => (
          <span key={s.key} className="inline-flex items-center">
            {i > 0 ? (
              <span className={cn("h-px w-2", i <= lastDone ? "bg-ink" : "bg-hairline")} aria-hidden />
            ) : null}
            <span
              aria-hidden
              className={cn(
                "size-2 rounded-full border",
                s.state === "done" && "border-ink bg-lime",
                s.state === "private" && "border-ink bg-paper-3",
                s.state === "failed" && "border-ink bg-paper",
                s.state === "todo" && "border-bone bg-transparent",
              )}
            />
          </span>
        ))}
      </span>
    );
  }

  // Nodes sit at the centre of five equal columns: 10%, 30%, 50%, 70%, 90%.
  const end = 10 + lastDone * 20;
  return (
    <div className="relative">
      <svg
        aria-hidden
        viewBox="0 0 100 3"
        preserveAspectRatio="none"
        className="pointer-events-none absolute top-[11px] left-0 h-[3px] w-full overflow-visible"
      >
        <path d="M10 1.5H90" stroke="var(--hairline)" strokeWidth={3} fill="none" />
        {lastDone > 0 ? <DrawPath d={`M10 1.5H${end}`} strokeWidth={3} className="text-lime-deep" /> : null}
      </svg>
      <ol aria-label="Update progress" className="relative grid grid-cols-5">
        {stages.map((s) => (
          <li key={s.key} className="flex min-w-0 flex-col items-center px-0.5 text-center">
            <span
              className={cn(
                "flex size-6 items-center justify-center rounded-full border",
                s.state === "done" && "border-ink bg-lime text-ink",
                s.state === "private" && "border-ink bg-paper-3 text-ink",
                s.state === "failed" && "border-ink bg-paper-2 text-ink",
                s.state === "todo" && "border-hairline bg-paper-2 text-bone",
              )}
            >
              <s.Icon className="size-3" strokeWidth={1.75} aria-hidden />
            </span>
            <span className={cn("mt-2 text-[11px] leading-tight font-medium", s.state === "todo" ? "text-muted-foreground" : "text-ink")}>
              {s.label}
            </span>
            {s.detail ? (
              <span className="mt-0.5 font-mono text-[10px] leading-tight break-words whitespace-pre-line text-muted-foreground">{s.detail}</span>
            ) : null}
            <span className="sr-only">{s.state === "done" ? ", done" : s.state === "todo" ? ", not yet" : s.state === "failed" ? ", failed" : ""}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}

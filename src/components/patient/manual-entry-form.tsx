"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { ArrowRight, Plus, RefreshCw, Send } from "lucide-react";
import { createManualEntryAction, reprocessEntryAction } from "@/app/patient/actions";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import type { TimelineEntryView } from "@/lib/domain/types";
import { cn } from "@/lib/utils";
import { ProcessingSequence } from "./quick-log/processing-sequence";
import { QuickLog } from "./quick-log/quick-log";
import { StructuredEntry, SavedHeader } from "./quick-log/structuring-result";
import { arrowNudge, pillOutline, pillPrimary } from "./quick-log/styles";
import { useServerAction } from "./use-action";

const MAX_LENGTH = 20000;

const PROMPTS = [
  { label: "How's your pain?", starter: "My pain today is " },
  { label: "How did you sleep?", starter: "Last night I slept " },
  { label: "What did you do today?", starter: "Today I " },
  { label: "Questions for your care team", starter: "I'd like to ask my care team about " },
] as const;

type When = "now" | "earlier" | "yesterday";

const WHEN_LABELS: Record<When, string> = {
  now: "Just now",
  earlier: "Earlier today",
  yesterday: "Yesterday",
};

function occurredAtFor(when: When): string {
  const now = new Date();
  if (when === "now") return now.toISOString();
  if (when === "earlier") {
    const startOfDay = new Date(now);
    startOfDay.setHours(0, 0, 0, 0);
    return new Date(Math.max(now.getTime() - 3 * 3_600_000, startOfDay.getTime())).toISOString();
  }
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  yesterday.setHours(12, 0, 0, 0);
  return yesterday.toISOString();
}

export function ManualEntryForm() {
  const [text, setText] = useState("");
  const [when, setWhen] = useState<When>("now");
  const [created, setCreated] = useState<TimelineEntryView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const submit = useServerAction();
  const retry = useServerAction();

  const trimmed = text.trim();
  const tooLong = text.length > MAX_LENGTH;

  function focusEnd() {
    requestAnimationFrame(() => {
      const el = textareaRef.current;
      if (!el) return;
      el.focus();
      el.setSelectionRange(el.value.length, el.value.length);
    });
  }

  function insertStarter(starter: string) {
    setText((current) => (current.trim() === "" ? starter : `${current.replace(/\s+$/, "")}\n\n${starter}`));
    focusEnd();
  }

  /** Quick-log sentences join the patient's own text; they stay fully editable. */
  function insertSentences(sentences: string[]) {
    const joined = sentences.join(" ");
    setText((current) => (current.trim() === "" ? joined : `${current.replace(/\s+$/, "")}\n${joined}`));
    focusEnd();
  }

  function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!trimmed || tooLong) return;
    setError(null);
    submit.run(() => createManualEntryAction({ body: trimmed, occurredAt: occurredAtFor(when) }), {
      onSuccess: (entry) => setCreated(entry),
      onError: setError,
    });
  }

  function reset() {
    setCreated(null);
    setText("");
    setWhen("now");
    setError(null);
  }

  if (created) {
    const failed = created.entry.processingStatus === "failed";
    return (
      <div className="space-y-5">
        <SavedHeader
          title="Your update is saved"
          description="It is private until you review it. Check the structured notes below, then choose whether to share."
        />
        <StructuredEntry item={created} />
        <div className="flex flex-wrap gap-2.5">
          {failed ? (
            <Button
              variant="outline"
              className={pillOutline}
              disabled={retry.pending}
              onClick={() =>
                retry.run(() => reprocessEntryAction({ entryId: created.entry.id }), {
                  success: "Update structured.",
                  onSuccess: setCreated,
                })
              }
            >
              {retry.pending ? <Spinner /> : <RefreshCw />}
              {retry.pending ? "Retrying…" : "Retry structuring"}
            </Button>
          ) : null}
          <Button asChild className={pillPrimary}>
            <Link href={`/patient/review#entry-${created.entry.id}`}>
              Review &amp; share
              <ArrowRight className={arrowNudge} aria-hidden />
            </Link>
          </Button>
          <Button variant="outline" className={pillOutline} onClick={reset}>
            <Plus />
            Add another
          </Button>
        </div>
      </div>
    );
  }

  if (submit.pending) {
    return <ProcessingSequence words={trimmed} />;
  }

  return (
    <form onSubmit={onSubmit} className="space-y-5" aria-busy={submit.pending}>
      <div className="rounded-[28px] border border-hairline bg-paper-2 p-5 sm:p-7">
        <p className="eyebrow flex items-center gap-2 text-muted-foreground">
          <span className="h-px w-5 bg-ink" aria-hidden />
          Write an update
        </p>
        <p className="mt-3 max-w-xl text-[15px] text-muted-foreground">
          Write it the way you would say it. AI will structure it into notes you can edit before anything is shared.
        </p>

        <div className="mt-5 space-y-2">
          <Label htmlFor="entry-body" className="eyebrow text-muted-foreground">
            Your update
          </Label>
          <Textarea
            id="entry-body"
            ref={textareaRef}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="For example: My knee felt sore after physio this morning, about a 4 out of 10. I slept around 6 hours and walked for 15 minutes with one crutch."
            className="font-display min-h-44 resize-y rounded-2xl border-hairline bg-paper px-4 py-3.5 text-[1.375rem] leading-[1.45] italic placeholder:text-bone md:text-[1.375rem]"
            aria-invalid={tooLong}
            aria-describedby="entry-count"
          />
          <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2.5">
            <div className="flex flex-wrap gap-1.5" role="group" aria-label="Prompts to get you started">
              {PROMPTS.map((p) => (
                <button
                  key={p.label}
                  type="button"
                  onClick={() => insertStarter(p.starter)}
                  className="h-8 rounded-full border border-hairline bg-paper px-3 text-xs text-ink transition-[background-color,transform] hover:bg-paper-3 active:scale-95"
                >
                  {p.label}
                </button>
              ))}
            </div>
            <span
              id="entry-count"
              className={cn("font-mono text-xs text-muted-foreground", tooLong && "text-vermilion-deep")}
            >
              {text.length.toLocaleString()} / {MAX_LENGTH.toLocaleString()}
            </span>
          </div>
        </div>
      </div>

      <QuickLog onInsert={insertSentences} />

      <div className="rounded-[28px] border border-hairline bg-paper-2 p-5 sm:p-7">
        <div className="space-y-2 sm:max-w-xs">
          <Label htmlFor="entry-when" className="eyebrow text-muted-foreground">
            When did this happen?
          </Label>
          <Select value={when} onValueChange={(v) => setWhen(v as When)}>
            <SelectTrigger id="entry-when" className="h-11 w-full rounded-full border-hairline bg-paper px-4">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(Object.keys(WHEN_LABELS) as When[]).map((value) => (
                <SelectItem key={value} value={value}>
                  {WHEN_LABELS[value]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {error ? (
          <p role="alert" className="mt-4 text-sm text-vermilion-deep">
            {error}
          </p>
        ) : null}

        <div className="mt-6 flex flex-wrap items-center gap-x-4 gap-y-3">
          <Button type="submit" size="lg" className={pillPrimary} disabled={!trimmed || tooLong}>
            <Send />
            Save update
          </Button>
          <p className="text-xs text-muted-foreground">Nothing is shared until you approve it.</p>
        </div>
      </div>
    </form>
  );
}

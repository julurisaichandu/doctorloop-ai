"use client";

import { ArrowRight, RotateCcw, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { ProcessingSequence } from "@/components/patient/quick-log/processing-sequence";
import { SavedHeader, StructuredEntry } from "@/components/patient/quick-log/structuring-result";
import { arrowNudge, pillOnInk, pillOutline, pillOutlineOnInk, pillPrimary } from "@/components/patient/quick-log/styles";
import { Button, buttonVariants } from "@/components/ui/button";
import type { TimelineEntryView } from "@/lib/domain/types";
import { cn } from "@/lib/utils";
import { VoiceStage } from "./voice-stage";

export const PRIVACY_NOTE = "Nothing is shared with your care team until you review and approve it.";

export function IdlePanel({ onStart, description }: { onStart: () => void; description: string }) {
  return (
    <VoiceStage
      state="idle"
      caption="TAP THE ORB TO START"
      onPress={onStart}
      pressLabel="Start voice check-in"
      title={
        <>
          Tell us how you are <em>doing.</em>
        </>
      }
    >
      <p className="max-w-md text-[15px] leading-relaxed">{description}</p>
      <p className="flex max-w-md items-start gap-2 text-left text-xs text-muted-ink">
        <ShieldCheck className="mt-px size-3.5 shrink-0 text-lime" aria-hidden />
        {PRIVACY_NOTE}
      </p>
    </VoiceStage>
  );
}

export function RequestingMicPanel() {
  return (
    <VoiceStage state="waiting" caption="WAITING FOR MICROPHONE" title="Waiting for microphone permission">
      <p>Your browser will ask to use your microphone. Choose Allow to continue.</p>
    </VoiceStage>
  );
}

export function ConnectingPanel({ onCancel }: { onCancel?: () => void }) {
  return (
    <VoiceStage state="connecting" caption="CONNECTING…" title="Setting up your check-in.">
      {onCancel ? (
        <Button variant="outline" onClick={onCancel} className={pillOutlineOnInk}>
          Cancel
        </Button>
      ) : null}
    </VoiceStage>
  );
}

export function SavingPanel() {
  return <ProcessingSequence />;
}

export function MicDeniedPanel({ onRetry }: { onRetry: () => void }) {
  return (
    <VoiceStage state="waiting" caption="MICROPHONE BLOCKED" title="Microphone access is blocked">
      <p className="max-w-md">
        To use voice, allow microphone access for this site: select the lock or tune icon beside the address bar, set
        Microphone to Allow, then try again. You can also write your update instead.
      </p>
      <div className="flex flex-wrap justify-center gap-2.5">
        <Button onClick={onRetry} className={pillOnInk}>
          <RotateCcw data-icon="inline-start" aria-hidden />
          Try again
        </Button>
        <Link href="?tab=write" className={cn(buttonVariants({ variant: "outline" }), pillOutlineOnInk)}>
          Use text instead
        </Link>
      </div>
    </VoiceStage>
  );
}

export function ErrorPanel({
  message,
  onRetry,
  onRetrySave,
}: {
  message: string;
  onRetry: () => void;
  onRetrySave?: () => void;
}) {
  return (
    <div role="alert">
      <VoiceStage state="waiting" caption="NEEDS ANOTHER TRY" title="Something went wrong">
        <p className="max-w-md">{message}</p>
        <div className="flex flex-wrap justify-center gap-2.5">
          {onRetrySave ? (
            <Button onClick={onRetrySave} className={pillOnInk}>
              <RotateCcw data-icon="inline-start" aria-hidden />
              Retry saving
            </Button>
          ) : null}
          <Button variant="outline" onClick={onRetry} className={onRetrySave ? pillOutlineOnInk : pillOnInk}>
            {onRetrySave ? "Discard and start over" : "Try again"}
          </Button>
          <Link href="?tab=write" className={cn(buttonVariants({ variant: "outline" }), pillOutlineOnInk)}>
            Use text instead
          </Link>
        </div>
      </VoiceStage>
    </div>
  );
}

export function DonePanel({ entry, onAgain }: { entry: TimelineEntryView | null; onAgain: () => void }) {
  if (!entry) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-[28px] border border-hairline bg-paper-2 px-6 py-10 text-center">
        <p className="font-display text-3xl">Check-in ended</p>
        <p className="max-w-md text-sm text-muted-foreground">
          No spoken details were captured, so nothing was saved.
        </p>
        <Button onClick={onAgain} className={cn(pillPrimary, "mt-2")}>
          Start another
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <SavedHeader title="Your update is ready for review" description={PRIVACY_NOTE} />
      <StructuredEntry item={entry} />
      <div className="flex flex-wrap gap-2.5">
        <Link href="/patient/review" className={cn(buttonVariants({ size: "lg" }), pillPrimary)}>
          Review &amp; share
          <ArrowRight className={arrowNudge} aria-hidden />
        </Link>
        <Button variant="outline" size="lg" onClick={onAgain} className={pillOutline}>
          Start another
        </Button>
      </div>
    </div>
  );
}

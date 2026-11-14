"use client";

import { format } from "date-fns";
import type { AiProvider } from "@/lib/domain/types";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

const LABEL = "AI-generated · unverified · needs clinician review";

/** Four-point lime spark: the mark of machine-written content. */
function Spark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 12 12" className={cn("size-2.5 shrink-0 text-lime", className)} aria-hidden>
      <path d="M6 0c.4 3.4 2.6 5.6 6 6-3.4.4-5.6 2.6-6 6-.4-3.4-2.6-5.6-6-6 3.4-.4 5.6-2.6 6-6Z" fill="currentColor" />
    </svg>
  );
}

/** Client component only because it hosts a tooltip; safe to render from server pages. */
export function AiGeneratedLabel({
  provider,
  model,
  generatedAt,
  compact = false,
  className,
}: {
  provider?: AiProvider;
  model?: string | null;
  generatedAt?: string;
  compact?: boolean;
  className?: string;
}) {
  const engine = provider
    ? provider === "mock"
      ? "Rule-based fallback (no OpenAI call)"
      : `OpenAI${model ? ` · ${model}` : ""}`
    : null;
  const generated = generatedAt ? format(new Date(generatedAt), "MMM d, h:mm a") : null;

  const pill = (
    <span
      className={cn(
        "eyebrow inline-flex h-6 items-center gap-1.5 rounded-full border border-ink-3 bg-ink px-2.5 font-medium whitespace-nowrap text-paper",
        compact && "h-5 px-2 text-[10px]",
        className,
      )}
      title={engine ? undefined : LABEL}
    >
      <Spark />
      <span aria-hidden>AI DRAFT · UNVERIFIED</span>
      <span className="sr-only">{LABEL}</span>
      {generated && !compact ? <span className="hidden text-muted-ink sm:inline">· {generated}</span> : null}
    </span>
  );

  if (!engine) return pill;
  return (
    <Tooltip>
      <TooltipTrigger asChild>{pill}</TooltipTrigger>
      <TooltipContent>
        {engine}. {LABEL}.
      </TooltipContent>
    </Tooltip>
  );
}

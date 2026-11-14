"use client";

import { format } from "date-fns";
import { motion } from "motion/react";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { DUR, EASE_OUT } from "@/components/motion/tokens";
import type { VexoCandidate } from "@/lib/services/vexo";
import { cn } from "@/lib/utils";

function normalizeSpace(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

/** The patient may trim an excerpt but not rewrite it. */
export function isValidExcerpt(edited: string, original: string): boolean {
  const trimmed = normalizeSpace(edited);
  return trimmed.length > 0 && normalizeSpace(original).includes(trimmed);
}

export function MemoryCandidate({
  candidate,
  selected,
  excerpt,
  onSelectedChange,
  onExcerptChange,
  index = 0,
}: {
  candidate: VexoCandidate;
  selected: boolean;
  excerpt: string;
  onSelectedChange: (selected: boolean) => void;
  onExcerptChange: (excerpt: string) => void;
  /** Position in the list; drives the slide-in stagger. */
  index?: number;
}) {
  const disabled = candidate.alreadyImported;
  const valid = isValidExcerpt(excerpt, candidate.excerpt);
  const { tool, query } = candidate.provenance;
  const checkboxId = `vexo-${candidate.id}`;
  const on = selected && !disabled;

  return (
    <motion.article
      initial={{ opacity: 0, x: -24 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: DUR.reveal, ease: EASE_OUT, delay: 0.08 * index }}
      className={cn(
        "relative rounded-[20px] border bg-paper-2 p-4 pl-5 transition-colors duration-200 sm:p-5 sm:pl-6",
        on ? "border-ink" : "border-hairline",
        disabled && "opacity-60",
      )}
    >
      <span
        aria-hidden
        className={cn("absolute top-4 bottom-4 left-0 w-1 rounded-full transition-colors duration-200", on ? "bg-lime" : "bg-transparent")}
      />
      <div className="flex gap-3.5">
        <Checkbox
          id={checkboxId}
          checked={on}
          disabled={disabled}
          onCheckedChange={(value) => onSelectedChange(value === true)}
          className="mt-1 size-5 rounded-md border-ink data-checked:bg-ink"
        />
        <div className="min-w-0 flex-1 space-y-3">
          <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
            <label htmlFor={checkboxId} className="cursor-pointer text-[15px] font-medium">
              {candidate.title ?? "Untitled memory"}
            </label>
            {disabled ? (
              <span className="eyebrow rounded-full bg-paper-3 px-2 py-0.5 text-[10px]">Already imported</span>
            ) : null}
          </div>

          <Textarea
            value={excerpt}
            onChange={(event) => onExcerptChange(event.target.value)}
            disabled={disabled}
            rows={3}
            aria-label="Excerpt to import (you can trim it)"
            aria-invalid={!valid}
            className="font-display min-h-24 resize-y rounded-2xl border-hairline bg-paper px-4 py-3 text-[1.25rem] leading-[1.45] italic md:text-[1.25rem]"
          />

          <p className="eyebrow flex flex-wrap items-center gap-x-2 gap-y-1 text-[10px] text-muted-foreground" title="The Vexo tool that returned this memory">
            <span>via {tool}</span>
            {query ? <span>· ‘{query}’</span> : null}
            <span>· {format(new Date(candidate.startedAt), "MMM d, h:mm a")}</span>
          </p>

          {candidate.matchedTerms.length > 0 ? (
            <ul className="flex flex-wrap gap-1.5" aria-label="Matched terms">
              {candidate.matchedTerms.map((term) => (
                <li key={term} className="rounded-full bg-lime px-2.5 py-0.5 text-xs font-medium text-ink">
                  {term}
                </li>
              ))}
            </ul>
          ) : null}

          <p className={cn("text-xs", valid ? "text-muted-foreground" : "text-vermilion-deep")}>
            {valid
              ? "You can trim this excerpt before importing. Only words from the original memory are kept."
              : "The excerpt must be taken from the original memory. Remove text instead of rewriting it."}
          </p>
        </div>
      </div>
    </motion.article>
  );
}

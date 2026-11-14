import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** The patient's own words: editorial serif italic on paper with a vermilion quote glyph. */
export function PatientQuote({
  children,
  attribution = "Patient's words",
  className,
}: {
  children: ReactNode;
  attribution?: string;
  className?: string;
}) {
  return (
    <figure className={cn("relative pl-9", className)}>
      <span
        aria-hidden
        className="font-display absolute top-[-0.18em] left-0 text-[3.2em] leading-none text-vermilion select-none"
      >
        “
      </span>
      <blockquote className="font-display text-[1.25em] leading-[1.45] whitespace-pre-wrap text-ink italic">
        {children}
      </blockquote>
      <figcaption className="eyebrow mt-2 text-muted-foreground">{attribution}</figcaption>
    </figure>
  );
}

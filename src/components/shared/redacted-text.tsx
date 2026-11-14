import { Fragment, type ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * The privacy filter stores placeholders such as "[name]" in place of personal details.
 * They render as small mono "NAME HIDDEN" pills; everything else stays the patient's words.
 */

const PILL_LABELS: Record<string, string> = {
  "[name]": "NAME HIDDEN",
  "[phone]": "PHONE HIDDEN",
  "[email]": "EMAIL HIDDEN",
  "[address]": "ADDRESS HIDDEN",
  "[id]": "ID HIDDEN",
  "[link]": "LINK HIDDEN",
};

const PLACEHOLDER = /\[(?:name|phone|email|address|id|link)\]/g;

export function RedactionPill({ placeholder }: { placeholder: string }) {
  const label = PILL_LABELS[placeholder] ?? "HIDDEN";
  return (
    <span
      data-redaction={placeholder.slice(1, -1)}
      title="Hidden by the privacy filter. The original was never saved."
      className="mx-0.5 inline-flex items-center rounded-full border border-hairline bg-paper-3 px-1.5 py-px align-baseline font-mono text-[10px] font-medium not-italic tracking-wide whitespace-nowrap text-muted-foreground"
    >
      {label}
    </span>
  );
}

/** Splits text into plain strings and redaction pills. */
export function renderWithPills(text: string, keyPrefix = "p"): ReactNode[] {
  const out: ReactNode[] = [];
  let cursor = 0;
  let i = 0;
  for (const match of text.matchAll(PLACEHOLDER)) {
    const at = match.index ?? 0;
    if (at > cursor) out.push(<Fragment key={`${keyPrefix}t${i}`}>{text.slice(cursor, at)}</Fragment>);
    out.push(<RedactionPill key={`${keyPrefix}r${i}`} placeholder={match[0]} />);
    cursor = at + match[0].length;
    i++;
  }
  if (cursor < text.length || out.length === 0) {
    out.push(<Fragment key={`${keyPrefix}tail`}>{text.slice(cursor)}</Fragment>);
  }
  return out;
}

/** Plain text (no quote highlighting) with redaction pills. */
export function RedactedText({ text, className }: { text: string; className?: string }) {
  return <span className={cn(className)}>{renderWithPills(text)}</span>;
}

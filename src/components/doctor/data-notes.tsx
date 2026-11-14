import { Database } from "lucide-react";

const NOTES = [
  "Everything shown is reported by the patient, in their own words.",
  "Only updates the patient approved for sharing appear here.",
  "AI summaries and extracted observations are unverified and need clinician review.",
  "Trends are self-reported values, not clinical measurements.",
  "Review status only shows what you have read. It is not a risk score.",
];

export function DataNotes() {
  return (
    <section aria-labelledby="data-notes-title" className="rounded-[20px] border border-hairline bg-paper-2 p-5">
      <h2 id="data-notes-title" className="eyebrow flex items-center gap-2 text-muted-foreground">
        <Database className="size-3.5" strokeWidth={1.5} aria-hidden />
        Data notes
      </h2>
      <ol className="mt-4 divide-y divide-hairline">
        {NOTES.map((note, i) => (
          <li key={note} className="flex gap-3 py-2.5 text-sm leading-relaxed text-muted-foreground first:pt-0 last:pb-0">
            <span className="mt-0.5 font-mono text-[11px] text-ink tabular-nums">{String(i + 1).padStart(2, "0")}</span>
            {note}
          </li>
        ))}
      </ol>
    </section>
  );
}

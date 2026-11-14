import type { Observation } from "@/lib/domain/types";
import { cn } from "@/lib/utils";
import { categoryTone } from "@/components/viz/palette";
import { PatientQuote } from "./patient-quote";

const chip = "inline-flex items-center rounded-full px-2 py-0.5 text-xs";

/** Read-only observation. `active` / `onActiveChange` let a parent link it to highlighted text. */
export function ObservationItem({
  observation,
  className,
  active = false,
  onActiveChange,
}: {
  observation: Observation;
  className?: string;
  active?: boolean;
  onActiveChange?: (active: boolean) => void;
}) {
  const o = observation;
  const removed = o.status === "removed";
  const tone = categoryTone(o.category);
  const interactive = onActiveChange !== undefined;

  return (
    <div
      data-observation-id={o.id}
      data-active={active || undefined}
      tabIndex={interactive ? 0 : undefined}
      onMouseEnter={interactive ? () => onActiveChange(true) : undefined}
      onMouseLeave={interactive ? () => onActiveChange(false) : undefined}
      onFocus={interactive ? () => onActiveChange(true) : undefined}
      onBlur={interactive ? () => onActiveChange(false) : undefined}
      className={cn(
        "relative flex gap-3 rounded-2xl border border-hairline bg-paper-2 p-3.5 pl-4 transition-colors duration-150",
        active && "border-ink bg-paper-3",
        removed && "opacity-60",
        className,
      )}
    >
      <span aria-hidden className={cn("absolute top-3 bottom-3 left-0 w-1 rounded-full", tone.bar)} />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
          <div className="min-w-0">
            <p className="eyebrow flex flex-wrap items-center gap-x-2 text-muted-foreground">
              <span className={cn("font-medium", tone.textClass)}>{o.category}</span>
              {o.bodySite ? <span>· {o.bodySite}</span> : null}
              {o.timeDescription ? <span>· {o.timeDescription}</span> : null}
            </p>
            <p className={cn("mt-1 text-[15px] font-medium", removed && "line-through")}>{o.label}</p>
          </div>
          {o.severity != null ? (
            <span className="font-mono whitespace-nowrap">
              <span className="text-2xl leading-none font-medium">{o.severity}/10</span>
              <span className="text-xs text-muted-foreground"> (self-reported)</span>
            </span>
          ) : null}
          {o.measureValue != null ? (
            <span className="font-mono text-xl leading-none font-medium whitespace-nowrap">
              {o.measureValue}
              {o.measureUnit ? ` ${o.measureUnit}` : ""}
            </span>
          ) : null}
        </div>
        {o.editedByPatient || removed ? (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {o.editedByPatient ? (
              <span className={cn(chip, "border border-dashed border-bone text-muted-foreground")}>edited by patient</span>
            ) : null}
            {removed ? <span className={cn(chip, "bg-paper-3 text-muted-foreground")}>removed</span> : null}
          </div>
        ) : null}
        {o.context.length > 0 ? (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {o.context.map((c) => (
              <span key={c} className={cn(chip, "border border-hairline text-muted-foreground")}>
                {c}
              </span>
            ))}
          </div>
        ) : null}
        {o.uncertainties.map((u) => (
          <p key={u} className="mt-1.5 text-xs text-muted-foreground italic">
            Missing: {u}
          </p>
        ))}
        {o.patientQuote ? <PatientQuote className="mt-2.5 text-sm">{o.patientQuote}</PatientQuote> : null}
      </div>
    </div>
  );
}

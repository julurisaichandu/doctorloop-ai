import type { EntrySource, IntegrationMode, SourceReference } from "@/lib/domain/types";
import { cn } from "@/lib/utils";
import { SOURCE_TONES } from "@/components/viz/palette";

/** True for source references created by replaying a Vexo band file (simulated, never live). */
export function isBandReplay(ref: Pick<SourceReference, "provider" | "metadata"> | null | undefined): boolean {
  return ref?.provider === "vexo" && typeof ref.metadata?.replayFile === "string";
}

/** Voice = cobalt, Note = paper, Vexo = ink + lime (sponsor highlight). Mode tags are mono caps. */
export function SourceBadge({
  source,
  mode,
  replay = false,
  className,
}: {
  source: EntrySource;
  mode?: IntegrationMode | null;
  /** Band-file replay: shows "band replay" instead of the raw mode. */
  replay?: boolean;
  className?: string;
}) {
  const { label, Icon, className: tone } = SOURCE_TONES[source];
  const showMode = mode != null && mode !== "live";
  return (
    <span
      className={cn(
        "inline-flex h-6 items-center gap-1.5 rounded-full border px-2.5 text-xs font-medium whitespace-nowrap",
        tone,
        className,
      )}
    >
      <Icon className="size-3" strokeWidth={1.75} aria-hidden />
      {label}
      {showMode ? <span className="eyebrow ml-0.5 text-[10px] opacity-80">{replay ? "band replay" : mode}</span> : null}
    </span>
  );
}

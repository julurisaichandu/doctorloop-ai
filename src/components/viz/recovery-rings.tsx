import { Ring } from "@/components/viz/ring";
import { CHART_COLORS_ON_INK } from "@/components/viz/palette";

export interface RingStat {
  done: number;
  of: number;
}

/** Plain-language caption: logistics only, never a health judgement. */
function ratio(s: RingStat): number {
  return s.of > 0 ? Math.min(1, s.done / s.of) : 0;
}

const SIZE = 232;
const THICK = 12;
const GAP = 6;

/**
 * Three concentric activity rings (Bevel pattern) on an ink surface: check-in rhythm, shared updates,
 * seen by care team. All values are activity/logistics, never health scores.
 */
export function RecoveryRings({
  day,
  checkIn,
  shared,
  seen,
  doctorName,
}: {
  day: number;
  checkIn: RingStat;
  shared: RingStat;
  seen: RingStat;
  doctorName?: string | null;
}) {
  const [cLime, cBlue, cAmber] = [CHART_COLORS_ON_INK[0], CHART_COLORS_ON_INK[2], CHART_COLORS_ON_INK[3]];
  const rows = [
    {
      key: "rhythm",
      color: cLime,
      label: "Check-in rhythm",
      value: `${checkIn.done}/${checkIn.of}`,
      caption: checkIn.done === 0 ? "No updates in the last 7 days." : `You added an update on ${checkIn.done} of the last ${checkIn.of} days.`,
      stat: checkIn,
    },
    {
      key: "shared",
      color: cBlue,
      label: "Shared",
      value: `${shared.done}/${shared.of}`,
      caption:
        shared.of === 0
          ? "No updates this week yet."
          : `${shared.done} of ${shared.of} updates this week are shared with your care team.`,
      stat: shared,
    },
    {
      key: "seen",
      color: cAmber,
      label: "Seen by care team",
      value: `${seen.done}/${seen.of}`,
      caption:
        seen.of === 0
          ? "Nothing shared yet, so nothing to be seen."
          : `${seen.done} of ${seen.of} shared updates marked as seen${doctorName && seen.done > 0 ? ` by ${doctorName}` : ""}.`,
      stat: seen,
    },
  ];

  return (
    <div className="flex flex-col items-center gap-8 sm:flex-row sm:items-center sm:gap-10">
      <div className="relative shrink-0" style={{ width: SIZE, height: SIZE }}>
        {rows.map((r, i) => {
          const size = SIZE - i * 2 * (THICK + GAP);
          return (
            <div key={r.key} className="absolute" style={{ inset: i * (THICK + GAP) }}>
              <Ring
                value={ratio(r.stat)}
                size={size}
                thickness={THICK}
                color={r.color}
                trackColor="var(--ink-3)"
                ariaLabel={`${r.label}: ${r.value}`}
              />
            </div>
          );
        })}
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="font-display text-[46px] leading-none tracking-tight text-paper tabular-nums">Day {day}</span>
          <span className="eyebrow mt-1.5 text-[10px] text-muted-ink">of recovery</span>
        </div>
      </div>
      <ul className="w-full min-w-0 flex-1 divide-y divide-ink-3 border-y border-ink-3">
        {rows.map((r) => (
          <li key={r.key} className="py-3">
            <div className="flex items-center justify-between gap-3">
              <span className="flex items-center gap-2 text-[13px] font-medium text-paper">
                <span className="size-2.5 rounded-full" style={{ background: r.color }} aria-hidden />
                {r.label}
              </span>
              <span className="font-mono text-xs whitespace-nowrap text-paper tabular-nums">{r.value}</span>
            </div>
            <p className="mt-1 pl-[18px] text-[13px] leading-snug text-muted-ink">{r.caption}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}

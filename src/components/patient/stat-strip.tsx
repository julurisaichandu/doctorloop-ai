import { CountUp } from "@/components/motion/count-up";

export interface StripStat {
  label: string;
  value: number;
  hint: string;
}

/** Editorial stat strip: big serif numbers separated by hairlines, no boxes. */
export function StatStrip({ stats }: { stats: StripStat[] }) {
  return (
    <dl className="grid grid-cols-2 border-y border-hairline lg:grid-cols-4">
      {stats.map((s, i) => (
        <div
          key={s.label}
          className={
            "px-1 py-5 sm:px-6 " +
            (i % 2 === 1 ? "border-l border-hairline " : "") +
            (i >= 2 ? "border-t border-hairline lg:border-t-0 " : "") +
            (i > 0 ? "lg:border-l lg:border-hairline " : "") +
            (i === 0 ? "lg:pl-0" : "")
          }
        >
          <dt className="eyebrow text-muted-foreground">{s.label}</dt>
          <dd className="mt-2">
            <span className="font-display text-6xl leading-none tabular-nums sm:text-7xl">
              <CountUp value={s.value} />
            </span>
            <span className="mt-2 block font-mono text-xs text-muted-foreground">{s.hint}</span>
          </dd>
        </div>
      ))}
    </dl>
  );
}

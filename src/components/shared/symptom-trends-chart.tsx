"use client";

import { useMemo, useState } from "react";
import { format } from "date-fns";
import { LineChart as LineChartIcon } from "lucide-react";
import { CartesianGrid, Line, LineChart, XAxis, YAxis } from "recharts";
import type { TrendSeries } from "@/lib/domain/types";
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { assignSeriesColors } from "@/components/viz/palette";
import { EmptyState } from "./empty-state";

type View = "severity" | "measure";

const shortDate = (date: string) => format(new Date(`${date}T12:00:00`), "MMM d");
/** "Knee discomfort (0-10)" becomes "Knee discomfort" for the direct end label. */
const shortLabel = (label: string) => label.replace(/\s*\([^)]*\)\s*$/, "");

const MONO = "var(--font-mono), ui-monospace, monospace";

interface EndLabelProps {
  x?: number | string;
  y?: number | string;
  index?: number;
}

function PanelChart({
  series,
  yDomain,
  unitLabel,
}: {
  series: TrendSeries[];
  yDomain?: [number, number];
  unitLabel: string;
}) {
  const { data, config, colors, lastIndex, nudge } = useMemo(() => {
    const colors = assignSeriesColors(series);
    const byDate = new Map<string, Record<string, string | number>>();
    const cfg: ChartConfig = {};
    series.forEach((s, i) => {
      const key = `s${i}`;
      cfg[key] = { label: s.label, color: colors[i] };
      for (const p of s.points) {
        const row = byDate.get(p.date) ?? { date: p.date };
        row[key] = p.value;
        byDate.set(p.date, row);
      }
    });
    const rows = [...byDate.values()].sort((a, b) => String(a.date).localeCompare(String(b.date)));
    // Last row index that holds a value for each series (where the direct label goes).
    const lastIndex = series.map((_, i) => {
      for (let r = rows.length - 1; r >= 0; r--) if (rows[r][`s${i}`] != null) return r;
      return -1;
    });
    // Separate end labels that would collide (same final value, or close to it).
    const ends = series.map((s) => s.points[s.points.length - 1]?.value ?? 0);
    const all = series.flatMap((s) => s.points.map((p) => p.value));
    const range = Math.max(1, Math.max(...all, 0) - Math.min(...all, 0));
    const nudge = ends.map((v, i) => {
      let dy = 0;
      ends.forEach((w, j) => {
        if (j !== i && Math.abs(v - w) / range < 0.1) dy += (v >= w ? (i > j ? -1 : 1) : 1) * 7;
      });
      return Math.max(-14, Math.min(14, dy));
    });
    return { data: rows, config: cfg, colors, lastIndex, nudge };
  }, [series]);

  return (
    <figure>
      <figcaption className="eyebrow mb-2 text-muted-foreground">{unitLabel}</figcaption>
      <ChartContainer config={config} className="aspect-auto h-64 w-full">
        <LineChart data={data} margin={{ top: 12, right: 118, bottom: 0, left: -12 }}>
          <CartesianGrid vertical={false} stroke="var(--hairline)" strokeDasharray="0" />
          <XAxis
            dataKey="date"
            tickLine={false}
            axisLine={{ stroke: "var(--hairline)" }}
            tickMargin={8}
            tickFormatter={shortDate}
            tick={{ fontFamily: MONO, fontSize: 11, fill: "var(--ink-muted)" }}
          />
          <YAxis
            tickLine={false}
            axisLine={false}
            tickMargin={4}
            domain={yDomain}
            allowDecimals={false}
            width={44}
            tick={{ fontFamily: MONO, fontSize: 11, fill: "var(--ink-muted)" }}
          />
          <ChartTooltip
            cursor={{ stroke: "var(--ink)", strokeWidth: 1 }}
            content={<ChartTooltipContent labelFormatter={(label) => shortDate(String(label))} />}
          />
          {series.map((s, i) => (
            <Line
              key={s.key}
              dataKey={`s${i}`}
              type="linear"
              stroke={colors[i]}
              strokeWidth={2}
              connectNulls
              dot={{ r: 3.5, strokeWidth: 2, stroke: "var(--paper-2)", fill: colors[i] }}
              activeDot={{ r: 5.5, stroke: "var(--paper-2)", strokeWidth: 2 }}
              label={(p: EndLabelProps) =>
                p.index === lastIndex[i] ? (
                  <text
                    key={`end-${s.key}`}
                    x={Number(p.x) + 10}
                    y={Number(p.y) + nudge[i]}
                    dominantBaseline="middle"
                    style={{ fontFamily: MONO, fontSize: 11, fill: colors[i], fontWeight: 600 }}
                  >
                    {shortLabel(s.label)}
                  </text>
                ) : (
                  <g key={`none-${p.index}`} />
                )
              }
            />
          ))}
        </LineChart>
      </ChartContainer>
    </figure>
  );
}

/** Measures with different units are never shown on one axis: one small chart per unit. */
function MeasurePanels({ series }: { series: TrendSeries[] }) {
  const byUnit = new Map<string, TrendSeries[]>();
  for (const s of series) {
    const unit = s.unit ?? "value";
    byUnit.set(unit, [...(byUnit.get(unit) ?? []), s]);
  }
  return (
    <div className="space-y-6">
      {[...byUnit.entries()].map(([unit, group]) => (
        <PanelChart key={unit} series={group} unitLabel={`Patient-stated values (${unit})`} />
      ))}
    </div>
  );
}

export function SymptomTrendsChart({
  series,
  title = "Self-reported trends",
  description,
}: {
  series: TrendSeries[];
  title?: string;
  description?: string;
}) {
  const severity = series.filter((s) => s.kind === "severity");
  const measure = series.filter((s) => s.kind === "measure");
  const [view, setView] = useState<View>(severity.length > 0 ? "severity" : "measure");

  if (series.length === 0) {
    return (
      <EmptyState
        icon={LineChartIcon}
        title="No trends yet"
        description="Trends appear once updates include numbers the patient stated, such as a 0-10 intensity or hours slept."
      />
    );
  }

  const showTabs = severity.length > 0 && measure.length > 0;

  return (
    <section className="rounded-[20px] border border-hairline bg-paper-2 p-5 sm:p-6" aria-label={title}>
      <header className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="font-display text-2xl tracking-normal">{title}</h3>
          {description ? <p className="mt-1 text-sm text-muted-foreground">{description}</p> : null}
        </div>
        {showTabs ? (
          <Tabs value={view} onValueChange={(v) => setView(v as View)}>
            <TabsList>
              <TabsTrigger value="severity">Intensity (0-10)</TabsTrigger>
              <TabsTrigger value="measure">Sleep &amp; activity</TabsTrigger>
            </TabsList>
          </Tabs>
        ) : null}
      </header>
      {view === "severity" && severity.length > 0 ? (
        <PanelChart series={severity} yDomain={[0, 10]} unitLabel="Intensity, 0 to 10 as the patient stated it" />
      ) : (
        <MeasurePanels series={measure} />
      )}
      <p className="eyebrow mt-4 text-muted-foreground">Self-reported · not clinical measurements</p>
    </section>
  );
}

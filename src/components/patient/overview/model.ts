import { differenceInCalendarDays, format, startOfDay, subDays } from "date-fns";
import { assignSeriesColors } from "@/components/viz/palette";
import type { HeatDay, HeatRow } from "@/components/viz/heat-calendar";
import type { RingStat } from "@/components/viz/recovery-rings";
import type { PatientDashboardData, TrendSeries } from "@/lib/domain/types";

const DAY_KEY = "yyyy-MM-dd";

export interface TileModel {
  key: string;
  label: string;
  value: number;
  decimals: number;
  unit: string | null;
  values: number[];
  color: string;
  delta: { text: string; direction: "up" | "down" | "flat" } | null;
  sourceCount: number;
}

export interface OverviewModel {
  day: number;
  rings: { checkIn: RingStat; shared: RingStat; seen: RingStat; doctorName: string | null };
  tiles: TileModel[];
  heat: { days: HeatDay[]; rows: HeatRow[] };
  appointment: { countdown: string; when: string; with: string | null; reason: string | null } | null;
}

const cleanLabel = (label: string): string => label.replace(/\s*\([^)]*\)\s*$/, "");
const fmtNumber = (n: number): string => (Number.isInteger(n) ? String(n) : n.toFixed(1));

function pointText(series: TrendSeries, value: number): string {
  return series.kind === "severity"
    ? `${fmtNumber(value)}/10`
    : `${fmtNumber(value)}${series.unit ? ` ${series.unit}` : ""}`;
}

function countdown(target: Date, now: Date): string {
  const d = differenceInCalendarDays(target, now);
  if (d <= 0) return "today";
  if (d === 1) return "tomorrow";
  return `in ${d} days`;
}

/** Derives everything the overview visuals need (activity/logistics + self-reported series only). */
export function buildOverviewModel(data: PatientDashboardData, now: Date = new Date()): OverviewModel {
  const today = startOfDay(now);
  const dates = Array.from({ length: 14 }, (_, i) => subDays(today, 13 - i));
  const days: HeatDay[] = dates.map((d) => ({
    key: format(d, DAY_KEY),
    short: format(d, "d"),
    label: format(d, "EEE, MMM d"),
  }));
  const weekKeys = new Set(days.slice(7).map((d) => d.key));

  const entries = data.recentEntries;
  const keyOf = (iso: string) => format(new Date(iso), DAY_KEY);
  const week = entries.filter((e) => weekKeys.has(keyOf(e.entry.occurredAt)));
  const approvedAll = entries.filter((e) => e.entry.reviewStatus === "approved");
  const seen = approvedAll.filter((e) => e.careTeamReview);
  const latestSeen = [...seen].sort((a, b) =>
    b.careTeamReview!.reviewedAt.localeCompare(a.careTeamReview!.reviewedAt),
  )[0];

  // Series ordering: most reports first, then most recent.
  const ranked = [...data.trends]
    .filter((s) => s.points.length > 0)
    .sort(
      (a, b) =>
        b.points.length - a.points.length ||
        b.points[b.points.length - 1].date.localeCompare(a.points[a.points.length - 1].date),
    )
    .slice(0, 4);
  const colors = assignSeriesColors(ranked);

  const tiles: TileModel[] = ranked.slice(0, 3).map((s, i) => {
    const first = s.points[0];
    const last = s.points[s.points.length - 1];
    const diff = Math.round((last.value - first.value) * 10) / 10;
    const since = format(new Date(`${first.date}T12:00:00`), "MMM d");
    return {
      key: s.key,
      label: cleanLabel(s.label),
      value: last.value,
      decimals: Number.isInteger(last.value) ? 0 : 1,
      unit: s.kind === "severity" ? "/10" : s.unit,
      values: s.points.map((p) => p.value),
      color: colors[i],
      delta:
        s.points.length < 2
          ? null
          : {
              text:
                diff === 0
                  ? `No change since ${since}`
                  : `${diff > 0 ? "+" : "-"}${fmtNumber(Math.abs(diff))} since ${since}`,
              direction: diff > 0 ? "up" : diff < 0 ? "down" : "flat",
            },
      sourceCount: s.points.length,
    };
  });

  const rows: HeatRow[] = ranked.map((s, i) => ({
    key: s.key,
    label: cleanLabel(s.label),
    color: colors[i],
    cells: days.map((d) => {
      const pts = s.points.filter((p) => p.date === d.key);
      const p = pts[pts.length - 1];
      return p ? { value: p.value, text: pointText(s, p.value) } : null;
    }),
  }));
  const perDay = new Map<string, number>();
  for (const e of entries) {
    const k = keyOf(e.entry.occurredAt);
    perDay.set(k, (perDay.get(k) ?? 0) + 1);
  }
  rows.push({
    key: "check-ins",
    label: "Check-ins",
    color: "var(--ink)",
    cells: days.map((d) => {
      const n = perDay.get(d.key);
      return n ? { value: n, text: `${n} ${n === 1 ? "update" : "updates"}` } : null;
    }),
  });

  const surgery = new Date(`${data.patient.procedureDate}T12:00:00`);
  const appt = data.patient.nextAppointmentAt ? new Date(data.patient.nextAppointmentAt) : null;

  return {
    day: Math.max(differenceInCalendarDays(now, surgery), 0) + 1,
    rings: {
      checkIn: { done: new Set(week.map((e) => keyOf(e.entry.occurredAt))).size, of: 7 },
      shared: { done: week.filter((e) => e.entry.reviewStatus === "approved").length, of: week.length },
      seen: { done: seen.length, of: approvedAll.length },
      doctorName: latestSeen?.careTeamReview?.doctorName ?? null,
    },
    tiles,
    heat: { days, rows },
    appointment: appt
      ? {
          countdown: countdown(appt, now),
          when: format(appt, "EEE, MMM d · h:mm a"),
          with: data.patient.nextAppointmentWith,
          reason: data.patient.nextAppointmentReason,
        }
      : null,
  };
}

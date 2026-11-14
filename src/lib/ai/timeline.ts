import { format } from "date-fns";
import type {
  ExplicitChange,
  JournalEntry,
  Observation,
  TimelineDay,
  TimelineResult,
  TrendPoint,
  TrendSeries,
} from "@/lib/domain/types";

/** Deterministic timeline + trend computation. Pure: no I/O, no LLM, no interpretation. */

export type TimelineObservationInput = Pick<
  Observation,
  | "id"
  | "journalEntryId"
  | "category"
  | "label"
  | "bodySite"
  | "observedAt"
  | "severity"
  | "measureValue"
  | "measureUnit"
>;

type TimelineEntryInput = Pick<JournalEntry, "id" | "occurredAt">;

const MAX_SERIES = 4;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const SYNONYMS: [RegExp, string][] = [
  [/\b(?:pain|painful|ache|aches|aching|achy|sore|soreness|hurt|hurts|hurting|discomfort)\b/g, "discomfort"],
  [/\b(?:tired|tiredness|fatigue|fatigued|exhausted|exhaustion)\b/g, "fatigue"],
  [/\b(?:stiff|stiffness|tightness|tight)\b/g, "stiffness"],
  [/\b(?:swelling|swollen)\b/g, "swelling"],
  [/\b(?:left|right|my|the)\b/g, ""],
];

const UNIT_ALIASES: Record<string, string> = {
  hour: "hours",
  hours: "hours",
  hr: "hours",
  hrs: "hours",
  minute: "minutes",
  minutes: "minutes",
  min: "minutes",
  mins: "minutes",
  step: "steps",
  steps: "steps",
};

export function normalizeLabel(label: string): string {
  let result = label.toLowerCase().trim();
  for (const [pattern, replacement] of SYNONYMS) result = result.replace(pattern, replacement);
  return result.replace(/\s+/g, " ").trim();
}

function normalizeUnit(unit: string): string {
  const key = unit.toLowerCase().trim();
  return UNIT_ALIASES[key] ?? key;
}

/** Local calendar day ("yyyy-MM-dd") of a timestamp; matches how the UI groups days. */
export function localDay(timestamp: number): string {
  return format(new Date(timestamp), "yyyy-MM-dd");
}

/** "2026-11-07" -> "Nov 7" (the date string is already a local calendar day). */
export function formatShortDate(date: string): string {
  const [, month, day] = date.split("-").map(Number);
  return `${MONTHS[month - 1] ?? "?"} ${day}`;
}

/** "3/10", "4 hours", "2,000 steps". */
export function formatTrendValue(value: number, kind: "severity" | "measure", unit: string | null): string {
  if (kind === "severity") return `${value}/10`;
  const shown = Number.isInteger(value) ? value.toLocaleString("en-US") : String(value);
  return unit ? `${shown} ${unit}` : shown;
}

interface Candidate {
  key: string;
  label: string;
  kind: "severity" | "measure";
  unit: string | null;
  category: Observation["category"];
  value: number;
  date: string;
  timestamp: number;
  entryId: string;
  observationId: string;
  order: number;
}

function toCandidates(
  observations: TimelineObservationInput[],
  entryTime: Map<string, string>,
): Candidate[] {
  const candidates: Candidate[] = [];
  observations.forEach((obs, order) => {
    const iso = obs.observedAt ?? entryTime.get(obs.journalEntryId);
    const timestamp = iso ? Date.parse(iso) : Number.NaN;
    if (!iso || Number.isNaN(timestamp)) return;
    const base = {
      category: obs.category,
      date: localDay(timestamp),
      timestamp,
      entryId: obs.journalEntryId,
      observationId: obs.id,
      order,
    };
    if (obs.severity !== null) {
      candidates.push({
        ...base,
        key: `severity:${normalizeLabel(obs.label)}`,
        label: `${obs.label.trim()} (0-10)`,
        kind: "severity",
        unit: null,
        value: obs.severity,
      });
    }
    if (obs.measureValue !== null && obs.measureUnit) {
      const unit = normalizeUnit(obs.measureUnit);
      candidates.push({
        ...base,
        key: `measure:${normalizeLabel(obs.label)}:${unit}`,
        label: `${obs.label.trim()} (${unit})`,
        kind: "measure",
        unit,
        value: obs.measureValue,
      });
    }
  });
  return candidates;
}

function buildSeries(candidates: Candidate[]): TrendSeries[] {
  const groups = new Map<string, Candidate[]>();
  for (const candidate of candidates) {
    const group = groups.get(candidate.key);
    if (group) group.push(candidate);
    else groups.set(candidate.key, [candidate]);
  }

  const series: TrendSeries[] = [];
  for (const [key, group] of groups) {
    // Keep the latest value per day (later timestamp wins; input order breaks ties).
    const latestPerDay = new Map<string, Candidate>();
    for (const candidate of group) {
      const current = latestPerDay.get(candidate.date);
      if (
        !current ||
        candidate.timestamp > current.timestamp ||
        (candidate.timestamp === current.timestamp && candidate.order > current.order)
      ) {
        latestPerDay.set(candidate.date, candidate);
      }
    }
    const points = [...latestPerDay.values()].sort((a, b) => a.date.localeCompare(b.date));
    const latest = points[points.length - 1];
    series.push({
      key,
      label: latest.label,
      kind: latest.kind,
      unit: latest.unit,
      category: latest.category,
      points: points.map(
        (p): TrendPoint => ({ date: p.date, value: p.value, entryId: p.entryId, observationId: p.observationId }),
      ),
    });
  }

  return series
    .sort(
      (a, b) =>
        b.points.length - a.points.length ||
        b.points[b.points.length - 1].date.localeCompare(a.points[a.points.length - 1].date) ||
        a.key.localeCompare(b.key),
    )
    .slice(0, MAX_SERIES);
}

function seriesSubject(series: TrendSeries): string {
  return series.label.replace(/\s*\([^)]*\)\s*$/, "").toLowerCase();
}

/** "; reported values ranged 3–6/10 across 5 updates" for series with 3+ points, else "". */
export function rangeText(series: { points: { value: number }[]; kind: TrendSeries["kind"]; unit: string | null }): string {
  if (series.points.length < 3) return "";
  const values = series.points.map((p) => p.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range =
    series.kind === "severity"
      ? `${min}–${max}/10`
      : `${formatTrendValue(min, series.kind, null)}–${formatTrendValue(max, series.kind, series.unit)}`;
  return `; reported values ranged ${range} across ${series.points.length} updates`;
}

function buildChange(series: TrendSeries): ExplicitChange | null {
  if (series.points.length < 2) return null;
  const from = series.points[0];
  const to = series.points[series.points.length - 1];
  const direction = to.value > from.value ? "increased" : to.value < from.value ? "decreased" : "unchanged";
  const fromText = `${formatTrendValue(from.value, series.kind, series.unit)} (${formatShortDate(from.date)})`;
  const toText = `${formatTrendValue(to.value, series.kind, series.unit)} (${formatShortDate(to.date)})`;
  const subject = seriesSubject(series);
  const base =
    direction === "unchanged"
      ? `Self-reported ${subject} was ${fromText} and again ${toText}`
      : `Self-reported ${subject} went from ${fromText} to ${toText}`;
  const description = `${base}${rangeText(series)}.`;
  return {
    seriesKey: series.key,
    label: series.label,
    kind: series.kind,
    unit: series.unit,
    from,
    to,
    direction,
    description,
  };
}

function buildDays(
  entries: TimelineEntryInput[],
  observations: TimelineObservationInput[],
  entryTime: Map<string, string>,
): TimelineDay[] {
  const days = new Map<string, TimelineDay>();
  const day = (date: string): TimelineDay => {
    let bucket = days.get(date);
    if (!bucket) {
      bucket = { date, entryIds: [], observationIds: [] };
      days.set(date, bucket);
    }
    return bucket;
  };

  for (const entry of entries) {
    const time = Date.parse(entry.occurredAt);
    if (Number.isNaN(time)) continue;
    day(localDay(time)).entryIds.push(entry.id);
  }
  for (const obs of observations) {
    const iso = obs.observedAt ?? entryTime.get(obs.journalEntryId);
    const time = iso ? Date.parse(iso) : Number.NaN;
    if (Number.isNaN(time)) continue;
    day(localDay(time)).observationIds.push(obs.id);
  }
  return [...days.values()].sort((a, b) => a.date.localeCompare(b.date));
}

export function buildTimeline(
  entries: TimelineEntryInput[],
  observations: TimelineObservationInput[],
): TimelineResult {
  const entryTime = new Map(entries.map((entry) => [entry.id, entry.occurredAt]));
  const series = buildSeries(toCandidates(observations, entryTime));
  const changes = series.map(buildChange).filter((c): c is ExplicitChange => c !== null);
  return { days: buildDays(entries, observations, entryTime), series, changes };
}

import type { ExplicitChange, SummaryContent, SummaryItem } from "@/lib/domain/types";
import type { SummarizerInput, SummaryObservationInput } from "@/lib/ai/types";
import { formatShortDate, formatTrendValue, localDay, normalizeLabel, rangeText } from "@/lib/ai/timeline";
import { truncate } from "@/lib/ai/text-utils";

/**
 * Template-based summary (the "mock" AI provider). Everything it says is copied from the
 * patient's explicit statements or from the deterministic timeline; it never advises,
 * diagnoses or rates risk.
 */

const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_CITATIONS = 10;
const CONCERN_CATEGORIES = new Set(["symptom", "sleep", "mood", "wound"]);
const ACTIVITY_CATEGORIES = new Set(["activity", "mobility"]);
const GAP_CATEGORIES = new Set(["symptom", "sleep", "mobility", "wound"]);

/** "You" for the patient audience, "Patient" for clinicians. */
type Subject = "You" | "Patient";

interface Dated {
  obs: SummaryObservationInput;
  time: number;
  date: string;
}

function datedObservations(input: SummarizerInput): Dated[] {
  const entryTime = new Map(input.entries.map((e) => [e.id, e.occurredAt]));
  const result: Dated[] = [];
  for (const obs of input.observations) {
    const iso = obs.observedAt ?? entryTime.get(obs.journalEntryId);
    const time = iso ? Date.parse(iso) : Number.NaN;
    if (!entryTime.has(obs.journalEntryId) || Number.isNaN(time)) continue;
    result.push({ obs, time, date: localDay(time) });
  }
  return result;
}

function latest(items: Dated[]): Dated {
  return items.reduce((best, item) => (item.time >= best.time ? item : best));
}

/** Groups by category + normalized label; most-mentioned (then most recent) first. */
function group(items: Dated[]): Dated[][] {
  const groups = new Map<string, Dated[]>();
  for (const item of items) {
    const key = `${item.obs.category}|${normalizeLabel(item.obs.label)}`;
    groups.set(key, [...(groups.get(key) ?? []), item]);
  }
  const entryCount = (g: Dated[]) => new Set(g.map((d) => d.obs.journalEntryId)).size;
  return [...groups.values()].sort((a, b) => entryCount(b) - entryCount(a) || latest(b).time - latest(a).time);
}

/** Entry ids supporting a group, in chronological order (oldest first). */
function citationsFor(items: Dated[], entryOrder: Map<string, number>): string[] {
  const ids = [...new Set(items.map((d) => d.obs.journalEntryId))];
  return ids.sort((a, b) => (entryOrder.get(a) ?? 0) - (entryOrder.get(b) ?? 0)).slice(0, MAX_CITATIONS);
}

function describe(obs: SummaryObservationInput): string {
  let text = obs.label.toLowerCase();
  if (obs.severity !== null) text += ` rated ${obs.severity}/10`;
  if (obs.measureValue !== null && obs.measureUnit) {
    const measure = formatTrendValue(obs.measureValue, "measure", obs.measureUnit);
    text += obs.category === "sleep" ? ` of ${measure}` : ` (${measure})`;
  }
  const context = obs.context.find((c) => !text.toLowerCase().includes(c.toLowerCase()));
  if (context) text += ` (${context})`;
  return text;
}

/** Range wording for a severity series with 3+ daily points (latest rating per day). */
function severityRange(items: Dated[]): string {
  const perDay = new Map<string, Dated>();
  for (const item of items) {
    if (item.obs.severity === null) continue;
    const current = perDay.get(item.date);
    if (!current || item.time >= current.time) perDay.set(item.date, item);
  }
  const points = [...perDay.values()].map((d) => ({ value: d.obs.severity ?? 0 }));
  return rangeText({ points, kind: "severity", unit: null });
}

function groupItem(items: Dated[], subject: Subject, entryOrder: Map<string, number>, verb: string): SummaryItem {
  const last = latest(items);
  const updates = new Set(items.map((d) => d.obs.journalEntryId)).size;
  const range = severityRange(items);
  const tail = range ? `${range}.` : updates > 1 ? `, and mentioned it in ${updates} updates.` : ".";
  const text = `${subject} ${verb} ${describe(last.obs)} on ${formatShortDate(last.date)}${tail}`;
  return { text: truncate(text, 400), citations: citationsFor(items, entryOrder) };
}

function changeItem(change: ExplicitChange, subject: Subject, timeline: SummarizerInput["timeline"]): SummaryItem {
  const citations = [...new Set([change.from.entryId, change.to.entryId])];
  if (subject === "Patient") return { text: truncate(change.description, 400), citations };
  const what = change.label.replace(/\s*\([^)]*\)\s*$/, "").toLowerCase();
  const fmt = (p: ExplicitChange["from"]) =>
    `${formatTrendValue(p.value, change.kind, change.unit)} (${formatShortDate(p.date)})`;
  const series = timeline.series.find((x) => x.key === change.seriesKey);
  const range = series ? rangeText(series) : "";
  const text =
    change.direction === "unchanged"
      ? `You reported ${what} as ${fmt(change.from)} and again as ${fmt(change.to)}${range}.`
      : `You reported ${what} going from ${fmt(change.from)} to ${fmt(change.to)}${range}.`;
  return { text: truncate(text, 400), citations };
}

function overview(input: SummarizerInput, subject: Subject, dated: Dated[]): string {
  const days = Math.max(1, Math.round((Date.parse(input.periodEnd) - Date.parse(input.periodStart)) / DAY_MS) || 1);
  const span = `${days} ${days === 1 ? "day" : "days"}`;
  const updates = input.entries.length;
  if (updates === 0) return `No updates were shared in the past ${span}.`;

  const who = subject === "You" ? "you" : input.patientFirstName;
  const by = subject === "You" ? "you" : "the patient";
  const count = input.observations.length;
  const topics = group(dated.filter((d) => d.obs.category !== "question" && d.obs.category !== "medication"))
    .slice(0, 3)
    .map((g) => g[0].obs.label.toLowerCase());
  const topicText = topics.length > 0 ? ` Most frequently mentioned: ${topics.join(", ")}.` : "";
  return truncate(
    `Over the past ${span}, ${who} shared ${updates} ${updates === 1 ? "update" : "updates"} with ${count} recorded ${count === 1 ? "observation" : "observations"}.${topicText} Everything here is self-reported by ${by} and unverified.`,
    600,
  );
}

function dataGaps(dated: Dated[]): string[] {
  const gaps = new Map<string, { time: number; dates: Set<string> }>();
  for (const { obs, time, date } of dated) {
    if (!GAP_CATEGORIES.has(obs.category)) continue;
    for (const uncertainty of obs.uncertainties) {
      const key = `${uncertainty.replace(/\.$/, "")} for ${normalizeLabel(obs.label)}`;
      const gap = gaps.get(key) ?? { time: 0, dates: new Set<string>() };
      gap.time = Math.max(gap.time, time);
      gap.dates.add(formatShortDate(date));
      gaps.set(key, gap);
    }
  }
  return [...gaps.entries()]
    .sort((a, b) => b[1].time - a[1].time)
    .slice(0, 8)
    .map(([text, gap]) => truncate(`${text} (${[...gap.dates].slice(0, 3).join(", ")})`, 200));
}

function questionItems(dated: Dated[], subject: Subject): SummaryItem[] {
  const seen = new Set<string>();
  const items: SummaryItem[] = [];
  for (const { obs } of dated.filter((d) => d.obs.category === "question").sort((a, b) => b.time - a.time)) {
    const key = obs.patientQuote.toLowerCase().replace(/\s+/g, " ");
    if (seen.has(key)) continue;
    seen.add(key);
    items.push({
      text: truncate(`${subject} asked: "${truncate(obs.patientQuote, 300)}"`, 400),
      citations: [obs.journalEntryId],
    });
  }
  return items.slice(0, 6);
}

export function summarizeMock(input: SummarizerInput): SummaryContent {
  const subject: Subject = input.audience === "patient" ? "You" : "Patient";
  const entryOrder = new Map(
    [...input.entries].sort((a, b) => a.occurredAt.localeCompare(b.occurredAt)).map((e, i) => [e.id, i]),
  );
  const dated = datedObservations(input);

  const concerns = group(dated.filter((d) => CONCERN_CATEGORIES.has(d.obs.category))).slice(0, 5);
  const activities = group(dated.filter((d) => ACTIVITY_CATEGORIES.has(d.obs.category))).slice(0, 6);

  return {
    overview: overview(input, subject, dated),
    mainConcerns: concerns.map((g) => groupItem(g, subject, entryOrder, g[0].obs.category === "mood" ? "mentioned" : "reported")),
    changesSinceEarlier: input.timeline.changes.slice(0, 6).map((c) => changeItem(c, subject, input.timeline)),
    recoveryActivities: activities.map((g) => groupItem(g, subject, entryOrder, "mentioned")),
    patientQuestions: questionItems(dated, subject),
    dataGaps: dataGaps(dated),
  };
}

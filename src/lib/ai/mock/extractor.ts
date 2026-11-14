import type { ExtractedObservation, PipelineEntry } from "@/lib/ai/schemas";
import type { ObservationCategory } from "@/lib/domain/types";
import {
  EXERCISE_PATTERN,
  LIMP_PATTERN,
  MEDICATION_PATTERN,
  MOBILITY_AID_PATTERN,
  MOOD_PATTERN,
  PHYSIO_PATTERN,
  RETURN_TO_WORK_PATTERN,
  SITELESS_NOUNS,
  SLEEP_PATTERN,
  STAIRS_PATTERN,
  SYMPTOM_NOUN,
  SYMPTOM_PATTERN,
  WALK_PATTERN,
  WOUND_FINDING_NOUN,
  WOUND_FINDING_PATTERN,
  WOUND_SITE_PATTERN,
  detectContext,
  detectTime,
  isQuestionSentence,
  findBodySites,
  findDuration,
  findStepCount,
  findTerms,
  isNegated,
  maskTerms,
  nearestSite,
  questionLabel,
  type Measure,
  type TermMatch,
} from "@/lib/ai/mock/lexicon";
import {
  capitalize,
  findExplicitRatings,
  splitSentences,
  truncate,
  type SentenceSpan,
} from "@/lib/ai/text-utils";

/**
 * Deterministic rule-based extractor (the "mock" AI provider). It only extracts what the
 * patient literally wrote: severity needs an explicit "N/10" style rating, measures need a
 * stated number, and every quote is an exact substring of the entry text.
 */

const MAX_OBSERVATIONS = 20;
const MAX_QUOTE_LENGTH = 600;

interface Draft {
  category: ObservationCategory;
  label: string;
  bodySite: string | null;
  start: number;
  end: number;
  /** Index of the finding inside its sentence (used to pair ratings with symptoms). */
  position: number;
  ratable: boolean;
  severity: number | null;
  severityText: string | null;
  measure: Measure | null;
  time: { description: string; observedAt: string | null } | null;
  context: string[];
  uncertainties: string[];
}

function draft(span: SentenceSpan, partial: Partial<Draft> & Pick<Draft, "category" | "label">): Draft {
  return {
    bodySite: null,
    start: span.start,
    end: span.end,
    position: 0,
    ratable: false,
    severity: null,
    severityText: null,
    measure: null,
    time: null,
    context: [],
    uncertainties: [],
    ...partial,
  };
}

/** Long run-on sentences are split at commas/semicolons so quotes stay focused. */
function toSpans(body: string): SentenceSpan[] {
  return splitSentences(body).flatMap((span) => {
    if (span.text.length <= 400) return [span];
    const parts: SentenceSpan[] = [];
    for (const m of span.text.matchAll(/[^,;]+(?:[,;]\s*|$)/g)) {
      const text = m[0].trim();
      if (text) {
        const start = span.start + (m.index ?? 0) + (m[0].length - m[0].trimStart().length);
        parts.push({ text, start, end: start + text.length });
      }
    }
    return parts;
  });
}

/** Pain-like wordings describe the same finding, so only the first one per site is kept. */
const DISCOMFORT_FAMILY = new Set(["pain", "ache", "aching", "discomfort", "soreness", "throbbing", "tightness"]);

function detectSymptoms(span: SentenceSpan, text: string, masked: string): Draft[] {
  const sites = findBodySites(text);
  const seen = new Set<string>();
  const drafts: Draft[] = [];
  for (const match of findTerms(masked, SYMPTOM_PATTERN)) {
    if (isNegated(masked, match)) continue;
    const noun = SYMPTOM_NOUN[match.term];
    const site = SITELESS_NOUNS.has(noun) ? null : nearestSite(sites, match.index);
    const family = DISCOMFORT_FAMILY.has(noun) ? "discomfort" : noun;
    const key = `${family}|${site?.bodySite ?? ""}`;
    if (seen.has(key)) continue;
    seen.add(key);
    drafts.push(
      draft(span, {
        category: "symptom",
        label: capitalize(site ? `${site.site} ${noun}` : noun),
        bodySite: site?.bodySite ?? null,
        position: match.index,
        ratable: true,
      }),
    );
  }
  // "Knee discomfort ... it aches": the site-less mention belongs to the sited finding.
  const sitedFamilies = new Set(
    [...seen].filter((key) => !key.endsWith("|")).map((key) => key.split("|")[0]),
  );
  return drafts.filter((d) => d.bodySite !== null || !sitedFamilies.has(familyOf(d.label)));
}

function familyOf(label: string): string {
  const noun = label.toLowerCase().split(" ").pop() ?? "";
  return DISCOMFORT_FAMILY.has(noun) ? "discomfort" : noun;
}

function detectWound(span: SentenceSpan, text: string): { drafts: Draft[]; consumed: TermMatch[] } {
  const siteTerms = findTerms(text, WOUND_SITE_PATTERN);
  const findings = findTerms(text, WOUND_FINDING_PATTERN).filter((m) => !isNegated(text, m));
  const consumed = [...siteTerms, ...findings];
  if (consumed.length === 0) return { drafts: [], consumed };

  const bodySite = nearestSite(findBodySites(text), (siteTerms[0] ?? findings[0]).index);
  const siteNoun = siteTerms[0] ? capitalize(siteTerms[0].term.replace(/^steri-?strips?$/, "steri-strips")) : null;
  const nouns = [...new Set(findings.map((m) => WOUND_FINDING_NOUN[m.term]))];
  const labels = nouns.length > 0 ? nouns.map((n) => (siteNoun ? `${siteNoun} ${n}` : capitalize(n))) : siteNoun ? [siteNoun] : [];
  const drafts = labels.map((label) =>
    draft(span, {
      category: "wound",
      label,
      bodySite: bodySite?.bodySite ?? null,
      position: (siteTerms[0] ?? findings[0]).index,
      ratable: true,
    }),
  );
  return { drafts, consumed };
}

function detectSleep(span: SentenceSpan, text: string): Draft[] {
  const matches = findTerms(text, SLEEP_PATTERN);
  if (matches.length === 0) return [];
  const nap = matches.every((m) => /^nap/.test(m.term));
  return [
    draft(span, {
      category: "sleep",
      label: nap ? "Naps" : "Sleep",
      position: matches[0].index,
      measure: findDuration(text, "hours"),
    }),
  ];
}

function detectMobility(span: SentenceSpan, text: string): Draft[] {
  const drafts: Draft[] = [];
  const walk = findTerms(text, WALK_PATTERN);
  const stairs = findTerms(text, STAIRS_PATTERN);
  const aids = findTerms(text, MOBILITY_AID_PATTERN);
  const limp = findTerms(text, LIMP_PATTERN);
  const steps = findStepCount(text);

  if (walk.length > 0) {
    const measure = findDuration(text, "minutes") ?? findDuration(text, "hours") ?? findDuration(text, "distance");
    drafts.push(draft(span, { category: "mobility", label: "Walking", position: walk[0].index, measure }));
  }
  if (steps !== null) {
    drafts.push(draft(span, { category: "mobility", label: "Steps", measure: { value: steps, unit: "steps" } }));
  }
  if (stairs.length > 0) {
    drafts.push(draft(span, { category: "mobility", label: "Stairs", position: stairs[0].index }));
  }
  if (limp.length > 0) {
    drafts.push(draft(span, { category: "mobility", label: "Limping", position: limp[0].index }));
  }
  if (aids.length > 0) {
    if (drafts.length > 0) {
      drafts[0].context.push(`with ${aids[0].term}`);
    } else {
      drafts.push(draft(span, { category: "mobility", label: capitalize(aids[0].term), position: aids[0].index }));
    }
  }
  return drafts;
}

function detectActivity(span: SentenceSpan, text: string, claimedMinutes: boolean): Draft[] {
  const drafts: Draft[] = [];
  const minutes = claimedMinutes ? null : findDuration(text, "minutes");
  const physio = findTerms(text, PHYSIO_PATTERN);
  const exercise = findTerms(text, EXERCISE_PATTERN);
  const work = findTerms(text, RETURN_TO_WORK_PATTERN);
  if (physio.length > 0) {
    drafts.push(draft(span, { category: "activity", label: physio[0].term === "physio" ? "Physiotherapy" : capitalize(physio[0].term), position: physio[0].index, measure: minutes }));
  } else if (exercise.length > 0) {
    drafts.push(draft(span, { category: "activity", label: capitalize(exercise[0].term), position: exercise[0].index, measure: minutes }));
  }
  if (work.length > 0) {
    drafts.push(draft(span, { category: "activity", label: "Return to work", position: work[0].index }));
  }
  return drafts;
}

const MOOD_LABELS: Record<string, string> = {
  anxiety: "Anxiety",
  worry: "Feeling worried",
  worrying: "Feeling worried",
  worried: "Feeling worried",
};

function detectMood(span: SentenceSpan, text: string): Draft[] {
  const match = findTerms(text, MOOD_PATTERN).find((m) => !isNegated(text, m));
  if (!match) return [];
  const spaced = /^(?:feeling|feel|felt|been|bit|little|pretty)\s+(low|down)$/.exec(match.term);
  const label = MOOD_LABELS[match.term] ?? (spaced ? `Feeling ${spaced[1]}` : `Feeling ${match.term}`);
  const about = /\b(?:about|that|because)\s+([^,.;?!]{4,80})/i.exec(text.slice(match.index));
  return [draft(span, { category: "mood", label, position: match.index, context: about ? [about[0].trim()] : [] })];
}

function detectMedication(span: SentenceSpan, text: string): Draft[] {
  const match = findTerms(text, MEDICATION_PATTERN)[0];
  if (!match) return [];
  return [draft(span, { category: "medication", label: capitalize(match.term), position: match.index })];
}

function analyzeSentence(span: SentenceSpan, entry: PipelineEntry): Draft[] {
  const text = span.text;
  const isQuestion = isQuestionSentence(text);
  const time = detectTime(text, entry.occurredAt);
  const context = detectContext(text);

  const medicationMatches = findTerms(text, MEDICATION_PATTERN);
  const wound = detectWound(span, text);
  const masked = maskTerms(text, [...medicationMatches, ...wound.consumed]);

  let drafts: Draft[] = isQuestion ? [] : [...wound.drafts, ...detectSymptoms(span, text, masked)];
  if (!isQuestion) {
    drafts.push(...detectSleep(span, text));
    const mobility = detectMobility(span, text);
    const claimedMinutes = mobility.some((d) => d.measure?.unit === "minutes");
    drafts.push(...mobility, ...detectActivity(span, text, claimedMinutes), ...detectMood(span, text), ...detectMedication(span, text));
  }

  const contextual = new Set<ObservationCategory>(["symptom", "wound", "mobility", "sleep"]);
  drafts = drafts.map((d) => ({
    ...d,
    time: d.category === "medication" || d.category === "mood" ? null : time,
    context: contextual.has(d.category) ? [...new Set([...d.context, ...context])] : d.context,
  }));

  addSiteOnlyRating(drafts, span, text, time, context);
  assignRatings(drafts, text);

  if (isQuestion) {
    drafts.push(draft(span, { category: "question", label: truncate(questionLabel(text), 80) }));
  }
  return drafts;
}

/**
 * "My knee is a 7 out of 10 right now": an explicit rating with a body site but no symptom
 * keyword becomes a "<Site> discomfort" observation so the rating is not lost.
 */
function addSiteOnlyRating(
  drafts: Draft[],
  span: SentenceSpan,
  text: string,
  time: Draft["time"],
  context: string[],
): void {
  if (drafts.some((d) => d.ratable)) return;
  const rating = findExplicitRatings(text)[0];
  const site = rating ? nearestSite(findBodySites(text), rating.index) : null;
  if (!rating || !site) return;
  drafts.push(
    draft(span, {
      category: "symptom",
      label: capitalize(`${site.site} discomfort`),
      bodySite: site.bodySite,
      position: rating.index,
      ratable: true,
      time,
      context,
    }),
  );
}

/** Pairs each explicit rating in the sentence with the nearest symptom/wound mention. */
function assignRatings(drafts: Draft[], text: string): void {
  const ratable = drafts.filter((d) => d.ratable);
  const free = new Set(ratable);
  for (const rating of findExplicitRatings(text)) {
    let best: Draft | null = null;
    for (const d of free) {
      if (!best || Math.abs(d.position - rating.index) < Math.abs(best.position - rating.index)) best = d;
    }
    if (!best) break;
    best.severity = rating.value;
    best.severityText = rating.text.trim();
    free.delete(best);
  }
}

function finalize(d: Draft, entry: PipelineEntry, body: string): ExtractedObservation {
  const uncertainties = [...d.uncertainties];
  if (d.category === "symptom" && d.severity === null) uncertainties.push("Intensity not stated");
  if ((d.category === "symptom" || d.category === "wound") && !d.time) uncertainties.push("Timing not stated");
  if ((d.category === "sleep" || d.label === "Walking") && !d.measure) uncertainties.push("Duration not stated");

  const end = Math.min(d.end, d.start + MAX_QUOTE_LENGTH);
  return {
    sourceEntryId: entry.id,
    category: d.category,
    label: truncate(d.label, 80),
    bodySite: d.bodySite,
    patientQuote: body.slice(d.start, end),
    observedAt: d.time?.observedAt ?? null,
    timeDescription: d.time?.description ?? null,
    severity: d.severity,
    severityText: d.severityText,
    measureValue: d.measure?.value ?? null,
    measureUnit: d.measure?.unit ?? null,
    context: d.context.slice(0, 8).map((c) => truncate(c, 160)),
    uncertainties: [...new Set(uncertainties)],
  };
}

/** Removes exact duplicates and bare mentions already covered by a richer observation. */
function dedupe(drafts: Draft[]): Draft[] {
  const groupKey = (d: Draft) => `${d.category}|${d.label.toLowerCase()}|${d.bodySite ?? ""}`;
  const richKeys = new Set(drafts.filter((d) => d.severity !== null || d.measure !== null).map(groupKey));
  const seen = new Set<string>();
  return drafts.filter((d) => {
    if (d.severity === null && d.measure === null && richKeys.has(groupKey(d))) return false;
    const key = `${groupKey(d)}|${d.severity}|${d.measure?.value}|${d.measure?.unit}|${d.time?.description ?? ""}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function extractObservationsMock(entry: PipelineEntry): ExtractedObservation[] {
  const spans = toSpans(entry.body);
  const all: Draft[] = [];
  let previous: Draft[] = [];

  for (const span of spans) {
    const drafts = analyzeSentence(span, entry);
    const rating = findExplicitRatings(span.text)[0];
    // A sentence like "It's about a 7 out of 10." rates the previous sentence's finding.
    if (drafts.length === 0 && rating) {
      const target = [...previous].reverse().find((d) => d.ratable && d.severity === null);
      if (target) {
        target.severity = rating.value;
        target.severityText = rating.text.trim();
        target.end = span.end;
        target.time ??= detectTime(span.text, entry.occurredAt);
      }
    }
    all.push(...drafts);
    if (drafts.length > 0) previous = drafts;
  }

  return dedupe(all)
    .map((d) => finalize(d, entry, entry.body))
    .slice(0, MAX_OBSERVATIONS);
}

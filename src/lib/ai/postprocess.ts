import {
  ExtractedObservationSchema,
  SummaryContentSchema,
  type ExtractedObservation,
  type PipelineEntry,
} from "@/lib/ai/schemas";
import type { SummaryContent, SummaryItem } from "@/lib/domain/types";
import {
  findExplicitRatings,
  normalizeWhitespace,
  splitSentences,
  textMentionsNumber,
  truncate,
} from "@/lib/ai/text-utils";

/**
 * Guards applied to the output of EVERY provider (mock or OpenAI) before it is used:
 * verbatim quotes, explicit-only severity/measures, valid citations, schema validation.
 */

const MAX_QUOTE_LENGTH = 600;
const GENERIC_WORDS = new Set(["the", "and", "of", "my", "feeling", "about", "question", "for", "care", "team"]);

function keywords(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((word) => word.length > 2 && !GENERIC_WORDS.has(word));
}

/** Returns a quote that is a whitespace-normalized substring of the source, or null. */
function repairQuote(source: string, observation: ExtractedObservation): string | null {
  const normalizedSource = normalizeWhitespace(source);
  const quote = normalizeWhitespace(observation.patientQuote);
  if (quote.length > 0 && normalizedSource.includes(quote)) return truncate(quote, MAX_QUOTE_LENGTH);

  // Fall back to the sentence that best matches the label keywords (or, failing that, the claimed quote).
  const labelWords = keywords(`${observation.label} ${observation.bodySite ?? ""}`);
  const quoteWords = new Set(keywords(observation.patientQuote));
  let best: { text: string; score: number } | null = null;
  for (const sentence of splitSentences(source)) {
    const words = new Set(keywords(sentence.text));
    const labelHits = labelWords.filter((w) => words.has(w) || [...words].some((s) => s.startsWith(w.slice(0, 5)))).length;
    const quoteHits = [...quoteWords].filter((w) => words.has(w)).length;
    if (labelHits === 0 && quoteHits < 2) continue;
    const score = labelHits * 10 + quoteHits;
    if (!best || score > best.score) best = { text: normalizeWhitespace(sentence.text), score };
  }
  return best ? truncate(best.text, MAX_QUOTE_LENGTH) : null;
}

function addUncertainty(list: string[], text: string): string[] {
  return list.includes(text) ? list : [...list, text];
}

/** Keeps severity only when the patient wrote an explicit rating that matches the number. */
function guardSeverity(source: string, obs: ExtractedObservation): ExtractedObservation {
  if (obs.severity === null) return { ...obs, severityText: null };
  const severityText =
    obs.severityText && normalizeWhitespace(source).includes(normalizeWhitespace(obs.severityText)) ? obs.severityText : "";
  const ratings = findExplicitRatings(`${obs.patientQuote} ${severityText}`);
  if (ratings.some((r) => r.value === obs.severity)) return obs;
  return {
    ...obs,
    severity: null,
    severityText: null,
    uncertainties: addUncertainty(obs.uncertainties, "Intensity not stated"),
  };
}

/** Keeps a measure only when its number actually appears in the quote. */
function guardMeasure(obs: ExtractedObservation): ExtractedObservation {
  if (obs.measureValue === null && obs.measureUnit === null) return obs;
  if (obs.measureValue !== null && obs.measureUnit && textMentionsNumber(obs.patientQuote, obs.measureValue)) return obs;
  return { ...obs, measureValue: null, measureUnit: null };
}

function guardObservedAt(obs: ExtractedObservation): ExtractedObservation {
  if (obs.observedAt === null) return obs;
  const time = Date.parse(obs.observedAt);
  return Number.isNaN(time) ? { ...obs, observedAt: null } : { ...obs, observedAt: new Date(time).toISOString() };
}

/** Validates, repairs or drops the observations extracted for one entry. */
export function postprocessObservations(
  entry: Pick<PipelineEntry, "id" | "body">,
  observations: ExtractedObservation[],
): ExtractedObservation[] {
  const result: ExtractedObservation[] = [];
  for (const raw of observations) {
    const quote = repairQuote(entry.body, raw);
    if (!quote) continue;
    const candidate: ExtractedObservation = {
      ...raw,
      sourceEntryId: entry.id,
      label: truncate(raw.label.trim(), 80) || raw.label,
      patientQuote: quote,
      context: raw.context.slice(0, 8).map((c) => truncate(c, 160)),
      uncertainties: raw.uncertainties.slice(0, 8).map((u) => truncate(u, 200)),
    };
    const guarded = guardObservedAt(guardMeasure(guardSeverity(entry.body, candidate)));
    const parsed = ExtractedObservationSchema.safeParse(guarded);
    if (parsed.success) result.push(parsed.data);
  }
  return result.slice(0, 20);
}

function cleanItems(items: SummaryItem[], known: Set<string>): SummaryItem[] {
  const cleaned: SummaryItem[] = [];
  for (const item of items) {
    const citations = [...new Set(item.citations.filter((id) => known.has(id)))].slice(0, 10);
    const text = item.text.trim();
    if (citations.length === 0 || text.length === 0) continue;
    cleaned.push({ text: truncate(text, 400), citations });
  }
  return cleaned.slice(0, 8);
}

/** Filters citations to known entry ids, drops uncited items, and validates the shape. Throws if unusable. */
export function postprocessSummary(summary: SummaryContent, knownEntryIds: Iterable<string>): SummaryContent {
  const known = new Set(knownEntryIds);
  return SummaryContentSchema.parse({
    overview: truncate(summary.overview.trim(), 600),
    mainConcerns: cleanItems(summary.mainConcerns, known),
    changesSinceEarlier: cleanItems(summary.changesSinceEarlier, known),
    recoveryActivities: cleanItems(summary.recoveryActivities, known),
    patientQuestions: cleanItems(summary.patientQuestions, known),
    dataGaps: summary.dataGaps
      .map((gap) => truncate(gap.trim(), 200))
      .filter((gap) => gap.length > 0)
      .slice(0, 8),
  });
}

/** Small, pure text helpers shared by the mock extractor and the post-processing guards. */

const NUMBER_WORDS: Record<string, number> = {
  zero: 0,
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
};

const NUMBER_WORD_PATTERN = Object.keys(NUMBER_WORDS).join("|");

/** Parses "7", "seven" or "2,000" into a number; null when it is not a plain number. */
export function parseNumberToken(token: string): number | null {
  const cleaned = token.trim().toLowerCase().replace(/,/g, "");
  if (cleaned in NUMBER_WORDS) return NUMBER_WORDS[cleaned];
  return /^\d+(?:\.\d+)?$/.test(cleaned) ? Number(cleaned) : null;
}

export function normalizeWhitespace(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

export interface SentenceSpan {
  text: string;
  start: number;
  end: number;
}

/** Titles and abbreviations that end with a full stop without ending the sentence ("Dr. Park"). */
const ABBREVIATION_END = /(?:^|[^A-Za-z])(?:dr|mr|mrs|ms|mx|prof|st|e\.g|i\.e)\.$/i;

/** Splits text into sentences, keeping offsets so quotes stay exact substrings of the source. */
export function splitSentences(text: string): SentenceSpan[] {
  const spans: SentenceSpan[] = [];
  const pattern = /[^\n]+?(?:[.!?]+(?=\s|$)|(?=\n)|$)/g;
  for (const match of text.matchAll(pattern)) {
    const raw = match[0];
    const lead = raw.length - raw.trimStart().length;
    const trimmed = raw.trim();
    if (trimmed.length === 0) continue;
    const start = (match.index ?? 0) + lead;
    const end = start + trimmed.length;
    const previous = spans.at(-1);
    // "I want to ask Dr." + "Park about it." is one sentence (same line only).
    if (previous && ABBREVIATION_END.test(previous.text) && !text.slice(previous.end, start).includes("\n")) {
      previous.text = text.slice(previous.start, end);
      previous.end = end;
      continue;
    }
    spans.push({ text: trimmed, start, end });
  }
  return spans;
}

const RATING_PATTERN = new RegExp(
  String.raw`\b(?:(?:about|around|roughly|maybe|probably|like)\s+)?(?:an?\s+)?(\d{1,2}|${NUMBER_WORD_PATTERN})\s*(?:\/|out\s+of|of)\s*(?:10|ten)\b`,
  "gi",
);

export interface ExplicitRating {
  value: number;
  /** The matched wording, e.g. "about 7 out of 10". */
  text: string;
  index: number;
}

/** Finds explicit 0-10 ratings such as "7/10", "7 out of 10" or "seven out of ten". */
export function findExplicitRatings(text: string): ExplicitRating[] {
  const ratings: ExplicitRating[] = [];
  for (const match of text.matchAll(RATING_PATTERN)) {
    const value = parseNumberToken(match[1]);
    if (value !== null && Number.isInteger(value) && value >= 0 && value <= 10) {
      ratings.push({ value, text: match[0], index: match.index ?? 0 });
    }
  }
  return ratings;
}

/** True when the number appears in the text as digits (optionally with thousands separators) or a number word. */
export function textMentionsNumber(text: string, value: number): boolean {
  const lower = text.toLowerCase();
  const digits = lower.replace(/(\d),(\d{3})/g, "$1$2").match(/\d+(?:\.\d+)?/g) ?? [];
  if (digits.some((d) => Number(d) === value)) return true;
  return Object.entries(NUMBER_WORDS).some(
    ([word, n]) => n === value && new RegExp(String.raw`\b${word}\b`).test(lower),
  );
}

export function capitalize(text: string): string {
  return text.length === 0 ? text : text[0].toUpperCase() + text.slice(1);
}

export function truncate(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max - 1).trimEnd()}…`;
}

export const NUMBER_WORD_REGEX_SOURCE = NUMBER_WORD_PATTERN;

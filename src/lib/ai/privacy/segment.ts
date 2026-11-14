import type { NumberedSentence } from "./types";

/** Abbreviations whose trailing period does not end a sentence. */
const ABBREVIATION_END = /(?:^|[^A-Za-z])(?:dr|mr|mrs|ms|mx|st|prof|jr|sr|vs|approx|no|a\.m|p\.m|e\.g|i\.e|inc|ltd)\.$/i;

/** Splits one line at sentence ends, keeping abbreviations and decimals intact. */
function splitLine(line: string): string[] {
  const parts: string[] = [];
  let start = 0;
  const boundary = /[.!?]+["')\]]*(?=\s+)/g;
  for (const match of line.matchAll(boundary)) {
    const end = (match.index ?? 0) + match[0].length;
    const before = line.slice(start, end);
    const next = line.slice(end).trimStart()[0] ?? "";
    // Only split when the next sentence plausibly starts here: capital letter, digit, quote or bracket.
    if (!/[A-Z0-9"'“‘(\[]/.test(next)) continue;
    if (/\.$/.test(match[0]) && match[0] === "." && ABBREVIATION_END.test(before.trimEnd())) continue;
    parts.push(before);
    start = end;
  }
  parts.push(line.slice(start));
  return parts.map((p) => p.trim()).filter((p) => p.length > 0);
}

/**
 * Deterministic sentence segmentation. Line breaks always end a sentence (speaker lines,
 * lists); within a line, sentences end at . ! ? except after abbreviations (Dr., Mr., St.,
 * e.g.) and inside decimals (4.5).
 */
export function segmentSentences(text: string): NumberedSentence[] {
  const sentences: NumberedSentence[] = [];
  const lines = text.replace(/\r\n?/g, "\n").split("\n");
  let pendingNewline = false;
  for (const raw of lines) {
    const line = raw.trim();
    if (line.length === 0) {
      pendingNewline = sentences.length > 0;
      continue;
    }
    splitLine(line).forEach((piece, i) => {
      sentences.push({
        n: sentences.length + 1,
        text: piece.replace(/\s+/g, " "),
        sep: i === 0 && (pendingNewline || sentences.length > 0) ? "newline" : "space",
        lineStart: i === 0,
      });
    });
    pendingNewline = false;
  }
  if (sentences.length > 0) sentences[0].sep = "space";
  return sentences;
}

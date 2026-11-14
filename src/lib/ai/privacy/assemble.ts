import { PRIVACY_REDACTION_CATEGORIES, type PrivacyRedactionCategory } from "@/lib/domain/types";
import { addCounts, applySafetyNet, type RedactionCounts } from "./safety-net";
import { PLACEHOLDERS, type Classification, type NumberedSentence, type Redaction } from "./types";

const TITLE_BEFORE = /\b(?:Dr|Doctor|Nurse|Prof)\.?\s+$/i;
const isCategory = (value: string): value is PrivacyRedactionCategory =>
  (PRIVACY_REDACTION_CATEGORIES as readonly string[]).includes(value);

/**
 * Defensive clean-up of a classifier answer: ignores out-of-range or duplicate sentence
 * numbers, and redactions that are not an exact substring of a KEPT sentence.
 */
export function normalizeClassification(raw: Classification, sentences: NumberedSentence[]): Classification {
  const byNumber = new Map(sentences.map((s) => [s.n, s]));
  const keepSet = new Set<number>();
  for (const n of raw.keep) {
    if (Number.isInteger(n) && byNumber.has(n)) keepSet.add(n);
  }
  const redactions: Redaction[] = [];
  const seen = new Set<string>();
  for (const r of raw.redactions) {
    const sentence = byNumber.get(r.sentence);
    if (!sentence || !keepSet.has(r.sentence) || !isCategory(r.category)) continue;
    if (r.text.trim().length === 0 || !sentence.text.includes(r.text)) continue;
    const key = `${r.sentence}|${r.text}|${r.category}`;
    if (seen.has(key)) continue;
    seen.add(key);
    redactions.push(r);
  }
  return { keep: [...keepSet].sort((a, b) => a - b), redactions };
}

/** Replaces every occurrence of `span` (except right after Dr./Doctor/Nurse for names). */
function replaceSpan(text: string, span: string, category: PrivacyRedactionCategory): { text: string; count: number } {
  let count = 0;
  let out = "";
  let cursor = 0;
  for (let at = text.indexOf(span); at !== -1; at = text.indexOf(span, cursor)) {
    const skip = category === "person_name" && TITLE_BEFORE.test(text.slice(0, at));
    out += text.slice(cursor, at) + (skip ? span : PLACEHOLDERS[category]);
    if (!skip) count++;
    cursor = at + span.length;
  }
  return { text: out + text.slice(cursor), count };
}

export interface AssembledText {
  text: string;
  totalSentences: number;
  keptSentences: number;
  redactions: RedactionCounts;
}

/**
 * Builds the stored text from the kept ORIGINAL sentences with placeholders swapped in,
 * after the deterministic safety net. The classifier never writes any text.
 */
export function assembleFiltered(sentences: NumberedSentence[], classification: Classification): AssembledText {
  const clean = normalizeClassification(classification, sentences);
  const counts: RedactionCounts = {};
  const kept = new Set(clean.keep);
  let text = "";
  let keptSentences = 0;

  for (const sentence of sentences) {
    if (!kept.has(sentence.n)) continue;
    // Deterministic patterns first (an address wins over a name-looking street), then model/mock spans.
    const net = applySafetyNet(sentence.text);
    addCounts(counts, net.counts);
    let current = net.text;
    const spans = clean.redactions
      .filter((r) => r.sentence === sentence.n)
      .sort((a, b) => b.text.length - a.text.length);
    for (const span of spans) {
      const result = replaceSpan(current, span.text, span.category);
      current = result.text;
      if (result.count > 0) addCounts(counts, { [span.category]: result.count });
    }
    if (current.trim().length === 0) continue;
    text += keptSentences === 0 ? current : (sentence.sep === "newline" ? "\n" : " ") + current;
    keptSentences++;
  }
  return { text, totalSentences: sentences.length, keptSentences, redactions: counts };
}

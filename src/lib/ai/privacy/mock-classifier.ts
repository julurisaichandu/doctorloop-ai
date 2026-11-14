import { findBodySites, SYMPTOM_PATTERN } from "@/lib/ai/mock/lexicon";
import { findExplicitRatings } from "@/lib/ai/text-utils";
import { estimatedUsageEvent, reportModelUsage } from "@/lib/ai/usage";
import { classifyHealthRelevance } from "@/lib/integrations/vexo/relevance";
import { buildPrivacyUserPrompt, PRIVACY_SYSTEM_PROMPT } from "./openai-classifier";
import type { Classification, NumberedSentence, PrivacyClassifier, Redaction } from "./types";

/**
 * Rule-based privacy classifier: deterministic, no network. It keeps sentences about the
 * patient's health and recovery and flags other people's names; phones, e-mails, links,
 * IDs and addresses are handled by the shared safety net.
 */

const CARE_QUESTION =
  /\bshould i\b|\bwhen can i\b|\bwhen will i\b|\bis it (?:okay|ok|normal|safe)\b|\bis that (?:okay|ok|normal)\b|\bask(?:ing)?\s+(?:Dr\.?|doctor|the|my)\b/i;
const SLEEP_DURATION =
  /\b(?:slept|sleep|sleeping)\b[^.!?]*\b(?:\d+(?:\.\d+)?|one|two|three|four|five|six|seven|eight|nine|ten)\b[^.!?]*\b(?:hours?|hrs?)\b/i;
const CONTINUATION =
  /^(?:It|That|This|They|These|Those)\b\s+(?:is|was|are|were|feels?|felt|has|hasn't|isn't|gets?|got|seems?|keeps?)\b/i;

function hasSymptomTerm(text: string): boolean {
  return new RegExp(SYMPTOM_PATTERN.source, "i").test(text);
}

/** Whether the sentence is about the patient's health on its own. */
function isHealthSentence(text: string): boolean {
  return (
    classifyHealthRelevance(text).relevant ||
    hasSymptomTerm(text) ||
    findBodySites(text).length > 0 ||
    findExplicitRatings(text).length > 0 ||
    SLEEP_DURATION.test(text) ||
    CARE_QUESTION.test(text)
  );
}

export function mockKeep(sentences: NumberedSentence[]): number[] {
  const keep: number[] = [];
  let previousKept = false;
  for (const sentence of sentences) {
    const kept: boolean =
      isHealthSentence(sentence.text) ||
      (previousKept &&
        ((CONTINUATION.test(sentence.text) && sentence.text.length <= 100) || /\bquestions?\b/i.test(sentence.text)));
    if (kept) keep.push(sentence.n);
    previousKept = kept;
  }
  return keep;
}

// --- Names ---------------------------------------------------------------------

const WEEKDAYS_MONTHS = new Set(
  "monday tuesday wednesday thursday friday saturday sunday january february march april may june july august september october november december".split(
    " ",
  ),
);
/** Capitalised words that are not names (health places, titles, generic headings). */
const NOT_NAMES = new Set(
  "i i'm i'll i'd i've dr doctor nurse prof physical therapy therapist physio physiotherapy care team emergency room hospital clinic surgery knee hip shoulder ankle gp nhs".split(
    " ",
  ),
);
const LABEL_ALLOWLIST = new Set(
  "note notes update today question questions reminder symptoms symptom pain sleep me patient doctor nurse physio mood medication medications exercise exercises summary tip yesterday tomorrow morning evening night".split(
    " ",
  ),
);
const TITLE_BEFORE = /\b(?:Dr|Doctor|Nurse|Prof)\.?\s+$/i;
const TITLED_NAME = /\b(?:Mr|Mrs|Ms|Miss|Mx)\.?\s+[A-Z][a-z]+(?:\s+[A-Z][a-z]+)?/g;
const RELATION_NAME =
  /\b(?:my|our|her|his|their)\s+(?:friend|neighbour|neighbor|coworker|co-worker|colleague|boss|manager|husband|wife|partner|sister|brother|mum|mom|dad|son|daughter|cousin)\s+([A-Za-z][\w'’-]*(?:\s+[A-Za-z][\w'’-]*){0,2})/gi;
const SPEAKER_LABEL = /^([A-Z][a-z]+(?:\s[A-Z][a-z]+)?):\s/;
const CAPITALISED = /^[A-Z][a-z]+(?:['’][a-z]+)?$/;

function isNameWord(word: string): boolean {
  return CAPITALISED.test(word) && !NOT_NAMES.has(word.toLowerCase()) && !WEEKDAYS_MONTHS.has(word.toLowerCase());
}

/** Spans (exact substrings) of other people's names in one sentence. */
export function findNameSpans(sentence: NumberedSentence): string[] {
  const text = sentence.text;
  const spans = new Set<string>();

  for (const m of text.matchAll(TITLED_NAME)) spans.add(m[0]);

  for (const m of text.matchAll(RELATION_NAME)) {
    const words = m[1].split(/\s+/);
    if (/^(?:dr|doctor|nurse|prof)\.?$/i.test(words[0])) continue;
    const name: string[] = [];
    for (const word of words) {
      if (!isNameWord(word)) break;
      name.push(word);
    }
    if (name.length > 0) spans.add(name.join(" "));
  }

  if (sentence.lineStart) {
    const label = SPEAKER_LABEL.exec(text);
    if (label && !LABEL_ALLOWLIST.has(label[1].toLowerCase()) && label[1].split(" ").every(isNameWord)) {
      spans.add(label[1]);
    }
  }

  // Two or more consecutive capitalised words in the middle of a sentence.
  const tokens = [...text.matchAll(/[A-Za-z][\w'’-]*/g)].map((m) => ({ word: m[0], index: m.index ?? 0 }));
  for (let i = 1; i < tokens.length; i++) {
    if (!isNameWord(tokens[i].word)) continue;
    let j = i;
    while (
      j + 1 < tokens.length &&
      isNameWord(tokens[j + 1].word) &&
      /^\s+$/.test(text.slice(tokens[j].index + tokens[j].word.length, tokens[j + 1].index))
    ) {
      j++;
    }
    if (j > i && !TITLE_BEFORE.test(text.slice(0, tokens[i].index))) {
      spans.add(text.slice(tokens[i].index, tokens[j].index + tokens[j].word.length));
    }
    i = j;
  }
  return [...spans];
}

export function mockClassify(sentences: NumberedSentence[]): Classification {
  const keep = mockKeep(sentences);
  const kept = new Set(keep);
  const redactions: Redaction[] = [];
  for (const sentence of sentences) {
    if (!kept.has(sentence.n)) continue;
    for (const text of findNameSpans(sentence)) {
      redactions.push({ sentence: sentence.n, text, category: "person_name" });
    }
  }
  return { keep, redactions };
}

export const mockPrivacyClassifier: PrivacyClassifier = {
  provider: "mock",
  model: null,
  classify: async (sentences) => {
    const result = mockClassify(sentences);
    reportModelUsage(
      estimatedUsageEvent(
        "privacy_filter",
        "mock",
        null,
        PRIVACY_SYSTEM_PROMPT + "\n" + buildPrivacyUserPrompt(sentences),
        JSON.stringify(result),
      ),
    );
    return result;
  },
};

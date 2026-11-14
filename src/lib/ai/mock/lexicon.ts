import { NUMBER_WORD_REGEX_SOURCE, parseNumberToken } from "@/lib/ai/text-utils";

/** Keyword lexicons and phrase detectors for the rule-based extractor. */

export interface TermMatch {
  /** Lower-case matched wording. */
  term: string;
  index: number;
}

export function findTerms(text: string, pattern: RegExp): TermMatch[] {
  const flags = pattern.flags.includes("g") ? pattern.flags : `${pattern.flags}g`;
  return [...text.matchAll(new RegExp(pattern.source, flags))].map((m) => ({
    term: m[0].toLowerCase(),
    index: m.index ?? 0,
  }));
}

/** True for "no pain", "without swelling", "swelling has gone", "pain free". */
export function isNegated(text: string, match: TermMatch): boolean {
  const before = text.slice(Math.max(0, match.index - 24), match.index).toLowerCase();
  const after = text.slice(match.index + match.term.length, match.index + match.term.length + 12).toLowerCase();
  return (
    /\b(?:no|not|without|never|nothing|isn't|wasn't|haven't|hasn't|don't|doesn't|didn't)\s+(?:\w+\s+){0,2}$/.test(before) ||
    /^[\s-]*(?:free|gone)\b/.test(after)
  );
}

/** Replaces matched spans with spaces so later detectors ignore them (offsets are preserved). */
export function maskTerms(text: string, matches: TermMatch[]): string {
  let masked = text;
  for (const m of matches) {
    masked = masked.slice(0, m.index) + " ".repeat(m.term.length) + masked.slice(m.index + m.term.length);
  }
  return masked;
}

// --- Categories -------------------------------------------------------------

export const SYMPTOM_PATTERN =
  /\b(?:pain|painful|hurt|hurts|hurting|ache|aches|aching|sore|soreness|discomfort|swelling|swollen|stiff|stiffness|tight|tightness|tired|tiredness|fatigue|fatigued|exhausted|nausea|nauseous|dizzy|dizziness|headache|cramp|cramps|cramping|throbbing)\b/gi;

/** Display noun that keeps the patient's wording. */
export const SYMPTOM_NOUN: Record<string, string> = {
  pain: "pain",
  painful: "pain",
  hurt: "pain",
  hurts: "pain",
  hurting: "pain",
  ache: "ache",
  aches: "ache",
  aching: "aching",
  sore: "soreness",
  soreness: "soreness",
  discomfort: "discomfort",
  swelling: "swelling",
  swollen: "swelling",
  stiff: "stiffness",
  stiffness: "stiffness",
  tight: "tightness",
  tightness: "tightness",
  tired: "tiredness",
  tiredness: "tiredness",
  fatigue: "fatigue",
  fatigued: "fatigue",
  exhausted: "fatigue",
  nausea: "nausea",
  nauseous: "nausea",
  dizzy: "dizziness",
  dizziness: "dizziness",
  headache: "headache",
  cramp: "cramping",
  cramps: "cramping",
  cramping: "cramping",
  throbbing: "throbbing",
};

/** Nouns that describe the whole person, not a body site. */
export const SITELESS_NOUNS = new Set(["tiredness", "fatigue", "nausea", "dizziness", "headache"]);

export const SLEEP_PATTERN = /\b(?:sleep|slept|sleeping|sleepless|insomnia|woke|woken|waking|awake|nap|napped|napping)\b/gi;
export const MOOD_PATTERN =
  /\b(?:anxious|anxiety|worried|worry|worrying|nervous|frustrated|frustrating|stressed|discouraged|overwhelmed|upset|scared|sad|hopeful|relieved|optimistic|(?:feeling|feel|felt|been|bit|little|pretty)\s+(?:low|down))\b/gi;
export const MEDICATION_PATTERN =
  /\b(?:medication|medications|medicine|meds|pills?|tablets?|ibuprofen|paracetamol|acetaminophen|tylenol|naproxen|aspirin|painkillers?|pain killers?|pain relief|antibiotics?|codeine|oxycodone|blood thinners?)\b/gi;
export const WOUND_SITE_PATTERN = /\b(?:incisions?|wounds?|stitches|sutures?|staples|scars?|dressing|steri-?strips?)\b/gi;
export const WOUND_FINDING_PATTERN = /\b(?:redness|red|bruising|bruises?|bruised|drainage|oozing|itchy|itching)\b/gi;
export const WOUND_FINDING_NOUN: Record<string, string> = {
  redness: "redness",
  red: "redness",
  bruising: "bruising",
  bruise: "bruising",
  bruises: "bruising",
  bruised: "bruising",
  drainage: "drainage",
  oozing: "drainage",
  itchy: "itching",
  itching: "itching",
};
export const PHYSIO_PATTERN = /\b(?:physio|physiotherapy|physical therapy|physical therapist)\b/gi;
export const EXERCISE_PATTERN = /\b(?:exercises?|stretch(?:es|ing)?|yoga|workout|swimming|cycling)\b/gi;
export const RETURN_TO_WORK_PATTERN = /\b(?:returned to work|went back to work|back to work|worked from home|started working)\b/gi;
export const WALK_PATTERN = /\b(?:walk|walked|walking|walks)\b/gi;
export const STAIRS_PATTERN = /\bstairs?\b/gi;
export const MOBILITY_AID_PATTERN = /\b(?:crutch|crutches|cane|walker)\b/gi;
export const LIMP_PATTERN = /\b(?:limp|limping|limped)\b/gi;
export const QUESTION_PATTERN =
  /\?|\bi want to ask\b|\bi would like to ask\b|\bi'd like to ask\b|\bwondering\b|\bshould i\b|\bis it normal\b|\bis that normal\b|\bcan i\b|\bwhen can i\b|\bi have a question\b/i;

const DIRECT_QUESTION = /\bshould i\b|\bis it normal\b|\bis that normal\b|\bcan i\b|\bwhen can i\b/i;
const ASK_CONTENT = /\b(?:ask(?:ing)?|wonder(?:ing)?)\b([^.!?]*)/i;
const WHETHER_CONTENT = /\bwhether\s+\S+/i;
const ASK_FILLER = new Set(
  "a an and at about as again anything for from her him i i'd i'll i'm it later me my next on or please question questions the them then this to today tomorrow you your will would want like have appointment appointments visit visits doctor surgeon team nurse physio checkup check-up review session consult consultation in during when of that so just".split(" "),
);

/**
 * True only when the sentence holds an actual question: a question mark, a direct question
 * phrase, or "ask/wondering/whether ..." followed by real content. A bare intent
 * ("I want to ask at my next appointment.") is not a question.
 */
export function isQuestionSentence(sentence: string): boolean {
  if (sentence.includes("?") || DIRECT_QUESTION.test(sentence) || WHETHER_CONTENT.test(sentence)) return true;
  const ask = ASK_CONTENT.exec(sentence);
  if (!ask) return false;
  const words = ask[1].toLowerCase().match(/[a-z'-]+/g) ?? [];
  return words.some((w) => !ASK_FILLER.has(w));
}

const QUESTION_TOPICS: [RegExp, string][] = [
  [/\bic(?:e|ing)\b/i, "icing"],
  [/\bdriv(?:e|ing)\b/i, "driving"],
  [/\b(?:lifting|lift|carrying|carry)\b/i, "lifting"],
  [/\b(?:work|desk job|office)\b/i, "returning to work"],
  [/\b(?:night|overnight)\b.*\b(?:ache|aching|pain|hurts?)\b|\b(?:ache|aching|pain|hurts?)\b.*\b(?:night|overnight)\b/i, "night aching"],
  [/\b(?:shower|bath|bathing|showering)\b/i, "showering"],
  [/\b(?:sleep|sleeping)\b/i, "sleep"],
  [/\b(?:swelling|swollen)\b/i, "swelling"],
  [/\b(?:medication|medicine|painkillers?|ibuprofen|pills?)\b/i, "medication"],
  [/\b(?:exercise|exercises|physio|physiotherapy|stretching)\b/i, "exercises"],
  [/\b(?:stairs|walking|crutches|cane|walker)\b/i, "mobility"],
];

export function questionLabel(sentence: string): string {
  for (const [pattern, topic] of QUESTION_TOPICS) {
    if (pattern.test(sentence)) return `Question about ${topic}`;
  }
  const about = /\babout\s+((?:[\w'-]+\s*){1,5})/i.exec(sentence);
  if (about) return `Question about ${about[1].trim().toLowerCase()}`;
  return "Question for care team";
}

// --- Body sites -------------------------------------------------------------

const SITE_WORDS =
  "knee|hip|shoulder|ankle|leg|calf|thigh|foot|feet|hand|wrist|elbow|neck|head|stomach|abdomen|belly|chest|shin|hamstring|groin|arm|heel|toe";
const SITE_PATTERN = new RegExp(
  String.raw`\b(?:(left|right)\s+)?(${SITE_WORDS}|(?:lower|upper)\s+back|back(?=\s+(?:pain|ache|aches|hurts|feels|is\s+sore|stiff)))\b`,
  "gi",
);

export interface SiteMatch {
  /** e.g. "right knee" */
  bodySite: string;
  /** e.g. "knee" (no side) */
  site: string;
  index: number;
}

export function findBodySites(text: string): SiteMatch[] {
  return [...text.matchAll(SITE_PATTERN)].map((m) => {
    const site = m[2].toLowerCase() === "feet" ? "foot" : m[2].toLowerCase();
    return { bodySite: m[1] ? `${m[1].toLowerCase()} ${site}` : site, site, index: m.index ?? 0 };
  });
}

export function nearestSite(sites: SiteMatch[], index: number): SiteMatch | null {
  let best: SiteMatch | null = null;
  for (const site of sites) {
    if (!best || Math.abs(site.index - index) < Math.abs(best.index - index)) best = site;
  }
  return best;
}

// --- Time -------------------------------------------------------------------

export interface TimeMention {
  description: string;
  /** ISO datetime only when it can be computed unambiguously; otherwise null. */
  observedAt: string | null;
}

const DAY_MS = 24 * 60 * 60 * 1000;
const WEEKDAYS = "monday|tuesday|wednesday|thursday|friday|saturday|sunday";

export function detectTime(sentence: string, occurredAt: string): TimeMention | null {
  const base = Date.parse(occurredAt);
  const shifted = (days: number) => (Number.isNaN(base) ? null : new Date(base - days * DAY_MS).toISOString());
  const same = Number.isNaN(base) ? null : new Date(base).toISOString();

  const yesterday = /\byesterday(?:\s+(?:morning|afternoon|evening|night))?\b/i.exec(sentence);
  if (yesterday) return { description: yesterday[0].toLowerCase(), observedAt: shifted(1) };

  const lastNight = /\blast night\b/i.exec(sentence);
  if (lastNight) return { description: "last night", observedAt: shifted(1) };

  const daysAgo = new RegExp(String.raw`\b(\d+|${NUMBER_WORD_REGEX_SOURCE})\s+days?\s+ago\b`, "i").exec(sentence);
  if (daysAgo) {
    const n = parseNumberToken(daysAgo[1]);
    return { description: daysAgo[0].toLowerCase(), observedAt: n === null ? null : shifted(n) };
  }

  const today = /\b(?:this\s+(?:morning|afternoon|evening)|tonight|today)\b/i.exec(sentence);
  if (today) return { description: today[0].toLowerCase(), observedAt: same };

  const weekday = new RegExp(String.raw`\b(?:since|on|last)\s+(?:${WEEKDAYS})\b`, "i").exec(sentence);
  if (weekday) return { description: weekday[0].toLowerCase(), observedAt: null };

  const overnight = /\bovernight\b/i.exec(sentence);
  if (overnight) return { description: "overnight", observedAt: null };

  return null;
}

// --- Context ----------------------------------------------------------------

const CONTEXT_CLAUSE = /\b(?:after|during|while|when|whenever|before)\s+[^,.;:!?]{2,80}/gi;
const CLAUSE_CUTOFF = /\s+(?:and|but|so|because|though|although)\s+/i;
const CONTEXT_PHRASES = /\bat night\b|\bin the (?:morning|evening|night)\b|\b(?:on|up|down|climbing|using)\s+(?:the\s+)?stairs\b/gi;

export function detectContext(sentence: string): string[] {
  const found: string[] = [];
  for (const m of sentence.matchAll(CONTEXT_CLAUSE)) {
    const cut = m[0].split(CLAUSE_CUTOFF)[0].trim();
    if (cut.split(/\s+/).length >= 2) found.push(cut.slice(0, 80));
  }
  for (const m of sentence.matchAll(CONTEXT_PHRASES)) found.push(m[0].toLowerCase());
  const unique: string[] = [];
  for (const phrase of found) {
    const key = phrase.toLowerCase();
    if (!unique.some((u) => u.toLowerCase().includes(key) || key.includes(u.toLowerCase()))) unique.push(phrase);
  }
  return unique.slice(0, 4);
}

// --- Measures ---------------------------------------------------------------

export interface Measure {
  value: number;
  unit: string;
}

const NUM = String.raw`(\d+(?:\.\d+)?|${NUMBER_WORD_REGEX_SOURCE})`;

const DURATION_PATTERNS = {
  hours: new RegExp(String.raw`${NUM}\s*(hours?|hrs?)\b`, "i"),
  minutes: new RegExp(String.raw`${NUM}\s*(minutes?|mins?)\b`, "i"),
  distance: new RegExp(String.raw`${NUM}\s*(miles?|km|kilomet(?:er|re)s?|blocks?)\b`, "i"),
};

function canonicalUnit(raw: string): string {
  const unit = raw.toLowerCase();
  if (/^h/.test(unit)) return "hours";
  if (/^mi(?:n|nute)/.test(unit)) return "minutes";
  if (/^mile/.test(unit)) return "miles";
  if (/^k/.test(unit)) return "km";
  return "blocks";
}

/** "4 hours", "about 20 minutes", "1.5 miles"; null for ranges ("4-5 hours") or when absent. */
export function findDuration(sentence: string, kind: keyof typeof DURATION_PATTERNS): Measure | null {
  const match = DURATION_PATTERNS[kind].exec(sentence);
  if (!match) return null;
  const before = sentence.slice(Math.max(0, match.index - 6), match.index);
  if (/\d\s*(?:-|–|to)\s*$/.test(before)) return null;
  const value = parseNumberToken(match[1]);
  return value === null ? null : { value, unit: canonicalUnit(match[2]) };
}

export function findStepCount(sentence: string): number | null {
  const match = /(\d[\d,]*)\s+steps\b/i.exec(sentence);
  if (!match) return null;
  const value = Number(match[1].replace(/,/g, ""));
  return value >= 100 ? value : null;
}

export interface RelevanceResult {
  relevant: boolean;
  matchedTerms: string[];
}

/**
 * Deterministic lexicon of recovery-related words and phrases. It only decides whether a
 * memory is worth OFFERING to the patient for import; it makes no clinical judgement.
 */
const LEXICON: readonly string[] = [
  // symptoms
  "pain", "ache", "aching", "sore", "soreness", "swollen", "swelling", "stiff", "stiffness",
  "tender", "numb", "tingling", "cramp", "nausea", "dizzy", "headache", "fever", "bruise",
  "bruising", "discomfort", "twinge", "throbbing", "hurts", "hurt",
  // sleep & energy
  "sleep", "slept", "insomnia", "woke up", "awake", "nap", "napping", "naps", "tired",
  "tiredness", "exhausted", "fatigue", "fatigued", "drained", "restless",
  // mobility & activity
  "walk", "walked", "walking", "walker", "cane", "crutch", "crutches", "stairs", "limp",
  "limping", "balance", "mobility", "stretch", "stretching", "steps", "lifting", "carry",
  "driving", "drive",
  // rehab & recovery
  "physio", "physiotherapy", "physical therapy", "therapist", "exercise", "exercises",
  "rehab", "recovery", "recovering", "healing", "surgery", "operation", "incision",
  "scar", "stitches", "brace", "range of motion",
  // medication & self-care
  "medication", "medicine", "painkiller", "painkillers", "ibuprofen", "paracetamol",
  "tablet", "tablets", "pills", "dose", "ice", "icing", "ice pack", "elevate", "elevating",
  // care-team questions
  "doctor", "surgeon", "nurse", "appointment", "follow-up", "follow up", "ask the",
  "return to work", "back to work", "worried about",
];

// Terms are plain words/phrases (no regex metacharacters); spaces match any whitespace run.
const ESCAPED = LEXICON.map((term) => term.replace(/ /g, "\\s+"));
const MATCHER = new RegExp(`(?<![a-z])(${ESCAPED.join("|")})(?![a-z])`, "gi");

export function classifyHealthRelevance(text: string): RelevanceResult {
  const found = new Set<string>();
  for (const match of text.matchAll(MATCHER)) {
    found.add(match[1].toLowerCase().replace(/\s+/g, " "));
  }
  const matchedTerms = [...found];
  return { relevant: matchedTerms.length > 0, matchedTerms };
}

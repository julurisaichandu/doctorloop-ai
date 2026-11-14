import type { PrivacyRedactionCategory } from "@/lib/domain/types";
import { PLACEHOLDERS } from "./types";

export type RedactionCounts = Partial<Record<PrivacyRedactionCategory, number>>;

export function addCounts(into: RedactionCounts, from: RedactionCounts): RedactionCounts {
  for (const [key, value] of Object.entries(from) as [PrivacyRedactionCategory, number][]) {
    into[key] = (into[key] ?? 0) + value;
  }
  return into;
}

const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+/g;
const URL_SCHEME = /\b(?:https?:\/\/|www\.)[^\s<>"'“”]+/gi;
const URL_BARE =
  /\b[a-z0-9-]+(?:\.[a-z0-9-]+)*\.(?:com|org|net|io|co|uk|edu|gov|app|health|info)(?:\/[^\s<>"'“”]*)?(?![a-z0-9-])/gi;
const SSN = /(?<![\d-])\d{3}-\d{2}-\d{4}(?![\d-])/g;
/** Digits with spaces, dots, dashes or brackets between them (never across line breaks). */
const NUMBER_RUN = /(?<![\w.])\+?\(?\d[\d \t().-]{6,}\d(?![\w])/g;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}/;
const STREET_SUFFIX =
  "Street|St|Avenue|Ave|Road|Rd|Lane|Ln|Drive|Boulevard|Blvd|Way|Court|Ct|Place|Pl|Terrace|Close";
const ADDRESS = new RegExp(
  String.raw`\b\d{1,6}\s+(?:[A-Z][A-Za-z'’-]*\s+){1,4}?(?:${STREET_SUFFIX})\b`,
  "g",
);

/** Splits trailing punctuation off a matched link so the sentence keeps its full stop. */
function swapLink(match: string): string {
  const trailing = /[.,;:!?)\]]+$/.exec(match)?.[0] ?? "";
  return PLACEHOLDERS.link + trailing;
}

/**
 * Deterministic regex redaction that runs after every provider (OpenAI or mock), so a model
 * miss never leaves an obvious e-mail, link, phone number, long ID or street address behind.
 * Plain numbers such as "4.5", "6 out of 10", "90 degrees", "21:15" and ISO dates stay.
 */
export function applySafetyNet(text: string): { text: string; counts: RedactionCounts } {
  const counts: RedactionCounts = {};
  const bump = (category: PrivacyRedactionCategory) => {
    counts[category] = (counts[category] ?? 0) + 1;
  };
  let out = text;

  out = out.replace(EMAIL, () => {
    bump("email");
    return PLACEHOLDERS.email;
  });
  out = out.replace(URL_SCHEME, (m) => {
    bump("link");
    return swapLink(m);
  });
  out = out.replace(URL_BARE, (m) => {
    bump("link");
    return swapLink(m);
  });
  out = out.replace(SSN, () => {
    bump("id_number");
    return PLACEHOLDERS.id_number;
  });
  out = out.replace(NUMBER_RUN, (match) => {
    // A "(" that is not closed inside the number is ordinary punctuation, e.g. "(617-555-0142, ...".
    const open = match.startsWith("(") && !match.includes(")") ? "(" : "";
    const m = match.slice(open.length);
    const result = redactNumber(m);
    return result === null ? match : open + result;
  });
  out = out.replace(ADDRESS, () => {
    bump("address");
    return PLACEHOLDERS.address;
  });
  return { text: out, counts };

  function redactNumber(m: string): string | null {
    if (ISO_DATE.test(m)) return null;
    const digits = m.replace(/\D/g, "").length;
    if (digits < 9) return null;
    // A trailing separator is punctuation, not part of the number.
    const trimmed = m.replace(/[\s.-]+$/, "");
    const tail = m.slice(trimmed.length);
    if (digits > 15) {
      bump("id_number");
      return PLACEHOLDERS.id_number + tail;
    }
    bump("phone");
    return PLACEHOLDERS.phone + tail;
  }
}

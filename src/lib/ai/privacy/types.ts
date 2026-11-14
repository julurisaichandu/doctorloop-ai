import type { PrivacyRedactionCategory } from "@/lib/domain/types";

/** One sentence of the raw text, numbered from 1. Raw text only ever lives in memory. */
export interface NumberedSentence {
  /** 1-based sentence number (what classifiers refer to). */
  n: number;
  text: string;
  /** What separated this sentence from the previous kept one in the original text. */
  sep: "space" | "newline";
  /** True when the sentence starts a line (speaker labels such as "Chloe:" live here). */
  lineStart: boolean;
}

export interface Redaction {
  /** Sentence number the span lives in. */
  sentence: number;
  /** Exact substring of that sentence. */
  text: string;
  category: PrivacyRedactionCategory;
}

/** What a classifier decides. It never writes text: code assembles the stored text. */
export interface Classification {
  keep: number[];
  redactions: Redaction[];
}

export interface PrivacyClassifier {
  provider: "openai" | "mock";
  model: string | null;
  classify(sentences: NumberedSentence[]): Promise<Classification>;
}

export const PLACEHOLDERS: Record<PrivacyRedactionCategory, string> = {
  person_name: "[name]",
  phone: "[phone]",
  email: "[email]",
  address: "[address]",
  id_number: "[id]",
  link: "[link]",
};

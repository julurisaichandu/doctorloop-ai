import { ShieldCheck } from "lucide-react";
import type { PrivacyFilterReceipt, PrivacyRedactionCategory } from "@/lib/domain/types";
import { cn } from "@/lib/utils";

const NOUNS: Record<PrivacyRedactionCategory, [string, string]> = {
  person_name: ["name", "names"],
  phone: ["phone number", "phone numbers"],
  email: ["email address", "email addresses"],
  address: ["address", "addresses"],
  id_number: ["ID number", "ID numbers"],
  link: ["link", "links"],
};

const ORDER: PrivacyRedactionCategory[] = ["person_name", "phone", "email", "address", "id_number", "link"];

/** "1 name hidden", "2 phone numbers hidden"... in a stable order. */
export function redactionSummary(redactions: PrivacyFilterReceipt["redactions"]): string[] {
  return ORDER.flatMap((category) => {
    const count = redactions[category] ?? 0;
    if (count <= 0) return [];
    const [one, many] = NOUNS[category];
    return [`${count} ${count === 1 ? one : many} hidden`];
  });
}

export function engineLabel(receipt: PrivacyFilterReceipt): string {
  return receipt.provider === "openai" ? "AI draft · unverified" : "rule-based";
}

/**
 * Counts-only privacy filter receipt. Shown to patients (with a reminder to review) and to
 * doctors (same counts, no reminder). Never contains any removed text.
 */
export function PrivacyReceipt({
  receipt,
  audience,
  className,
}: {
  receipt: PrivacyFilterReceipt | null | undefined;
  audience: "patient" | "doctor";
  className?: string;
}) {
  if (!receipt) return null;
  const parts = [
    "Privacy filter",
    `kept ${receipt.keptSentences} of ${receipt.totalSentences} ${receipt.totalSentences === 1 ? "sentence" : "sentences"}`,
    ...redactionSummary(receipt.redactions),
    "removed parts were never saved",
  ];
  return (
    <div
      data-testid="privacy-receipt"
      className={cn("mt-3 space-y-1 rounded-xl border border-hairline bg-paper px-3 py-2 text-xs text-muted-foreground", className)}
    >
      <p className="flex flex-wrap items-center gap-x-1.5 gap-y-1">
        <ShieldCheck className="size-3.5 shrink-0 text-ink" strokeWidth={1.5} aria-hidden />
        <span>{parts.join(" · ")}</span>
        <span className="eyebrow rounded-full bg-paper-3 px-2 py-0.5 text-[10px]">{engineLabel(receipt)}</span>
      </p>
      {receipt.fallback ? (
        <p>The AI filter was unavailable, so the rule-based filter was used instead.</p>
      ) : null}
      {audience === "patient" ? (
        <p>Automatic filtering can miss things, so please review the text before you share it.</p>
      ) : null}
    </div>
  );
}

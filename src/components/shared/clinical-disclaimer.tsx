import { Info } from "lucide-react";
import { cn } from "@/lib/utils";

const COPY = {
  patient:
    "AI-generated text can be wrong or incomplete, so please check it against what you said. This prototype does not give medical advice. Not for emergencies: if you need urgent help, call your local emergency number.",
  doctor:
    "Patient-reported data shared with the patient's approval. The AI summary is unverified and does not diagnose, recommend treatment or score risk. Always rely on your own clinical judgment.",
} as const;

export function ClinicalDisclaimer({
  variant = "patient",
  className,
}: {
  variant?: "patient" | "doctor";
  className?: string;
}) {
  return (
    <aside
      className={cn(
        "flex items-start gap-3 rounded-2xl border border-hairline bg-paper-3/60 px-4 py-3 text-xs leading-relaxed text-ink/80",
        className,
      )}
    >
      <Info className="mt-0.5 size-3.5 shrink-0" strokeWidth={1.5} aria-hidden />
      <p>{COPY[variant]}</p>
    </aside>
  );
}

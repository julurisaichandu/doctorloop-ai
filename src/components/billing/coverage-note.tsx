import { ShieldCheck } from "lucide-react";

export function CoverageNote() {
  return (
    <aside className="flex items-start gap-3 rounded-2xl border border-hairline bg-paper-2 px-4 py-3 text-sm leading-relaxed text-ink/80">
      <ShieldCheck className="mt-0.5 size-4 shrink-0" strokeWidth={1.5} aria-hidden />
      <p>
        Your care team covers DoctorLoop&apos;s AI costs — you&apos;re never billed. For updates you haven&apos;t shared,
        they see only a monthly total of AI usage — never the update itself or what you wrote.
      </p>
    </aside>
  );
}

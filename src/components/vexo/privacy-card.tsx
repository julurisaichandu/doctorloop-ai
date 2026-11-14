import { EyeOff, Hand, Lock, ShieldCheck } from "lucide-react";

const POINTS = [
  { icon: ShieldCheck, text: "DoctorLoop only gets read-only access (vexo:read) to your Vexo memories. It never changes anything in Vexo." },
  { icon: Hand, text: "You choose what to import. Nothing is imported until you tick it and press Import." },
  { icon: EyeOff, text: "Memories that do not look health-related are filtered out and are never stored." },
  { icon: ShieldCheck, text: "Inside the memories you import, a privacy filter keeps only the health-related sentences and hides other people's names, phone numbers and addresses before saving. Automatic filtering can miss things, so review before sharing." },
  { icon: Lock, text: "Imported items stay private to you until you approve sharing them with your care team." },
] as const;

export function PrivacyCard() {
  return (
    <section className="rounded-[28px] border border-hairline bg-paper-2 p-6 sm:p-7">
      <p className="eyebrow text-muted-foreground">How this import works</p>
      <h2 className="font-display mt-2 text-3xl leading-[1.1]">
        You are in control of what <em>leaves</em> your memories.
      </h2>
      <ol className="mt-6 grid gap-x-6 gap-y-5 text-sm sm:grid-cols-2">
        {POINTS.map(({ icon: Icon, text }, i) => (
          <li key={text} className="flex gap-3 border-t border-hairline pt-4">
            <span className="font-mono text-[11px] text-muted-foreground" aria-hidden>
              {String(i + 1).padStart(2, "0")}
            </span>
            <span className="min-w-0 text-muted-foreground">
              <Icon className="mb-1.5 size-4 text-ink" strokeWidth={1.5} aria-hidden />
              {text}
            </span>
          </li>
        ))}
      </ol>
    </section>
  );
}

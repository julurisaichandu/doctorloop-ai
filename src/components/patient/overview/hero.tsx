import Link from "next/link";
import { format } from "date-fns";
import { ArrowRight, CalendarClock, Mic, PenLine, Radio } from "lucide-react";
import { Grain } from "@/components/motion/grain";
import { RecoveryRings } from "@/components/viz/recovery-rings";
import type { PatientProfile } from "@/lib/domain/types";
import { Greeting } from "./greeting";
import type { OverviewModel } from "./model";

const FOCUS = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cobalt-soft";

/** Ink hero band: greeting, procedure, next appointment, quick actions and the three recovery rings. */
export function OverviewHero({
  firstName,
  patient,
  model,
}: {
  firstName: string;
  patient: PatientProfile;
  model: OverviewModel;
}) {
  const surgery = new Date(`${patient.procedureDate}T12:00:00`);
  const { appointment: appt } = model;

  return (
    <section
      aria-label="Your recovery"
      className="relative isolate overflow-hidden rounded-[28px] bg-ink text-paper"
    >
      <Grain />
      <div className="relative grid gap-12 p-6 sm:p-10 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)] lg:gap-14 lg:p-12">
        <div className="flex min-w-0 flex-col">
          <p className="eyebrow text-muted-ink">Your recovery · {patient.recoveryStage}</p>
          <div className="mt-5">
            <Greeting firstName={firstName} />
          </div>
          <p className="mt-5 max-w-lg text-[17px] leading-snug text-paper">{patient.procedure}</p>
          <p className="eyebrow mt-2 text-muted-ink">Surgery · {format(surgery, "MMMM d, yyyy")}</p>

          <div className="mt-8 rounded-[20px] border border-ink-3 bg-ink-2 p-5">
            <p className="eyebrow flex items-center gap-2 text-muted-ink">
              <CalendarClock className="size-3.5" strokeWidth={1.5} aria-hidden />
              Next appointment
            </p>
            {appt ? (
              <div className="mt-3 flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2">
                <p className="font-display text-[40px] leading-none tracking-tight text-lime">{appt.countdown}</p>
                <div className="min-w-0 text-sm">
                  <p className="font-mono text-[13px] text-paper tabular-nums">{appt.when}</p>
                  <p className="mt-1 text-muted-ink">
                    {[appt.with, appt.reason].filter(Boolean).join(" · ")}
                  </p>
                </div>
              </div>
            ) : (
              <p className="mt-3 text-sm text-muted-ink">No appointment scheduled.</p>
            )}
          </div>

          <div className="mt-6 flex flex-wrap gap-2.5">
            <Link
              href="/patient/check-in"
              className={`group inline-flex h-11 items-center gap-2 rounded-full bg-lime px-5 text-[15px] font-medium text-ink transition-transform active:scale-[0.97] ${FOCUS}`}
            >
              <Mic className="size-4" strokeWidth={1.75} aria-hidden />
              Voice check-in
              <ArrowRight className="size-4 transition-transform group-hover:translate-x-1" strokeWidth={1.75} aria-hidden />
            </Link>
            <Link
              href="/patient/check-in?tab=write"
              className={`inline-flex h-11 items-center gap-2 rounded-full border border-ink-3 px-4 text-sm text-paper transition-colors hover:bg-ink-2 active:scale-[0.97] ${FOCUS}`}
            >
              <PenLine className="size-4" strokeWidth={1.5} aria-hidden />
              Write an update
            </Link>
            <Link
              href="/patient/import"
              className={`inline-flex h-11 items-center gap-2 rounded-full border border-ink-3 px-4 text-sm text-paper transition-colors hover:bg-ink-2 active:scale-[0.97] ${FOCUS}`}
            >
              <Radio className="size-4 text-lime" strokeWidth={1.5} aria-hidden />
              Import from Vexo
            </Link>
          </div>
        </div>

        <div className="flex min-w-0 flex-col justify-center">
          <p className="eyebrow mb-6 text-muted-ink">Your loop this week · self-reported activity</p>
          <RecoveryRings
            day={model.day}
            checkIn={model.rings.checkIn}
            shared={model.rings.shared}
            seen={model.rings.seen}
            doctorName={model.rings.doctorName}
          />
        </div>
      </div>
    </section>
  );
}

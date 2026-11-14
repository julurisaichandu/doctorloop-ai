import { differenceInCalendarDays, differenceInYears, format, parseISO } from "date-fns";
import type { DoctorPatientDetail } from "@/lib/domain/types";
import { ReviewCount } from "./review-count";
import { PatientActions } from "./patient-actions";

function Detail({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="eyebrow text-muted-foreground">{label}</dt>
      <dd className="mt-2 text-sm leading-relaxed">{children}</dd>
    </div>
  );
}

export function PatientHeader({ detail }: { detail: DoctorPatientDetail }) {
  const { patient, careTeam, unreviewedCount } = detail;
  const now = new Date();
  const surgery = parseISO(patient.procedureDate);
  const day = differenceInCalendarDays(now, surgery) + 1;
  const age = patient.dateOfBirth ? differenceInYears(now, parseISO(patient.dateOfBirth)) : null;

  return (
    <section aria-label="Patient overview" className="border-b border-hairline pb-8">
      <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0">
          <p className="eyebrow mb-3 flex items-center gap-2 text-muted-foreground">
            <span className="h-px w-5 bg-ink" aria-hidden />
            Patient record
          </p>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <h1 className="font-display text-5xl leading-[1.02] sm:text-6xl">{patient.fullName}</h1>
            <ReviewCount count={unreviewedCount} />
          </div>
          <p className="eyebrow mt-3 text-muted-foreground">
            {age !== null ? `${age} yrs · ` : ""}
            {patient.procedure}
          </p>
        </div>
        <PatientActions patientId={patient.id} unreviewedCount={unreviewedCount} />
      </div>

      <dl className="mt-8 grid gap-x-8 gap-y-6 border-t border-hairline pt-6 sm:grid-cols-2 lg:grid-cols-4">
        <Detail label="Surgery">
          <span className="font-mono text-[13px]">{format(surgery, "MMM d, yyyy")}</span>
          <span className="block text-muted-foreground">{day > 0 ? `Day ${day} of recovery` : "Upcoming"}</span>
        </Detail>
        <Detail label="Recovery">
          {patient.recoveryStage}
          {patient.recoveryNotes ? <span className="block text-muted-foreground">{patient.recoveryNotes}</span> : null}
        </Detail>
        <Detail label="Next appointment">
          {patient.nextAppointmentAt ? (
            <>
              <span className="font-mono text-[13px]">
                {format(new Date(patient.nextAppointmentAt), "EEE, MMM d · h:mm a")}
              </span>
              <span className="block text-muted-foreground">
                {[patient.nextAppointmentReason, patient.nextAppointmentWith].filter(Boolean).join(" · ")}
              </span>
            </>
          ) : (
            <span className="text-muted-foreground">None scheduled</span>
          )}
        </Detail>
        <Detail label="Care team">
          {careTeam.length > 0 ? (
            <ul className="space-y-0.5">
              {careTeam.map((member) => (
                <li key={member.id}>
                  {member.fullName}
                  {member.title ? <span className="block text-xs text-muted-foreground">{member.title}</span> : null}
                </li>
              ))}
            </ul>
          ) : (
            <span className="text-muted-foreground">Not listed</span>
          )}
        </Detail>
      </dl>
    </section>
  );
}

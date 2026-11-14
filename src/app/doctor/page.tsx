import { CalendarClock, Inbox, MailOpen, SearchX, UserRoundX, Users } from "lucide-react";
import { Reveal } from "@/components/motion/reveal";
import { PatientFilters, type StatusFilter } from "@/components/doctor/patient-filters";
import { PatientList } from "@/components/doctor/patient-list";
import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { StatCard } from "@/components/shared/stat-card";
import { requireActor } from "@/lib/auth/session";
import { getDoctorOverview, listDoctorPatients } from "@/lib/services/doctor";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function first(value: string | string[] | undefined): string {
  return (Array.isArray(value) ? value[0] : value) ?? "";
}

export default async function DoctorPatientsPage({ searchParams }: { searchParams: SearchParams }) {
  const actor = await requireActor("doctor");
  const params = await searchParams;
  const q = first(params.q).trim().slice(0, 100);
  const status: StatusFilter = first(params.status) === "awaiting_review" ? "awaiting_review" : "all";

  const [overview, patients] = await Promise.all([
    getDoctorOverview(actor),
    listDoctorPatients(actor, { q: q || undefined, status }),
  ]);

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Clinician dashboard"
        title="Your patients"
        description={[actor.fullName, actor.title].filter(Boolean).join(" · ")}
      />

      <Reveal className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Assigned patients" value={overview.patientCount} icon={Users} />
        <StatCard
          label="With new updates"
          value={overview.patientsAwaitingReview}
          hint="Patients with unreviewed updates"
          icon={Inbox}
        />
        <StatCard
          label="Unreviewed updates"
          value={overview.unreviewedUpdates}
          hint="Patient-shared, not yet marked reviewed"
          icon={MailOpen}
        />
        <StatCard
          label="Appointments"
          value={overview.upcomingAppointments7d}
          hint="In the next 7 days"
          icon={CalendarClock}
        />
      </Reveal>

      {overview.patientCount === 0 ? (
        <EmptyState
          icon={UserRoundX}
          title="No patients assigned yet"
          description="Patients appear here once they are assigned to your care."
        />
      ) : (
        <section className="space-y-4" aria-label="Patient list">
          <PatientFilters q={q} status={status} />
          {patients.length > 0 ? (
            <PatientList items={patients} />
          ) : q ? (
            <EmptyState
              icon={SearchX}
              title="No patients match your search"
              description={`Nothing found for “${q}”. Try a different name or procedure.`}
            />
          ) : (
            <EmptyState
              icon={MailOpen}
              title="Nothing awaiting review"
              description="You have marked every patient-shared update as reviewed."
            />
          )}
        </section>
      )}
    </div>
  );
}

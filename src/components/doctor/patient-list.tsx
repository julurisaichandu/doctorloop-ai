import Link from "next/link";
import { format } from "date-fns";
import { ArrowRight, Info } from "lucide-react";
import type { DoctorPatientListItem } from "@/lib/domain/types";
import { RedactedText } from "@/components/shared/redacted-text";
import { isBandReplay, SourceBadge } from "@/components/shared/source-badge";
import { Timestamp } from "@/components/shared/timestamp";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { ClickableRow } from "./clickable-row";
import { ReviewCount } from "./review-count";

const REVIEW_HELP =
  "Counts patient-shared updates you haven't marked reviewed. It is not a clinical risk score.";

const hrefFor = (item: DoctorPatientListItem) => `/doctor/patients/${item.patient.id}`;

const TH = "eyebrow px-4 py-3 text-left font-normal text-muted-foreground";

function LatestUpdate({ item }: { item: DoctorPatientListItem }) {
  const latest = item.latestShared;
  if (!latest) return <span className="text-sm text-muted-foreground">No shared updates yet</span>;
  return (
    <div className="min-w-0 space-y-1.5">
      <div className="flex items-center gap-2">
        <SourceBadge source={latest.entry.source} mode={latest.sourceRef?.mode} replay={isBandReplay(latest.sourceRef)} />
        <Timestamp value={latest.entry.occurredAt} mode="relative" />
      </div>
      <p className="font-display line-clamp-2 text-[19px] leading-snug text-ink italic">
        <span className="sr-only">Patient&apos;s words: </span>“<RedactedText text={latest.entry.body} />”
      </p>
    </div>
  );
}

function NextAppointment({ item }: { item: DoctorPatientListItem }) {
  const at = item.patient.nextAppointmentAt;
  if (!at) return <span className="font-mono text-xs text-muted-foreground">None scheduled</span>;
  return (
    <div className="font-mono text-xs leading-relaxed">
      <p className="text-ink">{format(new Date(at), "EEE, MMM d")}</p>
      <p className="text-muted-foreground">{format(new Date(at), "h:mm a")}</p>
    </div>
  );
}

function DesktopTable({ items }: { items: DoctorPatientListItem[] }) {
  return (
    <div className="hidden overflow-hidden rounded-[20px] border border-hairline bg-paper-2 md:block">
      <table className="w-full caption-bottom border-collapse text-sm">
        <thead>
          <tr className="border-b border-hairline bg-paper-3/50">
            <th scope="col" className={TH}>
              Patient
            </th>
            <th scope="col" className={TH}>
              Latest shared update
            </th>
            <th scope="col" className={TH}>
              <span className="inline-flex items-center gap-1">
                Review status
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      aria-label={REVIEW_HELP}
                      className="rounded-full text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      <Info className="size-3.5" aria-hidden />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent className="max-w-64">{REVIEW_HELP}</TooltipContent>
                </Tooltip>
              </span>
            </th>
            <th scope="col" className={TH}>
              Next appointment
            </th>
            <th scope="col" className={`${TH} text-right`}>
              <span className="sr-only">Actions</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <ClickableRow
              key={item.patient.id}
              href={hrefFor(item)}
              className="border-b border-hairline last:border-b-0 hover:bg-paper-3/50"
            >
              <td className="max-w-64 px-4 py-5 align-top">
                <Link
                  href={hrefFor(item)}
                  className="font-display block truncate text-[26px] leading-tight outline-none hover:underline focus-visible:underline"
                >
                  {item.patient.fullName}
                </Link>
                <p className="eyebrow mt-1.5 line-clamp-1 text-muted-foreground">{item.patient.procedure}</p>
                <p className="mt-0.5 line-clamp-1 font-mono text-[11px] text-muted-foreground">
                  {item.patient.recoveryStage}
                </p>
              </td>
              <td className="max-w-md px-4 py-5 align-top whitespace-normal">
                <LatestUpdate item={item} />
              </td>
              <td className="px-4 py-5 align-top">
                <ReviewCount count={item.unreviewedCount} />
              </td>
              <td className="px-4 py-5 align-top">
                <NextAppointment item={item} />
              </td>
              <td className="px-4 py-5 text-right align-top">
                <Link
                  href={hrefFor(item)}
                  aria-label={`Open ${item.patient.fullName}`}
                  className="group inline-flex h-9 items-center gap-1.5 rounded-full border border-hairline px-4 text-[13px] font-medium outline-none transition-colors hover:border-ink hover:bg-ink hover:text-paper focus-visible:ring-2 focus-visible:ring-ring"
                >
                  Open
                  <ArrowRight className="size-3.5 transition-transform duration-150 group-hover:translate-x-1" aria-hidden />
                </Link>
              </td>
            </ClickableRow>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function MobileCards({ items }: { items: DoctorPatientListItem[] }) {
  return (
    <ul className="space-y-3 md:hidden">
      {items.map((item) => (
        <li key={item.patient.id}>
          <Link
            href={hrefFor(item)}
            className="block space-y-4 rounded-[20px] border border-hairline bg-paper-2 p-5 transition-colors active:bg-paper-3"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="font-display text-[26px] leading-tight">{item.patient.fullName}</p>
                <p className="eyebrow mt-1.5 line-clamp-1 text-muted-foreground">{item.patient.procedure}</p>
                <p className="mt-0.5 line-clamp-1 font-mono text-[11px] text-muted-foreground">
                  {item.patient.recoveryStage}
                </p>
              </div>
              <ReviewCount count={item.unreviewedCount} />
            </div>
            <LatestUpdate item={item} />
            <div className="flex items-center justify-between gap-2 border-t border-hairline pt-3 font-mono text-xs text-muted-foreground">
              <span>
                {item.patient.nextAppointmentAt
                  ? format(new Date(item.patient.nextAppointmentAt), "EEE, MMM d · h:mm a")
                  : "No appointment scheduled"}
              </span>
              <span className="inline-flex items-center gap-1 font-medium text-ink">
                Open <ArrowRight className="size-3.5" aria-hidden />
              </span>
            </div>
          </Link>
        </li>
      ))}
      <li className="flex items-start gap-1.5 px-1 text-xs text-muted-foreground">
        <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden />
        {REVIEW_HELP}
      </li>
    </ul>
  );
}

export function PatientList({ items }: { items: DoctorPatientListItem[] }) {
  return (
    <>
      <DesktopTable items={items} />
      <MobileCards items={items} />
    </>
  );
}

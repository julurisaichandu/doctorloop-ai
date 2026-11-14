import Link from "next/link";
import { Timestamp } from "@/components/shared/timestamp";
import { EmptyState } from "@/components/shared/empty-state";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { TRIGGER_LABELS, engineLabel, formatUtcDate, formatUtcStamp } from "@/lib/billing/views";
import { formatTokens, formatUsd } from "@/lib/billing/money";
import type { PatientUsageRow, UsageLine } from "@/lib/domain/types";

const WRAP = "rounded-[20px] border border-hairline bg-paper-2 p-2";

export function PatientUsageTable({ rows }: { rows: PatientUsageRow[] }) {
  if (rows.length === 0) {
    return <EmptyState title="No usage yet" description="Patient AI usage appears here as soon as it is metered." />;
  }
  return (
    <div className={WRAP}>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Patient</TableHead>
            <TableHead className="text-right">AI runs</TableHead>
            <TableHead className="text-right">Tokens</TableHead>
            <TableHead className="text-right">Billed</TableHead>
            <TableHead className="text-right">Not billed</TableHead>
            <TableHead>Last shared activity</TableHead>
            <TableHead className="text-right">
              <span className="sr-only">Statement</span>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r) => (
            <TableRow key={r.patientId}>
              <TableCell className="font-medium">{r.patientName}</TableCell>
              <TableCell className="text-right tabular-nums">{r.totals.runs}</TableCell>
              <TableCell className="text-right tabular-nums">{formatTokens(r.totals.totalTokens)}</TableCell>
              <TableCell className="text-right tabular-nums">{formatUsd(r.totals.billedMicros)}</TableCell>
              <TableCell className="text-right tabular-nums">{formatUsd(r.totals.notBilledMicros)}</TableCell>
              <TableCell className="tabular-nums">{r.lastItemizedAt ? formatUtcDate(r.lastItemizedAt) : "—"}</TableCell>
              <TableCell className="text-right">
                <Link
                  href={`/doctor/billing/statements/${r.patientId}`}
                  aria-label={`Statement for ${r.patientName}`}
                  className="text-sm font-medium text-cobalt underline-offset-4 hover:underline"
                >
                  Statement
                </Link>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

/**
 * Itemized usage lines. `showPatient` adds a patient column (overview); statements omit it and set
 * `detailed` for the UTC date, AI engine and input/output/total token columns.
 */
export function UsageLinesTable({
  lines,
  showPatient = true,
  detailed = false,
}: {
  lines: UsageLine[];
  showPatient?: boolean;
  detailed?: boolean;
}) {
  const estimatedTag = (l: UsageLine) =>
    l.tokenSource === "estimated" ? (
      <span className="eyebrow ml-1.5 rounded-sm bg-paper-3 px-1 text-[10px]">estimated</span>
    ) : null;
  return (
    <div className={WRAP}>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{detailed ? "Date (UTC)" : "When"}</TableHead>
            {showPatient ? <TableHead>Patient</TableHead> : null}
            <TableHead>Activity</TableHead>
            <TableHead>Triggered by</TableHead>
            {detailed ? <TableHead>AI engine</TableHead> : null}
            {detailed ? <TableHead className="text-right">Input</TableHead> : null}
            {detailed ? <TableHead className="text-right">Output</TableHead> : null}
            <TableHead className="text-right">{detailed ? "Total" : "Tokens"}</TableHead>
            <TableHead className="text-right">Amount</TableHead>
            <TableHead>Status</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {lines.map((l) => (
            <TableRow key={l.id}>
              <TableCell>{detailed ? formatUtcStamp(l.occurredAt) : <Timestamp value={l.occurredAt} />}</TableCell>
              {showPatient ? <TableCell>{l.patientName}</TableCell> : null}
              <TableCell>{l.activityLabel}</TableCell>
              <TableCell>{TRIGGER_LABELS[l.triggeredBy]}</TableCell>
              {detailed ? <TableCell>{engineLabel(l.provider, l.model)}</TableCell> : null}
              {detailed ? <TableCell className="text-right tabular-nums">{formatTokens(l.inputTokens)}</TableCell> : null}
              {detailed ? <TableCell className="text-right tabular-nums">{formatTokens(l.outputTokens)}</TableCell> : null}
              <TableCell className="text-right tabular-nums">
                {formatTokens(l.totalTokens)}
                {estimatedTag(l)}
              </TableCell>
              <TableCell className="text-right tabular-nums">{formatUsd(l.amountMicros, 4)}</TableCell>
              <TableCell>{l.billingLabel}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

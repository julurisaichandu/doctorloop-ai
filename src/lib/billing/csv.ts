import type { PatientUsageStatement, UsageLine } from "@/lib/domain/types";
import { PRIVATE_LINE_LABEL, TRIGGER_LABELS } from "./views";

export const STATEMENT_CSV_HEADER =
  "date_utc,patient,patient_ref,doctor,activity,triggered_by,ai_engine,input_tokens,output_tokens,total_tokens,token_count,rate_usd_per_1k,amount_usd,billing_status";

/** Neutralizes spreadsheet formulas and quotes cells that need it. */
export function escapeCsvCell(value: string): string {
  let cell = value;
  if (/^[=+\-@\t\r]/.test(cell)) cell = `'${cell}`;
  if (/[",\r\n]/.test(cell)) cell = `"${cell.replace(/"/g, '""')}"`;
  return cell;
}

const usd = (micros: number): string => (micros / 1_000_000).toFixed(4);

function lineRow(statement: PatientUsageStatement, line: UsageLine): string[] {
  return [
    line.occurredAt,
    statement.patient.name,
    statement.patient.ref,
    statement.doctor.name,
    line.activityLabel,
    TRIGGER_LABELS[line.triggeredBy],
    line.model ? `${line.provider} ${line.model}` : line.provider,
    String(line.inputTokens),
    String(line.outputTokens),
    String(line.totalTokens),
    line.tokenSource === "estimated" ? "estimated" : "measured",
    usd(statement.rateMicrosPer1k),
    usd(line.amountMicros),
    line.billingLabel,
  ];
}

function privateRow(statement: PatientUsageStatement): string[] {
  const t = statement.privateTotal;
  const tokenCount = t.estimatedRuns === t.runs ? "estimated" : t.estimatedRuns === 0 ? "measured" : "mixed";
  const status =
    t.billedMicros > 0 && t.notBilledMicros > 0 ? "Partly billed" : t.billedMicros > 0 ? "Billed" : "Not billed";
  return [
    `${statement.privatePeriod.start.slice(0, 10)}..${statement.privatePeriod.end.slice(0, 10)}`,
    statement.patient.name,
    statement.patient.ref,
    statement.doctor.name,
    PRIVATE_LINE_LABEL,
    "",
    "",
    String(t.inputTokens),
    String(t.outputTokens),
    String(t.totalTokens),
    tokenCount,
    usd(statement.rateMicrosPer1k),
    usd(t.billedMicros + t.notBilledMicros),
    status,
  ];
}

export function statementToCsv(statement: PatientUsageStatement): string {
  const rows = [...statement.lines.map((l) => lineRow(statement, l)), privateRow(statement)];
  return [STATEMENT_CSV_HEADER, ...rows.map((r) => r.map(escapeCsvCell).join(","))].join("\n");
}

export function statementFilename(statement: PatientUsageStatement): string {
  const slug =
    statement.patient.name
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "patient";
  return `doctorloop-usage-${slug}-${statement.period.start.slice(0, 10)}-${statement.period.end.slice(0, 10)}.csv`;
}

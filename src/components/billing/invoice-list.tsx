import { Receipt } from "lucide-react";
import { EmptyState } from "@/components/shared/empty-state";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatCents } from "@/lib/billing/money";
import type { BillingInvoiceView } from "@/lib/domain/types";

const fmt = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
const linkCls = "text-sm font-medium text-cobalt underline-offset-4 hover:underline";

export function InvoiceList({ invoices }: { invoices: BillingInvoiceView[] }) {
  if (invoices.length === 0) {
    return (
      <EmptyState icon={Receipt} title="No invoices yet" description="Invoices appear here when a billing period closes." />
    );
  }
  return (
    <div className="rounded-[20px] border border-hairline bg-paper-2 p-2">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Invoice</TableHead>
            <TableHead>Period</TableHead>
            <TableHead className="text-right">Amount</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="text-right">
              <span className="sr-only">Links</span>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {invoices.map((inv) => (
            <TableRow key={inv.id}>
              <TableCell className="font-mono text-xs">{inv.number ?? "—"}</TableCell>
              <TableCell>
                {fmt.format(new Date(inv.periodStart))} – {fmt.format(new Date(inv.periodEnd))}
              </TableCell>
              <TableCell className="text-right tabular-nums">{formatCents(inv.amountCents)}</TableCell>
              <TableCell className="capitalize">{inv.status.replace(/_/g, " ")}</TableCell>
              <TableCell className="space-x-3 text-right">
                {inv.hostedUrl ? (
                  <a href={inv.hostedUrl} target="_blank" rel="noreferrer" className={linkCls}>
                    View
                  </a>
                ) : null}
                {inv.pdfUrl ? (
                  <a href={inv.pdfUrl} target="_blank" rel="noreferrer" className={linkCls}>
                    PDF
                  </a>
                ) : null}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

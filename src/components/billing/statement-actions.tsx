"use client";

import { Download, Printer } from "lucide-react";
import { toast } from "sonner";
import { downloadStatementCsvAction } from "@/app/doctor/billing/actions";
import { useServerAction } from "@/components/patient/use-action";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";

export function StatementActions({ patientId, from, to }: { patientId: string; from?: string; to?: string }) {
  const { pending, run } = useServerAction();

  function download({ filename, csv }: { filename: string; csv: string }) {
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    toast.success("Statement CSV downloaded.");
  }

  return (
    <div className="flex flex-wrap gap-2 print:hidden">
      <Button type="button" variant="outline" className="rounded-full border-ink" onClick={() => window.print()}>
        <Printer />
        Print / Save as PDF
      </Button>
      <Button
        type="button"
        variant="outline"
        className="rounded-full border-ink"
        disabled={pending}
        onClick={() => run(() => downloadStatementCsvAction({ patientId, from, to }), { onSuccess: download })}
      >
        {pending ? <Spinner /> : <Download />}
        Download CSV
      </Button>
    </div>
  );
}

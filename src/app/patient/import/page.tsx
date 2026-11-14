import { AlertCircle, CheckCircle2, Info, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { ConnectionCard } from "@/components/vexo/connection-card";
import { ImportWorkspace } from "@/components/vexo/import-workspace";
import { PrivacyCard } from "@/components/vexo/privacy-card";
import { requireActor } from "@/lib/auth/session";
import { getVexoStatus } from "@/lib/services/vexo";
import { cn } from "@/lib/utils";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const ERROR_MESSAGES: Record<string, string> = {
  access_denied: "Vexo access was declined, so nothing was connected.",
  state_mismatch: "The connection attempt expired or could not be verified. Please try again.",
  issuer_mismatch: "The connection response did not come from the expected Vexo server. Please try again.",
  token_exchange_failed: "Vexo did not complete the connection. Please try again.",
  not_configured: "Vexo is not fully configured for this deployment.",
  unknown: "Something went wrong while connecting to Vexo. Please try again.",
};

const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

export default async function ImportPage({ searchParams }: { searchParams: SearchParams }) {
  const actor = await requireActor("patient");
  const [status, params] = await Promise.all([getVexoStatus(actor), searchParams]);
  const errorParam = first(params.error);
  const error = errorParam ? (Object.hasOwn(ERROR_MESSAGES, errorParam) ? ERROR_MESSAGES[errorParam] : ERROR_MESSAGES.unknown) : undefined;

  return (
    <div className="mx-auto w-full max-w-5xl space-y-8">
      <header>
        <p className="eyebrow mb-3 flex items-center gap-2 text-muted-foreground">
          <span className="h-px w-5 bg-ink" aria-hidden />
          Wearable memories
        </p>
        <h1 className="font-display text-4xl leading-[1.05] text-balance sm:text-6xl">
          Import from <em>Vexo</em>
        </h1>
        <p className="mt-4 max-w-2xl text-[15px] leading-relaxed text-muted-foreground sm:text-base">
          Choose health-related memories from your wearable to add to your recovery timeline. You review everything before
          anything is shared.
        </p>
      </header>

      {first(params.connected) ? (
        <Notice icon={CheckCircle2} title="Vexo connected">
          You can now search your memories below.
        </Notice>
      ) : null}
      {first(params.disconnected) ? (
        <Notice icon={Info} title="Vexo disconnected">
          Your stored Vexo access was deleted. Imported entries are unchanged.
        </Notice>
      ) : null}
      {first(params.notice) === "mock" ? (
        <Notice icon={Info} title="Demo mode">
          Vexo is running with mock memories (fictional sample data), so there is nothing to connect.
        </Notice>
      ) : null}
      {status.mode === "file" ? (
        <Notice icon={Info} title="Vexo band replay">
          Memories are replayed from the band file {status.replayFile} (simulated band data). No Vexo account is contacted.
        </Notice>
      ) : null}
      {error ? (
        <Notice icon={AlertCircle} title="Could not connect to Vexo" tone="error">
          {error}
        </Notice>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-[1.35fr_1fr]">
        <PrivacyCard />
        <ConnectionCard status={status} />
      </div>

      <ImportWorkspace connected={status.connected} replayFile={status.replayFile} />
    </div>
  );
}

function Notice({
  icon: Icon,
  title,
  tone = "info",
  children,
}: {
  icon: LucideIcon;
  title: string;
  tone?: "info" | "error";
  children: ReactNode;
}) {
  return (
    <div
      role={tone === "error" ? "alert" : "status"}
      className={cn(
        "flex items-start gap-3 rounded-2xl border bg-paper-2 px-4 py-3.5",
        tone === "error" ? "border-vermilion" : "border-hairline",
      )}
    >
      <Icon className={cn("mt-0.5 size-4 shrink-0", tone === "error" ? "text-vermilion-deep" : "text-ink")} strokeWidth={1.5} aria-hidden />
      <div className="text-sm">
        <p className="eyebrow text-ink">{title}</p>
        <p className="mt-1 text-muted-foreground">{children}</p>
      </div>
    </div>
  );
}

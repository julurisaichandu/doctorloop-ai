"use client";

import { Plug } from "lucide-react";
import type { IntegrationStatus } from "@/lib/config/env";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { IntegrationModeBadge } from "@/components/shared/integration-mode-badge";

export function IntegrationsPopover({ status, showBilling = false }: { status: IntegrationStatus; showBilling?: boolean }) {
  const rows = [
    { name: "Data", label: status.data.label, mode: status.data.mode === "supabase" ? "live" : "local" },
    { name: "AI", label: status.ai.label, mode: status.ai.mode === "openai" ? "live" : "mock" },
    { name: "Voice", label: status.voice.label, mode: status.voice.mode === "elevenlabs" ? "live" : "simulated" },
    { name: "Vexo", label: status.vexo.label, mode: status.vexo.mode === "file" ? "simulated" : status.vexo.mode },
    ...(showBilling
      ? [{ name: "Billing", label: status.billing.label, mode: status.billing.mode === "stripe" ? "test" : "simulated" } as const]
      : []),
  ] as const;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" aria-label="Integration status" className="rounded-full border-hairline bg-paper-2">
          <Plug strokeWidth={1.5} />
          <span className="hidden lg:inline">Integrations</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 rounded-2xl border-hairline bg-paper-2 p-4">
        <p className="eyebrow mb-3 text-muted-foreground">Integrations</p>
        <ul className="divide-y divide-hairline">
          {rows.map((r) => (
            <li key={r.name} className="flex items-center justify-between gap-3 py-2.5 first:pt-0 last:pb-0">
              <span className="text-sm font-medium">{r.name}</span>
              <IntegrationModeBadge label={r.label} mode={r.mode} />
            </li>
          ))}
        </ul>
        <p className="mt-3 text-xs text-muted-foreground">
          Anything not live falls back to a clearly labeled mock so the demo always works.
        </p>
      </PopoverContent>
    </Popover>
  );
}

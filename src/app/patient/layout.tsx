import type { ReactNode } from "react";
import { AppShell, type NavItem } from "@/components/app-shell/app-shell";
import { isDemoSwitcherEnabled, listDemoAccounts } from "@/lib/auth/demo";
import { requireActor } from "@/lib/auth/session";
import { getIntegrationStatus } from "@/lib/config/env";
import { getPatientNavCounts } from "@/lib/services/patient";

export default async function PatientLayout({ children }: { children: ReactNode }) {
  const actor = await requireActor("patient");
  const { pendingReview } = await getPatientNavCounts(actor);

  const nav: NavItem[] = [
    { href: "/patient", label: "Overview", icon: "overview" },
    { href: "/patient/check-in", label: "Check-in", icon: "check-in" },
    { href: "/patient/timeline", label: "Timeline", icon: "timeline" },
    { href: "/patient/review", label: "Review & share", icon: "review", badge: pendingReview },
    { href: "/patient/import", label: "Import from Vexo", icon: "import" },
    { href: "/patient/summary", label: "Summaries", icon: "summary" },
  ];

  return (
    <AppShell
      actor={actor}
      nav={nav}
      integrationStatus={getIntegrationStatus()}
      demoAccounts={isDemoSwitcherEnabled() ? listDemoAccounts() : null}
    >
      {children}
    </AppShell>
  );
}

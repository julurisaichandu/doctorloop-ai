import type { ReactNode } from "react";
import { AppShell, type NavItem } from "@/components/app-shell/app-shell";
import { isDemoSwitcherEnabled, listDemoAccounts } from "@/lib/auth/demo";
import { requireActor } from "@/lib/auth/session";
import { getIntegrationStatus } from "@/lib/config/env";
import { getDoctorNavCounts } from "@/lib/services/doctor";

export default async function DoctorLayout({ children }: { children: ReactNode }) {
  const actor = await requireActor("doctor");
  const { awaitingReviewPatients } = await getDoctorNavCounts(actor);

  const nav: NavItem[] = [
    { href: "/doctor", label: "Patients", icon: "patients" },
    {
      href: "/doctor?status=awaiting_review",
      label: "Awaiting review",
      icon: "awaiting",
      badge: awaitingReviewPatients,
    },
    { href: "/doctor/billing", label: "Billing", icon: "billing" },
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

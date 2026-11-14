"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import {
  CalendarClock,
  ClipboardCheck,
  FileText,
  Download,
  LayoutDashboard,
  LogOut,
  Mic,
  Receipt,
  Users,
  type LucideIcon,
} from "lucide-react";
import { signOutAction } from "@/app/actions/auth";
import type { IntegrationStatus } from "@/lib/config/env";
import type { Actor, DemoAccount } from "@/lib/domain/types";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Separator } from "@/components/ui/separator";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarRail,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { BrandName, LogoMark } from "./brand";
import { DemoRoleSwitcher } from "./demo-role-switcher";
import { IntegrationsPopover } from "./integrations-popover";
import { UserMenu, initialsOf } from "./user-menu";

export type NavIconKey =
  | "overview"
  | "check-in"
  | "timeline"
  | "review"
  | "import"
  | "summary"
  | "patients"
  | "awaiting"
  | "billing";

export interface NavItem {
  href: string;
  label: string;
  icon: NavIconKey;
  badge?: number;
}

const NAV_ICONS: Record<NavIconKey, LucideIcon> = {
  overview: LayoutDashboard,
  "check-in": Mic,
  timeline: CalendarClock,
  review: ClipboardCheck,
  import: Download,
  summary: FileText,
  patients: Users,
  awaiting: ClipboardCheck,
  billing: Receipt,
};

/** Splits "/doctor?status=awaiting_review" into its path and query parameters. */
function parseHref(href: string): { path: string; query: URLSearchParams } {
  const [path, query = ""] = href.split("?");
  return { path, query: new URLSearchParams(query) };
}

function useActiveHref(nav: NavItem[]): string | null {
  const pathname = usePathname();
  const search = useSearchParams();

  const matches = (item: NavItem): boolean => {
    const { path, query } = parseHref(item.href);
    const isRoot = path.split("/").filter(Boolean).length === 1;
    // Root pages own their sub-routes only where there is no dedicated nav item (doctor patient detail).
    const pathMatches = isRoot
      ? pathname === path || pathname.startsWith(`${path}/patients`)
      : pathname === path || pathname.startsWith(`${path}/`);
    if (!pathMatches) return false;
    return [...query.entries()].every(([k, v]) => search.get(k) === v);
  };

  const specific = nav.find((n) => parseHref(n.href).query.size > 0 && matches(n));
  if (specific) return specific.href;
  return nav.find((n) => parseHref(n.href).query.size === 0 && matches(n))?.href ?? null;
}

export function AppShell({
  actor,
  nav,
  integrationStatus,
  demoAccounts,
  children,
}: {
  actor: Actor;
  nav: NavItem[];
  integrationStatus: IntegrationStatus;
  demoAccounts: DemoAccount[] | null;
  children: ReactNode;
}) {
  const activeHref = useActiveHref(nav);
  const activeItem = nav.find((n) => n.href === activeHref);
  const roleLabel = actor.role === "patient" ? "Patient workspace" : "Care team workspace";

  return (
    <SidebarProvider>
      <Sidebar collapsible="icon" className="print:hidden">
        <SidebarHeader className="border-b border-sidebar-border px-3 py-4">
          <div className="flex items-center gap-2.5 px-1">
            <LogoMark />
            <div className="min-w-0 leading-tight group-data-[collapsible=icon]:hidden">
              <BrandName className="block truncate text-lg text-paper" />
              <span className="eyebrow block truncate text-[10px] text-muted-ink">{roleLabel}</span>
            </div>
          </div>
        </SidebarHeader>

        <SidebarContent>
          <SidebarGroup>
            <SidebarGroupLabel className="eyebrow text-[10px] text-muted-ink">{actor.role === "patient" ? "My recovery" : "Patients"}</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {nav.map((item) => {
                  const Icon = NAV_ICONS[item.icon];
                  const active = item.href === activeHref;
                  return (
                    <SidebarMenuItem key={item.href}>
                      <SidebarMenuButton asChild isActive={active} tooltip={item.label} size="lg"
                        className="h-10 rounded-full px-3.5 text-paper/80 transition-colors hover:bg-ink-3 hover:text-paper data-active:bg-lime data-active:text-ink data-active:hover:bg-lime data-active:hover:text-ink"
                      >
                        <Link href={item.href} aria-current={active ? "page" : undefined}>
                          <Icon strokeWidth={1.5} />
                          <span>{item.label}</span>
                        </Link>
                      </SidebarMenuButton>
                      {item.badge ? (
                        <SidebarMenuBadge className="top-2.5 right-3 rounded-full bg-lime font-mono font-semibold text-ink peer-hover/menu-button:text-ink peer-data-active/menu-button:bg-ink peer-data-active/menu-button:text-lime">
                          {item.badge}
                          <span className="sr-only"> waiting</span>
                        </SidebarMenuBadge>
                      ) : null}
                    </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>

        <SidebarFooter className="border-t border-sidebar-border">
          <div className="flex items-center gap-2.5 rounded-lg p-1 group-data-[collapsible=icon]:justify-center">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-lime font-mono text-xs font-semibold text-ink">
              {initialsOf(actor.fullName)}
            </span>
            <div className="min-w-0 flex-1 leading-tight group-data-[collapsible=icon]:hidden">
              <p className="truncate text-sm font-medium text-paper">{actor.fullName}</p>
              <p className="truncate text-xs text-muted-ink">{actor.title ?? actor.email}</p>
            </div>
            <form action={signOutAction} className="group-data-[collapsible=icon]:hidden">
              <button
                type="submit"
                aria-label="Sign out"
                className="flex size-8 items-center justify-center rounded-md text-muted-ink hover:bg-ink-3 hover:text-paper focus-visible:ring-2 focus-visible:ring-sidebar-ring focus-visible:outline-none"
              >
                <LogOut className="size-4" strokeWidth={1.5} />
              </button>
            </form>
          </div>
        </SidebarFooter>
        <SidebarRail />
      </Sidebar>

      <SidebarInset className="min-w-0">
        <header className="sticky top-0 z-20 flex h-14 print:hidden shrink-0 items-center gap-2 border-b border-hairline bg-background px-3 sm:px-6">
          <SidebarTrigger className="-ml-1" />
          <Separator orientation="vertical" className="mr-1 h-5 bg-hairline" />
          <Breadcrumb className="min-w-0">
            <BreadcrumbList className="eyebrow flex-nowrap gap-1.5 text-muted-foreground sm:gap-2">
              <BreadcrumbItem className="hidden sm:inline-flex">{roleLabel}</BreadcrumbItem>
              <BreadcrumbSeparator className="hidden sm:block" />
              <BreadcrumbItem className="min-w-0">
                <BreadcrumbPage className="truncate font-medium text-ink">{activeItem?.label ?? "Workspace"}</BreadcrumbPage>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>

          <div className="ml-auto flex items-center gap-2">
            <span
              className="eyebrow inline-flex items-center gap-1.5 rounded-full bg-ink px-2.5 py-1.5 text-[10px] font-medium text-paper"
              title="All people and records in this prototype are fictional."
            >
              <span className="size-1.5 rounded-full bg-lime" aria-hidden />
              <span aria-hidden>
                <span className="hidden sm:inline">Demo data</span>
                <span className="sm:hidden">Demo</span>
              </span>
              <span className="sr-only">Synthetic demo data</span>
            </span>
            <IntegrationsPopover status={integrationStatus} showBilling={actor.role === "doctor"} />
            {demoAccounts ? (
              <DemoRoleSwitcher
                accounts={demoAccounts}
                currentUserId={actor.userId}
                canReset={integrationStatus.data.mode === "local"}
              />
            ) : null}
            <UserMenu actor={actor} />
          </div>
        </header>

        <main className="flex-1 px-4 py-8 sm:px-6 sm:py-10">
          <div className="mx-auto w-full max-w-7xl space-y-8">{children}</div>
        </main>
      </SidebarInset>
    </SidebarProvider>
  );
}

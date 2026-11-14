"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { ChevronsUpDown, RotateCcw, Users } from "lucide-react";
import { toast } from "sonner";
import { resetDemoDataAction } from "@/app/actions/auth";
import type { DemoAccount } from "@/lib/domain/types";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useDemoSwitch } from "./demo-account-picker";

export function DemoRoleSwitcher({
  accounts,
  currentUserId,
  canReset,
}: {
  accounts: DemoAccount[];
  currentUserId: string;
  /** Local demo database only. */
  canReset: boolean;
}) {
  const router = useRouter();
  const { switchTo } = useDemoSwitch();
  const [, startTransition] = useTransition();

  function reset() {
    startTransition(async () => {
      const result = await resetDemoDataAction();
      if (result.ok) {
        toast.success("Demo data reset.");
        router.refresh();
      } else {
        toast.error(result.error);
      }
    });
  }

  const groups = [
    { title: "Patients", items: accounts.filter((a) => a.role === "patient") },
    { title: "Doctors", items: accounts.filter((a) => a.role === "doctor") },
  ];

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          aria-label="Switch demo account (development only)"
          className="rounded-full border-hairline bg-paper-2"
        >
          <Users strokeWidth={1.5} />
          <span className="hidden md:inline">Switch role</span>
          <span className="eyebrow rounded-full bg-amber px-1.5 py-px text-[10px] font-medium text-ink">Dev only</span>
          <ChevronsUpDown className="opacity-60" strokeWidth={1.5} />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-72 rounded-2xl border-hairline bg-paper-2">
        <p className="px-2 py-1.5 text-xs text-muted-foreground">
          Development-only role switcher: signs in as a fictional demo account; all access rules still apply.
        </p>
        {groups.map(
          (g) =>
            g.items.length > 0 && (
              <DropdownMenuGroup key={g.title}>
                <DropdownMenuSeparator />
                <DropdownMenuLabel className="eyebrow text-muted-foreground">{g.title}</DropdownMenuLabel>
                {g.items.map((a) => (
                  <DropdownMenuCheckboxItem
                    key={a.userId}
                    checked={a.userId === currentUserId}
                    onSelect={() => a.userId !== currentUserId && switchTo(a.userId)}
                  >
                    <span className="flex min-w-0 flex-col">
                      <span className="truncate text-sm">{a.fullName}</span>
                      <span className="truncate text-xs text-muted-foreground">{a.description}</span>
                    </span>
                  </DropdownMenuCheckboxItem>
                ))}
              </DropdownMenuGroup>
            ),
        )}
        {canReset ? (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={reset}>
              <RotateCcw strokeWidth={1.5} />
              Reset demo data
            </DropdownMenuItem>
          </>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, HeartPulse, Stethoscope } from "lucide-react";
import { toast } from "sonner";
import { switchDemoAccountAction } from "@/app/actions/auth";
import type { DemoAccount } from "@/lib/domain/types";
import { initialsOf } from "./user-menu";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";

/** Signs in as a demo account via the server action, then navigates to its home page. */
export function useDemoSwitch() {
  const router = useRouter();
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  function switchTo(userId: string) {
    setPendingId(userId);
    startTransition(async () => {
      const result = await switchDemoAccountAction(userId);
      if (result.ok) {
        router.push(result.data.redirectTo);
        router.refresh();
      } else {
        toast.error(result.error);
        setPendingId(null);
      }
    });
  }

  return { pendingId, switchTo };
}

function AccountGroup({
  title,
  icon: Icon,
  accounts,
  pendingId,
  onPick,
}: {
  title: string;
  icon: typeof HeartPulse;
  accounts: DemoAccount[];
  pendingId: string | null;
  onPick: (userId: string) => void;
}) {
  if (accounts.length === 0) return null;
  return (
    <div>
      <h3 className="eyebrow mb-3 flex items-center gap-1.5 text-muted-foreground">
        <Icon className="size-3.5" strokeWidth={1.5} aria-hidden />
        {title}
      </h3>
      <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {accounts.map((a) => {
          const busy = pendingId === a.userId;
          return (
            <li key={a.userId}>
              <button
                type="button"
                onClick={() => onPick(a.userId)}
                disabled={pendingId !== null}
                className={cn(
                  "group flex w-full items-center gap-3 rounded-2xl border border-hairline bg-paper-2 p-3.5 text-left transition-all duration-150",
                  "hover:-translate-y-0.5 hover:border-ink active:scale-[0.98] disabled:opacity-60 motion-reduce:transform-none",
                )}
              >
                <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-ink font-mono text-xs font-semibold text-lime">
                  {initialsOf(a.fullName)}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-display text-xl leading-tight">{a.fullName}</span>
                  <span className="block truncate text-xs text-muted-foreground">{a.description}</span>
                </span>
                {busy ? (
                  <Spinner className="size-4" />
                ) : (
                  <ArrowRight
                    className="size-4 text-muted-foreground transition-transform duration-150 group-hover:translate-x-1 group-hover:text-ink motion-reduce:transform-none"
                    strokeWidth={1.5}
                  />
                )}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export function DemoAccountPicker({ accounts }: { accounts: DemoAccount[] }) {
  const { pendingId, switchTo } = useDemoSwitch();
  return (
    <div className="space-y-6">
      <AccountGroup
        title="Patients"
        icon={HeartPulse}
        accounts={accounts.filter((a) => a.role === "patient")}
        pendingId={pendingId}
        onPick={switchTo}
      />
      <AccountGroup
        title="Doctors"
        icon={Stethoscope}
        accounts={accounts.filter((a) => a.role === "doctor")}
        pendingId={pendingId}
        onPick={switchTo}
      />
    </div>
  );
}

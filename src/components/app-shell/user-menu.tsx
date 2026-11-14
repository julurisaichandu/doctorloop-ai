"use client";

import { LogOut } from "lucide-react";
import { signOutAction } from "@/app/actions/auth";
import type { Actor } from "@/lib/domain/types";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export function initialsOf(fullName: string): string {
  return fullName
    .replace(/^Dr\.?\s+/, "")
    .split(" ")
    .filter(Boolean)
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

export function UserMenu({ actor }: { actor: Actor }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="rounded-full outline-none" aria-label="Account menu">
        <Avatar>
          <AvatarFallback className="bg-ink font-mono text-xs font-semibold text-lime">
            {initialsOf(actor.fullName)}
          </AvatarFallback>
        </Avatar>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64 rounded-2xl border-hairline bg-paper-2">
        <DropdownMenuLabel className="flex flex-col">
          <span className="font-display text-xl leading-tight font-normal text-foreground">{actor.fullName}</span>
          <span className="truncate font-mono text-xs font-normal text-muted-foreground">{actor.email}</span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <form action={signOutAction}>
          <DropdownMenuItem asChild>
            <button type="submit" className="w-full">
              <LogOut strokeWidth={1.5} />
              Sign out
            </button>
          </DropdownMenuItem>
        </form>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

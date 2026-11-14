"use client";

import type { ComponentProps } from "react";
import { useRouter } from "next/navigation";
import { TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";

/** Table row that navigates on click; the row also contains a real link for keyboard and no-JS use. */
export function ClickableRow({ href, className, ...props }: { href: string } & ComponentProps<typeof TableRow>) {
  const router = useRouter();
  return (
    <TableRow
      className={cn("cursor-pointer", className)}
      onClick={(e) => {
        if ((e.target as HTMLElement).closest("a,button")) return;
        router.push(href);
      }}
      {...props}
    />
  );
}

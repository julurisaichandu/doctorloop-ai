"use client";

import Link from "next/link";
import { TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";

/** Friendly error card shared by every error.tsx boundary. */
export function RouteError({
  reset,
  homeHref,
  homeLabel = "Go home",
  error,
}: {
  reset: () => void;
  homeHref: string;
  homeLabel?: string;
  error: Error & { digest?: string };
}) {
  return (
    <div className="mx-auto flex min-h-[50vh] max-w-md items-center">
      <div className="flex w-full flex-col items-center gap-3 rounded-[28px] border border-hairline bg-paper-2 px-6 py-10 text-center">
        <span className="flex size-12 items-center justify-center rounded-full bg-ink text-amber">
          <TriangleAlert className="size-5" strokeWidth={1.5} aria-hidden />
        </span>
        <h1 className="font-display text-3xl tracking-tight">Something went wrong</h1>
        <p className="text-sm text-muted-foreground">
          We could not load this page. Your data is safe. Please try again.
        </p>
        {error.digest ? <p className="eyebrow text-muted-foreground">Ref: {error.digest}</p> : null}
        <div className="mt-2 flex flex-wrap justify-center gap-2">
          <Button onClick={reset} className="rounded-full">
            Try again
          </Button>
          <Button variant="outline" asChild className="rounded-full">
            <Link href={homeHref}>{homeLabel}</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}

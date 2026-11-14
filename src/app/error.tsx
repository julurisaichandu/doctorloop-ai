"use client";

import { RouteError } from "@/components/shared/route-error";

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="flex flex-1 items-center justify-center p-4">
      <RouteError error={error} reset={reset} homeHref="/" homeLabel="Go to home page" />
    </main>
  );
}

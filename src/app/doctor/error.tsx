"use client";

import { RouteError } from "@/components/shared/route-error";

export default function DoctorError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <RouteError error={error} reset={reset} homeHref="/doctor" homeLabel="Back to patients" />;
}

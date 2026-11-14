import Link from "next/link";
import type { EntrySource, ReviewStatus } from "@/lib/domain/types";
import { cn } from "@/lib/utils";

export type SourceFilter = EntrySource | "all";
export type StatusFilter = ReviewStatus | "all";

export const SOURCE_FILTERS: { value: SourceFilter; label: string }[] = [
  { value: "all", label: "All sources" },
  { value: "voice", label: "Voice" },
  { value: "manual", label: "Notes" },
  { value: "vexo", label: "Vexo" },
];

export const STATUS_FILTERS: { value: StatusFilter; label: string }[] = [
  { value: "all", label: "All statuses" },
  { value: "pending_review", label: "Pending review" },
  { value: "approved", label: "Shared" },
  { value: "rejected", label: "Private" },
];

function href(source: SourceFilter, status: StatusFilter): string {
  const params = new URLSearchParams();
  if (source !== "all") params.set("source", source);
  if (status !== "all") params.set("status", status);
  const query = params.toString();
  return query ? `/patient/timeline?${query}` : "/patient/timeline";
}

function Group<T extends string>({
  label,
  options,
  current,
  hrefFor,
}: {
  label: string;
  options: { value: T; label: string }[];
  current: T;
  hrefFor: (value: T) => string;
}) {
  return (
    <div className="min-w-0">
      <p className="eyebrow mb-2 text-muted-foreground">{label}</p>
      <nav
        aria-label={`Filter by ${label.toLowerCase()}`}
        className="-mx-1 overflow-x-auto px-1 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        <div className="inline-flex gap-0.5 rounded-full bg-paper-3 p-1">
          {options.map((option) => {
            const active = option.value === current;
            return (
              <Link
                key={option.value}
                href={hrefFor(option.value)}
                scroll={false}
                aria-current={active ? "true" : undefined}
                className={cn(
                  "rounded-full px-3.5 py-1.5 text-[13px] font-medium whitespace-nowrap transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
                  active ? "bg-ink text-paper" : "text-muted-foreground hover:bg-paper-2 hover:text-ink",
                )}
              >
                {option.label}
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}

export function TimelineFilters({ source, status }: { source: SourceFilter; status: StatusFilter }) {
  return (
    <div className="flex flex-col gap-4 border-y border-hairline py-4 sm:flex-row sm:flex-wrap sm:items-end sm:gap-x-10">
      <Group label="Source" options={SOURCE_FILTERS} current={source} hrefFor={(s) => href(s, status)} />
      <Group label="Status" options={STATUS_FILTERS} current={status} hrefFor={(s) => href(source, s)} />
    </div>
  );
}

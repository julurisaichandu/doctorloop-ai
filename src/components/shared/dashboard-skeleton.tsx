import { cn } from "@/lib/utils";

function Block({ className }: { className?: string }) {
  return <div className={cn("shimmer rounded-xl", className)} />;
}

/** Loading placeholder: header, stat row and two content cards (paper-3 shimmer). */
export function DashboardSkeleton() {
  return (
    <div className="space-y-8" role="status" aria-label="Loading">
      <div className="space-y-3">
        <Block className="h-3 w-24" />
        <Block className="h-11 w-80 max-w-full" />
        <Block className="h-4 w-96 max-w-full" />
      </div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <Block key={i} className="h-28 rounded-[20px]" />
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-5">
        <Block className="h-72 rounded-[20px] lg:col-span-3" />
        <Block className="h-72 rounded-[20px] lg:col-span-2" />
      </div>
    </div>
  );
}

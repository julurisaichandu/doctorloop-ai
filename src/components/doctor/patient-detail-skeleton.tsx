import { Skeleton } from "@/components/ui/skeleton";

export function PatientDetailSkeleton() {
  return (
    <div className="space-y-8" role="status" aria-label="Loading patient">
      <Skeleton className="h-4 w-32" />
      <div className="space-y-4 border-b border-hairline pb-8">
        <Skeleton className="h-3 w-28" />
        <Skeleton className="h-14 w-80 max-w-full rounded-lg" />
        <Skeleton className="h-3 w-56" />
        <div className="grid gap-6 pt-6 sm:grid-cols-2 lg:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-14 rounded-lg" />
          ))}
        </div>
      </div>
      <div className="grid gap-8 lg:grid-cols-5">
        <div className="space-y-6 lg:col-span-3">
          <Skeleton className="h-72 rounded-[28px]" />
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-56 rounded-[20px]" />
          <Skeleton className="h-56 rounded-[20px]" />
        </div>
        <div className="space-y-6 lg:col-span-2">
          <Skeleton className="h-72 rounded-[20px]" />
          <Skeleton className="h-32 rounded-[20px]" />
          <Skeleton className="h-40 rounded-[20px]" />
        </div>
      </div>
    </div>
  );
}

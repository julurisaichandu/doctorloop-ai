export default function Loading() {
  return (
    <div className="mx-auto w-full max-w-5xl space-y-8" role="status" aria-label="Loading">
      <div className="space-y-3">
        <div className="shimmer h-3 w-28 rounded-full" />
        <div className="shimmer h-12 w-80 max-w-full rounded-2xl" />
        <div className="shimmer h-4 w-[28rem] max-w-full rounded-full" />
      </div>
      <div className="grid gap-4 lg:grid-cols-[1.35fr_1fr]">
        <div className="shimmer h-56 rounded-[28px]" />
        <div className="h-56 rounded-[28px] bg-ink" />
      </div>
      <div className="shimmer h-40 rounded-[28px]" />
    </div>
  );
}

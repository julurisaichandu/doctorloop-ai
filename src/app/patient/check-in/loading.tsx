export default function Loading() {
  return (
    <div className="mx-auto w-full max-w-3xl space-y-8" role="status" aria-label="Loading">
      <div className="space-y-3">
        <div className="shimmer h-3 w-20 rounded-full" />
        <div className="shimmer h-12 w-72 max-w-full rounded-2xl" />
        <div className="shimmer h-4 w-96 max-w-full rounded-full" />
      </div>
      <div className="shimmer h-14 rounded-2xl" />
      <div className="shimmer h-11 w-80 max-w-full rounded-full" />
      <div className="rounded-[28px] bg-ink p-10">
        <div className="mx-auto size-56 rounded-full border border-ink-3" />
      </div>
    </div>
  );
}

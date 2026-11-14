"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";

export type StatusFilter = "all" | "awaiting_review";

const DEBOUNCE_MS = 300;

export function PatientFilters({ q, status }: { q: string; status: StatusFilter }) {
  const router = useRouter();
  const pathname = usePathname();
  const [isPending, startTransition] = useTransition();
  const [value, setValue] = useState(q);
  const [prevQ, setPrevQ] = useState(q);
  const [typing, setTyping] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Follow external URL changes (e.g. the sidebar link) unless the user is mid-edit.
  if (q !== prevQ) {
    setPrevQ(q);
    if (!typing && !isPending) setValue(q);
  }

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  function cancelTimer() {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  }

  function navigate(nextQ: string, nextStatus: StatusFilter) {
    const params = new URLSearchParams();
    const trimmed = nextQ.trim();
    if (trimmed) params.set("q", trimmed);
    if (nextStatus === "awaiting_review") params.set("status", nextStatus);
    const qs = params.toString();
    startTransition(() => {
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    });
  }

  function onSearch(next: string) {
    setValue(next);
    setTyping(true);
    cancelTimer();
    timer.current = setTimeout(() => {
      setTyping(false);
      navigate(next, status);
    }, DEBOUNCE_MS);
  }

  function clearSearch() {
    cancelTimer();
    setValue("");
    setTyping(false);
    navigate("", status);
  }

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between" aria-busy={isPending}>
      <form
        role="search"
        className="relative w-full sm:max-w-sm"
        onSubmit={(e) => {
          e.preventDefault();
          cancelTimer();
          setTyping(false);
          navigate(value, status);
        }}
      >
        <Search
          className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden
        />
        <Input
          type="search"
          value={value}
          onChange={(e) => onSearch(e.target.value)}
          placeholder="Search by name or procedure"
          aria-label="Search patients by name or procedure"
          className="h-10 rounded-full border-hairline bg-paper-2 pr-9 pl-10 [&::-webkit-search-cancel-button]:hidden"
        />
        {value ? (
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            className="absolute top-1/2 right-2 -translate-y-1/2 rounded-full"
            onClick={clearSearch}
            aria-label="Clear search"
          >
            <X />
          </Button>
        ) : null}
      </form>

      <ToggleGroup
        type="single"
        value={status}
        spacing={0}
        onValueChange={(next) => {
          if (next === "all" || next === "awaiting_review") navigate(value, next);
        }}
        aria-label="Filter patients by review status"
        className="gap-0.5 self-start rounded-full bg-paper-3 p-1"
      >
        <ToggleGroupItem
          value="all"
          className="h-8 rounded-full px-3.5 text-[13px] text-muted-foreground hover:bg-paper-2 data-[state=on]:bg-ink data-[state=on]:text-paper"
        >
          All
        </ToggleGroupItem>
        <ToggleGroupItem
          value="awaiting_review"
          className="h-8 rounded-full px-3.5 text-[13px] text-muted-foreground hover:bg-paper-2 data-[state=on]:bg-ink data-[state=on]:text-paper"
        >
          Awaiting review
        </ToggleGroupItem>
      </ToggleGroup>
    </div>
  );
}

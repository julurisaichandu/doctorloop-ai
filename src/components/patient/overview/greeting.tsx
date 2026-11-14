"use client";

import { useSyncExternalStore } from "react";

const subscribe = () => () => {};

function greetingNow(): string {
  const h = new Date().getHours();
  return h < 5 ? "Good evening" : h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
}

/**
 * Time-of-day greeting computed in the browser. The server snapshot is "Welcome back"; the sr-only
 * text keeps the heading's accessible name stable ("Welcome back, Maya") for the e2e suite.
 */
export function Greeting({ firstName }: { firstName: string }) {
  const greeting = useSyncExternalStore(subscribe, greetingNow, () => "Welcome back");
  return (
    <h1 className="font-display text-[44px] leading-[1.02] tracking-[-0.02em] text-balance sm:text-6xl lg:text-[72px]">
      <span className="sr-only">Welcome back, {firstName}</span>
      <span aria-hidden>
        {greeting}, <em className="italic">{firstName}.</em>
      </span>
    </h1>
  );
}

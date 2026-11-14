"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** In-page anchor that scrolls smoothly (instantly with reduced motion). */
export function ScrollLink({ href, className, children }: { href: string; className?: string; children: ReactNode }) {
  return (
    <a
      href={href}
      className={cn(className)}
      onClick={(e) => {
        const el = document.querySelector(href);
        if (!el) return;
        e.preventDefault();
        const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
        el.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
        history.replaceState(null, "", href);
      }}
    >
      {children}
    </a>
  );
}

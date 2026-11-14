"use client";

import { useEffect } from "react";

const HIGHLIGHT = ["ring-2", "ring-primary/60"];

/** Smooth-scrolls to the element named by the URL hash and briefly highlights it. */
export function HashScroller() {
  useEffect(() => {
    let timer: number | undefined;
    let current: HTMLElement | null = null;

    const clear = () => {
      current?.classList.remove(...HIGHLIGHT);
      current = null;
    };

    const apply = () => {
      window.clearTimeout(timer);
      clear();
      const id = decodeURIComponent(window.location.hash.slice(1));
      const target = id ? document.getElementById(id) : null;
      if (!target) return;
      target.scrollIntoView({ behavior: "smooth", block: "center" });
      target.classList.add(...HIGHLIGHT);
      current = target;
      timer = window.setTimeout(clear, 3500);
    };

    apply();
    window.addEventListener("hashchange", apply);
    return () => {
      window.removeEventListener("hashchange", apply);
      window.clearTimeout(timer);
      clear();
    };
  }, []);

  return null;
}

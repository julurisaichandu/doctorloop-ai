"use client";

import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from "react";
import { useReducedMotion } from "motion/react";

const useIsoLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

/**
 * Scroll-reveal gate. Content is VISIBLE on the server and before hydration (no-JS, screenshots,
 * crawlers). After mount, only elements that start below the fold are hidden, then revealed once
 * when they scroll into view. Skipped for reduced motion and automated browsers.
 */
export function useRevealGate<T extends Element>(margin = "-10%"): { ref: RefObject<T | null>; hidden: boolean } {
  const ref = useRef<T | null>(null);
  const [hidden, setHidden] = useState(false);
  const reduce = useReducedMotion();

  useIsoLayoutEffect(() => {
    const el = ref.current;
    if (!el || reduce || navigator.webdriver) return;
    const rect = el.getBoundingClientRect();
    if (rect.top < window.innerHeight * 0.92) return; // already on screen: leave visible
    setHidden(true);
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setHidden(false);
          io.disconnect();
        }
      },
      { rootMargin: `0px 0px ${margin} 0px` },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [reduce, margin]);

  return { ref, hidden };
}
